-- Staging only: undoes 20261213000000 (video posts). Never run it against a Production project. Tested locally by
-- scripts/db/rollback-video-posts-test.sh.
--
--   psql "<url>" -X -q -v ON_ERROR_STOP=1 -v mode=check -v confirm= -f scripts/db/staging-rollback-video-posts.sql
--   psql "<url>" -X -q -v ON_ERROR_STOP=1 -v mode=apply -v confirm='REMOVE THE STAGING VIDEO POSTS' -f ...
--
-- Removes video posts: the device tests, the video cap, the video upload,
-- playback and service functions, the video columns and the post-videos
-- bucket; puts back the photo-only constraints and the functions it changed
-- (as in 20261127000000, and the video switch refusal of 20261212000000).
-- Refuses, changing nothing, while any video upload, video post, device test,
-- queued or stored video file or a video cap exists, while video posts are
-- switched on, if the record or an expected object is missing, or a later
-- migration exists. Once any exist, fix forward instead.

\set ON_ERROR_STOP on
\pset footer off

begin;
set local lock_timeout = '10s';
set local statement_timeout = '60s';

select set_config('crevant.rollback_mode', :'mode', true) as mode,
       set_config('crevant.rollback_confirm', :'confirm', true) <> '' as confirmation_given;

do $$
begin
  if current_setting('crevant.rollback_mode') not in ('check', 'apply') then
    raise exception 'mode must be check or apply';
  end if;
  if current_setting('crevant.rollback_mode') = 'apply'
     and current_setting('crevant.rollback_confirm') <> 'REMOVE THE STAGING VIDEO POSTS' then
    raise exception 'apply needs the confirmation phrase: REMOVE THE STAGING VIDEO POSTS';
  end if;
  if to_regclass('supabase_migrations.schema_migrations') is null then
    raise exception 'refused: no Supabase migration history here (supabase_migrations.schema_migrations)';
  end if;
  if not exists (select 1 from supabase_migrations.schema_migrations where version = '20261213000000')
     or to_regclass('ops.video_device_tests') is null
     or to_regprocedure('public.app_video_upload_begin(integer, integer, text)') is null then
    raise exception 'refused: expected objects are missing (20261213000000 video posts), so the database is not in the state this rollback was written for';
  end if;
  if exists (select 1 from supabase_migrations.schema_migrations where version > '20261213000000') then
    raise exception 'refused, nothing changed: a later migration is recorded';
  end if;
end $$;

lock table social.media_uploads, social.posts, social.post_media, ops.media_deletions, ops.video_device_tests, ops.media_settings,
  ops.media_admin_events, ops.feature_switches in share row exclusive mode;

do $$
declare
  n bigint;
  o bigint := 0;
begin
  if to_regclass('storage.objects') is not null then
    execute $q$select count(*) from storage.objects where bucket_id = 'post-videos'$q$ into o;
  end if;
  n := (select count(*) from social.media_uploads where kind = 'video')
     + (select count(*) from social.posts where media_kind = 'video')
     + (select count(*) from ops.video_device_tests)
     + (select count(*) from ops.media_deletions where bucket = 'post-videos')
     + (select count(*) from ops.media_admin_events where action = 'video_cap_changed')
     + (select count(*) from ops.media_settings where video_storage_cap_bytes is not null)
     + o;
  if n > 0 then
    raise exception 'refused, nothing changed: % rows of data depend on video posts (video uploads or posts, device tests, queued or stored video files, the video cap). Fix forward instead.', n;
  end if;
  if ops.feature_on('video_posts') then
    raise exception 'refused, nothing changed: video posts are switched on. Turn them off first, or fix forward.';
  end if;
end $$;

\echo 'Checks passed. Removing video posts and the migration record.'

drop function public.app_founder_video_status();
drop function public.app_founder_set_video_cap(integer);
drop function public.app_founder_record_device_test(text, boolean, text);
drop function public.app_post_videos(uuid[]);
drop function public.app_video_upload_paths(uuid);
drop function public.app_video_upload_begin(integer, integer, text);
drop function public.app_video_status();
drop function public.svc_video_poster_stored(uuid, integer);
drop function public.svc_video_upload_stored(uuid, integer, integer, integer, integer, text);

-- The functions it changed, as before it (20261212000000 and 20261127000000).
create or replace function public.app_founder_set_switch(p_feature text, p_enabled boolean, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := social.current_founder();
  v_reason text := pg_catalog.btrim(coalesce(p_reason, ''));
begin
  if p_enabled is null or char_length(v_reason) < 3 then
    raise exception 'reason_required' using errcode = 'P0001';
  end if;
  if p_feature = 'video_posts' and p_enabled then
    -- Video posts stay off until the real-device test has passed and the
    -- video publishing package is deployed (it replaces this refusal).
    raise exception 'video_not_ready' using errcode = 'P0001';
  end if;
  update ops.feature_switches set enabled = p_enabled, updated_at = pg_catalog.now(), updated_by = 'founder:' || v_uid::text
  where feature = p_feature;
  if not found then
    raise exception 'invalid_request' using errcode = 'P0001';
  end if;
  insert into ops.feature_switch_events (feature, enabled, reason, changed_by) values (p_feature, p_enabled, v_reason, 'founder:' || v_uid::text);
end;
$$;

comment on function public.app_founder_set_switch(text, boolean, text) is 'Founder: turns advertising, sharing or video posts on or off, with a recorded reason. Takes effect at once.';

create or replace function public.app_create_post(p_body text, p_request_id uuid, p_media uuid, p_media_description text default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := social.current_member();
  v_body text := pg_catalog.btrim(coalesce(p_body, ''), e' \t\r\n');
  v_desc text := nullif(pg_catalog.btrim(coalesce(p_media_description, ''), e' \t\r\n'), '');
  v_id uuid;
  v_existing_body text;
  v_existing_upload uuid;
  u record;
begin
  if p_media is null then
    return public.app_create_post(p_body, p_request_id);
  end if;
  if p_request_id is null then
    raise exception 'invalid_request' using errcode = 'P0001';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('media:' || v_uid::text, 0));

  -- A repeat of a request already stored: same text and photo, same post.
  select s.id, s.body, m.upload_id into v_id, v_existing_body, v_existing_upload
  from social.posts s left join social.post_media m on m.post_id = s.id
  where s.author_id = v_uid and s.client_request_id = p_request_id;
  if v_id is not null then
    if v_existing_body is distinct from v_body or v_existing_upload is distinct from p_media then
      raise exception 'request_reused' using errcode = 'P0001';
    end if;
    return v_id;
  end if;

  if char_length(v_body) > 2000 then
    raise exception 'too_long' using errcode = 'P0001';
  end if;
  if v_body <> '' and (v_body !~ '\S' or v_body ~ '[\u0001-\u0008\u000B\u000C\u000E-\u001F\u007F]') then
    raise exception 'posts_body_valid' using errcode = 'P0001';
  end if;
  if v_desc is not null and (char_length(v_desc) > 250 or v_desc ~ '[\u0001-\u001F\u007F]') then
    raise exception 'invalid_description' using errcode = 'P0001';
  end if;
  if not coalesce(ops.photos_open(), false) then
    raise exception 'photos_unavailable' using errcode = 'P0001';
  end if;
  select x.id, x.status, x.stored_at into u from social.media_uploads x where x.id = p_media and x.user_id = v_uid for update;
  if u.id is null or u.status <> 'stored' then
    raise exception 'upload_not_ready' using errcode = 'P0001';
  end if;
  if u.stored_at < pg_catalog.now() - interval '30 minutes' then
    raise exception 'upload_expired' using errcode = 'P0001';
  end if;
  perform social.rate_check('post', v_uid);
  if (select count(*) from social.posts s where s.author_id = v_uid and s.media_kind = 'photo' and s.created_at > pg_catalog.now() - interval '1 day') >= 10 then
    raise exception 'photo_limit' using errcode = 'P0001';
  end if;

  insert into social.posts (author_id, body, client_request_id, media_kind)
  values (v_uid, v_body, p_request_id, 'photo')
  returning id into v_id;
  insert into social.post_media (post_id, upload_id, kind, description) values (v_id, p_media, 'photo', v_desc);
  update social.media_uploads set status = 'published', finished_at = pg_catalog.now() where id = p_media;
  return v_id;
end;
$$;

comment on function public.app_create_post(text, uuid, uuid, text) is 'Publishes a post with a stored photo (caption optional). One post per request id.';

create or replace function public.app_photo_upload_begin()
returns table (upload_id uuid, full_path text, feed_path text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := social.current_member();
  v_id uuid := gen_random_uuid();
  v_cap bigint;
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('media:' || v_uid::text, 0));
  if not coalesce(ops.photos_open(), false) then
    raise exception 'photos_unavailable' using errcode = 'P0001';
  end if;
  if (select count(*) from social.media_uploads u where u.user_id = v_uid and u.created_at > pg_catalog.now() - interval '1 day') >= 30
     or (select count(*) from social.posts s where s.author_id = v_uid and s.media_kind = 'photo' and s.created_at > pg_catalog.now() - interval '1 day') >= 10 then
    raise exception 'photo_limit' using errcode = 'P0001', detail = 'You can post 10 photos a day.';
  end if;
  select s.photo_storage_cap_bytes into v_cap from ops.media_settings s where s.id;
  -- What is stored, plus 800 KB for every upload still on its way.
  if ops.photo_storage_used()
     + 819200 * (select count(*) from social.media_uploads u where u.status = 'pending' and u.created_at > pg_catalog.now() - interval '15 minutes')
     + 819200 > v_cap then
    raise exception 'storage_full' using errcode = 'P0001';
  end if;
  insert into social.media_uploads (id, user_id, kind, full_path, feed_path)
  values (v_id, v_uid, 'photo', v_uid::text || '/' || v_id::text || '.jpg', v_uid::text || '/' || v_id::text || '-feed.jpg');
  return query select v_id, v_uid::text || '/' || v_id::text || '.jpg', v_uid::text || '/' || v_id::text || '-feed.jpg';
end;
$$;


create or replace function public.app_post_photos(p_posts uuid[])
returns table (post_id uuid, full_path text, feed_path text)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := social.current_member();
begin
  if cardinality(coalesce(p_posts, '{}')) > 100 then
    raise exception 'too_many' using errcode = 'P0001';
  end if;
  return query
  select s.id, u.full_path, u.feed_path
  from social.posts s
  join social.visible_members a on a.id = s.author_id
  join social.post_media m on m.post_id = s.id
  join social.media_uploads u on u.id = m.upload_id
  where s.id = any (coalesce(p_posts, '{}')) and s.deleted_at is null;
end;
$$;


create or replace function public.svc_photo_upload_failed(p_upload uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  u record;
begin
  update social.media_uploads set status = 'failed', finished_at = pg_catalog.now()
  where id = p_upload and status = 'pending'
  returning full_path, feed_path into u;
  if u.full_path is not null then
    perform ops.queue_media_deletion('post-photos', u.full_path, left(coalesce(nullif(p_reason, ''), 'upload failed'), 100));
    perform ops.queue_media_deletion('post-photos', u.feed_path, left(coalesce(nullif(p_reason, ''), 'upload failed'), 100));
  end if;
end;
$$;


create or replace function public.svc_media_drain_claim(p_limit integer default 50)
returns table (id bigint, bucket text, path text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  u record;
begin
  for u in update social.media_uploads x set status = 'expired', finished_at = pg_catalog.now()
           where x.status in ('pending', 'stored', 'failed') and x.created_at < pg_catalog.now() - interval '24 hours'
           returning x.full_path, x.feed_path loop
    perform ops.queue_media_deletion('post-photos', u.full_path, 'upload never published');
    perform ops.queue_media_deletion('post-photos', u.feed_path, 'upload never published');
  end loop;
  if pg_catalog.to_regclass('storage.objects') is not null then
    execute $q$
      insert into ops.media_deletions (bucket, path, reason)
      select 'post-photos', o.name, 'no record refers to it'
      from storage.objects o
      where o.bucket_id = 'post-photos' and o.created_at < pg_catalog.now() - interval '24 hours'
        and o.name ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}(-feed)?\.jpg$'
        and not exists (select 1 from social.media_uploads x where x.full_path = o.name or x.feed_path = o.name)
      on conflict (bucket, path) do nothing$q$;
  end if;
  return query
  with eligible as (
    select q.id from ops.media_deletions q
    where q.deleted_at is null and q.attempts < 8
      and (q.last_attempt_at is null or q.last_attempt_at < pg_catalog.now() - pg_catalog.make_interval(mins => 5 * (2 ^ greatest(q.attempts - 1, 0))::integer))
      and not exists (select 1 from ops.content_reports r
                      where r.snapshot is not null and (r.snapshot->>'media_full_path' = q.path or r.snapshot->>'media_feed_path' = q.path))
      and not exists (select 1 from social.media_uploads x join social.post_media m on m.upload_id = x.id join social.posts s on s.id = m.post_id
                      where (x.full_path = q.path or x.feed_path = q.path) and s.deleted_at is null)
    order by q.queued_at, q.id
    limit least(greatest(coalesce(p_limit, 50), 1), 100)
    for update of q skip locked
  )
  update ops.media_deletions d set attempts = d.attempts + 1, last_attempt_at = pg_catalog.now()
  from eligible e where d.id = e.id
  returning d.id, d.bucket, d.path;
end;
$$;


create or replace function ops.post_media_on_delete()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  u record;
begin
  if old.deleted_at is null and new.deleted_at is not null and new.hidden_at is null and new.media_kind is not null then
    for u in select x.full_path, x.feed_path from social.post_media m join social.media_uploads x on x.id = m.upload_id where m.post_id = new.id loop
      perform ops.queue_media_deletion('post-photos', u.full_path, 'post deleted by its author');
      perform ops.queue_media_deletion('post-photos', u.feed_path, 'post deleted by its author');
    end loop;
  end if;
  return new;
end;
$$;


create or replace function ops.media_upload_removed()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform ops.queue_media_deletion('post-photos', old.full_path, 'account deleted');
  perform ops.queue_media_deletion('post-photos', old.feed_path, 'account deleted');
  return old;
end;
$$;


create or replace function ops.queue_hidden_media(p_actor text, p_confirm text)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  n integer := 0;
  u record;
begin
  if p_actor is null or char_length(p_actor) not between 1 and 100 or strpos(p_actor, '@') > 0 then
    raise exception 'refused: give an actor label (not an email address)';
  end if;
  if p_confirm is distinct from 'DELETE HIDDEN PILOT PHOTOS' then
    raise exception 'refused: confirm with the exact phrase DELETE HIDDEN PILOT PHOTOS';
  end if;
  for u in select x.full_path, x.feed_path from social.posts s
           join social.post_media m on m.post_id = s.id join social.media_uploads x on x.id = m.upload_id
           where s.hidden_at is not null loop
    perform ops.queue_media_deletion('post-photos', u.full_path, 'pilot close: hidden post');
    perform ops.queue_media_deletion('post-photos', u.feed_path, 'pilot close: hidden post');
    n := n + 1;
  end loop;
  insert into ops.media_admin_events (actor, action, detail)
  values (p_actor, 'hidden_media_queued', pg_catalog.format('%s hidden photo post(s) queued for deletion', n));
  return n;
end;
$$;


create or replace function social.post_media_json(p_post uuid)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select pg_catalog.jsonb_build_object('kind', m.kind, 'width', u.width, 'height', u.height, 'description', m.description)
  from social.post_media m join social.media_uploads u on u.id = m.upload_id
  where m.post_id = p_post;
$$;

drop function ops.video_member_bytes(uuid);
drop function ops.video_storage_used();
drop function ops.video_tester(uuid);
drop function ops.videos_open();
drop function ops.video_ready();
drop function ops.video_device_passed(text);
drop table ops.video_device_tests;
alter table ops.media_settings drop column video_storage_cap_bytes;

-- The photo-only constraints, as in 20261127000000 and 20261128000000.
alter table ops.media_admin_events drop constraint media_admin_events_action_check;
alter table ops.media_admin_events add constraint media_admin_events_action_check
  check (action in ('settings_changed', 'processing_check', 'hidden_media_queued', 'audience_changed'));
alter table ops.media_deletions drop constraint media_deletions_bucket_path;
alter table ops.media_deletions add constraint media_deletions_bucket_check check (bucket in ('post-photos'));
alter table ops.media_deletions add constraint media_deletions_path_check check (path ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}(-feed)?\.jpg$');
alter table social.post_media drop constraint post_media_kind_check;
alter table social.post_media add constraint post_media_kind_check check (kind in ('photo'));
comment on table social.post_media is 'A post''s photo: one per post. Read through the post functions; files only through the post-media Edge Function.';
alter table social.posts drop constraint posts_media_kind_check;
alter table social.posts add constraint posts_media_kind_check check (media_kind is null or media_kind in ('photo'));
comment on column social.posts.media_kind is 'The kind of media on the post (photo), or null for a text post.';
alter table social.media_uploads drop constraint media_uploads_tests_private;
alter table social.media_uploads drop constraint media_uploads_stored_complete;
alter table social.media_uploads drop constraint media_uploads_paths;
alter table social.media_uploads drop constraint media_uploads_full_bytes_check;
alter table social.media_uploads drop constraint media_uploads_kind_check;
alter table social.media_uploads drop column declared_bytes;
alter table social.media_uploads drop column codec;
alter table social.media_uploads drop column duration_ms;
alter table social.media_uploads drop column purpose;
alter table social.media_uploads add constraint media_uploads_kind_check check (kind in ('photo'));
alter table social.media_uploads add constraint media_uploads_full_bytes_check check (full_bytes is null or full_bytes between 1 and 614400);
alter table social.media_uploads add constraint media_uploads_paths check (
  full_path = user_id::text || '/' || id::text || '.jpg'
  and feed_path = user_id::text || '/' || id::text || '-feed.jpg'
);
alter table social.media_uploads add constraint media_uploads_stored_complete check (
  status not in ('stored', 'published') or (width is not null and height is not null and full_bytes is not null and feed_bytes is not null and stored_at is not null)
);
-- Nothing uses ops.media_bucket any more, so it goes last.
drop function ops.media_bucket(text);

-- The bucket is empty (checked above); Storage only allows removing its row
-- with its own switch, for this transaction only (as the photo rollback).
set local storage.allow_delete_query = 'true';
do $$
begin
  if to_regclass('storage.buckets') is not null then
    delete from storage.buckets where id = 'post-videos';
  end if;
end $$;

delete from supabase_migrations.schema_migrations where version = '20261213000000';

select current_setting('crevant.rollback_mode') = 'apply' as apply \gset
\if :apply
  commit;
  \echo 'Applied: video posts and the migration record were removed.'
\else
  rollback;
  \echo 'Check only: every check and the removal succeeded inside the transaction, and all of it was rolled back. Nothing changed.'
\endif
