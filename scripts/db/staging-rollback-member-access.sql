-- Staging only: undoes 20261122000000 (member_access), so the earlier
-- rollbacks (viewed state, Inner Clique, publishing request ids, platform
-- access, social core, creator acquisition, waitlist), which refuse while a
-- later migration is recorded, can run after it. Never run it against
-- Production. Tested locally by scripts/db/rollback-member-access-test.sh.
--
--   psql "<url>" -X -q -v ON_ERROR_STOP=1 -v mode=check -v confirm= -f scripts/db/staging-rollback-member-access.sql
--   psql "<url>" -X -q -v ON_ERROR_STOP=1 -v mode=apply -v confirm='REMOVE THE STAGING MEMBER ACCESS' -f ...
--
-- Restores every function the migration changed to its previous definition
-- (generated from the migrations before 20261122000000), removes
-- app_access_state, app_set_profile, social.visible_members,
-- social.current_access, the grant/revoke/active helpers, both membership
-- tables and their triggers, restores direct profile updates (username and
-- display name, own row) and removes the migration record.
--
-- SECURITY: rolling back removes the membership gate. Every signed-in
-- account with a complete profile becomes a member again, including any
-- that were never granted or were revoked.
--
-- Refuses, changing nothing, if the record or an expected object is missing,
-- a later migration is recorded, or ANY membership or membership history row
-- exists. Once access has been granted, membership and its history are audit
-- data: problems are fixed forward (a new migration), never by deleting them.

\set ON_ERROR_STOP on
\pset footer off

begin;
set local lock_timeout = '10s';
set local statement_timeout = '60s';

-- An unset -v mode or -v confirm stops here with a syntax error, by design.
select set_config('crevant.rollback_mode', :'mode', true) as mode,
       set_config('crevant.rollback_confirm', :'confirm', true) <> '' as confirmation_given;

do $$
begin
  if current_setting('crevant.rollback_mode') not in ('check', 'apply') then
    raise exception 'mode must be check or apply';
  end if;
  if current_setting('crevant.rollback_mode') = 'apply'
     and current_setting('crevant.rollback_confirm') <> 'REMOVE THE STAGING MEMBER ACCESS' then
    raise exception 'apply needs the confirmation phrase: REMOVE THE STAGING MEMBER ACCESS';
  end if;
  if to_regclass('supabase_migrations.schema_migrations') is null then
    raise exception 'refused: no Supabase migration history here (supabase_migrations.schema_migrations)';
  end if;
  if not exists (select 1 from supabase_migrations.schema_migrations where version = '20261122000000')
     or to_regclass('ops.member_access') is null
     or to_regclass('ops.member_access_events') is null
     or to_regclass('social.visible_members') is null
     or to_regprocedure('social.current_access()') is null
     or to_regprocedure('public.app_access_state()') is null
     or to_regprocedure('public.app_set_profile(text, text)') is null then
    raise exception 'refused: expected objects are missing (20261122000000 member_access), so the database is not in the state this rollback was written for';
  end if;
  if exists (select 1 from supabase_migrations.schema_migrations where version > '20261122000000') then
    raise exception 'refused, nothing changed: a later migration is recorded';
  end if;
end $$;

-- Hold both tables still while checking and removing.
lock table ops.member_access, ops.member_access_events in access exclusive mode;

do $$
declare
  n bigint := (select count(*) from ops.member_access);
  h bigint := (select count(*) from ops.member_access_events);
begin
  if n > 0 or h > 0 then
    raise exception 'refused, nothing changed: % membership row(s) and % history row(s) exist (audit data). Fix forward with a new migration instead.', n, h;
  end if;
end $$;

\echo 'Checks passed. Restoring the previous member functions, then removing the membership gate and the migration record.'

create or replace function social.current_member()
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

create or replace function social.is_member(p_user uuid)
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

create or replace function ops.resolve_creator_link(p_code text)
returns table (status text, link_id uuid, creator_id uuid)
language sql
stable
set search_path = ''
as $$
  with l as (
    select l.id, l.creator_id, l.expires_at, l.revoked_at, c.status as creator_status
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
  join public.profiles p on p.id = s.author_id
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
  from public.profiles p
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
  join public.profiles p on p.id = s.author_id
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
  join public.profiles p on p.id = s.author_id
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
  join public.profiles p on p.id = c.author_id
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
  join public.profiles p on p.id = f.creator_id
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
  join public.profiles p on p.id = f.creator_id
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
  select p.username, p.display_name into v_username, v_display_name from public.profiles p where p.id = p_creator;
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
  if not exists (select 1 from social.posts where id = p_post and deleted_at is null) then
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

drop function public.app_access_state();
drop function public.app_set_profile(text, text);
drop view social.visible_members;
drop function social.current_access();
drop function ops.grant_member_access(uuid, text, text, timestamptz, text);
drop function ops.revoke_member_access(uuid, text, text);
drop function ops.member_access_active(uuid);
drop table ops.member_access;
drop function ops.member_access_record();
drop table ops.member_access_events;
drop function ops.member_access_events_append_only();

-- Direct profile updates, as before 20261122000000.
grant update (username, display_name) on table public.profiles to authenticated;
create policy "profiles: update own"
  on public.profiles for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

delete from supabase_migrations.schema_migrations where version = '20261122000000';

select current_setting('crevant.rollback_mode') = 'apply' as apply \gset
\if :apply
  commit;
  \echo 'Applied: the membership gate and its migration record were removed; the previous member functions and direct profile updates are restored.'
\else
  rollback;
  \echo 'Check only: every check and the removal succeeded inside the transaction, and all of it was rolled back. Nothing changed.'
\endif
