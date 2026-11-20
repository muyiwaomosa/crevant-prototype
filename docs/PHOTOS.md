# Photo posts (Build 5, Stage 5.3)

Status: **in review; not applied, deployed or enabled.** Migration
`20261127000000_post_photos` is staging only (not on
`supabase/production-migrations.txt`). The `post-media` Edge Function is
deployed by hand, to staging only. Photo posting is **off** until the founder
turns it on after the gates below.

## What members get

* **Add photo** on Home and Create (camera or gallery on phones, files on
  desktop), only while photos are on. One photo per post, an optional
  caption, and an optional description for screen readers (up to 250
  characters; otherwise "Photo by name").
* The browser applies the camera's rotation and resizes to at most 1600 px
  on the long edge. Originals over 25 MB, or formats the browser can't open
  (for example HEIC on some Android phones), get a plain message.
* Posts show an 800 px copy in a box with the photo's shape (tall photos at
  4:5), loaded lazily; tapping opens the full photo in an accessible dialog.
  A link that fails is refetched once, then "This photo couldn't load" with
  Try again.
* Text posts are unchanged. Likes, comments, the Clique, catch-up,
  reporting and moderation work on photo posts as on any post.

## How it works and how it is secured

| Step | How |
|---|---|
| Sign-in | Every member action of `post-media` is checked first with Supabase Auth (as the avatar function; the gateway JWT check is off for ES256). |
| Authorisation | The database decides, as the member: active membership, the founder's switch, 30 upload attempts and 10 photo posts a day, the storage cap. It chooses both paths (`<member>/<upload>.jpg` and `-feed.jpg`). |
| Validation | Header check (JPEG, at most 1600 px, 1.5 MB) before decoding; full decode with jpeg-js 0.4.4 under hard limits (2.6 megapixels, 64 MB, strict); two fresh encodes: the full photo (q80, else q70, at most 600 KB) and the feed copy (at most 800 px, at most 200 KB). Only these are stored: no EXIF, GPS, camera data or anything appended. |
| Storage | One private bucket, `post-photos` (JPEG only, 600 KB a file), no storage policy for members or visitors (checks 012 and the audit fail otherwise). Signed links last an hour. |
| Publishing | `app_create_post` with the upload: the member's own, stored within 30 minutes, unused; one post per request id (a retry or double tap posts once, tested with two sessions at once). Membership is re-checked when the photo is stored. |
| Links | Only for live posts by visible members, only to members. Hidden or deleted posts get no new links. |
| Avatars | Untouched: the avatar function, its database functions and its cleanup are unchanged (a test pins the function's files). |

## Deletion, retention and evidence

All deletion is **server controlled**. The database itself puts files in a
durable queue (`ops.media_deletions`), in the same transaction as the event:

| Event | Files |
|---|---|
| The author deletes a photo post | Both copies queued. |
| An account is deleted | All its upload files queued. |
| An upload is never published within 24 hours | Queued. |
| A file in `post-photos` that no record refers to (over 24 hours old) | Queued. |
| A moderator hides a post | **Not** queued: kept so Restore works. |

The queue is worked through only by the server (service key):

* **every 15 minutes by the schedule** (pg_cron and pg_net, set up by
  `scripts/db/staging-schedule-media-drain.sql`), which needs no browser;
* right after a member deletes a photo post (only quicker; the schedule
  guarantees it);
* by a moderator (Photo storage > Run cleanup now).

Each pass is recorded (`ops.media_drain_runs`). A failed deletion is retried
with backoff (5, 10, 20... minutes), at most 8 times, and shown in Photo
storage after 3 failures; a deletion that gave up stays visible until fixed.
A live post's file is never deleted, even if queued by mistake.

**Evidence.** A photo whose report snapshot is kept is never deleted: while
the report is open, and after it is resolved until report retention erases
the snapshot (90 days after resolution, `ops.purge_expired_report_data`),
or indefinitely while a legal or safety hold is set. The moderator sees the
reported photo on the report page during that time. Nothing is released
silently after a fixed time: **escalation** is that Photo storage shows
photos held for reports open more than 30 days, and those reports must be
resolved (or put on hold, with a reason, by server code) by a moderator.
At pilot close, unresolved reports are resolved or held before the closeout.

**Pilot close (founder).** Hidden posts' photos are kept while restoration
is possible. At pilot close, after the evaluation closes and all reports are
resolved or held, the founder queues them, recorded, in the SQL editor:

```sql
select ops.queue_hidden_media('founder', 'DELETE HIDDEN PILOT PHOTOS');
```

Files still referenced by a kept report snapshot stay held. The schedule
deletes the rest within 15 minutes. Record it with the feedback closeout
(`docs/FEEDBACK.md`).

## Limits (provisionally approved, pending staging verification)

| | |
|---|---|
| Browser output | at most 1600 px, JPEG 0.9; originals up to 25 MB |
| Upload | at most 1.5 MB |
| Stored | full at most 600 KB (q80, else q70); feed at most 800 px and 200 KB |
| Per member | 10 photo posts and 30 upload attempts a day (plus 20 posts an hour) |
| Project | a storage cap, set by the founder from verified allowances |

## Performance (measured)

| Where | Real photos (both copies) | Synthetic check photo |
|---|---|---|
| Node, this container | 285 to 445 ms | |
| Deno 2.9 | 237 to 333 ms | 504 to 627 ms |
| Local Supabase Edge runtime (CI) | | 643 to 767 ms |

The synthetic photo used by the hosted check is noisier than real photos,
so it is the harder case. **Hosted staging is unverified** and is a mandatory
gate: the switch can't be turned on until the six most recent hosted checks
(within 7 days) each pass under 1 second.

## Activation gates (all required, enforced by `ops.set_media_settings`)

1. Six passing hosted processing checks (Moderation > Photo storage > Run
   processing check, founder only; nothing is stored).
2. A storage cap, from the verified staging allowances.
3. Egress thresholds (review and pause, in GB), from the verified
   allowances. Egress isn't visible to the database: the founder checks
   Usage > Egress weekly against them.

Then, in the SQL editor (server only, recorded):

```sql
select ops.set_media_settings('founder', true, <cap in bytes>, <review GB>, <pause GB>);
```

Turning photos off again (existing photos still show):

```sql
select ops.set_media_settings('founder', false, <cap in bytes>, <review GB>, <pause GB>);
```

## Monitoring

Moderation > **Photo storage**: the switch; storage used against the cap;
files waiting to be deleted; evidence held; the last scheduled cleanup (a
warning after 2 hours without one while photos are on); failures (3 or more
attempts) and give-ups; the last pass failing; reports open over 30 days;
the egress thresholds; and the last processing checks. Weekly: Supabase
Usage (storage and egress) against the thresholds. The function logs counts
and timings only (no ids, paths or images).

## Staging deployment plan (each step needs the founder's approval)

1. Merge the PR into `main`. Nothing is applied by the merge.
2. **Deploy database to staging, `plan`**: expect exactly
   `20261127000000_post_photos.sql` pending. Stop if anything else is listed.
3. **Same workflow, `apply`** (staging approval): applies it and runs checks
   001 to 012, including "one private post-photos bucket", "photo member
   functions check membership", "the text rule is unchanged" and "deletion
   is queued by the database, keeps evidence and live posts, and photos stay
   off until the founder's gate is met".
4. **Create the drain key** on your computer (at least 32 characters; never
   paste it into chat, commit it or put it in GitHub or Vercel):
   ```bash
   openssl rand -hex 32
   ```
   Store it twice, in the staging dashboard: Edge Functions > Secrets as
   `MEDIA_DRAIN_KEY`, and Project Settings > Vault as `media_drain_key`.
5. **Deploy the function from your computer** (staging only; `_shared` is
   bundled automatically):
   ```bash
   supabase functions deploy post-media --no-verify-jwt --project-ref kpudeppgokpjhvaqrprn
   ```
6. **Schedule the cleanup** with the staging database connection string
   (Database > Connect), first as a check, then for real:
   ```bash
   psql "<staging connection string>" -X -q -v ON_ERROR_STOP=1 -v mode=check -v confirm= -f scripts/db/staging-schedule-media-drain.sql
   ```
   ```bash
   psql "<staging connection string>" -X -q -v ON_ERROR_STOP=1 -v mode=apply -v confirm='SCHEDULE THE STAGING PHOTO CLEANUP' -f scripts/db/staging-schedule-media-drain.sql
   ```
   Within 15 minutes, Photo storage shows a "Last scheduled cleanup".
7. Fast-forward the Preview branch to the merged commit (no force push, no
   Vercel change). Photos are still off, so members see no change.
8. **Hosted CPU gate**: Moderation > Photo storage > Run processing check.
   All six must pass under 1 second. If not, stop: the fallback is 1280 px
   (a reviewed change), not a paid service.
9. **Verify allowances and set the thresholds**: Settings > Billing (plan),
   Usage (storage and egress used and included), Storage settings (global
   upload limit, at least 600 KB). Then turn photos on with the cap and
   thresholds (above).
10. Founder phone test (below).

**Rollback, in order:** turn photos off (step above); unschedule
(`-v mode=remove -v confirm='UNSCHEDULE THE STAGING PHOTO CLEANUP'`);
`supabase functions delete post-media --project-ref kpudeppgokpjhvaqrprn`
(posts show "This photo couldn't load", text is unaffected; stored files stay
in the private bucket; links already issued work up to an hour). The
database rollback (`scripts/db/staging-rollback-post-photos.sql`, phrase
`REMOVE THE STAGING PHOTO POSTS`) restores the post functions exactly but
refuses once any upload, photo post, queued deletion, processing check or
file exists; after that, fix forward.

## Founder phone test

1. Before turning photos on: the six processing checks pass, and "Last
   scheduled cleanup" has a time.
2. On iPhone Safari and Android Chrome: post a camera photo and a gallery
   photo (HEIC on iPhone), one with a caption and one without. Each appears
   correctly rotated on Home within a few seconds.
3. Text-only posting behaves exactly as before, including refusing an empty
   post.
4. A tester sees the feed copy on Home, your profile, the post page and
   catch-up; tapping opens the full photo; it closes with Close, Escape or
   back.
5. Likes, comments and reporting work on photo posts. As moderator you see
   the reported photo, Hide it (gone for everyone, apart from the documented
   up-to-an-hour limit on links already issued) and Restore it.
6. Delete your own photo post and close the app at once: within 15 minutes
   Photo storage shows nothing waiting, and the photo's links stop working.
7. A reported photo whose author deletes it stays visible to you as
   evidence until the report is resolved (and its retention passes).
8. A non-photo file or an oversized original gets a plain message; nothing
   is posted.
9. In airplane mode mid-post you get a clear error; one retry posts once.
10. Turning photos off pauses photo uploads; existing photos still show.
11. A downloaded photo has no location or camera data.
12. Profile pictures work exactly as before.
