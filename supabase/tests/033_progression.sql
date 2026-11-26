-- Staging-safe, read-only: progression (20261217000000). Catalog reads, plus
-- counts reported, never failed. Skipped until the migration is applied.

\set ON_ERROR_STOP on
select to_regclass('sim.goal_versions') is not null
       or case when to_regclass('supabase_migrations.schema_migrations') is null then false
            else (xpath('/row/n/text()', query_to_xml(
                    'select count(*) as n from supabase_migrations.schema_migrations where version = ''20261217000000''',
                    false, true, '')))[1]::text::int > 0
       end as progression_applied \gset
\if :progression_applied

do $$
declare
  bad text[] := '{}';
  t text;
begin
  -- The switch exists; the progression tables are private and append-only.
  if not exists (select 1 from ops.feature_switches where feature = 'progression') then
    bad := bad || 'the progression switch is missing'::text;
  end if;
  foreach t in array array['sim.goal_versions', 'sim.qualifications', 'sim.creator_share_states', 'sim.allocation_states'] loop
    if not (select relrowsecurity from pg_class where oid = t::regclass)
       or has_table_privilege('authenticated', t, 'select') or has_table_privilege('anon', t, 'select')
       or has_table_privilege('authenticated', t, 'insert') then
      bad := bad || (t || ': reachable by members');
    end if;
    if not exists (select 1 from pg_trigger where tgrelid = t::regclass and not tgisinternal and tgenabled <> 'D'
                   and tgname like '%append_only') then
      bad := bad || (t || ': not append-only');
    end if;
  end loop;
  -- The database enforces the order of states.
  if (select count(*) from pg_trigger where tgname in ('creator_share_states_guard', 'allocation_states_guard') and tgenabled <> 'D') <> 2 then
    bad := bad || 'the earnings state guard is missing or disabled'::text;
  end if;
  -- No defaults: there is no goal value the migration set.
  if exists (select 1 from sim.goal_versions where set_by not like 'founder:%') then
    bad := bad || 'a goal value was set by something other than the founder'::text;
  end if;
  -- Progression never influences distribution: no feed, discovery, ranking or
  -- advertising function reads goals, qualification or earnings states.
  if exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
             where (n.nspname in ('social', 'ads') or (n.nspname = 'public' and p.proname ~ '^app_(feed|discover|home|catch_up|unseen|suggested|search|ad_|member_posts|post$|topics)'))
               and p.prosrc ~ '\msim\.(goal_|qualifications|check_qualification|creator_share_states|allocation_states|release_qualified|earnings_summary|in_good_standing)') then
    bad := bad || 'a distribution or advertising function reads progression'::text;
  end if;
  -- Views are never a reward signal: no progression measure reads them.
  if exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
             where n.nspname = 'sim' and p.prosrc ~ 'post_views') then
    bad := bad || 'a progression measure reads viewed state'::text;
  end if;
  if cardinality(bad) > 0 then
    raise exception 'FAIL: progression: %', bad;
  end if;
  raise notice 'PASS: progression: switch present; goals, qualifications and earnings states private, append-only and ordered; no default goal values; nothing in distribution, discovery or advertising reads it; no measure reads views';
end $$;

-- Reported, never failed: where it stands. Counts only.
do $$
declare
  v_on boolean := ops.feature_on('progression');
  v_creator_goals boolean := exists (select 1 from sim.goal_versions where audience = 'creator');
  v_consumer_goals boolean := exists (select 1 from sim.goal_versions where audience = 'consumer');
  v_qualified integer := (select count(*) from sim.qualifications);
begin
  raise notice 'INFO: progression: switch %, creator goals %, consumer goals %, % qualification(s)',
    case when v_on then 'ON' else 'off' end,
    case when v_creator_goals then 'set' else 'not set' end,
    case when v_consumer_goals then 'set' else 'not set' end, v_qualified;
end $$;

\else
\echo 'Skipped 033_progression.sql: 20261217000000 is not applied here.'
\endif
