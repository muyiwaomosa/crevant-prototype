# Delivery tracker

The one authoritative tracker. A deliverable is **done** only when the founder
has accepted it on staging.

Stages, in order: **Not started**, **In development**, **Built** (complete in a
pull request), **Tested** (local suites and CI green), **Merged** (on `main`;
merging approves its migration checksums under D7), **Deployed** (database on
staging and the `staging` app at that commit), **Accepted** (the founder used it
on staging and signed off).

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
| IP-5 Video posts (everything except activation), with separate upload and playback controls and an emergency stop | Merged | PR #114, Nov 25 | Staging deploy run 45710436593 (waiting for founder), then the 110 MB limit and the device test |
| Four stakeholder journeys end to end (creator, consumer, advertiser, founder) | Merged | PR #114; 19 journeys pass in CI | Hands-on acceptance on staging |
| Release hardening, part 1: security and authorization review and its fixes (migration 20261214000000) | Merged | PR #114 | Same deploy run |
| Founder decisions of Nov 25: own-audience referrals recognized, moderator discipline escalated to the founder, Money & Business advertising policy | Tested (local) | Migration 20261215000000; test 270, check 031; affected journeys pass | Pull request CI, then merge authorization |
| Release hardening, part 2: performance (page load and slow queries), backup and restore drill on a throwaway project, monitoring and alerting, error handling review, keyboard and screen reader pass, device and usability pass with testers | In development | Accessibility is checked by axe in every journey at 320 and 390 px; restore drill needs a disposable Supabase project | Next |
| "See Splitpost" screenshots on the landing page | Not started | Needs the Dec 7 build | Take from staging after acceptance starts |

| Production batch | Planned | Status |
|---|---|---|
| PB-1 Operations (SMTP, drain key, health checks, ledger) | Nov 28 | Prepared, awaiting founder approval (`docs/STAGING-ACCEPTANCE.md`, section 4) |
| PB-2 Migrations and functions | Dec 16 | Not started |
| PB-3 Release candidate fixes | Dec 20 | Not started |
| PB-4 Open external access | Dec 23 | Not started; needs separate authorization |

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
