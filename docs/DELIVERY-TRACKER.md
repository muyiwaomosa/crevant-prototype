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
| IP-4c Fair rotation, search measurement, public previews | Merged | PR #109 | Staging deploy run 45677972966 (waiting for founder) |
| IP-6 Contributions and rewards (simulated) | Merged | PR #110 | Same run |
| IP-3 Governance and its refinements | Merged | PRs #110, #111 | Same run |
| IP-7 Advertising, image and video creatives, frequency caps | Merged | PRs #111, #112 | Same run |
| IP-8 Intelligence (creator faces, My Split story, advertiser report, Control Center, North Star) | Merged | PR #112 | Same run |
| IP-9a Unified account and progressive onboarding: optional goal question with no public label, inviter shown with Follow or Not now, My Split education, creator setup (3 posting topics, first post, invitation link), creator suggestions for members who post or chose topics | Tested (local) | Migration 20261211000000; database suite, rollback chain (110), 844 unit tests, 14 journeys in CI order | Pull request CI, then merge authorization |
| IP-9a Control Center registration and invitation tools (pause, limits, creator-attributed links, list, revoke) | Tested (local) | Same | Same |
| IP-9a Advertising requests from the member's own account, routed to managed onboarding; the advertiser's own aggregate report | Tested (local) | Same | Same |
| IP-9b Landing page: signature line, Find your path (creators, members, advertisers; one destination), one disclosure band, Join the Waitlist or Join Splitpost wording switch, `/tour` retired | Tested (local) | Public site browser check, unit tests | Same pull request; copy needs founder review |
| IP-10a Privacy requests (copy, correction, deletion) and audited account deletion keeping the anonymous ledger | Tested (local) | Migration 20261212000000; behaviour test 240; rollback | Same pull request |
| IP-10a Operational switches (ads, sharing, video posts; registration, rewards and photos shown together) | Tested (local) | Same | Same pull request |
| IP-5 Video posts (everything except activation) and the device test page | Tested (local) | `docs/VIDEO.md`, `docs/video/VIDEO-FEASIBILITY.md`, `docs/video/DEVICE-TEST.md` | Pull request next; activation waits for the device test |
| Four stakeholder journeys end to end (creator, consumer, advertiser, founder) | Not started | 14 feature journeys pass; these are cross-engine | After the video pull request opens, in parallel |
| Release hardening: security and authorization review of new functions, performance, mobile and accessibility pass, restore drill, monitoring, error handling, cent-exact reconciliation suite | Not started | Parts exist inside current suites | Begins in parallel with the stakeholder journeys |
| "See Splitpost" screenshots on the landing page | Not started | Needs the Dec 7 build | Take from staging after acceptance starts |

| Production batch | Planned | Status |
|---|---|---|
| PB-1 Operations (SMTP, drain key, health checks, ledger) | Nov 28 | Prepared, awaiting founder approval (`docs/STAGING-ACCEPTANCE.md`, section 4) |
| PB-2 Migrations and functions | Dec 16 | Not started |
| PB-3 Release candidate fixes | Dec 20 | Not started |
| PB-4 Open external access | Dec 23 | Not started; needs separate authorization |

## Critical path to December 23

1. **Working staging** (founder: approve run 45677972966, steps A to D). This
   is the main schedule risk: until it is done, no hands-on acceptance can
   start. Everything else continues in parallel.
2. **Onboarding pull request** merged and deployed (needs the D7 approval).
3. **Video posts** built (about 4 days of development), then the device test
   (founder, half a day), then activation.
4. **Stakeholder journeys and release hardening** (about 5 days, in parallel
   with 3).
5. **Acceptance on staging** (founder), fixes, then PB-2 to PB-4 with their own
   approvals.

**Assessment:** December 23 remains achievable if staging is working by
December 2 and the device test happens by December 10. If staging slips past
December 5, acceptance and fixes compress into the last two weeks; the
recommendation then is to accept in two batches (core social and rewards first,
advertising and intelligence second) rather than shorten security or financial
testing.

## Open founder decisions

* Landing page copy for Find your path and the pilot details band (drafted in
  the house style, marked approved in principle).
* Whether "Join the Waitlist" should show while the waitlist form itself is
  closed. Today the buttons say "Waitlist Opens Soon" until the form opens (the
  existing safeguard against inviting a sign-up that isn't possible yet).
