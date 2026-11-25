-- Staging-safe, read-only: discovery (20261203000000). Catalog reads only.
-- Skipped until the migration is applied.

\set ON_ERROR_STOP on
select to_regclass('social.shares') is not null
       or case when to_regclass('supabase_migrations.schema_migrations') is null then false
               else (xpath('/row/n/text()', query_to_xml(
                       'select count(*) as n from supabase_migrations.schema_migrations where version = ''20261203000000''',
                       false, true, '')))[1]::text::int > 0
          end as discovery_applied \gset
\if :discovery_applied

do $$
declare
  bad text[] := '{}';
  disc_src text := (select prosrc from pg_proc where oid = to_regprocedure('public.app_discover_content(text, integer)'));
begin
  if to_regclass('social.shares') is null then bad := bad || 'social.shares missing'::text;
  else
    if not (select relrowsecurity from pg_class where oid = 'social.shares'::regclass) then bad := bad || 'shares without row level security'::text; end if;
    if has_table_privilege('anon', 'social.shares', 'SELECT,INSERT,UPDATE,DELETE') or has_table_privilege('authenticated', 'social.shares', 'SELECT,INSERT,UPDATE,DELETE') then
      bad := bad || 'shares reachable by members or visitors'::text;
    end if;
    if not exists (select 1 from pg_trigger where tgrelid = 'social.shares'::regclass and tgname = 'shares_append_only' and tgenabled <> 'D') then bad := bad || 'shares editable'::text; end if;
    if not exists (select 1 from pg_trigger where tgrelid = 'social.shares'::regclass and tgname = 'events_shares') then bad := bad || 'share events missing'::text; end if;
  end if;
  -- Discovery leaves out own, followed, muted and uncategorized posts, caps each creator, and gives reasons.
  foreach disc_src in array array[coalesce(disc_src, '')] loop
    if position('s.author_id <> v_uid' in disc_src) = 0 or position('social.follows' in disc_src) = 0 or position('social.mutes' in disc_src) = 0
       or position('s.topic is not null' in disc_src) = 0 or position('e.nth <= 2' in disc_src) = 0 or position('Because you''''re interested in' in disc_src) = 0 then
      bad := bad || 'discovery eligibility, fairness or reasons changed'::text;
    end if;
  end loop;
  if cardinality(bad) > 0 then
    raise exception 'FAIL: discovery: %', bad;
  end if;
  raise notice 'PASS: discovery: shares are private, append-only and recorded; content discovery keeps its eligibility, fairness and reasons';
end $$;

\else
\echo 'Skipped 019_discovery.sql: 20261203000000 is not applied here.'
\endif
