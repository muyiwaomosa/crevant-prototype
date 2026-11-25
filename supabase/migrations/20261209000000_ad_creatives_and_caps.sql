-- Advertising creatives and the restoration cap (founder decisions of
-- November 25, 2026). Review guides: docs/ADVERTISING.md, docs/REWARDS.md.
--
-- 1. Restored Connection Points no longer use up daily earning capacity. A
--    restoration (source key restored:...) corrects an earlier ledger entry;
--    it is not a new contribution, so the daily caps ignore it. Duplicate
--    prevention (the unique source key), the monthly redeemable budget and
--    the append-only ledger are unchanged; only server code can create a
--    restored: entry.
-- 2. Image and simple video ads (ADV-06), with managed onboarding: the
--    founder uploads the file to the public ad-creatives bucket (Supabase
--    dashboard; JPEG, PNG or WebP images, MP4 video, at most 8 MB) and picks
--    it for the campaign, with a text alternative. A campaign cannot be
--    activated until its file exists with the right type. Creatives are
--    served from Splitpost's own storage, so advertisers never see who looked.
--    Video plays (3 seconds) and completions are measured once each, after a
--    valid view. The bucket holds advertising creative only: no member data,
--    and members can't write to it.

-- ---------------------------------------------------------------------------
-- 1. Restorations and daily caps

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


-- ---------------------------------------------------------------------------
-- 2. Creatives

do $$
begin
  if pg_catalog.to_regclass('storage.buckets') is not null then
    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    values ('ad-creatives', 'ad-creatives', true, 8388608, array['image/jpeg', 'image/png', 'image/webp', 'video/mp4']);
  end if;
end;
$$;

alter table ads.campaigns add column creative_kind text not null default 'text' check (creative_kind in ('text', 'image', 'video'));
alter table ads.campaigns add column media_path text check (media_path is null or media_path ~ '^[A-Za-z0-9][A-Za-z0-9._/-]{0,199}$');
alter table ads.campaigns add column media_alt text check (media_alt is null or char_length(media_alt) between 1 and 250);
alter table ads.campaigns add constraint campaigns_media_complete
  check (creative_kind = 'text' or (media_path is not null and media_alt is not null));
comment on column ads.campaigns.media_path is 'The creative''s object path in the public ad-creatives bucket (image or video campaigns).';
comment on column ads.campaigns.media_alt is 'The text alternative read to people who can''t see the image or video.';

alter table ads.impressions add column played_at timestamptz;
alter table ads.impressions add column completed_at timestamptz;

-- The files uploaded to the ad-creatives bucket (empty where storage isn't installed).
create function ads.creative_files()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v jsonb;
begin
  if pg_catalog.to_regclass('storage.objects') is null then
    return '[]'::jsonb;
  end if;
  execute $q$select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('path', o.name, 'type', o.metadata->>'mimetype',
                                     'bytes', (o.metadata->>'size')::bigint) order by o.created_at desc), '[]'::jsonb)
             from storage.objects o where o.bucket_id = 'ad-creatives'$q$ into v;
  return v;
end;
$$;

-- Whether a campaign's creative is ready: text, or its file exists with the right type.
create function ads.creative_ready(p_campaign uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  c ads.campaigns%rowtype;
  v_type text;
begin
  select * into c from ads.campaigns where id = p_campaign;
  if not found then
    return false;
  end if;
  if c.creative_kind = 'text' then
    return true;
  end if;
  if pg_catalog.to_regclass('storage.objects') is null then
    return false;
  end if;
  execute $q$select o.metadata->>'mimetype' from storage.objects o where o.bucket_id = 'ad-creatives' and o.name = $1$q$ into v_type using c.media_path;
  -- A missing file (no type) is never ready.
  return coalesce(case c.creative_kind when 'image' then v_type in ('image/jpeg', 'image/png', 'image/webp') else v_type = 'video/mp4' end, false);
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
     or (old.feedback is not null and new.feedback is distinct from old.feedback)
     or (old.played_at is not null and new.played_at is distinct from old.played_at)
     or (old.completed_at is not null and new.completed_at is distinct from old.completed_at) then
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
  if p_kind is null or p_kind not in ('view', 'click', 'play', 'complete', 'relevant', 'not_relevant', 'hidden', 'reported') then
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
  elsif p_kind = 'play' then
    -- A video ad played (3 seconds), only after a valid view, once.
    update ads.impressions set played_at = pg_catalog.now()
    where id = i.id and viewed_at is not null and played_at is null
      and exists (select 1 from ads.campaigns c where c.id = i.campaign_id and c.creative_kind = 'video');
  elsif p_kind = 'complete' then
    -- Played to the end, only after a play, once.
    update ads.impressions set completed_at = pg_catalog.now() where id = i.id and played_at is not null and completed_at is null;
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
               match text, matched text, placement text, creative_kind text, media_path text, media_alt text)
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
  select v_id, a.name, c.headline, c.body, c.cta_label, c.landing_url, v_pick.match, v_pick.matched, p_surface,
         c.creative_kind, c.media_path, c.media_alt
  from ads.campaigns c join ads.advertisers a on a.id = c.advertiser_id
  where c.id = v_pick.campaign_id;
end;
$$;

comment on function public.app_ad_for(text, uuid) is 'One ad for a surface, matched by rules (a declared commercial preference, then the non-sensitive topic of the post, then a non-personalized ad if allowed), or none. Never uses content interests. Records the served ad. Image and video creatives come from the public ad-creatives bucket.';
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
                               headline, body, cta_label, landing_url, creative_kind, media_path, media_alt)
    values ((p->>'advertiser_id')::uuid, pg_catalog.btrim(p->>'name'), p->>'placement', ads.text_array(p->'categories'), ads.text_array(p->'context_topics'),
            coalesce((p->>'allow_general')::boolean, false), (p->>'starts_on')::date, (p->>'ends_on')::date, coalesce((p->>'daily_cap')::integer, 3),
            coalesce((p->>'price_cents')::bigint, 0), pg_catalog.btrim(p->>'headline'), pg_catalog.btrim(p->>'body'), pg_catalog.btrim(p->>'cta_label'),
            pg_catalog.btrim(p->>'landing_url'), coalesce(nullif(p->>'creative_kind', ''), 'text'),
            nullif(pg_catalog.btrim(coalesce(p->>'media_path', '')), ''), nullif(pg_catalog.btrim(coalesce(p->>'media_alt', '')), ''))
    returning id into v_id;
  else
    update ads.campaigns set name = pg_catalog.btrim(p->>'name'), placement = p->>'placement', categories = ads.text_array(p->'categories'),
           context_topics = ads.text_array(p->'context_topics'), allow_general = coalesce((p->>'allow_general')::boolean, false),
           starts_on = (p->>'starts_on')::date, ends_on = (p->>'ends_on')::date, daily_cap = coalesce((p->>'daily_cap')::integer, 3),
           price_cents = coalesce((p->>'price_cents')::bigint, 0), headline = pg_catalog.btrim(p->>'headline'), body = pg_catalog.btrim(p->>'body'),
           cta_label = pg_catalog.btrim(p->>'cta_label'), landing_url = pg_catalog.btrim(p->>'landing_url'),
           creative_kind = coalesce(nullif(p->>'creative_kind', ''), 'text'),
           media_path = nullif(pg_catalog.btrim(coalesce(p->>'media_path', '')), ''), media_alt = nullif(pg_catalog.btrim(coalesce(p->>'media_alt', '')), '')
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
  -- An image or video campaign needs its file uploaded first, of the right type.
  if p_status = 'active' and not ads.creative_ready(p_campaign) then
    raise exception 'creative_missing' using errcode = 'P0001', detail = 'Upload the image or video to the ad-creatives bucket first (JPEG, PNG or WebP image, or MP4 video up to 8 MB).';
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
      'creative_kind', c.creative_kind,
      'video_plays', (select count(*) from i where played_at is not null),
      'video_completions', (select count(*) from i where completed_at is not null),
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
               from social.topics t where not ads.topic_is_sensitive(t.slug)),
    'creatives', ads.creative_files());
end;
$$;


revoke all on all functions in schema ads from public, anon, authenticated;
