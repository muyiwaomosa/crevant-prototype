-- IP-8 Intelligence (SP-TA-001 v2, WP-07; founder authorization of November
-- 25, 2026). Review guide: docs/INTELLIGENCE.md.
--
-- Every figure here is aggregate and computed from the authoritative records
-- (follows, comments, saves, reposts, shares, post opens, the points ledger,
-- ads observations). Nothing new is collected about anyone except one
-- conservative consumption signal: that a member opened a post.
--
-- 1. Qualifying consumption (SP-TA-001 6.2, partly): a member opening a post
--    page. The 8-second in-feed dwell is not measured yet, so connections are
--    undercounted, never overcounted. Two-second views never qualify.
-- 2. Weekly Active Creator-Consumer Connections (the North Star, 6.2): unique
--    (consumer, creator) pairs where the consumer follows the creator at the
--    time and makes a qualifying meaningful activity on the creator's content
--    (a meaningful comment, save, repost, share or post open) in the Monday to
--    Sunday week (America/Toronto). Each pair once a week; never self or
--    blocked pairs; deleted comments don't count; test accounts (the tester
--    cohort) are excluded from actual figures and reported separately; the
--    founder-dependent share is reported alongside.
-- 3. Creator intelligence (owner only): Attention, Retention and Money.
-- 4. Consumer intelligence (My Split): connections made, referral status,
--    opportunities.
-- 5. Founder intelligence: the North Star and acquisition, activation,
--    retention, discovery, content, rewards, advertising, governance and
--    operations, each labelled actual, test, simulated or hypothesis, and
--    exportable.
-- 6. Advertiser intelligence: self-reported conversions are recorded apart
--    from verified ones.

-- ---------------------------------------------------------------------------
-- 1. Post opens

create table social.post_opens (
  viewer_id uuid not null references auth.users (id) on delete cascade,
  post_id   uuid not null references social.posts (id) on delete cascade,
  opened_at timestamptz not null default pg_catalog.now(),
  primary key (viewer_id, post_id)
);
create index post_opens_by_post on social.post_opens (post_id, opened_at);
comment on table social.post_opens is 'A member opened a post page (first time only): qualifying consumption for intelligence. Never a reward signal.';
alter table social.post_opens enable row level security;
revoke all on table social.post_opens from public, anon, authenticated;

create function public.app_note_open(p_post uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := social.current_member();
begin
  if not exists (select 1 from social.posts s join social.visible_members m on m.id = s.author_id
                 where s.id = p_post and s.deleted_at is null and s.author_id <> v_uid) then
    return;
  end if;
  if (select count(*) from social.post_opens o where o.viewer_id = v_uid and o.opened_at > pg_catalog.now() - interval '1 hour') >= 600 then
    return;
  end if;
  insert into social.post_opens (viewer_id, post_id) values (v_uid, p_post) on conflict do nothing;
end;
$$;
comment on function public.app_note_open(uuid) is 'Records that the member opened someone else''s post (first time only). Best effort; never a reward.';
revoke all on function public.app_note_open(uuid) from public, anon;
grant execute on function public.app_note_open(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 2. Connections

-- The start of the Monday to Sunday week (America/Toronto) containing p_at, offset by p_weeks.
create function ops.week_start(p_at timestamptz, p_weeks integer default 0)
returns timestamptz
language sql
stable
set search_path = ''
as $$
  select (pg_catalog.date_trunc('week', p_at at time zone 'America/Toronto') + pg_catalog.make_interval(weeks => p_weeks)) at time zone 'America/Toronto';
$$;
revoke all on function ops.week_start(timestamptz, integer) from public, anon, authenticated;

-- Qualifying meaningful activity pairs in [p_from, p_to).
create function ops.connections(p_from timestamptz, p_to timestamptz)
returns table (consumer uuid, creator uuid, test boolean, founder_dependent boolean)
language sql
stable
security definer
set search_path = ''
as $$
  with acts as (
    select c.author_id as consumer, s.author_id as creator, c.created_at as at
    from social.comments c join social.posts s on s.id = c.post_id
    where c.created_at >= p_from and c.created_at < p_to and c.deleted_at is null and social.meaningful_comment(c.body)
    union all
    select v.member_id, s.author_id, v.saved_at from social.saves v join social.posts s on s.id = v.post_id
    where v.saved_at >= p_from and v.saved_at < p_to
    union all
    select r.reposter_id, s.author_id, r.created_at from social.reposts r join social.posts s on s.id = r.post_id
    where r.created_at >= p_from and r.created_at < p_to
    union all
    select h.member_id, s.author_id, h.created_at from social.shares h join social.posts s on s.id = h.post_id
    where h.created_at >= p_from and h.created_at < p_to
    union all
    select o.viewer_id, s.author_id, o.opened_at from social.post_opens o join social.posts s on s.id = o.post_id
    where o.opened_at >= p_from and o.opened_at < p_to
  ),
  pairs as (
    select distinct a.consumer, a.creator
    from acts a
    where a.consumer <> a.creator
      and exists (select 1 from social.follows f where f.follower_id = a.consumer and f.creator_id = a.creator and f.followed_at <= a.at)
      and not exists (select 1 from social.blocks b where (b.blocker_id = a.consumer and b.blocked_id = a.creator)
                                                      or (b.blocker_id = a.creator and b.blocked_id = a.consumer))
  )
  select p.consumer, p.creator,
         exists (select 1 from ops.member_access m where m.user_id in (p.consumer, p.creator) and m.cohort = 'tester'),
         exists (select 1 from ops.member_access m where m.user_id in (p.consumer, p.creator) and m.cohort = 'founder')
  from pairs p;
$$;
revoke all on function ops.connections(timestamptz, timestamptz) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. Creator intelligence (owner only)

create function public.app_creator_insights(p_days integer default 7)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := social.current_member();
  v_days integer := least(greatest(coalesce(p_days, 7), 7), 90);
  v_from timestamptz := pg_catalog.now() - pg_catalog.make_interval(days => v_days);
  v_prev timestamptz := pg_catalog.now() - pg_catalog.make_interval(days => 2 * v_days);
  v_week timestamptz := ops.week_start(pg_catalog.now());
begin
  return pg_catalog.jsonb_build_object(
    'days', v_days,
    'attention', pg_catalog.jsonb_build_object(
      'followers', (select count(*) from social.follows f where f.creator_id = v_uid),
      'new_followers', (select count(*) from social.follow_events e where e.creator_id = v_uid and e.action = 'followed' and e.occurred_at >= v_from),
      'new_followers_before', (select count(*) from social.follow_events e where e.creator_id = v_uid and e.action = 'followed'
                               and e.occurred_at >= v_prev and e.occurred_at < v_from),
      'sources', coalesce((select pg_catalog.jsonb_object_agg(x.src, x.n) from (
                    select coalesce(e.source, 'other') as src, count(*) as n from social.follow_events e
                    where e.creator_id = v_uid and e.action = 'followed' and e.occurred_at >= v_from group by 1) x), '{}'::jsonb),
      -- Available: every post is in every follower's Home (coverage 100%). Reached: followers who viewed at least one post in the period.
      'reached', (select count(distinct v.viewer_id) from social.post_views v join social.posts s on s.id = v.post_id
                  where s.author_id = v_uid and v.viewed_at >= v_from
                    and exists (select 1 from social.follows f where f.follower_id = v.viewer_id and f.creator_id = v_uid)),
      'posts', (select count(*) from social.posts s where s.author_id = v_uid and s.deleted_at is null and s.created_at >= v_from),
      'top_posts', coalesce((select pg_catalog.jsonb_agg(t order by t.views desc, t.created_at desc) from (
                      select s.id, pg_catalog.left(s.body, 80) as excerpt, s.topic, s.created_at,
                             (select count(*) from social.post_views v where v.post_id = s.id) as views,
                             (select count(*) from social.comments c where c.post_id = s.id and c.deleted_at is null) as comments,
                             (select count(*) from social.saves v where v.post_id = s.id) as saves,
                             (select count(*) from social.reposts r where r.post_id = s.id) as reposts,
                             (select count(*) from social.shares h where h.post_id = s.id) as shares
                      from social.posts s where s.author_id = v_uid and s.deleted_at is null and s.created_at >= v_from - interval '21 days'
                      order by 5 desc, s.created_at desc limit 3) t), '[]'::jsonb)),
    'retention', pg_catalog.jsonb_build_object(
      'followers', (select count(*) from social.follows f where f.creator_id = v_uid),
      'active_supporters', (select count(*) from social.follows f where f.creator_id = v_uid and social.is_active_supporter(f.follower_id, v_uid)),
      'clique', (select count(*) from social.clique_members m where m.creator_id = v_uid and m.removed_at is null),
      'returning', (select count(*) from (
                     select v.viewer_id from social.post_views v join social.posts s on s.id = v.post_id
                     where s.author_id = v_uid and v.viewed_at >= v_from
                     group by v.viewer_id having count(distinct (v.viewed_at at time zone 'America/Toronto')::date) >= 2) r),
      'connections_this_week', (select count(*) from ops.connections(v_week, pg_catalog.now()) c where c.creator = v_uid),
      'connections_last_week', (select count(*) from ops.connections(ops.week_start(pg_catalog.now(), -1), v_week) c where c.creator = v_uid)),
    'money', pg_catalog.jsonb_build_object(
      'actual_income_cents', 0,
      'simulated_by_month', coalesce((select pg_catalog.jsonb_agg(m order by m.month desc) from (
                               select r.month, sum((sim.split(r.kind, r.net_cents)).creator_cents)::bigint as creator_cents,
                                      sum(r.net_cents)::bigint as revenue_cents
                               from sim.revenue_entries r where r.creator_id = v_uid and r.kind = 'content_ad'
                               group by r.month order by r.month desc limit 6) m), '[]'::jsonb),
      'ads_with_your_posts', coalesce((select pg_catalog.jsonb_agg(a order by a.impressions desc) from (
                               select ad.name as advertiser, c.name as campaign,
                                      count(*) filter (where i.viewed_at is not null) as impressions,
                                      count(*) filter (where i.clicked_at is not null) as clicks,
                                      count(distinct i.post_id) as posts
                               from ads.impressions i join ads.campaigns c on c.id = i.campaign_id join ads.advertisers ad on ad.id = c.advertiser_id
                               where i.creator_id = v_uid and i.surface = 'content' and i.served_at >= pg_catalog.date_trunc('month', pg_catalog.now()) - interval '1 month'
                               group by ad.name, c.name) a), '[]'::jsonb)));
end;
$$;
comment on function public.app_creator_insights(integer) is 'The member''s own creator intelligence (Attention, Retention, Money) for the last 7 to 90 days. Aggregates only. Simulated earnings and actual income (zero in the pilot) are separate; non-binding Support Intent stays in app_my_audience (intent is never combined with simulated money).';
revoke all on function public.app_creator_insights(integer) from public, anon;
grant execute on function public.app_creator_insights(integer) to authenticated;

-- ---------------------------------------------------------------------------
-- 4. Consumer intelligence

create function public.app_my_contribution_insights()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := social.current_member();
  v_week timestamptz := ops.week_start(pg_catalog.now());
begin
  return pg_catalog.jsonb_build_object(
    'connections_this_week', (select count(*) from ops.connections(v_week, pg_catalog.now()) c where c.consumer = v_uid),
    'connections_last_week', (select count(*) from ops.connections(ops.week_start(pg_catalog.now(), -1), v_week) c where c.consumer = v_uid),
    'referrals', pg_catalog.jsonb_build_object(
      'joined', (select count(*) from ops.registrations r where r.referrer_id = v_uid and r.kind = 'referral'),
      'waiting_review', (select count(*) from sim.points_ledger l where l.member_id = v_uid and l.action = 'qualified_referral'
                         and l.reverses is null and sim.award_state(l.id) = 'pending_review'),
      'approved', (select count(*) from sim.points_ledger l where l.member_id = v_uid and l.action = 'qualified_referral'
                   and l.reverses is null and sim.award_state(l.id) in ('approved', 'settled')),
      'not_approved', (select count(*) from sim.points_ledger l where l.member_id = v_uid and l.action = 'qualified_referral'
                       and l.reverses is null and sim.award_state(l.id) in ('rejected', 'reversal'))),
    -- Opportunities: recent posts from creators the member follows that they haven't saved or shared yet.
    'opportunities', coalesce((select pg_catalog.jsonb_agg(o) from (
                       select s.id as post_id, m.display_name as creator, m.username, pg_catalog.left(s.body, 80) as excerpt
                       from social.posts s
                       join social.follows f on f.creator_id = s.author_id and f.follower_id = v_uid
                       join social.visible_members m on m.id = s.author_id
                       where s.deleted_at is null and s.created_at > pg_catalog.now() - interval '7 days'
                         and not exists (select 1 from social.saves v where v.post_id = s.id and v.member_id = v_uid)
                         and not exists (select 1 from social.shares h where h.post_id = s.id and h.member_id = v_uid)
                       order by s.created_at desc limit 3) o), '[]'::jsonb));
end;
$$;
comment on function public.app_my_contribution_insights() is 'The member''s own contribution intelligence: connections made this week, referral status counts, and posts they could save or share. Never names referred members.';
revoke all on function public.app_my_contribution_insights() from public, anon;
grant execute on function public.app_my_contribution_insights() to authenticated;

-- ---------------------------------------------------------------------------
-- 5. Founder intelligence

create function public.app_founder_overview()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := social.current_founder();
  v_week timestamptz := ops.week_start(pg_catalog.now());
begin
  return pg_catalog.jsonb_build_object(
    'generated_at', pg_catalog.now(),
    'week_start', v_week,
    'north_star', pg_catalog.jsonb_build_object(
      'kind', 'actual',
      'definition', 'Unique (consumer, creator) pairs; the consumer follows the creator and makes a meaningful comment, save, repost, share or post open on their content in the Monday to Sunday week (Toronto). Test accounts excluded; 8-second in-feed dwell not yet measured (undercounts).',
      'weeks', (select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
                  'week_start', ops.week_start(pg_catalog.now(), -w),
                  'connections', (select count(*) from ops.connections(ops.week_start(pg_catalog.now(), -w), least(ops.week_start(pg_catalog.now(), 1 - w), pg_catalog.now())) c where not c.test),
                  'founder_dependent', (select count(*) from ops.connections(ops.week_start(pg_catalog.now(), -w), least(ops.week_start(pg_catalog.now(), 1 - w), pg_catalog.now())) c where not c.test and c.founder_dependent),
                  'test', (select count(*) from ops.connections(ops.week_start(pg_catalog.now(), -w), least(ops.week_start(pg_catalog.now(), 1 - w), pg_catalog.now())) c where c.test))
                order by w desc) from pg_catalog.generate_series(0, 7) w)),
    'members', pg_catalog.jsonb_build_object(
      'kind', 'actual',
      'active_members', (select count(*) from ops.member_access a where a.status = 'active' and a.cohort <> 'tester'),
      'test_members', (select count(*) from ops.member_access a where a.status = 'active' and a.cohort = 'tester'),
      'registrations_this_week', (select count(*) from ops.registrations r where r.claimed_at >= v_week),
      'registration_cap', (select s.total_cap from ops.registration_settings s where s.id),
      'registration_paused', (select s.paused from ops.registration_settings s where s.id),
      'by_referral', (select count(*) from ops.registrations r where r.kind = 'referral'),
      -- Consumer activation (6.2): within 7 days of registering, a follow and a qualifying meaningful activity.
      'activation_eligible', (select count(*) from ops.registrations r where r.claimed_at < pg_catalog.now() - interval '7 days'),
      'activated', (select count(*) from ops.registrations r
                    where r.claimed_at < pg_catalog.now() - interval '7 days'
                      and exists (select 1 from social.follows f where f.follower_id = r.user_id and f.followed_at < r.claimed_at + interval '7 days')
                      and exists (select 1 from ops.connections(r.claimed_at, r.claimed_at + interval '7 days') c where c.consumer = r.user_id)),
      'retained', (select count(distinct c.consumer) from ops.connections(v_week, pg_catalog.now()) c
                   where not c.test and c.consumer in (select c2.consumer from ops.connections(ops.week_start(pg_catalog.now(), -1), v_week) c2))),
    'discovery', pg_catalog.jsonb_build_object(
      'kind', 'actual',
      'searches_7d', coalesce((select sum(m.searches) from social.search_metrics_daily m where m.surface = 'search' and m.day > current_date - 7), 0),
      'searches_with_results_7d', coalesce((select sum(m.with_results) from social.search_metrics_daily m where m.surface = 'search' and m.day > current_date - 7), 0),
      'follows_7d', (select count(*) from social.follow_events e where e.action = 'followed' and e.occurred_at > pg_catalog.now() - interval '7 days'),
      'follows_from_search_7d', (select count(*) from social.follow_events e where e.action = 'followed' and e.source = 'search' and e.occurred_at > pg_catalog.now() - interval '7 days'),
      'follows_from_discover_7d', (select count(*) from social.follow_events e where e.action = 'followed' and e.source = 'discover' and e.occurred_at > pg_catalog.now() - interval '7 days')),
    'content', pg_catalog.jsonb_build_object(
      'kind', 'actual',
      'posts_7d', (select count(*) from social.posts s where s.deleted_at is null and s.created_at > pg_catalog.now() - interval '7 days'),
      'creators_posting_7d', (select count(distinct s.author_id) from social.posts s where s.deleted_at is null and s.created_at > pg_catalog.now() - interval '7 days'),
      'meaningful_comments_7d', (select count(*) from social.comments c where c.deleted_at is null and c.created_at > pg_catalog.now() - interval '7 days' and social.meaningful_comment(c.body))),
    'rewards', pg_catalog.jsonb_build_object(
      'kind', 'simulated',
      'recognized_points', coalesce((select sum(l.points) from sim.points_ledger l where not l.redeemable), 0),
      'referrals_waiting', (select count(*) from sim.points_ledger l where l.action = 'qualified_referral' and l.reverses is null and sim.award_state(l.id) = 'pending_review'),
      'open_pool_cents', sim.open_pool_cents(),
      'revenue_cents', coalesce((select sum(r.net_cents) from sim.revenue_entries r), 0)),
    'advertising', pg_catalog.jsonb_build_object(
      'kind', 'actual',
      'active_campaigns', (select count(*) from ads.campaigns c where c.status = 'active'),
      'impressions_7d', (select count(*) from ads.impressions i where i.viewed_at > pg_catalog.now() - interval '7 days'),
      'clicks_7d', (select count(*) from ads.impressions i where i.clicked_at > pg_catalog.now() - interval '7 days'),
      'hidden_or_reported_7d', (select count(*) from ads.impressions i where i.feedback in ('hidden', 'reported') and i.feedback_at > pg_catalog.now() - interval '7 days'),
      'members_with_preferences', (select count(distinct p.member_id) from ads.preferences p)),
    'governance', pg_catalog.jsonb_build_object(
      'kind', 'actual',
      'open_reports', (select count(*) from ops.content_reports r where r.status = 'open'),
      'oldest_open_report_hours', (select floor(extract(epoch from pg_catalog.now() - min(r.created_at)) / 3600) from ops.content_reports r where r.status = 'open'),
      'open_appeals', (select count(*) from ops.appeals a where a.status = 'open'),
      'blocks_7d', (select count(*) from social.block_events b where b.action = 'blocked' and b.occurred_at > pg_catalog.now() - interval '7 days'),
      'active_limits', (select count(*) from ops.enforcements e where e.level <> 'warning' and (e.ends_at is null or e.ends_at > pg_catalog.now())
                        and not exists (select 1 from ops.enforcement_lifts l where l.enforcement_id = e.id))),
    'operations', pg_catalog.jsonb_build_object(
      'kind', 'actual',
      'external_access_approved', coalesce((select s.external_access_approved from ops.member_launch_settings s where s.id), false)));
end;
$$;
comment on function public.app_founder_overview() is 'Founder: ecosystem intelligence. The North Star by week with its founder-dependent share and test data apart, and acquisition, activation, retention, discovery, content, rewards (simulated), advertising, governance and operations indicators, each labelled. Aggregates only.';
revoke all on function public.app_founder_overview() from public, anon;
grant execute on function public.app_founder_overview() to authenticated;

-- ---------------------------------------------------------------------------
-- 6. Self-reported conversions, apart from verified ones

alter table ads.conversions add column self_reported integer check (self_reported is null or self_reported >= 0);
comment on column ads.conversions.self_reported is 'Conversions the advertiser reports but Splitpost has not verified. Always shown apart from verified conversions.';

drop function public.app_founder_record_conversions(uuid, date, integer, text);
create function public.app_founder_record_conversions(p_campaign uuid, p_month date, p_verified integer, p_note text, p_self_reported integer default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := social.current_founder();
begin
  if p_month is null or p_verified is null or p_verified < 0 or (p_self_reported is not null and p_self_reported < 0)
     or coalesce(pg_catalog.btrim(p_note), '') = '' then
    raise exception 'invalid_request' using errcode = 'P0001';
  end if;
  insert into ads.conversions (campaign_id, month, verified, note, self_reported)
  values (p_campaign, pg_catalog.date_trunc('month', p_month)::date, p_verified, pg_catalog.btrim(p_note), p_self_reported)
  on conflict (campaign_id, month) do update set verified = excluded.verified, note = excluded.note, self_reported = excluded.self_reported,
                                                recorded_at = pg_catalog.now();
exception
  when foreign_key_violation then
    raise exception 'not_found' using errcode = 'P0001';
end;
$$;
comment on function public.app_founder_record_conversions(uuid, date, integer, text, integer) is 'Founder: verified conversions for a campaign and month, reconciled manually with the advertiser, and separately any self-reported conversions not verified (aggregate only).';
revoke all on function public.app_founder_record_conversions(uuid, date, integer, text, integer) from public, anon;
grant execute on function public.app_founder_record_conversions(uuid, date, integer, text, integer) to authenticated;

-- The campaign report adds self-reported conversions, apart from verified ones.
create or replace function public.app_founder_campaign_report(p_campaign uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := social.current_founder();
  c ads.campaigns%rowtype;
  v_audience bigint;
begin
  select * into c from ads.campaigns where id = p_campaign;
  if not found then
    raise exception 'not_found' using errcode = 'P0001';
  end if;
  -- Eligible audience: members who chose one of the campaign's categories and excluded none of it.
  select count(distinct p.member_id) into v_audience
  from ads.preferences p
  where p.category = any (c.categories)
    and not exists (select 1 from ads.exclusions x where x.member_id = p.member_id
                    and ((x.kind = 'category' and x.target = any (c.categories)) or (x.kind = 'campaign' and x.target = c.id::text)
                         or (x.kind = 'advertiser' and x.target = c.advertiser_id::text)));
  return (
    with i as (select * from ads.impressions where campaign_id = c.id),
    by_match as (
      select m.match,
             count(i.id) filter (where i.viewed_at is not null) as views,
             count(i.id) filter (where i.clicked_at is not null) as clicks
      from (values ('preference'), ('context'), ('general')) m(match)
      left join i on i.match = m.match
      group by m.match)
    select pg_catalog.jsonb_build_object(
      'kind', 'actual observations',
      'minimum_group', 10,
      'eligible_audience', ads.private_count(v_audience),
      'served', (select count(*) from i),
      'impressions', (select count(*) from i where viewed_at is not null),
      'clicks', (select count(*) from i where clicked_at is not null),
      'ctr', case when (select count(*) from i where viewed_at is not null) > 0
                  then pg_catalog.round((select count(*) from i where clicked_at is not null)::numeric / (select count(*) from i where viewed_at is not null), 4) end,
      'reach', ads.private_count((select count(distinct member_id) from i where viewed_at is not null)),
      'relevant', (select count(*) from i where feedback = 'relevant'),
      'not_relevant', (select count(*) from i where feedback = 'not_relevant'),
      'hidden', (select count(*) from i where feedback = 'hidden'),
      'reported', (select count(*) from i where feedback = 'reported'),
      'by_match', (select pg_catalog.jsonb_object_agg(b.match, pg_catalog.jsonb_build_object('impressions', b.views, 'clicks', b.clicks)) from by_match b),
      'creative_kind', c.creative_kind,
      'video_plays', (select count(*) from i where played_at is not null),
      'video_completions', (select count(*) from i where completed_at is not null),
      'content_impressions', (select count(*) from i where viewed_at is not null and surface = 'content'),
      'feed_impressions', (select count(*) from i where viewed_at is not null and surface = 'feed'),
      'verified_conversions', coalesce((select sum(v.verified) from ads.conversions v where v.campaign_id = c.id), 0),
      'self_reported_conversions', (select sum(v.self_reported) from ads.conversions v where v.campaign_id = c.id),
      'advertiser_satisfaction', (select f.satisfaction from ads.advertiser_feedback f where f.campaign_id = c.id),
      'simulated_revenue_cents', coalesce((select sum(r.net_cents) from ads.revenue_attributions r where r.campaign_id = c.id), 0)));
end;
$$;

