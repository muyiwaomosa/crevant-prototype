-- Staging only: undoes 20261209000000 (ad creatives and the restoration
-- cap). Never run it against a Production project. Tested locally by
-- scripts/db/rollback-ad-creatives-test.sh.
--
--   psql "<url>" -X -q -v ON_ERROR_STOP=1 -v mode=check -v confirm= -f scripts/db/staging-rollback-ad-creatives.sql
--   psql "<url>" -X -q -v ON_ERROR_STOP=1 -v mode=apply -v confirm='REMOVE THE STAGING AD CREATIVES' -f ...
--
-- Puts back the 20261205000000 and 20261208000000 definitions of the seven
-- functions it changed and removes its columns, helpers and bucket. Refuses,
-- changing nothing, while any image or video campaign, uploaded creative or
-- video play exists, if the record or an expected object is missing, or a
-- later migration exists.

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
     and current_setting('crevant.rollback_confirm') <> 'REMOVE THE STAGING AD CREATIVES' then
    raise exception 'apply needs the confirmation phrase: REMOVE THE STAGING AD CREATIVES';
  end if;
  if to_regclass('supabase_migrations.schema_migrations') is null then
    raise exception 'refused: no Supabase migration history here (supabase_migrations.schema_migrations)';
  end if;
  if not exists (select 1 from supabase_migrations.schema_migrations where version = '20261209000000')
     or to_regprocedure('ads.creative_ready(uuid)') is null then
    raise exception 'refused: expected objects are missing (20261209000000 ad creatives), so the database is not in the state this rollback was written for';
  end if;
  if exists (select 1 from supabase_migrations.schema_migrations where version > '20261209000000') then
    raise exception 'refused, nothing changed: a later migration is recorded';
  end if;
end $$;

lock table ads.campaigns, ads.impressions in share row exclusive mode;

do $$
declare
  n bigint;
  f bigint := 0;
begin
  if to_regclass('storage.objects') is not null then
    execute $q$select count(*) from storage.objects where bucket_id = 'ad-creatives'$q$ into f;
  end if;
  n := (select count(*) from ads.campaigns where creative_kind <> 'text') + (select count(*) from ads.impressions where played_at is not null) + f;
  if n > 0 then
    raise exception 'refused, nothing changed: % rows of data depend on ad creatives (image or video campaigns, uploaded files, video plays). Fix forward instead.', n;
  end if;
end $$;

\echo 'Checks passed. Removing ad creatives and the migration record.'

-- The earlier definitions, unchanged.
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
      and l.created_at > pg_catalog.date_trunc('day', pg_catalog.now());
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

create or replace function ads.impressions_once()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'impressions are kept for reporting';
  end if;
  -- Only the observation columns may change, each from empty to a value once.
  -- (member_id and creator_id may also become null when an account is deleted.)
  if new.id <> old.id or new.campaign_id <> old.campaign_id or new.surface <> old.surface
     or new.post_id is distinct from old.post_id or new.match <> old.match
     or new.matched is distinct from old.matched or new.served_at <> old.served_at
     or (new.member_id is distinct from old.member_id and new.member_id is not null)
     or (new.creator_id is distinct from old.creator_id and new.creator_id is not null)
     or (old.viewed_at is not null and new.viewed_at is distinct from old.viewed_at)
     or (old.clicked_at is not null and new.clicked_at is distinct from old.clicked_at)
     or (old.feedback is not null and new.feedback is distinct from old.feedback) then
    raise exception 'impressions: each observation is recorded once';
  end if;
  return new;
end;
$$;

create or replace function public.app_ad_event(p_impression uuid, p_kind text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := social.current_member();
  i ads.impressions%rowtype;
begin
  if p_kind is null or p_kind not in ('view', 'click', 'relevant', 'not_relevant', 'hidden', 'reported') then
    raise exception 'invalid_request' using errcode = 'P0001';
  end if;
  select * into i from ads.impressions where id = p_impression and member_id = v_uid for update;
  if not found then
    raise exception 'not_found' using errcode = 'P0001';
  end if;
  if p_kind = 'view' then
    update ads.impressions set viewed_at = pg_catalog.now() where id = i.id and viewed_at is null;
  elsif p_kind = 'click' then
    -- Only after a valid view, and once.
    update ads.impressions set clicked_at = pg_catalog.now() where id = i.id and viewed_at is not null and clicked_at is null;
  else
    update ads.impressions set feedback = p_kind, feedback_at = pg_catalog.now() where id = i.id and feedback is null;
    if p_kind in ('hidden', 'reported') then
      insert into ads.exclusions (member_id, kind, target) values (v_uid, 'campaign', i.campaign_id::text) on conflict do nothing;
    end if;
  end if;
end;
$$;

drop function public.app_ad_for(text, uuid);
create function public.app_ad_for(p_surface text, p_post uuid default null)
returns table (impression_id uuid, advertiser text, headline text, body text, cta_label text, landing_url text,
               match text, matched text, placement text)
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
  -- At most 20 ads a day and one every 20 seconds for a member.
  if (select count(*) from ads.impressions i where i.member_id = v_uid and i.served_at > pg_catalog.date_trunc('day', pg_catalog.now())) >= 20
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
  select v_id, a.name, c.headline, c.body, c.cta_label, c.landing_url, v_pick.match, v_pick.matched, p_surface
  from ads.campaigns c join ads.advertisers a on a.id = c.advertiser_id
  where c.id = v_pick.campaign_id;
end;
$$;

comment on function public.app_ad_for(text, uuid) is 'One ad for a surface, matched by rules (a declared commercial preference, then the non-sensitive topic of the post, then a non-personalized ad if allowed), or none. Never uses content interests. Records the served ad.';
revoke all on function public.app_ad_for(text, uuid) from public, anon;
grant execute on function public.app_ad_for(text, uuid) to authenticated;

create or replace function public.app_founder_save_campaign(p jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := social.current_founder();
  v_id uuid := nullif(p->>'id', '')::uuid;
begin
  if v_id is null then
    insert into ads.campaigns (advertiser_id, name, placement, categories, context_topics, allow_general, starts_on, ends_on, daily_cap, price_cents,
                               headline, body, cta_label, landing_url)
    values ((p->>'advertiser_id')::uuid, pg_catalog.btrim(p->>'name'), p->>'placement', ads.text_array(p->'categories'), ads.text_array(p->'context_topics'),
            coalesce((p->>'allow_general')::boolean, false), (p->>'starts_on')::date, (p->>'ends_on')::date, coalesce((p->>'daily_cap')::integer, 3),
            coalesce((p->>'price_cents')::bigint, 0), pg_catalog.btrim(p->>'headline'), pg_catalog.btrim(p->>'body'), pg_catalog.btrim(p->>'cta_label'),
            pg_catalog.btrim(p->>'landing_url'))
    returning id into v_id;
  else
    update ads.campaigns set name = pg_catalog.btrim(p->>'name'), placement = p->>'placement', categories = ads.text_array(p->'categories'),
           context_topics = ads.text_array(p->'context_topics'), allow_general = coalesce((p->>'allow_general')::boolean, false),
           starts_on = (p->>'starts_on')::date, ends_on = (p->>'ends_on')::date, daily_cap = coalesce((p->>'daily_cap')::integer, 3),
           price_cents = coalesce((p->>'price_cents')::bigint, 0), headline = pg_catalog.btrim(p->>'headline'), body = pg_catalog.btrim(p->>'body'),
           cta_label = pg_catalog.btrim(p->>'cta_label'), landing_url = pg_catalog.btrim(p->>'landing_url')
    where id = v_id;
    if not found then
      raise exception 'not_found' using errcode = 'P0001';
    end if;
  end if;
  return v_id;
exception
  when check_violation or not_null_violation or invalid_text_representation or foreign_key_violation then
    raise exception 'invalid_request' using errcode = 'P0001', detail = 'Check every campaign field (dates, https:// link, lengths).';
end;
$$;

create or replace function public.app_founder_set_campaign_status(p_campaign uuid, p_status text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := social.current_founder();
begin
  if p_status is null or p_status not in ('draft', 'active', 'paused', 'completed') then
    raise exception 'invalid_request' using errcode = 'P0001';
  end if;
  if p_status = 'active' and not exists (select 1 from ads.campaigns c join ads.advertisers a on a.id = c.advertiser_id
                                         where c.id = p_campaign and a.status = 'approved') then
    raise exception 'advertiser_not_approved' using errcode = 'P0001', detail = 'Approve the advertiser before activating a campaign.';
  end if;
  update ads.campaigns set status = p_status where id = p_campaign;
  if not found then
    raise exception 'not_found' using errcode = 'P0001';
  end if;
end;
$$;

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
      'content_impressions', (select count(*) from i where viewed_at is not null and surface = 'content'),
      'feed_impressions', (select count(*) from i where viewed_at is not null and surface = 'feed'),
      'verified_conversions', coalesce((select sum(v.verified) from ads.conversions v where v.campaign_id = c.id), 0),
      'advertiser_satisfaction', (select f.satisfaction from ads.advertiser_feedback f where f.campaign_id = c.id),
      'simulated_revenue_cents', coalesce((select sum(r.net_cents) from ads.revenue_attributions r where r.campaign_id = c.id), 0)));
end;
$$;

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
               from social.topics t where not ads.topic_is_sensitive(t.slug)));
end;
$$;

drop function ads.creative_ready(uuid);
drop function ads.creative_files();
alter table ads.impressions drop column completed_at;
alter table ads.impressions drop column played_at;
alter table ads.campaigns drop constraint campaigns_daily_cap_check;
alter table ads.campaigns add constraint campaigns_daily_cap_check check (daily_cap between 1 and 10);
alter table ads.campaigns drop constraint campaigns_media_complete;
alter table ads.campaigns drop column media_alt;
alter table ads.campaigns drop column media_path;
alter table ads.campaigns drop column creative_kind;
do $$
begin
  if pg_catalog.to_regclass('storage.buckets') is not null then
    -- Supabase's own switch for direct deletes, for this transaction only: the
    -- bucket is empty (checked above), so nothing is orphaned.
    perform pg_catalog.set_config('storage.allow_delete_query', 'true', true);
    delete from storage.buckets where id = 'ad-creatives';
  end if;
end;
$$;
revoke all on all functions in schema ads from public, anon, authenticated;

delete from supabase_migrations.schema_migrations where version = '20261209000000';

select current_setting('crevant.rollback_mode') = 'apply' as apply \gset
\if :apply
  commit;
  \echo 'Applied: ad creatives and the migration record were removed.'
\else
  rollback;
  \echo 'Check only: every check and the removal succeeded inside the transaction, and all of it was rolled back. Nothing changed.'
\endif
