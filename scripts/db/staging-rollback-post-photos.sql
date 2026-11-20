-- Staging only: undoes 20261127000000 (photo posts), so the earlier
-- rollbacks, which refuse while a later migration is recorded, can run after
-- it. Never run it against Production. Tested locally by
-- scripts/db/rollback-post-photos-test.sh.
--
--   psql "<url>" -X -q -v ON_ERROR_STOP=1 -v mode=check -v confirm= -f scripts/db/staging-rollback-post-photos.sql
--   psql "<url>" -X -q -v ON_ERROR_STOP=1 -v mode=apply -v confirm='REMOVE THE STAGING PHOTO POSTS' -f ...
--
-- Restores the four post readers (20261122000000) and app_report
-- (20261124000000) exactly, the original post text rule, and removes the
-- photo functions, tables, triggers, the post-photos bucket and the
-- migration record. Avatars are not touched.
--
-- Refuses, changing nothing, if the record or an expected object is missing,
-- a later migration is recorded, or ANY upload, photo post, queued deletion,
-- drain run, settings change or processing check exists, or any file is in
-- the post-photos bucket. Once any exist, fix forward instead.

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
     and current_setting('crevant.rollback_confirm') <> 'REMOVE THE STAGING PHOTO POSTS' then
    raise exception 'apply needs the confirmation phrase: REMOVE THE STAGING PHOTO POSTS';
  end if;
  if to_regclass('supabase_migrations.schema_migrations') is null then
    raise exception 'refused: no Supabase migration history here (supabase_migrations.schema_migrations)';
  end if;
  if not exists (select 1 from supabase_migrations.schema_migrations where version = '20261127000000')
     or to_regclass('social.post_media') is null
     or to_regclass('social.media_uploads') is null
     or to_regclass('ops.media_deletions') is null
     or to_regclass('ops.media_settings') is null
     or to_regprocedure('public.app_create_post(text, uuid, uuid, text)') is null then
    raise exception 'refused: expected objects are missing (20261127000000 photo posts), so the database is not in the state this rollback was written for';
  end if;
  if exists (select 1 from supabase_migrations.schema_migrations where version > '20261127000000') then
    raise exception 'refused, nothing changed: a later migration is recorded';
  end if;
end $$;

lock table social.posts, social.post_media, social.media_uploads, ops.media_deletions, ops.media_drain_runs, ops.media_admin_events in share row exclusive mode;

do $$
declare
  u bigint := (select count(*) from social.media_uploads) + (select count(*) from social.post_media);
  p bigint := (select count(*) from social.posts where media_kind is not null);
  q bigint := (select count(*) from ops.media_deletions) + (select count(*) from ops.media_drain_runs);
  e bigint := (select count(*) from ops.media_admin_events);
  o bigint := 0;
begin
  if to_regclass('storage.objects') is not null then
    execute $q$select count(*) from storage.objects where bucket_id = 'post-photos'$q$ into o;
  end if;
  if u > 0 or p > 0 or q > 0 or e > 0 or o > 0 then
    raise exception 'refused, nothing changed: % upload or photo record(s), % photo post(s), % queued deletion(s) or drain run(s), % settings change(s) or processing check(s) and % file(s) in post-photos exist. Fix forward with a new migration instead.', u, p, q, e, o;
  end if;
end $$;

\echo 'Checks passed. Restoring the post readers, app_report and the text rule, then removing photo posts and its migration record.'

drop function public.app_feed(timestamptz, integer);
drop function public.app_member_posts(uuid, timestamptz, integer);
drop function public.app_post(uuid);
drop function public.app_catch_up(uuid, timestamptz, uuid);

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
  join social.visible_members p on p.id = s.author_id
  where s.deleted_at is null
    and (s.author_id = v_uid or exists (select 1 from social.follows f where f.follower_id = v_uid and f.creator_id = s.author_id))
    and (p_before is null or s.created_at < p_before)
  order by s.created_at desc, s.id desc
  limit least(greatest(coalesce(p_limit, 20), 1), 50);
end;
$$;

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
  join social.visible_members p on p.id = s.author_id
  where s.deleted_at is null
    and s.author_id = p_member
    and (p_before is null or s.created_at < p_before)
  order by s.created_at desc, s.id desc
  limit least(greatest(coalesce(p_limit, 20), 1), 50);
end;
$$;

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
  join social.visible_members p on p.id = s.author_id
  where s.id = p_post and s.deleted_at is null;
end;
$$;

create function public.app_catch_up(p_creator uuid, p_before_at timestamptz default null, p_before_id uuid default null)
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

create or replace function public.app_report(p_target_type text, p_target_id uuid, p_reason text, p_details text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := social.current_member();
  v_details text := nullif(pg_catalog.regexp_replace(coalesce(p_details, ''), '^\s+|\s+$', '', 'g'), '');
  v_owner uuid;
  v_snapshot jsonb;
begin
  perform ops.purge_expired_report_data();
  if p_target_type is null or p_target_type not in ('post', 'profile') or p_target_id is null then
    raise exception 'invalid_request' using errcode = 'P0001';
  end if;
  if p_reason is null or p_reason not in ('spam', 'harassment', 'hate', 'sexual', 'violence', 'self_harm', 'impersonation', 'other') then
    raise exception 'invalid_reason' using errcode = 'P0001', detail = 'Choose a reason from the list.';
  end if;
  if v_details is not null and char_length(v_details) > 500 then
    raise exception 'too_long' using errcode = 'P0001';
  end if;
  if v_details is not null and v_details ~ '[\u0001-\u0009\u000B-\u001F\u007F-\u009F]' then
    raise exception 'invalid_text' using errcode = 'P0001';
  end if;

  -- Only what the reporter can see can be reported.
  if p_target_type = 'post' then
    select s.author_id, pg_catalog.jsonb_build_object(
             'body', s.body, 'author_username', a.username, 'author_display_name', a.display_name, 'posted_at', s.created_at)
      into v_owner, v_snapshot
    from social.posts s join social.visible_members a on a.id = s.author_id
    where s.id = p_target_id and s.deleted_at is null;
  else
    select p.id, pg_catalog.jsonb_build_object(
             'username', p.username, 'display_name', p.display_name,
             'identity', d.identity, 'bio', d.bio, 'follow_reason', d.follow_reason)
      into v_owner, v_snapshot
    from social.visible_members p
    left join social.profile_details d on d.user_id = p.id
    where p.id = p_target_id;
  end if;
  if v_owner is null then
    raise exception 'not_found' using errcode = 'P0001';
  end if;
  if v_owner = v_uid then
    raise exception 'cannot_report_self' using errcode = 'P0001';
  end if;

  -- One open report per member and target; 10 an hour, 30 a day.
  if exists (select 1 from ops.content_reports r where r.reporter_id = v_uid and r.target_type = p_target_type and r.target_id = p_target_id and r.status = 'open') then
    raise exception 'already_reported' using errcode = 'P0001';
  end if;
  if (select count(*) from ops.content_reports r where r.reporter_id = v_uid and r.created_at > pg_catalog.now() - interval '1 hour') >= 10
     or (select count(*) from ops.content_reports r where r.reporter_id = v_uid and r.created_at > pg_catalog.now() - interval '1 day') >= 30 then
    raise exception 'rate_limited' using errcode = 'P0001', detail = 'Please slow down and try again later.';
  end if;

  insert into ops.content_reports (reporter_id, target_type, target_id, target_owner_id, reason, priority, details, snapshot)
  values (v_uid, p_target_type, p_target_id, v_owner, p_reason, p_reason in ('violence', 'self_harm'), v_details, v_snapshot)
  on conflict do nothing;
  if not found then
    raise exception 'already_reported' using errcode = 'P0001';
  end if;
end;
$$;

do $$
declare
  f text;
begin
  foreach f in array array['public.app_feed(timestamptz, integer)', 'public.app_member_posts(uuid, timestamptz, integer)', 'public.app_post(uuid)', 'public.app_catch_up(uuid, timestamptz, uuid)'] loop
    execute pg_catalog.format('revoke all on function %s from public, anon', f);
    execute pg_catalog.format('grant execute on function %s to authenticated, service_role', f);
  end loop;
end $$;
comment on function public.app_feed(timestamptz, integer) is 'Following feed: posts from people the member follows, and their own, newest first.';
comment on function public.app_post(uuid) is 'One live post.';

drop function public.app_photo_status();
drop function public.app_photo_upload_begin();
drop function public.app_create_post(text, uuid, uuid, text);
drop function public.app_post_photos(uuid[]);
drop function public.app_mod_report_media(uuid);
drop function public.app_mod_media_status();
drop function public.svc_photo_upload_stored(uuid, integer, integer, integer, integer);
drop function public.svc_photo_upload_failed(uuid, text);
drop function public.svc_media_drain_claim(integer);
drop function public.svc_media_drain_done(text, bigint[], bigint[], text);
drop function public.svc_photo_check_record(text, integer, boolean, text);
drop function ops.set_media_settings(text, boolean, bigint, numeric, numeric);
drop function ops.queue_hidden_media(text, text);
drop trigger post_media_on_delete on social.posts;
drop function ops.post_media_on_delete();
drop table social.post_media;
drop trigger media_upload_removed on social.media_uploads;
drop function ops.media_upload_removed();
drop table social.media_uploads;
drop function social.post_media_json(uuid);
drop function ops.photos_open();
drop function ops.photo_storage_used();
drop function ops.queue_media_deletion(text, text, text);
drop table ops.media_deletions;
drop table ops.media_drain_runs;
drop table ops.media_admin_events;
drop table ops.media_settings;
alter table social.posts drop constraint posts_body_valid;
alter table social.posts drop column media_kind;
alter table social.posts add constraint posts_body_valid check (
  char_length(body) between 1 and 2000
  and body ~ '\S'
  and body !~ '[\u0001-\u0008\u000B\u000C\u000E-\u001F\u007F]'
);
-- The bucket is empty (checked above); Storage only allows removing its row
-- with its own switch, for this transaction only (as the avatars rollback).
set local storage.allow_delete_query = 'true';
do $$
begin
  if to_regclass('storage.buckets') is not null then
    delete from storage.buckets where id = 'post-photos';
  end if;
end $$;

delete from supabase_migrations.schema_migrations where version = '20261127000000';

select current_setting('crevant.rollback_mode') = 'apply' as apply \gset
\if :apply
  commit;
  \echo 'Applied: photo posts and its migration record were removed; the post readers, app_report and the text rule are as before.'
\else
  rollback;
  \echo 'Check only: every check and the removal succeeded inside the transaction, and all of it was rolled back. Nothing changed.'
\endif
