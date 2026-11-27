# MVP acceptance and release readiness checklist (Nov 27)

The single list for completing, validating and releasing the approved MVP.
It replaces separate status reports: findings, readiness and gates are all
recorded here. The aim is to release as soon as the MVP is demonstrably
ready; the planned dates are latest dates, not waiting points. No new
features, redesigns or scope changes are planned; a change is made only if
acceptance finds a material issue. Every production, security, financial,
legal and external pilot approval gate stays in place.

**Three kinds of verification**, kept apart throughout:

* **Automated:** technical checks Claude runs or CI runs on every change
  (tests, journeys, security and separation checks, deployment checks).
* **Founder acceptance:** you using the product on real devices and deciding
  it is acceptable.
* **External validation:** people outside the team (counsel, prospective
  members, the pilot cohort). Claude cannot stand in for these.

**Who:** **You** means the founder has to do it (a click, a decision, a
signature or hands-on testing). **Claude** means Claude does it and reports
back. **Done** items have their evidence beside them.

Staging: https://splitpost-app-git-staging-crevant.vercel.app at `6023da7`.
Hands-on steps: `docs/FOUNDER-TESTING-GUIDE.md`.

## A. Staging ready for acceptance (automated, with three founder clicks)

| # | Item | Who | Status |
|---|---|---|---|
| A1 | Staging fast-forwarded to main `6023da7` (SP-UX-002, UX-01 to UX-04, landing page) | Claude | **Done** Nov 27 |
| A2 | No database change between the previous staging commit and `6023da7`, so no migration is needed | Claude | **Done** (no `supabase/` differences) |
| A3 | Read-only staging check: isolation from Production, migrations through 20261219, security and separation checks, switch states (run 52) | You approve the gate; Claude reads the result | **Done** Nov 27 13:27 (run 46003719199): approved project, all 38 migrations applied through 20261219, every security and separation check passed; progression off at that time, 0 qualifications |
| A4 | Staging serves `6023da7` (View Source: `splitpost-commit`) | You (staging is behind Vercel sign-in) | To do, 1 minute |
| A5 | Progression switched on for staging, with a reason | You (founder-only control in Control Center) | To do, 1 minute |
| A6 | Safeguards unchanged with progression on: simulated amounts only, manual qualification approval with a reason, holds and daily caps, no cash movement, no 40:20:40 percentages shown, no unrestricted balance editing, no automatic qualification | Claude (code and tests); you see it during B | **Done** in code and CI; confirmed by you in B9 and B12 |

## B. The member journey (founder acceptance, about 90 minutes)

Each row is a step in the testing guide. Claude's automated journeys already
cover each one in CI on every change (green on `d6d4e53`, which has
exactly the same files as `6023da7`); your pass is the acceptance on real devices.

| # | Journey step | Who | Automated cover |
|---|---|---|---|
| B1 | Invitation, registration, welcome walkthrough (five faces, Skip, Back, Continue, swipe, Get started) | You | auth, registration, social journeys |
| B2 | Setup with interests, or skipped | You | registration journey |
| B3 | Home: Clique row, personalized first steps, Hide | You | social journey; unit tests |
| B4 | Discover: interest first, For you, People, Topics, search | You | social, consumer journeys |
| B5 | Their profile: Follow, Add to Clique, Report and Block in "···" | You | social, moderation journeys |
| B6 | Create a post with a topic | You | content, creator journeys |
| B7 | Engage: like, comment, save, share, repost; recognition message; Report in "···" only | You | social, rewards journeys |
| B8 | Your Clique: Remove, Mute, Unfollow; one-time tip | You | social journey |
| B9 | My Split: three faces, Connection Goals, Connection Points history, simulated labels, no percentages | You | progression, rewards, stakeholder journeys |
| B10 | Your insights: Reach, Connection, Earnings (simulated) | You | creator journey |
| B11 | Welcome again from Profile, Settings, How Splitpost works | You | unit tests |
| B12 | Control Center: review queue, Routine or Flagged, manual approval with a reason, Activation | You (laptop) | founder journey |
| B13 | Deletion preview: balances closed, the pilot rule explained | You (don't send unless you mean to) | privacy journey; behaviour test 310 |
| B14 | Defects sent through Feedback | You report; Claude classifies them in section H and fixes P0 and P1 at once | |

## C. Quality checks (automated, except C6 and C7)

| # | Item | Who | Status |
|---|---|---|---|
| C1 | Unit tests (901), types, build and secret scan | Claude | **Done**, green on `d6d4e53` (same files as `6023da7`) |
| C2 | Database migrations, separation and reconciliation checks in CI | Claude | **Done**, green on `d6d4e53` (same files as `6023da7`) |
| C3 | Browser journeys on local Supabase, including WCAG 2.2 AA checks | Claude | **Done**, green on `d6d4e53` (same files as `6023da7`) |
| C4 | Public site checks and the production-address launch rehearsal | Claude | **Done**, green on `d6d4e53` (same files as `6023da7`) |
| C5 | Emulated phone speed (Slow 4G) | Claude | **Done** (sign-in 2.1 s; landing 1.24 s) |
| C6 | Real-device speed check on your phone | You | To do during B |
| C7 | Reduced motion on a real phone | You | To do during B1 |

## D. Operational readiness (automated, with founder authorizations)

| # | Item | Who | Status |
|---|---|---|---|
| D1 | Video device tests on two phones, then video posts on staging | You (tests); Claude (switch evidence) | In progress (you) |
| D2 | Staging recovery exercise | You give written authorization for the in-place restore; Claude runs it | Waiting for authorization |
| D3 | PB-1 member Production operations (SMTP, drain key, health checks, ledger) | You approve; Claude prepares and runs | Prepared, waiting for approval |
| D4 | Backups and restore drill in CI | Claude | **Done** (every CI run) |
| D5 | Security and authorization review fixes | Claude | **Done** (migration 20261214, on staging) |
| D6 | Public site in production reflects the merged landing page and verified photos | Claude | **Done** (www.splitpost.ca serves `6023da7`; all five replacement photos match byte for byte) |

## E. Legal (external validation, before the gates they protect)

| # | Item | Who | Before |
|---|---|---|---|
| E1 | Rewards Rules review | You (counsel) | Any allocation percentages shown to members |
| E2 | Pilot privacy notice and policies (`docs/policies/`) | You (counsel) | External invitations |
| E3 | Regulated financial products review | You (counsel) | Real financial functionality (deferred) |

## F. Production release (each needs its own authorization)

| # | Item | Who | Planned |
|---|---|---|---|
| F1 | PB-2 migrations and functions to member Production (`docs/PB-2-RUNBOOK.md`) | You authorize; Claude prepares and reads results | Dec 16 at the latest; ready to run on authorization |
| F2 | PB-3 release candidate fixes | Claude; you accept | Dec 20 |
| F3 | PB-4 external pilot access and the cohort plan | You authorize | Dec 23 at the latest |

**Ready to release** means: sections A to D complete, no open P0 or P1, every
open P2 either fixed or accepted by you for the pilot, the legal items for
the chosen gate done, and your authorization for that gate. If that happens
before a planned date, the step moves earlier.

## G. External business validation

| # | Item | Who | When |
|---|---|---|---|
| G1 | Prospective members' response to the landing page (the trigger for revisiting its frozen messaging and design) | You (conversations, waitlist) | From publication |
| G2 | Pilot cohort feedback on the member journey | Pilot members, through Feedback | After PB-4 |

## H. Findings during acceptance

Every finding gets a severity and a next step. Claude resolves P0 and P1
immediately within the authorized scope (no new features, no scope change,
no gate bypassed); P2 is ordered by its effect on the pilot experience; P3
goes to the post-launch backlog.

| Severity | Meaning | Handling |
|---|---|---|
| **P0** | Critical security, privacy, financial integrity or data loss issue | Fixed immediately; you are told at once |
| **P1** | A core stakeholder journey is broken or cannot be completed | Fixed immediately |
| **P2** | Significant usability, clarity or performance issue | Prioritized by pilot impact; fixed or accepted by you before release |
| **P3** | Minor cosmetic issue or future enhancement | Post-launch backlog |

**Open findings**

| ID | Severity | Found in | Finding | Status |
|---|---|---|---|---|
| | | | None yet | |

**Post-launch backlog (P3 and deferred items)**

| ID | Item | Source |
|---|---|---|
| BL-1 | Weighted Connection Score, leaderboards, rankings, advanced achievements | Deferred by the founder, Nov 26 (F1) |
| BL-2 | Interactive advertising as a controlled experiment | Approved in principle, after launch (F4) |

Production activation, external pilot access and real financial transactions
remain unauthorized until their gates are approved. The landing page
(SP-BRAND-002) is complete and frozen until meaningful market feedback.
