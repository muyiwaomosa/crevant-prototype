-- Staging-safe, read-only: members and the waitlist logins can run only the
-- functions this repo gives them, including functions it did not create.
-- Hosted Supabase projects can hold platform functions that no migration
-- here makes (for example public.rls_auto_enable(), installed with the
-- "automatically enable RLS" option), and Postgres lets everyone run a new
-- function by default. A clean CI database has none of those, so this check
-- matters most against staging and Production.
do $$
declare
  bad text;
begin
  -- anon: nothing at all in the application schemas.
  -- authenticated: only the members' public.app_* functions (checked in
  -- detail by 005_social_core.sql).
  select string_agg(format('%s (%s)', p.oid::regprocedure, r), ', ' order by 1) into bad
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  cross join unnest(array['anon', 'authenticated']) r
  where n.nspname in ('public', 'ops', 'waitlist_api', 'social', 'intent', 'sim', 'analytics')
    and not exists (select 1 from pg_depend d where d.classid = 'pg_proc'::regclass and d.objid = p.oid and d.deptype = 'e')
    and has_schema_privilege(r, n.oid, 'USAGE')
    and has_function_privilege(r, p.oid, 'EXECUTE')
    and not (r = 'authenticated' and n.nspname = 'public' and p.proname like 'app\_%');
  if bad is not null then
    raise exception 'FAIL: members can run functions they should not: %', bad;
  end if;

  -- The Supabase platform function, wherever it is installed: no member or
  -- waitlist login may run it (the event trigger does not need them to).
  if to_regprocedure('public.rls_auto_enable()') is not null then
    select string_agg(r, ', ') into bad
    from unnest(array['anon', 'authenticated', 'waitlist_writer', 'waitlist_admin']) r
    where exists (select 1 from pg_roles where rolname = r)
      and has_function_privilege(r, 'public.rls_auto_enable()', 'EXECUTE');
    if bad is not null then
      raise exception 'FAIL: % can run public.rls_auto_enable()', bad;
    end if;
  end if;
  raise notice 'PASS: members and waitlist logins can run only their own functions, including platform functions';
end $$;
