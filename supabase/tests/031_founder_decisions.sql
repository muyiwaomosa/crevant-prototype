-- Staging-safe, read-only: founder decisions of Nov 25 (20261215000000). Catalog reads only.
-- Skipped until the migration is applied.

\set ON_ERROR_STOP on
select case when to_regclass('sim.point_rules') is null then false
            else (xpath('/row/n/text()', query_to_xml(
                    'select count(*) as n from sim.point_rules where action = ''own_audience_referral''',
                    false, true, '')))[1]::text::int > 0
       end
       or case when to_regclass('supabase_migrations.schema_migrations') is null then false
            else (xpath('/row/n/text()', query_to_xml(
                    'select count(*) as n from supabase_migrations.schema_migrations where version = ''20261215000000''',
                    false, true, '')))[1]::text::int > 0
       end as decisions_applied \gset
\if :decisions_applied

do $$
declare
  bad text[] := '{}';
  cap text := (select prosrc from pg_proc where oid = 'sim.capture()'::regprocedure);
  enf text := (select prosrc from pg_proc where oid = 'public.app_mod_enforce(uuid, text, text, uuid, integer, text, boolean)'::regprocedure);
begin
  -- Own-audience referrals are recognized, never redeemable, and capped.
  if not exists (select 1 from sim.point_rules where version = 'd6-v1' and action = 'own_audience_referral' and not redeemable and points = 20 and daily_cap = 5) then
    bad := bad || 'the own-audience recognition rule is missing or redeemable'::text;
  end if;
  -- Still only the direct referrer, once per referred member, with the existing checks.
  if cap !~ 'own_audience_referral' or cap !~ $r$'referral:' \|\| new\.follower_id$r$ or cap !~ 'age_attestations' or cap !~ 'email_confirmed_at'
     or cap !~ 'referrer_id <> new\.follower_id' then
    bad := bad || 'referral capture lost one of its integrity checks'::text;
  end if;
  -- Disciplinary action against a moderator or the founder is for the founder.
  if enf !~ 'escalate_to_founder' or enf !~ 'ops\.moderator_active\(p_member\)' or enf !~ $r$cohort = 'founder'$r$ then
    bad := bad || 'moderators can act against moderators or the founder'::text;
  end if;
  -- Money & Business stays an eligible content topic; no financial product is a commercial category.
  if ads.topic_is_sensitive('money') or exists (select 1 from ads.categories c where c.slug ~* '(loan|credit|invest|crypto|insur|bank|finance|trading)') then
    bad := bad || 'money topic or a financial product category changed'::text;
  end if;
  if cardinality(bad) > 0 then
    raise exception 'FAIL: founder decisions: %', bad;
  end if;
  raise notice 'PASS: founder decisions: own-audience referrals recognized only; referral integrity kept; moderator discipline escalated; no financial product category';
end $$;

\else
\echo 'Skipped 031_founder_decisions.sql: 20261215000000 is not applied here.'
\endif
