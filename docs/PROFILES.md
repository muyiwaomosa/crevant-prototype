# Profiles, interests and discovery (Build 5, Stage 5.1)

Status: **draft PR, local only.** Migration `20261123000000_profile_details`
is staging only (not on `supabase/production-migrations.txt`) and has not been
applied anywhere. Nothing is deployed.

## What a member gets

1. **First-time setup with progress** (Step N of 5):
   1. Your name (username and display name, as before; required).
   2. How you use Splitpost: Creator, Fan or Both (optional).
   3. Your interests: up to 5 topics (optional).
   4. About you: a short bio (160) and "Why should people follow you?" (140) (optional).
   5. People to follow: suggestions ranked by shared interests, with the existing Follow button.

   Every step after the name can be skipped ("Skip for now", or "Skip the rest").
   Setup is shown once: saving (or skipping) records `onboarded_at`.
   Existing members, including the founder, see steps 2 to 5 once on their next
   visit after the migration, and can skip them in one tap.
2. **Profile pages** show the identity label, bio, a "Why follow" box and interests.
3. **Discover** ranks people who share your interests first, shows bio, why to
   follow, identity and interests on each card, and adds "Browse by interest"
   (a native select, so nothing is clipped on a phone).
4. **Empty Home** suggests people who share your interests.
5. **Profile** has an "About you" editor for all of the above.

## Identity preference is not authorization

* Stored in `social.profile_details.identity`, separate from `ops.member_access.cohort`.
* No access check reads it: `social.current_access`, `social.current_member`,
  `ops.member_access_active`, `social.is_member` and `social.visible_members`
  are unchanged, and `supabase/tests/008_profile_details.sql` fails if any of
  them (or any ops function, or a trigger on the details) starts reading it.
* Suggestions use it only to **order** people, never to include or exclude anyone.
* Tested: a member who picks "Fan" posts, follows and builds a Clique; a
  revoked "Creator" is refused everything; changing identity never changes
  membership or its history (`supabase/tests-local/075_profile_details.sql`).
* The UI says so: "This only describes you. Everyone can post, follow and build
  a Clique, whatever you choose."

## Proposed topic taxonomy (needs product approval)

The list lives in the database (`social.topics`), and the app reads it through
`app_topics()`; nothing is hard-coded in the app. The rows in the migration
are a **proposal**. Change them before the migration is approved, or later
with a small data migration (retire a topic with `active = false`; never delete
one members have chosen).

| Slug | Label | Note |
|---|---|---|
| food | Food & cooking | from the pilot creator categories |
| money | Money & business | widened from "money" |
| tech | Tech | |
| learning | Learning | new: teachers, explainers |
| music | Music | |
| film | Film & TV | new |
| gaming | Gaming | new |
| art | Art & design | |
| style | Fashion & beauty | new |
| books | Books & writing | |
| fitness | Fitness & sport | |
| wellness | Health & wellness | |
| travel | Travel | |
| family | Family & parenting | new |

Questions for approval: keep 14 or trim to about 10; add Faith, Comedy or
Sports as their own topics; whether the waitlist and pilot creator categories
should later move to this list.

## Database

* `social.topics`, `social.profile_details`, `social.member_topics`: row level
  security on, no privileges for members or visitors, no policies.
* Six member functions, all `security definer`, empty search path, through
  `social.current_member()` (signed in, active pilot membership, complete profile):
  `app_topics`, `app_my_details`, `app_set_profile_details`,
  `app_member_details`, `app_discover_people`, `app_suggested_creators`.
* Limits enforced in the database: identity in creator/fan/both; bio 160 and
  follow reason 140 characters, one paragraph, no control characters; at most
  5 interests (serialised by a row lock), only active topics; page sizes 50
  (Discover) and 20 (suggestions).
* Revoked or expired members disappear from Discover, suggestions and profile
  details immediately (everything joins `social.visible_members`).
* Additive only: no existing table, column or function changes.

## Rollout and compatibility

* **App first is safe.** The app falls back only on a definite "function not
  found" (PGRST202 naming the exact function): no setup steps, the original
  Discover, no About section. Any other error stays an error.
* **Database first is safe.** The deployed app never calls the new functions,
  and nothing it calls has changed.
* **The checks know both states.** `005_social_core.sql`, the member surface
  audit and `008_profile_details.sql` require exactly the old function set
  before the migration and exactly the new set after it, so the staging
  workflow's checks pass either way, and a half-applied migration fails.
* **Deploy path:** the ordinary staging deploy (`Deploy database to staging`,
  plan then apply). The membership gate protection only blocks 20261122000000,
  which is already applied. No activation workflow is involved.
* **Rollback:** `scripts/db/staging-rollback-profile-details.sql` (phrase
  `REMOVE THE STAGING PROFILE DETAILS`), tested by
  `scripts/db/rollback-profile-details-test.sh`. It refuses once any member has
  saved details or interests; after that, fix forward.

## Acceptance checklist

| # | Criterion | Evidence |
|---|---|---|
| 1 | A new member sees Step 1 to 5 with progress, and can finish on a phone | unit test "a new member goes from their name…"; browser journey (member A) |
| 2 | Every step after the name can be skipped, and setup isn't shown again | unit test "every step can be skipped"; browser journey (member B, then reload) |
| 3 | Bio 160, follow reason 140, 5 interests: checked in the app and the database | unit test "checks the limits"; 075 section 2 |
| 4 | Identity grants and restricts nothing | 075 section 3; 008 check 3; integration (no membership + "creator" refused) |
| 5 | Without membership, every new function refuses; anonymous visitors can't call them | 075 section 1; 070 (31 and 32 functions); integration |
| 6 | Revoked or expired members can't change details and vanish from Discover and suggestions | 075 sections 3 and 4 |
| 7 | Discover by interest, shared interests first; suggestions skip people already followed | 075 section 4; unit tests; browser journey |
| 8 | Follow and unfollow reuse the existing functions | browser journey; unit test (suggestions follow) |
| 9 | Text posting, feed, Clique, likes, comments unchanged | all earlier unit, integration and browser checks still pass |
| 10 | Works against the current staging schema (before the migration) | unit test "on a database without profile details"; api tests; pre-migration check run |
| 11 | WCAG 2.2 AA on setup steps 2 to 4 and Discover; no sideways scrolling at 390 and 320 px | browser journey (axe-core) |
| 12 | Rollback refuses once members have data, and otherwise removes exactly its objects | rollback tests (11) |

## Founder browser test (after approval, on the protected Preview)

Only after the migration is approved and applied to staging, and the Preview is
built from this branch.

1. Sign in as yourself on a phone. You should see **Step 2 of 5** once. Choose
   Creator, pick 2 or 3 interests, write a bio and a reason, then Save. Step 5
   lists suggestions (it may be empty if no one else has details yet). Go to
   your feed.
2. Reload. Setup should not appear again.
3. Open Profile: "About you" shows your answers. Change one and save; you should see "Saved."
4. Open your public page: the Creator label, bio, "Why follow" box and interests show.
5. Discover: choose an interest in "Browse by interest"; only members with
   that interest appear. Choose one nobody has: a clear empty message and "Show everyone".
6. Post a text post, like, comment and delete it, to confirm nothing regressed.
7. With a second, granted test account: choose **Fan**, skip the rest, and
   confirm it can still post and follow you (identity grants nothing).
8. With an account that has **no** grant: still "Your pilot access isn't active".

## Stage 5.2 and later (plan, not built)

**5.2: reporting and founder moderation, before any external media.**
* `app_report(target_type, target_id, reason)` for posts, comments and
  profiles: reasons from a fixed list plus an optional note (500), rate
  limited, one open report per reporter and target, stored in
  `ops.content_reports` (server only, append-only status history).
* Founder tools through the existing owner-only, environment-gated workflow
  pattern (like `waitlist-admin`): list open reports (ids and counts, no
  emails), hide a post or comment (`hidden_at`, `hidden_reason`, recorded),
  hide a profile's details, and revoke membership (existing).
* Hidden content disappears through the same visibility joins, so every
  member function respects it, with tests like 075.
* Media publishing (5.3 onward) does not start until 5.2 is on staging.

**Onboarding, incrementally** (not deferred to 5.5):
* 5.1 (this PR): stepped setup, interests, suggestions.
* 5.2: "Report" and a short community guidelines screen in setup step 1.
* 5.2.1: invitation emails and the confirm page mention what happens next; a
  "Complete your profile" nudge on Home for members who skipped.
* 5.3 (profile pictures): an optional photo step in setup, once storage is approved.

## Media storage: the signed-upload design, reassessed

Checked against the Supabase storage client this repo installs
(`@supabase/storage-js` 2.119.0, `src/packages/StorageFileApi.ts` and
`StorageBucketApi.ts`). The supabase.com documentation could not be reached
from this session, so plan-dependent numbers below are marked **unverified**
and must be checked in the dashboard before 5.3.

| Topic | What the code shows | Consequence for the design |
|---|---|---|
| Signed upload URLs | "Signed upload URLs can be used to upload files to the bucket without further authentication. They are valid for 2 hours." The client exposes no expiry option. | A URL issued to a member stays usable for up to 2 hours, even if their access is revoked in that time. Mitigation: the post or avatar only becomes visible through a finalize function that re-checks membership; an upload never finalized is never shown, and a cleanup job deletes unfinalized objects. |
| Signed download URLs | `createSignedUrl(path, expiresIn)`, in seconds, per URL. No revoke call exists in the client. | **An issued signed URL can't be revoked early.** Hiding or deleting content stops new URLs at once; a URL already handed out keeps working until it expires (or the object is deleted). Use short expiries (proposal: 10 minutes) and delete the object on takedown. |
| Bucket limits | `file_size_limit` (bytes) and `allowed_mime_types` per bucket. | Set both on each bucket. The project-wide upload limit depends on the plan (**unverified**; local config uses 50 MiB). |
| Content type | The client sends the type it is given (`content-type` from `contentType`). | `allowed_mime_types` checks the declared type, not the bytes. File signatures must be checked in the finalize step (or an Edge Function) before anything is shown. |
| Public buckets | "Public buckets don't require an authorization token to download objects." Private is the default. | Private buckets only; the audit keeps failing on any public bucket. |
| CDN caching after delete or replace | Not shown in the client. | **Unverified.** Assume a deleted object can be served from cache for a while; use unique paths per upload (never overwrite) and short signed URLs. |
| Image transformations | Not shown in the client. | **Unverified** which plans include them; the design doesn't depend on them (resize in the browser before upload). |

The overall architecture stands (private buckets, server-chosen paths,
finalize with a membership re-check, short signed URLs for visible members
only), with these limitations stated plainly in the 5.3 design.
