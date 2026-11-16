-- Read-only diagnosis of function access on a hosted Supabase project
-- (staging). Run it in the Supabase SQL editor, or with psql. It only reads
-- catalogs: it creates, changes and grants nothing. It prints names, owners
-- and privileges only, never data.

-- 1. Recorded migrations (expect 20261106, 20261107, 20261110, 20261111,
--    20261116, 20261117).
select version, name from supabase_migrations.schema_migrations order by version;

-- 2. The platform function: where it lives, who owns it, how it runs, who
--    may execute it, and which event trigger uses it.
select p.oid::regprocedure as function, pg_get_function_result(p.oid) as returns,
       pg_get_userbyid(p.proowner) as owner, p.prosecdef as security_definer,
       p.proconfig as settings, p.proacl as privileges,
       (select string_agg(format('%s on %s (%s)', e.evtname, e.evtevent, e.evtenabled), ', ')
          from pg_event_trigger e where e.evtfoid = p.oid) as event_triggers
from pg_proc p where p.proname = 'rls_auto_enable';

-- 3. Every function in the application schemas, not part of an extension,
--    that a member or waitlist login may run, other than what this repo
--    gives them (members: public.app_*; waitlist logins: their waitlist_api
--    entry points). Supabase's own auth and storage schemas are left out:
--    members need auth.uid() and the other auth helpers for row level
--    security. Expect no rows once the fix is applied.
select r as role, p.oid::regprocedure as function, pg_get_userbyid(p.proowner) as owner, p.proacl as privileges
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
cross join unnest(array['anon', 'authenticated', 'waitlist_writer', 'waitlist_admin']) r
where n.nspname in ('public', 'ops', 'waitlist_api', 'social', 'intent', 'sim', 'analytics')
  and not exists (select 1 from pg_depend d where d.classid = 'pg_proc'::regclass and d.objid = p.oid and d.deptype = 'e')
  and exists (select 1 from pg_roles where rolname = r)
  and has_schema_privilege(r, n.oid, 'USAGE')
  and has_function_privilege(r, p.oid, 'EXECUTE')
  and not (r = 'authenticated' and n.nspname = 'public' and p.proname like 'app\_%')
  and not (r in ('waitlist_writer', 'waitlist_admin') and n.nspname = 'waitlist_api')
order by 1, 2;

-- 4. Event triggers on the project.
select evtname, evtevent, evtfoid::regproc as function, pg_get_userbyid(evtowner) as owner, evtenabled, evttags
from pg_event_trigger order by 1;

-- 5. The waitlist switches (expect submissions off and no notice version).
select key, enabled, value is not null as has_value from ops.settings order by key;
