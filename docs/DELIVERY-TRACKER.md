# Delivery tracker

A package is **delivered** only when the founder has accepted it on staging.

* **Built:** complete in a pull request.
* **Tested:** local suites and CI green.
* **Merged:** on `main` (merging approves its migration checksum, D7).
* **Deployed:** on staging (database, any Auth settings, and the `staging` app build).
* **Accepted:** the founder has used it on staging and signed off.

Staging app: https://splitpost-app-git-staging-crevant.vercel.app (the `staging` branch, fast-forwarded only to merged `main`). Acceptance steps: `docs/STAGING-ACCEPTANCE.md`.

| Package | Built | Tested | Merged | Deployed (staging) | Accepted | Notes |
|---|---|---|---|---|---|---|
| IP-1 Foundation | Yes | Yes, CI 6 of 6 | Yes, PR #106, Nov 25 | Database applied and checked Nov 25 14:00. Founder setup steps A to D pending (docs/STAGING-ACCEPTANCE.md) | Pending | Production registration paused, launch gate closed |
| IP-2 Relationships and Home | Yes | Yes, CI 6 of 6 | Yes, PR #107, Nov 25 | Database applied and checked Nov 25 14:00 | Pending | Active Supporter definition provisional until metric review (N8) |
| IP-3 Governance (blocking, comment reports, ladder, notices, appeals) | Yes | Yes, CI 6 of 6 | Yes, PR #110, Nov 25 | Database apply waiting for your approval ([run 45663465302](https://github.com/muyiwaomosa/crevant-prototype/actions/runs/45663465302), which replaces 45652930512) | No | Review guide `docs/GOVERNANCE.md` |
| IP-4a Content (topics, editing, saves, reposts) | Yes | Yes, CI 6 of 6 | Yes, PR #108, Nov 25 | Database applied and checked Nov 25 14:59 | No | Review guide `docs/CONTENT.md` |
| IP-4b Discovery and sharing | Yes | Yes, CI 6 of 6 | Yes, PR #108, Nov 25 | Database applied and checked Nov 25 14:59 | No | Review guide `docs/DISCOVERY.md` |
| IP-4c Fair rotation, search measurement, public previews | Yes | Yes, CI 6 of 6 | Yes, PR #109, Nov 25 | Database apply waiting for your approval ([run 45663465302](https://github.com/muyiwaomosa/crevant-prototype/actions/runs/45663465302), which replaces 45652930512) | No | Previews opt-in and off by default; Production activation needs its own approval. Review guide `docs/PREVIEWS.md` |
| IP-3/IP-6 refinements (restored rewards, sole-moderator exception, immediate enforcement, rewards journey, founder month tools) | Yes | Yes, CI 6 of 6 | Yes, PR #111, Nov 25 | In [run 45663465302](https://github.com/muyiwaomosa/crevant-prototype/actions/runs/45663465302), waiting for your approval | No | Migration 20261207000000 |
| IP-5 Video posts | Not started | | | | | Depends on the device test |
| IP-6 Contributions and rewards (simulated) | Yes | Yes, CI 6 of 6; dedicated browser journey added in the refinements PR | Yes, PR #110, Nov 25 | Database apply waiting for your approval ([run 45663465302](https://github.com/muyiwaomosa/crevant-prototype/actions/runs/45663465302), which replaces 45652930512) | No | All simulated; review guide `docs/REWARDS.md` |
| IP-7 Advertising with commercial matching | Yes | Yes, CI 6 of 6 | Yes, PR #111, Nov 25 | In [run 45663465302](https://github.com/muyiwaomosa/crevant-prototype/actions/runs/45663465302), waiting for your approval | No | Migration 20261208000000; review guide `docs/ADVERTISING.md` |
| IP-7 follow-up: image and video creatives, frequency caps (6 a day, 3 per campaign), restored points outside daily caps | Yes | Local: database suite, rollback chain, 823 unit tests, all 14 browser journeys in CI order; CI on the next PR | No, awaiting merge authorization | No | No | Migration 20261209000000 |
| IP-8 Intelligence (creator Attention, Retention, Money faces; My Split story; advertiser report story and self-reported conversions; founder Control Center and North Star) | Yes | Local: database suite, rollback chain, 823 unit tests, all 14 browser journeys in CI order; CI on the next PR | No, awaiting merge authorization (same PR as the IP-7 follow-up) | No | No | Migration 20261210000000; review guide `docs/INTELLIGENCE.md` |
| IP-9 Brand and acquisition | Not started | | | | | |
| IP-10 Release | Not started | | | | | |

| Production batch | Planned | Status |
|---|---|---|
| PB-1 Operations (SMTP, drain key, health checks, ledger) | Nov 28 | Prepared, awaiting founder approval (`docs/STAGING-ACCEPTANCE.md`, Part C) |
| PB-2 Migrations and functions | Dec 16 | Not started |
| PB-3 Release candidate fixes | Dec 20 | Not started |
| PB-4 Open external access | Dec 23 | Not started |

## Remaining approved scope (mapped Nov 25, checked against the code)

Sizes: S under a day, M one to two days, L more.

| Area | Requirement | State | Size | Needs |
|---|---|---|---|---|
| Acquisition | BRD-07 Control Center: issue invitation links, set limits, pause registration | Database functions exist (20261130000000); no screen calls them | S-M | |
| Acquisition | Creator invitation links that name the inviting creator at registration, and show them first in setup (ACQUISITION Phase 2 and 3) | Column exists; no creator parameter, banner or suggestion | S | |
| Acquisition | BRD-03 "Apply as a creator" path | `/join/creator` redirects to the waitlist | M | Founder: new form or waitlist variant |
| Acquisition | BRD-05 Advertiser inquiry ("talk to us") | Missing | M | Founder: where inquiries go |
| Acquisition | BRD-08 one funnel from visit to registration to activation; `interests_selected` and suggestion counts | Registration and activation counted; visits sit in the waitlist project | M | |
| Onboarding | Explain My Split and points (simulated; recognized versus redeemable) during first run (SP-TA-001 §9) | Missing | S | |
| Onboarding | DSC-04 creator setup: up to 3 posting topics (needed for creator discovery), first post prompt | Missing; "Creator" changes only a badge | M | |
| Brand | BRD-09 landing: the signature line, "Find your path" (creators, members, advertisers), registration wording, one disclosure band (BRD-10) | Missing or scattered | S-M | |
| Brand | BRD-09 "See Splitpost" with real screenshots; sharing image on the Splitpost domain | Missing | S | Screenshots after the Dec 7 build; domain after the Production site approval |
| Brand | BRD-10 retire `/tour` (old sample economy) | Still served | S-M | |
| Brand | BRD-01 one financial card component that forces a Simulated, Non-binding or Actual label | Labels applied screen by screen | M | |
| Journeys | REL-03 four end-to-end stakeholder journeys (consumer, creator, advertiser, founder) on staging | 14 feature journeys pass; no cross-stakeholder ones yet | M-L | Working staging (steps A to D) |
| Governance | GOV-C12 account deletion request and audited deletion; GOV-C11 privacy request procedure | Missing | M | Legal wording (N11) |
| Release | REL-12 switches for ads, sharing and video (registration, rewards and previews have them); rewards switch in the UI | Partial | S-M | |
| Release | REL-08 dedicated cent-exact reconciliation suite | Checks live inside the rewards and ads tests | M | |
| Release | REL-05 to REL-07 device, usability (4 of 5 finish setup in under 4 minutes), keyboard and screen reader, security review | Not run (axe runs in every journey) | M | Testers |
| Release | REL-11 restore drill; REL-13 cohort plan and holiday rota; GOV-C15 evidence pack index | Not done | S each | N10 cohort plan |
| IP-5 | Video posts (720p conversion, resumable upload, limits, player) | Not started; posts accept photos only | L | N6 device test |
