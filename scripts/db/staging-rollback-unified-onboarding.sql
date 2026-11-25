-- Staging only: undoes 20261211000000 (unified onboarding). Never run it against a Production project. Tested locally by
-- scripts/db/rollback-unified-onboarding-test.sh.
--
--   psql "<url>" -X -q -v ON_ERROR_STOP=1 -v mode=check -v confirm= -f scripts/db/staging-rollback-unified-onboarding.sql
--   psql "<url>" -X -q -v ON_ERROR_STOP=1 -v mode=apply -v confirm='REMOVE THE STAGING UNIFIED ONBOARDING' -f ...
--
-- Removes creator posting topics, the inviter and invitation tools and member
-- advertising requests, and puts back the earlier creator suggestions,
-- campaign report and founder advertising page. Refuses, changing nothing,
-- while any posting topic or member advertising request exists, if the record
-- or an expected object is missing, or a later migration exists. Invitation
-- links the founder created stay valid (they are ordinary invitation links).

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
     and current_setting('crevant.rollback_confirm') <> 'REMOVE THE STAGING UNIFIED ONBOARDING' then
    raise exception 'apply needs the confirmation phrase: REMOVE THE STAGING UNIFIED ONBOARDING';
  end if;
  if to_regclass('supabase_migrations.schema_migrations') is null then
    raise exception 'refused: no Supabase migration history here (supabase_migrations.schema_migrations)';
  end if;
  if not exists (select 1 from supabase_migrations.schema_migrations where version = '20261211000000')
     or to_regclass('social.creator_topics') is null then
    raise exception 'refused: expected objects are missing (20261211000000 unified onboarding), so the database is not in the state this rollback was written for';
  end if;
  if exists (select 1 from supabase_migrations.schema_migrations where version > '20261211000000') then
    raise exception 'refused, nothing changed: a later migration is recorded';
  end if;
end $$;

lock table social.creator_topics, ads.advertisers in share row exclusive mode;

do $$
declare
  n bigint;
begin
  n := (select count(*) from social.creator_topics) + (select count(*) from ads.advertisers where requested_by is not null or requested_at is not null);
  if n > 0 then
    raise exception 'refused, nothing changed: % rows of data depend on unified onboarding (posting topics, member advertising requests). Fix forward instead.', n;
  end if;
end $$;

\echo 'Checks passed. Removing unified onboarding and the migration record.'

drop function public.app_my_campaign_report(uuid);
drop function public.app_my_advertising();
drop function public.app_request_advertising(jsonb);
drop function public.app_founder_revoke_invitation_link(text);
drop function public.app_founder_invitation_links();
drop function public.app_founder_create_creator_invitation(text, integer, integer);
drop function public.app_my_inviter();
drop function public.app_member_creator_topics(uuid);
drop function public.app_my_creator_setup();
drop function public.app_set_creator_topics(text[]);
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
drop function ads.campaign_report(uuid);
create or replace function public.app_founder_ads()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := social.current_founder();
begin
  return pg_catalog.jsonb_build_object(
    'advertisers', coalesce((select pg_catalog.jsonb_agg(pg_catalog.to_jsonb(a) order by a.created_at desc) from ads.advertisers a), '[]'::jsonb),
    'campaigns', coalesce((select pg_catalog.jsonb_agg(pg_catalog.to_jsonb(c) || pg_catalog.jsonb_build_object('advertiser', a.name) order by c.created_at desc)
                           from ads.campaigns c join ads.advertisers a on a.id = c.advertiser_id), '[]'::jsonb),
    'categories', (select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('slug', c.slug, 'label', c.label) order by c.sort_order) from ads.categories c),
    'topics', (select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('slug', t.slug, 'label', t.label) order by t.sort_order)
               from social.topics t where not ads.topic_is_sensitive(t.slug)),
    'creatives', ads.creative_files());
end;
$$;
revoke all on all functions in schema ads from public, anon, authenticated;
create or replace function public.app_suggested_creators(p_limit integer default 10)
returns table (
  id uuid, username text, display_name text, identity text, bio text, follow_reason text,
  topics text[], shared_topics integer, post_count bigint, follower_count bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := social.current_member();
begin
  return query
  select p.id, p.username, p.display_name,
         case when d.hidden_at is null then d.identity end,
         case when d.hidden_at is null then d.bio end,
         case when d.hidden_at is null then d.follow_reason end,
         case when d.hidden_at is null then
           coalesce((select array_agg(m.topic order by t.sort_order)
                     from social.member_topics m join social.topics t on t.slug = m.topic
                     where m.user_id = p.id and t.active), '{}')
         else '{}'::text[] end,
         case when d.hidden_at is null then
           (select count(*)::integer from social.member_topics m
            join social.member_topics mine on mine.topic = m.topic and mine.user_id = v_uid
            join social.topics t on t.slug = m.topic and t.active
            where m.user_id = p.id)
         else 0 end as shared,
         (select count(*) from social.posts s where s.author_id = p.id and s.deleted_at is null) as posts,
         (select count(*) from social.follows f where f.creator_id = p.id)
  from social.visible_members p
  left join social.profile_details d on d.user_id = p.id
  where p.id <> v_uid
    and not exists (select 1 from social.follows f where f.follower_id = v_uid and f.creator_id = p.id)
  order by shared desc,
           coalesce(d.hidden_at is null and d.identity in ('creator', 'both'), false) desc,
           (d.hidden_at is null and d.follow_reason is not null) desc nulls last,
           (select max(s.created_at) from social.posts s where s.author_id = p.id and s.deleted_at is null) desc nulls last,
           p.username
  limit least(greatest(coalesce(p_limit, 10), 1), 20);
end;
$$;
comment on function public.app_suggested_creators(integer) is 'Visible members the caller does not follow yet, ranked by shared interests. Ranking only: grants nothing.';
drop index ads.advertisers_one_open_request;
alter table ads.advertisers drop column requested_at, drop column requested_by;
drop table social.creator_topics;

delete from supabase_migrations.schema_migrations where version = '20261211000000';

select current_setting('crevant.rollback_mode') = 'apply' as apply \gset
\if :apply
  commit;
  \echo 'Applied: unified onboarding and the migration record were removed.'
\else
  rollback;
  \echo 'Check only: every check and the removal succeeded inside the transaction, and all of it was rolled back. Nothing changed.'
\endif
