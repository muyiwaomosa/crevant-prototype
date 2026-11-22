# Photo posts (Build 5, Stage 5.3)

Status: **founder-only photos approved for member Production** (`photosApproved`
and `postMediaFunctionApproved` are true in `config/member-production.json`).
That approval allows the steps in "Founder-only photos on member Production"
below; it turns nothing on. Photo posting stays **off** in the database until
the founder runs the final switch after every gate there passes, and only the
founder may post photos (`photos_audience = founder`).

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

* **every 15 minutes by the schedule** (pg_cron and the synchronous `http`
  extension, set up by `scripts/db/staging-schedule-media-drain.sql`), which
  needs no browser;
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

## Delays and limits members should know about

| What | How long |
|---|---|
| Deleting a photo post | The post and its links disappear at once (no new links are issued). The files are deleted by the server: usually within seconds (the app asks right after the delete), at most about 15 minutes (the schedule), longer only if Storage fails and the retries run (up to about 10 hours over 8 attempts). |
| Deleting an account | The same: queued at once, deleted by the next pass. |
| Links already on someone's screen | A signed link lasts **one hour**. It stops working as soon as the file is deleted, so for an ordinary deleted post the exposure ends with the deletion. For a **hidden** post, or a reported post kept as **evidence**, the file stays, so a link already issued keeps working for up to an hour. Browsers may also keep a shown photo in their own cache for up to an hour (`max-age=3600`). |
| Reported photos (evidence) | Kept while the report is open, then until report retention erases its snapshot (90 days after resolution), or for as long as a legal or safety hold lasts. Only moderators can see them in that time. |
| Hidden photos | Kept while the post can be restored; deleted at pilot close (below). |

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

## Who may post photos (20261128000000)

The switch has an **audience**, `ops.media_settings.photos_audience`:

* `founder` (the default): only the signed-in member who is active and in
  the founder cohort may post photos. This is the same founder rule as the
  feedback inbox and the processing check. Everyone else is refused exactly
  as if photos were off (`photos_unavailable`) and sees no Add photo.
* `members`: every active pilot member may post photos.

It is enforced in the database, for the caller, at every photo-posting
step: status, upload authorisation (which the post-media function's upload
goes through) and publishing. It fails closed: no signed-in caller, or a
founder-cohort account without active access, gets no photo posting.
Viewing photos, text posting, cleanup and evidence are not affected:
members still see and open the founder's photo posts.

Changing it is server only and recorded in `ops.media_admin_events`
(`audience_changed`). `ops.set_media_settings` never changes it. Opening
photo posting to all members needs the exact phrase (a separate, explicit
approval):

```sql
select ops.set_photo_audience('founder', 'members', 'OPEN PHOTO POSTING TO ALL MEMBERS');
```

Back to founder-only (no phrase needed):

```sql
select ops.set_photo_audience('founder', 'founder');
```

To check it: `select photos_enabled, photos_audience from ops.media_settings;`

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
the egress thresholds; and the last processing checks. The stale-schedule
warning appears whenever photos are on **or** files are waiting, so it also
covers deletions after photos are turned off. Weekly: Supabase Usage
(storage and egress) against the thresholds. The function logs counts and
timings only (no ids, paths or images).

**When the schedule isn't running** (the warning, or "Last scheduled
cleanup" is old), in the SQL editor:

```sql
select jobname, schedule, active from cron.job where jobname = 'post-media-drain';
select status, return_message, start_time, end_time - start_time as took from cron.job_run_details
where jobid = (select jobid from cron.job where jobname = 'post-media-drain') order by start_time desc limit 5;
```

The request is made inside each cron run, so its outcome is the run's own
status. `succeeded` means the drain answered HTTP 200 within 20 seconds.
`failed` carries one of these messages, and never the key or any header:

| Message | Meaning |
|---|---|
| `the drain answered HTTP 401` | The two copies of the drain key differ (Edge Function secret `MEDIA_DRAIN_KEY` and Vault `media_drain_key`). |
| `the drain answered HTTP 503` | The function isn't configured (its secrets). |
| `the drain answered HTTP 502` | The drain couldn't claim or record its pass; see the function's logs. |
| `the drain timed out after 20 seconds` | The function didn't answer in time; the next run tries again. Queued files are not lost. |
| `network error reaching the drain` | The function's address couldn't be reached. |
| `the drain key is missing from Vault` | Vault has no `media_drain_key` (32 characters or more). |
| `server restarted` | The database restarted during the run (pg_cron's own message). |

No job row means the job isn't scheduled (run the workflow **Photo cleanup
schedule on staging** in `apply` mode: from a paused cleanup it installs
exactly one job and verifies its first run). pg_cron never starts a run while the
previous one is still going, and a pass claims each queued file before
deleting it, so a slow run meeting the next one, a member's cleanup or a
moderator's pass never deletes a file twice. Meanwhile, Run cleanup now
works by hand.

**When deletions gave up** (8 failed attempts, shown in Photo storage): fix
the cause (usually Storage), then let them retry, in the SQL editor:

```sql
update ops.media_deletions set attempts = 0, last_attempt_at = null where deleted_at is null and attempts >= 8;
```

Changing the cap or thresholds while photos are on needs six passing
processing checks within the last 7 days (run them again first); turning
photos off never does.

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
5. **Deploy the function from your computer** with the commit-pinned
   deploy script (Phase 1B-2, `docs/FUNCTIONS-DEPLOYMENT.md`; `_shared` is
   bundled automatically), then run the **Verify Edge Functions** workflow.
   On member Production, post-media also needs `postMediaFunctionApproved`
   (a separate approval):
   ```bash
   node scripts/functions/deploy.mjs deploy --target staging --function post-media --commit <full sha> --operator <your label> --confirm "DEPLOY post-media TO kpudeppgokpjhvaqrprn"
   ```
6. **Schedule the cleanup** (pg_cron and the http extension) with the
   GitHub workflows, first **Photo cleanup schedule check on staging**, then
   **Photo cleanup schedule on staging** in `apply` mode (see "The cleanup
   schedule without pg_net" below). Within 15 minutes, Photo storage shows
   a "Last scheduled cleanup".
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

**Rollback of the audience** (`scripts/db/staging-rollback-photo-audience.sql`,
phrase `REMOVE THE STAGING PHOTO AUDIENCE`): it refuses while photos are on,
because the restored switch would let every member post photos, and once
any audience change has been recorded. Turn photos off first. It must run
before the photo posts rollback, which refuses while the audience is
recorded.

## The cleanup schedule without pg_net (Build 5.3 remediation)

The first schedule used pg_net. Installing pg_net grants PUBLIC usage of
schema `net` and every right on its request queue and responses. Those
grants belong to `supabase_admin`, so they can't be revoked from `postgres`,
and while a request waits in `net.http_request_queue` its headers (the
drain key) are readable by every role, including the waitlist roles.
Security check 003 rightly fails on it, and stays unchanged.

The schedule now uses Supabase's `http` extension: the call is made inside
the cron run, nothing is queued, the key is read from Vault only for that
call, and the run fails on anything but HTTP 200 or after 20 seconds
(`http.timeout_msec`, set for each run). The `http` extension creates no
tables, and only `postgres` and the API's server roles can use the
`extensions` schema it lives in (the waitlist roles can't).

`scripts/db/staging-remove-pg-net.sql` removes pg_net once nothing needs it
(check, then apply with the phrase `REMOVE PG_NET FROM STAGING`). It refuses,
changing nothing, unless: exactly one `post-media-drain` job exists, every 15
minutes, on the http extension; that job has a succeeded run; no cron job
mentions `net.`; pg_net's queue is empty; there are no database webhooks;
and nothing else depends on pg_net. `check` performs the drop inside a
transaction and rolls it back, which also proves the permission to drop it.

**The move on staging** (each step needs the founder's approval; nothing
here touches Production, photos or billing):

1. Read only, in the SQL editor: confirm `http` is available and see what
   uses pg_net today.
   ```sql
   select name, default_version, installed_version from pg_available_extensions where name in ('http', 'pg_net', 'pg_cron');
   select jobname, schedule, active from cron.job;
   select count(*) from net.http_request_queue;
   ```
2. **Schedule check** (rolls back; shows `http (synchronous)`), with the
   GitHub workflow **Photo cleanup schedule check on staging** (Actions >
   Run workflow, on `main`, typing `kpudeppgokpjhvaqrprn`). It runs only this
   check, with the staging environment's existing secret, the staging target
   and TLS checks, the script's pinned checksum, and before and after
   fingerprints of the cron jobs and extensions (any difference fails it).
   It can't apply, remove or touch pg_net.
3. **Schedule apply**, with the GitHub workflow **Photo cleanup schedule on
   staging**: mode `apply`, the project reference, and the phrase
   `SCHEDULE THE STAGING PHOTO CLEANUP`. It replaces the pg_net job with the
   http job in one transaction (one job before, one after, a new job id, the
   same 15 minute schedule; pg_net stays installed), then waits for the first
   scheduled run and verifies it end to end. A run counts as **verified** only
   if pg_cron recorded it as succeeded (which, for this job, means the drain
   answered HTTP 200 within 20 seconds) **and** exactly one `scheduled` pass in
   `ops.media_drain_runs`, written by the post-media function itself after its
   key check, finished inside that run. If the replacement committed but the
   run can't be verified, the workflow fails with **INSTALLED BUT
   UNVERIFIED**: the new job stays in place (it is not rolled back), and the
   message says why (for example HTTP 401: the two copies of the drain key
   differ). Anything that can't be attributed reliably (another job calling
   the drain, a pass matching no run, a run with two passes) fails closed.
4. **Verify** (mode `verify`, read only) after at least two more runs (about
   30 minutes). It lists each run with its matching drain pass.
5. **Removal check**, with the workflow **Remove pg_net from staging**, mode
   `check`. Its gate: one http cleanup job, active every 15 minutes; its two
   newest runs both verified; no failed or unmatched run since the
   replacement; every drain pass attributed. Then the removal script's own
   checks, and a drop that is rolled back.
6. **Removal apply**: the same workflow, mode `apply`, with the phrase
   `REMOVE PG_NET FROM STAGING`. The gate is checked again first.
7. **Deploy database to staging, `check`**: runs security checks 001 to 013;
   all must pass, 003 included. (004 to 013 have not run on staging yet: the
   failed APPLY stopped at 003.)
8. **Verify** once more after the next run.

These workflows are the only routine way to run any of this. Running the
scripts any other way skips their verification and gate, and is only for an
emergency (below).

**If something goes wrong (pause only).** The workflow's `remove` mode, with
the phrase `UNSCHEDULE THE STAGING PHOTO CLEANUP`, unschedules only the
cleanup job: it refuses a job of that name that isn't the cleanup, and fails
if any other cron job changed. Photos are off and the queue is durable, so a
pause is harmless: queued files wait, and Moderation > Photo storage > Run
cleanup now (or a member's own cleanup after deleting a post) keeps working,
since manual cleanup doesn't depend on the schedule (tested in CI with no
cleanup job scheduled).

**Recovery.** Resume with `apply`: from a paused cleanup (no job scheduled) it
installs a fresh http job, with a new id and so a fresh run history, and
verifies its first run. This works the same before and after pg_net's
removal; it never reinstalls pg_net and never restores the old pg_net job
(going back to it is deliberately not offered: it would reopen the
exposure). From **INSTALLED BUT UNVERIFIED**: fix the cause (for example the
drain key), then pause and apply again. Running `apply` on the unverified job
changes nothing and still fails, and `verify` stays unverified while any
failed run is in the job's history, so neither can pass it silently. The
removal gate counts only the fresh job's runs, so it needs two new verified
runs. After step 6, if something turns out to need pg_net, `create extension
pg_net with schema extensions` restores it, but brings back the PUBLIC grants
and the check 003 failure, so it needs its own approval.

**Emergency intervention (only with the founder's explicit approval).** Only
if the workflows can't run (for example GitHub Actions is down) and the
cleanup must be stopped now. The approval names the one action. The only
prepared action is a pause, in the staging SQL editor: first look, then
unschedule that one job by its id, and only if it is the cleanup.

```sql
select jobid, jobname, schedule, active, command ~ '/functions/v1/post-media/drain' as is_cleanup from cron.job where jobname = 'post-media-drain';
```

```sql
select cron.unschedule(<jobid from the row above, only if is_cleanup is true>);
```

Nothing else (apply, removal, pg_net) is done by hand: those wait for the
workflows, or for a reviewed plan approved separately. Afterwards, record what
was done and when, and run the workflow's `verify` once it is available.

**Production.** Production has no photo migration, and both scripts refuse to
run there. Nothing in this move changes Production. When photos are approved
for Production, its schedule uses the same http design (with Production's
own address in a reviewed change), so pg_net is never installed there and
check 003 keeps passing. Check 003 is in Production's own list
(`supabase/production-checks.txt`), so any Production deployment would also
catch pg_net appearing there, or the waitlist roles gaining access to the
`extensions` schema.

**Rollback, in order:** turn photos off (step above); unschedule (the
workflow **Photo cleanup schedule on staging**, `remove` mode, phrase
`UNSCHEDULE THE STAGING PHOTO CLEANUP`; this works even after the migration
is gone, and the database rollback refuses while the schedule exists);
`supabase functions delete post-media --project-ref kpudeppgokpjhvaqrprn`
(posts show "This photo couldn't load", text is unaffected; stored files stay
in the private bucket; links already issued work up to an hour). The
database rollback (`scripts/db/staging-rollback-post-photos.sql`, phrase
`REMOVE THE STAGING PHOTO POSTS`) restores the post functions exactly but
refuses once any upload, photo post, queued deletion, processing check or
file exists; after that, fix forward.

## Founder-only photos on member Production

Goal: the founder creates, views and deletes photo posts on
`https://app.splitpost.ca`, and the files are removed by the server. Nobody
else can post photos (`photos_audience` stays `founder`); members still can't
be invited (`invitationsApproved` is false).

Already in place: the photo migrations (`20261127000000`, `20261128000000`)
and the launch gate are applied (checks 012 and 013 run in the member check);
the private `post-photos` bucket; the app (Add photo appears only once the
database says photos are on); the `app.splitpost.ca` security policy (images
and calls to the member project only).

Do these in order. Stop at the first failure and report it; nothing later
depends on guessing.

| # | Step | Who | Pass means |
| --- | --- | --- | --- |
| 1 | **Staging first.** Deploy post-media to staging at the current main commit with the pinned script (`--target staging --function post-media`, phrase `DEPLOY post-media TO kpudeppgokpjhvaqrprn`), then **Verify Edge Functions** (staging, post-media, deployed). Post and delete a photo on a Preview as the founder. | founder (deploy), Claude (verify run and report) | verify run passes; the photo appears, and Photo storage shows nothing waiting within 15 minutes of deleting it |
| 2 | **Plan allowances.** In the member project: Settings > Billing (plan), Usage (storage and egress included and used), Storage settings (global upload limit, at least 600 KB). | founder | the initial limits below fit well inside them |
| 3 | **Drain key.** On your computer: `openssl rand -hex 32`. Paste the same value into the member project twice: Edge Functions > Secrets as `MEDIA_DRAIN_KEY`, and Project Settings > Vault as `media_drain_key`. Never into chat, GitHub, Vercel or a file. | founder | both saved |
| 4 | **Identity evidence.** **Deploy database to member Production**, mode `check`, at the deploy commit. | founder | success (needed by the deploy script, within 24 hours) |
| 5 | **Deploy post-media** to member Production: `node scripts/functions/deploy.mjs deploy --target member-production --function post-media --commit <full sha> --db-check-run <run id> --operator <your label> --confirm "DEPLOY post-media TO brfdqkondnnzsguailcc"` | founder | deployed, served build matches, source exact match |
| 6 | **Verify Edge Functions**: member-production, post-media, deployed, with the commit and version the script printed. Then the same for avatar (unchanged, still serving). | Claude starts and reports | both pass; join-waitlist absent |
| 7 | **Cleanup schedule**: **Photo cleanup schedule on member Production**, mode `check`, then `apply` (phrase `SCHEDULE THE MEMBER PRODUCTION PHOTO CLEANUP`), then `verify` after about 30 minutes. | founder (runs and approves the environment) | check passes and changes nothing; apply says APPLIED AND VERIFIED; verify shows at least 2 verified runs |
| 8 | **Processing checks**: signed in as the founder on app.splitpost.ca, Moderation > Photo storage > Run processing check, six times. | founder | all six pass, each under 1 second |
| 9 | **Switch on (founder only)**, in the member project's SQL editor: `select ops.set_media_settings('founder', true, 1073741824, 5, 10);` then `select photos_enabled, photos_audience from ops.media_settings;` | founder, only after 1 to 8 pass | `t`, `founder` |
| 10 | **End-to-end test** (below) on iPhone Safari and a desktop browser. | founder | every step passes |
| 11 | **Record it**: ledger entry for post-media and the evidence rows, in a reviewed PR (as for avatar). | Claude prepares; founder merges | merged |

**Initial limits** (founder only, provisional until step 2 confirms the
plan's allowances): storage cap **1 GB** (`1073741824` bytes; at most 10 photo
posts a day of at most about 800 KB each is about 8 MB a day), egress review
**5 GB**, egress pause **10 GB**. Egress is not enforced by the database:
compare Usage > Egress weekly against them.

**End-to-end test** (step 10), each on app.splitpost.ca as the founder:

1. Post a photo with a caption, and one without, from the camera and from the
   gallery. Each appears on Home, correctly rotated, within a few seconds.
2. Refresh: both still show. Open one: the full photo opens and closes with
   Close, Escape or back.
3. Text-only posting works exactly as before, and profile pictures still work.
4. Delete one photo post. It disappears at once. Within 15 minutes Photo
   storage shows nothing waiting, and "Last scheduled cleanup" has a recent time.
5. Download a photo: it has no location or camera data.
6. Turn photos off (`select ops.set_media_settings('founder', false, 1073741824, 5, 10);`):
   Add photo disappears; existing photos still show. Turn them on again only
   if you want to keep testing.

**Stop and roll back** (in this order, each by the founder): photos off
(above); pause the cleanup (the workflow's `remove` mode, phrase
`UNSCHEDULE THE MEMBER PRODUCTION PHOTO CLEANUP`) only if the schedule itself
misbehaves; delete the function only if it misbehaves
(`node scripts/functions/deploy.mjs delete --target member-production --function post-media ...`).
Text posts and profile pictures are unaffected by all three.

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
