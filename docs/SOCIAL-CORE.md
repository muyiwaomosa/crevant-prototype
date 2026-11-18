# Release 1: the social core

Real text posts, follows (Following), My Clique (at most 25 creators since 20261120000000; 10 before), likes and
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
| My Clique | Only creators you follow; at most 25 (10 before 20261120000000); adding twice changes nothing; one change at a time per member (a lock), so two requests can't both take the last slot. Removing, unfollowing or replacing closes the membership with a reason (`removed`, `unfollowed` or `replaced`); history is never rewritten. |
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
| `social.clique_members` | Clique history: one row per membership, closed when it ends, never deleted or rewritten. A trigger requires a current follow and enforces the limit (25 since 20261120000000). |
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

## Following and My Clique (20261120000000)

**Terminology.** Members see two relationships only: **Following** (everyone
they follow) and **My Clique** (up to 25 chosen from Following). This section
was first written when those were called "My Clique" and "Clique"; the
member app no longer uses "Clique" anywhere, and a test fails if it
returns. Database names are unchanged: the Clique is `social.clique_members`,
`in_my_clique` and `app_clique_*`, and the migration file keeps its name.
Future monetary reward eligibility is specified in
docs/PRODUCT-STRATEGY.md (section 3) and is not built.


**Following** is everyone a member follows. It is `social.follows`, unchanged
and still the source of truth, with no limit. **My Clique** is the optional
priority group inside it, kept in the existing `social.clique_members` (no new
table). Every existing follow and membership is kept as it is.

| Rule | Where it is enforced |
| --- | --- |
| At most 25 Clique creators, each one followed | The guard trigger on `social.clique_members`, whatever writes the rows. |
| Removing from the Clique never unfollows | `app_clique_remove` only closes the membership (`removed`). |
| Unfollowing removes Clique membership | `app_unfollow` closes it (`unfollowed`), now under the same per-member lock as add and replace, so it can't race them. |
| At 25, a new creator replaces one the member chooses | `app_clique_replace(p_remove, p_add)`: checks, closes the old membership (`replaced`) and opens the new one in one transaction, under the per-member lock. Any failure changes nothing. The replaced creator stays followed. |
| At most 120 Clique changes an hour | The existing `social.rate_check(text, uuid)` (same signature), called by add, remove and replace after their checks. It counts memberships opened, and those closed by removing or replacing, in the last rolling hour. Add and remove pass kind `clique` (one change); replace passes `clique_replace` (two changes). A request is refused when the existing changes plus its own would go past 120: a replacement at 118 is allowed (reaching 120), at 119 it is refused, while a single add or remove at 119 is still allowed. The other limits (posts, comments, follows) cost one, so they behave exactly as before. Requests that change nothing (adding someone already there, removing someone who isn't) are not counted. A refused request (`rate_limited`) changes nothing. Unfollowing is covered by the follow limit (120 an hour), so it is never blocked by Clique activity. The index `clique_by_fan_recent` keeps the count cheap. |

Errors: `not_in_clique`, `already_in_clique`, `not_following`,
`cannot_add_self`, `clique_full`, `rate_limited`. Signed-in members only, like every other
member function. The Clique changes presentation priority only: the
feed stays chronological, and nothing records Connection Points, rewards or
money (checked). A later release can show Clique creators first in the
unseen strip by reading `in_my_clique` from `app_following`.

**The page** (`/app/clique`, the existing Clique tab, no new tab): **My Clique**
first, with the count (for example 8/25) and "Remove from Clique", then
**Following**, with every followed creator, a "Clique" badge on those in the
Clique, "Add to Clique" and "Unfollow". At 25, adding opens a dialog (a bottom
sheet on phones) to choose who to replace: a labelled radio group, Escape and
Cancel close it, focus stays inside and returns to the button. Elsewhere
(profiles, Discover), a full Clique links to `/app/clique?add=<id>`, which
opens the same dialog. Posts from Clique creators carry a "Clique" badge.

If a replacement fails (refused by the server, or stale because another tab
or device changed the Clique), the dialog stays open, shows the error
and moves focus to it, and refreshes the list. The chosen creator stays
selected while still in the Clique. The dialog then follows the current
state: if a place has opened up it offers a plain add; if the creator is
already in the Clique, or is no longer followed, it says so.

Follow and unfollow are unchanged, except that unfollow now takes the
per-member lock. The existing follow tests (060), the new checks in 066 and
the browser journey all cover them.

**Rollback (staging only):** `scripts/db/staging-rollback-inner-clique.sql`
restores the guard at 10, the earlier `app_unfollow`, `app_clique_add`,
`app_clique_remove` and `social.rate_check` (without the Clique limit)
and reasons, drops `app_clique_replace` and the `clique_by_fan_recent` index,
and deletes the record. It refuses if any member has more
than 10 Clique creators or any membership was closed as `replaced`
(the history is append-only), so once members use the larger Clique,
the way back is a forward fix. This restriction is accepted: after members
use the 25-creator capacity, problems are fixed forward, not rolled back. It runs first in the rollback chain. Tested by
`scripts/db/rollback-inner-clique-test.sh`, which also applies the migration
over existing memberships and proves every one is kept.

**Tests:** `supabase/tests-local/066_inner_clique.sql` (unlimited follows, the
cap, replace, every failed replace changing nothing, a replace failing at its
last step changing nothing, removal keeping the follow, unfollow closing the
membership, anonymous refusal, the rate limit refusing add, remove and
replace without changing anything while follow and unfollow keep working,
the one-hour window, and the boundary: a replacement allowed at 118 and
refused at 119 without changing memberships or history, a single add still
allowed at 119, and the follow limit unchanged), `scripts/db/inner-clique-concurrency-test.sh`
(two real sessions: same creator replaced twice, two different replacements,
the same creator brought in twice, an add racing a replace at 25, unfollow
racing a replace, and two replacements at once at 118 changes: one applies,
the other is refused), `src/app/app.test.tsx` (the page, the dialog, keyboard use,
a refused replacement kept open and retried, a stale choice refreshed, a
place opening up, an unfollow elsewhere), and `e2e/social-journey.e2e.cjs`
(27 follows, the 26th refused, a real replacement in the browser, a stale
replacement made from another device while the dialog is open, phone widths
390 and 320).

## Viewed state, the foundation for Unseen-first Home (20261121000000)

**Status:** proposed, staging only, not applied. The migration is not in
`supabase/approved-migrations.sha256` until the founder approves its checksum.

**What a view is.** A signal reported by the member's own browser when a post
meets the viewing rule:
* text and images: at least 50% visible for 2 continuous seconds;
* video: 3 seconds of actual playback, or completion, whichever comes first.

It is a client-observed UX signal, not verified engagement. **It must never be
used to issue Connection Points or decide monetary reward eligibility** (see
docs/PRODUCT-STRATEGY.md, section 3). A check fails if the table carries
points, money or reward data, or if anything outside the social core reads it.

| Object | Behaviour |
| --- | --- |
| `social.post_views (viewer_id, post_id, viewed_at, basis)` | One row per member and post, ever (primary key). `viewed_at` is the server time of the first report; `basis` is `visible` or `played`. Rows are never rewritten or deleted directly (a trigger refuses); they go only with the member's account or the post. Kept across unfollow and refollow. Private: no member access, no policies. |
| `app_mark_viewed(p_posts uuid[], p_basis text)` | Records views for the caller. At most 50 ids per call (`too_many`). Own, deleted and missing posts, nulls and repeats are ignored. Posts by creators the member doesn't follow are recorded too. At most 3,000 new rows per member per rolling hour: a batch that would go past it is refused (`rate_limited`) and writes nothing. A per-member advisory lock makes the count and the insert one step, so simultaneous batches can't exceed the cap or duplicate rows. Returns how many were new. |
| `app_unseen_creators()` | The Unseen-first strip: followed creators with at least one unseen post, meaning published at or after the member's **current** follow date, not deleted, not viewed. `unseen_count` is capped at 10 (shown as 9+). My Clique creators first, then other followed creators; within each, newest unseen post first. Creators with nothing unseen are not returned. |
| `app_catch_up(p_creator, p_before_at, p_before_id)` | Up to 20 of that creator's most recent unseen posts, returned oldest first, in the feed's shape. Older batches: pass the oldest returned post's `created_at` and `id`. Paging is a keyset on `(created_at, id)`, so equal timestamps never skip or repeat a post. Read-only: it never marks posts viewed. Returns nothing for creators the member doesn't follow. |

`app_feed` is unchanged: Home stays chronological. Viewed state is shared
because Home and catch-up both record through `app_mark_viewed`.

**Unfollow and refollow.** Refollowing resets the unseen baseline to the new
follow date, so posts from before it are not unseen. Earlier views are kept.

**Performance** (`scripts/db/viewed-state-plan-test.sh`, run in CI). It captures
the real plans of the statements inside the functions with `auto_explain`, at
a pilot-scale dataset: a fan following 1,000 creators, 50,000 posts, about
30,000 of the fan's views and 100,000 views by others. It fails on any
sequential scan of `posts` or `post_views`, or on slow results. Measured
locally:

| Query | Plan | Time |
| --- | --- | --- |
| The strip (1,000 followed creators) | per creator: `posts_live_by_author` index, anti-join on `post_views_pkey`, top 10 | about 124 ms |
| A catch-up batch, and the next batch (keyset) | the same indexes, creator's posts since the follow only | 1 to 2 ms |
| Recording 50 views | `posts_pkey`, `post_views_pkey`, `post_views_by_viewer_time` | about 1 ms |

The strip reads every post each followed creator published since the follow
(not only 10), so its cost grows with how much followed creators post and
how few of those posts the fan has viewed. At pilot scale this is small. If
it grows, the forward fixes are a lookback window (for example, the last 30
days) or a cached per-fan count, each its own reviewed migration.

**How the app limits requests (built with the member experience):**
* qualifying ids queue in memory, and a batch is sent at 10 ids, 5 seconds
  after the first, when the page is hidden, or on leaving the page;
* one request in flight at a time; ids already sent this session are never
  resent; own posts are skipped;
* failed batches go to a bounded retry queue (at most a few hundred ids, kept
  in browser storage for the next visit), retried with backoff when
  connectivity returns or the member comes back, and dropped after a few
  attempts. A dropped view only means a post stays unseen.

**Rollback (staging only):** `scripts/db/staging-rollback-viewed-state.sql`
removes exactly the migration's objects and record. It refuses, changing
nothing, if a later migration is recorded or **any viewed-state row exists**:
viewed state is member data. It runs first in the rollback chain; tested by
`scripts/db/rollback-viewed-state-test.sh`.

**Forward-fix guidance.** Once views exist, problems are fixed with a new
migration, never by deleting views:
* a wrong function: `create or replace` it in a new migration (same
  signature), or add a new versioned function and keep the old one until the
  app has moved over;
* a wrong limit or rule: change it in the function, in a new migration;
* a bad row: the table refuses direct deletes on purpose. A one-off repair
  needs its own reviewed migration that states why, and must never touch
  rewards or points (there are none);
* to stop the feature quickly: deploy the app without the strip and catch-up.
  The functions can stay, unused.

**Tests:**
* `supabase/tests-local/067_viewed_state.sql` covers:
  * anonymous refusal;
  * the strip's membership, order and cap;
  * the follow-date rule and deleted posts;
  * recording once, ignoring own, missing and null ids, and validation;
  * catch-up batches with 25 identical timestamps (newest 20, oldest first,
    the next batch with no skips or repeats, nothing marked);
  * shared state between catch-up and Home;
  * views of creators you don't follow;
  * refollow resetting the baseline while keeping views;
  * isolation between members;
  * the hourly cap at its exact boundary, with refusals writing nothing and
    the one-hour window;
  * permanence, and account deletion.
* `scripts/db/viewed-state-concurrency-test.sh` uses two real sessions:
  * the same post marked twice at once gives one row;
  * overlapping batches produce no duplicates;
  * two batches arriving at once at 2,996 views: one applies (2,999), the other
    is refused and writes nothing. Without the lock this reached 3,002
    (verified).
* `005` checks the table is private, has its primary key, and keeps its
  permanence trigger, batch cap, hourly cap, lock, keyset paging and
  follow-date rule. Violations 73 and 74 prove those checks catch the trigger
  being dropped and members being granted read access.

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
