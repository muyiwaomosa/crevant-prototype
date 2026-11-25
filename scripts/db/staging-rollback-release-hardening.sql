-- Staging only: undoes 20261214000000 (release hardening). Never run it against a Production project. Tested locally by
-- scripts/db/rollback-release-hardening-test.sh.
--
--   psql "<url>" -X -q -v ON_ERROR_STOP=1 -v mode=check -v confirm= -f scripts/db/staging-rollback-release-hardening.sql
--   psql "<url>" -X -q -v ON_ERROR_STOP=1 -v mode=apply -v confirm='REMOVE THE STAGING RELEASE HARDENING' -f ...
--
-- Puts back the history triggers, the settlement line key, the revenue
-- check and the functions as they were before 20261214000000. Refuses,
-- changing nothing, while any settlement line or content-ad revenue has lost
-- its member (an account was deleted since), if the record or an expected
-- object is missing, or a later migration exists.

\set ON_ERROR_STOP on
\pset footer off

begin;
set local lock_timeout = '10s';
set local statement_timeout = '60s';

select set_config('crevant.rollback_mode', :'mode', true) as mode,
       set_config('crevant.rollback_confirm', :'confirm', true) <> '' as confirmation_given;

do $$
begin
  if current_setting('crevant.rollback_mode') not in ('check', 'apply') then
    raise exception 'mode must be check or apply';
  end if;
  if current_setting('crevant.rollback_mode') = 'apply'
     and current_setting('crevant.rollback_confirm') <> 'REMOVE THE STAGING RELEASE HARDENING' then
    raise exception 'apply needs the confirmation phrase: REMOVE THE STAGING RELEASE HARDENING';
  end if;
  if to_regclass('supabase_migrations.schema_migrations') is null then
    raise exception 'refused: no Supabase migration history here (supabase_migrations.schema_migrations)';
  end if;
  if not exists (select 1 from supabase_migrations.schema_migrations where version = '20261214000000')
     or to_regprocedure('ops.forget_member_invitations(uuid)') is null then
    raise exception 'refused: expected objects are missing (20261214000000 release hardening), so the database is not in the state this rollback was written for';
  end if;
  if exists (select 1 from supabase_migrations.schema_migrations where version > '20261214000000') then
    raise exception 'refused, nothing changed: a later migration is recorded';
  end if;
end $$;

lock table sim.settlement_lines, sim.revenue_entries in share row exclusive mode;

do $$
declare
  n bigint;
begin
  n := (select count(*) from sim.settlement_lines where member_id is null)
     + (select count(*) from sim.revenue_entries where kind = 'content_ad' and creator_id is null);
  if n > 0 then
    raise exception 'refused, nothing changed: % rows of data depend on release hardening (settlement lines or revenue of deleted accounts). Fix forward instead.', n;
  end if;
end $$;

\echo 'Checks passed. Removing release hardening and the migration record.'

drop trigger block_events_append_only on social.block_events;
create trigger block_events_append_only before update or delete on social.block_events
for each row execute function ops.history_append_only();
drop trigger enforcements_no_update on ops.enforcements;
create trigger enforcements_no_update before update or delete on ops.enforcements
for each row execute function ops.history_append_only();
drop trigger enforcement_lifts_no_update on ops.enforcement_lifts;
create trigger enforcement_lifts_no_update before update or delete on ops.enforcement_lifts
for each row execute function ops.history_append_only();
drop trigger member_notices_read_only on ops.member_notices;
create trigger member_notices_read_only before update or delete on ops.member_notices
for each row execute function ops.notices_read_only();
drop trigger appeals_decided_once on ops.appeals;
create trigger appeals_decided_once before update or delete on ops.appeals
for each row execute function ops.appeals_decided_once();

drop index sim.settlement_lines_one_per_member;
alter table sim.settlement_lines drop constraint settlement_lines_pkey;
alter table sim.settlement_lines drop column id;
alter table sim.settlement_lines add primary key (settlement_id, member_id);

drop trigger revenue_entries_need_creator on sim.revenue_entries;
drop function sim.revenue_needs_creator();
alter table sim.revenue_entries add constraint revenue_content_has_creator check (kind = 'feed_ad' or creator_id is not null);

create or replace function public.app_founder_delete_member(p_request bigint, p_confirm_username text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := social.current_founder();
  r ops.member_requests%rowtype;
  v_username text;
  v_forfeited integer := 0;
  v_key text;
  v_posts bigint;
begin
  select * into r from ops.member_requests where id = p_request for update;
  if not found or r.kind <> 'deletion' or r.status <> 'open' or r.member_id is null then
    raise exception 'not_found' using errcode = 'P0001';
  end if;
  select p.username into v_username from public.profiles p where p.id = r.member_id;
  if v_username is null or v_username <> lower(pg_catalog.btrim(coalesce(p_confirm_username, ''))) then
    raise exception 'confirmation_mismatch' using errcode = 'P0001';
  end if;
  if r.member_id = v_uid or exists (select 1 from ops.member_access a where a.user_id = r.member_id and a.cohort = 'founder') then
    raise exception 'cannot_delete_founder' using errcode = 'P0001';
  end if;
  -- Unsettled simulated points are forfeited first, as recorded reversals.
  for v_key in select l.source_key from sim.points_ledger l
               where l.member_id = r.member_id and l.reverses is null and l.points > 0
                 and sim.award_state(l.id) in ('recognized', 'pending_review', 'approved') loop
    perform sim.reverse(v_key, 'account_deleted:' || v_key);
    v_forfeited := v_forfeited + 1;
  end loop;
  select count(*) into v_posts from social.posts s where s.author_id = r.member_id;
  update ops.member_requests set status = 'completed', resolved_at = pg_catalog.now(), details = null where id = r.id;
  insert into ops.member_request_events (request_id, action, actor, note)
  values (r.id, 'account_deleted', 'founder:' || v_uid::text,
          pg_catalog.format('%s posts removed; %s simulated awards forfeited', v_posts, v_forfeited));
  delete from auth.users where id = r.member_id;
  return pg_catalog.jsonb_build_object('posts_removed', v_posts, 'awards_forfeited', v_forfeited);
end;
$$;
drop function ops.forget_member_invitations(uuid);

create or replace function public.app_my_campaign_report(p_campaign uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := social.current_member();
  r jsonb;
begin
  if not exists (select 1 from ads.campaigns c join ads.advertisers a on a.id = c.advertiser_id
                 where c.id = p_campaign and a.requested_by = v_uid and a.status = 'approved') then
    raise exception 'not_found' using errcode = 'P0001';
  end if;
  r := ads.campaign_report(p_campaign);
  return r - 'advertiser_satisfaction'
           || pg_catalog.jsonb_build_object(
                'relevant', ads.private_count((r->>'relevant')::bigint),
                'not_relevant', ads.private_count((r->>'not_relevant')::bigint),
                'hidden', ads.private_count((r->>'hidden')::bigint),
                'reported', ads.private_count((r->>'reported')::bigint));
end;
$$;

create or replace function public.app_ad_for(p_surface text, p_post uuid default null)
returns table (impression_id uuid, advertiser text, headline text, body text, cta_label text, landing_url text,
               match text, matched text, placement text, creative_kind text, media_path text, media_alt text, shown_with text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := social.current_member();
  v_topic text;
  v_creator uuid;
  v_pick record;
  v_id uuid;
begin
  if p_surface is null or p_surface not in ('content', 'feed') or (p_surface = 'content') <> (p_post is not null) then
    raise exception 'invalid_request' using errcode = 'P0001';
  end if;
  if p_surface = 'content' then
    select s.topic, s.author_id into v_topic, v_creator
    from social.posts s join social.visible_members m on m.id = s.author_id
    where s.id = p_post and s.deleted_at is null;
    if v_creator is null or v_creator = v_uid then
      return; -- no ad on a post the member can't see, or on their own post
    end if;
  end if;
  -- The approved frequency (SP-TA-001 6.1): at most 6 ads a day for a member,
  -- the same campaign at most 3 times a day, and one every 20 seconds per slot.
  if (select count(*) from ads.impressions i where i.member_id = v_uid and i.served_at > pg_catalog.date_trunc('day', pg_catalog.now())) >= 6
     or exists (select 1 from ads.impressions i where i.member_id = v_uid and i.served_at > pg_catalog.now() - interval '20 seconds'
                and i.surface = p_surface and i.post_id is not distinct from p_post) then
    return;
  end if;
  select * into v_pick from ads.choose(v_uid, p_surface, v_topic);
  if v_pick.campaign_id is null then
    return;
  end if;
  insert into ads.impressions (campaign_id, member_id, surface, post_id, creator_id, match, matched)
  values (v_pick.campaign_id, v_uid, p_surface, p_post, v_creator, v_pick.match, v_pick.matched)
  returning id into v_id;
  return query
  select v_id, a.name, c.headline, c.body, c.cta_label, c.landing_url, v_pick.match, v_pick.matched, p_surface,
         c.creative_kind, c.media_path, c.media_alt,
         (select m.display_name from social.visible_members m where m.id = v_creator)
  from ads.campaigns c join ads.advertisers a on a.id = c.advertiser_id
  where c.id = v_pick.campaign_id;
end;
$$;

create or replace function sim.award(p_member uuid, p_action text, p_key text, p_creator uuid, p_post uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_set sim.reward_settings%rowtype;
  v_rule sim.point_rules%rowtype;
  v_today integer;
  v_month integer;
begin
  select * into v_set from sim.reward_settings where id;
  if v_set.paused or p_member is null then
    return;
  end if;
  select * into v_rule from sim.point_rules r where r.version = v_set.rule_version and r.action = p_action;
  if not found or v_rule.points = 0 then
    return;
  end if;
  -- Never for your own content or yourself.
  if p_creator is not null and p_creator = p_member then
    return;
  end if;
  if exists (select 1 from sim.points_ledger l where l.source_key = p_key) then
    return;
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('sim.award:' || p_member::text, 0));
  if v_rule.daily_cap is not null then
    select count(*) into v_today from sim.points_ledger l
    where l.member_id = p_member and l.action = p_action and l.reverses is null
      and l.created_at > pg_catalog.date_trunc('day', pg_catalog.now())
      -- A restoration corrects an earlier entry; it is not a new contribution (20261209000000).
      and l.source_key not like 'restored:%';
    if v_today >= v_rule.daily_cap then
      return;
    end if;
  end if;
  if v_rule.redeemable then
    select coalesce(sum(l.points), 0) into v_month from sim.points_ledger l
    where l.redeemable and l.reverses is null and l.created_at > pg_catalog.date_trunc('month', pg_catalog.now());
    if v_month + v_rule.points > v_set.monthly_redeemable_cap then
      return;
    end if;
  end if;
  insert into sim.points_ledger (member_id, action, points, redeemable, status, rule_version, source_key, creator_id, post_id)
  values (p_member, p_action, v_rule.points, v_rule.redeemable,
          case when v_rule.redeemable then 'pending_review' else 'recognized' end,
          v_set.rule_version, p_key, p_creator, p_post)
  on conflict (source_key) do nothing;
end;
$$;

create or replace function public.app_creator_insights(p_days integer default 7)
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
      'reached', (select count(distinct x.viewer_id) from (
                    select v.viewer_id from social.post_views v join social.posts s on s.id = v.post_id
                    where s.author_id = v_uid and v.viewed_at >= v_from
                    union
                    select o.viewer_id from social.post_opens o join social.posts s on s.id = o.post_id
                    where s.author_id = v_uid and o.opened_at >= v_from) x
                  where exists (select 1 from social.follows f where f.follower_id = x.viewer_id and f.creator_id = v_uid)),
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

revoke all on all functions in schema ads from public, anon, authenticated;
delete from supabase_migrations.schema_migrations where version = '20261214000000';

select current_setting('crevant.rollback_mode') = 'apply' as apply \gset
\if :apply
  commit;
  \echo 'Applied: release hardening and the migration record were removed.'
\else
  rollback;
  \echo 'Check only: every check and the removal succeeded inside the transaction, and all of it was rolled back. Nothing changed.'
\endif
