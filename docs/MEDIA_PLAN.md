# Photo and video publishing: plan (Builds 5.3 and 5.4)

Status: **planning only. Nothing here is implemented.** Each build has its
own PR, migration, staging deployment and acceptance gate. Neither starts
until its spike results and final plan are reviewed by the founder.

Approved so far: separate workstreams after 5.2c; Supabase Storage for all
media for the 60 day pilot; no Mux, Cloudflare Stream or other paid media
service without approval.

## Shared pieces (built in 5.3, reused by 5.4)

* A private bucket per kind, no storage policy for members or visitors;
  paths chosen by the database; signed links (one hour).
* The 5.2b sign-in check and Storage helpers moved to
  `supabase/functions/_shared`, guarded by the avatar function's tests.
* One link cache for avatars and post media that refetches a link when it
  fails to load (fixes the 5.2b cache weakness).
* Post media records (`social.post_media`), post functions that return the
  media kind and size, own-post deletion with file cleanup, moderator hide,
  reported-media evidence kept while a report is open (capped, like
  reports, at 90 days), and the moderator storage cleanup extended to the
  new buckets.

## Build 5.3: photos (provisionally approved)

* Up to 1600 px on the long edge, decoded and re-encoded on the server
  (no metadata survives), subject to the performance spike.
* **Spike first:** re-encode representative 1600 px photos in the hosted
  Edge runtime on staging and measure CPU time and memory against the
  function limits. If it is too slow, propose 1280 px rather than a paid
  service.

## Build 5.4: video on Supabase Storage (plan, not approved for build)

### 1. Storage and playback

* One private bucket, `post-videos`, with a bucket size limit and allowed
  types (`video/mp4`, `video/quicktime`), no storage policy for members or
  visitors.
* Playback through signed links (one hour) served by Storage, which
  supports range requests, so players can seek without downloading the
  whole file.
* Supabase Storage stores and serves the bytes as uploaded. **It does not
  transcode, and it does not make HEVC play where the browser can't.**

### 2. Direct, authorised uploads (no large files through Edge Functions)

1. The app asks the `post-media` function for an upload. The function
   checks sign-in (as 5.2b), then asks the database as the member:
   membership, limits and quotas (below). The database chooses the path and
   records a pending upload (valid for a short window).
2. The function returns a **signed upload URL** for exactly that path; the
   browser uploads the file straight to Storage. The bucket's size and type
   limits apply.
3. The app asks the function to finish. The function reads only the file's
   header with range requests, checks container, codec, duration and
   dimensions and that location metadata is gone, then the database
   publishes the post with its video. Anything that fails is deleted at
   once; an upload that is never finished is cleaned up as an orphan.
4. A poster image (a frame chosen in the browser) goes through the 5.3
   photo pipeline.

Resumable uploads for weak mobile connections are evaluated in the spike.

### 3. Limits to confirm before deployment (from the Supabase dashboard)

I can't read these from the repository or this environment; the founder
checks them on staging (`kpudeppgokpjhvaqrprn`) and we record them here
before 5.4 is deployed:

| What | Where | Why it matters |
|---|---|---|
| Plan | Settings > Billing | Sets the storage and egress included, and overage behaviour |
| Global file upload limit | Storage > Settings | The per-file cap can't exceed it (the provisional 50 MB must fit) |
| Storage used and included | Usage | Headroom for the pilot |
| Egress (bandwidth) used and included | Usage | Video playback is the main cost driver |

Provisional limits (approved as provisional): 60 seconds, 50 MB, 1080p.

### 4. Safeguards against excessive uploads and abuse

* Only active pilot members; every step authorised by the database.
* Per member: at most 3 videos a day and a total quota (proposed 500 MB of
  live videos); per project: a total cap below the plan's included storage
  (proposed 70%), checked when an upload is authorised.
* Each upload slot is for one path, one file and a short window; a slot
  can't be reused or pointed elsewhere.
* Bucket limits (size and type) enforced by Storage itself; the header is
  checked again on the server.
* Rejected or unfinished uploads deleted; orphans recorded and removed by
  the moderator cleanup.
* A founder-controlled switch in the database that pauses new video
  uploads without a deploy (playback continues).
* Moderators can hide a video post as any other; deleting your own post
  deletes its files.
* No autoplay, `preload="none"`, poster images: nothing downloads until
  someone taps play.

### 5. Monitoring storage and bandwidth during the pilot

* A founder-only **Media usage** panel next to Moderation: storage used per
  bucket against the cap, number of videos, uploads per day, pending and
  orphaned files, and the largest uploaders (names only). Computed from the
  database and `storage.objects`; no new service.
* Bandwidth isn't visible from the database: the founder checks Egress on
  the Supabase Usage page weekly (a short runbook), with agreed thresholds
  (for example review at 50% of the included amount, pause uploads at 80%).
* The function counts signed playback links issued per day (counts only, no
  ids) as an early signal between dashboard checks.

### 6. Real-device compatibility and privacy investigation (before any build)

On a current and a previous iPhone (Safari), two Android phones (Chrome),
and desktop Chrome, Safari, Firefox and Edge:

* what the file picker actually hands over (HEVC or H.264, MOV or MP4,
  size), with the camera's default and "Most Compatible" settings;
* which of those play from a Supabase signed link, including seeking;
* which carry location or other identifying metadata, and whether blanking
  it in the browser (without re-encoding) works on real files;
* upload times on mobile data.

Deliverable: a short findings note with a recommendation. No implementation
until it is reviewed.

### 7. HEVC and transcoding (decision still open)

Hosting on Supabase does not solve HEVC. The options to decide after the
investigation:

1. Accept H.264 only, and guide iPhone users (for example the Camera
   "Most Compatible" setting) when an HEVC file is chosen.
2. Convert in the browser (WebCodecs) where supported, if the spike shows
   it is reliable and fast enough on phones.
3. A paid transcoding service: **not without the founder's approval.**

Accepting HEVC as is, so some members can't play it, is not recommended.

### 8. Accessibility

Captions and subtitles are reassessed with the investigation: options range
from allowing an optional caption file (WebVTT) with a video, to requiring a
text description, to documenting the gap for the pilot. Decision for the
founder with the 5.4 final plan.
