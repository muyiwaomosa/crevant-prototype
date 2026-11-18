# Release 1: the social core

Real text posts, follows, the Clique (at most 10 creators), likes and
comments, stored in the database and used through the members area at `/app`.
This document is the review guide for the migration
`supabase/migrations/20261117000000_social_core.sql`.

**Status:** proposed. The migration is **not** in
`supabase/approved-migrations.sha256`, so CI's Database job stops at the
approval gate by design, and it has not been applied to staging or
Production. Adding its checksum is a separate founder approval.

## What members can do

| Action | Rule (enforced in the database) |
| --- | --- |
| Choose a username and display name | Required before anything else. Uses the existing own-row profile update. |
| Post | Text, 1 to 2,000 characters, no control characters. 20 posts an hour at most. |
| Delete a post or comment | Own only. Kept as deleted (`deleted_at`) and never shown again. |
| Follow / unfollow | Not yourself; only members with a complete profile. Following twice records nothing new. Every change is kept in `social.follow_events`. |
| Clique | Only creators you follow; at most 10; adding twice changes nothing; one change at a time per member (a lock), so two requests can't both take the last slot. Removing, or unfollowing, closes the membership with a reason (`removed` or `unfollowed`); history is never rewritten. |
| Like / unlike | Live posts only; one like per member per post. |
| Comment | Live posts only; 1 to 1,000 characters; 60 an hour at most. |
| Feed | Posts from people you follow, and your own, newest first, 20 at a time. |
| Discover | Members with a complete profile, most recently active first; search by username or display name. |

Following and Clique membership are different records: following someone
never adds them to the Clique.

**Not in Release 1:** Connection Points, rewards, money, analytics events,
images or video, notifications, blocking or moderation tools, public signup.
A test checks that no social table has a points, money, email or role column.

## Data and access

| Object | Purpose |
| --- | --- |
| `social` schema | Private, locked like `ops`: no access for `anon` or `authenticated`; row level security on every table with no policies. |
| `social.posts`, `social.comments` | Content, soft-deleted. |
| `social.follows` | Who follows whom now. |
| `social.follow_events` | Every follow and unfollow. Append-only (a trigger refuses updates and deletes). |
| `social.clique_members` | Clique history: one row per membership, closed when it ends, never deleted or rewritten. A trigger requires a current follow and enforces the limit of 10. |
| `social.likes` | One row per member per post. |
| `public.app_*` (18 functions) | The only way members reach this data. Each runs as its owner (`security definer`) with an empty search path, checks the caller, and is callable by signed-in members only (`anon` and `public` are revoked). |
| `social.*` helpers (5) | Internal: who is calling, complete-profile check, rate limits, and the two triggers. Not callable by members. |

**Profiles stay as approved in Phase 1A.** The own-row policies on
`public.profiles` are unchanged. Other members are only ever returned through
the app functions, as id, username and display name. No function mentions
email (a check enforces it).

Nothing here reads `ops`, the waitlist or creator acquisition data, and
nothing outside `social` reads its tables (checked).

**Account deletion** removes the member's posts, comments, likes, follows,
Clique memberships and follow history through the foreign keys. The
append-only triggers let those cascades through and refuse any direct edit.

## Publishing reliability (issue #48, 20261119000000)

A post or comment is stored **once** per request, however often it's sent.

* **In the browser:** `TextComposer` blocks a second submit at once (a ref, not
  React state, so two submits in the same instant can't both pass). It also
  gives each text a request id (`newRequestId()` in `src/app/api.ts`), reuses
  it when the person retries after an error, and makes a new one once the text
  changes or the send succeeds.
* **In the database:** `app_create_post(p_body, p_request_id)` and
  `app_add_comment(p_post, p_body, p_request_id)` store the id in
  `client_request_id`, unique per author. A repeat returns the first row and
  isn't rate limited again. The same id with other text (or another post) is
  refused as `request_reused`. Two simultaneous requests end up as one row.
  The original `app_create_post(text)` and `app_add_comment(uuid, text)` are
  unchanged, so older pages keep working.
* **Compatibility fallback (in the browser):** if the database doesn't have the
  request id versions yet (or they were rolled back), PostgREST answers
  `PGRST202` naming that function with `p_request_id`. Only then does
  `createSupabaseApi` send the original call once (`isMissingRequestIdVersion`
  in `src/app/api.ts`). A network failure, timeout or any other error is never
  retried, because the first write may have been stored. Tested in
  `src/app/api.test.ts`, and against a real old and new schema in
  `src/app/api.local-supabase.test.ts` (CI's Integration job).
* **Tests:** `supabase/tests-local/065_publishing_request_ids.sql`,
  `scripts/db/request-ids-concurrency-test.sh` (two real sessions at once),
  the app tests (a double submit, a retry after a lost answer), and the social
  journey (a double click, and a lost answer then a retry, for a post and a
  comment, on local Supabase).
* **Rollback (staging):** `scripts/db/staging-rollback-publishing-requests.sql`
  (phrase `REMOVE THE STAGING PUBLISHING REQUEST IDS`) removes only what that
  migration added and keeps every post and comment. It's now the newest, so it
  runs first, before the platform access rollback.

## Rollback (staging)

`scripts/db/staging-rollback-social.sql`, in `check` (dry run) or `apply`
mode, needing the phrase `DELETE THE STAGING SOCIAL CORE`. It removes exactly
the 34-item inventory above and the migration record, never by cascade, and
refuses if any member data exists, if a later migration is recorded, or if
anything unexpected is present. This migration is the newest, after the
waitlist and creator acquisition (20261116000000), and each rollback refuses
while a later migration is recorded, so on staging they run newest first:
social core, then creator acquisition, then the waitlist.
`scripts/db/rollback-test.sh` tests that whole chain and proves each earlier
rollback refuses until the later ones have run.

Wiring this rollback into the "Waitlist rollback (staging)" workflow as a
target is a follow-up that needs its own approval (as it did for creator
acquisition).

## Tests

| Suite | What it covers |
| --- | --- |
| `supabase/tests/005_social_core.sql` | Staging-safe checks: private schema, exact function set, owner-run with fixed search path, members-only execution, guards and triggers present, no points/money/email/role, separation from private data. |
| `supabase/tests-local/060_social_core.sql` | Behaviour with 13 fake members through the real functions: anonymous refusal, profile-first, validation, idempotency, Clique limit and follow requirement, unfollow closing the Clique, append-only history, own-only deletes, deleted posts disappearing, rate limit, own-row profiles, account deletion. |
| `supabase/tests-local/violations/60` to `70` | Eleven deliberate mistakes, each caught by the checks. |
| `scripts/db/rollback-social-test.sh` | Every refusal, a clean dry run, apply, and a second run refusing. |
| `src/app/app.test.tsx` | The members area against an in-memory version of the functions: setup, feed, posting, likes (including rollback on failure), follows, Clique (including full), comments, profiles, navigation, and no rewards wording. |
| `e2e/social-journey.e2e.cjs` | Two invited members in a real browser on local Supabase, with the production security headers: setup, post, follow, Clique, like, comment, reload persistence, the database refusing an 11th Clique member, unfollow closing the Clique, delete, phone layout, no CSP violations or console errors. Run by `scripts/e2e/auth-journey.sh`. |

## Approval checklist before staging

1. Founder review of this document and the migration.
2. Founder approval of the migration checksum, in its own reviewed commit
   (`sha256sum supabase/migrations/20261117000000_social_core.sql`).
3. The PR merged into `main` (staging workflows run from `main` only). PRs
   #31 and #32 are already merged, so creator acquisition reaches staging
   first, as its earlier date requires.
4. Staging deploy in `plan` mode, then `apply`, then `check`.
