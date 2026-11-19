-- Staging only: activates pilot membership (20261122000000_member_access)
-- and authorizes the founder's account IN ONE TRANSACTION. Either everything
-- below happens, or nothing does:
--   1. the approved migration file itself (unchanged, read from the repository);
--   2. its record in supabase_migrations.schema_migrations, exactly as the
--      Supabase CLI records an applied migration (version and name);
--   3. the founder's membership (cohort founder), recorded in the
--      append-only history with the database login that made it;
--   4. the critical security checks: the staging-safe checks
--      (supabase/tests/002 to 007), the read-only member authorization audit,
--      and activation checks (the founder, and only the founder, is an
--      active member; an account without membership is refused).
-- Any failure stops psql (ON_ERROR_STOP) before COMMIT, and the database
-- discards the whole transaction.
--
-- Run only by .github/workflows/staging-activate-member-access.yml (tested
-- locally by scripts/db/activation-test.sh). Never against Production: it
-- needs the staging social core (20261117000000 to 20261121000000), which
-- Production doesn't have, and the workflow verifies the staging target first.
--
--   mode=rehearse  every step above, then ROLLBACK: changes nothing.
--   mode=activate  every step above, then COMMIT. Needs -v confirm='ACTIVATE STAGING MEMBER ACCESS'.
--
-- The founder's account id comes ONLY from the environment variable
-- STAGING_FOUNDER_ACCOUNT_ID (a GitHub "staging" environment secret). It is
-- never a command-line argument, never selected, and never part of any
-- message: errors say what is wrong, not the value.

\set ON_ERROR_STOP on
\pset footer off

\getenv founder_raw STAGING_FOUNDER_ACCOUNT_ID

begin;
set local lock_timeout = '10s';
set local statement_timeout = '120s';

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
     and current_setting('crevant.activate_confirm') <> 'ACTIVATE STAGING MEMBER ACCESS' then
    raise exception 'refused: activate needs the confirmation phrase: ACTIVATE STAGING MEMBER ACCESS';
  end if;
  if v_founder = '' then
    raise exception 'refused: STAGING_FOUNDER_ACCOUNT_ID is not set';
  end if;
  if v_founder !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    raise exception 'refused: STAGING_FOUNDER_ACCOUNT_ID is not an account id (a UUID)';
  end if;
  if to_regclass('supabase_migrations.schema_migrations') is null then
    raise exception 'refused: no Supabase migration history here (supabase_migrations.schema_migrations)';
  end if;
  if (select count(*) from information_schema.columns
      where table_schema = 'supabase_migrations' and table_name = 'schema_migrations' and column_name in ('version', 'name')) <> 2 then
    raise exception 'refused: the migration history does not have the expected version and name columns';
  end if;
  if not exists (select 1 from supabase_migrations.schema_migrations where version = '20261121000000')
     or to_regclass('social.posts') is null then
    raise exception 'refused: this database does not have the staging social core through 20261121000000 (is this staging?)';
  end if;
  if exists (select 1 from supabase_migrations.schema_migrations where version >= '20261122000000') then
    raise exception 'refused: 20261122000000 or a later migration is already recorded';
  end if;
  if to_regclass('ops.member_access') is not null or to_regprocedure('social.current_access()') is not null then
    raise exception 'refused: membership objects already exist although the migration is not recorded; investigate before activating';
  end if;
  if not exists (select 1 from auth.users u where u.id = v_founder::uuid) then
    raise exception 'refused: no account has the id in STAGING_FOUNDER_ACCOUNT_ID';
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
select ops.grant_member_access(current_setting('crevant.activate_founder')::uuid, 'founder', 'founder', null, 'staging activation') is null as founder_granted;

\echo 'Running the critical security checks inside the transaction.'

-- 4a. The staging-safe checks (002 to 007 contain no transaction control of their own).
\ir ../../supabase/tests/002_profiles_and_ops.sql
\ir ../../supabase/tests/003_waitlist.sql
\ir ../../supabase/tests/004_acquisition.sql
\ir ../../supabase/tests/005_social_core.sql
\ir ../../supabase/tests/006_platform_functions.sql
\ir ../../supabase/tests/007_member_access.sql

-- 4b. The read-only member authorization audit (catalog reads only).
\ir audit/member-surface-checks.sql

-- 4c. Activation checks.
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
                      and reason = 'staging activation' and db_session_user = session_user) then
    raise exception 'FAIL: the history should hold exactly the founder''s grant, recorded with this database login';
  end if;
  if not ops.member_access_active(v_founder) then
    raise exception 'FAIL: the founder''s membership is not active';
  end if;
  raise notice 'PASS: the founder, and only the founder, is an active member, and the grant is recorded';
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
  \echo 'Activated: 20261122000000_member_access is applied and recorded, and the founder is an active member. All in one transaction.'
\else
  rollback;
  \echo 'Rehearsal only: every step and every check succeeded inside the transaction, and all of it was rolled back. Nothing changed.'
\endif
