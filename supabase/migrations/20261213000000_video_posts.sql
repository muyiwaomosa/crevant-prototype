-- Video posts (IP-5, SP-VID-001 sections 5 and 8). Review guide: docs/VIDEO.md.
-- STAGING ONLY until approved for Production (see supabase/production-migrations.txt).
--
-- A post can now carry one video of up to five minutes, at most 720p (1280 x
-- 720, either way round), H.264 in MP4, at most 110 MB, with a poster image.
-- The browser checks and, where needed, converts the video before upload; the
-- server checks it again before it can be published. Built on the photo
-- pipeline (20261127000000), not beside it:
--
--   * Storage: one private bucket, post-videos (MP4 videos and their JPEG
--     posters, at most 110 MB a file), with no storage policy for members or
--     visitors. The post-media Edge Function issues a signed upload token for
--     the one path the database chose; the browser uploads with the resumable
--     (TUS) protocol in 6 MB chunks; the function then reads the file's header
--     (moov, mvhd, tkhd, stsd) and the database marks it stored only if it is
--     H.264, within 1280 x 720, at most 300 seconds and at most 110 MB.
--   * social.media_uploads gains kind 'video' (paths <member>/<upload>.mp4
--     and <member>/<upload>-poster.jpg), its duration, codec, declared size
--     and purpose: 'post', or 'device_test' (the founder's and testers' private
--     test uploads: never published, deleted after 24 hours like any upload
--     never published). social.posts.media_kind and social.post_media.kind
--     accept 'video'.
--   * ops.media_deletions accepts the post-videos bucket and its two paths.
--     The existing triggers, the drain and pilot-close queueing now queue each
--     file in the bucket of its kind.
--   * ops.video_device_tests: the founder's recorded device tests
--     (append-only). The video_posts switch (20261212000000) can be turned on
--     only when the latest iPhone Safari and Android Chrome results both
--     passed and the project video storage cap is set; otherwise it still
--     refuses with video_not_ready.
--   * ops.media_settings.video_storage_cap_bytes: the project cap (unset until
--     the founder sets it; 50 GB proposed). Fixed limits, as approved: 5 video
--     posts a day and 1 GB of video per member.
--   * Member functions: app_video_status, app_video_upload_begin,
--     app_video_upload_paths, app_post_videos, and app_create_post publishing
--     a stored video. Founder: app_founder_record_device_test,
--     app_founder_set_video_cap, app_founder_video_status. Service only:
--     svc_video_upload_stored, svc_video_poster_stored.
--   * Separate controls (founder decision): the video_posts switch governs
--     new video uploads and publishing; a new video_playback switch governs
--     playback of videos already published (on by default, so pausing uploads
--     never hides creators' existing videos); app_founder_video_emergency_stop
--     turns both off in one recorded step. All are enforced by the server.
--   * ops.video_delivery_daily: playback links issued per day and the bytes
--     those videos hold, an upper-bound estimate of delivery for the founder
--     (exact egress is in the Supabase usage page).
--     Device-test uploads work for the founder and testers only.
--
-- Photos, avatars and text posts behave exactly as before.

-- ---------------------------------------------------------------------------
-- 1. Storage: the private video bucket.

do $$
begin
  if pg_catalog.to_regclass('storage.buckets') is not null then
    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    values ('post-videos', 'post-videos', false, 115343360, array['video/mp4', 'image/jpeg']);
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- 2. Uploads, post media and the queue accept videos.

alter table social.media_uploads drop constraint media_uploads_kind_check;
alter table social.media_uploads add constraint media_uploads_kind_check check (kind in ('photo', 'video'));
alter table social.media_uploads add column purpose text not null default 'post' check (purpose in ('post', 'device_test'));
alter table social.media_uploads add column duration_ms integer check (duration_ms is null or duration_ms between 1 and 300000);
alter table social.media_uploads add column codec text check (codec is null or codec in ('avc1', 'avc3'));
alter table social.media_uploads add column declared_bytes integer check (declared_bytes is null or declared_bytes between 1 and 115343360);
comment on column social.media_uploads.purpose is 'post, or device_test: a private test upload by the founder or a tester (never published, deleted after 24 hours).';
comment on column social.media_uploads.duration_ms is 'Videos: the duration read from the stored file by the server.';
comment on column social.media_uploads.codec is 'Videos: the video codec read from the stored file by the server (H.264 only).';
comment on column social.media_uploads.declared_bytes is 'Videos: the size the browser said it would upload; the stored file must match it.';
alter table social.media_uploads drop constraint media_uploads_full_bytes_check;
alter table social.media_uploads add constraint media_uploads_full_bytes_check
  check (full_bytes is null or full_bytes between 1 and case when kind = 'video' then 115343360 else 614400 end);
alter table social.media_uploads drop constraint media_uploads_paths;
alter table social.media_uploads add constraint media_uploads_paths check (
  (kind = 'photo' and purpose = 'post'
   and full_path = user_id::text || '/' || id::text || '.jpg'
   and feed_path = user_id::text || '/' || id::text || '-feed.jpg')
  or (kind = 'video'
   and full_path = user_id::text || '/' || id::text || '.mp4'
   and feed_path = user_id::text || '/' || id::text || '-poster.jpg'
   and declared_bytes is not null)
);
-- A video's poster is optional (feed_bytes); its duration and codec are not.
alter table social.media_uploads drop constraint media_uploads_stored_complete;
alter table social.media_uploads add constraint media_uploads_stored_complete check (
  status not in ('stored', 'published')
  or (width is not null and height is not null and full_bytes is not null and stored_at is not null
      and (kind = 'video' or feed_bytes is not null)
      and (kind = 'photo' or (duration_ms is not null and codec is not null)))
);
alter table social.media_uploads add constraint media_uploads_tests_private check (purpose = 'post' or status <> 'published');

alter table social.posts drop constraint posts_media_kind_check;
alter table social.posts add constraint posts_media_kind_check check (media_kind is null or media_kind in ('photo', 'video'));
comment on column social.posts.media_kind is 'The kind of media on the post (photo or video), or null for a text post.';
alter table social.post_media drop constraint post_media_kind_check;
alter table social.post_media add constraint post_media_kind_check check (kind in ('photo', 'video'));
comment on table social.post_media is 'A post''s photo or video: one per post. Read through the post functions; files only through the post-media Edge Function.';

alter table ops.media_deletions drop constraint media_deletions_bucket_check;
alter table ops.media_deletions drop constraint media_deletions_path_check;
alter table ops.media_deletions add constraint media_deletions_bucket_path check (
  (bucket = 'post-photos' and path ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}(-feed)?\.jpg$')
  or (bucket = 'post-videos' and path ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}(\.mp4|-poster\.jpg)$')
);

alter table ops.media_admin_events drop constraint media_admin_events_action_check;
alter table ops.media_admin_events add constraint media_admin_events_action_check
  check (action in ('settings_changed', 'processing_check', 'hidden_media_queued', 'audience_changed', 'video_cap_changed'));

alter table ops.media_settings add column video_storage_cap_bytes bigint check (video_storage_cap_bytes is null or video_storage_cap_bytes > 0);
comment on column ops.media_settings.video_storage_cap_bytes is 'The project video storage cap (unset until the founder sets it; 50 GB proposed for the pilot). Video posts cannot be switched on without it.';

-- The bucket each kind of media lives in.
create function ops.media_bucket(p_kind text)
returns text
language sql
immutable
security invoker
set search_path = ''
as $$
  select case when p_kind = 'video' then 'post-videos' else 'post-photos' end;
$$;
revoke all on function ops.media_bucket(text) from public, anon, authenticated;

-- A post's media, as the post functions return it: videos add their duration and whether a poster exists.
create or replace function social.post_media_json(p_post uuid)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select pg_catalog.jsonb_build_object('kind', m.kind, 'width', u.width, 'height', u.height, 'description', m.description)
         || case when m.kind = 'video'
                 then pg_catalog.jsonb_build_object('duration_ms', u.duration_ms, 'poster', u.feed_bytes is not null)
                 else '{}'::jsonb end
  from social.post_media m join social.media_uploads u on u.id = m.upload_id
  where m.post_id = p_post;
$$;
revoke all on function social.post_media_json(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. Device tests, the switch and the limits.

create table ops.video_device_tests (
  id          bigint generated always as identity primary key,
  device      text not null check (device in ('iphone_safari', 'android_chrome', 'desktop')),
  passed      boolean not null,
  notes       text check (notes is null or char_length(notes) <= 2000),
  recorded_by text not null check (char_length(recorded_by) between 1 and 100 and strpos(recorded_by, '@') = 0),
  recorded_at timestamptz not null default pg_catalog.now()
);
comment on table ops.video_device_tests is 'The founder''s recorded video device tests (docs/video/DEVICE-TEST.md). Append-only. Video posts can be switched on only when the latest iPhone Safari and Android Chrome results passed.';
create index video_device_tests_latest on ops.video_device_tests (device, recorded_at desc, id desc);
alter table ops.video_device_tests enable row level security;
revoke all on table ops.video_device_tests from public, anon, authenticated;
grant select on table ops.video_device_tests to service_role;
create trigger video_device_tests_no_update
before update or delete on ops.video_device_tests
for each row execute function ops.history_append_only();

-- Playback of published videos is its own switch (on), separate from new uploads.
alter table ops.feature_switches drop constraint feature_switches_feature_check;
alter table ops.feature_switches add constraint feature_switches_feature_check
  check (feature in ('ads', 'sharing', 'video_posts', 'video_playback'));
insert into ops.feature_switches (feature, enabled) values ('video_playback', true);

-- Playback links issued each day and the size of the videos behind them: an
-- upper-bound estimate (a link may be opened partly or not at all).
create table ops.video_delivery_daily (
  day         date primary key,
  links       integer not null default 0 check (links >= 0),
  video_bytes bigint not null default 0 check (video_bytes >= 0)
);
comment on table ops.video_delivery_daily is 'Video playback links issued per day (Toronto) and the bytes of those videos: an upper-bound delivery estimate for the founder. Counts only, never who watched.';
alter table ops.video_delivery_daily enable row level security;
revoke all on table ops.video_delivery_daily from public, anon, authenticated;

-- Whether the latest test on a device passed.
create function ops.video_device_passed(p_device text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select t.passed from ops.video_device_tests t where t.device = p_device
                   order by t.recorded_at desc, t.id desc limit 1), false);
$$;
revoke all on function ops.video_device_passed(text) from public, anon, authenticated;

-- Whether video posts may be switched on: both phone tests passed and the cap is set.
create function ops.video_ready()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select ops.video_device_passed('iphone_safari') and ops.video_device_passed('android_chrome')
     and coalesce((select s.video_storage_cap_bytes is not null from ops.media_settings s where s.id), false);
$$;
revoke all on function ops.video_ready() from public, anon, authenticated;

-- Whether video posts are open now (the founder's switch, with a cap set).
create function ops.videos_open()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select ops.feature_on('video_posts')
     and coalesce((select s.video_storage_cap_bytes is not null from ops.media_settings s where s.id), false);
$$;
revoke all on function ops.videos_open() from public, anon, authenticated;

-- The founder and testers may make private device-test uploads, whatever the switch says.
create function ops.video_tester(p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from ops.member_access a
                 where a.user_id = p_user and a.cohort in ('founder', 'tester') and ops.member_access_active(a.user_id));
$$;
revoke all on function ops.video_tester(uuid) from public, anon, authenticated;

-- Video bytes stored now (videos and posters), from Storage itself.
create function ops.video_storage_used()
returns bigint
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  n bigint := 0;
begin
  if pg_catalog.to_regclass('storage.objects') is not null then
    execute $q$select coalesce(sum((o.metadata->>'size')::bigint), 0) from storage.objects o where o.bucket_id = 'post-videos'$q$ into n;
  end if;
  return n;
end;
$$;
revoke all on function ops.video_storage_used() from public, anon, authenticated;

-- What a member's videos take: stored and published ones, plus uploads on their way (as declared).
create function ops.video_member_bytes(p_user uuid)
returns bigint
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(sum(case when u.status = 'pending' then u.declared_bytes else u.full_bytes + coalesce(u.feed_bytes, 0) end), 0)::bigint
  from social.media_uploads u
  where u.user_id = p_user and u.kind = 'video'
    and (u.status in ('stored', 'published') or (u.status = 'pending' and u.created_at > pg_catalog.now() - interval '2 hours'))
    and (u.status <> 'published' or exists (select 1 from social.post_media m join social.posts s on s.id = m.post_id
                                            where m.upload_id = u.id and s.deleted_at is null));
$$;
revoke all on function ops.video_member_bytes(uuid) from public, anon, authenticated;

-- The switch: video posts can be turned on only once ready. Otherwise as in 20261212000000.
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
  if p_feature = 'video_posts' and p_enabled and not ops.video_ready() then
    -- Video posts stay off until the latest iPhone Safari and Android Chrome
    -- device tests have passed and the project video storage cap is set.
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

create function public.app_founder_record_device_test(p_device text, p_passed boolean, p_notes text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := social.current_founder();
  v_notes text := nullif(pg_catalog.btrim(coalesce(p_notes, '')), '');
begin
  if p_device is null or p_device not in ('iphone_safari', 'android_chrome', 'desktop') or p_passed is null then
    raise exception 'invalid_request' using errcode = 'P0001';
  end if;
  if v_notes is not null and (char_length(v_notes) > 2000 or v_notes ~ '[\u0001-\u0008\u000B\u000C\u000E-\u001F\u007F]') then
    raise exception 'invalid_request' using errcode = 'P0001';
  end if;
  if (select count(*) from ops.video_device_tests t where t.recorded_at > pg_catalog.now() - interval '1 day') >= 50 then
    raise exception 'rate_limited' using errcode = 'P0001';
  end if;
  insert into ops.video_device_tests (device, passed, notes, recorded_by) values (p_device, p_passed, v_notes, 'founder:' || v_uid::text);
end;
$$;

create function public.app_founder_set_video_cap(p_cap_gb integer)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := social.current_founder();
begin
  if p_cap_gb is null or p_cap_gb not between 1 and 1000 then
    raise exception 'invalid_request' using errcode = 'P0001';
  end if;
  update ops.media_settings set video_storage_cap_bytes = p_cap_gb::bigint * 1073741824, updated_at = pg_catalog.now(), updated_by = 'founder:' || v_uid::text
  where id;
  insert into ops.media_admin_events (actor, action, detail)
  values ('founder:' || v_uid::text, 'video_cap_changed', pg_catalog.format('video storage cap %s GB', p_cap_gb));
end;
$$;

create function public.app_founder_video_status()
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
    'enabled', ops.feature_on('video_posts'),
    'playback_enabled', ops.feature_on('video_playback'),
    'ready', ops.video_ready(),
    'delivery_7d', (select pg_catalog.jsonb_build_object('links', coalesce(sum(d.links), 0), 'video_bytes', coalesce(sum(d.video_bytes), 0))
                    from ops.video_delivery_daily d where d.day > (pg_catalog.now() at time zone 'America/Toronto')::date - 7),
    'delivery_30d', (select pg_catalog.jsonb_build_object('links', coalesce(sum(d.links), 0), 'video_bytes', coalesce(sum(d.video_bytes), 0))
                     from ops.video_delivery_daily d where d.day > (pg_catalog.now() at time zone 'America/Toronto')::date - 30),
    'cap_bytes', (select s.video_storage_cap_bytes from ops.media_settings s where s.id),
    'used_bytes', ops.video_storage_used(),
    'video_posts', (select count(*) from social.posts p where p.media_kind = 'video' and p.deleted_at is null),
    'test_uploads_24h', (select count(*) from social.media_uploads u where u.kind = 'video' and u.purpose = 'device_test'
                         and u.created_at > pg_catalog.now() - interval '24 hours'),
    'latest', coalesce((select pg_catalog.jsonb_object_agg(d.device, pg_catalog.jsonb_build_object('passed', d.passed, 'notes', d.notes, 'at', d.recorded_at))
                        from (select distinct on (t.device) t.device, t.passed, t.notes, t.recorded_at
                              from ops.video_device_tests t order by t.device, t.recorded_at desc, t.id desc) d), '{}'::jsonb),
    'recent', coalesce((select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('device', r.device, 'passed', r.passed, 'notes', r.notes, 'at', r.recorded_at)
                                                    order by r.recorded_at desc, r.id desc)
                        from (select * from ops.video_device_tests t order by t.recorded_at desc, t.id desc limit 20) r), '[]'::jsonb));
end;
$$;

-- Emergency: new uploads and playback off together, in one recorded step.
create function public.app_founder_video_emergency_stop(p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := social.current_founder();
  v_reason text := pg_catalog.btrim(coalesce(p_reason, ''));
begin
  if char_length(v_reason) < 3 or char_length(v_reason) > 280 then
    raise exception 'reason_required' using errcode = 'P0001';
  end if;
  update ops.feature_switches set enabled = false, updated_at = pg_catalog.now(), updated_by = 'founder:' || v_uid::text
  where feature in ('video_posts', 'video_playback');
  insert into ops.feature_switch_events (feature, enabled, reason, changed_by)
  values ('video_posts', false, 'Emergency stop: ' || v_reason, 'founder:' || v_uid::text),
         ('video_playback', false, 'Emergency stop: ' || v_reason, 'founder:' || v_uid::text);
end;
$$;

-- What the app may show, now with video playback (otherwise as in 20261212000000).
create or replace function public.app_features()
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
    'ads', ops.feature_on('ads'),
    'sharing', ops.feature_on('sharing'),
    'video_posts', ops.feature_on('video_posts'),
    'video_playback', ops.feature_on('video_playback'),
    'photos', coalesce((select m.photos_enabled from ops.media_settings m where m.id), false),
    'rewards', not coalesce((select r.paused from sim.reward_settings r limit 1), false));
end;
$$;

-- The post-media Edge Function reports the playback links it issued (best effort).
create function public.svc_video_links_issued(p_links integer, p_bytes bigint)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_links is null or p_links < 0 or p_links > 1000 or p_bytes is null or p_bytes < 0 then
    raise exception 'invalid_request' using errcode = 'P0001';
  end if;
  insert into ops.video_delivery_daily as d (day, links, video_bytes)
  values ((pg_catalog.now() at time zone 'America/Toronto')::date, p_links, p_bytes)
  on conflict (day) do update set links = d.links + excluded.links, video_bytes = d.video_bytes + excluded.video_bytes;
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. Members: status, uploads, publishing and playback.

-- What the app needs to offer video: whether posting is open, whether the
-- member may run device tests, and the limits with what they have used.
create function public.app_video_status()
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
    'enabled', ops.videos_open(),
    'can_test', ops.video_tester(v_uid),
    'max_seconds', 300,
    'max_bytes', 115343360,
    'max_source_bytes', 2147483648,
    'daily_limit', 5,
    'posted_today', (select count(*) from social.posts s where s.author_id = v_uid and s.media_kind = 'video' and s.created_at > pg_catalog.now() - interval '1 day'),
    'member_cap_bytes', 1073741824,
    'member_used_bytes', ops.video_member_bytes(v_uid));
end;
$$;

-- Authorises one video upload of the declared size and duration: posts need
-- the switch, the daily limit, the member's 1 GB and the project cap; device
-- tests need the founder or a tester. The database chooses both paths.
create function public.app_video_upload_begin(p_bytes integer, p_duration_ms integer, p_purpose text default 'post')
returns table (upload_id uuid, video_path text, poster_path text)
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
  if p_purpose is null or p_purpose not in ('post', 'device_test') then
    raise exception 'invalid_request' using errcode = 'P0001';
  end if;
  if p_purpose = 'post' and not ops.videos_open() then
    raise exception 'videos_unavailable' using errcode = 'P0001';
  end if;
  if p_purpose = 'device_test' and not ops.video_tester(v_uid) then
    raise exception 'not_tester' using errcode = 'P0001';
  end if;
  if p_bytes is null or p_bytes < 1 or p_bytes > 115343360 then
    raise exception 'video_too_large' using errcode = 'P0001';
  end if;
  if p_duration_ms is null or p_duration_ms < 1 or p_duration_ms > 300000 then
    raise exception 'video_too_long' using errcode = 'P0001';
  end if;
  if p_purpose = 'post' then
    if (select count(*) from social.media_uploads u where u.user_id = v_uid and u.kind = 'video' and u.purpose = 'post'
        and u.created_at > pg_catalog.now() - interval '1 day') >= 15
       or (select count(*) from social.posts s where s.author_id = v_uid and s.media_kind = 'video' and s.created_at > pg_catalog.now() - interval '1 day') >= 5 then
      raise exception 'video_limit' using errcode = 'P0001';
    end if;
  elsif (select count(*) from social.media_uploads u where u.user_id = v_uid and u.kind = 'video' and u.purpose = 'device_test'
         and u.created_at > pg_catalog.now() - interval '1 day') >= 20 then
    raise exception 'video_limit' using errcode = 'P0001';
  end if;
  if ops.video_member_bytes(v_uid) + p_bytes > 1073741824 then
    raise exception 'video_quota' using errcode = 'P0001';
  end if;
  select s.video_storage_cap_bytes into v_cap from ops.media_settings s where s.id;
  -- Device tests run before the cap is set; they still count once it is.
  if v_cap is not null and ops.video_storage_used()
     + coalesce((select sum(u.declared_bytes) from social.media_uploads u where u.kind = 'video' and u.status = 'pending'
                 and u.created_at > pg_catalog.now() - interval '2 hours'), 0)
     + p_bytes > v_cap then
    raise exception 'storage_full' using errcode = 'P0001';
  end if;
  insert into social.media_uploads (id, user_id, kind, purpose, declared_bytes, full_path, feed_path)
  values (v_id, v_uid, 'video', p_purpose, p_bytes, v_uid::text || '/' || v_id::text || '.mp4', v_uid::text || '/' || v_id::text || '-poster.jpg');
  return query select v_id, v_uid::text || '/' || v_id::text || '.mp4', v_uid::text || '/' || v_id::text || '-poster.jpg';
end;
$$;

-- The member's own video upload that is still open (pending or stored, in
-- the last 24 hours): for the Edge Function to check it, store its poster or
-- (device tests only) play it back.
create function public.app_video_upload_paths(p_upload uuid)
returns table (video_path text, poster_path text, status text, purpose text, declared_bytes integer, has_poster boolean)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := social.current_member();
begin
  return query
  select u.full_path, u.feed_path, u.status, u.purpose, u.declared_bytes, u.feed_bytes is not null
  from social.media_uploads u
  where u.id = p_upload and u.user_id = v_uid and u.kind = 'video' and u.status in ('pending', 'stored')
    and u.created_at > pg_catalog.now() - interval '24 hours';
end;
$$;

-- Video paths for the posts the member can see (live, by a visible member),
-- for the Edge Function to sign. None while video posts are paused. At most 100.
create function public.app_post_videos(p_posts uuid[])
returns table (post_id uuid, video_path text, poster_path text, has_poster boolean, video_bytes integer)
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
  -- Playback has its own switch: pausing new uploads never hides published videos.
  if not ops.feature_on('video_playback') then
    return;
  end if;
  return query
  select s.id, u.full_path, u.feed_path, u.feed_bytes is not null, u.full_bytes
  from social.posts s
  join social.visible_members a on a.id = s.author_id
  join social.post_media m on m.post_id = s.id and m.kind = 'video'
  join social.media_uploads u on u.id = m.upload_id
  where s.id = any (coalesce(p_posts, '{}')) and s.deleted_at is null;
end;
$$;

-- Photo links are for photos only (unchanged otherwise from 20261127000000).
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
  join social.post_media m on m.post_id = s.id and m.kind = 'photo'
  join social.media_uploads u on u.id = m.upload_id
  where s.id = any (coalesce(p_posts, '{}')) and s.deleted_at is null;
end;
$$;

-- Photos keep their own limits: only photo uploads count towards them.
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
  if (select count(*) from social.media_uploads u where u.user_id = v_uid and u.kind = 'photo' and u.created_at > pg_catalog.now() - interval '1 day') >= 30
     or (select count(*) from social.posts s where s.author_id = v_uid and s.media_kind = 'photo' and s.created_at > pg_catalog.now() - interval '1 day') >= 10 then
    raise exception 'photo_limit' using errcode = 'P0001', detail = 'You can post 10 photos a day.';
  end if;
  select s.photo_storage_cap_bytes into v_cap from ops.media_settings s where s.id;
  -- What is stored, plus 800 KB for every photo upload still on its way.
  if ops.photo_storage_used()
     + 819200 * (select count(*) from social.media_uploads u where u.kind = 'photo' and u.status = 'pending' and u.created_at > pg_catalog.now() - interval '15 minutes')
     + 819200 > v_cap then
    raise exception 'storage_full' using errcode = 'P0001';
  end if;
  insert into social.media_uploads (id, user_id, kind, full_path, feed_path)
  values (v_id, v_uid, 'photo', v_uid::text || '/' || v_id::text || '.jpg', v_uid::text || '/' || v_id::text || '-feed.jpg');
  return query select v_id, v_uid::text || '/' || v_id::text || '.jpg', v_uid::text || '/' || v_id::text || '-feed.jpg';
end;
$$;

-- Publishes a post with a stored photo or video: the member's own, not used
-- yet, stored recently (photos 30 minutes, videos 2 hours), and for a video
-- while video posts are on, never a device test, 5 a day. One post per
-- request id (a retry returns it). Photos exactly as in 20261127000000.
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
  v_kind text;
  u record;
begin
  if p_media is null then
    return public.app_create_post(p_body, p_request_id);
  end if;
  if p_request_id is null then
    raise exception 'invalid_request' using errcode = 'P0001';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('media:' || v_uid::text, 0));

  -- A repeat of a request already stored: same text and media, same post.
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
  select x.kind into v_kind from social.media_uploads x where x.id = p_media and x.user_id = v_uid;
  if v_kind = 'video' then
    if not ops.videos_open() then
      raise exception 'videos_unavailable' using errcode = 'P0001';
    end if;
  elsif not coalesce(ops.photos_open(), false) then
    raise exception 'photos_unavailable' using errcode = 'P0001';
  end if;
  select x.id, x.status, x.stored_at, x.purpose into u from social.media_uploads x where x.id = p_media and x.user_id = v_uid for update;
  if u.id is null or u.status <> 'stored' or u.purpose <> 'post' then
    raise exception 'upload_not_ready' using errcode = 'P0001';
  end if;
  -- Photos must be published within 30 minutes of being stored, videos within 2 hours.
  if u.stored_at < pg_catalog.now() - (case when v_kind = 'video' then interval '2 hours' else interval '30 minutes' end) then
    raise exception 'upload_expired' using errcode = 'P0001';
  end if;
  perform social.rate_check('post', v_uid);
  if v_kind = 'video' then
    if (select count(*) from social.posts s where s.author_id = v_uid and s.media_kind = 'video' and s.created_at > pg_catalog.now() - interval '1 day') >= 5 then
      raise exception 'video_limit' using errcode = 'P0001';
    end if;
  elsif (select count(*) from social.posts s where s.author_id = v_uid and s.media_kind = 'photo' and s.created_at > pg_catalog.now() - interval '1 day') >= 10 then
    raise exception 'photo_limit' using errcode = 'P0001';
  end if;

  insert into social.posts (author_id, body, client_request_id, media_kind)
  values (v_uid, v_body, p_request_id, v_kind)
  returning id into v_id;
  insert into social.post_media (post_id, upload_id, kind, description) values (v_id, p_media, v_kind, v_desc);
  update social.media_uploads set status = 'published', finished_at = pg_catalog.now() where id = p_media;
  return v_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- 5. Service-only steps (the post-media Edge Function, with the service key).

-- The video is stored and its header was read: the database checks it again
-- (H.264, at most 1280 x 720 either way round, at most 300 seconds, the size
-- declared and at most 110 MB) and re-checks membership at this moment.
create function public.svc_video_upload_stored(p_upload uuid, p_bytes integer, p_width integer, p_height integer, p_duration_ms integer, p_codec text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  u record;
begin
  select x.id, x.user_id, x.status, x.kind, x.created_at, x.declared_bytes into u from social.media_uploads x where x.id = p_upload for update;
  if u.id is null or u.kind <> 'video' or u.status <> 'pending' then
    raise exception 'not_found' using errcode = 'P0001';
  end if;
  if u.created_at < pg_catalog.now() - interval '2 hours' then
    raise exception 'upload_expired' using errcode = 'P0001';
  end if;
  if not ops.member_access_active(u.user_id) then
    raise exception 'no_pilot_access' using errcode = 'P0001';
  end if;
  if p_codec is null or p_codec not in ('avc1', 'avc3') then
    raise exception 'video_codec' using errcode = 'P0001';
  end if;
  if p_width is null or p_height is null or least(p_width, p_height) < 16 or greatest(p_width, p_height) > 1280 or least(p_width, p_height) > 720 then
    raise exception 'video_dimensions' using errcode = 'P0001';
  end if;
  if p_duration_ms is null or p_duration_ms < 1 or p_duration_ms > 300000 then
    raise exception 'video_too_long' using errcode = 'P0001';
  end if;
  if p_bytes is null or p_bytes < 1 or p_bytes > 115343360 or p_bytes <> u.declared_bytes then
    raise exception 'video_size' using errcode = 'P0001';
  end if;
  update social.media_uploads
  set status = 'stored', width = p_width, height = p_height, full_bytes = p_bytes, duration_ms = p_duration_ms, codec = p_codec, stored_at = pg_catalog.now()
  where id = p_upload;
end;
$$;

-- The video's poster is stored (the feed copy the photo checks made).
create function public.svc_video_poster_stored(p_upload uuid, p_bytes integer)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_bytes is null or p_bytes not between 1 and 204800 then
    raise exception 'invalid_request' using errcode = 'P0001';
  end if;
  update social.media_uploads set feed_bytes = p_bytes
  where id = p_upload and kind = 'video' and status in ('pending', 'stored');
  if not found then
    raise exception 'not_found' using errcode = 'P0001';
  end if;
end;
$$;

-- An upload that failed after authorisation: its files (if any) are queued, in the bucket of its kind.
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
  returning full_path, feed_path, kind into u;
  if u.full_path is not null then
    perform ops.queue_media_deletion(ops.media_bucket(u.kind), u.full_path, left(coalesce(nullif(p_reason, ''), 'upload failed'), 100));
    perform ops.queue_media_deletion(ops.media_bucket(u.kind), u.feed_path, left(coalesce(nullif(p_reason, ''), 'upload failed'), 100));
  end if;
end;
$$;

-- As in 20261127000000, for both buckets: uploads never published within 24
-- hours (device tests included) and files nothing refers to are queued; live
-- posts' files and evidence are never returned.
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
           returning x.full_path, x.feed_path, x.kind loop
    perform ops.queue_media_deletion(ops.media_bucket(u.kind), u.full_path, 'upload never published');
    perform ops.queue_media_deletion(ops.media_bucket(u.kind), u.feed_path, 'upload never published');
  end loop;
  if pg_catalog.to_regclass('storage.objects') is not null then
    execute $q$
      insert into ops.media_deletions (bucket, path, reason)
      select o.bucket_id, o.name, 'no record refers to it'
      from storage.objects o
      where o.created_at < pg_catalog.now() - interval '24 hours'
        and ((o.bucket_id = 'post-photos' and o.name ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}(-feed)?\.jpg$')
             or (o.bucket_id = 'post-videos' and o.name ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}(\.mp4|-poster\.jpg)$'))
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

-- An author deleting a post queues its files, in the bucket of their kind.
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
    for u in select x.full_path, x.feed_path, x.kind from social.post_media m join social.media_uploads x on x.id = m.upload_id where m.post_id = new.id loop
      perform ops.queue_media_deletion(ops.media_bucket(u.kind), u.full_path, 'post deleted by its author');
      perform ops.queue_media_deletion(ops.media_bucket(u.kind), u.feed_path, 'post deleted by its author');
    end loop;
  end if;
  return new;
end;
$$;

-- An upload record removed (its account deleted) queues its files.
create or replace function ops.media_upload_removed()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform ops.queue_media_deletion(ops.media_bucket(old.kind), old.full_path, 'account deleted');
  perform ops.queue_media_deletion(ops.media_bucket(old.kind), old.feed_path, 'account deleted');
  return old;
end;
$$;

-- Pilot close only: as in 20261127000000, now for videos too.
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
  for u in select x.full_path, x.feed_path, x.kind from social.posts s
           join social.post_media m on m.post_id = s.id join social.media_uploads x on x.id = m.upload_id
           where s.hidden_at is not null loop
    perform ops.queue_media_deletion(ops.media_bucket(u.kind), u.full_path, 'pilot close: hidden post');
    perform ops.queue_media_deletion(ops.media_bucket(u.kind), u.feed_path, 'pilot close: hidden post');
    n := n + 1;
  end loop;
  insert into ops.media_admin_events (actor, action, detail)
  values (p_actor, 'hidden_media_queued', pg_catalog.format('%s hidden photo or video post(s) queued for deletion', n));
  return n;
end;
$$;

-- ---------------------------------------------------------------------------
-- 6. Comments and grants.

comment on function public.app_founder_set_switch(text, boolean, text) is 'Founder: turns advertising, sharing, new video uploads or video playback on or off, with a recorded reason. New video uploads turn on only after both phone device tests passed and the video storage cap is set.';
comment on function public.app_founder_record_device_test(text, boolean, text) is 'Founder: records one video device test result (iPhone Safari, Android Chrome or desktop), with notes. Append-only.';
comment on function public.app_founder_set_video_cap(integer) is 'Founder: sets the project video storage cap in GB (recorded).';
comment on function public.app_founder_video_status() is 'Founder: video posts at a glance: the switch, whether it may be turned on, storage against the cap and the device tests.';
comment on function public.app_video_status() is 'Whether the member can post videos now, whether they may run device tests, and the video limits with what they have used.';
comment on function public.app_video_upload_begin(integer, integer, text) is 'Authorises one video upload (post or device test) of the declared size and duration. The database chooses the paths.';
comment on function public.app_video_upload_paths(uuid) is 'The member''s own open video upload, for the post-media Edge Function to check, add a poster or play back a device test.';
comment on function public.app_post_videos(uuid[]) is 'Video paths of posts the member can see, for the post-media Edge Function to sign (at most 100). None while video playback is switched off (new uploads have their own switch).';
comment on function public.app_founder_video_emergency_stop(text) is 'Founder: turns off new video uploads and video playback together, with a recorded reason.';
comment on function public.svc_video_links_issued(integer, bigint) is 'Service only: adds issued video playback links and their bytes to today''s delivery estimate.';
comment on function public.app_create_post(text, uuid, uuid, text) is 'Publishes a post with a stored photo or video (caption optional). One post per request id.';

do $$
declare
  f text;
begin
  foreach f in array array[
    'public.app_founder_set_switch(text, boolean, text)',
    'public.app_founder_record_device_test(text, boolean, text)',
    'public.app_founder_set_video_cap(integer)',
    'public.app_founder_video_status()',
    'public.app_founder_video_emergency_stop(text)',
    'public.app_features()',
    'public.app_video_status()',
    'public.app_video_upload_begin(integer, integer, text)',
    'public.app_video_upload_paths(uuid)',
    'public.app_post_videos(uuid[])',
    'public.app_photo_upload_begin()',
    'public.app_post_photos(uuid[])',
    'public.app_create_post(text, uuid, uuid, text)'
  ] loop
    execute pg_catalog.format('revoke all on function %s from public, anon', f);
    execute pg_catalog.format('grant execute on function %s to authenticated', f);
  end loop;
  foreach f in array array[
    'public.svc_video_upload_stored(uuid, integer, integer, integer, integer, text)',
    'public.svc_video_poster_stored(uuid, integer)',
    'public.svc_video_links_issued(integer, bigint)',
    'public.svc_photo_upload_failed(uuid, text)',
    'public.svc_media_drain_claim(integer)'
  ] loop
    execute pg_catalog.format('revoke all on function %s from public, anon, authenticated', f);
    execute pg_catalog.format('grant execute on function %s to service_role', f);
  end loop;
end;
$$;
