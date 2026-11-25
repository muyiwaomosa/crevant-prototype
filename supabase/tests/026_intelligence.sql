-- Staging-safe, read-only: intelligence (20261210000000). Catalog reads only.
-- Skipped until the migration is applied.

\set ON_ERROR_STOP on
select to_regclass('social.post_opens') is not null
       or case when to_regclass('supabase_migrations.schema_migrations') is null then false
               else (xpath('/row/n/text()', query_to_xml(
                       'select count(*) as n from supabase_migrations.schema_migrations where version = ''20261210000000''',
                       false, true, '')))[1]::text::int > 0
          end as intelligence_applied \gset
\if :intelligence_applied

do $$
declare
  bad text[] := '{}';
  conn text := (select prosrc from pg_proc where oid = 'ops.connections(timestamptz, timestamptz)'::regprocedure);
begin
  if not (select relrowsecurity from pg_class where oid = 'social.post_opens'::regclass)
     or has_table_privilege('authenticated', 'social.post_opens', 'SELECT,INSERT,UPDATE,DELETE') then
    bad := bad || 'post opens are reachable by members'::text;
  end if;
  if has_function_privilege('authenticated', 'ops.connections(timestamptz, timestamptz)', 'EXECUTE') then
    bad := bad || 'members can compute connections directly'::text;
  end if;
  -- The approved North Star definition: following at the time, meaningful activities only, no self or blocked pairs, test accounts marked.
  if conn !~ 'f\.followed_at <= a\.at' or conn !~ 'meaningful_comment' or conn !~ 'deleted_at is null' or conn !~ 'a\.consumer <> a\.creator'
     or conn !~ 'social\.blocks' or conn !~ $r$cohort = 'tester'$r$ or conn !~ $r$cohort = 'founder'$r$ or conn ~ 'post_views' then
    bad := bad || 'the North Star calculation lost part of its approved definition'::text;
  end if;
  if (select prosrc from pg_proc where oid = 'ops.week_start(timestamptz, integer)'::regprocedure) !~ 'America/Toronto' then
    bad := bad || 'the week is not Monday to Sunday in Toronto'::text;
  end if;
  -- Non-binding intent never combined with simulated money; founder only for the overview.
  if (select prosrc from pg_proc where oid = 'public.app_creator_insights(integer)'::regprocedure) ~ '\mintent\.' then
    bad := bad || 'creator intelligence combines Support Intent with simulated money'::text;
  end if;
  if (select prosrc from pg_proc where oid = 'public.app_founder_overview()'::regprocedure) !~ 'social\.current_founder\(\)' then
    bad := bad || 'the founder overview is not founder only'::text;
  end if;
  if cardinality(bad) > 0 then
    raise exception 'FAIL: intelligence: %', bad;
  end if;
  raise notice 'PASS: intelligence: post opens are private; the North Star follows its approved definition (Toronto weeks, test data marked); intent and simulated money stay apart; the overview is founder only';
end $$;

\else
\echo 'Skipped 026_intelligence.sql: 20261210000000 is not applied here.'
\endif
