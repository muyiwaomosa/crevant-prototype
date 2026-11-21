-- MEMBER PRODUCTION ONLY: activates pilot membership
-- (20261122000000_member_access) on the member Production project
-- (splitpost-members-production) and authorizes the founder's account IN ONE
-- TRANSACTION, exactly as the staging activation did on staging. Either everything below happens, or nothing does:
--   1. the approved migration file itself (unchanged, read from the repository);
--   2. its record in supabase_migrations.schema_migrations, as the Supabase CLI writes it;
--   3. the founder's membership (cohort founder), recorded in the append-only
--      history with the database login that made it; then the later
--      migrations 20261123000000 to 20261129000000, the launch gate last,
--      each recorded, so membership never exists without the gate;
--   4. the critical security checks: the shared checks (supabase/tests/002 to
--      014), the read-only member authorization audit, the member Production
--      check (supabase/tests-members/001), and activation checks (the founder,
--      and only the founder, is an active member; anyone else is refused).
--
-- Run only by .github/workflows/members-activate-member-access.yml, after the
-- target and the identity marker are verified. Tested on throwaway databases
-- by scripts/db/members-workflow-test.sh. It also refuses, before changing
-- anything, unless this database holds the member Production identity marker,
-- the foundation migrations through 20261121000000 and nothing later, the
-- waitlist logins locked (connection limit 0), and no waitlist, acquisition
-- or invitation rows.
--
--   mode=rehearse  every step above, then ROLLBACK: changes nothing.
--   mode=activate  every step above, then COMMIT. Needs -v confirm='ACTIVATE MEMBER PRODUCTION ACCESS'.
--   Also needs -v photos_approved and -v invitations_approved (config/member-production.json).
--
-- The founder's account id comes ONLY from the environment variable
-- MEMBERS_FOUNDER_ACCOUNT_ID (a GitHub "members-production" environment
-- secret). It is never a command-line argument, never selected, and never
-- part of any message.

\set ON_ERROR_STOP on
\pset footer off

\getenv founder_raw MEMBERS_FOUNDER_ACCOUNT_ID

begin;
set local lock_timeout = '10s';
set local statement_timeout = '300s';

-- An unset -v mode or -v confirm stops here with a syntax error, by design.
-- Only booleans are shown, never the founder's id.
select set_config('crevant.activate_mode', :'mode', true) as mode,
       set_config('crevant.activate_confirm', :'confirm', true) <> '' as confirmation_given;
\if :{?founder_raw}
  select set_config('crevant.activate_founder', lower(btrim(:'founder_raw')), true) <> '' as founder_given;
\else
  select set_config('crevant.activate_founder', '', true) <> '' as founder_given;
\endif

-- 0. Preconditions. Nothing has been changed yet.
do $$
declare
  v_founder text := current_setting('crevant.activate_founder');
begin
  if current_setting('crevant.activate_mode') not in ('rehearse', 'activate') then
    raise exception 'refused: mode must be rehearse or activate';
  end if;
  if current_setting('crevant.activate_mode') = 'activate'
     and current_setting('crevant.activate_confirm') <> 'ACTIVATE MEMBER PRODUCTION ACCESS' then
    raise exception 'refused: activate needs the confirmation phrase: ACTIVATE MEMBER PRODUCTION ACCESS';
  end if;
  if v_founder = '' then
    raise exception 'refused: MEMBERS_FOUNDER_ACCOUNT_ID is not set';
  end if;
  if v_founder !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    raise exception 'refused: MEMBERS_FOUNDER_ACCOUNT_ID is not an account id (a UUID)';
  end if;
  if to_regclass('supabase_migrations.schema_migrations') is null then
    raise exception 'refused: no Supabase migration history here (supabase_migrations.schema_migrations)';
  end if;
  if (select count(*) from information_schema.columns
      where table_schema = 'supabase_migrations' and table_name = 'schema_migrations' and column_name in ('version', 'name')) <> 2 then
    raise exception 'refused: the migration history does not have the expected version and name columns';
  end if;
  -- (nested: the marker table is only referenced once it is known to exist)
  if to_regclass('env_identity.marker') is null then
    raise exception 'refused: this database has no member Production identity marker';
  end if;
  if (select count(*) from env_identity.marker where label = 'splitpost-members-production') <> 1 then
    raise exception 'refused: this database has no member Production identity marker';
  end if;
  if not exists (select 1 from supabase_migrations.schema_migrations where version = '20261121000000')
     or to_regclass('social.posts') is null then
    raise exception 'refused: this database does not have the foundation migrations through 20261121000000';
  end if;
  if (select count(*) from pg_roles where rolname in ('waitlist_writer', 'waitlist_admin') and rolconnlimit = 0) <> 2 then
    raise exception 'refused: the waitlist logins are not locked (connection limit 0); run apply-foundation again';
  end if;
  if exists (select 1 from ops.waitlist) or exists (select 1 from ops.pilot_creators) or exists (select 1 from ops.creator_links)
     or exists (select 1 from ops.invitations) then
    raise exception 'refused: waitlist, creator or invitation rows exist on member Production; investigate before activating';
  end if;
  if exists (select 1 from supabase_migrations.schema_migrations where version >= '20261122000000') then
    raise exception 'refused: 20261122000000 or a later migration is already recorded';
  end if;
  if to_regclass('ops.member_access') is not null or to_regprocedure('social.current_access()') is not null then
    raise exception 'refused: membership objects already exist although the migration is not recorded; investigate before activating';
  end if;
  if not exists (select 1 from auth.users u where u.id = v_founder::uuid) then
    raise exception 'refused: no account has the id in MEMBERS_FOUNDER_ACCOUNT_ID';
  end if;
  if not exists (select 1 from auth.users u where u.id = v_founder::uuid and u.email_confirmed_at is not null) then
    raise exception 'refused: the founder account''s email is not confirmed';
  end if;
end $$;

\echo 'Preconditions passed. Applying 20261122000000_member_access inside the transaction.'

-- 1. The approved migration, exactly as committed (its checksum is verified
--    by the workflow before this runs).
\ir ../../supabase/migrations/20261122000000_member_access.sql

-- 2. Its record, as the Supabase CLI writes it.
insert into supabase_migrations.schema_migrations (version, name) values ('20261122000000', 'member_access');

-- 3. The founder's membership.
select ops.grant_member_access(current_setting('crevant.activate_founder')::uuid, 'founder', 'founder', null, 'member production activation') is null as founder_granted;

-- 3b. In the SAME transaction, the later migrations, the launch gate last
--     (20261123000000 to 20261129000000), each recorded as the Supabase CLI
--     records it. The gate migration finds exactly one active founder-cohort
--     account (the grant above) and names it the launch founder, closed. So
--     membership and the founder-only gate commit together or not at all:
--     there is never a moment with an active member and no gate.
\echo 'Founder granted. Applying 20261123000000 to 20261129000000 (the launch gate last) inside the same transaction.'
\ir ../../supabase/migrations/20261123000000_profile_details.sql
insert into supabase_migrations.schema_migrations (version, name) values ('20261123000000', 'profile_details');
\ir ../../supabase/migrations/20261124000000_moderation.sql
insert into supabase_migrations.schema_migrations (version, name) values ('20261124000000', 'moderation');
\ir ../../supabase/migrations/20261125000000_avatars.sql
insert into supabase_migrations.schema_migrations (version, name) values ('20261125000000', 'avatars');
\ir ../../supabase/migrations/20261126000000_feedback.sql
insert into supabase_migrations.schema_migrations (version, name) values ('20261126000000', 'feedback');
\ir ../../supabase/migrations/20261127000000_post_photos.sql
insert into supabase_migrations.schema_migrations (version, name) values ('20261127000000', 'post_photos');
\ir ../../supabase/migrations/20261128000000_photo_audience.sql
insert into supabase_migrations.schema_migrations (version, name) values ('20261128000000', 'photo_audience');
\ir ../../supabase/migrations/20261129000000_member_launch_gate.sql
insert into supabase_migrations.schema_migrations (version, name) values ('20261129000000', 'member_launch_gate');

\echo 'Running the critical security checks inside the transaction.'

-- 4a. The shared checks (002 to 014 contain no transaction control of their own).
\ir ../../supabase/tests/002_profiles_and_ops.sql
\ir ../../supabase/tests/003_waitlist.sql
\ir ../../supabase/tests/004_acquisition.sql
\ir ../../supabase/tests/005_social_core.sql
\ir ../../supabase/tests/006_platform_functions.sql
\ir ../../supabase/tests/007_member_access.sql
\ir ../../supabase/tests/008_profile_details.sql
\ir ../../supabase/tests/009_moderation.sql
\ir ../../supabase/tests/010_avatars.sql
\ir ../../supabase/tests/011_feedback.sql
\ir ../../supabase/tests/012_post_photos.sql
\ir ../../supabase/tests/013_photo_audience.sql
\ir ../../supabase/tests/014_member_launch_gate.sql

-- 4b. The read-only member authorization audit (catalog reads only).
\ir audit/member-surface-checks.sql

-- 4c. The member Production state (identity marker, locked waitlist logins, no waitlist data, approvals).
\ir ../../supabase/tests-members/001_member_production.sql

-- 4d. Activation checks.
do $$
declare
  v_founder uuid := current_setting('crevant.activate_founder')::uuid;
begin
  if (select count(*) from ops.member_access) <> 1
     or not exists (select 1 from ops.member_access where user_id = v_founder and cohort = 'founder' and status = 'active' and expires_at is null) then
    raise exception 'FAIL: after activation, the founder should be the only member, active, with no expiry';
  end if;
  if (select count(*) from ops.member_access_events) <> 1
     or not exists (select 1 from ops.member_access_events
                    where user_id = v_founder and action = 'granted' and actor = 'founder'
                      and reason = 'member production activation' and db_session_user = session_user) then
    raise exception 'FAIL: the history should hold exactly the founder''s grant, recorded with this database login';
  end if;
  if not ops.member_access_active(v_founder) then
    raise exception 'FAIL: the founder''s membership is not active';
  end if;
  if not exists (select 1 from pg_trigger where tgrelid = 'ops.member_access'::regclass and tgname = 'member_access_launch_gate' and tgenabled = 'O' and not tgisinternal)
     or (select founder_user_id from ops.member_launch_settings where id) is distinct from v_founder
     or (select external_access_approved from ops.member_launch_settings where id)
     or not exists (select 1 from ops.member_launch_events where action = 'founder_set_by_migration') then
    raise exception 'FAIL: the launch gate must be enabled, closed, with the activated founder as the launch founder';
  end if;
  raise notice 'PASS: the founder, and only the founder, is an active member, the grant is recorded, and the launch gate is enabled and closed with the founder as launch founder';
end $$;

-- As the founder (signed in), the member app answers; as anyone else, it refuses.
select set_config('request.jwt.claims', json_build_object('sub', current_setting('crevant.activate_founder'), 'role', 'authenticated')::text, true) is not null as founder_session;
set local role authenticated;
do $$
begin
  if (select status from public.app_access_state()) <> 'active' then
    raise exception 'FAIL: signed in as the founder, app_access_state is not active';
  end if;
  perform * from public.app_me();
  raise notice 'PASS: signed in as the founder, the member app answers (active)';
end $$;
reset role;
select set_config('request.jwt.claims', json_build_object('sub', gen_random_uuid()::text, 'role', 'authenticated')::text, true) is not null as other_session;
set local role authenticated;
do $$
declare
  got text;
begin
  begin
    perform * from public.app_feed();
  exception when others then
    got := sqlerrm;
  end;
  if got is distinct from 'no_pilot_access' then
    raise exception 'FAIL: an account without membership was not refused (got %)', coalesce(got, 'success');
  end if;
  raise notice 'PASS: an account without membership is refused (no_pilot_access)';
end $$;
reset role;
select set_config('request.jwt.claims', '', true) is not null as session_cleared;

-- 5. Commit (activate) or discard everything (rehearse).
select current_setting('crevant.activate_mode') = 'activate' as activate \gset
\if :activate
  commit;
  \echo 'Activated on member Production: 20261122000000 to 20261129000000 are applied and recorded, the founder is an active member, and the founder-only launch gate is enabled and closed. All in one transaction.'
\else
  rollback;
  \echo 'Rehearsal only: every step and every check succeeded inside the transaction, and all of it was rolled back. Nothing changed.'
\endif
