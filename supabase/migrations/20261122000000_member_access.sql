-- Pilot membership access control (Build 4, core of milestone M3).
-- STAGING ONLY until approved for Production (see supabase/production-migrations.txt).
--
-- Three separate layers, checked in this order by every member function:
--   1. Authenticated identity: a signed-in Supabase account (auth.uid()).
--   2. Authorized pilot membership: an ACTIVE, UNEXPIRED row in
--      ops.member_access. Signing in never grants it; only the server-only
--      functions ops.grant_member_access / ops.revoke_member_access change it.
--   3. Complete profile: a username and display name (chosen after access).
--
-- What this migration does:
--   * ops.member_access (one row per account) and ops.member_access_events
--     (append-only history of every change, written by a trigger, so no
--     change can skip the record);
--   * ops.grant_member_access / ops.revoke_member_access, server only;
--   * social.current_access() (identity + membership) and
--     social.current_member() (identity + membership + complete profile).
--     Every public.app_* function except app_access_state() goes through
--     one of them, so membership is enforced by the database for every read
--     and every action, whatever the app does;
--   * social.visible_members: members others may see or interact with
--     (complete profile AND active access). Content and profiles of accounts
--     without active access (never granted, revoked or expired) disappear
--     from every member's feed, profile pages, comments, Discover, Following,
--     Unseen and Catch-up, and can't be followed, liked, commented on or
--     added to an Inner Clique;
--   * public.app_access_state(): the signed-in account's own membership
--     state only, so the app can explain why access is unavailable;
--   * public.app_set_profile(): choosing a username and display name now
--     needs membership; direct UPDATE on public.profiles is withdrawn;
--   * creator invite links resolve only while the creator has active access.
--
-- It grants NOTHING. No existing account receives access: after this
-- migration every existing account is signed-in-only until the founder
-- grants access explicitly. No existing row is changed or deleted.

-- ---------------------------------------------------------------------------
-- 1. Membership and its history (ops: server only, like the rest of ops).

create table ops.member_access (
  user_id     uuid primary key references auth.users (id) on delete cascade,
  cohort      text not null check (cohort in ('founder', 'creator', 'fan', 'tester')),
  status      text not null check (status in ('active', 'revoked')),
  expires_at  timestamptz,
  granted_at  timestamptz not null default pg_catalog.now(),
  revoked_at  timestamptz,
  updated_at  timestamptz not null default pg_catalog.now(),
  -- Who made the latest change: a label such as 'founder', never an email.
  updated_by  text not null check (char_length(updated_by) between 1 and 100 and strpos(updated_by, '@') = 0),
  reason      text check (reason is null or (char_length(reason) <= 500 and strpos(reason, '@') = 0)),
  constraint member_access_revoked_consistent check ((status = 'revoked') = (revoked_at is not null))
);
comment on table ops.member_access is 'Pilot membership: one row per account. Active and unexpired = may use the member app. Changed only through ops.grant_member_access / ops.revoke_member_access; every change is recorded in ops.member_access_events.';

create table ops.member_access_events (
  id          bigint generated always as identity primary key,
  -- No foreign key: the history outlives the account (retention per the pilot data decisions).
  user_id     uuid not null,
  action      text not null check (action in ('granted', 'restored', 'revoked', 'changed', 'removed')),
  cohort      text,
  status      text,
  expires_at  timestamptz,
  actor       text not null,
  reason      text,
  occurred_at timestamptz not null default pg_catalog.now()
);
create index member_access_events_user on ops.member_access_events (user_id, occurred_at);
comment on table ops.member_access_events is 'Append-only history of every pilot membership change (grant, restore, revoke, change, removal with the account).';

alter table ops.member_access enable row level security;
alter table ops.member_access_events enable row level security;
-- No policies: members never read or write these tables.
revoke all on table ops.member_access, ops.member_access_events from public, anon, authenticated;
grant select, insert, update, delete on table ops.member_access to service_role;
grant select on table ops.member_access_events to service_role;

-- Every change to ops.member_access is recorded, however it is made.
create function ops.member_access_record()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_action text;
begin
  if tg_op = 'DELETE' then
    insert into ops.member_access_events (user_id, action, cohort, status, expires_at, actor, reason)
    values (old.user_id, 'removed', old.cohort, old.status, old.expires_at, 'account_deleted', null);
    return old;
  end if;
  if tg_op = 'INSERT' then
    v_action := case when new.status = 'active' then 'granted' else 'revoked' end;
  elsif old.status = 'revoked' and new.status = 'active' then
    v_action := 'restored';
  elsif old.status = 'active' and new.status = 'revoked' then
    v_action := 'revoked';
  else
    v_action := 'changed';
  end if;
  insert into ops.member_access_events (user_id, action, cohort, status, expires_at, actor, reason)
  values (new.user_id, v_action, new.cohort, new.status, new.expires_at, new.updated_by, new.reason);
  return new;
end;
$$;
revoke all on function ops.member_access_record() from public, anon, authenticated;
create trigger member_access_record
after insert or update or delete on ops.member_access
for each row execute function ops.member_access_record();

-- The history can't be edited or erased.
create function ops.member_access_events_append_only()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'member access history is append-only';
end;
$$;
revoke all on function ops.member_access_events_append_only() from public, anon, authenticated;
create trigger member_access_events_no_update
before update or delete on ops.member_access_events
for each row execute function ops.member_access_events_append_only();
create trigger member_access_events_no_truncate
before truncate on ops.member_access_events
for each statement execute function ops.member_access_events_append_only();

-- True while the account's membership is active and unexpired.
create function ops.member_access_active(p_user uuid)
returns boolean
language sql
stable
set search_path = ''
as $$
  select exists (
    select 1 from ops.member_access a
    where a.user_id = p_user and a.status = 'active' and (a.expires_at is null or a.expires_at > pg_catalog.now())
  );
$$;
revoke all on function ops.member_access_active(uuid) from public, anon, authenticated;

-- Grants (or restores, or changes) pilot membership. Server only: run by the
-- founder through an approved process; members can never call it.
create function ops.grant_member_access(
  p_user uuid, p_cohort text, p_actor text, p_expires_at timestamptz default null, p_reason text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_user is null or not exists (select 1 from auth.users u where u.id = p_user and u.email_confirmed_at is not null) then
    raise exception 'grant refused: no confirmed account with that id';
  end if;
  if p_expires_at is not null and p_expires_at <= pg_catalog.now() then
    raise exception 'grant refused: the expiry must be in the future';
  end if;
  insert into ops.member_access as a (user_id, cohort, status, expires_at, updated_by, reason)
  values (p_user, p_cohort, 'active', p_expires_at, p_actor, p_reason)
  on conflict (user_id) do update
    set cohort = excluded.cohort, status = 'active', expires_at = excluded.expires_at,
        granted_at = case when a.status = 'revoked' then pg_catalog.now() else a.granted_at end,
        revoked_at = null, updated_at = pg_catalog.now(), updated_by = excluded.updated_by, reason = excluded.reason;
end;
$$;
revoke all on function ops.grant_member_access(uuid, text, text, timestamptz, text) from public, anon, authenticated;
grant execute on function ops.grant_member_access(uuid, text, text, timestamptz, text) to service_role;

-- Revokes pilot membership. Takes effect on the account's very next request.
create function ops.revoke_member_access(p_user uuid, p_actor text, p_reason text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update ops.member_access
  set status = 'revoked', revoked_at = pg_catalog.now(), updated_at = pg_catalog.now(), updated_by = p_actor, reason = p_reason
  where user_id = p_user and status = 'active';
  if not found then
    raise exception 'revoke refused: that account has no active membership';
  end if;
end;
$$;
revoke all on function ops.revoke_member_access(uuid, text, text) from public, anon, authenticated;
grant execute on function ops.revoke_member_access(uuid, text, text) to service_role;

-- ---------------------------------------------------------------------------
-- 2. Who may see and use the member app.

-- Members others may see or interact with: complete profile AND active access.
create view social.visible_members as
  select p.id, p.username, p.display_name
  from public.profiles p
  join ops.member_access a on a.user_id = p.id
  where p.username is not null and p.display_name is not null
    and a.status = 'active' and (a.expires_at is null or a.expires_at > pg_catalog.now());
revoke all on table social.visible_members from public, anon, authenticated;
comment on view social.visible_members is 'Members others may see or interact with: a complete profile and active, unexpired pilot membership.';

-- Layers 1 and 2: the signed-in account, with active pilot membership.
create function social.current_access()
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
  if not ops.member_access_active(v_uid) then
    raise exception 'no_pilot_access' using errcode = 'P0001', detail = 'Your pilot access is not active.';
  end if;
  return v_uid;
end;
$$;
revoke all on function social.current_access() from public, anon, authenticated;

-- Layers 1, 2 and 3: the signed-in member, with active access and a complete profile.
create or replace function social.current_member()
returns uuid
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_uid uuid := social.current_access();
begin
  if not exists (
    select 1 from public.profiles p
    where p.id = v_uid and p.username is not null and p.display_name is not null
  ) then
    raise exception 'profile_incomplete' using errcode = 'P0001', detail = 'Choose a username and display name first.';
  end if;
  return v_uid;
end;
$$;

-- A member others can follow: complete profile and active access.
create or replace function social.is_member(p_user uuid)
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select exists (select 1 from social.visible_members v where v.id = p_user);
$$;

-- ---------------------------------------------------------------------------
-- 3. Existing functions, unchanged except for the membership rules above.
--    Each is its latest definition with only those edits.

create or replace function public.app_me()
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
  -- Pilot membership first: the profile may still be incomplete.
  v_uid uuid := social.current_access();
begin
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

create or replace function public.app_feed(p_before timestamptz default null, p_limit integer default 20)
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
  join social.visible_members p on p.id = s.author_id
  where s.deleted_at is null
    and (s.author_id = v_uid or exists (select 1 from social.follows f where f.follower_id = v_uid and f.creator_id = s.author_id))
    and (p_before is null or s.created_at < p_before)
  order by s.created_at desc, s.id desc
  limit least(greatest(coalesce(p_limit, 20), 1), 50);
end;
$$;

create or replace function public.app_member(p_username text)
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
  from social.visible_members p
  where p.username = lower(pg_catalog.btrim(coalesce(p_username, '')))
    and p.display_name is not null;
end;
$$;

create or replace function public.app_member_posts(p_member uuid, p_before timestamptz default null, p_limit integer default 20)
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
  join social.visible_members p on p.id = s.author_id
  where s.deleted_at is null
    and s.author_id = p_member
    and (p_before is null or s.created_at < p_before)
  order by s.created_at desc, s.id desc
  limit least(greatest(coalesce(p_limit, 20), 1), 50);
end;
$$;

create or replace function public.app_post(p_post uuid)
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
  join social.visible_members p on p.id = s.author_id
  where s.id = p_post and s.deleted_at is null;
end;
$$;

create or replace function public.app_comments(p_post uuid)
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
  join social.visible_members pa on pa.id = s.author_id
  join social.visible_members p on p.id = c.author_id
  where c.post_id = p_post and c.deleted_at is null
  order by c.created_at, c.id
  limit 200;
end;
$$;

create or replace function public.app_discover(p_query text default null, p_limit integer default 30)
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
  from social.visible_members p
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

create or replace function public.app_following()
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
  join social.visible_members p on p.id = f.creator_id
  left join social.clique_members m on m.fan_id = v_uid and m.creator_id = f.creator_id and m.removed_at is null
  where f.follower_id = v_uid
  order by m.added_at is null, m.added_at, p.display_name;
end;
$$;

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
  order by (m.fan_id is null), u.latest desc, p.id;
end;
$$;

create or replace function public.app_catch_up(p_creator uuid, p_before_at timestamptz default null, p_before_id uuid default null)
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
  v_username text;
  v_display_name text;
begin
  if (p_before_at is null) <> (p_before_id is null) then
    raise exception 'invalid_request' using errcode = 'P0001';
  end if;
  -- One creator: look their name up once.
  select p.username, p.display_name into v_username, v_display_name from social.visible_members p where p.id = p_creator;
  return query
  select b.id, b.author_id, v_username, v_display_name, b.body, b.created_at,
         (select count(*) from social.likes l where l.post_id = b.id),
         (select count(*) from social.comments c where c.post_id = b.id and c.deleted_at is null),
         exists (select 1 from social.likes l where l.post_id = b.id and l.user_id = v_uid),
         exists (select 1 from social.clique_members m where m.fan_id = v_uid and m.creator_id = b.author_id and m.removed_at is null),
         false
  from (
    select s.id, s.author_id, s.body, s.created_at
    from social.posts s
    join social.follows f on f.follower_id = v_uid and f.creator_id = s.author_id
    join social.visible_members a on a.id = s.author_id
    where s.author_id = p_creator and s.deleted_at is null and s.created_at >= f.followed_at
      and not exists (select 1 from social.post_views v where v.viewer_id = v_uid and v.post_id = s.id)
      and (p_before_at is null or (s.created_at, s.id) < (p_before_at, p_before_id))
    order by s.created_at desc, s.id desc
    limit 20
  ) b
  order by b.created_at asc, b.id asc;
end;
$$;

create or replace function public.app_like(p_post uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := social.current_member();
begin
  if not exists (select 1 from social.posts s join social.visible_members a on a.id = s.author_id where s.id = p_post and s.deleted_at is null) then
    raise exception 'not_found' using errcode = 'P0001';
  end if;
  insert into social.likes (user_id, post_id) values (v_uid, p_post) on conflict do nothing;
end;
$$;

create or replace function public.app_add_comment(p_post uuid, p_body text)
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
  if not exists (select 1 from social.posts s join social.visible_members a on a.id = s.author_id where s.id = p_post and s.deleted_at is null) then
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

create or replace function public.app_add_comment(p_post uuid, p_body text, p_request_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := social.current_member();
  v_body text := pg_catalog.btrim(coalesce(p_body, ''), e' \t\r\n');
  v_id uuid;
  v_existing_post uuid;
  v_existing_body text;
begin
  if p_request_id is null then
    return public.app_add_comment(p_post, p_body);
  end if;

  -- A repeat of a request already stored: same post and text, same comment.
  select c.id, c.post_id, c.body into v_id, v_existing_post, v_existing_body
  from social.comments c where c.author_id = v_uid and c.client_request_id = p_request_id;
  if v_id is not null then
    if v_existing_post is distinct from p_post or v_existing_body is distinct from v_body then
      raise exception 'request_reused' using errcode = 'P0001';
    end if;
    return v_id;
  end if;

  if not exists (select 1 from social.posts s join social.visible_members a on a.id = s.author_id where s.id = p_post and s.deleted_at is null) then
    raise exception 'not_found' using errcode = 'P0001';
  end if;
  if v_body = '' then
    raise exception 'empty' using errcode = 'P0001';
  end if;
  if char_length(v_body) > 1000 then
    raise exception 'too_long' using errcode = 'P0001';
  end if;
  perform social.rate_check('comment', v_uid);

  insert into social.comments (post_id, author_id, body, client_request_id)
  values (p_post, v_uid, v_body, p_request_id)
  on conflict (author_id, client_request_id) where client_request_id is not null do nothing
  returning social.comments.id into v_id;

  if v_id is null then
    select c.id, c.post_id, c.body into v_id, v_existing_post, v_existing_body
    from social.comments c where c.author_id = v_uid and c.client_request_id = p_request_id;
    if v_existing_post is distinct from p_post or v_existing_body is distinct from v_body then
      raise exception 'request_reused' using errcode = 'P0001';
    end if;
  end if;
  return v_id;
end;
$$;

create or replace function public.app_mark_viewed(p_posts uuid[], p_basis text default 'visible')
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := social.current_member();
  v_ids uuid[];
  v_recent int;
  v_new int;
begin
  if p_basis is null or p_basis not in ('visible', 'played') then
    raise exception 'invalid_request' using errcode = 'P0001';
  end if;
  -- The 50-id limit applies to the request as sent, before repeats and nulls
  -- are removed, so an oversized request is refused however it is padded.
  if cardinality(coalesce(p_posts, '{}')) > 50 then
    raise exception 'too_many' using errcode = 'P0001';
  end if;
  select coalesce(array_agg(distinct x), '{}') into v_ids from unnest(coalesce(p_posts, '{}')) as x where x is not null;
  if cardinality(v_ids) = 0 then
    return 0;
  end if;

  -- One batch at a time per member, so the hourly count and the insert are a
  -- single step: simultaneous batches can't exceed the cap.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('social.views:' || v_uid::text, 0));

  -- What this batch would add: live posts by someone else, not yet viewed.
  select count(*) into v_new
  from social.posts s
  join social.visible_members a on a.id = s.author_id
  where s.id = any (v_ids) and s.deleted_at is null and s.author_id <> v_uid
    and not exists (select 1 from social.post_views v where v.viewer_id = v_uid and v.post_id = s.id);
  if v_new = 0 then
    return 0;
  end if;

  select count(*) into v_recent
  from social.post_views v
  where v.viewer_id = v_uid and v.viewed_at > pg_catalog.now() - interval '1 hour';
  if v_recent + v_new > 3000 then
    raise exception 'rate_limited' using errcode = 'P0001', detail = 'Please slow down and try again later.';
  end if;

  insert into social.post_views (viewer_id, post_id, basis)
  select v_uid, s.id, p_basis
  from social.posts s
  join social.visible_members a on a.id = s.author_id
  where s.id = any (v_ids) and s.deleted_at is null and s.author_id <> v_uid
  on conflict (viewer_id, post_id) do nothing;
  get diagnostics v_new = row_count;
  return v_new;
end;
$$;

create or replace function public.app_clique_add(p_creator uuid)
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
  if not social.is_member(p_creator) then
    raise exception 'not_found' using errcode = 'P0001';
  end if;
  -- One Inner Clique change at a time per member, so two requests can't both take the last slot.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('social.clique:' || v_uid::text, 0));
  if exists (select 1 from social.clique_members where fan_id = v_uid and creator_id = p_creator and removed_at is null) then
    return; -- already in the Inner Clique
  end if;
  perform social.rate_check('clique', v_uid);
  insert into social.clique_members (fan_id, creator_id) values (v_uid, p_creator);
end;
$$;

create or replace function public.app_clique_replace(p_remove uuid, p_add uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := social.current_member();
begin
  if p_add is null or p_add = v_uid then
    raise exception 'cannot_add_self' using errcode = 'P0001';
  end if;
  if not social.is_member(p_add) then
    raise exception 'not_found' using errcode = 'P0001';
  end if;
  if p_remove is null or p_remove = p_add then
    raise exception 'not_in_clique' using errcode = 'P0001';
  end if;
  -- One Inner Clique change at a time per member (shared with add, remove and unfollow).
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('social.clique:' || v_uid::text, 0));
  if not exists (select 1 from social.clique_members where fan_id = v_uid and creator_id = p_remove and removed_at is null) then
    raise exception 'not_in_clique' using errcode = 'P0001';
  end if;
  if exists (select 1 from social.clique_members where fan_id = v_uid and creator_id = p_add and removed_at is null) then
    raise exception 'already_in_clique' using errcode = 'P0001';
  end if;
  if not exists (select 1 from social.follows where follower_id = v_uid and creator_id = p_add) then
    raise exception 'not_following' using errcode = 'P0001';
  end if;
  perform social.rate_check('clique_replace', v_uid); -- two changes
  update social.clique_members set removed_at = pg_catalog.now(), removal_reason = 'replaced'
  where fan_id = v_uid and creator_id = p_remove and removed_at is null;
  insert into social.clique_members (fan_id, creator_id) values (v_uid, p_add);
end;
$$;

create or replace function ops.resolve_creator_link(p_code text)
returns table (status text, link_id uuid, creator_id uuid)
language sql
stable
set search_path = ''
as $$
  with l as (
    select l.id, l.creator_id, l.expires_at, l.revoked_at,
           case when c.status = 'accepted' and ops.member_access_active(l.creator_id) then 'accepted' else 'inactive' end as creator_status
    from ops.creator_links l
    join ops.pilot_creators c on c.user_id = l.creator_id
    where p_code ~ '^[0-9a-f]{20}$' and l.code = p_code
  )
  select
    case
      when not exists (select 1 from l) then 'unknown'
      when (select revoked_at from l) is not null then 'revoked'
      when (select expires_at from l) <= now() then 'expired'
      when (select creator_status from l) <> 'accepted' then 'creator_inactive'
      else 'valid'
    end,
    case when (select revoked_at from l) is null and (select expires_at from l) > now() and (select creator_status from l) = 'accepted'
         then (select id from l) end,
    case when (select revoked_at from l) is null and (select expires_at from l) > now() and (select creator_status from l) = 'accepted'
         then (select creator_id from l) end;
$$;

-- ---------------------------------------------------------------------------
-- 4. The signed-in account's own membership state, and profile setup.

-- Only the caller's own state: 'active', 'none', 'revoked' or 'expired'.
-- Callable by any signed-in account (it reveals nothing about anyone else).
create function public.app_access_state()
returns table (status text, expires_at timestamptz)
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
  select case
           when a.user_id is null then 'none'
           when a.status = 'revoked' then 'revoked'
           when a.expires_at is not null and a.expires_at <= pg_catalog.now() then 'expired'
           else 'active'
         end,
         case when a.status = 'active' then a.expires_at end
  from (select 1) one
  left join ops.member_access a on a.user_id = v_uid;
end;
$$;
comment on function public.app_access_state() is 'The signed-in account''s own pilot membership state (active, none, revoked or expired). Reveals nothing about other accounts.';

-- Choosing a username and display name: pilot members only.
create function public.app_set_profile(p_username text, p_display_name text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := social.current_access();
begin
  update public.profiles set username = p_username, display_name = p_display_name where id = v_uid;
end;
$$;
comment on function public.app_set_profile(text, text) is 'Sets the member''s own username and display name (the existing profile rules apply). Needs active pilot membership.';

revoke all on function public.app_access_state() from public, anon;
revoke all on function public.app_set_profile(text, text) from public, anon;
grant execute on function public.app_access_state() to authenticated, service_role;
grant execute on function public.app_set_profile(text, text) to authenticated, service_role;

-- Members no longer update public.profiles directly: profile setup goes
-- through app_set_profile, which checks membership. Reading the own row stays.
revoke update on table public.profiles from authenticated;
drop policy "profiles: update own" on public.profiles;
