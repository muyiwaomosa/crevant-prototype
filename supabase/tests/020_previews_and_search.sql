-- Staging-safe, read-only: previews and search measurement (20261204000000).
-- Catalog reads and one settings read only. Skipped until the migration is applied.

\set ON_ERROR_STOP on
select to_regclass('social.preview_visits') is not null
       or case when to_regclass('supabase_migrations.schema_migrations') is null then false
               else (xpath('/row/n/text()', query_to_xml(
                       'select count(*) as n from supabase_migrations.schema_migrations where version = ''20261204000000''',
                       false, true, '')))[1]::text::int > 0
          end as previews_applied \gset
\if :previews_applied

do $$
declare
  t text;
  bad text[] := '{}';
  pub regprocedure := to_regprocedure('public.app_public_post(uuid, text)');
  anon_fns text;
begin
  foreach t in array array['social.search_metrics_daily', 'social.preview_visits', 'social.preview_optouts', 'social.preview_rate',
                           'ops.public_preview_settings', 'ops.public_preview_events'] loop
    if to_regclass(t) is null then bad := bad || (t || ' missing'); continue; end if;
    if not (select relrowsecurity from pg_class where oid = to_regclass(t)) then bad := bad || (t || ' without row level security'); end if;
    if has_table_privilege('anon', t, 'SELECT,INSERT,UPDATE,DELETE') or has_table_privilege('authenticated', t, 'SELECT,INSERT,UPDATE,DELETE') then
      bad := bad || (t || ' reachable by members or visitors');
    end if;
  end loop;
  -- Search counts store nothing personal.
  if exists (select 1 from information_schema.columns where table_schema = 'social' and table_name in ('search_metrics_daily', 'preview_visits')
             and column_name ~* '(member|user|query|words|ip|agent|visitor|session)') then
    bad := bad || 'search counts or preview visits store something personal'::text;
  end if;
  -- Visitors can call exactly one function: the read-only preview.
  select string_agg(p.oid::regprocedure::text, ', ') into anon_fns
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname in ('public', 'ops', 'social', 'waitlist_api', 'intent', 'sim', 'analytics')
    and has_schema_privilege('anon', n.oid, 'USAGE') and has_function_privilege('anon', p.oid, 'EXECUTE')
    and p.oid <> coalesce(pub, 0::oid)
    and not exists (select 1 from pg_depend d where d.classid = 'pg_proc'::regclass and d.objid = p.oid and d.deptype = 'e');
  if anon_fns is not null then bad := bad || ('visitors can call ' || anon_fns); end if;
  if pub is null or not has_function_privilege('anon', pub, 'EXECUTE') then bad := bad || 'public preview missing'::text; end if;
  if not exists (select 1 from pg_trigger where tgrelid = to_regclass('ops.public_preview_events') and tgname = 'public_preview_events_no_update') then
    bad := bad || 'preview switch history editable'::text;
  end if;
  if cardinality(bad) > 0 then
    raise exception 'FAIL: previews and search: %', bad;
  end if;
  raise notice 'PASS: previews and search: private tables, counts without personal data, and visitors can call only the read-only preview (switch: %)',
    case when (select enabled from ops.public_preview_settings where id) then 'on' else 'off' end;
end $$;

\else
\echo 'Skipped 020_previews_and_search.sql: 20261204000000 is not applied here.'
\endif
