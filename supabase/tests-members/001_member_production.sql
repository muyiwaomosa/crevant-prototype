-- MEMBER PRODUCTION ONLY, read-only: the state that makes the member
-- Production project what it is, beyond the shared checks in supabase/tests.
-- Counts and catalog reads only; no member data or account ids are read out.
-- Run by the member workflows in a read-only session, after the identity
-- marker is verified, with the approvals from config/member-production.json:
--
--   psql "<url>" -X -q -v ON_ERROR_STOP=1 -v photos_approved=false -v invitations_approved=false -f supabase/tests-members/001_member_production.sql
--
-- Every part applies only once the migration that creates its objects is
-- recorded; before that it says so. It fails if:
--   1. the identity marker is not exactly one row labelled
--      splitpost-members-production, can be written by an API role, or lost
--      its immutability triggers;
--   2. waitlist_writer or waitlist_admin can open a connection (connection
--      limit not 0), or waitlist submissions are switched on;
--   3. any waitlist or creator acquisition table holds a row (this project
--      never collects either), or ops.invitations holds a row while
--      invitations are not approved;
--   4. the launch gate trigger is missing or disabled once the gate is
--      applied, external access is open while invitations are not approved,
--      or anyone but the launch founder holds active membership then (which
--      catches membership given around the gate);
--   5. photo posting is on while photos are not approved;
--   6. pg_net is installed or its schema exists (never on this project).

\set ON_ERROR_STOP on
select set_config('crevant.photos_approved', :'photos_approved', false) as photos_approved,
       set_config('crevant.invitations_approved', :'invitations_approved', false) as invitations_approved;

do $$
declare
  photos_ok boolean;
  invites_ok boolean;
  recorded text[];
  t text;
  n bigint;
  r text;
begin
  if current_setting('crevant.photos_approved') not in ('true', 'false')
     or current_setting('crevant.invitations_approved') not in ('true', 'false') then
    raise exception 'FAIL: photos_approved and invitations_approved must be true or false (from config/member-production.json)';
  end if;
  photos_ok := current_setting('crevant.photos_approved')::boolean;
  invites_ok := current_setting('crevant.invitations_approved')::boolean;
  recorded := array[]::text[];
  if to_regclass('supabase_migrations.schema_migrations') is not null then
    -- (nested: the history table is only referenced once it is known to exist)
    recorded := (select coalesce(array_agg(version::text), array[]::text[]) from supabase_migrations.schema_migrations);
  end if;

  -- 1. The identity marker.
  if to_regclass('env_identity.marker') is null then
    raise exception 'FAIL: no identity marker (env_identity.marker): this is not the member Production project';
  end if;
  if (select count(*) from env_identity.marker) <> 1
     or (select label from env_identity.marker) is distinct from 'splitpost-members-production' then
    raise exception 'FAIL: the identity marker must be exactly one row labelled splitpost-members-production';
  end if;
  if (select count(*) from pg_trigger where tgrelid = 'env_identity.marker'::regclass
      and tgname in ('marker_no_change', 'marker_no_truncate') and tgenabled = 'O' and not tgisinternal) <> 2 then
    raise exception 'FAIL: the identity marker lost its immutability triggers, or they are disabled';
  end if;
  foreach r in array array['anon', 'authenticated', 'service_role'] loop
    if exists (select 1 from pg_roles where rolname = r)
       and (has_schema_privilege(r, 'env_identity', 'USAGE')
            or has_table_privilege(r, 'env_identity.marker', 'SELECT, INSERT, UPDATE, DELETE, TRUNCATE')) then
      raise exception 'FAIL: % can reach the identity marker', r;
    end if;
  end loop;
  raise notice 'PASS: one immutable identity marker (splitpost-members-production), reachable by no API role';

  -- 2. The waitlist logins can't connect, and the waitlist is closed.
  if '20261110000000' = any(recorded) then
    foreach r in array array['waitlist_writer', 'waitlist_admin'] loop
      if not exists (select 1 from pg_roles where rolname = r) then
        raise exception 'FAIL: role % is missing (the waitlist migration expects it)', r;
      end if;
      if (select rolconnlimit from pg_roles where rolname = r) <> 0 then
        raise exception 'FAIL: % may open connections (connection limit %, expected 0): run scripts/db/members-lock-waitlist-roles.sql',
          r, (select rolconnlimit from pg_roles where rolname = r);
      end if;
    end loop;
    if exists (select 1 from ops.settings where key = 'waitlist_submissions' and enabled) then
      raise exception 'FAIL: waitlist submissions are switched on in member Production';
    end if;
    raise notice 'PASS: waitlist_writer and waitlist_admin have connection limit 0, and waitlist submissions are off';
  else
    raise notice 'NOTE: the waitlist migration is not applied yet; the waitlist login checks start once it is';
  end if;

  -- 3. No waitlist or acquisition data; no invitations unless approved.
  foreach t in array array['ops.waitlist', 'ops.waitlist_consents', 'ops.waitlist_selections', 'ops.waitlist_rate_limits',
                           'ops.pilot_creators', 'ops.creator_links', 'ops.acquisition_events',
                           'ops.creator_link_redemptions', 'ops.invite_preview_limits'] loop
    if to_regclass(t) is not null then
      execute format('select count(*) from %s', t) into n;
      if n > 0 then
        raise exception 'FAIL: % holds % row(s); member Production never collects waitlist or creator acquisition data', t, n;
      end if;
    end if;
  end loop;
  if to_regclass('ops.invitations') is not null and not invites_ok then
    if exists (select 1 from ops.invitations) then
      raise exception 'FAIL: ops.invitations holds rows although invitations are not approved (config/member-production.json)';
    end if;
  end if;
  raise notice 'PASS: no waitlist or creator acquisition rows; invitations %',
    case when invites_ok then 'approved' else 'not approved, and none exist' end;

  -- 4. The launch gate.
  if '20261129000000' = any(recorded) then
    if not exists (select 1 from pg_trigger where tgrelid = 'ops.member_access'::regclass and tgname = 'member_access_launch_gate'
                   and tgenabled = 'O' and not tgisinternal) then
      raise exception 'FAIL: the member launch gate trigger is missing or disabled';
    end if;
    if not invites_ok and (select external_access_approved from ops.member_launch_settings where id) then
      raise exception 'FAIL: external member access is open although invitations are not approved (config/member-production.json)';
    end if;
    -- Detects membership given around the gate (the owner disabling the
    -- trigger, or session_replication_role = replica): while invitations are
    -- not approved, nobody but the launch founder may hold active membership.
    if not invites_ok then
      n := (select count(*) from ops.member_access a
            where a.status = 'active' and (a.expires_at is null or a.expires_at > now())
              and a.user_id is distinct from (select founder_user_id from ops.member_launch_settings where id));
      if n > 0 then
        raise exception 'FAIL: % account(s) other than the launch founder hold active membership although invitations are not approved', n;
      end if;
    end if;
    raise notice 'PASS: the launch gate is enabled; external member access is %',
      case when (select external_access_approved from ops.member_launch_settings where id) then 'APPROVED' else 'closed (founder only)' end;
  elsif '20261122000000' = any(recorded) then
    raise notice 'NOTE: membership is active but the launch gate (20261129000000) is not applied yet; apply it next';
  else
    raise notice 'NOTE: the launch gate is not applied yet';
  end if;

  -- 5. Photos.
  if to_regclass('ops.media_settings') is not null then
    if not photos_ok and (select photos_enabled from ops.media_settings where id) then
      raise exception 'FAIL: photo posting is on although photos are not approved (config/member-production.json)';
    end if;
    raise notice 'PASS: photo posting is %', case when (select photos_enabled from ops.media_settings where id) then 'on (approved)' else 'off' end;
  end if;

  -- 6. No pg_net.
  if exists (select 1 from pg_extension where extname = 'pg_net') or to_regnamespace('net') is not null then
    raise exception 'FAIL: pg_net (or its net schema) is present; it is never installed on member Production';
  end if;
  raise notice 'PASS: pg_net is not installed';
end $$;
