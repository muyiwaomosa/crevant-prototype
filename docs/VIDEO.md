# Video posts: review guide

Migration: `supabase/migrations/20261213000000_video_posts.sql` (checksum
recorded; merging approves it, D7). Design and parameters: SP-VID-001
(`docs/video/VIDEO-FEASIBILITY.md`, sections 5 and 8). The founder's device
test: `docs/video/DEVICE-TEST.md`.

**Release decision (founder, Nov 27, 2026; migration 20261220000000):** video
posting is released as part of the MVP, for members once the external pilot
opens. Real-device compatibility testing is **no longer an activation gate**:
New video uploads can be switched on once the 50 GB storage cap is set.
Compatibility, upload and playback problems are found from pilot members'
feedback and fixed then. The device test page and records stay, for
diagnosis; no device test result was recorded or changed by this decision.
Unchanged: the cap and its enforcement, every limit below, the server's file
checks, moderation and reporting, the deletion queue and scheduled cleanup,
the separate upload and playback switches and the emergency stop, and the
error messages.

A post can carry one video of up to five minutes. The browser checks it and,
where needed, converts it to 720p H.264 before upload; the server checks the
stored file again before it can be published. Everything is built on the photo
pipeline (uploads, post media, the deletion queue, the post-media Edge
Function), not beside it.

| Capability | How | Requirement |
|---|---|---|
| Choose a video | Home and Create show **Add video** only while video posts are on. Picker accepts MP4, MOV and other video files (iPhone Photos converts its own HEVC to H.264 on the way) | SP-VID-001 5.1 |
| Check (no upload) | mediabunny reads the header in the browser: over five minutes, over 2 GB, or no picture is refused with a clear message | 5.2, section 8 |
| Convert | Unless the file is already MP4 H.264 within 1280 x 720 (either way round), about 3 Mbps or less and 110 MB or less, the browser converts it (WebCodecs) to 720p30 H.264 at about 2.5 Mbps, AAC sound copied (or converted where the browser can). Progress, Cancel, keep this page open, the screen kept awake where allowed. HEVC the browser can't decode gets "record in Most Compatible / turn off HEVC". A video whose picture can't be kept is never published as sound only; if only the sound can't be kept, the member is told before posting | 5.3 |
| Upload | The Edge Function asks the database (as the member) to authorise the upload: the switch, 5 video posts a day (15 attempts), 1 GB per member, the project cap; the database chooses the path. The function returns Storage's own signed upload token for exactly that path (2 hours). The browser uploads with the resumable (TUS) protocol in 6 MB chunks and resumes after a lost connection. **No member storage policy** | 5.4, section 8 |
| Server check | `post-media/video-verify` reads the stored file's header from Storage in small ranges (box headers, then the moov box, at most 8 MB): ISO MP4 starting with `ftyp`, every video track `avc1`/`avc3`, at most 1280 x 720 either way round, at most 300 s, AAC sound or none, at most 110 MB. The database checks the same numbers again and that the size is exactly what was declared. A refused file is marked failed and queued for deletion | 5.5 |
| Poster | One frame as a JPEG goes through the photo checks (header check, full decode under limits, a fresh 800 px encode) into the same private bucket. Optional: a video without one still plays | 5.5 |
| Play | `post-media/video-links` signs links for posts the member can see (30 minutes; refetched once on failure, carrying on where it stopped). `preload="none"`, no autoplay, standard controls, an accessible name ("Video by ..."), and sideways swipes over the player never change the Home view | 5.6 |
| Separate controls (founder decision) | **New video uploads** (`video_posts`) pauses uploads and publishing only; published videos keep playing. **Video playback** (`video_playback`, on by default) stops new playback links only; posts then show "This video isn't available right now". **Stop all video now** (`app_founder_video_emergency_stop`) turns both off in one recorded step. All three are enforced by the database | Founder decision, 5.7 |
| Storage and bandwidth visibility | The Video posts panel shows storage used against the cap (flagged at 50% and 80%) and, for the last 7 and 30 days, how many playback links were issued and the size of those videos: an upper-bound delivery estimate (`ops.video_delivery_daily`, counts only, never who watched). Exact egress is on the Supabase project's Usage page. Automated bandwidth management is outside the MVP | Founder decision |
| Video ads | Simple video ads (20261209000000) stay on the small public `ad-creatives` bucket, which the founder manages (MP4 up to 8 MB, played inline from a local copy, muted, never autoplaying). They don't need member uploads, conversion or private links, so they don't duplicate this pipeline. When it is useful, the same MP4 header check (`supabase/functions/post-media/video.ts`) can verify an ad file before a campaign activates, with no new system | Founder question |
| Deletion | Deleting a post, deleting an account, a refused file and any upload never published within 24 hours are queued through the existing media deletion queue (`ops.media_deletions`, now also for the private `post-videos` bucket) and removed by the scheduled drain. Reported videos are kept as evidence like photos | 5.7 |
| Device test page | `/app/video-test`, founder and testers only: Choose a video, the Check, Convert and Upload times, Play, a results summary and Copy results. Test uploads are private, can never be published and are deleted after 24 hours | DEVICE-TEST.md |
| The switch gate | Control Center, Video posts: record each device test (iPhone Safari, Android Chrome, computer) with its notes, and the project video storage cap (50 GB proposed). **Turn video posts on** is offered, and accepted by the server, once the cap is set; otherwise it still refuses (`video_not_ready`). Until 20261220000000 it also needed the latest iPhone Safari and Android Chrome results to have passed; device tests are now diagnostic only (release decision above). Storage over 50% and 80% of the cap is flagged | Founder decision, section 8 |
| Moderation | A reported video's link (and poster) for moderators, while the report keeps it | Existing photo rules |

Approved parameters (section 8): 5 minutes; 720p30 H.264 about 2.5 Mbps, AAC,
MP4; 110 MB per published file; 2 GB per source file; 5 videos per member per
day; 1 GB per member; project cap 50 GB, configurable.

## What changes where

* **Database** (`20261213000000`): `social.media_uploads` gains kind `video`
  (paths `<member>/<upload>.mp4` and `<member>/<upload>-poster.jpg`), purpose
  (`post` or `device_test`), duration, codec and declared size;
  `social.posts.media_kind` and `social.post_media.kind` accept `video`;
  `ops.media_deletions` accepts `post-videos` and its two paths; the photo
  triggers, drain and pilot-close queueing now queue each file in the bucket
  of its kind. New: `ops.video_device_tests` (append-only),
  `ops.media_settings.video_storage_cap_bytes`, the private `post-videos`
  bucket (MP4 and JPEG, 110 MB). Member functions `app_video_status`,
  `app_video_upload_begin`, `app_video_upload_paths`, `app_post_videos`, and
  `app_create_post` publishing a video; founder `app_founder_record_device_test`,
  `app_founder_set_video_cap`, `app_founder_video_status`, and
  `app_founder_set_switch` with the gate; service `svc_video_upload_stored`,
  `svc_video_poster_stored`. Photo limits now count photo uploads only.
* **Edge Function** (`supabase/functions/post-media`): `video-begin`,
  `video-verify`, `video-poster`, `video-links`, `video-test-link`, the drain
  for both buckets, and reported videos for moderators. `video.ts` is the header
  reader (no decoding; bad box lengths are refused, never followed). Same
  authentication (Supabase Auth for every member action), same refusal codes.
* **App**: `src/app/videoPrep.ts` (check, convert, upload, verify, poster;
  mediabunny 1.65.2, MPL-2.0, published November 4, 2026, loaded only when a
  video is chosen, so the main bundle doesn't include it), the resumable upload
  `tusUpload` in `src/app/api.ts` (the protocol implemented directly, no new
  upload library), `src/app/video.tsx` (player, composer progress, the device
  test page, the Control Center panel, reported videos).
* **Security headers** (`vercel.json`): Previews (staging) may stream media
  from the staging project (`media-src`). `www.splitpost.ca` and
  `app.splitpost.ca` are unchanged: member Production needs the same
  `media-src` addition when video is approved there.

## Evidence (local)

* Staging-safe check `029_video_posts.sql`; behaviour tests
  `250_video_posts.sql` (off by default; tester-only device tests; the server's
  codec, size, orientation and duration checks; the switch gate; publishing,
  never a device test; 5 a day and 1 GB; the pause; deletion of posts and
  accounts, the 24 hour expiry and the drain). The full database suite passes.
* Rollback `scripts/db/staging-rollback-video-posts.sql` with its test, first
  in the chain (113 checks).
* Unit tests: the header reader on real ffmpeg fixtures (`e2e/fixtures/video`:
  720p H.264 with the index at the start, 1080p with the index at the end,
  HEVC) and hostile synthetic headers; the output size, pass-through rule,
  the resumable upload (chunks, resume after a dropped connection, cancel) and
  the pipeline; the composer, the player, the device test page and the
  Control Center gate.
* Browser journey `e2e/video-journey.e2e.cjs` (last in
  `scripts/e2e/auth-journey.sh`): video refused while off; the founder's device
  test converts a 1080p clip to 720p H.264 in headless Chromium, uploads it
  with TUS, plays it and copies the results; the founder records both phone
  tests and the cap and turns video on; a member posts a 720p MP4; a follower
  plays it from a signed link with no autoplay or preload; a sideways swipe over
  the player leaves Home where it was; a directly uploaded HEVC file is refused
  by the server and queued; the signed token can't upload any other path;
  deleting the post removes both files; pausing stops links and uploads. WCAG
  2.2 AA at 320 and 390 px, no sideways scrolling, no CSP violations.

## Not covered here

* Real iPhones and Android phones: that is the founder's device test, which
  gates the switch. Headless Chromium has no hardware encoder and no AAC
  encoder; Safari's WebCodecs, HEVC decoding on phones, backgrounding and
  battery are only testable there.
* The iPhone fallback (SP-VID-001 section 6: accept iPhone H.264 up to 1080p
  with a larger cap) is not built; it is applied only if the device test
  shows it is needed, and the founder is asked first.
* Hosted Supabase's global upload size limit must be at least 110 MB for the
  staging project (Storage settings) before the device test; local Supabase
  uses 50 MiB (`supabase/config.toml`), enough for the tests.
* Egress alerts at 50% and 80% of the bandwidth allowance are read from the
  Supabase dashboard; the Control Center flags storage against the cap.
