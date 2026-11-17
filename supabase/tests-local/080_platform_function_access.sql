-- Local only (throwaway databases). The platform function access migration
-- (20261118000000) against a stand-in for Supabase's public.rls_auto_enable()
-- and its event trigger, which no clean database has:
--   1. With the function present and the default grants, it removes EXECUTE
--      for members and the waitlist logins, and the event trigger still
--      enables RLS on a new table.
--   2. Run again, it changes nothing and still passes (idempotent).
--   3. Run by a role that does not own the function and cannot change its
--      privileges, it stops with an error and changes nothing.
--   4. The exact shape found on staging: owned by postgres, security definer,
--      NULL explicit privileges (so every role reaches it through PUBLIC).
--      The migration removes PUBLIC's right and nobody else gains one.
-- Everything happens in one transaction that is rolled back.
\set ON_ERROR_STOP on
begin;

create function public.rls_auto_enable() returns event_trigger
language plpgsql security definer set search_path = pg_catalog as $$
declare cmd record;
begin
  for cmd in select * from pg_event_trigger_ddl_commands()
             where command_tag in ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
               and object_type in ('table', 'partitioned table') loop
    if cmd.schema_name = 'public' then
      execute format('alter table if exists %s enable row level security', cmd.object_identity);
    end if;
  end loop;
end $$;
create event trigger ensure_rls_test on ddl_command_end
  when tag in ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO') execute function public.rls_auto_enable();

do $$
begin
  if not (has_function_privilege('anon', 'public.rls_auto_enable()', 'EXECUTE')
          and has_function_privilege('waitlist_writer', 'public.rls_auto_enable()', 'EXECUTE')) then
    raise exception 'FAIL: the stand-in should start with the default grants, as on staging';
  end if;
end $$;

-- 3 first: a role that neither owns the function nor holds a grant option.
create role crevant_test_migrator nologin;
grant usage on schema public to crevant_test_migrator;
savepoint before_non_owner;
set role crevant_test_migrator;
\echo 'An error is expected next (the migration refusing to run as a non-owner):'
\set ON_ERROR_STOP off
\i supabase/migrations/20261118000000_platform_function_access.sql
\set ON_ERROR_STOP on
\if :ERROR
  rollback to savepoint before_non_owner;
  do $$
  begin
    if not has_function_privilege('anon', 'public.rls_auto_enable()', 'EXECUTE') then
      raise exception 'FAIL: the refused run changed privileges';
    end if;
    raise notice 'PASS: run by a role that cannot change the function''s privileges, the migration stops and changes nothing';
  end $$;
\else
  do $$ begin raise exception 'FAIL: the migration did not stop when it could not remove the grants'; end $$;
\endif
reset role;

-- 1. As the owner (on staging, the postgres login that runs migrations).
\i supabase/migrations/20261118000000_platform_function_access.sql
do $$
declare
  r text;
begin
  foreach r in array array['anon', 'authenticated', 'waitlist_writer', 'waitlist_admin'] loop
    if has_function_privilege(r, 'public.rls_auto_enable()', 'EXECUTE') then
      raise exception 'FAIL: % can still run public.rls_auto_enable()', r;
    end if;
  end loop;
  if exists (select 1 from pg_proc p, aclexplode(p.proacl) a where p.oid = 'public.rls_auto_enable()'::regprocedure and a.grantee = 0) then
    raise exception 'FAIL: PUBLIC still holds EXECUTE';
  end if;
  raise notice 'PASS: members and waitlist logins can no longer run public.rls_auto_enable()';
end $$;

create table public.crevant_rls_probe (id integer);
do $$
begin
  if not (select relrowsecurity from pg_class where oid = 'public.crevant_rls_probe'::regclass) then
    raise exception 'FAIL: the event trigger stopped enabling RLS after the revoke';
  end if;
  raise notice 'PASS: the event trigger still enables RLS on new tables';
end $$;

-- 2. Idempotent.
\i supabase/migrations/20261118000000_platform_function_access.sql
\i supabase/tests/006_platform_functions.sql
\i supabase/tests/003_waitlist.sql

-- 4. As found on staging: NULL privileges. Created by a role with no default
-- privileges in public, then handed to postgres, so its ACL stays NULL.
drop event trigger ensure_rls_test;
drop function public.rls_auto_enable();
drop table public.crevant_rls_probe;
create role crevant_test_creator nologin;
grant usage, create on schema public to crevant_test_creator;
set role crevant_test_creator;
create function public.rls_auto_enable() returns event_trigger
language plpgsql security definer set search_path = pg_catalog as $$
declare cmd record;
begin
  for cmd in select * from pg_event_trigger_ddl_commands()
             where command_tag in ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
               and object_type in ('table', 'partitioned table') loop
    if cmd.schema_name = 'public' then
      execute format('alter table if exists %s enable row level security', cmd.object_identity);
    end if;
  end loop;
end $$;
reset role;
alter function public.rls_auto_enable() owner to postgres;
create event trigger ensure_rls_test on ddl_command_end
  when tag in ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO') execute function public.rls_auto_enable();
do $$
declare
  r text;
begin
  if (select proacl from pg_proc where oid = 'public.rls_auto_enable()'::regprocedure) is not null
     or pg_get_userbyid((select proowner from pg_proc where oid = 'public.rls_auto_enable()'::regprocedure)) <> 'postgres' then
    raise exception 'FAIL: the stand-in does not match staging (owner postgres, NULL privileges)';
  end if;
  foreach r in array array['anon', 'authenticated', 'waitlist_writer', 'waitlist_admin'] loop
    if not has_function_privilege(r, 'public.rls_auto_enable()', 'EXECUTE') then
      raise exception 'FAIL: with NULL privileges % should be able to run it, as on staging', r;
    end if;
  end loop;
end $$;
\i supabase/migrations/20261118000000_platform_function_access.sql
do $$
declare
  r text;
begin
  foreach r in array array['anon', 'authenticated', 'waitlist_writer', 'waitlist_admin'] loop
    if has_function_privilege(r, 'public.rls_auto_enable()', 'EXECUTE') then
      raise exception 'FAIL: (NULL privileges) % can still run public.rls_auto_enable()', r;
    end if;
  end loop;
  if exists (select 1 from pg_proc p, aclexplode(p.proacl) a
             where p.oid = 'public.rls_auto_enable()'::regprocedure and a.grantee <> p.proowner) then
    raise exception 'FAIL: (NULL privileges) the migration left a grant to a role other than the owner';
  end if;
  raise notice 'PASS: as found on staging (owner postgres, NULL privileges), only the owner can run it afterwards';
end $$;
create table public.crevant_rls_probe (id integer);
do $$
begin
  if not (select relrowsecurity from pg_class where oid = 'public.crevant_rls_probe'::regclass) then
    raise exception 'FAIL: (NULL privileges) the event trigger stopped enabling RLS after the revoke';
  end if;
  raise notice 'PASS: (NULL privileges) the event trigger still enables RLS on new tables';
end $$;
\i supabase/tests/006_platform_functions.sql
\i supabase/tests/003_waitlist.sql

rollback;
