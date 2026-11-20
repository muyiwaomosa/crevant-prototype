-- TEST ONLY (throwaway databases). Photo posts (20261127000000), as real
-- signed-in accounts, the service role and server code, calling the same
-- functions the app and the post-media Edge Function call.
--
--   A = ...0e01: posts photos.     B = ...0e02: follows A, reports.
--   M = ...0e03: a moderator.      R = ...0e04: posts, then loses access.
--   D = ...0e05: an account that gets deleted.

set role supabase_auth_admin;
insert into auth.users (id, email, email_confirmed_at) values
  ('00000000-0000-4000-8000-00000000c501', 'ph-a@example.test', now()),
  ('00000000-0000-4000-8000-00000000c502', 'ph-b@example.test', now()),
  ('00000000-0000-4000-8000-00000000c503', 'ph-m@example.test', now()),
  ('00000000-0000-4000-8000-00000000c504', 'ph-r@example.test', now()),
  ('00000000-0000-4000-8000-00000000c505', 'ph-d@example.test', now());
reset role;
update public.profiles set username = 'ph_' || right(id::text, 1), display_name = 'Ph ' || right(id::text, 1) where id::text like '00000000-0000-4000-8000-00000000c50_';
select ops.grant_member_access(('00000000-0000-4000-8000-00000000c50' || i)::uuid, 'tester', 'test') from generate_series(1, 5) i;
select ops.grant_moderator('00000000-0000-4000-8000-00000000c503', 'test', 'photo test');
insert into social.follows (follower_id, creator_id, followed_at) values
  ('00000000-0000-4000-8000-00000000c502', '00000000-0000-4000-8000-00000000c501', now() - interval '1 hour');

create function pg_temp.expect_error_ph(sql text, expected text, what text)
returns void language plpgsql as $$
declare got text;
begin
  begin execute sql; exception when others then got := sqlerrm; end;
  if got is null then raise exception 'FAIL: % succeeded, expected "%"', what, expected; end if;
  if got !~ expected then raise exception 'FAIL: % failed with "%", expected "%"', what, got, expected; end if;
end;
$$;
grant execute on function pg_temp.expect_error_ph(text, text, text) to authenticated, anon, service_role;
-- Uploads begun by the tests, by name.
create temp table ph (name text primary key, id uuid, full_path text, feed_path text);
grant all on ph to authenticated, service_role;
create function pg_temp.begin_as(p_user text, p_name text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  insert into ph select p_name, b.upload_id, b.full_path, b.feed_path from public.app_photo_upload_begin() b;
  execute 'reset role';
end;
$$;
create function pg_temp.stored(p_name text) returns void language plpgsql as $$
begin
  execute 'set local role service_role';
  perform public.svc_photo_upload_stored((select id from ph where name = p_name), 1600, 1067, 300000, 90000);
  execute 'reset role';
end;
$$;
create function pg_temp.post_as(p_user text, p_name text, p_body text, p_request uuid, p_desc text default null) returns uuid language plpgsql as $$
declare v uuid;
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  v := public.app_create_post(p_body, p_request, (select id from ph where name = p_name), p_desc);
  execute 'reset role';
  return v;
end;
$$;

-- 1. Off by default: nothing can be uploaded, and the switch has a gate.
begin;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-00000000c501","role":"authenticated"}', true);
set local role authenticated;
do $$
begin
  if public.app_photo_status() then raise exception 'FAIL: photos are on by default'; end if;
  perform pg_temp.expect_error_ph('select * from public.app_photo_upload_begin()', 'photos_unavailable', 'an upload while photos are off');
  perform pg_temp.expect_error_ph('select ops.set_media_settings(''x'', true, 1, 1, 2)', 'permission denied', 'a member changing the photo settings');
  perform pg_temp.expect_error_ph('select public.svc_photo_check_record(''x'', 1, true, null)', 'permission denied', 'a member recording a processing check');
  raise notice 'PASS: photos are off by default, and members can''t change the settings or record checks';
end $$;
commit;
do $$
begin
  perform pg_temp.expect_error_ph('select ops.set_media_settings(''founder'', true, null, 10, 20)', 'storage cap', 'turning photos on without a cap');
  perform pg_temp.expect_error_ph('select ops.set_media_settings(''founder'', true, 1000000000, null, 20)', 'egress thresholds', 'turning photos on without egress thresholds');
  perform pg_temp.expect_error_ph('select ops.set_media_settings(''founder'', true, 1000000000, 10, 20)', 'processing checks', 'turning photos on with no processing checks');
  perform public.svc_photo_check_record('founder', 400, true, 'check') from generate_series(1, 5);
  perform public.svc_photo_check_record('founder', 1300, true, 'slow');
  perform pg_temp.expect_error_ph('select ops.set_media_settings(''founder'', true, 1000000000, 10, 20)', 'processing checks', 'turning photos on after a slow check');
  perform public.svc_photo_check_record('founder', 450, true, 'check') from generate_series(1, 6);
  perform pg_temp.expect_error_ph('select ops.set_media_settings(''a@b.c'', true, 1000000000, 10, 20)', 'actor label', 'an email address as the actor');
  perform pg_temp.expect_error_ph('select ops.set_media_settings(''founder'', true, 1000000000, 30, 20)', 'media_settings_thresholds', 'a review threshold above the pause threshold');
  perform ops.set_media_settings('founder', true, 1000000000, 10, 20);
  if not (select photos_enabled from ops.media_settings) then raise exception 'FAIL: photos did not turn on'; end if;
  if (select count(*) from ops.media_admin_events where action = 'settings_changed') <> 1 then raise exception 'FAIL: the change was not recorded'; end if;
  raise notice 'PASS: photos turn on only with a cap, both egress thresholds and six recent passing processing checks (each under 1 second); recorded';
end $$;

-- 2. Upload, store and publish; the paths are chosen by the database.
select pg_temp.begin_as('00000000-0000-4000-8000-00000000c501', 'a1');
do $$
begin
  if (select full_path from ph where name = 'a1') <> '00000000-0000-4000-8000-00000000c501/' || (select id from ph where name = 'a1') || '.jpg'
     or (select feed_path from ph where name = 'a1') <> '00000000-0000-4000-8000-00000000c501/' || (select id from ph where name = 'a1') || '-feed.jpg' then
    raise exception 'FAIL: the paths are not in A''s folder, named by the upload';
  end if;
  raise notice 'PASS: an upload is authorised with both paths chosen by the database, in the member''s own folder';
end $$;
-- Not stored yet: can't be published.
do $$ begin
  perform pg_temp.expect_error_ph(format('select pg_temp.post_as(%L, %L, %L, %L)', '00000000-0000-4000-8000-00000000c501', 'a1', '', gen_random_uuid()), 'upload_not_ready', 'publishing before the photo is stored');
end $$;
select pg_temp.stored('a1');
do $$
declare
  p1 uuid; p2 uuid; rid uuid := '00000000-0000-4000-8000-00000000e0a1';
begin
  -- B can't publish A's upload.
  perform pg_temp.expect_error_ph(format('select pg_temp.post_as(%L, %L, %L, %L)', '00000000-0000-4000-8000-00000000c502', 'a1', '', gen_random_uuid()), 'upload_not_ready', 'publishing another member''s upload');
  perform pg_temp.expect_error_ph(format('select pg_temp.post_as(%L, %L, %L, %L, %L)', '00000000-0000-4000-8000-00000000c501', 'a1', '', gen_random_uuid(), repeat('d', 251)), 'invalid_description', 'a description over 250 characters');
  p1 := pg_temp.post_as('00000000-0000-4000-8000-00000000c501', 'a1', '   ', rid, '  A red bicycle by a canal.  ');
  p2 := pg_temp.post_as('00000000-0000-4000-8000-00000000c501', 'a1', '', rid, 'A red bicycle by a canal.');
  if p1 is null or p1 <> p2 then raise exception 'FAIL: a retry with the same request id made another post'; end if;
  if (select body from social.posts where id = p1) <> '' or (select media_kind from social.posts where id = p1) <> 'photo'
     or (select description from social.post_media where post_id = p1) <> 'A red bicycle by a canal.'
     or (select status from social.media_uploads where id = (select id from ph where name = 'a1')) <> 'published' then
    raise exception 'FAIL: the photo post was not stored as expected';
  end if;
  -- The same upload can't be used twice; the same request id with another upload is refused.
  perform pg_temp.expect_error_ph(format('select pg_temp.post_as(%L, %L, %L, %L)', '00000000-0000-4000-8000-00000000c501', 'a1', 'again', gen_random_uuid()), 'upload_not_ready', 'reusing a published upload');
  raise notice 'PASS: a stored photo publishes once (no caption needed, description trimmed); retries return the same post; uploads can''t be reused or taken by another member';
end $$;

-- 3. The text rule is unchanged.
begin;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-00000000c501","role":"authenticated"}', true);
set local role authenticated;
do $$
begin
  perform pg_temp.expect_error_ph($q$select public.app_create_post('   ', gen_random_uuid())$q$, 'empty', 'an empty text post');
  perform pg_temp.expect_error_ph($q$select public.app_create_post('')$q$, 'empty', 'an empty text post (no request id)');
  perform pg_temp.expect_error_ph($q$select public.app_create_post(repeat('x', 2001), gen_random_uuid())$q$, 'too_long', 'a text post over 2,000 characters');
end $$;
commit;
do $$
begin
  begin
    insert into social.posts (author_id, body) values ('00000000-0000-4000-8000-00000000c501', '');
    raise exception 'FAIL: an empty text post was stored directly';
  exception when check_violation then null;
  end;
  begin
    insert into social.posts (author_id, body, media_kind) values ('00000000-0000-4000-8000-00000000c501', repeat('x', 2001), 'photo');
    raise exception 'FAIL: a caption over 2,000 characters was stored';
  exception when check_violation then null;
  end;
  raise notice 'PASS: the text-only rule is unchanged; an empty caption is allowed only on a post with media';
end $$;

-- 4. What members see: the photo in every post reader, links only for visible posts.
create temp table ph_posts as select id, author_id from social.posts where media_kind = 'photo';
grant select on ph_posts to authenticated;
begin;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-00000000c502","role":"authenticated"}', true);
set local role authenticated;
do $$
declare
  p uuid := (select id from ph_posts limit 1);
  m jsonb;
begin
  m := (select f.media from public.app_feed(null, 50) f where f.id = p);
  if m is null or m->>'kind' <> 'photo' or (m->>'width')::int <> 1600 or (m->>'height')::int <> 1067 or m->>'description' <> 'A red bicycle by a canal.' then
    raise exception 'FAIL: the feed does not carry the photo: %', m;
  end if;
  if (select f.media from public.app_post(p) f) is null or (select f.media from public.app_member_posts('00000000-0000-4000-8000-00000000c501', null, 50) f where f.id = p) is null
     or (select f.media from public.app_catch_up('00000000-0000-4000-8000-00000000c501', null, null) f where f.id = p) is null then
    raise exception 'FAIL: a post reader does not carry the photo';
  end if;
  if (select count(*) from public.app_post_photos(array[p])) <> 1
     or (select full_path from public.app_post_photos(array[p])) not like '00000000-0000-4000-8000-00000000c501/%.jpg' then
    raise exception 'FAIL: B gets no link path for A''s photo';
  end if;
  perform pg_temp.expect_error_ph(format('select * from public.app_post_photos(%L::uuid[])', (select array_agg(gen_random_uuid()) from generate_series(1, 101))), 'too_many', 'more than 100 posts');
  perform pg_temp.expect_error_ph('select count(*) from social.post_media', 'permission denied', 'reading post media directly');
  perform pg_temp.expect_error_ph('select count(*) from social.media_uploads', 'permission denied', 'reading uploads directly');
  perform pg_temp.expect_error_ph('select count(*) from ops.media_deletions', 'permission denied', 'reading the deletion queue');
  perform pg_temp.expect_error_ph('select * from public.svc_media_drain_claim(10)', 'permission denied', 'a member claiming deletions');
  perform pg_temp.expect_error_ph('select * from public.app_mod_media_status()', 'not_moderator', 'a member reading photo storage');
  raise notice 'PASS: every post reader returns the photo; links only through the database, for visible posts; members can''t reach uploads, the queue or service steps';
end $$;
commit;
-- Text posts are unchanged in every reader: media is null.
do $$
begin
  insert into social.posts (author_id, body) values ('00000000-0000-4000-8000-00000000c501', 'Just words');
end $$;
begin;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-00000000c502","role":"authenticated"}', true);
set local role authenticated;
do $$
begin
  if (select f.media from public.app_feed(null, 50) f where f.body = 'Just words') is not null then
    raise exception 'FAIL: a text post has media';
  end if;
  raise notice 'PASS: text posts return no media';
end $$;
commit;

-- 5. Membership: revoked at store time, and a revoked author's photos get no links.
select pg_temp.begin_as('00000000-0000-4000-8000-00000000c504', 'r1');
select ops.revoke_member_access('00000000-0000-4000-8000-00000000c504', 'test');
do $$ begin
  perform pg_temp.expect_error_ph($q$select pg_temp.stored('r1')$q$, 'no_pilot_access', 'storing for a revoked member');
  raise notice 'PASS: storing re-checks membership at that moment';
end $$;
-- Expired windows: storing after 15 minutes, publishing after 30 minutes.
select pg_temp.begin_as('00000000-0000-4000-8000-00000000c501', 'a2');
update social.media_uploads set created_at = now() - interval '16 minutes' where id = (select id from ph where name = 'a2');
do $$ begin
  perform pg_temp.expect_error_ph($q$select pg_temp.stored('a2')$q$, 'upload_expired', 'storing after 15 minutes');
end $$;
select pg_temp.begin_as('00000000-0000-4000-8000-00000000c501', 'a3');
select pg_temp.stored('a3');
update social.media_uploads set stored_at = now() - interval '31 minutes' where id = (select id from ph where name = 'a3');
do $$ begin
  perform pg_temp.expect_error_ph(format('select pg_temp.post_as(%L, %L, %L, %L)', '00000000-0000-4000-8000-00000000c501', 'a3', 'late', gen_random_uuid()), 'upload_expired', 'publishing 31 minutes after storing');
  raise notice 'PASS: an upload must be stored within 15 minutes and published within 30';
end $$;

-- 6. Limits: 10 photo posts and 30 attempts a day, the storage cap, and the switch.
do $$
begin
  insert into social.posts (author_id, body, media_kind) select '00000000-0000-4000-8000-00000000c505', 'old', 'photo' from generate_series(1, 10);
end $$;
do $$ begin
  perform pg_temp.expect_error_ph($q$select pg_temp.begin_as('00000000-0000-4000-8000-00000000c505', 'd-over')$q$, 'photo_limit', 'an 11th photo post in a day');
end $$;
delete from social.posts where author_id = '00000000-0000-4000-8000-00000000c505';
insert into social.media_uploads (id, user_id, kind, full_path, feed_path, status)
select x, '00000000-0000-4000-8000-00000000c505', 'photo', '00000000-0000-4000-8000-00000000c505/' || x || '.jpg', '00000000-0000-4000-8000-00000000c505/' || x || '-feed.jpg', 'failed'
from (select gen_random_uuid() x from generate_series(1, 30)) g;
do $$ begin
  perform pg_temp.expect_error_ph($q$select pg_temp.begin_as('00000000-0000-4000-8000-00000000c505', 'd-over')$q$, 'photo_limit', 'a 31st upload attempt in a day');
end $$;
select ops.set_media_settings('founder', true, 1000000, 10, 20);
insert into storage.objects (bucket_id, name, metadata) values ('post-photos', '00000000-0000-4000-8000-00000000c501/x-big.jpg', '{"size": 900000}');
do $$ begin
  perform pg_temp.expect_error_ph($q$select pg_temp.begin_as('00000000-0000-4000-8000-00000000c502', 'b-full')$q$, 'storage_full', 'an upload past the storage cap');
end $$;
delete from storage.objects where name = '00000000-0000-4000-8000-00000000c501/x-big.jpg';
select ops.set_media_settings('founder', false, 1000000000, 10, 20);
do $$ begin
  perform pg_temp.expect_error_ph($q$select pg_temp.begin_as('00000000-0000-4000-8000-00000000c502', 'b-off')$q$, 'photos_unavailable', 'an upload with the switch off');
end $$;
select ops.set_media_settings('founder', true, 1000000000, 10, 20);
do $$ begin
  raise notice 'PASS: 10 photo posts and 30 attempts a day, the storage cap and the founder switch are enforced';
end $$;

-- 7. Deletion: an author's delete queues both files; a moderator's hide doesn't.
select pg_temp.begin_as('00000000-0000-4000-8000-00000000c501', 'a4');
select pg_temp.stored('a4');
select pg_temp.begin_as('00000000-0000-4000-8000-00000000c501', 'a5');
select pg_temp.stored('a5');
select pg_temp.begin_as('00000000-0000-4000-8000-00000000c501', 'a6');
select pg_temp.stored('a6');
create temp table ph_ids (name text, post uuid);
grant all on ph_ids to authenticated;
insert into ph_ids values ('a4', pg_temp.post_as('00000000-0000-4000-8000-00000000c501', 'a4', 'Deleted by me', gen_random_uuid()));
insert into ph_ids values ('a5', pg_temp.post_as('00000000-0000-4000-8000-00000000c501', 'a5', 'Reported, then deleted', gen_random_uuid()));
insert into ph_ids values ('a6', pg_temp.post_as('00000000-0000-4000-8000-00000000c501', 'a6', 'Stays live', gen_random_uuid()));
-- B reports a5 (the snapshot keeps the photo's paths).
begin;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-00000000c502","role":"authenticated"}', true);
set local role authenticated;
select public.app_report('post', (select post from ph_ids where name = 'a5'), 'harassment', null);
commit;
-- M hides the first photo post (restorable: not queued).
do $$
declare rid uuid;
begin
  if (select r.snapshot->>'media_full_path' from ops.content_reports r where r.target_id = (select post from ph_ids where name = 'a5')) <> (select full_path from ph where name = 'a5') then
    raise exception 'FAIL: the report snapshot does not keep the photo''s path';
  end if;
  insert into ops.content_reports (reporter_id, target_type, target_id, target_owner_id, reason, priority, snapshot)
  select '00000000-0000-4000-8000-00000000c502', 'post', s.id, s.author_id, 'spam', false, jsonb_build_object('body', '')
  from social.posts s where s.id = (select p.id from social.posts p where p.media_kind = 'photo' and p.author_id = '00000000-0000-4000-8000-00000000c501' order by p.created_at limit 1)
  returning id into rid;
  perform set_config('ph.hide_report', rid::text, false);
end $$;
begin;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-00000000c503","role":"authenticated"}', true);
set local role authenticated;
select public.app_mod_hide(current_setting('ph.hide_report')::uuid, 'test hide');
commit;
begin;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-00000000c501","role":"authenticated"}', true);
set local role authenticated;
select public.app_delete_post((select post from ph_ids where name = 'a4'));
select public.app_delete_post((select post from ph_ids where name = 'a5'));
commit;
do $$
begin
  if (select count(*) from ops.media_deletions where path in ((select full_path from ph where name = 'a4'), (select feed_path from ph where name = 'a4'))) <> 2 then
    raise exception 'FAIL: deleting a photo post did not queue both files';
  end if;
  if exists (select 1 from ops.media_deletions where path = (select full_path from ph where name = 'a1')) then
    raise exception 'FAIL: a moderator''s hide queued the photo (it must stay restorable)';
  end if;
  raise notice 'PASS: an author''s delete queues both files in the same transaction; a moderator''s hide keeps them';
end $$;

-- 8. Draining: abandoned uploads and orphans are queued; evidence and live posts are never claimed.
update social.media_uploads set created_at = now() - interval '25 hours' where id = (select id from ph where name = 'a2');
insert into storage.objects (bucket_id, name, created_at, metadata) values
  ('post-photos', '00000000-0000-4000-8000-00000000c501/00000000-0000-4000-8000-0000000000aa.jpg', now() - interval '2 days', '{"size": 1000}'),
  ('post-photos', '00000000-0000-4000-8000-00000000c501/00000000-0000-4000-8000-0000000000ab.jpg', now() - interval '1 hour', '{"size": 1000}');
-- A live post's file queued by mistake must never be claimed.
select ops.queue_media_deletion('post-photos', (select full_path from ph where name = 'a6'), 'mistake');
create temp table ph_claim (id bigint, bucket text, path text);
grant all on ph_claim to service_role;
begin;
set local role service_role;
insert into ph_claim select * from public.svc_media_drain_claim(100);
commit;
do $$
declare live text := (select full_path from ph where name = 'a6');
begin
  if not exists (select 1 from ph_claim where path = (select full_path from ph where name = 'a4'))
     or not exists (select 1 from ph_claim where path = (select feed_path from ph where name = 'a4')) then
    raise exception 'FAIL: the deleted post''s files were not claimed';
  end if;
  if exists (select 1 from ph_claim where path in ((select full_path from ph where name = 'a5'), (select feed_path from ph where name = 'a5'))) then
    raise exception 'FAIL: reported evidence was claimed for deletion';
  end if;
  if exists (select 1 from ph_claim where path = live) then
    raise exception 'FAIL: a live post''s file was claimed for deletion';
  end if;
  if not exists (select 1 from ph_claim where path = (select full_path from ph where name = 'a2'))
     or (select status from social.media_uploads where id = (select id from ph where name = 'a2')) <> 'expired' then
    raise exception 'FAIL: an upload abandoned for 24 hours was not expired and queued';
  end if;
  if not exists (select 1 from ph_claim where path like '%0000000000aa.jpg') or exists (select 1 from ph_claim where path like '%0000000000ab.jpg') then
    raise exception 'FAIL: orphans: an old unreferenced file must be queued, a recent one not';
  end if;
  if exists (select 1 from ph_claim c where c.bucket <> 'post-photos') or exists (select 1 from ops.media_deletions where bucket <> 'post-photos') then
    raise exception 'FAIL: the queue reached another bucket';
  end if;
  raise notice 'PASS: the drain claims deleted, abandoned and orphaned files, never evidence or a live post''s file, and only in post-photos';
end $$;
-- Outcome: deleted ones are done; a failure is retried later with backoff, at most 8 times.
begin;
set local role service_role;
select public.svc_media_drain_done('scheduled',
  (select array_agg(id) from ph_claim where path not like '%0000000000aa.jpg'),
  (select array_agg(id) from ph_claim where path like '%0000000000aa.jpg'), 'storage said no');
commit;
create temp table ph_claim2 (id bigint, bucket text, path text);
grant all on ph_claim2 to service_role;
begin;
set local role service_role;
insert into ph_claim2 select * from public.svc_media_drain_claim(100);
commit;
do $$
begin
  if exists (select 1 from ph_claim2) then
    raise exception 'FAIL: done files or a just-failed file were claimed again at once';
  end if;
  if (select last_error from ops.media_deletions where path like '%0000000000aa.jpg') <> 'storage said no'
     or (select count(*) from ops.media_drain_runs where source = 'scheduled' and failed = 1) <> 1 then
    raise exception 'FAIL: the failure was not recorded';
  end if;
  update ops.media_deletions set last_attempt_at = now() - interval '1 hour' where path like '%0000000000aa.jpg';
  if not exists (select 1 from public.svc_media_drain_claim(10) c where c.path like '%0000000000aa.jpg') then
    raise exception 'FAIL: a failed deletion was not retried after its backoff';
  end if;
  update ops.media_deletions set attempts = 8, last_attempt_at = now() - interval '1 day' where path like '%0000000000aa.jpg';
  if exists (select 1 from public.svc_media_drain_claim(10) c where c.path like '%0000000000aa.jpg') then
    raise exception 'FAIL: a deletion was retried more than 8 times';
  end if;
  raise notice 'PASS: finished deletions are recorded, failures are retried with backoff (at most 8 times) and every pass is recorded';
end $$;

-- 9. Evidence: held while the report's snapshot is kept, even once resolved;
--    released only when report retention erases the snapshot.
begin;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-00000000c503","role":"authenticated"}', true);
set local role authenticated;
do $$
declare
  rid uuid := (select r.id from public.app_mod_queue('open') r where r.target_id = (select post from ph_ids where name = 'a5'));
  st jsonb;
begin
  if (select full_path from public.app_mod_report_media(rid)) <> (select full_path from ph where name = 'a5') then
    raise exception 'FAIL: the moderator can''t see the reported photo after the author deleted it';
  end if;
  perform public.app_mod_dismiss(rid, 'resolved');
  st := public.app_mod_media_status();
  if (st->>'held')::int < 2 or (st->>'gave_up')::int < 1 or (st->>'photos_enabled')::boolean is not true or st->>'last_scheduled_at' is null then
    raise exception 'FAIL: photo storage status: %', st;
  end if;
  raise notice 'PASS: the moderator sees the reported photo after the author deleted it; the status shows held, failing and the last scheduled pass';
end $$;
commit;
do $$
begin
  if exists (select 1 from public.svc_media_drain_claim(10) c where c.path = (select full_path from ph where name = 'a5')) then
    raise exception 'FAIL: evidence was released as soon as the report was resolved';
  end if;
  update ops.content_reports set resolved_at = now() - interval '91 days' where target_id = (select post from ph_ids where name = 'a5');
  perform ops.purge_expired_report_data();
  if not exists (select 1 from public.svc_media_drain_claim(10) c where c.path = (select full_path from ph where name = 'a5')) then
    raise exception 'FAIL: evidence was not released once report retention erased the snapshot';
  end if;
  raise notice 'PASS: evidence stays held while the report snapshot is kept (open, or resolved under 90 days, or on hold) and is released by report retention, never silently';
end $$;

-- 10. An account deleted: its uploads' files are queued.
select pg_temp.begin_as('00000000-0000-4000-8000-00000000c502', 'b1');
select pg_temp.stored('b1');
delete from auth.users where id = '00000000-0000-4000-8000-00000000c502';
do $$
begin
  if (select count(*) from ops.media_deletions where path in ((select full_path from ph where name = 'b1'), (select feed_path from ph where name = 'b1'))) <> 2 then
    raise exception 'FAIL: a deleted account''s files were not queued';
  end if;
  raise notice 'PASS: deleting an account queues its files';
end $$;

-- 11. Pilot close: hidden media is queued only on request, with the phrase; recorded.
do $$
declare n int;
begin
  perform pg_temp.expect_error_ph('select ops.queue_hidden_media(''founder'', ''yes'')', 'exact phrase', 'queueing hidden media without the phrase');
  n := ops.queue_hidden_media('founder', 'DELETE HIDDEN PILOT PHOTOS');
  if n <> 1 or not exists (select 1 from ops.media_deletions where path = (select full_path from ph where name = 'a1') and reason = 'pilot close: hidden post')
     or not exists (select 1 from ops.media_admin_events where action = 'hidden_media_queued') then
    raise exception 'FAIL: pilot close did not queue the hidden photo and record it (%)', n;
  end if;
  raise notice 'PASS: hidden photos are queued only at pilot close, on request with the exact phrase, and recorded';
end $$;

-- 12. Revoked membership: the author's photos get no links, and a revoked
--     member can't get links or upload. (Review regression.)
select pg_temp.begin_as('00000000-0000-4000-8000-00000000c501', 'a7');
select pg_temp.stored('a7');
insert into ph_ids values ('a7', pg_temp.post_as('00000000-0000-4000-8000-00000000c501', 'a7', 'Live, then the author is revoked', gen_random_uuid()));
create temp table ph_viewer as select '00000000-0000-4000-8000-00000000c504'::uuid as id;
select ops.grant_member_access('00000000-0000-4000-8000-00000000c504', 'tester', 'test');
begin;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-00000000c504","role":"authenticated"}', true);
set local role authenticated;
do $$ begin
  if (select count(*) from public.app_post_photos(array[(select post from ph_ids where name = 'a7')])) <> 1 then
    raise exception 'FAIL: a member gets no link for a visible photo post';
  end if;
end $$;
commit;
select ops.revoke_member_access('00000000-0000-4000-8000-00000000c501', 'test');
begin;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-00000000c504","role":"authenticated"}', true);
set local role authenticated;
do $$ begin
  if (select count(*) from public.app_post_photos(array[(select post from ph_ids where name = 'a7')])) <> 0 then
    raise exception 'FAIL: a revoked author''s photo still gets links';
  end if;
  if (select count(*) from public.app_feed(null, 50) f where f.id = (select post from ph_ids where name = 'a7')) <> 0 then
    raise exception 'FAIL: a revoked author''s photo post is still in the feed';
  end if;
end $$;
commit;
begin;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-00000000c501","role":"authenticated"}', true);
set local role authenticated;
do $$ begin
  perform pg_temp.expect_error_ph(format('select * from public.app_post_photos(%L::uuid[])', array[(select post from ph_ids where name = 'a7')]), 'no_pilot_access', 'a revoked member asking for links');
  perform pg_temp.expect_error_ph('select * from public.app_photo_upload_begin()', 'no_pilot_access', 'a revoked member uploading');
  perform pg_temp.expect_error_ph(format('select public.app_create_post(%L, %L, %L)', '', gen_random_uuid(), gen_random_uuid()), 'no_pilot_access', 'a revoked member publishing');
  raise notice 'PASS: a revoked author''s photos get no links and leave the feed; a revoked member can''t get links, upload or publish';
end $$;
commit;

-- 13. A legal or safety hold keeps evidence past report retention; lifting it releases it.
--     (Review regression.)
select ops.grant_member_access('00000000-0000-4000-8000-00000000c501', 'tester', 'test');
select pg_temp.begin_as('00000000-0000-4000-8000-00000000c501', 'a8');
select pg_temp.stored('a8');
insert into ph_ids values ('a8', pg_temp.post_as('00000000-0000-4000-8000-00000000c501', 'a8', 'Held for legal reasons', gen_random_uuid()));
begin;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-00000000c504","role":"authenticated"}', true);
set local role authenticated;
select public.app_report('post', (select post from ph_ids where name = 'a8'), 'violence', null);
commit;
begin;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-00000000c501","role":"authenticated"}', true);
set local role authenticated;
select public.app_delete_post((select post from ph_ids where name = 'a8'));
commit;
do $$
declare
  rid uuid := (select id from ops.content_reports where target_id = (select post from ph_ids where name = 'a8'));
  full_p text := (select full_path from ph where name = 'a8');
  feed_p text := (select feed_path from ph where name = 'a8');
begin
  if (select count(*) from ops.media_deletions where path in (full_p, feed_p)) <> 2 then
    raise exception 'FAIL: deleting the post did not queue both copies';
  end if;
  perform ops.set_report_hold(rid, true, 'founder', 'legal request');
  update ops.content_reports set status = 'dismissed', resolved_at = now() - interval '200 days' where id = rid;
  perform ops.purge_expired_report_data();
  if exists (select 1 from public.svc_media_drain_claim(100) c where c.path in (full_p, feed_p)) then
    raise exception 'FAIL: held evidence was claimed for deletion past 90 days';
  end if;
  perform ops.set_report_hold(rid, false, 'founder', 'hold lifted');
  perform ops.purge_expired_report_data();
  if (select count(*) from public.svc_media_drain_claim(100) c where c.path in (full_p, feed_p)) <> 2 then
    raise exception 'FAIL: evidence was not released (both copies) once the hold was lifted and retention passed';
  end if;
  raise notice 'PASS: a legal or safety hold keeps both copies past report retention; lifting it releases both';
end $$;

