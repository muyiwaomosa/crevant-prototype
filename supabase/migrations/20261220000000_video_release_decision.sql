-- Video release decision (founder, Nov 27, 2026).
--
-- Video posting is released as part of the MVP. Real-device compatibility
-- testing is no longer an activation gate: compatibility, upload and
-- playback problems are found and fixed from pilot members' feedback.
--
-- What changes: ops.video_ready(), which the founder's switch for New video
-- uploads checks (app_founder_set_switch raises video_not_ready otherwise),
-- now requires only the project video storage cap (50 GB approved for the
-- pilot). It no longer requires the latest iPhone Safari and Android Chrome
-- device tests to have passed.
--
-- What does not change: the cap itself and its enforcement on every upload;
-- the limits (5 minutes, 110 MB a file, 5 video posts and 15 uploads a day,
-- 1 GB a member); the server's file checks (H.264 within 1280 x 720, the
-- declared size and duration); moderation and reporting; the deletion queue
-- and scheduled cleanup; the separate upload and playback switches and the
-- emergency stop; the error messages; and the device test records, which
-- stay append-only and are kept for diagnosis. No device test is recorded or
-- changed by this migration.

create or replace function ops.video_ready()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select s.video_storage_cap_bytes is not null from ops.media_settings s where s.id), false);
$$;
revoke all on function ops.video_ready() from public, anon, authenticated;
comment on function ops.video_ready() is 'Whether New video uploads may be switched on: the project video storage cap is set. Device tests are diagnostic records only (founder release decision, Nov 27, 2026; migration 20261220000000).';

comment on table ops.video_device_tests is 'The founder''s recorded video device tests (docs/video/DEVICE-TEST.md). Append-only, kept for diagnosis. Since 20261220000000 (founder release decision, Nov 27, 2026) they no longer gate switching video posts on; the storage cap does.';
