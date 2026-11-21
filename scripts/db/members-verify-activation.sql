-- MEMBER PRODUCTION ONLY, READ ONLY (derived from staging-verify-activation.sql): reports whether pilot membership
-- (20261122000000_member_access) is activated on this database, and checks
-- the founder's membership. Run after an activation, or at any time to
-- resolve an ambiguous result (for example a connection dropped at COMMIT).
-- It changes nothing: one read-only transaction, rolled back.
--
--   -v expect=activated  fails unless the database is activated as expected
--                        (the activation workflow runs this after COMMIT).
--   -v expect=any        reports the state; fails only if it is inconsistent.
--
-- Exactly one of these states is reported:
--   STATE: activated      the migration is recorded, its objects exist, the
--                         founder (MEMBERS_FOUNDER_ACCOUNT_ID) is an active
--                         member, the activation grant is in the history, and
--                         the launch gate (20261129000000) is recorded, enabled,
--                         closed, and names the founder.
--   STATE: not activated  no migration record and no membership objects: the
--                         activation did not commit. Nothing was changed; it
--                         is safe to rehearse and activate again.
--   FAIL: ...             anything else (inconsistent): stop and investigate.
-- Only booleans and counts are shown; the founder's id is never printed.

\set ON_ERROR_STOP on
\pset footer off

\getenv founder_raw MEMBERS_FOUNDER_ACCOUNT_ID

begin transaction read only;

select set_config('crevant.verify_expect', :'expect', true) as expect;
\if :{?founder_raw}
  select set_config('crevant.verify_founder', lower(btrim(:'founder_raw')), true) <> '' as founder_given;
\else
  select set_config('crevant.verify_founder', '', true) <> '' as founder_given;
\endif

do $$
declare
  v_expect text := current_setting('crevant.verify_expect');
  v_founder text := current_setting('crevant.verify_founder');
  v_recorded boolean;
  v_objects boolean;
  v_members bigint;
  v_active bigint;
  v_founder_ok boolean;
  v_history_ok boolean;
begin
  if v_expect not in ('activated', 'any') then
    raise exception 'FAIL: expect must be activated or any';
  end if;
  if v_founder !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    raise exception 'FAIL: MEMBERS_FOUNDER_ACCOUNT_ID is missing or not an account id (a UUID)';
  end if;
  if to_regclass('supabase_migrations.schema_migrations') is null then
    raise exception 'FAIL: no Supabase migration history here';
  end if;
  v_recorded := exists (select 1 from supabase_migrations.schema_migrations where version = '20261122000000');
  v_objects := to_regclass('ops.member_access') is not null and to_regclass('ops.member_access_events') is not null
               and to_regprocedure('social.current_access()') is not null;

  if not v_recorded and not v_objects then
    if v_expect = 'activated' then
      raise exception 'FAIL: STATE: not activated (no migration record, no membership objects), although activation was expected';
    end if;
    raise notice 'STATE: not activated. The activation did not commit; nothing was changed. It is safe to rehearse and activate again.';
    return;
  end if;
  if v_recorded <> v_objects then
    raise exception 'FAIL: inconsistent: migration recorded = %, membership objects present = %. Stop and investigate.', v_recorded, v_objects;
  end if;

  -- Activated: check the founder's membership (dynamic SQL, so this file
  -- also runs on a database where the membership tables don't exist).
  execute 'select count(*), count(*) filter (where status = ''active'' and (expires_at is null or expires_at > now())) from ops.member_access'
    into v_members, v_active;
  execute 'select exists (select 1 from ops.member_access where user_id = $1::uuid and cohort = ''founder'' and status = ''active'' and (expires_at is null or expires_at > now()))'
    into v_founder_ok using v_founder;
  execute 'select exists (select 1 from ops.member_access_events where user_id = $1::uuid and action = ''granted'' and reason = ''member production activation'')'
    into v_history_ok using v_founder;
  raise notice 'memberships: %, active: %, founder active: %, activation grant recorded: %', v_members, v_active, v_founder_ok, v_history_ok;
  if not v_founder_ok or not v_history_ok then
    raise exception 'FAIL: activated, but the founder''s membership or its activation grant is missing. Stop and investigate.';
  end if;
  -- On member Production the launch gate is installed in the same transaction
  -- as the activation, so membership without an enabled gate is inconsistent.
  if not exists (select 1 from supabase_migrations.schema_migrations where version = '20261129000000')
     or to_regclass('ops.member_launch_settings') is null
     or not exists (select 1 from pg_trigger where tgrelid = 'ops.member_access'::regclass and tgname = 'member_access_launch_gate' and tgenabled = 'O' and not tgisinternal) then
    raise exception 'FAIL: inconsistent: membership is active but the founder-only launch gate is not recorded and enabled. Stop and investigate.';
  end if;
  execute 'select founder_user_id = $1::uuid and not external_access_approved from ops.member_launch_settings where id' into v_founder_ok using v_founder;
  if v_founder_ok is not true then
    raise exception 'FAIL: the launch gate does not name this founder as launch founder, or external access is open. Stop and investigate.';
  end if;
  raise notice 'STATE: activated. Membership and the launch gate are recorded, the founder is an active member and the launch founder, and external access is closed.';
end $$;

rollback;
