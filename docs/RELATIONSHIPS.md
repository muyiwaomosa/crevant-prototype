# Relationships and Home (IP-2): review guide

Migration: `supabase/migrations/20261201000000_relationships.sql`. Authorized by the founder on November 25, 2026 as Implementation Package 2 (SP-TA-001 v2, WP-03; design SP-DESIGN-002). Checksum in `supabase/approved-migrations.sha256`: merging the pull request is the founder's approval of it (D7).

Nothing here opens access or changes registration. Nothing here charges, pays or rewards anyone.

## 1. What it delivers

| Capability | How | Requirements |
|---|---|---|
| Three relationship stages | **Following** (unchanged), **Clique Connection** (chosen, now with no limit), **Active Supporter** (a follower with at least one meaningful activity on the creator's posts in the last 28 days). Discovery is recorded as the follow's source (`profile`, `discover`, `post`, `catch_up`, `comment`, `other`), never as a stage | CON-01, CON-02, CON-03, CON-09 |
| One Home, Clique first | The Clique first face shows the member's unseen recent Clique posts (last 7 days, at most 20, newest first) under "New from your Clique", then everything else newest first. Each eligible post appears exactly once; the group empties as posts are seen, so nothing is pinned or starved. My Clique and Following stay strictly chronological | CON-04 to CON-07 |
| Complete distribution | Every post from a followed, unmuted creator is reachable on Home (proven in `supabase/tests-local/130_relationships.sql`: group plus pages reach 9 of 9, each once, including posts with identical timestamps). Only the member's own mute hides a post | CON-08 (protects the 100% eligible coverage promise) |
| Clique catch-up | Unchanged from viewed state: tapping a Clique avatar opens that creator's unseen posts, oldest first, ending with "All caught up". Posts never expire; there is no Stories feature | SP-DESIGN-002 9.2 |
| Relationship management | Your Clique page: Clique and Following lists with stage chips (Clique Connection, Active Supporter, Muted on Home), Join Clique, Remove from Clique, Mute or Unmute, Unfollow. The replace dialog is retired with the limit | CON-12 |
| Profile counts | Followers, Clique, Active Supporters on every profile | CON-11 |
| Labelled Support button and Support Intent | Outline "Support" button beside Following and Join Clique. The sheet offers $3, $5 or $10 a month or Not sure yet, says "Non-binding. Nothing is charged, now or later.", records the choice, and lets the member withdraw it. Stored in the `intent` schema, append-only, never money | ADV-13, SP-DESIGN-002 9.4 |
| Relationship intelligence | The member's side: `app_my_relationships` (stage, mute, own Support Intent per creator). The creator's side: "Your audience" on their own profile with What happened, What it means, What to do next, and non-binding Support Intent by option (aggregates only, never who) | CON-10, SP-DESIGN-002 9.5 |
| Events | Follows carry their source; comments record whether they were meaningful; mutes, unmutes and Support Intent are recorded, all by server triggers | INT-C01, CON-09 |
| Integrity | Follows, Clique changes, mutes and Support Intent are idempotent and rate limited (mute 120 an hour, Support Intent 30 an hour); histories are append-only; members cannot read any of these tables directly | CON-13 |

## 2. Deliberate choices

* **Meaningful comment, provisional.** At least 20 visible characters (`social.meaningful_comment`, one place to change). Metric decision N8 (due December 3) may change it; the change is one function.
* **Support sheet wording.** The approved mockup reads "Show Amara you'd support her". Splitpost does not know members' pronouns, so the app says "Show Amara you'd support their work".
* **A new follow ends an old mute.** Someone who unfollows and follows again starts fresh.
* **Older pages and databases.** The app works before the migration is applied (no Support button, no mute, chronological Home, earlier counts), so the page can deploy before the database.
* **Insight is aggregate.** A creator sees how many people are Active Supporters or recorded Support Intent, never who.

## 3. Evidence (local)

| Layer | Result |
|---|---|
| Typecheck, production build, bundle secret scan | Pass |
| Unit and component tests | 772 passed, 3 skipped |
| Build and workflow guard tests | 291 passed; database guard tests 153 passed |
| Database suite on empty PostgreSQL 16: all 20 migrations, staging-safe checks including the new `017_relationships.sql`, behaviour tests including the new `130_relationships.sql` (follow source, mute, Clique first and coverage, Active Supporter, Support Intent, audience, limits, account deletion), the member surface audit and its violation tests, the concurrency tests | Pass |
| Real Supabase Auth integration | 135 passed; activation 38, CLI compatibility 7, member Production sequence 79 |
| Rollback chain including the new `rollback-relationships-test.sh` (15 checks) | 77 passed, 0 failed |
| Browser journey `e2e/relationships-journey.e2e.cjs`: follow from a profile with its source, Join Clique, profile counts, Support sheet (non-binding), Clique first with each post once, Active Supporter from a meaningful comment, mute and unmute, the creator's audience insight; WCAG 2.2 AA, 320 and 390 px, no CSP violations, no console errors | All passed. The existing social, moderation, avatar, feedback, photo, sign-in and registration journeys also pass |

## 4. Applying it

Staging: after merge, the staging database deploy workflow (`plan`, `apply`, `check`). No Auth or dashboard change is needed. Member Production: with PB-2.

Undo on staging: `scripts/db/staging-rollback-relationships.sql` (phrase `REMOVE THE STAGING RELATIONSHIPS`). It refuses once any mute, Support Intent or follow source exists, or any Clique holds more than 25 (the limit it would restore); after that, fix forward.
