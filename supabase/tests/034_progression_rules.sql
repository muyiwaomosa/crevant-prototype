-- Staging-safe, read-only: progression rules (20261218000000, SP-PRG-001).
-- Catalog reads, plus counts reported, never failed. Skipped until applied.

\set ON_ERROR_STOP on
select to_regclass('sim.qualification_decisions') is not null
       or case when to_regclass('supabase_migrations.schema_migrations') is null then false
            else (xpath('/row/n/text()', query_to_xml(
                    'select count(*) as n from supabase_migrations.schema_migrations where version = ''20261218000000''',
                    false, true, '')))[1]::text::int > 0
       end as rules_applied \gset
\if :rules_applied

do $$
declare
  bad text[] := '{}';
  t text;
begin
  -- The approved benchmarks are recorded, each with its approval.
  if not exists (select 1 from sim.goal_versions where audience = 'creator' and set_by like 'founder-approved:SP-PRG-001 %'
                 and targets = '{"original_posts": 20, "posting_weeks": 3, "genuine_followers": 100, "clique_connections": 5, "returning_supporters": 5}'::jsonb)
     or not exists (select 1 from sim.goal_versions where audience = 'consumer' and set_by like 'founder-approved:SP-PRG-001 %'
                 and targets = '{"clique_creators": 10, "meaningful_engagements": 30, "engaged_creators": 3, "supporting_weeks": 4, "external_shares": 5, "qualified_referrals": 5}'::jsonb) then
    bad := bad || 'the approved SP-PRG-001 benchmarks are not recorded'::text;
  end if;
  -- Decisions, holds and corrections: private and append-only.
  foreach t in array array['sim.qualification_decisions', 'sim.financial_holds', 'sim.financial_hold_releases',
                           'sim.allocation_corrections', 'sim.allocation_correction_states'] loop
    if not (select relrowsecurity from pg_class where oid = t::regclass)
       or has_table_privilege('authenticated', t, 'select') or has_table_privilege('anon', t, 'select')
       or has_table_privilege('authenticated', t, 'insert') then
      bad := bad || (t || ': reachable by members');
    end if;
    if not exists (select 1 from pg_trigger where tgrelid = t::regclass and not tgisinternal and tgenabled <> 'D' and tgname like '%append_only') then
      bad := bad || (t || ': not append-only');
    end if;
  end loop;
  -- Corrections are guarded; release follows review and holds.
  if (select count(*) from pg_trigger where tgname in ('revenue_correction_guard', 'allocation_correction_guard', 'allocation_correction_states_guard') and tgenabled <> 'D') <> 3 then
    bad := bad || 'a correction guard is missing or disabled'::text;
  end if;
  -- Revocation is documented.
  if not exists (select 1 from pg_constraint where conrelid = 'sim.qualification_decisions'::regclass and conname = 'revocation_documented') then
    bad := bad || 'revocations are not required to carry evidence and a message'::text;
  end if;
  -- Still nothing in distribution, discovery or advertising reads progression.
  if exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
             where (n.nspname in ('social', 'ads') or (n.nspname = 'public' and p.proname ~ '^app_(feed|discover|home|catch_up|unseen|suggested|search|ad_|member_posts|post$|topics)'))
               and p.prosrc ~ '\msim\.(qualification_|financial_holds|allocation_correction|account_held|entry_held|allocation_held|released|goals_met)') then
    bad := bad || 'a distribution or advertising function reads progression'::text;
  end if;
  if cardinality(bad) > 0 then
    raise exception 'FAIL: progression rules: %', bad;
  end if;
  raise notice 'PASS: progression rules: the approved SP-PRG-001 benchmarks are recorded; decisions, holds and corrections are private, append-only and guarded; revocations need evidence; distribution never reads it';
end $$;

-- Reported, never failed. Counts only.
do $$
begin
  raise notice 'INFO: progression rules: % under review, % qualified, % open hold(s), % revenue correction(s), % allocation correction(s)',
    (select count(*) from sim.qualifications q where sim.qualification_status(q.member_id, q.audience) = 'under_review'),
    (select count(*) from sim.qualifications q where sim.qualification_status(q.member_id, q.audience) = 'qualified'),
    (select count(*) from sim.financial_holds h where not exists (select 1 from sim.financial_hold_releases x where x.hold_id = h.id)),
    (select count(*) from sim.revenue_entries where corrects is not null),
    (select count(*) from sim.allocation_corrections);
end $$;

\else
\echo 'Skipped 034_progression_rules.sql: 20261218000000 is not applied here.'
\endif
