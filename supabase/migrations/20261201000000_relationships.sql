-- IP-2 Relationships and Home (SP-TA-001 v2, WP-03; SP-DESIGN-002).
-- Review guide: docs/RELATIONSHIPS.md.
--
-- 1. Unlimited Clique (CON-02). The guard keeps "a Clique needs a follow" and
--    drops the 25 cap. The rate limit is unchanged. app_clique_replace stays
--    for older pages; the app no longer needs it.
-- 2. Follow source (CON-03, CON-09). app_follow takes an optional source
--    (profile, discover, post, catch_up, comment, other), recorded on the
--    follow history, so discovery is a journey source, never a stage.
-- 3. Mute (CON-12). A member can mute a creator they follow: the creator's
--    posts leave that member's Home (every face and the catch-up strip) and
--    nothing else changes. Only the member's own choice hides a post. A new
--    follow clears an old mute.
-- 4. Active Supporter (CON-03, CON-11). A follower with at least one
--    qualifying meaningful activity on the creator's posts in the last 28
--    days (SP-TA-001 section 6.2). Today that is a meaningful comment
--    (social.meaningful_comment, provisional until metric decision N8);
--    saves, reposts, shares and video completions join when they exist.
--    Counts on profiles: followers, Clique, Active Supporters.
-- 5. Support Intent (ADV-13, SP-DESIGN-002 section 9.4). A non-binding
--    indication: $3, $5 or $10 a month, not sure yet, or withdrawn. Kept in
--    the intent schema, never money, never a balance, never combined with
--    simulation or finance data. Nothing is charged, now or later.
-- 6. Clique first Home (CON-04, CON-05). app_home_priority returns the
--    member's unseen recent posts from their Clique, newest first, at most
--    20. The app shows them first and then the full chronological feed
--    without them, so every eligible post appears exactly once and nothing
--    is starved: the group is bounded and empties as posts are seen.
-- 7. Relationship intelligence (CON-10). app_my_relationships (the member's
--    side) and app_my_audience (the creator's side: stages, growth, where
--    followers came from, Support Intent by option).
-- 8. Events. Mutes, unmutes and Support Intent are recorded in
--    analytics.events by triggers; follows now carry their source.

-- ---------------------------------------------------------------------------
-- 1. Unlimited Clique

create or replace function social.clique_members_guard()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.removed_at is null then
    if not exists (select 1 from social.follows f where f.follower_id = new.fan_id and f.creator_id = new.creator_id) then
      raise exception 'not_following' using errcode = 'P0001', detail = 'A Clique can only include creators you follow.';
    end if;
  end if;
  return new;
end;
$$;
comment on function social.clique_members_guard() is 'A Clique membership needs a current follow. There is no size limit (20261201000000); changes stay rate limited.';

-- ---------------------------------------------------------------------------
-- 2. Follow source

alter table social.follow_events add column source text;
alter table social.follow_events add constraint follow_events_source
  check (source is null or (action = 'followed' and source in ('profile', 'discover', 'post', 'catch_up', 'comment', 'other')));
comment on column social.follow_events.source is 'Where a follow started (a journey source, not a relationship stage). Null for unfollows and for follows before 20261201000000.';

-- ---------------------------------------------------------------------------
-- 3. Mute

create table social.mutes (
  member_id  uuid not null references auth.users (id) on delete cascade,
  creator_id uuid not null references auth.users (id) on delete cascade,
  muted_at   timestamptz not null default pg_catalog.now(),
  primary key (member_id, creator_id),
  constraint mutes_not_self check (member_id <> creator_id)
);
comment on table social.mutes is 'Creators a member has muted: their posts leave that member''s Home only. Every change is also recorded in social.mute_events.';
alter table social.mutes enable row level security;
revoke all on table social.mutes from public, anon, authenticated;

create table social.mute_events (
  id          bigint generated always as identity primary key,
  member_id   uuid not null references auth.users (id) on delete cascade,
  creator_id  uuid not null references auth.users (id) on delete cascade,
  action      text not null check (action in ('muted', 'unmuted')),
  occurred_at timestamptz not null default pg_catalog.now(),
  constraint mute_events_not_self check (member_id <> creator_id)
);
comment on table social.mute_events is 'Every mute and unmute, append-only.';
create index mute_events_by_member_time on social.mute_events (member_id, occurred_at);
alter table social.mute_events enable row level security;
revoke all on table social.mute_events from public, anon, authenticated;

create function social.mute_history_is_append_only()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  raise exception 'mute history is append-only' using errcode = 'P0001';
end;
$$;
revoke all on function social.mute_history_is_append_only() from public, anon, authenticated;
-- Account deletion still removes the history through the foreign keys'
-- cascade (pg_trigger_depth() > 0), as for follow history.
create trigger mute_events_append_only
  before update or delete on social.mute_events
  for each row when (pg_trigger_depth() = 0)
  execute function social.mute_history_is_append_only();

-- ---------------------------------------------------------------------------
-- 4. Active Supporter

create function social.meaningful_comment(p_body text)
returns boolean
language sql
immutable
security invoker
set search_path = ''
as $$
  -- Provisional until metric decision N8: at least 20 visible characters
  -- once runs of white space are collapsed. One place to change.
  select pg_catalog.char_length(pg_catalog.btrim(pg_catalog.regexp_replace(coalesce(p_body, ''), '\s+', ' ', 'g'))) >= 20;
$$;
revoke all on function social.meaningful_comment(text) from public, anon, authenticated;
comment on function social.meaningful_comment(text) is 'Whether a comment counts as meaningful activity (provisional definition, decision N8).';

create function social.is_active_supporter(p_fan uuid, p_creator uuid)
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select exists (select 1 from social.follows f where f.follower_id = p_fan and f.creator_id = p_creator)
     and exists (
       select 1
       from social.comments c
       join social.posts s on s.id = c.post_id
       where c.author_id = p_fan and s.author_id = p_creator
         and c.deleted_at is null and s.deleted_at is null
         and c.created_at >= pg_catalog.now() - interval '28 days'
         and social.meaningful_comment(c.body)
     );
$$;
revoke all on function social.is_active_supporter(uuid, uuid) from public, anon, authenticated;
comment on function social.is_active_supporter(uuid, uuid) is 'Relationship stage 3: a follower with qualifying meaningful activity on the creator''s posts in the last 28 days.';

create index comments_live_by_author_time on social.comments (author_id, created_at) where deleted_at is null;

-- ---------------------------------------------------------------------------
-- 5. Support Intent (intent schema: hypothetical, non-binding)

create table intent.support_intents (
  id          bigint generated always as identity primary key,
  member_id   uuid not null references auth.users (id) on delete cascade,
  creator_id  uuid not null references auth.users (id) on delete cascade,
  choice      text not null check (choice in ('usd_3', 'usd_5', 'usd_10', 'not_sure', 'withdrawn')),
  recorded_at timestamptz not null default pg_catalog.now(),
  constraint support_intents_not_self check (member_id <> creator_id)
);
comment on table intent.support_intents is 'Non-binding Support Intent: what a member says they would be willing to support each month. Never a payment, pledge, balance or reward. Latest row per member and creator is current; append-only.';
create index support_intents_by_pair on intent.support_intents (member_id, creator_id, recorded_at desc);
create index support_intents_by_creator on intent.support_intents (creator_id, recorded_at desc);
alter table intent.support_intents enable row level security;
revoke all on table intent.support_intents from public, anon, authenticated;

create function intent.support_intents_append_only()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  raise exception 'Support Intent history is append-only' using errcode = 'P0001';
end;
$$;
revoke all on function intent.support_intents_append_only() from public, anon, authenticated;
create trigger support_intents_append_only
  before update or delete on intent.support_intents
  for each row when (pg_trigger_depth() = 0)
  execute function intent.support_intents_append_only();

-- ---------------------------------------------------------------------------
-- 8. Events (before the functions that write the rows)

create or replace function analytics.capture()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_author uuid;
begin
  if tg_table_name = 'posts' then
    if tg_op = 'INSERT' then
      perform analytics.record('post_created', new.author_id, new.author_id, new.id,
        pg_catalog.jsonb_build_object('media', coalesce(to_jsonb(new) ->> 'media_kind', 'text')));
    elsif tg_op = 'UPDATE' and old.deleted_at is null and new.deleted_at is not null then
      perform analytics.record('post_deleted', new.author_id, new.author_id, new.id);
    end if;
  elsif tg_table_name = 'comments' then
    select p.author_id into v_author from social.posts p where p.id = coalesce(new.post_id, old.post_id);
    if tg_op = 'INSERT' then
      perform analytics.record('comment_added', new.author_id, v_author, new.post_id,
        pg_catalog.jsonb_build_object('meaningful', social.meaningful_comment(new.body)));
    elsif tg_op = 'UPDATE' and old.deleted_at is null and new.deleted_at is not null then
      perform analytics.record('comment_deleted', new.author_id, v_author, new.post_id);
    end if;
  elsif tg_table_name = 'likes' then
    if tg_op = 'INSERT' then
      select p.author_id into v_author from social.posts p where p.id = new.post_id;
      perform analytics.record('post_liked', new.user_id, v_author, new.post_id);
    else
      -- A like removed by an account or post deletion is not an "unlike":
      -- record nothing, so deleting an account is never blocked.
      select p.author_id into v_author from social.posts p where p.id = old.post_id;
      if v_author is not null and exists (select 1 from auth.users x where x.id = old.user_id) then
        perform analytics.record('post_unliked', old.user_id, v_author, old.post_id);
      end if;
    end if;
  elsif tg_table_name = 'follow_events' then
    perform analytics.record(new.action, new.follower_id, new.creator_id, null,
      case when new.source is null then '{}'::jsonb else pg_catalog.jsonb_build_object('source', new.source) end);
  elsif tg_table_name = 'clique_members' then
    if tg_op = 'INSERT' then
      perform analytics.record('clique_joined', new.fan_id, new.creator_id, null);
    elsif tg_op = 'UPDATE' and old.removed_at is null and new.removed_at is not null then
      perform analytics.record('clique_left', new.fan_id, new.creator_id, null,
        pg_catalog.jsonb_build_object('reason', new.removal_reason));
    end if;
  elsif tg_table_name = 'registrations' then
    perform analytics.record('registered', new.user_id, new.creator_id, null,
      pg_catalog.jsonb_build_object('kind', new.kind, 'referred', new.referrer_id is not null));
  elsif tg_table_name = 'mute_events' then
    perform analytics.record(new.action, new.member_id, new.creator_id, null);
  elsif tg_table_name = 'support_intents' then
    perform analytics.record('support_intent_recorded', new.member_id, new.creator_id, null,
      pg_catalog.jsonb_build_object('choice', new.choice));
  end if;
  return null;
end;
$$;
revoke all on function analytics.capture() from public, anon, authenticated;

create trigger events_mute_events after insert on social.mute_events
for each row execute function analytics.capture();
create trigger events_support_intents after insert on intent.support_intents
for each row execute function analytics.capture();

-- ---------------------------------------------------------------------------
-- Member functions

-- Follow, with its source. Replaces app_follow(uuid): calls without a source
-- still work (the source is optional).
drop function public.app_follow(uuid);
create function public.app_follow(p_creator uuid, p_source text default null)
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
  if p_source is not null and p_source not in ('profile', 'discover', 'post', 'catch_up', 'comment', 'other') then
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
comment on function public.app_follow(uuid, text) is 'Follows a member, recording where the follow started. Following someone never adds them to the Clique.';
revoke all on function public.app_follow(uuid, text) from public, anon;
grant execute on function public.app_follow(uuid, text) to authenticated, service_role;

create function public.app_mute(p_creator uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := social.current_member();
begin
  if p_creator is null or p_creator = v_uid then
    raise exception 'invalid_request' using errcode = 'P0001';
  end if;
  if not exists (select 1 from social.follows f where f.follower_id = v_uid and f.creator_id = p_creator) then
    raise exception 'not_following' using errcode = 'P0001';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('social.mute:' || v_uid::text, 0));
  if exists (select 1 from social.mutes m where m.member_id = v_uid and m.creator_id = p_creator) then
    return;
  end if;
  if (select count(*) from social.mute_events e where e.member_id = v_uid and e.occurred_at > pg_catalog.now() - interval '1 hour') >= 120 then
    raise exception 'rate_limited' using errcode = 'P0001';
  end if;
  insert into social.mutes (member_id, creator_id) values (v_uid, p_creator);
  insert into social.mute_events (member_id, creator_id, action) values (v_uid, p_creator, 'muted');
end;
$$;
comment on function public.app_mute(uuid) is 'Mutes a followed creator: their posts leave the member''s Home. Still following; nothing else changes.';
revoke all on function public.app_mute(uuid) from public, anon;
grant execute on function public.app_mute(uuid) to authenticated;

create function public.app_unmute(p_creator uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := social.current_member();
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('social.mute:' || v_uid::text, 0));
  if not exists (select 1 from social.mutes m where m.member_id = v_uid and m.creator_id = p_creator) then
    return;
  end if;
  if (select count(*) from social.mute_events e where e.member_id = v_uid and e.occurred_at > pg_catalog.now() - interval '1 hour') >= 120 then
    raise exception 'rate_limited' using errcode = 'P0001';
  end if;
  delete from social.mutes m where m.member_id = v_uid and m.creator_id = p_creator;
  insert into social.mute_events (member_id, creator_id, action) values (v_uid, p_creator, 'unmuted');
end;
$$;
comment on function public.app_unmute(uuid) is 'Ends a mute. Does nothing if the creator is not muted.';
revoke all on function public.app_unmute(uuid) from public, anon;
grant execute on function public.app_unmute(uuid) to authenticated;

-- Profile: counts for all three stages, and the viewer's own relationship.
drop function public.app_member(text);
create function public.app_member(p_username text)
returns table (
  id uuid, username text, display_name text, post_count bigint, follower_count bigint,
  following_count bigint, followed_by_me boolean, in_my_clique boolean, is_me boolean,
  clique_count bigint, active_supporter_count bigint, i_am_active_supporter boolean, muted_by_me boolean
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
         (select count(*) from social.posts s where s.author_id = p.id and s.deleted_at is null),
         (select count(*) from social.follows f where f.creator_id = p.id),
         (select count(*) from social.follows f where f.follower_id = p.id),
         exists (select 1 from social.follows f where f.follower_id = v_uid and f.creator_id = p.id),
         exists (select 1 from social.clique_members m where m.fan_id = v_uid and m.creator_id = p.id and m.removed_at is null),
         p.id = v_uid,
         (select count(*) from social.clique_members m where m.creator_id = p.id and m.removed_at is null),
         (select count(*) from social.follows f where f.creator_id = p.id and social.is_active_supporter(f.follower_id, p.id)),
         social.is_active_supporter(v_uid, p.id),
         exists (select 1 from social.mutes m where m.member_id = v_uid and m.creator_id = p.id)
  from social.visible_members p
  where p.username = lower(pg_catalog.btrim(coalesce(p_username, '')))
    and p.display_name is not null;
end;
$$;
comment on function public.app_member(text) is 'One member''s public profile and counts (followers, Clique, Active Supporters), with the viewer''s own relationship to them.';
revoke all on function public.app_member(text) from public, anon;
grant execute on function public.app_member(text) to authenticated, service_role;

-- Home: muted creators leave every face. Otherwise as 20261130000000.
create or replace function public.app_feed_page(
  p_before_at timestamptz default null, p_before_id uuid default null,
  p_limit integer default 20, p_filter text default 'all'
)
returns table (
  id uuid, author_id uuid, author_username text, author_display_name text,
  body text, created_at timestamptz, like_count bigint, comment_count bigint,
  liked_by_me boolean, author_in_my_clique boolean, is_mine boolean, media jsonb
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := social.current_member();
begin
  if (p_before_at is null) <> (p_before_id is null) then
    raise exception 'invalid_cursor' using errcode = 'P0001';
  end if;
  if coalesce(p_filter, 'all') not in ('all', 'clique') then
    raise exception 'invalid_filter' using errcode = 'P0001';
  end if;
  return query
  select s.id, s.author_id, p.username, p.display_name, s.body, s.created_at,
         (select count(*) from social.likes l where l.post_id = s.id),
         (select count(*) from social.comments c where c.post_id = s.id and c.deleted_at is null),
         exists (select 1 from social.likes l where l.post_id = s.id and l.user_id = v_uid),
         exists (select 1 from social.clique_members m where m.fan_id = v_uid and m.creator_id = s.author_id and m.removed_at is null),
         s.author_id = v_uid,
         social.post_media_json(s.id)
  from social.posts s
  join social.visible_members p on p.id = s.author_id
  where s.deleted_at is null
    and case when coalesce(p_filter, 'all') = 'clique'
             then exists (select 1 from social.clique_members m where m.fan_id = v_uid and m.creator_id = s.author_id and m.removed_at is null)
             else (s.author_id = v_uid or exists (select 1 from social.follows f where f.follower_id = v_uid and f.creator_id = s.author_id))
        end
    and not exists (select 1 from social.mutes mu where mu.member_id = v_uid and mu.creator_id = s.author_id)
    and (p_before_at is null or (s.created_at, s.id) < (p_before_at, p_before_id))
  order by s.created_at desc, s.id desc
  limit least(greatest(coalesce(p_limit, 20), 1), 50);
end;
$$;

-- Clique first: the member's unseen recent Clique posts, newest first.
create function public.app_home_priority(p_limit integer default 10)
returns table (
  id uuid, author_id uuid, author_username text, author_display_name text,
  body text, created_at timestamptz, like_count bigint, comment_count bigint,
  liked_by_me boolean, author_in_my_clique boolean, is_mine boolean, media jsonb
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
  select s.id, s.author_id, p.username, p.display_name, s.body, s.created_at,
         (select count(*) from social.likes l where l.post_id = s.id),
         (select count(*) from social.comments c where c.post_id = s.id and c.deleted_at is null),
         exists (select 1 from social.likes l where l.post_id = s.id and l.user_id = v_uid),
         true,
         false,
         social.post_media_json(s.id)
  from social.clique_members m
  join social.follows f on f.follower_id = v_uid and f.creator_id = m.creator_id
  join social.posts s on s.author_id = m.creator_id
  join social.visible_members p on p.id = s.author_id
  where m.fan_id = v_uid and m.removed_at is null
    and s.deleted_at is null
    and s.created_at >= f.followed_at
    and s.created_at >= pg_catalog.now() - interval '7 days'
    and not exists (select 1 from social.post_views v where v.viewer_id = v_uid and v.post_id = s.id)
    and not exists (select 1 from social.mutes mu where mu.member_id = v_uid and mu.creator_id = s.author_id)
  order by s.created_at desc, s.id desc
  limit least(greatest(coalesce(p_limit, 10), 1), 20);
end;
$$;
comment on function public.app_home_priority(integer) is 'Clique first: unseen posts from the member''s Clique in the last 7 days (since the follow, not muted), newest first, at most 20. The app shows them before the chronological feed and never twice.';
revoke all on function public.app_home_priority(integer) from public, anon;
grant execute on function public.app_home_priority(integer) to authenticated;

-- The catch-up strip leaves muted creators out. Otherwise as 20261122000000.
create or replace function public.app_unseen_creators()
returns table (
  id uuid, username text, display_name text, in_my_clique boolean,
  unseen_count integer, latest_unseen_at timestamptz
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
  select p.id, p.username, p.display_name, (m.fan_id is not null), u.n::integer, u.latest
  from social.follows f
  join social.visible_members p on p.id = f.creator_id
  left join social.clique_members m on m.fan_id = v_uid and m.creator_id = f.creator_id and m.removed_at is null
  cross join lateral (
    -- At most 10 per creator: enough to show 9+, and it bounds the work.
    select count(*) as n, max(x.created_at) as latest
    from (
      select s.created_at
      from social.posts s
      where s.author_id = f.creator_id and s.deleted_at is null and s.created_at >= f.followed_at
        and not exists (select 1 from social.post_views v where v.viewer_id = v_uid and v.post_id = s.id)
      order by s.created_at desc
      limit 10
    ) x
  ) u
  where f.follower_id = v_uid and u.n > 0
    and not exists (select 1 from social.mutes mu where mu.member_id = v_uid and mu.creator_id = f.creator_id)
  order by (m.fan_id is null), u.latest desc, p.id;
end;
$$;

-- Support Intent
create function public.app_record_support_intent(p_creator uuid, p_choice text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := social.current_member();
  v_current text;
begin
  if p_creator is null or p_creator = v_uid then
    raise exception 'invalid_request' using errcode = 'P0001';
  end if;
  if p_choice is null or p_choice not in ('usd_3', 'usd_5', 'usd_10', 'not_sure', 'withdrawn') then
    raise exception 'invalid_request' using errcode = 'P0001';
  end if;
  if not social.is_member(p_creator) then
    raise exception 'not_found' using errcode = 'P0001';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('splitpost:support_intent:' || v_uid::text, 0));
  select i.choice into v_current from intent.support_intents i
  where i.member_id = v_uid and i.creator_id = p_creator
  order by i.recorded_at desc, i.id desc limit 1;
  if v_current is not distinct from p_choice or (v_current is null and p_choice = 'withdrawn') then
    return; -- nothing changes, nothing is recorded twice
  end if;
  if (select count(*) from intent.support_intents i where i.member_id = v_uid and i.recorded_at > pg_catalog.now() - interval '1 hour') >= 30 then
    raise exception 'rate_limited' using errcode = 'P0001';
  end if;
  insert into intent.support_intents (member_id, creator_id, choice) values (v_uid, p_creator, p_choice);
end;
$$;
comment on function public.app_record_support_intent(uuid, text) is 'Records a non-binding Support Intent ($3, $5 or $10 a month, not sure yet, or withdrawn). Never a payment or pledge; nothing is charged.';
revoke all on function public.app_record_support_intent(uuid, text) from public, anon;
grant execute on function public.app_record_support_intent(uuid, text) to authenticated;

create function public.app_support_intent(p_creator uuid)
returns table (choice text, recorded_at timestamptz)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := social.current_member();
begin
  return query
  select i.choice, i.recorded_at from intent.support_intents i
  where i.member_id = v_uid and i.creator_id = p_creator and i.choice <> 'withdrawn'
    and i.id = (select max(j.id) from intent.support_intents j where j.member_id = v_uid and j.creator_id = p_creator);
end;
$$;
comment on function public.app_support_intent(uuid) is 'The member''s own current Support Intent for one creator, if any.';
revoke all on function public.app_support_intent(uuid) from public, anon;
grant execute on function public.app_support_intent(uuid) to authenticated;

-- Relationship management and intelligence (the member's side).
create function public.app_my_relationships()
returns table (
  id uuid, username text, display_name text, followed_at timestamptz,
  in_my_clique boolean, clique_added_at timestamptz, active_supporter boolean,
  muted boolean, support_choice text, latest_post_at timestamptz
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
  select p.id, p.username, p.display_name, f.followed_at,
         m.added_at is not null, m.added_at,
         social.is_active_supporter(v_uid, p.id),
         exists (select 1 from social.mutes mu where mu.member_id = v_uid and mu.creator_id = p.id),
         (select nullif(i.choice, 'withdrawn') from intent.support_intents i
          where i.member_id = v_uid and i.creator_id = p.id order by i.recorded_at desc, i.id desc limit 1),
         (select max(s.created_at) from social.posts s where s.author_id = p.id and s.deleted_at is null)
  from social.follows f
  join social.visible_members p on p.id = f.creator_id
  left join social.clique_members m on m.fan_id = v_uid and m.creator_id = f.creator_id and m.removed_at is null
  where f.follower_id = v_uid
  order by m.added_at is null, p.display_name, p.id;
end;
$$;
comment on function public.app_my_relationships() is 'Everyone the member follows, with the relationship stage (Following, Clique Connection, Active Supporter), mute and the member''s own Support Intent. Clique first.';
revoke all on function public.app_my_relationships() from public, anon;
grant execute on function public.app_my_relationships() to authenticated;

-- Relationship intelligence (the creator's side). Aggregates only: never who.
create function public.app_my_audience()
returns table (
  follower_count bigint, clique_count bigint, active_supporter_count bigint,
  new_followers_7d bigint, new_followers_prev_7d bigint, follow_sources_28d jsonb,
  support_intent_count bigint, support_by_choice jsonb, posts_28d bigint
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
  with current_intents as (
    select distinct on (i.member_id) i.member_id, i.choice
    from intent.support_intents i
    where i.creator_id = v_uid
    order by i.member_id, i.recorded_at desc, i.id desc
  )
  select
    (select count(*) from social.follows f where f.creator_id = v_uid),
    (select count(*) from social.clique_members m where m.creator_id = v_uid and m.removed_at is null),
    (select count(*) from social.follows f where f.creator_id = v_uid and social.is_active_supporter(f.follower_id, v_uid)),
    (select count(*) from social.follows f where f.creator_id = v_uid and f.followed_at > pg_catalog.now() - interval '7 days'),
    (select count(*) from social.follow_events e where e.creator_id = v_uid and e.action = 'followed'
       and e.occurred_at > pg_catalog.now() - interval '14 days' and e.occurred_at <= pg_catalog.now() - interval '7 days'),
    coalesce((select pg_catalog.jsonb_object_agg(x.src, x.n) from (
       select coalesce(e.source, 'unknown') as src, count(*) as n
       from social.follow_events e
       where e.creator_id = v_uid and e.action = 'followed' and e.occurred_at > pg_catalog.now() - interval '28 days'
       group by 1) x), '{}'::jsonb),
    (select count(*) from current_intents c where c.choice <> 'withdrawn'),
    coalesce((select pg_catalog.jsonb_object_agg(y.choice, y.n) from (
       select c.choice, count(*) as n from current_intents c where c.choice <> 'withdrawn' group by 1) y), '{}'::jsonb),
    (select count(*) from social.posts s where s.author_id = v_uid and s.deleted_at is null and s.created_at > pg_catalog.now() - interval '28 days');
end;
$$;
comment on function public.app_my_audience() is 'The member''s own audience as a creator: stage counts, follower growth, follow sources (28 days), non-binding Support Intent by option. Aggregates only.';
revoke all on function public.app_my_audience() from public, anon;
grant execute on function public.app_my_audience() to authenticated;
