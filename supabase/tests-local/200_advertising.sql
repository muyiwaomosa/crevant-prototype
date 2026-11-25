-- TEST ONLY (throwaway databases). Advertising (20261208000000): managed
-- onboarding and approval, optional commercial preferences kept apart from
-- content interests, rules-based matching (preference, then non-sensitive
-- context, then non-personalized, else none), exclusions and caps, one-time
-- observations, aggregate reports with small groups withheld, and simulated
-- revenue attribution into 40/20/40 (never a closed or open month, once).
--
--   F = ...7501 the founder   C = ...7502 a creator   M = ...7503 chose Software & apps
--   N = ...7504 no preferences, content interest Tech   X = ...7505 hides ads
\set ON_ERROR_STOP on

set role supabase_auth_admin;
insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data) values
  ('00000000-0000-4000-8000-fdfdfd007501', 'ad-f@example.test', now(), '{}'),
  ('00000000-0000-4000-8000-fdfdfd007502', 'ad-c@example.test', now(), '{}'),
  ('00000000-0000-4000-8000-fdfdfd007503', 'ad-m@example.test', now(), '{}'),
  ('00000000-0000-4000-8000-fdfdfd007504', 'ad-n@example.test', now(), '{}'),
  ('00000000-0000-4000-8000-fdfdfd007505', 'ad-x@example.test', now(), '{}');
reset role;
update public.profiles p set username = 'ad_' || v.u, display_name = 'Ad ' || upper(v.u)
from (values ('7501', 'f'), ('7502', 'c'), ('7503', 'm'), ('7504', 'n'), ('7505', 'x')) v(n, u)
where p.id = ('00000000-0000-4000-8000-fdfdfd00' || v.n)::uuid;
update ops.member_launch_settings set founder_user_id = '00000000-0000-4000-8000-fdfdfd007501' where id;
select ops.grant_member_access('00000000-0000-4000-8000-fdfdfd007501', 'founder', 'ad-test');
select ops.grant_member_access(('00000000-0000-4000-8000-fdfdfd00' || n)::uuid, 'fan', 'ad-test') from unnest(array['7502', '7503', '7504', '7505']) n;
insert into social.member_topics (user_id, topic) values ('00000000-0000-4000-8000-fdfdfd007504', 'tech');

create function pg_temp.expect_error(sql text, expected text, what text)
returns void language plpgsql as $$
declare got text;
begin
  begin execute sql; exception when others then got := sqlerrm; end;
  if got is null then raise exception 'FAIL: % succeeded, expected "%"', what, expected; end if;
  if got !~ expected then raise exception 'FAIL: % failed with "%", expected "%"', what, got, expected; end if;
end; $$;
grant execute on function pg_temp.expect_error(text, text, text) to authenticated, anon;
create function pg_temp.g(n text) returns uuid language sql immutable as $$ select ('00000000-0000-4000-8000-fdfdfd00' || n)::uuid $$;
grant execute on function pg_temp.g(text) to authenticated, anon;
create function pg_temp.as_member(n text) returns void language sql as $$
  select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-fdfdfd00' || n || '","role":"authenticated"}', true) $$;
grant execute on function pg_temp.as_member(text) to authenticated, anon;
-- Moves a member's served ads back in time (outside the 20-second spacing). Test only.
create function pg_temp.age(m text, by interval) returns void language plpgsql as $$
begin
  set local session_replication_role = replica;
  update ads.impressions set served_at = served_at - by, viewed_at = viewed_at - by, clicked_at = clicked_at - by where member_id = pg_temp.g(m);
  set local session_replication_role = origin;
end; $$;

insert into social.posts (id, author_id, body, topic) values
  (pg_temp.g('7601'), pg_temp.g('7502'), 'A money post', 'money'),
  (pg_temp.g('7602'), pg_temp.g('7502'), 'A faith post', 'faith'),
  (pg_temp.g('7603'), pg_temp.g('7503'), 'M''s own post', 'money');

-- ---------------------------------------------------------------------------
-- 1. Commercial preferences: optional, editable, removable, separate.
begin;
select pg_temp.as_member('7503');
set local role authenticated;
do $$
begin
  if exists (select 1 from public.app_ad_categories() where label ~* '(health|faith|relig|politic|dating|alcohol|gambl|crypto|loan)') then
    raise exception 'FAIL: a sensitive or prohibited category is offered';
  end if;
  perform pg_temp.expect_error($q$select public.app_set_ad_preference('health', 'chosen')$q$, 'invalid_request', 'choosing a category that does not exist');
  perform public.app_set_ad_preference('software_apps', 'chosen');
  perform public.app_set_ad_preference('travel', 'excluded');
  if (select string_agg(slug || ':' || chosen || ':' || excluded, ',' order by slug) from public.app_ad_categories() where chosen or excluded)
     <> 'software_apps:true:false,travel:false:true' then
    raise exception 'FAIL: the preferences are not as chosen';
  end if;
  perform public.app_clear_ad_preferences();
  if exists (select 1 from public.app_ad_categories() where chosen or excluded) then raise exception 'FAIL: clearing left preferences'; end if;
  perform public.app_set_ad_preference('software_apps', 'chosen');
  perform pg_temp.expect_error('select count(*) from ads.preferences', 'permission denied', 'reading preferences directly');
end $$;
commit;
do $$ begin raise notice 'PASS: commercial preferences are optional, editable and removable; no sensitive or prohibited category exists'; end $$;

-- ---------------------------------------------------------------------------
-- 2. Managed onboarding, approval and campaigns.
begin;
select pg_temp.as_member('7502');
set local role authenticated;
select pg_temp.expect_error($q$select public.app_founder_ads()$q$, 'not_founder', 'a member reading advertising management');
commit;
begin;
select pg_temp.as_member('7501');
set local role authenticated;
do $$
declare
  adv uuid;
  a uuid; b uuid; gen uuid;
begin
  perform pg_temp.expect_error($q$select public.app_founder_save_advertiser('{"name":"x","website":"http://x.example"}'::jsonb)$q$, 'invalid_request', 'onboarding without every field');
  adv := public.app_founder_save_advertiser(jsonb_build_object(
    'name', 'Budgetly', 'website', 'https://budgetly.example', 'offering', 'A budgeting app',
    'problem_solved', 'Hard to see where money goes each month', 'desired_outcome', 'A clear monthly plan',
    'customer_needs', 'People planning their monthly spending', 'objective', 'sign_ups', 'conversion_action', 'Free account sign-up',
    'eligibility_notes', 'Canada only', 'categories', jsonb_build_array('software_apps')));
  perform pg_temp.expect_error(format($q$select public.app_founder_save_campaign(%L::jsonb)$q$, jsonb_build_object(
    'advertiser_id', adv, 'name', 'Bad', 'placement', 'content', 'categories', jsonb_build_array('software_apps'), 'context_topics', jsonb_build_array('faith'),
    'starts_on', current_date, 'ends_on', current_date + 30, 'headline', 'h', 'body', 'b', 'cta_label', 'c', 'landing_url', 'https://budgetly.example')),
    'invalid_topic', 'a campaign using faith content');
  a := public.app_founder_save_campaign(jsonb_build_object('advertiser_id', adv, 'name', 'Apps by preference', 'placement', 'both',
    'categories', jsonb_build_array('software_apps'), 'starts_on', current_date - 40, 'ends_on', current_date + 30, 'daily_cap', 2, 'price_cents', 50000,
    'headline', 'Plan your month in minutes', 'body', 'Budgetly shows where your money goes.', 'cta_label', 'Try it free', 'landing_url', 'https://budgetly.example/start'));
  b := public.app_founder_save_campaign(jsonb_build_object('advertiser_id', adv, 'name', 'Money context', 'placement', 'content',
    'categories', jsonb_build_array('courses'), 'context_topics', jsonb_build_array('money'), 'starts_on', current_date - 40, 'ends_on', current_date + 30,
    'headline', 'Learn budgeting', 'body', 'A short course.', 'cta_label', 'Learn more', 'landing_url', 'https://budgetly.example/course'));
  gen := public.app_founder_save_campaign(jsonb_build_object('advertiser_id', adv, 'name', 'General feed', 'placement', 'feed',
    'categories', jsonb_build_array('travel'), 'allow_general', true, 'starts_on', current_date - 40, 'ends_on', current_date + 30,
    'headline', 'Weekend getaways', 'body', 'Trips nearby.', 'cta_label', 'See trips', 'landing_url', 'https://budgetly.example/trips'));
  perform pg_temp.expect_error(format('select public.app_founder_set_campaign_status(%L, %L)', a, 'active'), 'advertiser_not_approved', 'activating before approval');
  perform public.app_founder_review_advertiser(adv, true, 'Meets the Advertising Policy.');
  perform public.app_founder_set_campaign_status(a, 'active');
  perform public.app_founder_set_campaign_status(b, 'active');
  perform public.app_founder_set_campaign_status(gen, 'active');
  perform set_config('ad.a', a::text, false);
  perform set_config('ad.b', b::text, false);
  perform set_config('ad.g', gen::text, false);
end $$;
commit;
do $$ begin raise notice 'PASS: advertisers are onboarded with every field and approved before any campaign runs; faith and health content cannot be targeted'; end $$;

-- ---------------------------------------------------------------------------
-- 3. Matching.
begin;
select pg_temp.as_member('7503');
set local role authenticated;
do $$
declare r record;
begin
  select * into r from public.app_ad_for('feed');
  if r.match <> 'preference' or r.matched <> 'Software & apps' or r.headline <> 'Plan your month in minutes' then
    raise exception 'FAIL: M should get the preference ad: % %', r.match, r.matched;
  end if;
  if exists (select 1 from public.app_ad_for('feed')) then
    raise exception 'FAIL: two feed ads within 20 seconds';
  end if;
  if exists (select 1 from public.app_ad_for('content', pg_temp.g('7603'))) then
    raise exception 'FAIL: an ad on the member''s own post';
  end if;
  perform set_config('ad.m1', r.impression_id::text, false);
end $$;
commit;
begin;
select pg_temp.as_member('7504');
set local role authenticated;
do $$
declare r record;
begin
  -- N's content interest (Tech) is never used: no preference, so a non-personalized ad.
  select * into r from public.app_ad_for('feed');
  if r.match <> 'general' or r.matched is not null or r.headline <> 'Weekend getaways' then
    raise exception 'FAIL: N should get the non-personalized ad: % %', r.match, r.matched;
  end if;
  select * into r from public.app_ad_for('content', pg_temp.g('7601'));
  if r.match <> 'context' or r.matched <> 'Money & business' then
    raise exception 'FAIL: a money post should carry the contextual ad: % %', r.match, r.matched;
  end if;
  if exists (select 1 from public.app_ad_for('content', pg_temp.g('7602'))) then
    raise exception 'FAIL: faith content carried an ad';
  end if;
  perform set_config('ad.n1', r.impression_id::text, false);
end $$;
commit;
-- The daily cap: A twice for M, then the next eligible (here: the general feed ad).
select pg_temp.age('7503', interval '1 minute');
begin;
select pg_temp.as_member('7503');
set local role authenticated;
select headline from public.app_ad_for('feed');
commit;
select pg_temp.age('7503', interval '1 minute');
begin;
select pg_temp.as_member('7503');
set local role authenticated;
do $$
begin
  if (select headline from public.app_ad_for('feed')) <> 'Weekend getaways' then
    raise exception 'FAIL: the daily cap did not move M on to another campaign';
  end if;
end $$;
commit;
do $$ begin raise notice 'PASS: matching uses a declared preference, then non-sensitive context, then a non-personalized ad, else none; never content interests; daily caps and spacing hold'; end $$;

-- ---------------------------------------------------------------------------
-- 4. Observations: once each; clicks only after a view; feedback hides.
begin;
select pg_temp.as_member('7503');
set local role authenticated;
do $$
begin
  perform public.app_ad_event(current_setting('ad.m1')::uuid, 'click');          -- before a view: ignored
  perform public.app_ad_event(current_setting('ad.m1')::uuid, 'view');
  perform public.app_ad_event(current_setting('ad.m1')::uuid, 'view');           -- again: once
  perform public.app_ad_event(current_setting('ad.m1')::uuid, 'click');
  perform public.app_ad_event(current_setting('ad.m1')::uuid, 'click');          -- again: once
  perform public.app_ad_event(current_setting('ad.m1')::uuid, 'relevant');
  perform public.app_ad_event(current_setting('ad.m1')::uuid, 'not_relevant');   -- feedback once
  perform pg_temp.expect_error(format('select public.app_ad_event(%L, %L)', current_setting('ad.n1'), 'view'), 'not_found', 'recording on someone else''s ad');
end $$;
commit;
begin;
select pg_temp.as_member('7504');
set local role authenticated;
select public.app_ad_event(current_setting('ad.n1')::uuid, 'view');
commit;
do $$
declare i ads.impressions%rowtype;
begin
  select * into i from ads.impressions where id = current_setting('ad.m1')::uuid;
  if i.viewed_at is null or i.clicked_at is null or i.feedback <> 'relevant' or i.clicked_at < i.viewed_at then
    raise exception 'FAIL: the observations are not recorded once, in order';
  end if;
  perform pg_temp.expect_error(format('update ads.impressions set feedback = %L where id = %L', 'hidden', i.id), 'recorded once', 'rewriting an observation');
  if exists (select 1 from sim.points_ledger where member_id in (pg_temp.g('7503'), pg_temp.g('7504'))) then
    raise exception 'FAIL: seeing or clicking ads earned points';
  end if;
  raise notice 'PASS: each view, click and piece of feedback counts once, a click only after a view, and ads earn no points';
end $$;
-- Hiding an ad stops it; excluding an advertiser stops all of theirs.
begin;
select pg_temp.as_member('7505');
set local role authenticated;
do $$
declare r record;
begin
  select * into r from public.app_ad_for('feed');
  perform public.app_ad_event(r.impression_id, 'hidden');
  if (select count(*) from public.app_my_ad_exclusions()) <> 1 then raise exception 'FAIL: the hidden ad is not listed'; end if;
end $$;
commit;
select pg_temp.age('7505', interval '1 minute');
begin;
select pg_temp.as_member('7505');
set local role authenticated;
do $$
begin
  if exists (select 1 from public.app_ad_for('feed')) then raise exception 'FAIL: a hidden ad came back'; end if;
  perform public.app_remove_ad_exclusion('campaign', current_setting('ad.g'));
  if not exists (select 1 from public.app_ad_for('feed')) then raise exception 'FAIL: unhiding did not bring it back'; end if;
end $$;
commit;
do $$ begin raise notice 'PASS: members can hide an ad and undo it'; end $$;

-- ---------------------------------------------------------------------------
-- 5. Aggregate reports, small groups withheld, no identities.
begin;
select pg_temp.as_member('7501');
set local role authenticated;
do $$
declare rep jsonb := public.app_founder_campaign_report(current_setting('ad.a')::uuid);
begin
  if rep->>'kind' <> 'actual observations' or (rep->>'impressions')::int <> 1 or (rep->>'clicks')::int <> 1 or (rep->>'ctr')::numeric <> 1
     or (rep->>'relevant')::int <> 1 or rep->'eligible_audience' <> 'null'::jsonb or rep->'reach' <> 'null'::jsonb
     or (rep->'by_match'->'preference'->>'impressions')::int <> 1 then
    raise exception 'FAIL: the report is wrong: %', rep;
  end if;
  if rep::text ~ '7503' or rep::text ~* 'ad_m' then
    raise exception 'FAIL: the report identifies a member';
  end if;
  if (select members from public.app_founder_ad_demand() where category = 'software_apps') is not null then
    raise exception 'FAIL: a demand count under 10 is shown';
  end if;
  perform public.app_founder_record_conversions(current_setting('ad.a')::uuid, current_date, 3, 'Advertiser reported 3 sign-ups, matched to the landing page.');
  perform public.app_founder_record_advertiser_feedback(current_setting('ad.a')::uuid, 4, 'Happy with relevance.');
  if (public.app_founder_campaign_report(current_setting('ad.a')::uuid)->>'verified_conversions')::int <> 3 then
    raise exception 'FAIL: verified conversions are not reported';
  end if;
end $$;
commit;
do $$
begin
  if ads.private_count(9) is not null or ads.private_count(10) <> 10 then raise exception 'FAIL: the group threshold is not 10'; end if;
  raise notice 'PASS: reports are aggregate, groups under 10 are withheld, conversions are reconciled manually, nothing identifies a member';
end $$;

-- ---------------------------------------------------------------------------
-- 6. Simulated revenue: the content share to the creator by views (40/20/40), the feed share to Splitpost.
-- N's contextual view of C's money post (campaign B) is moved to three months
-- ago (earlier test files close last month's simulated settlement).
select pg_temp.age('7504', (now() - (date_trunc('month', now()) - interval '3 months' + interval '3 days')));
begin;
select pg_temp.as_member('7501');
set local role authenticated;
do $$
declare
  last date := (date_trunc('month', now()) - interval '3 months')::date;
  r jsonb;
begin
  perform pg_temp.expect_error(format('select public.app_founder_attribute_campaign_revenue(%L, %L, 10000)', current_setting('ad.b'), date_trunc('month', now())::date),
                               'month_not_over', 'attributing the current month');
  r := public.app_founder_attribute_campaign_revenue(current_setting('ad.b')::uuid, last, 10000);
  if (r->>'content_cents')::int <> 10000 or (r->>'feed_cents')::int <> 0 then raise exception 'FAIL: attribution: %', r; end if;
  perform pg_temp.expect_error(format('select public.app_founder_attribute_campaign_revenue(%L, %L, 10000)', current_setting('ad.b'), last),
                               'already_attributed', 'attributing twice');
end $$;
commit;
do $$
declare last date := (date_trunc('month', now()) - interval '3 months')::date;
begin
  if (select string_agg(kind || ':' || coalesce(creator_id::text, '-') || ':' || net_cents, ',') from sim.revenue_entries where note like 'campaign ' || current_setting('ad.b') || '%')
     <> 'content_ad:' || pg_temp.g('7502') || ':10000' then
    raise exception 'FAIL: the content revenue was not attributed to the creator';
  end if;
  if (select row(x.creator_cents, x.pool_cents, x.splitpost_cents)::text from sim.split('content_ad', 10000) x) <> '(4000,2000,4000)' then
    raise exception 'FAIL: the split is not 40/20/40';
  end if;
  -- A closed month is never attributed.
  insert into sim.settlements (month, pool_cents, points, closed_by) values ((last - interval '1 month')::date, 0, 0, 'test');
end $$;
begin;
select pg_temp.as_member('7501');
set local role authenticated;
select pg_temp.expect_error(format('select public.app_founder_attribute_campaign_revenue(%L, %L, 500)', current_setting('ad.a'),
                                   (date_trunc('month', now()) - interval '4 months')::date), 'already_closed', 'attributing a closed month');
commit;
do $$ begin raise notice 'PASS: simulated campaign revenue enters 40/20/40 by the creator''s valid content views, once per campaign and month, never for an open or closed month'; end $$;
