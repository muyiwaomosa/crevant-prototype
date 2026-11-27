-- TEST ONLY (throwaway databases). The video release decision (20261220000000),
-- as real signed-in accounts calling the same functions the app calls:
-- New video uploads need the storage cap, not device tests (shown with both
-- phones' latest result a failure, recorded inside this rolled-back
-- transaction); every other video safeguard is unchanged.
--
--   F = ...b1e01 founder   M = ...b1e02 member
\set ON_ERROR_STOP on

set role supabase_auth_admin;
insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data)
select ('00000000-0000-4000-8000-0000000b1e0' || n)::uuid, 'vrd-' || n || '@example.test', now(), '{}'
from generate_series(1, 2) n;
reset role;
update public.profiles p set username = 'vrd_' || right(p.id::text, 1), display_name = 'Vrd ' || right(p.id::text, 1)
where p.id::text like '00000000-0000-4000-8000-0000000b1e0_';

create function pg_temp.expect_error(sql text, expected text, what text)
returns void language plpgsql as $$
declare got text;
begin
  begin execute sql; exception when others then got := sqlerrm; end;
  if got is null then raise exception 'FAIL: % succeeded, expected "%"', what, expected; end if;
  if got !~ expected then raise exception 'FAIL: % failed with "%", expected "%"', what, got, expected; end if;
end; $$;
grant execute on function pg_temp.expect_error(text, text, text) to authenticated;
create function pg_temp.as_member(n text) returns void language sql as $$
  select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000b1e0' || n || '","role":"authenticated"}', true) $$;
grant execute on function pg_temp.as_member(text) to authenticated;

begin;
-- A clean starting point inside this transaction: this founder, video off, no cap, no device tests.
update ops.member_launch_settings set founder_user_id = '00000000-0000-4000-8000-0000000b1e01' where id;
select ops.grant_member_access('00000000-0000-4000-8000-0000000b1e01', 'founder', 'vrd-test');
select ops.grant_member_access('00000000-0000-4000-8000-0000000b1e02', 'fan', 'vrd-test');
update ops.media_settings set video_storage_cap_bytes = null where id;
do $$
begin
  -- Video off to start with (earlier tests may have left it on; all of this is rolled back).
  perform pg_temp.as_member('1');
  execute 'set local role authenticated';
  perform public.app_founder_set_switch('video_posts', false, 'release decision test: start off');
  -- The latest result on both phones is a failure, so the old rule (20261213000000) would refuse.
  perform public.app_founder_record_device_test('iphone_safari', false, 'release decision test: failed on purpose');
  perform public.app_founder_record_device_test('android_chrome', false, 'release decision test: failed on purpose');
  execute 'reset role';
end $$;
create temp table vrd_before as select count(*) as n from ops.video_device_tests;
do $$
declare
  st jsonb;
begin
  -- Without the cap, the switch still refuses.
  perform pg_temp.as_member('1');
  execute 'set local role authenticated';
  perform pg_temp.expect_error('select public.app_founder_set_switch(''video_posts'', true, ''release decision'')', 'video_not_ready', 'turning video on without the storage cap');
  -- With the cap, and both phones' latest device test failed, it turns on: device tests no longer gate it.
  perform public.app_founder_set_video_cap(50);
  st := public.app_founder_video_status();
  if not (st->>'ready')::boolean or (st->>'cap_bytes')::bigint <> 53687091200 then
    raise exception 'FAIL: with the cap set the video gate should be ready whatever the device tests say: %', st;
  end if;
  perform public.app_founder_set_switch('video_posts', true, 'Video released as part of the MVP (founder decision)');
  if not (public.app_features()->>'video_posts')::boolean then
    raise exception 'FAIL: video posts did not turn on with the cap set';
  end if;
  execute 'reset role';

  -- A member can now begin a video upload, within the unchanged limits.
  perform pg_temp.as_member('2');
  execute 'set local role authenticated';
  if (select count(*) from public.app_video_upload_begin(5000000, 20000, 'post')) <> 1 then
    raise exception 'FAIL: a member could not begin a video upload once video was on';
  end if;
  perform pg_temp.expect_error('select * from public.app_video_upload_begin(115343361, 1000, ''post'')', 'video_too_large', 'an upload over 110 MB');
  perform pg_temp.expect_error('select * from public.app_video_upload_begin(1000, 300001, ''post'')', 'video_too_long', 'an upload over five minutes');
  perform pg_temp.expect_error('select ops.video_ready()', 'permission denied', 'a member reading the video gate');
  perform pg_temp.expect_error('select public.app_founder_set_switch(''video_posts'', false, ''x'')', 'not_founder', 'a member using the switch');
  execute 'reset role';

  -- The founder can still switch uploads off; playback is a separate switch.
  perform pg_temp.as_member('1');
  execute 'set local role authenticated';
  perform public.app_founder_set_switch('video_posts', false, 'release decision test: off again');
  execute 'reset role';
  perform pg_temp.as_member('2');
  execute 'set local role authenticated';
  perform pg_temp.expect_error('select * from public.app_video_upload_begin(5000000, 20000, ''post'')', 'videos_unavailable', 'an upload while video is off');
  execute 'reset role';

  -- Switching, uploading and the gate created or changed no device test.
  if (select count(*) from ops.video_device_tests) <> (select n from vrd_before) then
    raise exception 'FAIL: device test records changed';
  end if;
  raise notice 'PASS: video release decision: New video uploads need the storage cap, and turn on even when the latest device test failed on both phones; limits, the switch, member access and the device test records are unchanged';
end $$;
rollback;
