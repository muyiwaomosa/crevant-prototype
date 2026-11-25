-- IP-4c (founder decisions of November 25, 2026): fair discovery rotation,
-- privacy-preserving search measurement, and public content previews.
-- Review guide: docs/PREVIEWS.md.
--
-- 1. Fair rotation (DSC-08). For you now shows each eligible creator's newest
--    post before anyone's second, and orders creators by a rotation that
--    changes daily (not by how recently or how often they post). A creator
--    who posts once a week has the same chance to lead as one who posts
--    hourly. Still within 30 days, still at most two per creator, still no
--    popularity signal.
-- 2. Search measurement (founder: no individual search history). One table
--    of daily counts: searches, searches with results, results opened, per
--    surface and, where the search matched an approved topic, that topic.
--    No words, no member, no results are stored. Search-to-follow conversion
--    comes from follows whose source is the new 'search' (follow history
--    already exists; nothing new is kept about the member).
-- 3. Public previews (CNT-11, a limited exception to "visitors can call
--    nothing"). One read-only function, public.app_public_post, callable
--    without signing in. It returns only: the post's text, time and topic,
--    whether it has a photo (never the photo), and the creator's username
--    and display name. Only when previews are switched on
--    (ops.public_preview_settings, OFF by default on every database), the
--    post is live and not hidden, has no open report, its creator is an
--    active member who has explicitly chosen to allow previews (opt-in,
--    after reading what a preview shows; nothing is public by default), and
--    it has text. Rate
--    limited overall and per post. Visits are counted per day, post and
--    referral link (no visitor identity), preserving referral attribution
--    for the contribution work. Nothing else is opened to visitors.

-- ---------------------------------------------------------------------------
-- 1. Fair rotation

create or replace function public.app_discover_content(p_topic text default null, p_limit integer default 30)
returns table (
  id uuid, author_id uuid, author_username text, author_display_name text,
  body text, created_at timestamptz, like_count bigint, comment_count bigint,
  liked_by_me boolean, author_in_my_clique boolean, is_mine boolean, media jsonb,
  topic text, topic_label text, reason text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := social.current_member();
  v_has_interests boolean;
  v_day text := pg_catalog.to_char(pg_catalog.now() at time zone 'utc', 'YYYY-MM-DD');
begin
  if p_topic is not null and not exists (select 1 from social.topics t where t.slug = p_topic and t.active) then
    raise exception 'unknown_topic' using errcode = 'P0001';
  end if;
  v_has_interests := exists (select 1 from social.member_topics mt where mt.user_id = v_uid);
  return query
  with eligible as (
    select s.id, s.author_id, s.created_at, s.topic,
           pg_catalog.row_number() over (partition by s.author_id order by s.created_at desc, s.id desc) as nth
    from social.posts s
    where s.deleted_at is null
      and s.topic is not null
      and s.author_id <> v_uid
      and s.created_at > pg_catalog.now() - interval '30 days'
      and not exists (select 1 from social.follows f where f.follower_id = v_uid and f.creator_id = s.author_id)
      and not exists (select 1 from social.mutes mu where mu.member_id = v_uid and mu.creator_id = s.author_id)
      and case
            when p_topic is not null then s.topic = p_topic
            when v_has_interests then exists (select 1 from social.member_topics mt where mt.user_id = v_uid and mt.topic = s.topic)
            else true
          end
  )
  select s.id, s.author_id, p.username, p.display_name, s.body, s.created_at,
         (select count(*) from social.likes l where l.post_id = s.id),
         (select count(*) from social.comments c where c.post_id = s.id and c.deleted_at is null),
         exists (select 1 from social.likes l where l.post_id = s.id and l.user_id = v_uid),
         false,
         false,
         social.post_media_json(s.id),
         s.topic, t.label,
         case
           when p_topic is not null then 'In ' || t.label || ', the topic you chose'
           when v_has_interests then 'Because you''re interested in ' || t.label
           else 'New in ' || t.label || '. Choose interests to tailor this'
         end
  from eligible e
  join social.posts s on s.id = e.id
  join social.visible_members p on p.id = s.author_id
  join social.topics t on t.slug = s.topic
  where e.nth <= 2
  -- Every creator's newest post first (round one), then second posts; within
  -- a round, a daily rotation of creators, so frequency and recency of
  -- posting don't decide who leads.
  order by e.nth, pg_catalog.md5(s.author_id::text || v_day), s.created_at desc, s.id
  limit least(greatest(coalesce(p_limit, 30), 1), 50);
end;
$$;
comment on function public.app_discover_content(text, integer) is 'Discover: recent categorized posts (30 days) from members the viewer doesn''t follow, in the viewer''s interests or one chosen topic, with reasons. Fair rotation: each creator''s newest post before anyone''s second, creators in a daily rotation; at most two per creator; no popularity signal.';

-- ---------------------------------------------------------------------------
-- 2. Search measurement

alter table social.follow_events drop constraint follow_events_source;
alter table social.follow_events add constraint follow_events_source
  check (source is null or (action = 'followed' and source in ('profile', 'discover', 'post', 'catch_up', 'comment', 'search', 'other')));

-- Follows from search results record 'search' as their source.
create or replace function public.app_follow(p_creator uuid, p_source text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := social.current_member();
begin
  if p_creator is null or p_creator = v_uid then
    raise exception 'cannot_follow_self' using errcode = 'P0001';
  end if;
  if p_source is not null and p_source not in ('profile', 'discover', 'post', 'catch_up', 'comment', 'search', 'other') then
    raise exception 'invalid_request' using errcode = 'P0001';
  end if;
  if not social.is_member(p_creator) then
    raise exception 'not_found' using errcode = 'P0001';
  end if;
  if exists (select 1 from social.follows where follower_id = v_uid and creator_id = p_creator) then
    return; -- already following: nothing changes, nothing is recorded twice
  end if;
  perform social.rate_check('follow', v_uid);
  insert into social.follows (follower_id, creator_id) values (v_uid, p_creator);
  insert into social.follow_events (follower_id, creator_id, action, source) values (v_uid, p_creator, 'followed', p_source);
  -- A new follow starts fresh: an old mute of this creator ends.
  if exists (select 1 from social.mutes m where m.member_id = v_uid and m.creator_id = p_creator) then
    delete from social.mutes m where m.member_id = v_uid and m.creator_id = p_creator;
    insert into social.mute_events (member_id, creator_id, action) values (v_uid, p_creator, 'unmuted');
  end if;
end;
$$;

create table social.search_metrics_daily (
  day          date not null,
  surface      text not null check (surface in ('search', 'focus')),
  topic        text not null default '' check (topic = '' or topic ~ '^[a-z][a-z_]{1,29}$'),
  searches     integer not null default 0 check (searches >= 0),
  with_results integer not null default 0 check (with_results >= 0),
  selections   integer not null default 0 check (selections >= 0),
  primary key (day, surface, topic)
);
comment on table social.search_metrics_daily is 'Daily counts only: searches, searches with results and results opened, per surface and approved topic. No words, no member, no results. Read by the founder (and the intelligence package), never by members.';
alter table social.search_metrics_daily enable row level security;
revoke all on table social.search_metrics_daily from public, anon, authenticated;

create function public.app_note_search(p_surface text, p_had_results boolean, p_topic text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := social.current_member();
  v_topic text := coalesce(p_topic, '');
begin
  if p_surface is null or p_surface not in ('search', 'focus') then
    raise exception 'invalid_request' using errcode = 'P0001';
  end if;
  -- Only approved, active topics are counted; anything else counts with no topic.
  if v_topic <> '' and not exists (select 1 from social.topics t where t.slug = v_topic and t.active) then
    v_topic := '';
  end if;
  insert into social.search_metrics_daily as m (day, surface, topic, searches, with_results)
  values ((pg_catalog.now() at time zone 'utc')::date, p_surface, v_topic, 1, case when p_had_results then 1 else 0 end)
  on conflict (day, surface, topic) do update
    set searches = m.searches + 1, with_results = m.with_results + excluded.with_results;
  perform v_uid; -- membership is required; who searched is never stored
end;
$$;
comment on function public.app_note_search(text, boolean, text) is 'Counts one search (or topic focus) for today: whether it had results, and the approved topic it matched. Stores no words and no member.';
revoke all on function public.app_note_search(text, boolean, text) from public, anon;
grant execute on function public.app_note_search(text, boolean, text) to authenticated;

create function public.app_note_search_selection(p_surface text, p_topic text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := social.current_member();
  v_topic text := coalesce(p_topic, '');
begin
  if p_surface is null or p_surface not in ('search', 'focus') then
    raise exception 'invalid_request' using errcode = 'P0001';
  end if;
  if v_topic <> '' and not exists (select 1 from social.topics t where t.slug = v_topic and t.active) then
    v_topic := '';
  end if;
  insert into social.search_metrics_daily as m (day, surface, topic, selections)
  values ((pg_catalog.now() at time zone 'utc')::date, p_surface, v_topic, 1)
  on conflict (day, surface, topic) do update set selections = m.selections + 1;
  perform v_uid;
end;
$$;
comment on function public.app_note_search_selection(text, text) is 'Counts one result opened from a search (or a focus) today. Stores no words and no member.';
revoke all on function public.app_note_search_selection(text, text) from public, anon;
grant execute on function public.app_note_search_selection(text, text) to authenticated;

create function public.app_founder_search_metrics(p_days integer default 28)
returns table (day date, surface text, topic text, searches integer, with_results integer, selections integer, follows_from_search bigint)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := social.current_founder();
begin
  if p_days is null or p_days not between 1 and 366 then
    raise exception 'invalid_request' using errcode = 'P0001';
  end if;
  perform v_uid;
  return query
  select m.day, m.surface, m.topic, m.searches, m.with_results, m.selections,
         case when m.surface = 'search' and m.topic = '' then
           (select count(*) from social.follow_events e where e.action = 'followed' and e.source = 'search' and e.occurred_at::date = m.day)
         end
  from social.search_metrics_daily m
  where m.day > (pg_catalog.now() at time zone 'utc')::date - p_days
  order by m.day desc, m.surface, m.topic;
end;
$$;
comment on function public.app_founder_search_metrics(integer) is 'Founder only: daily search counts (volume, with results, results opened, by approved topic) and follows that started from search. Aggregates only.';
revoke all on function public.app_founder_search_metrics(integer) from public, anon;
grant execute on function public.app_founder_search_metrics(integer) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. Public previews

create table ops.public_preview_settings (
  id         boolean primary key default true check (id),
  enabled    boolean not null default false,
  updated_at timestamptz not null default pg_catalog.now(),
  updated_by text not null default 'migration' check (char_length(updated_by) between 1 and 100 and strpos(updated_by, '@') = 0)
);
comment on table ops.public_preview_settings is 'Whether public previews of posts are shown to visitors. Off by default on every database; turned on per environment by its owner (ops.set_public_previews), Production only with the founder''s legal, security and pilot readiness approval.';
insert into ops.public_preview_settings (id) values (true);
alter table ops.public_preview_settings enable row level security;
revoke all on table ops.public_preview_settings from public, anon, authenticated;

create table ops.public_preview_events (
  id         bigint generated always as identity primary key,
  actor      text not null check (char_length(actor) between 1 and 100 and strpos(actor, '@') = 0),
  enabled    boolean not null,
  reason     text not null check (char_length(reason) between 1 and 200),
  changed_at timestamptz not null default pg_catalog.now()
);
comment on table ops.public_preview_events is 'Every change to the public preview switch. Append-only.';
alter table ops.public_preview_events enable row level security;
revoke all on table ops.public_preview_events from public, anon, authenticated;
create trigger public_preview_events_no_update before update or delete on ops.public_preview_events
for each row execute function ops.history_append_only();

create function ops.set_public_previews(p_actor text, p_enabled boolean, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_enabled is null or p_reason is null or pg_catalog.btrim(p_reason) = '' then
    raise exception 'public previews: give true or false and a reason';
  end if;
  update ops.public_preview_settings set enabled = p_enabled, updated_at = pg_catalog.now(), updated_by = p_actor where id;
  insert into ops.public_preview_events (actor, enabled, reason) values (p_actor, p_enabled, p_reason);
end;
$$;
revoke all on function ops.set_public_previews(text, boolean, text) from public, anon, authenticated;
comment on function ops.set_public_previews(text, boolean, text) is 'Turns public previews on or off for this database (owner only), recorded.';

-- Opt-in: a creator's posts can be previewed only after they chose it, with
-- the wording they were shown. Withdrawing removes the row at once.
create table social.preview_consents (
  member_id       uuid primary key references auth.users (id) on delete cascade,
  consented_at    timestamptz not null default pg_catalog.now(),
  wording_version text not null check (wording_version ~ '^[a-z0-9][a-z0-9._-]{0,31}$')
);
comment on table social.preview_consents is 'Members who explicitly allowed public previews of their posts, and the wording they agreed to. Nobody is previewed without a row here.';
alter table social.preview_consents enable row level security;
revoke all on table social.preview_consents from public, anon, authenticated;

-- Visits, counted per day, post and referral link: no visitor identity.
create table social.preview_visits (
  day      date not null,
  post_id  uuid not null references social.posts (id) on delete cascade,
  ref_code text not null default '' check (ref_code = '' or ref_code ~ '^[0-9a-f]{16}$'),
  views    integer not null default 0 check (views >= 0),
  primary key (day, post_id, ref_code)
);
comment on table social.preview_visits is 'Public preview views per day, post and referral link. No visitor identity. The referral link is the one in the shared address, for later attribution.';
alter table social.preview_visits enable row level security;
revoke all on table social.preview_visits from public, anon, authenticated;

-- Rate limits: overall and per post, per minute.
create table social.preview_rate (
  minute  timestamptz not null,
  post_id uuid,
  n       integer not null default 0,
  primary key (minute, post_id)
);
comment on table social.preview_rate is 'Public preview requests per minute, overall (post_id null is not used: see the all-zero id) and per post. Old minutes are removed as new ones arrive.';
alter table social.preview_rate enable row level security;
revoke all on table social.preview_rate from public, anon, authenticated;

create function public.app_public_post(p_post uuid, p_ref text default null)
returns table (
  id uuid, body text, created_at timestamptz, edited boolean, has_photo boolean,
  topic_label text, author_username text, author_display_name text
)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_minute timestamptz := pg_catalog.date_trunc('minute', pg_catalog.now());
  v_all constant uuid := '00000000-0000-0000-0000-000000000000';
  v_total integer;
  v_this integer;
  v_ref text := case when p_ref ~ '^[0-9a-f]{16}$' then p_ref else '' end;
begin
  -- Previews off: nothing at all, the same answer as a missing post.
  if not coalesce((select s.enabled from ops.public_preview_settings s where s.id), false) then
    raise exception 'not_available' using errcode = 'P0001';
  end if;
  if p_post is null then
    raise exception 'not_found' using errcode = 'P0001';
  end if;
  -- Rate limits: 600 a minute overall, 60 a minute per post.
  delete from social.preview_rate r where r.minute < v_minute - interval '5 minutes';
  insert into social.preview_rate as r (minute, post_id, n) values (v_minute, v_all, 1)
  on conflict (minute, post_id) do update set n = r.n + 1 returning r.n into v_total;
  insert into social.preview_rate as r (minute, post_id, n) values (v_minute, p_post, 1)
  on conflict (minute, post_id) do update set n = r.n + 1 returning r.n into v_this;
  if v_total > 600 or v_this > 60 then
    raise exception 'rate_limited' using errcode = 'P0001';
  end if;
  if not exists (
    select 1
    from social.posts s
    join social.visible_members p on p.id = s.author_id
    where s.id = p_post
      and s.deleted_at is null
      and s.body <> ''
      and exists (select 1 from social.preview_consents pc where pc.member_id = s.author_id)
      and not exists (select 1 from ops.content_reports r where r.target_type = 'post' and r.target_id = s.id and r.status = 'open')
  ) then
    raise exception 'not_found' using errcode = 'P0001';
  end if;
  insert into social.preview_visits as v (day, post_id, ref_code, views) values ((pg_catalog.now() at time zone 'utc')::date, p_post, v_ref, 1)
  on conflict (day, post_id, ref_code) do update set views = v.views + 1;
  return query
  select s.id, s.body, s.created_at, s.edited_at is not null, s.media_kind is not null,
         t.label, p.username, p.display_name
  from social.posts s
  join social.visible_members p on p.id = s.author_id
  left join social.topics t on t.slug = s.topic
  where s.id = p_post;
end;
$$;
comment on function public.app_public_post(uuid, text) is 'The one function visitors may call: a read-only preview of one eligible post (text, time, topic, creator name; never the photo, counts, comments or anything about other members). Only while previews are on and only for creators who opted in; rate limited; visits counted per day, post and referral link.';
revoke all on function public.app_public_post(uuid, text) from public;
grant execute on function public.app_public_post(uuid, text) to anon, authenticated;

create function public.app_set_public_previews(p_allowed boolean, p_wording_version text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := social.current_member();
begin
  if p_allowed is null then
    raise exception 'invalid_request' using errcode = 'P0001';
  end if;
  if p_allowed then
    -- Consent needs the wording the member was shown.
    if p_wording_version is null or p_wording_version !~ '^[a-z0-9][a-z0-9._-]{0,31}$' then
      raise exception 'invalid_request' using errcode = 'P0001';
    end if;
    insert into social.preview_consents (member_id, wording_version) values (v_uid, p_wording_version)
    on conflict (member_id) do update set consented_at = pg_catalog.now(), wording_version = excluded.wording_version;
  else
    delete from social.preview_consents pc where pc.member_id = v_uid;
  end if;
end;
$$;
comment on function public.app_set_public_previews(boolean, text) is 'Lets a member explicitly allow public previews of their posts (recording the wording shown) or withdraw that choice at once.';
revoke all on function public.app_set_public_previews(boolean, text) from public, anon;
grant execute on function public.app_set_public_previews(boolean, text) to authenticated;

create function public.app_public_previews_allowed()
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := social.current_member();
begin
  return exists (select 1 from social.preview_consents pc where pc.member_id = v_uid);
end;
$$;
revoke all on function public.app_public_previews_allowed() from public, anon;
grant execute on function public.app_public_previews_allowed() to authenticated;
