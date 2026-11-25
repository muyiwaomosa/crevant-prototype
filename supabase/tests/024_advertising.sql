-- Staging-safe, read-only: advertising (20261208000000). Catalog reads and the
-- category list only. Skipped until the migration is applied.

\set ON_ERROR_STOP on
select to_regclass('ads.campaigns') is not null
       or case when to_regclass('supabase_migrations.schema_migrations') is null then false
               else (xpath('/row/n/text()', query_to_xml(
                       'select count(*) as n from supabase_migrations.schema_migrations where version = ''20261208000000''',
                       false, true, '')))[1]::text::int > 0
          end as advertising_applied \gset
\if :advertising_applied

do $$
declare
  t text;
  r text;
  bad text[] := '{}';
  choose text := (select prosrc from pg_proc where oid = 'ads.choose(uuid, text, text)'::regprocedure);
  serve text := (select prosrc from pg_proc where oid = 'public.app_ad_for(text, uuid)'::regprocedure);
begin
  foreach r in array array['anon', 'authenticated'] loop
    if has_schema_privilege(r, 'ads', 'USAGE') then bad := bad || ('role ' || r || ' can use schema ads'); end if;
  end loop;
  foreach t in array array['ads.categories', 'ads.advertisers', 'ads.campaigns', 'ads.preferences', 'ads.exclusions', 'ads.impressions',
                           'ads.conversions', 'ads.advertiser_feedback', 'ads.revenue_attributions'] loop
    if to_regclass(t) is null then bad := bad || (t || ' missing'); continue; end if;
    if not (select relrowsecurity from pg_class where oid = to_regclass(t)) then bad := bad || (t || ' without row level security'); end if;
    if has_table_privilege('anon', t, 'SELECT,INSERT,UPDATE,DELETE') or has_table_privilege('authenticated', t, 'SELECT,INSERT,UPDATE,DELETE') then
      bad := bad || (t || ' reachable by members or visitors');
    end if;
  end loop;
  -- No sensitive or prohibited category exists to target.
  if exists (select 1 from ads.categories where slug ~* '(health|well|faith|relig|politic|dating|alcohol|gambl|crypto|loan|adult|weapon|tobacco|vape)'
                                            or label ~* '(health|faith|relig|politic|dating|alcohol|gambl|crypto|loan|adult|weapon|tobacco|vape)') then
    bad := bad || 'a sensitive or prohibited commercial category exists'::text;
  end if;
  if not ads.topic_is_sensitive('faith') or not ads.topic_is_sensitive('wellness') then
    bad := bad || 'faith or health content could be used for contextual ads'::text;
  end if;
  -- Strict separation: matching and serving never read content interests, follows, searches or other members' data.
  if choose ~* '(member_topics|follows|search_metrics|profile_details|clique|likes|comments)' or serve ~* '(member_topics|follows|search_metrics|profile_details)' then
    bad := bad || 'ad matching reads content interests or social behaviour'::text;
  end if;
  if choose !~ 'ads\.preferences' or choose !~ 'ads\.exclusions' or choose !~ 'daily_cap' or choose !~ 'allow_general' or choose !~ 'topic_is_sensitive' then
    bad := bad || 'ad matching lost preferences, exclusions, caps, the fallback rule or the sensitive-topic rule'::text;
  end if;
  -- Observations once; ads earn no points; reports withhold small groups.
  if not exists (select 1 from pg_trigger where tgrelid = 'ads.impressions'::regclass and tgname = 'impressions_once' and tgenabled <> 'D') then
    bad := bad || 'observations can be rewritten'::text;
  end if;
  if (select prosrc from pg_proc where oid = 'public.app_ad_event(uuid, text)'::regprocedure) ~* 'sim\.(award|points_ledger)' then
    bad := bad || 'ad events award points'::text;
  end if;
  if (select points from sim.point_rules where version = 'd6-v1' and action = 'ad_view') <> 0 then
    bad := bad || 'viewing ads earns points'::text;
  end if;
  if ads.private_count(9) is not null or (select prosrc from pg_proc where oid = coalesce(to_regprocedure('ads.campaign_report(uuid)'), 'public.app_founder_campaign_report(uuid)'::regprocedure)) !~ 'private_count' then
    bad := bad || 'reports can show groups under 10'::text;
  end if;
  -- Revenue: never an open or closed month, once per campaign and month.
  if (select prosrc from pg_proc where oid = 'public.app_founder_attribute_campaign_revenue(uuid, date, bigint)'::regprocedure) !~ 'already_closed'
     or (select prosrc from pg_proc where oid = 'public.app_founder_attribute_campaign_revenue(uuid, date, bigint)'::regprocedure) !~ 'month_not_over' then
    bad := bad || 'revenue attribution can touch an open or closed month'::text;
  end if;
  if cardinality(bad) > 0 then
    raise exception 'FAIL: advertising: %', bad;
  end if;
  raise notice 'PASS: advertising: the ads schema is private; no sensitive category or content can be targeted; matching never reads content interests; observations are once only; ads earn no points; small groups are withheld; revenue never touches an open or closed month (% campaigns, % active)',
    (select count(*) from ads.campaigns), (select count(*) from ads.campaigns where status = 'active');
end $$;

\else
\echo 'Skipped 024_advertising.sql: 20261208000000 is not applied here.'
\endif
