-- IP-4b Discovery and sharing (SP-TA-001 v2, WP-02 and CNT-10; SP-DESIGN-001
-- Discover: "find new value"). Review guide: docs/DISCOVERY.md.
--
-- Discovery is value and intent based: it starts from what the member says
-- they care about (their interests, and an optional focus chosen for this
-- visit, which the app keeps in the browser and never stores), not from
-- popularity or engagement.
--
-- 1. Content discovery (DSC-05, DSC-06, DSC-08, DSC-09, DSC-11).
--    app_discover_content: recent categorized posts from members the viewer
--    does not follow yet, in the viewer's interests (or one chosen topic),
--    with a plain reason on each. At most two posts per creator, so nobody
--    dominates; never the viewer's own posts, muted creators, hidden or
--    deleted posts, or uncategorized posts. Follower counts play no part.
-- 2. Search (DSC-07). app_search_posts: live posts whose text matches the
--    words searched (PostgreSQL full text, simple configuration) or whose
--    topic name matches. People search is unchanged (app_discover_people);
--    topics are searched in the app from the approved list. Nothing about a
--    search is stored.
-- 3. Sharing (CNT-10). app_record_share records that a member shared a post
--    (copy link or the device share sheet), once per member, post and
--    channel per hour, for the contribution work later. Shared links open
--    the post for signed-in members only: public previews for visitors are
--    a separate founder decision.
-- 4. Discovery never changes Home: these functions only read, and Home's
--    functions are untouched.

create index posts_live_search on social.posts using gin (pg_catalog.to_tsvector('simple'::regconfig, body)) where deleted_at is null;

create table social.shares (
  id         bigint generated always as identity primary key,
  member_id  uuid not null references auth.users (id) on delete cascade,
  post_id    uuid not null references social.posts (id) on delete cascade,
  channel    text not null check (channel in ('copy_link', 'share_sheet')),
  created_at timestamptz not null default pg_catalog.now()
);
comment on table social.shares is 'A member sharing a post outside Splitpost (copy link or the device share sheet). Link visits and qualified referrals are recorded separately later.';
create index shares_by_member_time on social.shares (member_id, created_at);
create index shares_by_post on social.shares (post_id);
alter table social.shares enable row level security;
revoke all on table social.shares from public, anon, authenticated;

create function social.shares_are_append_only()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  raise exception 'shares are append-only' using errcode = 'P0001';
end;
$$;
revoke all on function social.shares_are_append_only() from public, anon, authenticated;
create trigger shares_append_only
  before update or delete on social.shares
  for each row when (pg_trigger_depth() = 0)
  execute function social.shares_are_append_only();

-- Events: a share is recorded once.
create function analytics.capture_share()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform analytics.record('post_shared', new.member_id, (select p.author_id from social.posts p where p.id = new.post_id), new.post_id,
    pg_catalog.jsonb_build_object('channel', new.channel));
  return null;
end;
$$;
revoke all on function analytics.capture_share() from public, anon, authenticated;
create trigger events_shares after insert on social.shares
for each row execute function analytics.capture_share();

-- ---------------------------------------------------------------------------
-- 1. Content discovery

create function public.app_discover_content(p_topic text default null, p_limit integer default 30)
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
  order by s.created_at desc, s.id desc
  limit least(greatest(coalesce(p_limit, 30), 1), 50);
end;
$$;
comment on function public.app_discover_content(text, integer) is 'Discover: recent categorized posts (30 days) from members the viewer doesn''t follow, in the viewer''s interests or one chosen topic, at most two per creator, each with its reason. Never own, muted, hidden or uncategorized posts; follower counts play no part.';
revoke all on function public.app_discover_content(text, integer) from public, anon;
grant execute on function public.app_discover_content(text, integer) to authenticated;

-- ---------------------------------------------------------------------------
-- 2. Search

create function public.app_search_posts(p_query text, p_limit integer default 30)
returns table (
  id uuid, author_id uuid, author_username text, author_display_name text,
  body text, created_at timestamptz, like_count bigint, comment_count bigint,
  liked_by_me boolean, author_in_my_clique boolean, is_mine boolean, media jsonb,
  topic text, topic_label text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := social.current_member();
  v_query text := pg_catalog.btrim(coalesce(p_query, ''));
  v_ts tsquery;
begin
  if pg_catalog.char_length(v_query) < 2 or pg_catalog.char_length(v_query) > 100 then
    raise exception 'invalid_query' using errcode = 'P0001';
  end if;
  v_ts := pg_catalog.plainto_tsquery('simple'::regconfig, v_query);
  return query
  select s.id, s.author_id, p.username, p.display_name, s.body, s.created_at,
         (select count(*) from social.likes l where l.post_id = s.id),
         (select count(*) from social.comments c where c.post_id = s.id and c.deleted_at is null),
         exists (select 1 from social.likes l where l.post_id = s.id and l.user_id = v_uid),
         exists (select 1 from social.clique_members m where m.fan_id = v_uid and m.creator_id = s.author_id and m.removed_at is null),
         s.author_id = v_uid,
         social.post_media_json(s.id),
         s.topic, t.label
  from social.posts s
  join social.visible_members p on p.id = s.author_id
  left join social.topics t on t.slug = s.topic
  where s.deleted_at is null
    and not exists (select 1 from social.mutes mu where mu.member_id = v_uid and mu.creator_id = s.author_id)
    and (
      (v_ts::text <> '' and pg_catalog.to_tsvector('simple'::regconfig, s.body) @@ v_ts)
      or (t.label is not null and pg_catalog.strpos(pg_catalog.lower(t.label), pg_catalog.lower(v_query)) > 0)
    )
  order by s.created_at desc, s.id desc
  limit least(greatest(coalesce(p_limit, 30), 1), 50);
end;
$$;
comment on function public.app_search_posts(text, integer) is 'Searches live posts by their words (full text) or topic name, newest first. Nothing about the search is stored.';
revoke all on function public.app_search_posts(text, integer) from public, anon;
grant execute on function public.app_search_posts(text, integer) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. Sharing

create function public.app_record_share(p_post uuid, p_channel text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := social.current_member();
begin
  if p_channel is null or p_channel not in ('copy_link', 'share_sheet') then
    raise exception 'invalid_request' using errcode = 'P0001';
  end if;
  if not exists (select 1 from social.posts s join social.visible_members p on p.id = s.author_id where s.id = p_post and s.deleted_at is null) then
    raise exception 'not_found' using errcode = 'P0001';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('social.share:' || v_uid::text, 0));
  -- Once per member, post and channel an hour: repeated taps count once.
  if exists (select 1 from social.shares x where x.member_id = v_uid and x.post_id = p_post and x.channel = p_channel
             and x.created_at > pg_catalog.now() - interval '1 hour') then
    return;
  end if;
  if (select count(*) from social.shares x where x.member_id = v_uid and x.created_at > pg_catalog.now() - interval '1 hour') >= 60 then
    raise exception 'rate_limited' using errcode = 'P0001';
  end if;
  insert into social.shares (member_id, post_id, channel) values (v_uid, p_post, p_channel);
end;
$$;
comment on function public.app_record_share(uuid, text) is 'Records that the member shared a live post (copy link or share sheet), once per post and channel an hour.';
revoke all on function public.app_record_share(uuid, text) from public, anon;
grant execute on function public.app_record_share(uuid, text) to authenticated;
