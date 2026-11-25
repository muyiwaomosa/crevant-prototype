-- Staging-safe, read-only: rewards (20261205000000). Catalog reads and the
-- rules table only. Skipped until the migration is applied.

\set ON_ERROR_STOP on
select to_regclass('sim.points_ledger') is not null
       or case when to_regclass('supabase_migrations.schema_migrations') is null then false
               else (xpath('/row/n/text()', query_to_xml(
                       'select count(*) as n from supabase_migrations.schema_migrations where version = ''20261205000000''',
                       false, true, '')))[1]::text::int > 0
          end as rewards_applied \gset
\if :rewards_applied

do $$
declare
  t text;
  bad text[] := '{}';
begin
  foreach t in array array['sim.point_rules', 'sim.reward_settings', 'sim.points_ledger', 'sim.revenue_entries', 'sim.settlements', 'sim.settlement_lines'] loop
    if to_regclass(t) is null then bad := bad || (t || ' missing'); continue; end if;
    if not (select relrowsecurity from pg_class where oid = to_regclass(t)) then bad := bad || (t || ' without row level security'); end if;
    if has_table_privilege('anon', t, 'SELECT,INSERT,UPDATE,DELETE') or has_table_privilege('authenticated', t, 'SELECT,INSERT,UPDATE,DELETE') then
      bad := bad || (t || ' reachable by members or visitors');
    end if;
  end loop;
  foreach t in array array['sim.points_ledger:points_ledger_append_only', 'sim.revenue_entries:revenue_entries_append_only',
                           'sim.settlements:settlements_append_only', 'sim.settlement_lines:settlement_lines_append_only'] loop
    if not exists (select 1 from pg_trigger where tgrelid = to_regclass(split_part(t, ':', 1)) and tgname = split_part(t, ':', 2) and tgenabled <> 'D') then
      bad := bad || ('editable: ' || t);
    end if;
  end loop;
  -- The approved point table (D6): only qualified referrals are redeemable; ads earn nothing.
  if (select string_agg(action || '=' || points || case when redeemable then 'R' else '' end, ',' order by action)
      from sim.point_rules where version = 'd6-v1')
     <> 'ad_view=0,clique=0,external_share=5,follow=0,like=0,meaningful_comment=2,'
        || (case when exists (select 1 from sim.point_rules where action = 'own_audience_referral')
                 then 'own_audience_referral=20,' else '' end)
        || 'qualified_referral=100R,repost=5,save=2' then
    bad := bad || 'the d6-v1 point table changed'::text;
  end if;
  -- The split is 40/20/40 for content ads and 100% Splitpost for feed ads.
  if (select row(c.creator_cents, c.pool_cents, c.splitpost_cents)::text from sim.split('content_ad', 10000) c) <> '(4000,2000,4000)'
     or (select row(c.creator_cents, c.pool_cents, c.splitpost_cents)::text from sim.split('feed_ad', 10000) c) <> '(0,0,10000)' then
    bad := bad || 'the 40/20/40 split changed'::text;
  end if;
  foreach t in array array['social.comments:rewards_comments', 'social.saves:rewards_saves', 'social.reposts:rewards_reposts',
                           'social.shares:rewards_shares', 'social.follow_events:rewards_follow_events'] loop
    if not exists (select 1 from pg_trigger where tgrelid = to_regclass(split_part(t, ':', 1)) and tgname = split_part(t, ':', 2)) then
      bad := bad || ('award trigger missing: ' || t);
    end if;
  end loop;
  if cardinality(bad) > 0 then
    raise exception 'FAIL: rewards: %', bad;
  end if;
  raise notice 'PASS: rewards: the simulated ledger, revenue and settlements are private and append-only; the D6 table and the 40/20/40 split are as approved; points come from server triggers (paused: %)',
    (select paused from sim.reward_settings where id);
end $$;

\else
\echo 'Skipped 021_rewards.sql: 20261205000000 is not applied here.'
\endif
