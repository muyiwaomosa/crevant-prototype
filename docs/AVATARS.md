# Profile pictures (Build 5, Stage 5.2b)

Status: **on staging.** Migration `20261125000000_avatars` is applied to
staging only (not on `supabase/production-migrations.txt`), and the `avatar`
Edge Function is deployed by hand to staging only.

## What members get

* Add, change or remove a profile picture from **Profile**, or optionally in
  setup's **About you** step. Choose from the camera or gallery, drag to
  reposition, zoom (slider, buttons, arrow keys, + and -), then save.
* Pictures everywhere a member appears: feed, posts, comments, profiles,
  Discover, Clique, catch-up and suggestions. Initials while loading, without
  a picture, or if a link fails.

## How it is secured

| Safeguard | How |
|---|---|
| Private storage | One bucket, `avatars`: private, JPEG only, at most 200 KB. No storage policy for members or visitors at all; the audit and staging check 010 fail otherwise. |
| No direct uploads | Members can't write to Storage. Every upload, removal and link goes through the `avatar` Edge Function. |
| Sign-in checked on every request | Staging signs sessions with ES256 keys, so the platform's gateway JWT check is off for this function (`verify_jwt = false`) and the function checks every request itself, before reading the body or touching anything: it asks Supabase Auth (`/auth/v1/user`) whether the token is valid. Auth checks the signature (current ES256 key, or the previous HS256 key), expiry, and that the session still exists, so signed-out and revoked sessions are refused too (the database alone would accept them until they expire). The token must belong to a signed-in user (`authenticated`); the anon or service key used as a token is refused. Missing, malformed, forged, expired and revoked tokens all get 401 and nothing happens (tested for every action, including cleanup). |
| Authorization on every action | Each action then calls the database **as the caller** (their own token, with staging's publishable key, which the app sends): membership, complete profile, 10 changes a day; moderators only for cleanup. The service key is used only afterwards. |
| Nothing from the browser is trusted | No member id or storage path is read from a request. The database chooses the path (`<member>/<random>.jpg`). The image is checked, decoded and re-encoded on the server. |
| Full server-side validation | Header check (exactly 512 x 512 JPEG) before decoding; full decode with jpeg-js 0.4.4 under hard limits (1 megapixel, 64 MB, strict); fresh encode (quality 85, or 70 if needed) of at most 200 KB. Only the new file is stored: no metadata, nothing appended, type set by the server. |
| Revocation | Committing re-checks membership at that moment. Revoked members can't upload, remove or get links; their picture isn't handed out to anyone; a moderator's Hide on a profile hides its picture too. |
| Concurrency | One picture change at a time per member (a database lock). Overlapping uploads end with the newest picture and every replaced file deleted (tested with three at once). |
| Production can't be targeted | The function refuses to run unless its project is `kpudeppgokpjhvaqrprn` (or local Supabase), so a deploy anywhere else serves nothing (tested). |
| No privileged credentials exposed | The function reads only `SUPABASE_URL`, `SUPABASE_ANON_KEY` and `SUPABASE_SERVICE_ROLE_KEY`, which Supabase provides to every hosted function. The service key stays inside the function, used only for Storage and the two service-only database steps. Nothing is stored in the repository, GitHub, Vercel or the browser. |
| Legacy keys | These two environment keys are staging's **legacy** anon and service_role keys (enabled today). The anon key is only a fallback if a request has no publishable key. If the legacy keys are ever disabled, the function stops working safely (it refuses, everyone sees initials) and must be updated to the new secret key first. Changing the JWT signing keys needs no change here. |
| Browsers | Only the member app's Previews may call it from a browser (and local development locally). Sign-in and the database checks are the real boundary. |

### jpeg-js security review

* Version 0.4.4 (2022-06-07), BSD-3-Clause, no dependencies.
* Advisories: GHSA-xvf7-4v9q-58w6 (infinite loop, affects versions below
  0.4.4) and the 2020 resource-consumption issue (fixed in 0.4.0 by the
  limit options). Neither affects 0.4.4; `npm audit` reports none.
* Limits enforced and tested: a header claiming 30,000 x 30,000 is refused
  before decoding; the decoder's own resolution limit refused it too in the
  Edge runtime experiment.
* Vendored byte for byte (`supabase/functions/avatar/vendor/jpeg-js-0.4.4`)
  with one export line per file; a test pins the upstream SHA-256. Nothing is
  downloaded at deploy or run time.
* Maintenance is quiet (no release since 2022). Any future update goes
  through the same review, hash update and tests.

## Signed links and the CDN (limitations)

* Links last **one hour** and **can't be revoked early**. After a revocation
  or a moderator's Hide, no new link is issued and the app shows initials,
  but a link already issued keeps working until it expires (tested and shown
  as a documented limitation).
* Deleting a file (removal, replacement, cleanup) made its links stop
  working immediately on local Supabase. On hosted staging a CDN may keep
  serving a cached copy for a while; **this is unverified**. Unique paths
  (never reused) and one-hour links limit the impact.
* Browsers may keep a picture in their own cache for up to an hour
  (`max-age=3600`).

## Partial failures and recovery

| Failure | What happens | Recovery |
|---|---|---|
| The image is rejected | Nothing is stored; the database's authorisation expires after 15 minutes. | None needed. |
| Upload to Storage fails | The path is recorded as an orphan; the member sees "We couldn't save your picture right now". | Cleanup removes any partial file. |
| Commit refused (revoked meanwhile, or older than 15 minutes) | The new file is deleted at once; if that fails, it's recorded as an orphan. | Cleanup. |
| Deleting the replaced or removed file fails | The picture change still succeeds; the old file is recorded as an orphan. | Cleanup. |
| An account is deleted | Its picture record goes with it; the file is left. | Cleanup (it isn't anyone's current picture). |
| The function is down or not deployed | Everyone sees initials; saving says it isn't available. | Redeploy. |

Orphans are bounded: at most one per failed attempt, and attempts are capped
at 10 a day per member.

### Storage cleanup (moderators only, monthly)

Profile > Moderation > Picture storage:

1. **Check for unused files** (a dry run): files in the avatars bucket that
   are older than 24 hours, not anyone's current picture, and not an upload
   that's under an hour old. Recorded in the moderation audit trail.
2. Type the exact phrase shown (for example `DELETE 3 FILES`) within 15
   minutes, then **Delete**. The database rechecks every file at that moment
   and keeps any that came back into use; only the moderator who ran the dry
   run can confirm it, once.
3. The result counts only files really gone from Storage, and is recorded.

## Deployment checklist (each step needs the founder's approval)

1. Merge the PR into `main`. Nothing is applied by the merge.
2. **Deploy database to staging, `plan`**: expect exactly
   `20261125000000_avatars.sql` pending. Stop if anything else is listed.
3. **Same workflow, `apply`** (staging approval): applies it and runs checks
   001 to 010, including "one private avatars bucket (JPEG only, 200 KB) and
   no storage policy for members or visitors".
4. **Deploy the function from your own computer** (staging only):
   ```bash
   supabase login
   ```
   ```bash
   supabase functions deploy avatar --no-verify-jwt --project-ref kpudeppgokpjhvaqrprn
   ```
   `--no-verify-jwt` is required (it matches `supabase/config.toml`): the
   gateway's check doesn't handle staging's ES256 keys, and the function
   verifies every caller with Supabase Auth itself. No secret is created. In the dashboard (Edge
   Functions > Secrets), confirm `SUPABASE_URL`, `SUPABASE_ANON_KEY` and
   `SUPABASE_SERVICE_ROLE_KEY` are listed (Supabase provides them).
5. Fast-forward the Preview branch to the merged commit (no force push, no
   Vercel change). The Preview's new security header allows images from the
   staging project.
6. Founder phone test (below).

### Rollback

Remove the function (or redeploy a previous version):

```bash
supabase functions delete avatar --project-ref kpudeppgokpjhvaqrprn
```

What that does, and doesn't, do:

* **The app falls back to initials.** No new picture links are issued, so
  pages show initials as soon as they load (a page already open keeps its
  pictures until it's reloaded). Saving or removing a
  picture says it isn't available. Everything else keeps working (tested).
* **Stored pictures are not deleted.** Deleting the function leaves every
  file in the private `avatars` bucket. A file goes only when its member
  removes their picture or the moderator cleanup runs, and both need the
  function. Nobody can read the files without a signed link.
* **Links already issued keep working for up to an hour.** Signed links are
  served by Storage, not the function, so a link issued just before the
  rollback still shows that picture until it expires (at most one hour),
  unless the file itself is deleted.
* **The database rollback** (`scripts/db/staging-rollback-avatars.sql`)
  refuses while any picture record or stored file exists, so it can only be
  used before anyone has saved a picture. After that, fix forward.

## Founder phone test

On an iPhone (Safari) and an Android phone (Chrome):

1. Profile > **Add a photo** > take a photo with the **camera**. Drag, zoom,
   save. "Profile picture saved." and your picture appears.
2. **Change picture** > choose from the **gallery** (on iPhone, a normal
   HEIC photo). Save. The new picture replaces the old one.
3. From a tester's account: your picture shows on your posts in their feed,
   on your profile, in Discover and in their Clique page.
4. **Remove picture** > Remove: your initials return, for the tester too
   (after a reload).
5. A new tester going through setup sees "Profile picture (optional)" in
   About you, and can skip it.
6. Moderation > Picture storage > **Check for unused files**: usually
   "Nothing to clean up".
7. Sign out and back in, then save a picture: it works. (A signed-out
   session can't be used to change pictures.)
8. Try saving 11 pictures in a day: the 11th says "You can change your
   picture 10 times a day. Please try again tomorrow." 
