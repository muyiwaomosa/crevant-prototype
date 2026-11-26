# Delivery tracker

The one authoritative tracker. A deliverable is **done** only when the founder
has accepted it on staging.

Stages, in order: **Not started**, **In development**, **Built** (complete in a
pull request), **Tested** (local suites and CI green), **Merged** (on `main`;
merging approves its migration checksums under D7), **Deployed** (database on
staging and the `staging` app at that commit), **Accepted** (the founder used it
on staging and signed off).

Infrastructure: Vercel Pro; the staging app is deployed at 40a055b and founder acceptance has started (Nov 26). Supabase: the Splitpost Production organization is on Pro (member Production, waitlist, rehearsal); `crevant-staging` is in the Crevant organization on **Free** (no backups) until the consolidation in `docs/INFRASTRUCTURE.md` is approved.

Staging app: https://splitpost-app-git-staging-crevant.vercel.app (the `staging`
branch, fast-forwarded only to merged `main`). Founder actions and acceptance
steps: `docs/STAGING-ACCEPTANCE.md` (section 0 is the action guide).

## Two workstreams (from Nov 26)

**Workstream A: release readiness** (December 23 gates). Staging acceptance,
real-device video test (in progress, founder), the staging recovery exercise
(after the first daily backup), security and privacy validation, legal
readiness, Production batches PB-1 to PB-4. Rows below.

**Workstream B: product experience** (founder review, Nov 26;
`docs/design/SP-REFINE-001.md`, previews
https://claude.ai/artifact/LT9k8aSFrFMz6MxRqtsvQ9).

| Item | Stage | Evidence | Next |
|---|---|---|---|
| H1 Home: one feed, Clique row with the approved rings and counts, catch-up then earlier posts (approved decision) | **Merged** (PR #123) | Unit suite and the affected journeys pass | On staging |
| V1 Visual fidelity: logo header, immersive post cards, Home without the composer | **Built** (PR #128): Home without title or composer, immersive cards, display face for short posts | Unit tests; social, content, photo, video and creator journeys; screenshots | Post card overflow menu with P1; target December 10 |
| D1 Discover: search first, For you, People, Topics | **Built** (PR #128): one question, search, three ways in, one recommended person, a few posts; focused views with the face transition; Topics shows who and what | Unit tests; social and consumer journeys; screenshots | Staging review |
| P1 Profile: public profile versus Your insights; Reach, Connection, Earnings | **Built** (PR #128): public profile with counts, actions and the "···" menu; your profile with Edit profile, See as others do, Your insights card (three faces), posts, Settings | Unit tests; ten profile-related journeys; screenshots | Staging review |
| N1 Names: Reach, Connection, Earnings | **Merged** | Profile tabs renamed; data unchanged underneath | On staging |
| G1 Goals engine (versioned, founder-set values, no defaults) and G3 simulated locked earnings (locked, eligible, settled; consumer Option A) | **Built and tested**, behind the progression switch (off) | Migration 20261217000000: behaviour test 300 (7 checks), staging check 033, rollback (10 checks) in the rollback suite (125 pass), reconciliation invariant; full database suite passes | PR for review; founder D7 approval of the checksum at merge; then staging |
| G2 creator progress, G4 consumer (supporter) progress, G5 simplified My Split, Control Center goals panel | **Built and tested**, behind the same switch | 6 unit tests (switch off unchanged, unset goals, progress and next step, restriction, founder goals and settlement); browser journey `progression-journey` passes (WCAG 2.2 AA, 320 and 390 px, no CSP violations) and leaves the switch off; the consumer and founder journeys pass after it | Same PR as G1 |
| SP-PRG-001 Progression and Engagement Framework (approved Nov 26) | **Built and tested locally**, behind the switch (off) | `docs/SP-PRG-001.md`, alignment in `docs/SP-PRG-001-ALIGNMENT.md`. Migration 20261218000000: approved benchmarks recorded, metric definitions aligned (UTC weeks, eligible members, returning supporters, ledger-based engagement), review before release, targeted holds, compensating corrections, scorecard. Behaviour test 300 (8 blocks), staging checks 033 and 034, rollback suite 128 pass, 899 unit tests, journeys (rewards, progression, consumer, founder) pass | **Merged** (PR #127); **applied to staging** (run 49, checks 033 and 034 passed; progression switch off); Control Center forms in PR #128; decisions 1 to 3 approved (alignment, section 9): deletion closure, activation definitions and review triage next, in migration 20261219000000 |
| F1 Connection framework | **Approved in principle**; weighted Connection Score, leaderboards, rankings and advanced achievements **deferred** (founder, Nov 26) | SP-REFINE-002, sections 1 and 5 | After launch |
| F2 Locked creator earnings (simulated) | **Approved**: append-only states; Splitpost never absorbs a locked amount | SP-REFINE-002, section 3 | Built in G3; deletion, dormancy, disqualification and legal treatment stay open |
| F3 Consumer eligible points before qualification | **Option A approved** (include and lock) | SP-REFINE-002, section 4 | Built in G3 |
| F4 Interactive advertising | **Approved as a controlled experiment** in principle | SP-REFINE-002, section 6 | After launch unless the founder asks otherwise |
| L1 Landing page visual assets | Not started | Prepared from the approved screens once V1 lands; not published before approval | After V1 |

**Impact on December 23:** H1, V1, D1 and P1 are about 7 working days of UI
work with no database change. The lean progression plan (G1, G2, G3, G5) is
about 10 more, behind a switch, merged by December 12 if approved by
December 1; together they are tight, so the UI refinements should be limited
to the previews confirmed first (SP-REFINE-002, section 2).

## Deliverables

| Deliverable | Stage | Evidence | Next step |
|---|---|---|---|
| IP-1 Foundation (registration, auth, invitation links, launch gate) | Deployed (database) | PR #106; applied Nov 25 | Staging steps A to D, then acceptance |
| IP-2 Relationships and Home | Deployed (database) | PR #107; applied Nov 25 | Acceptance |
| IP-4a Content, IP-4b Discovery and sharing | Deployed (database) | PR #108; applied Nov 25 | Acceptance |
| IP-4c Fair rotation, search measurement, public previews | Deployed (database) | PR #109; applied Nov 25 20:34 | Acceptance after steps A to D |
| IP-6 Contributions and rewards (simulated) | Deployed (database) | PR #110; applied Nov 25 20:34 | Acceptance |
| IP-3 Governance and its refinements | Deployed (database) | PRs #110, #111; applied Nov 25 20:34 | Acceptance |
| IP-7 Advertising, image and video creatives, frequency caps | Deployed (database) | PRs #111, #112; applied Nov 25 20:34 | Acceptance |
| IP-8 Intelligence (creator faces, My Split story, advertiser report, Control Center, North Star) | Deployed (database) | PR #112; applied Nov 25 20:34 | Acceptance |
| IP-9a Unified account and progressive onboarding: optional goal question with no public label, inviter shown with Follow or Not now, My Split education, creator setup (3 posting topics, first post, invitation link), creator suggestions for members who post or chose topics | Deployed (database) | PR #113; applied Nov 25 21:46 | Acceptance after steps A to D |
| IP-9a Control Center registration and invitation tools (pause, limits, creator-attributed links, list, revoke) | Deployed (database) | PR #113; applied Nov 25 21:46 | Acceptance after steps A to D |
| IP-9a Advertising requests from the member's own account, routed to managed onboarding; the advertiser's own aggregate report | Deployed (database) | PR #113; applied Nov 25 21:46 | Acceptance after steps A to D |
| IP-9b Landing page: signature line, Find your path (creators, members, advertisers; one destination), one disclosure band, Join the Waitlist or Join Splitpost wording switch, `/tour` retired | Merged | PR #113 | Deployed with the staging app; copy needs founder review |
| IP-10a Privacy requests (copy, correction, deletion) and audited account deletion keeping the anonymous ledger | Deployed (database) | PR #113; applied Nov 25 21:46 | Acceptance after steps A to D |
| IP-10a Operational switches (ads, sharing, video posts; registration, rewards and photos shown together) | Deployed (database) | PR #113; applied Nov 25 21:46 | Acceptance after steps A to D |
| IP-5 Video posts (everything except activation), with separate upload and playback controls and an emergency stop | Deployed (database) | PR #114; applied Nov 26 00:47 (run 45710436593) | A5 (110 MB limit), A7 (device test), then acceptance |
| Four stakeholder journeys end to end (creator, consumer, advertiser, founder) | Merged | PR #114; 19 journeys pass in CI | Hands-on acceptance on staging |
| Release hardening, part 1: security and authorization review and its fixes (migration 20261214000000) | Deployed (database) | PR #114; applied Nov 26 00:47 | Acceptance |
| Founder decisions of Nov 25: own-audience referrals recognized (20 points, 5 a day, configurable pilot parameters pending economic validation; recognition, never redeemable), moderator discipline escalated to the founder, Money & Business advertising policy | Deployed | PR #115, Nov 26 01:28 (9270ea5); applied to staging Nov 26 03:15 (run 45736045685, all checks passed) | Acceptance |
| Ad placement regression test: feed and post serves of one campaign, attributed by placement, valid counts, report split, nothing served while off (permanent regression suite, accepted by the founder Nov 26) | Merged | PR #115; test 280 runs in every Database CI job; the founder journey sees the Home feed ad on purpose, with exact counts | Done |
| Defects found in testing: a like tapped before a post card finished mounting was undone on screen; a second tap during "Skip the rest" could skip a setup step | Merged | PR #115; each with a unit test that fails without the fix | Acceptance |
| Release hardening, part 2: first-load speed on emulated phones (sign-in 2.7 to 2.1 s on Slow 4G), database timings at 30 times pilot size, backup and restore drill in every CI run, financial and advertising reconciliation (12 checks), recovery procedure, recovery screen instead of blank pages, page titles and focus after navigation, ad views counted only in a visible tab | Merged | PR #116, Nov 26 (9908901); accepted by the founder; recovery objectives approved (RPO 24 h, RTO 4 h) | Staging app at 9908901; real-device check and acceptance (staging guide, Journey 9) |
| Pilot media disclosure: "Keep your original" in the composer when a photo or video is attached; privacy notice draft line | Tested | PR #117; unit tests; photo, creator and video journeys | Merge, then acceptance (row 64) |
| Recovery after a restore: deleted accounts and posts stay deleted (deletion register, migration 20261216000000; D7 approved Nov 26, conditional) | **Merged** (PR #120, 74d41d7; migration applied to staging by run 45861107192) | Register written in the same transaction as each deletion; reported to the Edge Function log at once after each deletion (`/deletions`) and retried by the 15-minute drain; a row unlogged after 30 minutes fails the reconciliation. Recovery: export the live register before restoring (complete), else the log; restrict again after the restore; reconciliation is idempotent; reopening rules fail safe; residual risk documented by path (`docs/RECOVERY.md`). Recovery exercise passes locally and in CI | post-media v3 deployed and verified on staging (Nov 26). **Immediate reporting confirmed on staging:** the latest deletion reached the function log in 1 second (run 45878052395); the scheduled drain runs every 15 minutes. **Completeness** is now checked as well: staging check 032 fails on any post or comment deletion without a register row, any founder account deletion without its own register row (matched one by one), or any row not logged. Its first staging result comes with step 3 of the recovery exercise; not accepted until then. Then the exercise on staging after the transfer (action 7). Not complete until then. Incomplete evidence keeps a restored app restricted until resolved |
| Video journey failed once in CI (PR #120): no video post found right after posting | Fixed (test synchronization) | Cause shown: the wait for the post text also matched the composer, because React keeps a controlled textarea's text in sync with what is typed, so the database was read before the post was saved. The video and photo journeys now wait for the rendered post card. Not an app defect | Both journeys pass locally; CI on the next push |
| Intermittent failure of the ad view unit test (once in about six full local runs) | **Open investigation** | Root cause not confirmed: React effect timing is suspected, not proven. The test now waits for the slot's observer and prints a timed trace on failure that separates a test synchronization problem from a real miscount | If it recurs, read the trace; validate real ad viewing during acceptance (Journey 6) |
| Supabase consolidation: staging into the Pro organization (daily backups, 7-day logs, 110 MB upload limit) | **Done** (founder, Nov 26) | Same project and reference after the transfer; Edge Functions verified again: post-media 454 checks (run 45878056710), avatar 225 checks (run 45878061367), 0 failures, same builds; staging checks run 45878052395 all passed after the transfer (database connectivity with full TLS verification, every security and separation check, 36 migrations matching, scheduled cleanup at 18:45). Global upload limit set to 110 MB (founder). Cost about $55 a month until the rehearsal project is retired, then about $45; no new subscription | Founder: action 7 (confirm the first daily backup). The rehearsal project stays until the recovery exercise has passed on staging, its dependencies are ruled out, and the founder explicitly approves deleting it |
| "See Splitpost" screenshots on the landing page | Not started | Needs the Dec 7 build | Take from staging after acceptance starts |

| Production batch | Planned | Status |
|---|---|---|
| PB-1 Operations (SMTP, drain key, health checks, ledger) | Nov 28 | Prepared, awaiting founder approval (`docs/STAGING-ACCEPTANCE.md`, section 4) |
| PB-2 Migrations and functions | Dec 16 | Not started |
| PB-3 Release candidate fixes | Dec 20 | Not started |
| PB-4 Open external access | Dec 23 | Not started; needs separate authorization |
| Before wider commercial launch | Before PB-4 or any cohort beyond the controlled pilot | **Required:** a media backup and recovery approach for photos and videos (accepted as absent for the controlled pilot only, Nov 26); revisit point-in-time recovery |

## Acceptance findings

Stages here: **Local** (local tests), **CI** (all six checks), **Staging**
(deployed and checked by Claude), **Founder** (accepted by the founder on
staging).

| Finding | Local | CI | Staging | Founder | Status |
|---|---|---|---|---|---|
| BUG-001 photo post, BUG-002 profile picture upload, BUG-003 existing feed photo: "We couldn't reach Splitpost" while text worked (Nov 26) | Media journeys pass | Pass | Functions deployed and answering | **Accepted** Nov 26 on the canonical staging URL: photo post, photo with caption and topic, photo after refreshing, profile picture upload and after refreshing, photo post deletion | **Resolved** in the tested staging environment. Likely cause, not conclusively verified: the app was opened on an address the media functions don't accept |
| A media service failure was shown as "check your connection" | Fixed (code MEDIA-UNREACHABLE; console names the function and page address) | Pass | Deployed (PR #118, 40a055b) | Not exercised (no failure since) | Done |
| Text post, text post with a topic, sign-in | Pass | Pass | Deployed | **Accepted** Nov 26 | Done |
| Video readiness | Video journey passes | Pass | Bucket private, 110 MB, MP4 and JPEG; device-test page `/app/video-test` for the founder and testers only; video posts off and refused until both phone results and the cap are recorded; playback on. Staging post-media runs 74d41d7 (v3, deployed by the founder and verified Nov 26, run 45862869246: 454 checks). Staging moved to Pro and the global upload limit is 110 MB (Nov 26): **ready for the real-device test** | Founder: action 5 (device test, in progress), then 6 (switch on, staging only). Video storage cap of 50 GB approved for the pilot (Nov 26), with storage and bandwidth monitored in Control Center. **Not accepted** until both phone results are recorded as passed |

## Critical path to December 23 (updated Nov 26)

1. **Working staging:** done (founder signed in, media accepted Nov 26).
2. **PR #120** (deletion register) merged and applied to staging (Claude),
   then **one post-media deployment** (founder, action 1): video and deletion
   reporting together.
3. **Staging transfer to Pro**: done Nov 26 (founder), with the 110 MB limit. It was a dependency:
   the 110 MB upload limit (action 4), and so the video device test, cannot
   be set on Free. It also brings the daily backups the staging recovery
   exercise needs.
4. **Video device test** (founder, half a day; action 5), then video on
   staging (action 6).
5. **Remaining acceptance** (founder, action 10), fixes, then PB-2 to PB-4
   with their own approvals.

**Assessment:** December 23 remains achievable if the transfer happens by
December 3 and the device test by December 10. The transfer is now the main
schedule risk for video, because it gates the upload limit. If video slips,
the pilot can open with photos and text first and video on staging later,
which needs no change to the code.

## Genuinely outstanding against the approved MVP scope (Nov 26)

Everything else in the approved scope is built and merged. What remains:

* **Hands-on acceptance on staging** (founder), once steps A to D are done.
* **Video activation:** the device test (founder), then the switch on staging.
  The iPhone 1080p fallback only if the test shows it is needed.
* **Release hardening, part 2** (row above).
* **"See Splitpost" screenshots** on the landing page, from staging.
* **Legal and policy dependencies:** the Rewards Rules legal review (before
  allocation percentages are shown to members), the pilot privacy notice and
  policies in `docs/policies/` (before external invitations), and the
  regulated financial products review (deferred).
* **Production batches PB-1 to PB-4**, each with its own approval, and the
  cohort plan for December 23 (N10).

No new functionality is planned beyond these.
