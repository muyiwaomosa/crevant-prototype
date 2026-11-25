-- Unified account and progressive onboarding (IP-9a).
--
-- One account, one registration. Creating, consuming and advertising are
-- capabilities of every member, never separate account types:
--   * Creator setup: up to three posting topics, which make a member eligible
--     for creator suggestions (DSC-04). Publishing also makes a member
--     eligible, so nobody who posts is hidden from discovery.
--   * Personalized invitations: every member's own referral link is their
--     invitation link. After joining, the new member sees who invited them and
--     may follow them (never automatically).
--   * Founder registration tools: invitation links (optionally attributed to a
--     creator), the list of links, and revoking a link. Pausing and the limits
--     already exist (app_founder_set_registration).
--   * Advertising requests: any member can ask to advertise from their own
--     account; the request is an advertiser record waiting for the founder's
--     managed onboarding and approval. Approved advertisers see aggregate
--     reports of their own campaigns only, with the same privacy thresholds.
--
-- Nothing here is callable by visitors (anon), and nothing changes registration
-- eligibility, the launch gate, rewards or advertising matching.

-- ---------------------------------------------------------------------------
-- 1. Creator posting topics

create table social.creator_topics (
  user_id   uuid not null references public.profiles (id) on delete cascade,
  topic     text not null references social.topics (slug),
  added_at  timestamptz not null default pg_catalog.now(),
  primary key (user_id, topic)
);
create index creator_topics_by_topic on social.creator_topics (topic, user_id);
comment on table social.creator_topics is 'What each member posts about (at most 3), from social.topics. Optional; makes the member eligible for creator suggestions. Written only through public.app_set_creator_topics.';
alter table social.creator_topics enable row level security;
revoke all on table social.creator_topics from public, anon, authenticated;
grant all on table social.creator_topics to service_role;

create function public.app_set_creator_topics(p_topics text[])
returns text[]
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := social.current_member();
  v_topics text[] := coalesce((select array_agg(distinct pg_catalog.btrim(t)) from unnest(coalesce(p_topics, '{}')) t
                               where pg_catalog.btrim(t) <> ''), '{}');
begin
  if cardinality(v_topics) > 3 then
    raise exception 'too_many_topics' using errcode = 'P0001';
  end if;
  if exists (select 1 from unnest(v_topics) t where not exists (select 1 from social.topics s where s.slug = t and s.active)) then
    raise exception 'invalid_topic' using errcode = 'P0001';
  end if;
  delete from social.creator_topics where user_id = v_uid and topic <> all (v_topics);
  insert into social.creator_topics (user_id, topic) select v_uid, t from unnest(v_topics) t on conflict do nothing;
  return (select coalesce(array_agg(c.topic order by s.sort_order), '{}') from social.creator_topics c
          join social.topics s on s.slug = c.topic where c.user_id = v_uid);
end;
$$;
comment on function public.app_set_creator_topics(text[]) is 'Sets what the member posts about (at most 3 active topics). Optional; never restricts anything.';

-- The member's own creator setup progress: posting topics, posts, followers
-- and how many people joined through their invitation link.
create function public.app_my_creator_setup()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := social.current_member();
begin
  return pg_catalog.jsonb_build_object(
    'posting_topics', (select coalesce(pg_catalog.jsonb_agg(c.topic order by s.sort_order), '[]'::jsonb)
                       from social.creator_topics c join social.topics s on s.slug = c.topic where c.user_id = v_uid and s.active),
    'posts', (select count(*) from social.posts p where p.author_id = v_uid and p.deleted_at is null),
    'followers', (select count(*) from social.follows f where f.creator_id = v_uid),
    'joined_through_my_link', (select count(*) from ops.registrations r where r.referrer_id = v_uid));
end;
$$;
comment on function public.app_my_creator_setup() is 'The member''s own creator setup: posting topics, post and follower counts, and how many joined through their invitation link.';

-- What a visible member posts about (hidden profile details hide it too).
create function public.app_member_creator_topics(p_member uuid)
returns text[]
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := social.current_member();
begin
  return (select coalesce(array_agg(c.topic order by s.sort_order), '{}')
          from social.visible_members p
          join social.creator_topics c on c.user_id = p.id
          join social.topics s on s.slug = c.topic and s.active
          left join social.profile_details d on d.user_id = p.id
          where p.id = p_member and d.hidden_at is null);
end;
$$;
comment on function public.app_member_creator_topics(uuid) is 'What a visible member posts about (at most 3).';

-- Creator suggestions: members who chose posting topics or who have published.
-- Members who only read are not suggested as creators. Ranked by how well
-- their posting topics (or, failing those, interests) match the caller's
-- interests. Same columns as before; topics are now the posting topics when
-- the member chose any.
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
  with c as (
    select p.id, p.username, p.display_name, d.identity, d.bio, d.follow_reason, d.hidden_at,
           (select array_agg(ct.topic order by t.sort_order) from social.creator_topics ct
            join social.topics t on t.slug = ct.topic and t.active where ct.user_id = p.id) as posting,
           (select array_agg(m.topic order by t.sort_order) from social.member_topics m
            join social.topics t on t.slug = m.topic and t.active where m.user_id = p.id) as interests,
           (select count(*) from social.posts s where s.author_id = p.id and s.deleted_at is null) as posts,
           (select max(s.created_at) from social.posts s where s.author_id = p.id and s.deleted_at is null) as last_post
    from social.visible_members p
    left join social.profile_details d on d.user_id = p.id
    where p.id <> v_uid
      and not exists (select 1 from social.follows f where f.follower_id = v_uid and f.creator_id = p.id)
  )
  select c.id, c.username, c.display_name,
         case when c.hidden_at is null then c.identity end,
         case when c.hidden_at is null then c.bio end,
         case when c.hidden_at is null then c.follow_reason end,
         case when c.hidden_at is null then coalesce(c.posting, c.interests, '{}') else '{}'::text[] end,
         case when c.hidden_at is null then
           (select count(*)::integer from unnest(coalesce(c.posting, c.interests, '{}')) x
            where exists (select 1 from social.member_topics mine where mine.user_id = v_uid and mine.topic = x))
         else 0 end as shared,
         c.posts,
         (select count(*) from social.follows f where f.creator_id = c.id)
  from c
  where (c.posting is not null and c.hidden_at is null) or c.posts > 0
  order by shared desc,
           (c.posting is not null and c.hidden_at is null) desc,
           (c.hidden_at is null and c.follow_reason is not null) desc,
           c.last_post desc nulls last,
           c.username
  limit least(greatest(coalesce(p_limit, 10), 1), 20);
end;
$$;
comment on function public.app_suggested_creators(integer) is 'Visible members who chose posting topics or have published, the caller does not follow yet, best topic match first. Ranking only: grants nothing.';

-- ---------------------------------------------------------------------------
-- 2. Who invited me (shown once in setup, with Follow and Not now)

create function public.app_my_inviter()
returns table (id uuid, username text, display_name text, following boolean, posting_topics text[])
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
         exists (select 1 from social.follows f where f.follower_id = v_uid and f.creator_id = p.id),
         (select coalesce(array_agg(ct.topic order by t.sort_order), '{}') from social.creator_topics ct
          join social.topics t on t.slug = ct.topic and t.active where ct.user_id = p.id)
  from ops.registrations r
  join social.visible_members p on p.id = coalesce(r.referrer_id, r.creator_id)
  where r.user_id = v_uid and p.id <> v_uid;
end;
$$;
comment on function public.app_my_inviter() is 'The member whose invitation brought the caller here, if still visible. Following is always the caller''s own choice.';

-- ---------------------------------------------------------------------------
-- 3. Founder registration and invitation tools (BRD-07)

create function public.app_founder_create_creator_invitation(p_creator_username text, p_max_uses integer, p_days integer)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := social.current_founder();
  v_creator uuid;
begin
  if p_days is null or p_days not between 1 and 366 then
    raise exception 'invalid_expiry' using errcode = 'P0001';
  end if;
  if p_max_uses is not null and p_max_uses not between 1 and 10000 then
    raise exception 'invalid_max_uses' using errcode = 'P0001';
  end if;
  select l.id into v_creator from social.listed_members l where l.username = lower(pg_catalog.btrim(coalesce(p_creator_username, '')));
  if v_creator is null then
    raise exception 'unknown_member' using errcode = 'P0001';
  end if;
  return ops.create_invitation_link('founder:' || v_uid::text, 'fan', p_max_uses, pg_catalog.make_interval(days => p_days), v_creator);
end;
$$;
comment on function public.app_founder_create_creator_invitation(text, integer, integer) is 'Founder: an invitation link attributed to a creator, for inviting their existing audience. New members see who invited them and choose whether to follow.';

create function public.app_founder_invitation_links()
returns table (code text, creator_username text, cohort text, uses integer, max_uses integer, expires_at timestamptz,
               revoked_at timestamptz, created_at timestamptz, registered bigint)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := social.current_founder();
begin
  return query
  select l.code, p.username, l.cohort, l.uses, l.max_uses, l.expires_at, l.revoked_at, l.created_at,
         (select count(*) from ops.registrations r where r.link_id = l.id)
  from ops.registration_links l
  left join public.profiles p on p.id = l.creator_id
  where l.kind = 'invitation'
  order by l.created_at desc
  limit 200;
end;
$$;
comment on function public.app_founder_invitation_links() is 'Founder: the invitation links (never members'' personal links), newest first, with how many joined through each.';

create function public.app_founder_revoke_invitation_link(p_code text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := social.current_founder();
begin
  update ops.registration_links set revoked_at = pg_catalog.now()
  where code = lower(pg_catalog.btrim(coalesce(p_code, ''))) and kind = 'invitation' and revoked_at is null;
  if not found then
    raise exception 'not_found' using errcode = 'P0001';
  end if;
end;
$$;
comment on function public.app_founder_revoke_invitation_link(text) is 'Founder: stops an invitation link working. People who already joined keep their membership.';

-- ---------------------------------------------------------------------------
-- 4. Advertising requests from the member's own account

alter table ads.advertisers
  add column requested_by uuid references auth.users (id) on delete set null,
  add column requested_at timestamptz;
create unique index advertisers_one_open_request on ads.advertisers (requested_by) where status = 'pending' and requested_by is not null;
comment on column ads.advertisers.requested_by is 'The member who asked to advertise from their own account (null for advertisers the founder onboarded directly). Grants nothing until the founder approves.';

create function public.app_request_advertising(p jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := social.current_member();
  v_id uuid;
  v_categories text[] := ads.text_array(p->'categories');
begin
  if exists (select 1 from ads.advertisers a where a.requested_by = v_uid and a.status = 'pending') then
    raise exception 'request_pending' using errcode = 'P0001';
  end if;
  if (select count(*) from ads.advertisers a where a.requested_by = v_uid and a.requested_at > pg_catalog.now() - interval '30 days') >= 3 then
    raise exception 'rate_limited' using errcode = 'P0001';
  end if;
  if exists (select 1 from unnest(v_categories) c where not exists (select 1 from ads.categories k where k.slug = c)) then
    raise exception 'invalid_ad_category' using errcode = 'P0001';
  end if;
  insert into ads.advertisers (name, website, offering, problem_solved, desired_outcome, customer_needs, objective, conversion_action,
                               eligibility_notes, categories, requested_by, requested_at)
  values (pg_catalog.btrim(p->>'name'), pg_catalog.btrim(p->>'website'), pg_catalog.btrim(p->>'offering'), pg_catalog.btrim(p->>'problem_solved'),
          pg_catalog.btrim(p->>'desired_outcome'), pg_catalog.btrim(p->>'customer_needs'), p->>'objective', pg_catalog.btrim(p->>'conversion_action'),
          nullif(pg_catalog.btrim(coalesce(p->>'eligibility_notes', '')), ''), v_categories, v_uid, pg_catalog.now())
  returning id into v_id;
  return v_id;
exception
  when check_violation or not_null_violation then
    raise exception 'invalid_request' using errcode = 'P0001', detail = 'Fill in every field (the website starts with https://).';
end;
$$;
comment on function public.app_request_advertising(jsonb) is 'A member asks to advertise: business, offering, problem, desired outcome, customer needs, objective and conversion action. Waits for the founder''s managed onboarding and approval; one open request at a time.';

create function public.app_my_advertising()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := social.current_member();
begin
  return pg_catalog.jsonb_build_object(
    'requests', coalesce((select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
                  'id', a.id, 'name', a.name, 'status', a.status, 'review_note', a.review_note, 'objective', a.objective,
                  'requested_at', a.requested_at, 'reviewed_at', a.reviewed_at) order by a.requested_at desc)
                from ads.advertisers a where a.requested_by = v_uid), '[]'::jsonb),
    'campaigns', coalesce((select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
                  'id', c.id, 'name', c.name, 'advertiser', a.name, 'status', c.status, 'starts_on', c.starts_on, 'ends_on', c.ends_on,
                  'placement', c.placement) order by c.created_at desc)
                from ads.campaigns c join ads.advertisers a on a.id = c.advertiser_id
                where a.requested_by = v_uid and a.status = 'approved'), '[]'::jsonb));
end;
$$;
comment on function public.app_my_advertising() is 'The member''s own advertising requests and, once approved, their campaigns. Nothing about other advertisers or members.';

-- The campaign report, shared by the founder and the advertiser. Aggregate
-- only; groups under 10 are withheld.
create function ads.campaign_report(p_campaign uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
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

create or replace function public.app_founder_campaign_report(p_campaign uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := social.current_founder();
begin
  return ads.campaign_report(p_campaign);
end;
$$;

-- The advertiser's own report: the same aggregate figures, with feedback
-- counts also withheld under 10 and nothing about satisfaction notes.
create function public.app_my_campaign_report(p_campaign uuid)
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
comment on function public.app_my_campaign_report(uuid) is 'An approved advertiser''s aggregate report for one of their own campaigns. Groups under 10 withheld; never a member.';

-- The founder's advertising page also shows who asked, and when.
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
    'advertisers', coalesce((select pg_catalog.jsonb_agg(pg_catalog.to_jsonb(a) || pg_catalog.jsonb_build_object('requested_by_username', p.username)
                                                         order by a.created_at desc)
                             from ads.advertisers a left join public.profiles p on p.id = a.requested_by), '[]'::jsonb),
    'campaigns', coalesce((select pg_catalog.jsonb_agg(pg_catalog.to_jsonb(c) || pg_catalog.jsonb_build_object('advertiser', a.name) order by c.created_at desc)
                           from ads.campaigns c join ads.advertisers a on a.id = c.advertiser_id), '[]'::jsonb),
    'categories', (select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('slug', c.slug, 'label', c.label) order by c.sort_order) from ads.categories c),
    'topics', (select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('slug', t.slug, 'label', t.label) order by t.sort_order)
               from social.topics t where not ads.topic_is_sensitive(t.slug)),
    'creatives', ads.creative_files());
end;
$$;

-- ---------------------------------------------------------------------------
-- 5. Privileges

revoke all on all functions in schema ads from public, anon, authenticated;

do $$
declare
  f text;
begin
  foreach f in array array[
    'public.app_set_creator_topics(text[])',
    'public.app_my_creator_setup()',
    'public.app_member_creator_topics(uuid)',
    'public.app_suggested_creators(integer)',
    'public.app_my_inviter()',
    'public.app_founder_create_creator_invitation(text, integer, integer)',
    'public.app_founder_invitation_links()',
    'public.app_founder_revoke_invitation_link(text)',
    'public.app_request_advertising(jsonb)',
    'public.app_my_advertising()',
    'public.app_founder_campaign_report(uuid)',
    'public.app_my_campaign_report(uuid)',
    'public.app_founder_ads()'
  ] loop
    execute pg_catalog.format('revoke all on function %s from public, anon', f);
    execute pg_catalog.format('grant execute on function %s to authenticated', f);
  end loop;
end;
$$;
