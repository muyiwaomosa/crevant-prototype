-- Release 1: the social core. Real text posts, follows, the Clique (at most
-- 10 creators), likes and comments, stored in the database.
--
--   social                 private schema, locked like ops: server code only,
--                          never reachable through the Data API
--   social.posts           text posts (soft-deleted, so history stays honest)
--   social.follows         who follows whom now
--   social.follow_events   every follow and unfollow, append-only
--   social.clique_members  Clique history: one row per membership, never
--                          overwritten; at most 10 open rows per fan
--   social.likes           one like per member per post
--   social.comments        comments (soft-deleted)
--
-- Members reach this data only through the public.app_* functions below.
-- Each one runs as its owner (security definer) with an empty search path,
-- checks who is calling, and enforces the rules: no self-follows, a Clique
-- only of creators you follow, at most 10 of them, and only your own posts
-- and comments can be deleted. Other members' profiles are returned as
-- public fields only (id, username, display name), so the own-row profile
-- policies from Phase 1A stay exactly as approved.
--
-- Release 1 records NO Connection Points, rewards, money or analytics
-- events. Unified accounts: anyone with a complete profile can post, and a
-- "creator" is simply someone whose posts you follow.
--
-- This migration changes no Supabase Auth configuration and does not touch
-- the waitlist or creator acquisition tables.

-- ---------------------------------------------------------------------------
-- social: private schema, locked exactly like ops.

create schema if not exists social;
comment on schema social is 'Posts, follows, the Clique, likes and comments. Server code only; members use the public.app_* functions. Never exposed through the Data API.';

revoke all on schema social from public;
revoke all on schema social from anon, authenticated;
grant usage on schema social to service_role;

alter default privileges in schema social revoke all on tables from public, anon, authenticated;
alter default privileges in schema social revoke all on sequences from public, anon, authenticated;
alter default privileges in schema social revoke all on functions from public, anon, authenticated;
alter default privileges in schema social grant all on tables to service_role;
alter default privileges in schema social grant all on sequences to service_role;
alter default privileges in schema social grant execute on functions to service_role;

-- ---------------------------------------------------------------------------
-- Tables

create table social.posts (
  id         uuid primary key default gen_random_uuid(),
  author_id  uuid not null references auth.users (id) on delete cascade,
  body       text not null,
  created_at timestamptz not null default now(),
  deleted_at timestamptz,
  -- 1 to 2,000 characters, at least one visible character, no control
  -- characters other than tab and new line.
  constraint posts_body_valid check (
    char_length(body) between 1 and 2000
    and body ~ '\S'
    and body !~ '[\u0001-\u0008\u000B\u000C\u000E-\u001F\u007F]'
  ),
  constraint posts_deleted_after_created check (deleted_at is null or deleted_at >= created_at)
);
comment on table social.posts is 'Text posts. Deleting sets deleted_at; deleted posts are never shown.';
create index posts_live_by_created on social.posts (created_at desc) where deleted_at is null;
create index posts_live_by_author on social.posts (author_id, created_at desc) where deleted_at is null;

create table social.follows (
  follower_id uuid not null references auth.users (id) on delete cascade,
  creator_id  uuid not null references auth.users (id) on delete cascade,
  followed_at timestamptz not null default now(),
  primary key (follower_id, creator_id),
  constraint follows_not_self check (follower_id <> creator_id)
);
comment on table social.follows is 'Current follows. Every change is also recorded in social.follow_events.';
create index follows_by_creator on social.follows (creator_id);

create table social.follow_events (
  id          bigint generated always as identity primary key,
  follower_id uuid not null references auth.users (id) on delete cascade,
  creator_id  uuid not null references auth.users (id) on delete cascade,
  action      text not null,
  occurred_at timestamptz not null default now(),
  constraint follow_events_action check (action in ('followed', 'unfollowed')),
  constraint follow_events_not_self check (follower_id <> creator_id)
);
comment on table social.follow_events is 'Every follow and unfollow, append-only. Follows and Clique memberships are different records.';
create index follow_events_by_pair on social.follow_events (follower_id, creator_id, occurred_at);

create table social.clique_members (
  id             bigint generated always as identity primary key,
  fan_id         uuid not null references auth.users (id) on delete cascade,
  creator_id     uuid not null references auth.users (id) on delete cascade,
  added_at       timestamptz not null default now(),
  removed_at     timestamptz,
  removal_reason text,
  constraint clique_not_self check (fan_id <> creator_id),
  constraint clique_removal_reason check (removal_reason in ('removed', 'unfollowed')),
  constraint clique_removal_consistent check ((removed_at is null) = (removal_reason is null)),
  constraint clique_removed_after_added check (removed_at is null or removed_at >= added_at)
);
comment on table social.clique_members is 'Clique history: one row per membership, closed (never deleted or overwritten) when it ends. At most 10 open rows per fan.';
create unique index clique_one_open_per_pair on social.clique_members (fan_id, creator_id) where removed_at is null;
create index clique_open_by_fan on social.clique_members (fan_id) where removed_at is null;

create table social.likes (
  user_id    uuid not null references auth.users (id) on delete cascade,
  post_id    uuid not null references social.posts (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, post_id)
);
comment on table social.likes is 'One like per member per post.';
create index likes_by_post on social.likes (post_id);

create table social.comments (
  id         uuid primary key default gen_random_uuid(),
  post_id    uuid not null references social.posts (id) on delete cascade,
  author_id  uuid not null references auth.users (id) on delete cascade,
  body       text not null,
  created_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint comments_body_valid check (
    char_length(body) between 1 and 1000
    and body ~ '\S'
    and body !~ '[\u0001-\u0008\u000B\u000C\u000E-\u001F\u007F]'
  ),
  constraint comments_deleted_after_created check (deleted_at is null or deleted_at >= created_at)
);
comment on table social.comments is 'Comments on posts. Deleting sets deleted_at; deleted comments are never shown.';
create index comments_live_by_post on social.comments (post_id, created_at) where deleted_at is null;
create index comments_by_author on social.comments (author_id, created_at desc);

alter table social.posts enable row level security;
alter table social.follows enable row level security;
alter table social.follow_events enable row level security;
alter table social.clique_members enable row level security;
alter table social.likes enable row level security;
alter table social.comments enable row level security;
-- No policies on purpose: only service_role (which bypasses row level
-- security) and the owner-run functions below can read or write.

grant all on table social.posts, social.follows, social.follow_events, social.clique_members, social.likes, social.comments to service_role;

-- ---------------------------------------------------------------------------
-- Guards that hold whatever writes the rows (defence in depth).

-- A Clique membership needs a current follow, and a fan has at most 10 open
-- memberships. The caller (social.clique_add) takes a per-fan lock first, so
-- two requests can't both take the last slot.
create function social.clique_members_guard()
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
    if (select count(*) from social.clique_members c
        where c.fan_id = new.fan_id and c.removed_at is null and c.id is distinct from new.id) >= 10 then
      raise exception 'clique_full' using errcode = 'P0001', detail = 'A Clique holds at most 10 creators.';
    end if;
  end if;
  return new;
end;
$$;
revoke all on function social.clique_members_guard() from public, anon, authenticated;

create trigger clique_members_guard
  before insert or update on social.clique_members
  for each row execute function social.clique_members_guard();

-- History is append-only: follow events and closed Clique rows never change.
-- Deleting an account still removes its history: those deletes come from the
-- foreign keys' cascade (run inside triggers, so pg_trigger_depth() > 0),
-- which the triggers below let through. Any direct update or delete is refused.
create function social.history_is_append_only()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if tg_table_name = 'follow_events' then
    raise exception 'follow history is append-only' using errcode = 'P0001';
  end if;
  -- clique_members: only closing an open row is allowed, and only once.
  if tg_op = 'DELETE' then
    raise exception 'Clique history is never deleted' using errcode = 'P0001';
  end if;
  if old.removed_at is not null
     or new.fan_id <> old.fan_id or new.creator_id <> old.creator_id or new.added_at <> old.added_at then
    raise exception 'Clique history is never rewritten' using errcode = 'P0001';
  end if;
  return new;
end;
$$;
revoke all on function social.history_is_append_only() from public, anon, authenticated;

create trigger follow_events_append_only
  before update or delete on social.follow_events
  for each row when (pg_trigger_depth() = 0)
  execute function social.history_is_append_only();

create trigger clique_members_append_only
  before update or delete on social.clique_members
  for each row when (pg_trigger_depth() = 0)
  execute function social.history_is_append_only();

-- ---------------------------------------------------------------------------
-- Internal helpers (social schema: not callable by members).

-- The signed-in member, with a complete profile (username and display name).
create function social.current_member()
returns uuid
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'not_signed_in' using errcode = 'P0001';
  end if;
  if not exists (
    select 1 from public.profiles p
    where p.id = v_uid and p.username is not null and p.display_name is not null
  ) then
    raise exception 'profile_incomplete' using errcode = 'P0001', detail = 'Choose a username and display name first.';
  end if;
  return v_uid;
end;
$$;
revoke all on function social.current_member() from public, anon, authenticated;

-- A member others can follow: a complete profile.
create function social.is_member(p_user uuid)
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = p_user and p.username is not null and p.display_name is not null
  );
$$;
revoke all on function social.is_member(uuid) from public, anon, authenticated;

-- Simple per-member rate limits, counted from the member's own rows.
create function social.rate_check(p_kind text, p_user uuid)
returns void
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  n int;
  v_limit int;
begin
  if p_kind = 'post' then
    select count(*) into n from social.posts where author_id = p_user and created_at > pg_catalog.now() - interval '1 hour';
    v_limit := 20;
  elsif p_kind = 'comment' then
    select count(*) into n from social.comments where author_id = p_user and created_at > pg_catalog.now() - interval '1 hour';
    v_limit := 60;
  elsif p_kind = 'follow' then
    select count(*) into n from social.follow_events where follower_id = p_user and occurred_at > pg_catalog.now() - interval '1 hour';
    v_limit := 120;
  else
    raise exception 'unknown rate limit %', p_kind;
  end if;
  if n >= v_limit then
    raise exception 'rate_limited' using errcode = 'P0001', detail = 'Please slow down and try again later.';
  end if;
end;
$$;
revoke all on function social.rate_check(text, uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Member functions: reads. Every post row has the same shape.

create function public.app_me()
returns table (
  id uuid, username text, display_name text, complete boolean,
  following_count bigint, follower_count bigint, clique_count bigint, post_count bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'not_signed_in' using errcode = 'P0001';
  end if;
  return query
  select p.id, p.username, p.display_name,
         (p.username is not null and p.display_name is not null),
         (select count(*) from social.follows f where f.follower_id = p.id),
         (select count(*) from social.follows f where f.creator_id = p.id),
         (select count(*) from social.clique_members c where c.fan_id = p.id and c.removed_at is null),
         (select count(*) from social.posts s where s.author_id = p.id and s.deleted_at is null)
  from public.profiles p
  where p.id = v_uid;
end;
$$;
comment on function public.app_me() is 'The signed-in member''s own profile and counts.';

create function public.app_feed(p_before timestamptz default null, p_limit integer default 20)
returns table (
  id uuid, author_id uuid, author_username text, author_display_name text,
  body text, created_at timestamptz, like_count bigint, comment_count bigint,
  liked_by_me boolean, author_in_my_clique boolean, is_mine boolean
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
         exists (select 1 from social.clique_members m where m.fan_id = v_uid and m.creator_id = s.author_id and m.removed_at is null),
         s.author_id = v_uid
  from social.posts s
  join public.profiles p on p.id = s.author_id
  where s.deleted_at is null
    and (s.author_id = v_uid or exists (select 1 from social.follows f where f.follower_id = v_uid and f.creator_id = s.author_id))
    and (p_before is null or s.created_at < p_before)
  order by s.created_at desc, s.id desc
  limit least(greatest(coalesce(p_limit, 20), 1), 50);
end;
$$;
comment on function public.app_feed(timestamptz, integer) is 'Following feed: posts from people the member follows, and their own, newest first.';

create function public.app_member(p_username text)
returns table (
  id uuid, username text, display_name text, post_count bigint, follower_count bigint,
  following_count bigint, followed_by_me boolean, in_my_clique boolean, is_me boolean
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
         p.id = v_uid
  from public.profiles p
  where p.username = lower(pg_catalog.btrim(coalesce(p_username, '')))
    and p.display_name is not null;
end;
$$;
comment on function public.app_member(text) is 'One member''s public profile (username and display name only) and counts.';

create function public.app_member_posts(p_member uuid, p_before timestamptz default null, p_limit integer default 20)
returns table (
  id uuid, author_id uuid, author_username text, author_display_name text,
  body text, created_at timestamptz, like_count bigint, comment_count bigint,
  liked_by_me boolean, author_in_my_clique boolean, is_mine boolean
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
         exists (select 1 from social.clique_members m where m.fan_id = v_uid and m.creator_id = s.author_id and m.removed_at is null),
         s.author_id = v_uid
  from social.posts s
  join public.profiles p on p.id = s.author_id
  where s.deleted_at is null
    and s.author_id = p_member
    and (p_before is null or s.created_at < p_before)
  order by s.created_at desc, s.id desc
  limit least(greatest(coalesce(p_limit, 20), 1), 50);
end;
$$;
comment on function public.app_member_posts(uuid, timestamptz, integer) is 'One member''s posts, newest first.';

create function public.app_post(p_post uuid)
returns table (
  id uuid, author_id uuid, author_username text, author_display_name text,
  body text, created_at timestamptz, like_count bigint, comment_count bigint,
  liked_by_me boolean, author_in_my_clique boolean, is_mine boolean
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
         exists (select 1 from social.clique_members m where m.fan_id = v_uid and m.creator_id = s.author_id and m.removed_at is null),
         s.author_id = v_uid
  from social.posts s
  join public.profiles p on p.id = s.author_id
  where s.id = p_post and s.deleted_at is null;
end;
$$;
comment on function public.app_post(uuid) is 'One live post.';

create function public.app_comments(p_post uuid)
returns table (
  id uuid, post_id uuid, author_id uuid, author_username text, author_display_name text,
  body text, created_at timestamptz, is_mine boolean
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
  select c.id, c.post_id, c.author_id, p.username, p.display_name, c.body, c.created_at, c.author_id = v_uid
  from social.comments c
  join social.posts s on s.id = c.post_id and s.deleted_at is null
  join public.profiles p on p.id = c.author_id
  where c.post_id = p_post and c.deleted_at is null
  order by c.created_at, c.id
  limit 200;
end;
$$;
comment on function public.app_comments(uuid) is 'Live comments on a live post, oldest first.';

create function public.app_discover(p_query text default null, p_limit integer default 30)
returns table (
  id uuid, username text, display_name text, post_count bigint, follower_count bigint,
  followed_by_me boolean, in_my_clique boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := social.current_member();
  v_q text := nullif(lower(pg_catalog.btrim(coalesce(p_query, ''))), '');
begin
  return query
  select p.id, p.username, p.display_name,
         (select count(*) from social.posts s where s.author_id = p.id and s.deleted_at is null) as posts,
         (select count(*) from social.follows f where f.creator_id = p.id),
         exists (select 1 from social.follows f where f.follower_id = v_uid and f.creator_id = p.id),
         exists (select 1 from social.clique_members m where m.fan_id = v_uid and m.creator_id = p.id and m.removed_at is null)
  from public.profiles p
  where p.id <> v_uid
    and p.username is not null and p.display_name is not null
    and (v_q is null
         or pg_catalog.strpos(p.username, v_q) > 0
         or pg_catalog.strpos(lower(p.display_name), v_q) > 0)
  order by (select max(s.created_at) from social.posts s where s.author_id = p.id and s.deleted_at is null) desc nulls last,
           p.username
  limit least(greatest(coalesce(p_limit, 30), 1), 50);
end;
$$;
comment on function public.app_discover(text, integer) is 'Members to follow, most recently active first; optional search by username or display name.';

create function public.app_following()
returns table (
  id uuid, username text, display_name text, followed_at timestamptz,
  in_my_clique boolean, clique_added_at timestamptz
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
         m.added_at is not null, m.added_at
  from social.follows f
  join public.profiles p on p.id = f.creator_id
  left join social.clique_members m on m.fan_id = v_uid and m.creator_id = f.creator_id and m.removed_at is null
  where f.follower_id = v_uid
  order by m.added_at is null, m.added_at, p.display_name;
end;
$$;
comment on function public.app_following() is 'Everyone the member follows, Clique members first.';

-- ---------------------------------------------------------------------------
-- Member functions: writes.

create function public.app_create_post(p_body text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := social.current_member();
  v_body text := pg_catalog.btrim(coalesce(p_body, ''), e' \t\r\n');
  v_id uuid;
begin
  if v_body = '' then
    raise exception 'empty' using errcode = 'P0001';
  end if;
  if char_length(v_body) > 2000 then
    raise exception 'too_long' using errcode = 'P0001';
  end if;
  perform social.rate_check('post', v_uid);
  insert into social.posts (author_id, body) values (v_uid, v_body) returning social.posts.id into v_id;
  return v_id;
end;
$$;
comment on function public.app_create_post(text) is 'Publishes a text post (1 to 2,000 characters).';

create function public.app_delete_post(p_post uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := social.current_member();
begin
  update social.posts set deleted_at = pg_catalog.now()
  where id = p_post and author_id = v_uid and deleted_at is null;
  if not found then
    raise exception 'not_found' using errcode = 'P0001';
  end if;
end;
$$;
comment on function public.app_delete_post(uuid) is 'Deletes one of the member''s own posts.';

create function public.app_follow(p_creator uuid)
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
  if not social.is_member(p_creator) then
    raise exception 'not_found' using errcode = 'P0001';
  end if;
  if exists (select 1 from social.follows where follower_id = v_uid and creator_id = p_creator) then
    return; -- already following: nothing changes, nothing is recorded twice
  end if;
  perform social.rate_check('follow', v_uid);
  insert into social.follows (follower_id, creator_id) values (v_uid, p_creator);
  insert into social.follow_events (follower_id, creator_id, action) values (v_uid, p_creator, 'followed');
end;
$$;
comment on function public.app_follow(uuid) is 'Follows a member. Following someone never adds them to the Clique.';

create function public.app_unfollow(p_creator uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := social.current_member();
begin
  delete from social.follows where follower_id = v_uid and creator_id = p_creator;
  if not found then
    return; -- not following: nothing changes
  end if;
  insert into social.follow_events (follower_id, creator_id, action) values (v_uid, p_creator, 'unfollowed');
  -- A Clique needs a follow: close an open membership, keeping its history.
  update social.clique_members set removed_at = pg_catalog.now(), removal_reason = 'unfollowed'
  where fan_id = v_uid and creator_id = p_creator and removed_at is null;
end;
$$;
comment on function public.app_unfollow(uuid) is 'Unfollows a member, and closes their Clique membership if there was one.';

create function public.app_clique_add(p_creator uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := social.current_member();
begin
  if p_creator is null or p_creator = v_uid then
    raise exception 'cannot_add_self' using errcode = 'P0001';
  end if;
  -- One Clique change at a time per fan, so two requests can't both take the last slot.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('social.clique:' || v_uid::text, 0));
  if exists (select 1 from social.clique_members where fan_id = v_uid and creator_id = p_creator and removed_at is null) then
    return; -- already in the Clique
  end if;
  insert into social.clique_members (fan_id, creator_id) values (v_uid, p_creator);
end;
$$;
comment on function public.app_clique_add(uuid) is 'Adds a followed creator to the member''s Clique (at most 10).';

create function public.app_clique_remove(p_creator uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := social.current_member();
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('social.clique:' || v_uid::text, 0));
  update social.clique_members set removed_at = pg_catalog.now(), removal_reason = 'removed'
  where fan_id = v_uid and creator_id = p_creator and removed_at is null;
end;
$$;
comment on function public.app_clique_remove(uuid) is 'Removes a creator from the member''s Clique. The history is kept.';

create function public.app_like(p_post uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := social.current_member();
begin
  if not exists (select 1 from social.posts where id = p_post and deleted_at is null) then
    raise exception 'not_found' using errcode = 'P0001';
  end if;
  insert into social.likes (user_id, post_id) values (v_uid, p_post) on conflict do nothing;
end;
$$;
comment on function public.app_like(uuid) is 'Likes a live post. Liking twice changes nothing.';

create function public.app_unlike(p_post uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := social.current_member();
begin
  delete from social.likes where user_id = v_uid and post_id = p_post;
end;
$$;
comment on function public.app_unlike(uuid) is 'Removes the member''s like from a post.';

create function public.app_add_comment(p_post uuid, p_body text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := social.current_member();
  v_body text := pg_catalog.btrim(coalesce(p_body, ''), e' \t\r\n');
  v_id uuid;
begin
  if not exists (select 1 from social.posts where id = p_post and deleted_at is null) then
    raise exception 'not_found' using errcode = 'P0001';
  end if;
  if v_body = '' then
    raise exception 'empty' using errcode = 'P0001';
  end if;
  if char_length(v_body) > 1000 then
    raise exception 'too_long' using errcode = 'P0001';
  end if;
  perform social.rate_check('comment', v_uid);
  insert into social.comments (post_id, author_id, body) values (p_post, v_uid, v_body) returning social.comments.id into v_id;
  return v_id;
end;
$$;
comment on function public.app_add_comment(uuid, text) is 'Comments on a live post (1 to 1,000 characters).';

create function public.app_delete_comment(p_comment uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := social.current_member();
begin
  update social.comments set deleted_at = pg_catalog.now()
  where id = p_comment and author_id = v_uid and deleted_at is null;
  if not found then
    raise exception 'not_found' using errcode = 'P0001';
  end if;
end;
$$;
comment on function public.app_delete_comment(uuid) is 'Deletes one of the member''s own comments.';

-- ---------------------------------------------------------------------------
-- Who may call the member functions: signed-in members only.

do $$
declare
  f regprocedure;
begin
  for f in
    select p.oid::regprocedure
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname like 'app\_%'
  loop
    execute pg_catalog.format('revoke all on function %s from public, anon', f);
    execute pg_catalog.format('grant execute on function %s to authenticated, service_role', f);
  end loop;
end $$;
