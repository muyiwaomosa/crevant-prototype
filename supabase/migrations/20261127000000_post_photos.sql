-- Photo posts (Build 5, Stage 5.3).
-- STAGING ONLY until approved for Production (see supabase/production-migrations.txt).
--
-- A post can now carry one photo, with an optional caption and an optional
-- description for screen readers. Text posts are unchanged.
--
-- What this migration adds:
--   * Storage: one private bucket, post-photos (JPEG only, at most 600 KB a
--     file), with no storage policy for members or visitors. Every upload,
--     link and deletion goes through the post-media Edge Function.
--   * social.media_uploads: every upload the database authorised, with the
--     two paths it chose (<member>/<upload>.jpg for the 1600 px photo and
--     <member>/<upload>-feed.jpg for the 800 px feed copy) and its state
--     (pending, stored, published, failed, expired). Shared with video later.
--   * social.post_media: a post's photo (one per post), and
--     social.posts.media_kind. A post with a photo may have an empty
--     caption; the text-only rule is unchanged.
--   * ops.media_deletions: the durable deletion queue. Filled by the
--     database itself (an author deleting a post, an account deleted, an
--     upload never published within 24 hours, a file nothing refers to),
--     worked through only by the server with retries and backoff. A file a
--     kept report snapshot refers to is held as evidence; a file of a live
--     post is never deleted.
--   * ops.media_drain_runs: every pass over the queue (scheduled, on request,
--     by a moderator), for monitoring.
--   * ops.media_settings and ops.media_admin_events: the founder's switch
--     (OFF), the storage cap and the egress thresholds, changed only by
--     server code and recorded. Photo uploads stay off until the switch is
--     on, a cap and both thresholds are set, and six hosted processing
--     checks have passed within the last 7 days.
--   * Member functions: app_photo_status, app_photo_upload_begin,
--     app_create_post with a photo, app_post_photos; moderators:
--     app_mod_report_media, app_mod_media_status. Service only: svc_photo_*,
--     svc_media_drain_claim, svc_media_drain_done.
--   * The four post readers (app_feed, app_member_posts, app_post,
--     app_catch_up) return one more column, media (null for text posts), and
--     app_report keeps a reported photo's paths in its snapshot.
--
-- Avatars (20261125000000) are not changed in any way.

-- ---------------------------------------------------------------------------
-- 1. Storage: the private photo bucket.

do $$
begin
  if pg_catalog.to_regclass('storage.buckets') is not null then
    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    values ('post-photos', 'post-photos', false, 614400, array['image/jpeg']);
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- 2. Uploads, post media and the photo on a post.

create table social.media_uploads (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  kind        text not null check (kind in ('photo')),
  full_path   text not null unique,
  feed_path   text not null unique,
  status      text not null default 'pending' check (status in ('pending', 'stored', 'published', 'failed', 'expired')),
  width       integer check (width is null or width between 1 and 1600),
  height      integer check (height is null or height between 1 and 1600),
  full_bytes  integer check (full_bytes is null or full_bytes between 1 and 614400),
  feed_bytes  integer check (feed_bytes is null or feed_bytes between 1 and 204800),
  created_at  timestamptz not null default pg_catalog.now(),
  stored_at   timestamptz,
  finished_at timestamptz,
  -- The database chooses both paths: the member's folder and the upload's id.
  constraint media_uploads_paths check (
    full_path = user_id::text || '/' || id::text || '.jpg'
    and feed_path = user_id::text || '/' || id::text || '-feed.jpg'
  ),
  constraint media_uploads_stored_complete check (
    status not in ('stored', 'published') or (width is not null and height is not null and full_bytes is not null and feed_bytes is not null and stored_at is not null)
  )
);
create index media_uploads_by_user on social.media_uploads (user_id, created_at);
create index media_uploads_open on social.media_uploads (created_at) where status in ('pending', 'stored', 'failed');
comment on table social.media_uploads is 'Uploads the database authorised (paths chosen here) and their state. Written only by member and service functions.';

alter table social.posts add column media_kind text check (media_kind is null or media_kind in ('photo'));
comment on column social.posts.media_kind is 'The kind of media on the post (photo), or null for a text post.';
-- The text rule is unchanged; a post with media may have an empty caption.
alter table social.posts drop constraint posts_body_valid;
alter table social.posts add constraint posts_body_valid check (
  (char_length(body) between 1 and 2000
   and body ~ '\S'
   and body !~ '[\u0001-\u0008\u000B\u000C\u000E-\u001F\u007F]')
  or (body = '' and media_kind is not null)
);

create table social.post_media (
  post_id     uuid primary key references social.posts (id) on delete cascade,
  upload_id   uuid not null unique references social.media_uploads (id) on delete cascade,
  kind        text not null check (kind in ('photo')),
  -- Optional, for screen readers.
  description text check (description is null or (char_length(description) between 1 and 250 and description ~ '\S'
                          and description !~ '[\u0001-\u0009\u000A-\u001F\u007F]')),
  created_at  timestamptz not null default pg_catalog.now()
);
comment on table social.post_media is 'A post''s photo: one per post. Read through the post functions; files only through the post-media Edge Function.';

alter table social.media_uploads enable row level security;
alter table social.post_media enable row level security;
revoke all on table social.media_uploads, social.post_media from public, anon, authenticated;

-- What the post functions return for a post's media (null for a text post).
create function social.post_media_json(p_post uuid)
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
revoke all on function social.post_media_json(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. The deletion queue, its runs, and the founder's settings.

create table ops.media_deletions (
  id              bigint generated always as identity primary key,
  -- No foreign keys: the queue outlives posts, uploads and accounts.
  bucket          text not null check (bucket in ('post-photos')),
  path            text not null check (path ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}(-feed)?\.jpg$'),
  reason          text not null check (char_length(reason) between 1 and 100),
  queued_at       timestamptz not null default pg_catalog.now(),
  attempts        integer not null default 0,
  last_attempt_at timestamptz,
  last_error      text check (last_error is null or char_length(last_error) <= 200),
  deleted_at      timestamptz,
  unique (bucket, path)
);
create index media_deletions_pending on ops.media_deletions (queued_at) where deleted_at is null;
comment on table ops.media_deletions is 'Files to delete from Storage. Filled by the database, worked through only by the server (post-media drain), with retries. Files a kept report snapshot refers to are held; files of live posts are never deleted.';

create table ops.media_drain_runs (
  id          bigint generated always as identity primary key,
  source      text not null check (source in ('scheduled', 'request', 'moderator')),
  claimed     integer not null,
  deleted     integer not null,
  failed      integer not null,
  error       text check (error is null or char_length(error) <= 200),
  finished_at timestamptz not null default pg_catalog.now()
);
create index media_drain_runs_recent on ops.media_drain_runs (source, finished_at);
comment on table ops.media_drain_runs is 'Every pass over the deletion queue, for monitoring (the photo storage panel).';
create trigger media_drain_runs_no_update
before update or delete on ops.media_drain_runs
for each row execute function ops.history_append_only();

create table ops.media_settings (
  id                     boolean primary key default true check (id),
  photos_enabled         boolean not null default false,
  photo_storage_cap_bytes bigint check (photo_storage_cap_bytes is null or photo_storage_cap_bytes > 0),
  egress_review_gb       numeric check (egress_review_gb is null or egress_review_gb > 0),
  egress_pause_gb        numeric check (egress_pause_gb is null or egress_pause_gb > 0),
  updated_at             timestamptz not null default pg_catalog.now(),
  updated_by             text not null default 'migration' check (char_length(updated_by) between 1 and 100 and strpos(updated_by, '@') = 0),
  constraint media_settings_thresholds check (egress_review_gb is null or egress_pause_gb is null or egress_review_gb < egress_pause_gb)
);
insert into ops.media_settings (id) values (true);
comment on table ops.media_settings is 'The founder''s photo switch (off by default), storage cap and egress thresholds. Changed only through ops.set_media_settings.';

create table ops.media_admin_events (
  id          bigint generated always as identity primary key,
  occurred_at timestamptz not null default pg_catalog.now(),
  actor       text not null check (char_length(actor) between 1 and 100 and strpos(actor, '@') = 0),
  action      text not null check (action in ('settings_changed', 'processing_check', 'hidden_media_queued')),
  ok          boolean,
  ms          integer,
  detail      text check (detail is null or char_length(detail) <= 300),
  db_session_user text not null default session_user,
  db_role     text not null default pg_catalog.current_setting('role')
);
create index media_admin_events_checks on ops.media_admin_events (action, occurred_at);
comment on table ops.media_admin_events is 'Append-only record of photo settings changes, hosted processing checks and pilot-close queueing of hidden media.';
create trigger media_admin_events_no_update
before update or delete on ops.media_admin_events
for each row execute function ops.history_append_only();

alter table ops.media_deletions enable row level security;
alter table ops.media_drain_runs enable row level security;
alter table ops.media_settings enable row level security;
alter table ops.media_admin_events enable row level security;
revoke all on table ops.media_deletions, ops.media_drain_runs, ops.media_settings, ops.media_admin_events from public, anon, authenticated;
grant select on table ops.media_deletions, ops.media_drain_runs, ops.media_settings, ops.media_admin_events to service_role;

create function ops.queue_media_deletion(p_bucket text, p_path text, p_reason text)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into ops.media_deletions (bucket, path, reason) values (p_bucket, p_path, p_reason)
  on conflict (bucket, path) do nothing;
$$;
revoke all on function ops.queue_media_deletion(text, text, text) from public, anon, authenticated;

-- An author deleting a post queues its files (a moderator's hide does not:
-- hidden posts can be restored).
create function ops.post_media_on_delete()
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
revoke all on function ops.post_media_on_delete() from public, anon, authenticated;
create trigger post_media_on_delete
after update of deleted_at on social.posts
for each row execute function ops.post_media_on_delete();

-- An upload record removed (its account deleted) queues its files.
create function ops.media_upload_removed()
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
revoke all on function ops.media_upload_removed() from public, anon, authenticated;
create trigger media_upload_removed
after delete on social.media_uploads
for each row execute function ops.media_upload_removed();

-- Photo bytes stored now (both copies), from Storage itself.
create function ops.photo_storage_used()
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
    execute $q$select coalesce(sum((o.metadata->>'size')::bigint), 0) from storage.objects o where o.bucket_id = 'post-photos'$q$ into n;
  end if;
  return n;
end;
$$;
revoke all on function ops.photo_storage_used() from public, anon, authenticated;

-- Whether photo uploads may be authorised now.
create function ops.photos_open()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select s.photos_enabled and s.photo_storage_cap_bytes is not null from ops.media_settings s where s.id;
$$;
revoke all on function ops.photos_open() from public, anon, authenticated;

-- The founder's settings: server only, recorded. Turning photos on needs a
-- cap, both egress thresholds, and six passing hosted processing checks
-- (each under 1 second) as the most recent checks, within the last 7 days.
create function ops.set_media_settings(
  p_actor text, p_photos_enabled boolean, p_cap_bytes bigint, p_egress_review_gb numeric, p_egress_pause_gb numeric
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ok integer;
begin
  if p_actor is null or char_length(p_actor) not between 1 and 100 or strpos(p_actor, '@') > 0 then
    raise exception 'settings refused: give an actor label (not an email address)';
  end if;
  if p_photos_enabled then
    if p_cap_bytes is null or p_egress_review_gb is null or p_egress_pause_gb is null then
      raise exception 'settings refused: photos stay off until the storage cap and both egress thresholds are set from the verified staging allowances';
    end if;
    select count(*) into v_ok from (
      select e.ok, e.ms from ops.media_admin_events e
      where e.action = 'processing_check' and e.occurred_at > pg_catalog.now() - interval '7 days'
      order by e.occurred_at desc, e.id desc limit 6
    ) last6 where last6.ok and last6.ms < 1000;
    if v_ok < 6 then
      raise exception 'settings refused: photos stay off until the six most recent hosted processing checks (within 7 days) have passed under 1 second';
    end if;
  end if;
  update ops.media_settings
  set photos_enabled = p_photos_enabled, photo_storage_cap_bytes = p_cap_bytes,
      egress_review_gb = p_egress_review_gb, egress_pause_gb = p_egress_pause_gb,
      updated_at = pg_catalog.now(), updated_by = p_actor
  where id;
  insert into ops.media_admin_events (actor, action, detail)
  values (p_actor, 'settings_changed', pg_catalog.format('photos %s; cap %s bytes; egress review %s GB, pause %s GB',
          case when p_photos_enabled then 'on' else 'off' end, coalesce(p_cap_bytes::text, 'unset'),
          coalesce(p_egress_review_gb::text, 'unset'), coalesce(p_egress_pause_gb::text, 'unset')));
end;
$$;
revoke all on function ops.set_media_settings(text, boolean, bigint, numeric, numeric) from public, anon, authenticated;
grant execute on function ops.set_media_settings(text, boolean, bigint, numeric, numeric) to service_role;

-- Pilot close only (docs/PHOTOS.md): queues the files of moderator-hidden
-- posts. Files a kept report snapshot refers to stay held. Recorded.
create function ops.queue_hidden_media(p_actor text, p_confirm text)
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
revoke all on function ops.queue_hidden_media(text, text) from public, anon, authenticated;
grant execute on function ops.queue_hidden_media(text, text) to service_role;

-- ---------------------------------------------------------------------------
-- 4. Posting a photo (active pilot members).

-- Whether the member can post photos now (the app shows Add photo only then).
create function public.app_photo_status()
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := social.current_member();
begin
  return coalesce(ops.photos_open(), false);
end;
$$;

-- Authorises one upload: the switch, 30 attempts and 10 photo posts a day,
-- and the storage cap. The database chooses both paths.
create function public.app_photo_upload_begin()
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

-- Publishes a post with a stored photo: the member's own, stored in the
-- last 30 minutes, not used yet. One post per request id (a retry returns it).
create function public.app_create_post(p_body text, p_request_id uuid, p_media uuid, p_media_description text default null)
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

-- Photo paths for the posts the member can see (live, by a visible member):
-- the Edge Function signs them. At most 100 at a time.
create function public.app_post_photos(p_posts uuid[])
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

-- ---------------------------------------------------------------------------
-- 5. Service-only steps (the post-media Edge Function, with the service key).

-- The photo is stored (both copies): re-checks membership at this moment.
create function public.svc_photo_upload_stored(p_upload uuid, p_width integer, p_height integer, p_full_bytes integer, p_feed_bytes integer)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  u record;
begin
  select x.id, x.user_id, x.status, x.created_at into u from social.media_uploads x where x.id = p_upload for update;
  if u.id is null or u.status <> 'pending' then
    raise exception 'not_found' using errcode = 'P0001';
  end if;
  if u.created_at < pg_catalog.now() - interval '15 minutes' then
    raise exception 'upload_expired' using errcode = 'P0001';
  end if;
  if not ops.member_access_active(u.user_id) then
    raise exception 'no_pilot_access' using errcode = 'P0001';
  end if;
  update social.media_uploads
  set status = 'stored', width = p_width, height = p_height, full_bytes = p_full_bytes, feed_bytes = p_feed_bytes, stored_at = pg_catalog.now()
  where id = p_upload;
end;
$$;

-- An upload that failed after authorisation: its files (if any) are queued.
create function public.svc_photo_upload_failed(p_upload uuid, p_reason text)
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

-- Claims up to p_limit files to delete now. First queues uploads never
-- published within 24 hours and files nothing refers to (over 24 hours old).
-- Never returns a file of a live post, or one a kept report snapshot refers
-- to (evidence). Retries back off: 5, 10, 20... minutes, up to 8 attempts.
create function public.svc_media_drain_claim(p_limit integer default 50)
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

-- Records the outcome of a pass: which claimed files are gone, which failed.
create function public.svc_media_drain_done(p_source text, p_deleted bigint[], p_failed bigint[], p_error text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_source is null or p_source not in ('scheduled', 'request', 'moderator') then
    raise exception 'invalid_request' using errcode = 'P0001';
  end if;
  update ops.media_deletions set deleted_at = pg_catalog.now(), last_error = null
  where id = any (coalesce(p_deleted, '{}')) and deleted_at is null;
  update ops.media_deletions set last_error = left(coalesce(nullif(p_error, ''), 'delete failed'), 200)
  where id = any (coalesce(p_failed, '{}')) and deleted_at is null;
  insert into ops.media_drain_runs (source, claimed, deleted, failed, error)
  values (p_source, cardinality(coalesce(p_deleted, '{}')) + cardinality(coalesce(p_failed, '{}')),
          cardinality(coalesce(p_deleted, '{}')), cardinality(coalesce(p_failed, '{}')),
          case when cardinality(coalesce(p_failed, '{}')) > 0 then left(coalesce(nullif(p_error, ''), 'delete failed'), 200) end);
end;
$$;

-- One hosted processing check (the founder runs six from the photo storage
-- panel before turning photos on). Recorded; the switch requires them.
create function public.svc_photo_check_record(p_actor text, p_ms integer, p_ok boolean, p_detail text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into ops.media_admin_events (actor, action, ok, ms, detail)
  values (left(coalesce(nullif(p_actor, ''), 'founder'), 100), 'processing_check', coalesce(p_ok, false), p_ms, left(p_detail, 300));
end;
$$;

-- ---------------------------------------------------------------------------
-- 6. Moderators: the reported photo, and the photo storage panel.

-- The reported photo's paths, while the report's snapshot is kept (also
-- after the post was hidden or deleted).
create function public.app_mod_report_media(p_report uuid)
returns table (full_path text, feed_path text, description text)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := social.current_moderator();
begin
  return query
  select r.snapshot->>'media_full_path', r.snapshot->>'media_feed_path', r.snapshot->>'media_description'
  from ops.content_reports r
  where r.id = p_report and r.snapshot ? 'media_full_path';
end;
$$;

-- Photo storage at a glance: the switch, storage against the cap, the
-- queue, evidence held, failures, the last passes and the processing checks.
create function public.app_mod_media_status()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := social.current_moderator();
  s record;
begin
  select * into s from ops.media_settings where id;
  return pg_catalog.jsonb_build_object(
    'photos_enabled', s.photos_enabled,
    'cap_bytes', s.photo_storage_cap_bytes,
    'egress_review_gb', s.egress_review_gb,
    'egress_pause_gb', s.egress_pause_gb,
    'used_bytes', ops.photo_storage_used(),
    'photo_posts', (select count(*) from social.posts p where p.media_kind = 'photo' and p.deleted_at is null),
    'queued', (select count(*) from ops.media_deletions q where q.deleted_at is null),
    'oldest_queued_at', (select min(q.queued_at) from ops.media_deletions q where q.deleted_at is null),
    'failing', (select count(*) from ops.media_deletions q where q.deleted_at is null and q.attempts >= 3),
    'gave_up', (select count(*) from ops.media_deletions q where q.deleted_at is null and q.attempts >= 8),
    'held', (select count(*) from ops.media_deletions q where q.deleted_at is null
             and exists (select 1 from ops.content_reports r where r.snapshot is not null
                         and (r.snapshot->>'media_full_path' = q.path or r.snapshot->>'media_feed_path' = q.path))),
    'held_open_over_30_days', (select count(*) from ops.media_deletions q where q.deleted_at is null
             and exists (select 1 from ops.content_reports r where r.status = 'open' and r.created_at < pg_catalog.now() - interval '30 days'
                         and (r.snapshot->>'media_full_path' = q.path or r.snapshot->>'media_feed_path' = q.path))),
    'last_scheduled_at', (select max(d.finished_at) from ops.media_drain_runs d where d.source = 'scheduled'),
    'last_run_at', (select max(d.finished_at) from ops.media_drain_runs d),
    'last_run_failed', coalesce((select d.failed > 0 from ops.media_drain_runs d order by d.finished_at desc, d.id desc limit 1), false),
    'checks', coalesce((select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('ok', c.ok, 'ms', c.ms, 'at', c.occurred_at) order by c.occurred_at desc)
                        from (select e.ok, e.ms, e.occurred_at from ops.media_admin_events e where e.action = 'processing_check'
                              order by e.occurred_at desc, e.id desc limit 6) c), '[]'::jsonb)
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- 7. The post readers return the photo (one more column), and reports keep
--    a reported photo's paths. Otherwise unchanged from 20261122000000 and
--    20261124000000.

drop function public.app_feed(timestamptz, integer);
create function public.app_feed(p_before timestamptz default null, p_limit integer default 20)
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
         exists (select 1 from social.clique_members m where m.fan_id = v_uid and m.creator_id = s.author_id and m.removed_at is null),
         s.author_id = v_uid,
         social.post_media_json(s.id)
  from social.posts s
  join social.visible_members p on p.id = s.author_id
  where s.deleted_at is null
    and (s.author_id = v_uid or exists (select 1 from social.follows f where f.follower_id = v_uid and f.creator_id = s.author_id))
    and (p_before is null or s.created_at < p_before)
  order by s.created_at desc, s.id desc
  limit least(greatest(coalesce(p_limit, 20), 1), 50);
end;
$$;

drop function public.app_member_posts(uuid, timestamptz, integer);
create function public.app_member_posts(p_member uuid, p_before timestamptz default null, p_limit integer default 20)
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
         exists (select 1 from social.clique_members m where m.fan_id = v_uid and m.creator_id = s.author_id and m.removed_at is null),
         s.author_id = v_uid,
         social.post_media_json(s.id)
  from social.posts s
  join social.visible_members p on p.id = s.author_id
  where s.deleted_at is null
    and s.author_id = p_member
    and (p_before is null or s.created_at < p_before)
  order by s.created_at desc, s.id desc
  limit least(greatest(coalesce(p_limit, 20), 1), 50);
end;
$$;

drop function public.app_post(uuid);
create function public.app_post(p_post uuid)
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
         exists (select 1 from social.clique_members m where m.fan_id = v_uid and m.creator_id = s.author_id and m.removed_at is null),
         s.author_id = v_uid,
         social.post_media_json(s.id)
  from social.posts s
  join social.visible_members p on p.id = s.author_id
  where s.id = p_post and s.deleted_at is null;
end;
$$;

drop function public.app_catch_up(uuid, timestamptz, uuid);
create function public.app_catch_up(p_creator uuid, p_before_at timestamptz default null, p_before_id uuid default null)
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
         false,
         social.post_media_json(b.id)
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
             -- Photo posts (20261127000000): the photo's paths, held as evidence while this snapshot is kept.
             || coalesce((select pg_catalog.jsonb_build_object('media_kind', m.kind, 'media_full_path', u.full_path,
                                  'media_feed_path', u.feed_path, 'media_description', m.description)
                          from social.post_media m join social.media_uploads u on u.id = m.upload_id
                          where m.post_id = s.id), '{}'::jsonb)
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


-- ---------------------------------------------------------------------------
-- 8. Comments and grants.

comment on function public.app_photo_status() is 'Whether the member can post photos now (switch on and a storage cap set).';
comment on function public.app_photo_upload_begin() is 'Authorises one photo upload: the switch, 30 attempts and 10 photo posts a day, and the storage cap. The database chooses the paths.';
comment on function public.app_create_post(text, uuid, uuid, text) is 'Publishes a post with a stored photo (caption optional). One post per request id.';
comment on function public.app_post_photos(uuid[]) is 'Photo paths of posts the member can see, for the post-media Edge Function to sign (at most 100).';
comment on function public.app_mod_report_media(uuid) is 'Moderators only: the reported photo''s paths while the report snapshot is kept.';
comment on function public.app_mod_media_status() is 'Moderators only: photo storage, the deletion queue, evidence held, failures and the processing checks.';

do $$
declare
  f text;
begin
  foreach f in array array[
    'public.app_photo_status()',
    'public.app_photo_upload_begin()',
    'public.app_create_post(text, uuid, uuid, text)',
    'public.app_post_photos(uuid[])',
    'public.app_mod_report_media(uuid)',
    'public.app_mod_media_status()',
    'public.app_feed(timestamptz, integer)',
    'public.app_member_posts(uuid, timestamptz, integer)',
    'public.app_post(uuid)',
    'public.app_catch_up(uuid, timestamptz, uuid)',
    'public.app_report(text, uuid, text, text)'
  ] loop
    execute pg_catalog.format('revoke all on function %s from public, anon', f);
    execute pg_catalog.format('grant execute on function %s to authenticated, service_role', f);
  end loop;
  foreach f in array array[
    'public.svc_photo_upload_stored(uuid, integer, integer, integer, integer)',
    'public.svc_photo_upload_failed(uuid, text)',
    'public.svc_media_drain_claim(integer)',
    'public.svc_media_drain_done(text, bigint[], bigint[], text)',
    'public.svc_photo_check_record(text, integer, boolean, text)'
  ] loop
    execute pg_catalog.format('revoke all on function %s from public, anon, authenticated', f);
    execute pg_catalog.format('grant execute on function %s to service_role', f);
  end loop;
end;
$$;
comment on function public.app_feed(timestamptz, integer) is 'Following feed: posts from people the member follows, and their own, newest first (with any photo).';
comment on function public.app_post(uuid) is 'One live post (with any photo).';
comment on function public.app_member_posts(uuid, timestamptz, integer) is 'One member''s posts, newest first (with any photo).';
comment on function public.app_catch_up(uuid, timestamptz, uuid) is 'Up to 20 of a followed creator''s most recent unseen posts, oldest first. Older batches use the oldest post''s (created_at, id). Read-only: never marks posts viewed.';
