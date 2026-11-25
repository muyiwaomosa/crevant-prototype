-- Staging only: undoes 20261201000000 (relationships: unlimited Clique,
-- follow source, mute, Active Supporter, Support Intent, Clique first Home,
-- relationship lists), so the earlier rollbacks, which refuse while a later
-- migration is recorded, can run after it. Never run it against a Production
-- project. Tested locally by scripts/db/rollback-relationships-test.sh.
--
--   psql "<url>" -X -q -v ON_ERROR_STOP=1 -v mode=check -v confirm= -f scripts/db/staging-rollback-relationships.sql
--   psql "<url>" -X -q -v ON_ERROR_STOP=1 -v mode=apply -v confirm='REMOVE THE STAGING RELATIONSHIPS' -f ...
--
-- Removes exactly the migration's objects and record, and restores every
-- function it replaced as the earlier migrations defined it.
--
-- It refuses, changing nothing, if member data exists that the rollback would
-- lose or contradict: mutes or mute history, Support Intent, follows with a
-- recorded source, mute or Support Intent events, or a Clique larger than 25
-- (the restored limit). Once that exists, fix forward with a new migration.
-- It also refuses if the record or an expected object is missing, or a later
-- migration is recorded.

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
     and current_setting('crevant.rollback_confirm') <> 'REMOVE THE STAGING RELATIONSHIPS' then
    raise exception 'apply needs the confirmation phrase: REMOVE THE STAGING RELATIONSHIPS';
  end if;
  if to_regclass('supabase_migrations.schema_migrations') is null then
    raise exception 'refused: no Supabase migration history here (supabase_migrations.schema_migrations)';
  end if;
  if not exists (select 1 from supabase_migrations.schema_migrations where version = '20261201000000')
     or to_regclass('social.mutes') is null or to_regclass('social.mute_events') is null
     or to_regclass('intent.support_intents') is null
     or to_regprocedure('public.app_follow(uuid, text)') is null
     or to_regprocedure('public.app_home_priority(integer)') is null
     or to_regprocedure('social.is_active_supporter(uuid, uuid)') is null
     or not exists (select 1 from information_schema.columns where table_schema = 'social' and table_name = 'follow_events' and column_name = 'source') then
    raise exception 'refused: expected objects are missing (20261201000000 relationships), so the database is not in the state this rollback was written for';
  end if;
  if exists (select 1 from supabase_migrations.schema_migrations where version > '20261201000000') then
    raise exception 'refused, nothing changed: a later migration is recorded';
  end if;
end $$;

lock table social.mutes, social.mute_events, intent.support_intents, social.follow_events, social.clique_members, analytics.events
  in share row exclusive mode;

do $$
declare
  n bigint;
begin
  n := (select count(*) from social.mutes) + (select count(*) from social.mute_events)
       + (select count(*) from intent.support_intents)
       + (select count(*) from social.follow_events where source is not null)
       + (select count(*) from analytics.events where name in ('muted', 'unmuted', 'support_intent_recorded'));
  if n > 0 then
    raise exception 'refused, nothing changed: % rows of member data exist (mutes, Support Intent, follow sources or their events). Fix forward with a new migration instead.', n;
  end if;
  if exists (select 1 from social.clique_members where removed_at is null group by fan_id having count(*) > 25) then
    raise exception 'refused, nothing changed: a member''s Clique holds more than 25, the limit this rollback would restore. Fix forward instead.';
  end if;
end $$;

\echo 'Checks passed. Removing relationships and its migration record.'

-- Events: back to the foundation v2 capture.
drop trigger events_mute_events on social.mute_events;
drop trigger events_support_intents on intent.support_intents;
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
      perform analytics.record('comment_added', new.author_id, v_author, new.post_id);
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
    perform analytics.record(new.action, new.follower_id, new.creator_id, null);
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
  end if;
  return null;
end;
$$;
revoke all on function analytics.capture() from public, anon, authenticated;

-- New member functions.
drop function public.app_my_audience();
drop function public.app_my_relationships();
drop function public.app_support_intent(uuid);
drop function public.app_record_support_intent(uuid, text);
drop function public.app_home_priority(integer);
drop function public.app_unmute(uuid);
drop function public.app_mute(uuid);

-- Follow: back to the social core version (no source, no mute).
drop function public.app_follow(uuid, text);
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
revoke all on function public.app_follow(uuid) from public, anon;
grant execute on function public.app_follow(uuid) to authenticated, service_role;

-- Profile: back to the pilot membership version.
drop function public.app_member(text);
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
  from social.visible_members p
  where p.username = lower(pg_catalog.btrim(coalesce(p_username, '')))
    and p.display_name is not null;
end;
$$;
comment on function public.app_member(text) is 'One member''s public profile (username and display name only) and counts.';
revoke all on function public.app_member(text) from public, anon;
grant execute on function public.app_member(text) to authenticated, service_role;

-- Home paging: back to the foundation v2 version (no mutes).
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
    and (p_before_at is null or (s.created_at, s.id) < (p_before_at, p_before_id))
  order by s.created_at desc, s.id desc
  limit least(greatest(coalesce(p_limit, 20), 1), 50);
end;
$$;

-- Catch-up strip: back to the pilot membership version (no mutes).
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

-- Support Intent, mute, Active Supporter.
drop trigger support_intents_append_only on intent.support_intents;
drop function intent.support_intents_append_only();
drop table intent.support_intents;
drop index social.comments_live_by_author_time;
drop function social.is_active_supporter(uuid, uuid);
drop function social.meaningful_comment(text);
drop trigger mute_events_append_only on social.mute_events;
drop function social.mute_history_is_append_only();
drop table social.mute_events;
drop table social.mutes;

-- Follow source.
alter table social.follow_events drop constraint follow_events_source;
alter table social.follow_events drop column source;

-- The Clique guard: back to the Inner Clique version (25, a follow required).
create or replace function social.clique_members_guard()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.removed_at is null then
    if not exists (select 1 from social.follows f where f.follower_id = new.fan_id and f.creator_id = new.creator_id) then
      raise exception 'not_following' using errcode = 'P0001', detail = 'An Inner Clique can only include creators you follow.';
    end if;
    if (select count(*) from social.clique_members c
        where c.fan_id = new.fan_id and c.removed_at is null and c.id is distinct from new.id) >= 25 then
      raise exception 'clique_full' using errcode = 'P0001', detail = 'An Inner Clique holds at most 25 creators.';
    end if;
  end if;
  return new;
end;
$$;
comment on function social.clique_members_guard() is 'An Inner Clique membership needs a current follow, and a member has at most 25 open memberships.';

delete from supabase_migrations.schema_migrations where version = '20261201000000';

select current_setting('crevant.rollback_mode') = 'apply' as apply \gset
\if :apply
  commit;
  \echo 'Applied: relationships and its migration record were removed; every replaced function is as before.'
\else
  rollback;
  \echo 'Check only: every check and the removal succeeded inside the transaction, and all of it was rolled back. Nothing changed.'
\endif
