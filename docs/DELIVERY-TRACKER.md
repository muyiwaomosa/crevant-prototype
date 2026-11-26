# Delivery tracker

The one authoritative tracker. A deliverable is **done** only when the founder
has accepted it on staging.

Stages, in order: **Not started**, **In development**, **Built** (complete in a
pull request), **Tested** (local suites and CI green), **Merged** (on `main`;
merging approves its migration checksums under D7), **Deployed** (database on
staging and the `staging` app at that commit), **Accepted** (the founder used it
on staging and signed off).

Infrastructure: Vercel Pro. Supabase: the Splitpost Production organization is on Pro (member Production, waitlist, rehearsal); `crevant-staging` is in the Crevant organization on **Free** (no backups) until the consolidation in `docs/INFRASTRUCTURE.md` is approved.

Staging app: https://splitpost-app-git-staging-crevant.vercel.app (the `staging`
branch, fast-forwarded only to merged `main`). Founder actions and acceptance
steps: `docs/STAGING-ACCEPTANCE.md` (section 0 is the action guide).

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
| Recovery after a restore: deleted accounts and posts stay deleted | **Not started** (proposal) | Existing records found insufficient (`docs/RECOVERY.md`); deletion register proposed | Founder decision (B5), then build and a recovery exercise; not complete until demonstrated |
| Intermittent failure of the ad view unit test (once in about six full local runs) | **Open investigation** | Root cause not confirmed: React effect timing is suspected, not proven. The test now waits for the slot's observer and prints a timed trace on failure that separates a test synchronization problem from a real miscount | If it recurs, read the trace; validate real ad viewing during acceptance (Journey 6) |
| Supabase consolidation: staging into the Pro organization (gains backups), rehearsal project retired | Not started (founder decision) | `docs/INFRASTRUCTURE.md`; about $45 a month before and after | Founder: B1 to B4 in the staging guide |
| "See Splitpost" screenshots on the landing page | Not started | Needs the Dec 7 build | Take from staging after acceptance starts |

| Production batch | Planned | Status |
|---|---|---|
| PB-1 Operations (SMTP, drain key, health checks, ledger) | Nov 28 | Prepared, awaiting founder approval (`docs/STAGING-ACCEPTANCE.md`, section 4) |
| PB-2 Migrations and functions | Dec 16 | Not started |
| PB-3 Release candidate fixes | Dec 20 | Not started |
| PB-4 Open external access | Dec 23 | Not started; needs separate authorization |
| Before wider commercial launch | Before PB-4 or any cohort beyond the controlled pilot | **Required:** a media backup and recovery approach for photos and videos (accepted as absent for the controlled pilot only, Nov 26); revisit point-in-time recovery |

## Critical path to December 23

1. **Working staging** (founder: steps A to D; the staging database is current with everything merged). This
   is the main schedule risk: until it is done, no hands-on acceptance can
   start. Everything else continues in parallel.
2. **Video pull request** merged and deployed (needs the D7 approval), and the
   staging Storage upload limit set to 110 MB.
3. **Video device test** (founder, half a day), then video on staging.
4. **Stakeholder journeys and release hardening** (about 5 days, in parallel
   with 2 and 3).
5. **Acceptance on staging** (founder), fixes, then PB-2 to PB-4 with their own
   approvals.

**Assessment:** December 23 remains achievable if staging is working by
December 2 and the device test happens by December 10. If staging slips past
December 5, acceptance and fixes compress into the last two weeks; the
recommendation then is to accept in two batches (core social and rewards first,
advertising and intelligence second) rather than shorten security or financial
testing.

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
