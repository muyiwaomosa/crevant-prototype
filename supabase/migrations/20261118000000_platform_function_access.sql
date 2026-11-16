-- Platform function access: take back the default EXECUTE grants on
-- public.rls_auto_enable(), a function Supabase installs on some hosted
-- projects (the "automatically enable RLS on new tables" option) together
-- with an event trigger. It is not created by any migration in this repo.
--
-- Why: Postgres lets PUBLIC execute every new function, and Supabase's
-- default privileges in the public schema also grant it to anon,
-- authenticated and service_role. So every login role inherits it,
-- including the restricted waitlist logins, which must be able to run only
-- their own entry points (supabase/tests/003_waitlist.sql). Members and
-- logins never need it: an event trigger runs its function whoever owns or
-- may execute it, so the trigger keeps working (tested in
-- supabase/tests-local/080_platform_function_access.sql).
--
-- What it does: if, and only if, the function exists, revoke EXECUTE from
-- PUBLIC, anon, authenticated and the two waitlist logins, then prove no
-- member or waitlist login can still run it. If that proof fails (for example because another role owns
-- the function and this one cannot change its privileges) the migration
-- stops, and nothing is changed. Where the function does not exist (local
-- and CI databases) it does nothing.
--
-- It creates, drops and alters no objects, touches no data, changes no
-- setting and grants nothing.

do $$
declare
  fn constant regprocedure := to_regprocedure('public.rls_auto_enable()');
  r text;
  still text[] := '{}';
begin
  if fn is null then
    raise notice 'public.rls_auto_enable() is not installed here; nothing to change';
    return;
  end if;

  revoke all on function public.rls_auto_enable() from public, anon, authenticated, waitlist_writer, waitlist_admin;

  foreach r in array array['anon', 'authenticated', 'waitlist_writer', 'waitlist_admin'] loop
    if exists (select 1 from pg_roles where rolname = r) and has_function_privilege(r, fn, 'EXECUTE') then
      still := still || r;
    end if;
  end loop;
  if cardinality(still) > 0 then
    raise exception 'could not remove EXECUTE on public.rls_auto_enable() for % (the function is owned by %); nothing was changed',
      array_to_string(still, ', '), (select pg_get_userbyid(proowner) from pg_proc where oid = fn);
  end if;
end $$;
