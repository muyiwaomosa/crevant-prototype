-- TEST ONLY (throwaway databases). Video posts (20261213000000), as real
-- signed-in accounts, the service role and server code, calling the same
-- functions the app and the post-media Edge Function call.
--
--   F = ...a5e01 founder   T = ...a5e02 tester   A = ...a5e03 posts videos
--   B = ...a5e04 follows A   D = ...a5e05 posts a video, then is deleted
\set ON_ERROR_STOP on

set role supabase_auth_admin;
insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data)
select ('00000000-0000-4000-8000-0000000a5e0' || n)::uuid, 'vid-' || n || '@example.test', now(), '{}'
from generate_series(1, 5) n;
reset role;
update public.profiles p set username = 'vid_' || right(p.id::text, 1), display_name = 'Vid ' || right(p.id::text, 1)
where p.id::text like '00000000-0000-4000-8000-0000000a5e0_';
update ops.member_launch_settings set founder_user_id = '00000000-0000-4000-8000-0000000a5e01' where id;
select ops.grant_member_access('00000000-0000-4000-8000-0000000a5e01', 'founder', 'vid-test');
select ops.grant_member_access('00000000-0000-4000-8000-0000000a5e02', 'tester', 'vid-test');
select ops.grant_member_access(('00000000-0000-4000-8000-0000000a5e0' || n)::uuid, 'fan', 'vid-test') from generate_series(3, 5) n;
insert into social.follows (follower_id, creator_id) values ('00000000-0000-4000-8000-0000000a5e04', '00000000-0000-4000-8000-0000000a5e03');

create function pg_temp.expect_error(sql text, expected text, what text)
returns void language plpgsql as $$
declare got text;
begin
  begin execute sql; exception when others then got := sqlerrm; end;
  if got is null then raise exception 'FAIL: % succeeded, expected "%"', what, expected; end if;
  if got !~ expected then raise exception 'FAIL: % failed with "%", expected "%"', what, got, expected; end if;
end; $$;
grant execute on function pg_temp.expect_error(text, text, text) to authenticated, anon, service_role;
create function pg_temp.g(n text) returns uuid language sql immutable as $$ select ('00000000-0000-4000-8000-0000000a5e0' || n)::uuid $$;
grant execute on function pg_temp.g(text) to authenticated, anon, service_role;
create function pg_temp.as_member(n text) returns void language sql as $$
  select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000a5e0' || n || '","role":"authenticated"}', true) $$;
grant execute on function pg_temp.as_member(text) to authenticated, anon, service_role;
-- Uploads begun by the tests, by name.
create temp table vu (name text primary key, id uuid, video_path text, poster_path text);
grant all on vu to authenticated, service_role;
create function pg_temp.begin_as(p_member text, p_name text, p_purpose text, p_bytes integer default 5000000) returns void language plpgsql as $$
begin
  perform pg_temp.as_member(p_member);
  execute 'set local role authenticated';
  insert into vu select p_name, b.upload_id, b.video_path, b.poster_path from public.app_video_upload_begin(p_bytes, 20000, p_purpose) b;
  execute 'reset role';
end; $$;
create function pg_temp.stored(p_name text, p_bytes integer default 5000000) returns void language plpgsql as $$
begin
  execute 'set local role service_role';
  perform public.svc_video_upload_stored((select id from vu where name = p_name), p_bytes, 1280, 720, 20000, 'avc1');
  perform public.svc_video_poster_stored((select id from vu where name = p_name), 60000);
  execute 'reset role';
end; $$;
create function pg_temp.post_as(p_member text, p_name text, p_body text) returns uuid language plpgsql as $$
declare v uuid;
begin
  perform pg_temp.as_member(p_member);
  execute 'set local role authenticated';
  v := public.app_create_post(p_body, gen_random_uuid(), (select id from vu where name = p_name), null);
  execute 'reset role';
  return v;
end; $$;

-- 1. Off by default: members can neither upload nor publish; only the founder and testers make private test uploads.
begin;
do $$
begin
  perform pg_temp.as_member('3');
  execute 'set local role authenticated';
  if (public.app_video_status()->>'enabled')::boolean or (public.app_video_status()->>'can_test')::boolean then
    raise exception 'FAIL: a member sees video posts on, or may test: %', public.app_video_status();
  end if;
  if (public.app_video_status()->>'max_seconds')::int <> 300 or (public.app_video_status()->>'max_bytes')::int <> 115343360
     or (public.app_video_status()->>'daily_limit')::int <> 5 or (public.app_video_status()->>'member_cap_bytes')::bigint <> 1073741824 then
    raise exception 'FAIL: the approved video limits are wrong: %', public.app_video_status();
  end if;
  perform pg_temp.expect_error('select * from public.app_video_upload_begin(1000, 1000, ''post'')', 'videos_unavailable', 'a video upload while video posts are off');
  perform pg_temp.expect_error('select * from public.app_video_upload_begin(1000, 1000, ''device_test'')', 'not_tester', 'a device test by a member who is not a tester');
  perform pg_temp.expect_error('select * from public.app_video_upload_begin(1000, 1000, ''anything'')', 'invalid_request', 'an unknown purpose');
  perform pg_temp.expect_error('select public.app_founder_record_device_test(''iphone_safari'', true, null)', 'not_founder', 'a member recording a device test');
  perform pg_temp.expect_error('select public.app_founder_set_video_cap(50)', 'not_founder', 'a member setting the video cap');
  perform pg_temp.expect_error('select public.app_founder_video_status()', 'not_founder', 'a member reading the video status');
  perform pg_temp.expect_error('select public.svc_video_upload_stored(gen_random_uuid(), 1, 1, 1, 1, ''avc1'')', 'permission denied', 'a member marking a video stored');
  perform pg_temp.expect_error('select public.svc_video_poster_stored(gen_random_uuid(), 1)', 'permission denied', 'a member marking a poster stored');
  perform pg_temp.expect_error('select ops.video_ready()', 'permission denied', 'a member reading the video gate');
  perform pg_temp.expect_error('select * from ops.video_device_tests', 'permission denied', 'a member reading device tests');
  execute 'reset role';
  raise notice 'PASS: with video posts off, members can neither upload nor test, the founder and service steps are closed to them, and the approved limits are reported';
end $$;
commit;

-- 2. The tester's private device test: allowed while off, checked by the server, never published, gone after 24 hours.
begin;
do $$
declare
  v_paths record;
begin
  perform pg_temp.begin_as('2', 'test1', 'device_test');
  perform pg_temp.as_member('2');
  execute 'set local role authenticated';
  if not (public.app_video_status()->>'can_test')::boolean then
    raise exception 'FAIL: the tester may not test';
  end if;
  perform pg_temp.expect_error('select * from public.app_video_upload_begin(115343361, 1000, ''device_test'')', 'video_too_large', 'a test upload over 110 MB');
  perform pg_temp.expect_error('select * from public.app_video_upload_begin(1000, 300001, ''device_test'')', 'video_too_long', 'a test upload over five minutes');
  select * into v_paths from public.app_video_upload_paths((select id from vu where name = 'test1'));
  if v_paths.video_path <> (pg_temp.g('2')::text || '/' || (select id from vu where name = 'test1')::text || '.mp4')
     or v_paths.poster_path not like '%-poster.jpg' or v_paths.status <> 'pending' or v_paths.purpose <> 'device_test' or v_paths.declared_bytes <> 5000000 then
    raise exception 'FAIL: the test upload paths are wrong: %', v_paths;
  end if;
  execute 'reset role';
  -- Someone else never sees it.
  perform pg_temp.as_member('3');
  execute 'set local role authenticated';
  if exists (select 1 from public.app_video_upload_paths((select id from vu where name = 'test1'))) then
    raise exception 'FAIL: another member sees the tester''s upload';
  end if;
  execute 'reset role';
  -- The server's checks: H.264 only, within 1280 x 720 either way round, five minutes, the size declared.
  execute 'set local role service_role';
  perform pg_temp.expect_error(format('select public.svc_video_upload_stored(%L, 5000000, 1280, 720, 20000, ''hvc1'')', (select id from vu where name = 'test1')), 'video_codec', 'an HEVC video');
  perform pg_temp.expect_error(format('select public.svc_video_upload_stored(%L, 5000000, 1920, 1080, 20000, ''avc1'')', (select id from vu where name = 'test1')), 'video_dimensions', 'a 1080p video');
  perform pg_temp.expect_error(format('select public.svc_video_upload_stored(%L, 5000000, 1280, 1280, 20000, ''avc1'')', (select id from vu where name = 'test1')), 'video_dimensions', 'a square video over 720');
  perform pg_temp.expect_error(format('select public.svc_video_upload_stored(%L, 5000000, 1280, 720, 300001, ''avc1'')', (select id from vu where name = 'test1')), 'video_too_long', 'a video over five minutes');
  perform pg_temp.expect_error(format('select public.svc_video_upload_stored(%L, 5000001, 1280, 720, 20000, ''avc1'')', (select id from vu where name = 'test1')), 'video_size', 'a video bigger than declared');
  perform public.svc_video_upload_stored((select id from vu where name = 'test1'), 5000000, 720, 1280, 20000, 'avc1');
  perform public.svc_video_poster_stored((select id from vu where name = 'test1'), 50000);
  execute 'reset role';
  perform pg_temp.as_member('2');
  execute 'set local role authenticated';
  if (select status from public.app_video_upload_paths((select id from vu where name = 'test1'))) <> 'stored'
     or not (select has_poster from public.app_video_upload_paths((select id from vu where name = 'test1'))) then
    raise exception 'FAIL: the portrait test video was not stored with its poster';
  end if;
  execute 'reset role';
  raise notice 'PASS: a tester''s device test is allowed while video is off, private to them, and checked by the server (H.264, 720p either way round, five minutes, the declared size)';
end $$;
commit;

-- A device test is never published, even once video posts are on (checked in 4).

-- 3. The founder's gate: both phone tests passed and a cap, or video stays off.
begin;
do $$
declare
  st jsonb;
begin
  perform pg_temp.as_member('1');
  execute 'set local role authenticated';
  perform pg_temp.expect_error('select public.app_founder_set_switch(''video_posts'', true, ''device tests done'')', 'video_not_ready', 'turning video on with no device tests');
  perform pg_temp.expect_error('select public.app_founder_record_device_test(''smart_fridge'', true, null)', 'invalid_request', 'an unknown device');
  perform pg_temp.expect_error('select public.app_founder_record_device_test(''iphone_safari'', null, null)', 'invalid_request', 'a result that is neither pass nor fail');
  perform public.app_founder_record_device_test('iphone_safari', true, 'iPhone 15, iOS 26: 1 and 5 minute clips converted and played');
  perform pg_temp.expect_error('select public.app_founder_set_switch(''video_posts'', true, ''device tests done'')', 'video_not_ready', 'turning video on with only the iPhone test');
  perform public.app_founder_record_device_test('android_chrome', false, 'Pixel: HEVC clip gave no clear message');
  perform pg_temp.expect_error('select public.app_founder_set_switch(''video_posts'', true, ''device tests done'')', 'video_not_ready', 'turning video on after a failed Android test');
  perform public.app_founder_record_device_test('android_chrome', true, 'Pixel and Samsung: all passed after the fix');
  perform pg_temp.expect_error('select public.app_founder_set_switch(''video_posts'', true, ''device tests done'')', 'video_not_ready', 'turning video on without a storage cap');
  perform pg_temp.expect_error('select public.app_founder_set_video_cap(0)', 'invalid_request', 'a zero cap');
  perform public.app_founder_set_video_cap(50);
  st := public.app_founder_video_status();
  if not (st->>'ready')::boolean or (st->>'enabled')::boolean or (st->>'cap_bytes')::bigint <> 53687091200
     or not (st->'latest'->'android_chrome'->>'passed')::boolean or jsonb_array_length(st->'recent') <> 3 or (st->>'test_uploads_24h')::int <> 1 then
    raise exception 'FAIL: the founder''s video status is wrong: %', st;
  end if;
  perform public.app_founder_set_switch('video_posts', true, 'Both phones passed the device test');
  if not (public.app_features()->>'video_posts')::boolean or not (public.app_video_status()->>'enabled')::boolean then
    raise exception 'FAIL: video posts did not turn on';
  end if;
  execute 'reset role';
  if exists (select 1 from ops.video_device_tests) then
    begin
      update ops.video_device_tests set passed = true;
      raise exception 'FAIL: a device test result was changed';
    exception when others then
      if sqlerrm like 'FAIL:%' then raise; end if;
    end;
  end if;
  raise notice 'PASS: video turns on only after the latest iPhone Safari and Android Chrome tests passed and the cap is set; results are append-only';
end $$;
commit;

-- 4. A member posts a video; a follower sees it and gets its paths; limits hold.
begin;
do $$
declare
  v_post uuid;
  m jsonb;
begin
  perform pg_temp.begin_as('3', 'a1', 'post');
  -- Not stored yet: cannot be published.
  perform pg_temp.as_member('3');
  execute 'set local role authenticated';
  perform pg_temp.expect_error(format('select public.app_create_post(''Hi'', gen_random_uuid(), %L, null)', (select id from vu where name = 'a1')), 'upload_not_ready', 'publishing before the video is checked');
  execute 'reset role';
  perform pg_temp.stored('a1');
  v_post := pg_temp.post_as('3', 'a1', '');
  if (select media_kind from social.posts where id = v_post) <> 'video' or (select status from social.media_uploads where id = (select id from vu where name = 'a1')) <> 'published' then
    raise exception 'FAIL: the video post was not stored';
  end if;
  -- A device test can't be published.
  perform pg_temp.as_member('2');
  execute 'set local role authenticated';
  perform pg_temp.expect_error(format('select public.app_create_post(''Look'', gen_random_uuid(), %L, null)', (select id from vu where name = 'test1')), 'upload_not_ready', 'publishing a device test');
  execute 'reset role';
  -- The follower sees the video, and the Edge Function gets its paths.
  perform pg_temp.as_member('4');
  execute 'set local role authenticated';
  select media into m from public.app_post(v_post);
  if m->>'kind' <> 'video' or (m->>'duration_ms')::int <> 20000 or (m->>'width')::int <> 1280 or not (m->>'poster')::boolean then
    raise exception 'FAIL: the post''s video is wrong: %', m;
  end if;
  if (select video_path from public.app_post_videos(array[v_post])) <> (pg_temp.g('3')::text || '/' || (select id from vu where name = 'a1')::text || '.mp4')
     or not (select has_poster from public.app_post_videos(array[v_post])) then
    raise exception 'FAIL: the follower gets no video paths';
  end if;
  if exists (select 1 from public.app_post_photos(array[v_post])) then
    raise exception 'FAIL: a video post is offered as a photo';
  end if;
  execute 'reset role';
  raise notice 'PASS: a checked video is published once stored (never a device test), and a follower gets it with its duration, poster and paths';
end $$;
commit;

-- Five video posts a day; 1 GB of video per member.
begin;
do $$
begin
  perform pg_temp.begin_as('3', 'a6', 'post');
  perform pg_temp.stored('a6');
  for i in 2..5 loop
    perform pg_temp.begin_as('3', 'a' || i, 'post');
    perform pg_temp.stored('a' || i);
    perform pg_temp.post_as('3', 'a' || i, 'Video ' || i);
  end loop;
  perform pg_temp.as_member('3');
  execute 'set local role authenticated';
  perform pg_temp.expect_error(format('select public.app_create_post(''One more'', gen_random_uuid(), %L, null)', (select id from vu where name = 'a6')), 'video_limit', 'a sixth video post in a day');
  perform pg_temp.expect_error('select * from public.app_video_upload_begin(100000000, 1000, ''post'')', 'video_limit', 'a sixth video upload in a day');
  execute 'reset role';
  perform pg_temp.as_member('4');
  execute 'set local role authenticated';
  perform public.app_video_upload_begin(110000000, 1000, 'post');
  perform public.app_video_upload_begin(110000000, 1000, 'post');
  perform public.app_video_upload_begin(110000000, 1000, 'post');
  perform public.app_video_upload_begin(110000000, 1000, 'post');
  perform public.app_video_upload_begin(110000000, 1000, 'post');
  perform public.app_video_upload_begin(110000000, 1000, 'post');
  perform public.app_video_upload_begin(110000000, 1000, 'post');
  perform public.app_video_upload_begin(110000000, 1000, 'post');
  perform public.app_video_upload_begin(110000000, 1000, 'post');
  perform pg_temp.expect_error('select * from public.app_video_upload_begin(110000000, 1000, ''post'')', 'video_quota', 'more than 1 GB of video');
  execute 'reset role';
  raise notice 'PASS: five video posts a day, and 1 GB of video a member, counting uploads on their way';
end $$;
rollback;

-- 5. Separate controls: pausing uploads keeps published videos playing;
--    playback has its own switch; the emergency stop turns both off; the
--    delivery estimate counts issued links.
begin;
do $$
declare
  v_post uuid := (select s.id from social.posts s where s.author_id = pg_temp.g('3') and s.media_kind = 'video' limit 1);
  st jsonb;
begin
  perform pg_temp.begin_as('3', 'p1', 'post');
  perform pg_temp.stored('p1');
  perform pg_temp.as_member('1');
  execute 'set local role authenticated';
  perform public.app_founder_set_switch('video_posts', false, 'Pausing new uploads to check storage');
  execute 'reset role';
  perform pg_temp.as_member('3');
  execute 'set local role authenticated';
  perform pg_temp.expect_error('select * from public.app_video_upload_begin(1000, 1000, ''post'')', 'videos_unavailable', 'a video upload while uploads are paused');
  perform pg_temp.expect_error(format('select public.app_create_post(''Paused'', gen_random_uuid(), %L, null)', (select id from vu where name = 'p1')), 'videos_unavailable', 'publishing a video while uploads are paused');
  perform public.app_create_post('Text still works', gen_random_uuid());
  execute 'reset role';
  perform pg_temp.as_member('4');
  execute 'set local role authenticated';
  if not exists (select 1 from public.app_post_videos(array[v_post])) or (select video_bytes from public.app_post_videos(array[v_post])) is null then
    raise exception 'FAIL: pausing uploads stopped playback of a published video';
  end if;
  if not (public.app_features()->>'video_playback')::boolean or (public.app_features()->>'video_posts')::boolean then
    raise exception 'FAIL: the app is not told uploads are paused and playback is on';
  end if;
  execute 'reset role';
  -- The tester can still test while uploads are paused.
  perform pg_temp.begin_as('2', 'test2', 'device_test');

  -- Playback off on its own.
  perform pg_temp.as_member('1');
  execute 'set local role authenticated';
  perform public.app_founder_set_switch('video_playback', false, 'Checking bandwidth');
  execute 'reset role';
  perform pg_temp.as_member('4');
  execute 'set local role authenticated';
  if exists (select 1 from public.app_post_videos(array[v_post])) then
    raise exception 'FAIL: playback links are issued while playback is switched off';
  end if;
  execute 'reset role';

  -- Both back on, then the emergency stop turns both off with the reason recorded.
  perform pg_temp.as_member('1');
  execute 'set local role authenticated';
  perform public.app_founder_set_switch('video_playback', true, 'Bandwidth fine');
  perform public.app_founder_set_switch('video_posts', true, 'Storage fine');
  perform pg_temp.expect_error('select public.app_founder_video_emergency_stop('''')', 'reason_required', 'an emergency stop without a reason');
  perform public.app_founder_video_emergency_stop('Unexpected egress spike');
  if (public.app_founder_video_status()->>'enabled')::boolean or (public.app_founder_video_status()->>'playback_enabled')::boolean then
    raise exception 'FAIL: the emergency stop left a video control on';
  end if;
  execute 'reset role';
  if (select count(*) from ops.feature_switch_events where reason = 'Emergency stop: Unexpected egress spike' and not enabled) <> 2 then
    raise exception 'FAIL: the emergency stop is not recorded for both controls';
  end if;
  perform pg_temp.as_member('4');
  execute 'set local role authenticated';
  perform pg_temp.expect_error('select public.app_founder_video_emergency_stop(''because'')', 'not_founder', 'a member using the emergency stop');
  execute 'reset role';

  -- The delivery estimate: links and bytes per day, service only.
  execute 'set local role service_role';
  perform public.svc_video_links_issued(3, 3000000);
  perform public.svc_video_links_issued(2, 2000000);
  execute 'reset role';
  perform pg_temp.as_member('1');
  execute 'set local role authenticated';
  st := public.app_founder_video_status();
  if (st->'delivery_7d'->>'links')::int < 5 or (st->'delivery_7d'->>'video_bytes')::bigint < 5000000 then
    raise exception 'FAIL: the delivery estimate is wrong: %', st->'delivery_7d';
  end if;
  perform pg_temp.expect_error('select public.svc_video_links_issued(1, 1)', 'permission denied', 'a member writing delivery counts');
  execute 'reset role';
  raise notice 'PASS: pausing uploads keeps published videos playing; playback has its own switch; the emergency stop turns both off and is recorded; the delivery estimate counts issued links';
end $$;
rollback;

-- 6. Deleting: the author's delete queues both files in the post-videos bucket; an account deletion too; the drain claims them; tests expire.
begin;
do $$
declare
  v_post uuid := (select s.id from social.posts s where s.author_id = pg_temp.g('3') and s.media_kind = 'video' and s.body = '');
  v_up uuid := (select id from vu where name = 'a1');
  v_d uuid;
  v_req bigint;
  n int;
begin
  perform pg_temp.as_member('3');
  execute 'set local role authenticated';
  perform public.app_delete_post(v_post);
  execute 'reset role';
  if (select count(*) from ops.media_deletions q where q.bucket = 'post-videos'
      and q.path in (pg_temp.g('3')::text || '/' || v_up::text || '.mp4', pg_temp.g('3')::text || '/' || v_up::text || '-poster.jpg')) <> 2 then
    raise exception 'FAIL: deleting a video post did not queue both files in post-videos';
  end if;
  -- D posts a video and asks to be deleted; the founder deletes the account.
  perform pg_temp.begin_as('5', 'd1', 'post');
  perform pg_temp.stored('d1');
  perform pg_temp.post_as('5', 'd1', 'Mine');
  insert into ops.member_requests (member_id, kind) values (pg_temp.g('5'), 'deletion') returning id into v_req;
  perform pg_temp.as_member('1');
  execute 'set local role authenticated';
  perform public.app_founder_delete_member(v_req, 'vid_5');
  execute 'reset role';
  v_d := (select id from vu where name = 'd1');
  if (select count(*) from ops.media_deletions q where q.bucket = 'post-videos' and q.path like pg_temp.g('5')::text || '/' || v_d::text || '%') <> 2 then
    raise exception 'FAIL: deleting an account did not queue its video files';
  end if;
  -- The tester's test upload, a day later, expires and is queued.
  update social.media_uploads set created_at = now() - interval '25 hours' where id = (select id from vu where name = 'test1');
  -- Only this test's files, whatever earlier tests left in the queue.
  update ops.media_deletions set deleted_at = now() where bucket <> 'post-videos' and deleted_at is null;
  execute 'set local role service_role';
  select count(*) into n from public.svc_media_drain_claim(100) c where c.bucket = 'post-videos';
  execute 'reset role';
  if (select status from social.media_uploads where id = (select id from vu where name = 'test1')) <> 'expired'
     or not exists (select 1 from ops.media_deletions q where q.bucket = 'post-videos' and q.path like '%' || (select id from vu where name = 'test1')::text || '.mp4') then
    raise exception 'FAIL: the device test did not expire after 24 hours';
  end if;
  if n < 6 then
    raise exception 'FAIL: the drain claimed % video files, expected at least 6', n;
  end if;
  -- The queue refuses anything but the two video paths in post-videos.
  begin
    insert into ops.media_deletions (bucket, path, reason) values ('post-videos', pg_temp.g('3')::text || '/' || v_up::text || '.jpg', 'probe');
    raise exception 'FAIL: the queue took a photo path in the video bucket';
  exception when check_violation then null;
  end;
  raise notice 'PASS: deleting a video post or an account queues both video files in post-videos; unpublished test uploads expire after 24 hours; the drain claims them';
end $$;
rollback;
