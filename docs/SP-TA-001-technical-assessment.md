# SP-TA-001 v2: Splitpost MVP Technical Baseline and Delivery Plan

| | |
|---|---|
| Version | 2.1, November 24, 2026 (2.1 adds the visual design effort from SP-DESIGN-002). Supersedes v1.0 (preserved privately; not in this repository) |
| Approved scope | SP-SCOPE-001 v1.0 and the seven engine baselines |
| Founder decisions | Founder response to SP-TA-001, November 24, 2026 (D1 to D7 and the product experience addendum) |
| Commit assessed | `27b323a` on `main` |
| External release target | **Wednesday, December 23, 2026** (controlled, adult-only pilot) |
| Authorization status | Planning complete. Implementation awaits one consolidated authorization of Implementation Package 1 (section 10) |

**This repository is public.** This version is sanitized. Infrastructure identifiers, run identifiers, and personal and company contact details are replaced by labels such as *Staging*, *Member Production* and evidence labels *E-01* to *E-11*. The labels resolve in a private evidence index held by the founder.

Single sources of truth:

| What | Where |
|---|---|
| Requirements matrix (data) | `docs/sp-ta-001/matrix.psv` |
| Counts, effort totals and the full matrix table (generated, never hand-edited) | `docs/sp-ta-001/coverage.md`, produced by `node docs/sp-ta-001/coverage.mjs` |
| Engine-to-scope traceability | `docs/sp-ta-001/traceability.md` |
| Video feasibility and experiments | `docs/video/VIDEO-FEASIBILITY.md` |
| Product experience proposal and visual previews | `docs/design/SP-DESIGN-001.md`, `docs/design/previews/` |
| Policy drafts and legal questions | `docs/policies/` |

---

## 1. Executive summary

**How much of the approved MVP exists?** The authoritative matrix has **135 requirements**: the 109 numbered SP-SCOPE-001 requirements, 13 WP-10 release items (assessment IDs REL-01 to REL-13), and 13 requirements added by the traceability review because engine requirements had no consolidated ID (marked *TA-added*). Of these, **24 are verified complete (18%)**, 2 are implemented but unverified, 1 is built but blocked from switching on, **52 are partial (39%)**, 3 conflict with the approved scope and **53 are missing (39%)**.

**How much is verified, and how?** 71 requirements are verified by tests I ran locally, 74 by CI on `main`, and 29 are present in a deployed environment according to deployment records. Only 3 were tested directly in a deployed environment (the public website and the published waitlist notice). **Nothing in the member application was tested directly in Member Production**: it is not reachable from the assessment environment and only the founder's account exists there. "Verified complete" here means source, local tests, CI and a deployment record. It does not mean directly tested in Production.

**What can we reuse?** The whole technology stack; accounts, sign-in and recovery; profiles and pictures; interests; following and Clique history; the chronological feed and catch-up; likes and comments; photo publishing; moderation with audit; the feedback inbox; pilot membership and the launch gate; locked schemas already reserved for simulated economics, Support Intent and analytics; and a strong test and deployment safety net. 29 requirements are classified Reuse.

**What must we refactor or build?** 44 Refactor and 61 Build. The economic, advertising and intelligence engines (WP-05, WP-06, WP-07: 42 requirements) have no complete requirement. New since v1: five-minute video, post editing, the multi-face navigation and design system, mute, Active Supporter, and pre-release settlement and advertiser reporting.

**What conflicts?** The 25-member Clique cap, the Clique navigation slot, and the creator-specific points model shown in the public `/tour` prototype. Retiring these, and the superseded sections of `docs/PRODUCT-STRATEGY.md`, is recorded as a secondary action on the rows that replace them.

**Remaining effort:** **477 hours most likely** (337 optimistic, 767 pessimistic) of implementation, including unit, database and component tests and the WP-10 release tasks. This is higher than v1 (368) because of the founder's additions (about 87 hours: five-minute video with in-browser conversion, editing, multi-face navigation, design system, immersive visual design, website evolution) and the 13 TA-added requirements.

**Can we deliver the complete MVP by December 23?** **Yes at the observed delivery rate; at the planning rate there is no slack.** Planning capacity (three streams, section 7) gives about 420 plannable hours after protecting a 22% reserve. Most-likely demand is 477. The repository's actual throughput from November 16 to 22 (60 merged pull requests in seven days, including six database-backed features) is roughly 40% above the planning rate, which would cover the gap. I am not attaching a probability. Instead the plan has measurable checkpoints (November 29, December 7, December 14) with pre-agreed contingency actions.

**Biggest blockers:**
* External legal review of the policies. External participants stay closed until it's done.
* Transactional email for registration and recovery.
* Member Production operational gaps: photo cleanup, monitoring, health checks.
* The iPhone device test for video.
* How quickly production batches can be approved over the holidays.

**Decisions needed:** eleven, consolidated in sections 3 and 6, most with a recommended default. Seven are needed by December 3.

**First implementation package:** IP-1, Foundation and operational readiness (section 10). It covers registration through controlled links, 18+ eligibility, five-destination navigation with the multi-face component, one event framework, the Home paging fix, email, and the operational repairs. **64 hours most likely**, November 25 to 29.

---

## 2. Reconciled requirements coverage

Generated from the matrix. `coverage.md` has the full 135-row table, with evidence, action, engine references, hours and release-blocking flag for every row.

| WP | Reqs | VC | IU | PI | CF | MI | BL | Reuse | Refactor | Build | Verify | Blocking |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| WP-01 Foundation | 11 | 7 | 1 | 2 | 1 | 0 | 0 | 7 | 2 | 1 | 1 | 10 |
| WP-02 Discovery | 13 | 4 | 0 | 7 | 0 | 2 | 0 | 4 | 7 | 2 | 0 | 10 |
| WP-03 Relationships and Home | 13 | 2 | 0 | 8 | 1 | 2 | 0 | 2 | 7 | 4 | 0 | 13 |
| WP-04 Publishing | 15 | 4 | 0 | 4 | 0 | 6 | 1 | 5 | 4 | 6 | 0 | 15 |
| WP-05 Rewards | 12 | 0 | 0 | 1 | 1 | 10 | 0 | 0 | 1 | 11 | 0 | 12 |
| WP-06 Advertising | 15 | 0 | 0 | 1 | 0 | 14 | 0 | 0 | 1 | 14 | 0 | 15 |
| WP-07 Intelligence | 15 | 0 | 0 | 4 | 0 | 11 | 0 | 0 | 2 | 13 | 0 | 14 |
| WP-08 Governance | 18 | 1 | 0 | 12 | 0 | 5 | 0 | 2 | 10 | 6 | 0 | 17 |
| WP-09 Brand | 10 | 2 | 0 | 6 | 0 | 2 | 0 | 2 | 6 | 2 | 0 | 10 |
| WP-10 Release | 13 | 4 | 1 | 7 | 0 | 1 | 0 | 7 | 4 | 2 | 0 | 13 |
| **Total** | **135** | **24** | **2** | **52** | **3** | **53** | **1** | **29** | **44** | **61** | **1** | **129** |

Rules applied: one primary status and one primary classification per requirement. Secondary actions (for example *retire the 25-member cap*) are written into the action text. No row has Retire or Defer as its primary classification: nothing is deferred, and every retirement is part of a refactor or build.

### 2.1 Changes from v1

| Change | Effect |
|---|---|
| Count discrepancy in the v1 executive summary | Removed: all counts now come from `coverage.mjs`. v1's corrected figures (122 rows: 24 VC, 2 IU, 40 PI, 3 CF, 52 MI, 1 BL) are reproduced exactly when the 13 TA-added rows are excluded |
| Traceability | 104 engine requirements checked: 69 fully represented, 28 partly, 7 not represented. The 7, plus the material partial items, became 13 TA-added rows: DSC-11 safety filtering, DSC-12 Home and Discover separation, DSC-13 Discover empty states, CON-11 audience counts, CON-12 relationship controls including mute, CON-13 relationship integrity, CNT-15 content integrity, ADV-15 advertising integrity, INT-C14 intelligence privacy, INT-C15 sustainable creator income, GOV-C16 Constitution and stakeholder charter, GOV-C17 community standards, GOV-C18 pilot policies and legal readiness. The remaining partial items attach to existing IDs (traceability section 2) |
| Relationship stages (CON-03) | Corrected to Following, Clique Connection, Active Supporter. Discovery is recorded as a journey source on follows, not a stage |
| Content management (CNT-12) | Editing restored: now Partial, not Verified complete |
| Content categorization (DSC-04, DSC-05) | Uncategorized posts reach followers through Home but are **not** eligible for relevant discovery. Creators need primary topics to be eligible for creator discovery |
| Advertiser reporting (ADV-12) | A reproducible aggregate report is available from the first day of a campaign |
| Settlement (RWD-09) | Implemented and reconciled before release, even though the first real month-end close is December 31 |
| Deferrals | v1 Scenario C moved 8 requirements (CNT-04, RWD-09, ADV-12, INT-C05, INT-C09, INT-C10, INT-C11, GOV-C15) plus video ad creatives. **All 8 are now in the December 23 release** |
| Effort | One set of estimates (section 7). v1's inconsistency between 350 and 368 hours is gone |

### 2.2 Interpretation conflicts found and resolved

| Conflict | Resolution in this baseline |
|---|---|
| Consolidated CON, CNT, RWD and ADV IDs reuse engine ID names with different meanings | The matrix uses consolidated IDs; the engine reference column names engine IDs explicitly |
| "Reactions" in the scope versus "likes" in the engine | Likes only (no new reaction types) |
| The consolidated qualified-referral wording omits the follow requirement | The engine rule applies: the new member must intentionally follow the referred creator |
| Ad skips dropped from consolidated tracking | Restored in ADV-10 where a skip control exists |
| Retention measured for members only | INT-C09 measures both member and relationship retention |
| "Staging" missing from data classification | Added as a class in INT-C12 |
| Illustrative values in the planning conversation (3,000 CP referrals, redeemable reposts) | Superseded by the founder's point table (section 6) |

---

## 3. Founder decision register

### 3.1 Confirmed on November 24

| # | Decision | Recorded as |
|---|---|---|
| D1 | 30-day delivery; December 23 external release; December 7 internal demonstration; no requirement removed or deferred past release | Schedule in section 5 |
| D2 | Controlled self-registration through valid invitation and referral links; no unrestricted public registration; limits configurable without deployment; launch gate preserved | FND-01, BRD-07, RWD-03, RWD-04 |
| D3 | Video: H.264 MP4, five minutes, up to 720p, configurable quotas, no paid transcoding without justification | CNT-04; feasibility in `docs/video/VIDEO-FEASIBILITY.md` |
| D4 | Policies drafted for qualified Canadian legal review; external access closed until the applicable readiness items are met | GOV-C16 to C18; `docs/policies/` |
| D5 | Vercel Pro and a transactional email sender approved in principle, subject to confirmed cost | Section 8 |
| D6 | Economic model preserved; initial point table adopted as configurable rules | RWD rows; section 6 |
| D7 | Work-package authorization with risk-based change control; production remains founder-approved | Section 10 operating rules |
| UX | Five destinations, multi-face navigation, design system, website evolution | FND-08, BRD-09; `docs/design/SP-DESIGN-001.md` |

### 3.2 Decisions still needed

| # | Decision | Recommendation | Needed by | Blocks |
|---|---|---|---|---|
| N1 | Approve IP-1 (section 10) | Approve | Nov 25 | All work |
| N2 | Functional design approved in direction (Nov 24). Final visual design: approve SP-DESIGN-002 | Approve | Dec 1 | Visual polish only; IP-1 navigation proceeds on the approved structure |
| N3 | Registration limit defaults (section 6.3) | Approve the defaults | Nov 27 | FND-01 |
| N4 | Make the repository private | Yes: planning, infrastructure and runbook documents are visible to anyone | Nov 25 | Nothing technical; risk reduction |
| N5 | Confirm subscriptions after checking prices (section 8): Vercel Pro, Resend free tier | Approve | Nov 27 | Email, commercial hosting |
| N6 | Video approach B: in-browser conversion with one open-source library (mediabunny, MPL-2.0), and the video parameters in SP-VID-001 section 8 | Approve, subject to the device test | Dec 1 (after the device test, Nov 30 to Dec 1) | CNT-04 |
| N7 | Remaining economic parameters (section 6.1) | Approve | Dec 3 | WP-05 rules |
| N8 | Metric definitions: qualifying activity thresholds, Active Supporter, activation (section 6.2) | Approve | Dec 3 | WP-07, CON-03 |
| N9 | Sustainable creator income threshold (section 6.4) | Report against two thresholds | Dec 10 | INT-C15 only |
| N10 | Holiday release plan and first cohort (section 5.3) | Small first cohort on Dec 23; wider onboarding from Jan 4 | Dec 14 | Pilot operations |
| N11 | Legal review engagement and turnaround | Engage counsel by Nov 28; ask for comments by Dec 16 | Nov 28 | External release |

---

## 4. Current baseline (sanitized)

| Item | State | Evidence |
|---|---|---|
| Code | `main` at `27b323a`, 206 commits, 104 merged PRs; React 19, TypeScript, Vite and Tailwind on Vercel; Supabase Postgres, Auth, Storage and Edge Functions | Repository |
| Local verification (Nov 24) | Typecheck passes; 739 unit tests pass (3 skipped); 290 guard tests pass (1 skipped); the production build passes; 18 migrations and 53 database suites pass on a throwaway PostgreSQL 16 | Local run |
| CI | Green on `main` | E-01 |
| Staging | 17 of 18 migrations (the launch-gate migration is missing); avatar and post-media functions verified | E-02, E-05, E-06 |
| Member Production | 18 migrations; launch gate on; external access closed; one confirmed identity; photos off; avatar and post-media verified; photo cleanup schedule refused (missing secret) | E-03, E-05 to E-07 |
| Waitlist Production | Waitlist and acquisition migrations only, by design | E-04 |
| Public website | Live, not indexed; `/tour` publicly reachable | E-08 (direct test) |
| Member app host | Deployment recorded; not reachable from the assessment environment | E-09 |
| Repository | Public | E-11 |

**Known defects** (unchanged from v1 unless noted):

| ID | Defect | Status |
|---|---|---|
| DEF-01 | Home paging can skip a post with an identical timestamp at a page boundary | Fixed in IP-1 |
| DEF-02 | Production photo cleanup not scheduled | IP-1 |
| DEF-03 | First request after a function deploy returns 503/504 | Open |
| DEF-04 | Staging behind Production | IP-1 |
| DEF-05 | Deployment records lag reality | IP-1 |
| DEF-06 | Health checks disabled; no alerting | IP-1 |
| DEF-07 | Report data purge not scheduled | Open |
| DEF-08 | 900 KB main bundle | Covered by the performance criteria in section 9 |
| DEF-09 | Flaky Clique test | Open |
| DEF-10 | HEIC photos may not open on Android | Open |
| New | **HEVC video fails silently in Chromium**: audio plays, the picture stays blank, no error event. Upload checks must not rely on browser errors | Handled in CNT-04 |

---

## 5. Revised 30-day schedule

### 5.1 Milestones and exit criteria

| Date | Milestone | Measurable exit criteria |
|---|---|---|
| Wed Nov 25 | Baseline and backlog approved | N1, N2 and N4 decided; IP-1 started |
| Sun Nov 29 | **Platform foundation and operational readiness** (IP-1) | IP-1 acceptance criteria met on Staging; staging and Production schemas aligned; email delivers in under 2 minutes; health checks run; at least 60 task hours complete |
| Tue Dec 1 | Video device test complete | Results recorded for the SP-VID-001 device matrix; N6 decided |
| Thu Dec 3 | Economic and metric parameters approved | N7 and N8 decided |
| Mon Dec 7 | **Internal integrated demonstration** | On Staging, the creator and consumer journeys work end to end: register, discover, follow, Clique, Clique-first Home, publish text, photo and video, engage, repost, share, public preview. Control Center shell, blocking and reporting work. At least 50% of task hours (about 240) complete |
| Mon Dec 14 | **Feature complete** | Every Build and Refactor row implemented with its tests on Staging; at least 90% of task hours complete; feature freeze |
| Wed Dec 16 | Production batch PB-2 approved and applied | All migrations and functions on Member Production, with founder approval; external access still closed |
| Fri Dec 18 | **Integration and journey verification** | The four stakeholder journeys pass on Staging, and on Production with test-class accounts; financial reconciliation exact; security review complete; zero open critical defects |
| Mon Dec 21 | **Release candidate and acceptance complete** | Section 9 checklist passes; founder acceptance test done; usability sessions done; legal comments incorporated |
| Tue Dec 22 | Founder go/no-go | Signed decision |
| Wed Dec 23 | **Controlled external release** | Founder opens external access for the first cohort (PB-4) |

### 5.2 Build sequence and streams

Three streams and one coordinated migration sequence: each batch owns one migration, versioned after `20261129000000`.

| Dates | Stream A (social and content) | Stream B (economics, ads, governance) | Stream C (front end only, no migrations) |
|---|---|---|---|
| Nov 25 to 29 | IP-1: registration, 18+, events, feed fix, migration M1 | IP-1: operations repairs, email, monitoring, records | IP-1: navigation and multi-face component; design tokens |
| Nov 30 to Dec 4 | IP-2 Home faces, unlimited Clique, Active Supporter, mute, counts (M2) | IP-3 Control Center shell, blocking, comment reports, enforcement, appeals (M3) | Video device test page; empty, loading and error states |
| Dec 2 to 9 | IP-4 categories, saves, reposts, share links, previews, editing, discovery (M4) | IP-6 ledger, rules, referrals, review queue (M5, after N7) | IP-5 video client: conversion, resumable upload, player |
| Dec 7 | Internal demonstration | | |
| Dec 8 to 14 | IP-5 video server side and quotas (M6); IP-8 metrics, North Star, activation, cohorts (M7) | IP-7 campaigns, creatives, placements, measurement, reports, Support Intent (M8); fan pool, valuation, settlement | My Split faces, Profile insight faces, website evolution, disclosures |
| Dec 14 | Feature complete | | |
| Dec 15 to 18 | Integration, journeys, defects | Reconciliation suite, security review, Production batch PB-2 (Dec 16) | Usability sessions, accessibility pass, performance budget |
| Dec 19 to 21 | Release candidate fixes (PB-3) | Release candidate fixes | Screenshots for the website |

### 5.3 Holiday operations

December 23 is the Wednesday before the Christmas period. Participants will be less active, and the founder has less time for approvals and moderation.

Recommendation (N10):
* Release on December 23 to a first cohort of up to 50 adults the founder knows personally: creators recruited in advance, their invited members, and two or three advertisers.
* Keep referral registration limits low.
* Run wider onboarding waves from Monday, January 4.

Cover needed from December 23 to January 3:
* The founder or a designated moderator checks the Control Center queues once a day.
* A same-day founder approval path for critical production fixes.
* Pause switches for registration, points, ads and video, all tested before release.

---

## 6. Parameters requiring approval

### 6.1 Economic and reward parameters (N7)

Point awards follow the founder's approved table. These remaining rules make them objective and testable:

| Parameter | Proposed rule |
|---|---|
| Meaningful comment (2 CP, not redeemable) | On someone else's live post; at least 20 characters and at least 4 different words after trimming; no links; not a near-copy (same normalized text) of any of the member's previous 20 comments; only the first meaningful comment per member per post earns; reversed if the comment is deleted or hidden within 7 days |
| Save (2 CP, not redeemable) | First save per member per post, on someone else's post; unsaving and saving again never re-awards; reversed if unsaved within 24 hours |
| Meaningful video completion (3 CP, not redeemable) | Video of at least 30 seconds; at least 90% of its duration actually played (seeking forward does not count); once per member per video; someone else's video |
| Internal repost (5 CP, not redeemable) | First repost per member per post, on someone else's post; reversed if the repost is deleted within 24 hours |
| External share (5 CP, not redeemable) | Awarded only when the member's share link records its first visit from a distinct signed-out visitor (not the member's own session) within 7 days; one award per member per post. Pressing the share button earns nothing and is recorded only as *share initiated* |
| Share pipeline states | Share initiated (0 CP) → attributable link visit (5 CP once, as above) → qualified referral (100 CP, redemption eligible) |
| Qualified referral (100 CP, redemption eligible, simulated) | All of: a new account registered through the member's link within 7 days of the first link visit; email verified; 18+ attested; intentionally follows the referred creator within 7 days of registering; not the referrer, not an existing or previously deleted account (normalized email), not a disposable email domain. The first eligible referral link visited in that browser wins (first touch). Splitpost never follows anyone automatically |
| Repeat activity | One award per member, action and post; undo and redo never re-awards; own content never earns |
| Daily limit (non-referral) | 40 CP per member per day |
| Referral limits | 3 qualified referrals per referrer per day and 15 per month; more than 3 in 24 hours goes to manual review |
| Monthly issuance budget (redeemable) | 10,000 CP (100 qualified referrals) for the pilot. Beyond that, referrals still qualify and are queued for founder review rather than silently dropped |
| Eligible net revenue | Agreed campaign price for content-associated placements, recognised in proportion to delivered impressions, minus refunds, credits and direct third-party costs; recorded as simulated settlement during the pilot |
| Allocation | 40% creator, 20% fan pool, 40% Splitpost of eligible net content-associated revenue; 100% of general feed revenue to Splitpost (approved) |
| Settlement | Calendar month, America/Toronto; close on the 1st for the previous month; unallocated pool carries forward; every run reconciles to the cent or is rejected |
| Valuation | Simulated pool balance divided by outstanding redeemable points, shown to two decimals with the word *estimate*; recalculated daily |
| Ad frequency | 1 general-feed ad per 8 posts; at most 6 ad impressions per member per day; the same campaign at most 3 times a day |
| Rule changes | A new rule version applies prospectively from its effective time; at least 14 days' notice for changes that reduce awards |

### 6.2 Metric definitions (N8)

| Metric | Proposed definition |
|---|---|
| Qualifying meaningful consumption | Text post: the member opens the post page, or it is 50% visible for at least 8 seconds. Photo post: 50% visible for at least 5 seconds, or opened. Video: at least 50% played, or 60 seconds, whichever comes first. A two-second view, like, impression, app open, follow or Clique join never qualifies |
| Qualifying meaningful activity | Qualifying consumption, a meaningful comment, a save, a repost, an attributable external share visit, or a qualified referral |
| Weekly Active Creator-Consumer Connections (North Star) | Unique (consumer, creator) pairs where the consumer follows the creator at the time of the activity and performs at least one qualifying meaningful activity on that creator's content during the Monday to Sunday week (America/Toronto). Each pair counts once per week. Excludes self pairs, blocked pairs, test and staging data, and reversed or fraudulent activity. The founder's genuine activity is counted, with a founder-dependent breakdown reported alongside |
| Active Supporter (relationship stage 3) | A follower with at least one qualifying meaningful activity on the creator's content in the last 28 days |
| Consumer activation | Within 7 days of registering: follows at least one creator and performs at least one qualifying meaningful activity |
| Creator activation | Within 14 days of registering: publishes at least one categorized post and gains at least one follower who is not their referrer |
| Distribution coverage versus reach | Coverage: the share of a creator's eligible posts reachable in every follower's Home (target 100%). Reach: the share of followers with qualifying consumption within 7 days. Always reported separately |

### 6.3 Registration limits (N3)

All are database settings the founder can change from the Control Center without a deployment, and every change is audited:
* Overall pilot cap: 200 members.
* New registrations: 25 per day.
* Registrations per referring member: 5 per day.
* A founder switch pauses registration, independently of the external access gate.
* When registration is paused or full, people go to the waitlist.

### 6.4 Sustainable creator income (N9)

* **Actual income only.** The metric reads actual net creator income, which is zero during the pilot because nothing is paid out. Simulated earnings and Support Intent are never included.
* **Eligible creators:** active creators, meaning at least 4 posts in the month and at least one Active Supporter. Monetization-eligible creators are reported separately once payouts exist.
* **When a creator meets the objective:** actual net income (after platform and payment costs, before personal tax) is at or above the threshold in each of three consecutive months.
* **Recommendation:** report against two thresholds: the earlier recorded internal benchmark of US$5,000 a month, and a Canadian living-income benchmark the founder selects.
* The dictionary entry exists from release; the metric reads zero until real monetization is approved.

---

## 7. Effort and capacity

### 7.1 Effort by work package (hours; generated)

| WP | Optimistic | Most likely | Pessimistic | Founder hours | External dependency |
|---|---|---|---|---|---|
| WP-01 | 27 | 36 | 54 | 3 | Email provider |
| WP-02 | 20 | 29 | 46 | 1 | |
| WP-03 | 25 | 36 | 54 | 2 | |
| WP-04 | 54 | 77 | 139 | 4 | Device test, video approach |
| WP-05 | 41 | 58 | 93 | 4 | Parameters |
| WP-06 | 32 | 46 | 74 | 4 | Real advertisers |
| WP-07 | 36 | 52 | 83 | 3 | Metric definitions |
| WP-08 | 37 | 53 | 80 | 6 | Legal review |
| WP-09 | 32 | 43 | 69 | 4 | Visual design approval |
| WP-10 | 33 | 47 | 75 | 12 | Usability participants |
| **Total** | **337** | **477** | **767** | **43** | |

Task hours include each feature's own unit, database and component tests. WP-10 holds the cross-journey end-to-end, security, usability and reconciliation tasks. Integration, defect resolution and contingency come out of the reserve below rather than being added to the tasks, so testing isn't counted twice.

### 7.2 Capacity model

| Assumption | Value |
|---|---|
| Streams | A and B at 10 productive hours a day; C (front end, no migrations) at 6 |
| Working days | 23 effective days between Nov 25 and Dec 21: 27 calendar days, less about 4 lost to CI outages, approval waits and founder unavailability |
| Gross | 26 hours a day × 23 = 598 hours |
| Overhead | 10% for CI waits (about 15 to 25 minutes a PR), rebases on the shared migration sequence and coordination: 538 hours net |
| Reserve | 22% for integration, defects, usability fixes, security findings and contingency: 118 hours |
| **Plannable** | **about 420 hours** |
| Most-likely demand | 477 hours: a gap of about 57 hours, roughly 13% |
| Observed rate | Nov 16 to 22: 60 merged PRs, about 74,000 lines added including tests, and six database-backed features with functions and deploy tooling. The plan assumes about 70% of that rate |

Founder time: about 43 hours over the period (approvals, device tests, acceptance), roughly 1.5 to 2 hours a day. Expect heavier days on Dec 1, Dec 16, Dec 21 and Dec 22.

### 7.3 Checkpoints and contingency (replacing probabilities)

| Checkpoint | Green | Amber action | Red action (founder decision) |
|---|---|---|---|
| Nov 29 | 60 or more task hours done; IP-1 accepted | Move Stream C hours onto Stream A tasks | Revisit the sequencing of WP-09 polish |
| Dec 7 | 240 or more task hours done | Use up to half the reserve early | Choose one: add a fourth stream for isolated front-end work; move the external release to Mon Jan 4 (which also avoids the holidays); or release on Dec 23 to the founder-known cohort while non-blocking rows finish by Jan 4. No requirement is removed |
| Dec 14 | 430 or more task hours done; no Build row unstarted | Freeze polish and protect the integration days | Same options as Dec 7 |

---

## 8. Costs (USD, list prices; confirm before purchase)

Sources: Supabase's pricing and documentation pages, read on Nov 24. The Vercel, Resend, Cloudflare and Mux figures come from search excerpts of vendor pages that couldn't be opened from the assessment environment. Treat them as unconfirmed until the founder checks the live pages.

| Item | Price | Existing | Incremental | Notes |
|---|---|---|---|---|
| Supabase Pro | $25/month per organisation, including a $10 compute credit | Yes (Pro organisation) | $0 | Each project adds compute: Micro $10, Small $15, Medium $60. Three Micro projects come to about $45/month before usage. Whether Staging is in the Pro organisation isn't recorded; confirm |
| Supabase usage | Egress: 250 GB uncached included, then $0.09/GB (cached $0.03/GB). Storage: 100 GB, then $0.0213/GB. 100,000 MAU included | Included | Usage-based | Spend cap is on by default for usage (not compute) |
| Vercel Pro | $20/month per deploying seat, including a $20 usage credit; a default $200 on-demand budget with alerts; optional pause of production deployments when the budget is reached | Hobby (non-commercial use only) | **$20/month** | Required for commercial use. Unconfirmed figures |
| Email: Resend | Free: 3,000 emails/month, 100/day, 1 domain. Pro: $20/month for 50,000 emails | None | **$0** initially | Supabase's default sender only reaches team members, at 2 emails an hour, so custom SMTP is required. Upgrade only if launch-day invitations exceed 100 a day |
| Video transcoding | Not needed for Option B | None | $0 | Contingency only: Cloudflare Stream is about $5 per 1,000 minutes stored and $1 per 1,000 delivered |
| Taxes | Foreign digital vendors may charge 13% HST to Ontario customers | | | Give vendors the business GST/HST number; input tax credit treatment needs the accountant |

Monthly operating estimate (720p video, 30 video-minutes watched per active member per month):

| Active members | Supabase base and compute | Media egress | Vercel | Email | **Total** |
|---|---|---|---|---|---|
| 100 | $45 | $0 | $20 | $0 | **about $65 + tax** |
| 1,000 | $50 | about $30 | $20 | $0 to $20 | **about $100 to $120** |
| 10,000 | about $105 | about $490 | $20 to $40 | $20 | **about $640 to $660** |

Cost monitoring:
* Supabase spend cap on.
* Egress alerts at 50% and 80% of the included 250 GB.
* Vercel budget alert at $50.
* A weekly cost line in the founder dashboard.

A pilot of 50 to 200 members fits within the included allowances.

---

## 9. First-impression quality acceptance criteria

| Area | Measurable criterion | How measured |
|---|---|---|
| Coherence | Every screen uses the design tokens and the shared card, button, state and financial-card components; every screen has empty, loading and error states | Component checklist in review; visual review of all screens |
| Navigation | Five destinations; every face reachable by tap, swipe and keyboard; the URL restores the face | Component and E2E tests |
| Onboarding | 4 of 5 test participants register through a link, attest 18+, pick interests and follow a creator without help, in under 4 minutes | Moderated usability sessions (5 participants: 3 members, 2 creators) |
| Comprehension | 4 of 5 participants correctly explain that rewards are simulated, and the difference between recognized and redemption-eligible points | Usability session questions |
| Performance (mid-range Android phone, throttled 4G) | Member app first load: Largest Contentful Paint 3.0 s or less; JavaScript on first load 300 KB gzipped or less (the video conversion library loads only when a video is chosen); interaction responsiveness (INP) 200 ms or less | Lighthouse mobile profile on Staging; bundle report |
| Server responsiveness | Home, Discover and My Split data calls: 95th percentile of 800 ms or less with 200 members of seeded data | Load script on Staging |
| Media | Upload success of 95% or more across the device matrix; video starts within 3 s on 4G; photo and video playback works on all supported browsers | Device test log |
| Accessibility | axe: zero serious or critical issues; all journeys completable by keyboard alone; contrast meets WCAG 2.2 AA; reduced motion honoured; VoiceOver and TalkBack pass on core screens | Automated and manual |
| Recovery | Password reset email arrives within 2 minutes in 95% of 20 tests; reset completes on a phone | Staging and Production test |
| Disclosures | Every amount carries Simulated, Non-binding or Actual; sponsored content is always labelled | Copy test plus visual review |
| Stability | Zero console errors and zero CSP violations on journeys; no critical or high defects open | E2E output; defect log |

---

## 10. Implementation Package 1: Foundation and operational readiness

**Requested authorization:**
* WP-01 in full.
* INT-C01 and INT-C12 (events).
* CON-08 (the Home paging defect).
* RWD-03, limited to link codes and attribution capture (no points).
* GOV-C13 and REL-11 (monitoring and recovery).
* The video device test page.
* Staging deployments under the conditional staging authorization.

Production batch PB-1 is listed separately for explicit approval.

### 10.1 Scope

| Item | Requirements | Hours (most likely) |
|---|---|---|
| Controlled link registration: invitation and referral link codes; server-enforced eligibility (valid link, limits, pause, launch gate); email verification; first-touch attribution record; no auto-follow. Reuses draft PR #96 and the existing acquisition tables | FND-01, RWD-03 (capture only) | 14 |
| 18+ attestation recorded at registration; every member function refuses without it | FND-07 | 5 |
| Custom SMTP on Staging; recovery and verification emails tested | FND-03 | 3 |
| Five-destination navigation (My Split placeholder face; Clique management moved into Home) and the reusable multi-face component; value-proposition label | FND-08, FND-06 | 15 |
| Unified event framework: one events table written inside member functions, a small client endpoint for views, and a data class on every row (actual, founder-actual, simulated, test, staging) | INT-C01, INT-C12 | 12 |
| Home paging defect: keyset paging on (created_at, id) for the feed and member posts; new function versions, with the old ones kept for compatibility | CON-08 | 4 |
| Staging aligned with Production (apply the launch-gate migration on Staging) | FND-11 | 1 |
| Operational repairs, monitoring and restore drill (section 10.4) | GOV-C13, REL-11 | 7 |
| Video device test page on Staging (an experiment, not a feature; hours taken from CNT-04) | CNT-04 spike | 3 |
| **Total** | | **64 (optimistic 48, pessimistic 96)** |

The ten implementation packages in section 11 sum exactly to the 477-hour matrix total.

### 10.2 Migration

One migration, `M1 foundation_v2`, versioned after `20261129000000`. It adds:
* `ops.registration_settings` (caps, daily limit, per-referrer limit, paused) and `ops.registration_links` (code; kind, invitation or referral; owner; creator; expiry; revoked), with audited setter functions.
* `ops.age_attestations` (member, attested_at, version of the wording).
* `ops.referral_attributions` (new member, link, first visit time, registration time; no points).
* `analytics.events` (name, actor, creator, post, source, class, occurred_at, idempotency key), with indexes.
* Keyset versions of `app_feed` and `app_member_posts`.
* An updated member-surface audit allow-list for the new functions.

It ships with a checksum entry, a staging-only rollback script that refuses once member data exists, local tests and violation tests.

M1 reaches Production in batch PB-2 (Dec 16), unless the founder wants it in PB-1.

### 10.3 Acceptance criteria and tests

| # | Criterion | Test |
|---|---|---|
| 1 | A person with a valid link can register, verify their email, attest 18+ and reach Home. Without a valid link, or when registration is paused or full, they reach the waitlist | DB tests for every refusal reason; E2E registration journey |
| 2 | Limits and the pause switch change from settings without a deployment, and every change is audited | DB test; audit row assertion |
| 3 | No member function works for an account without an 18+ attestation | DB test across the full function allow-list |
| 4 | The referral attribution record is created on first touch and never creates a follow | DB test; E2E asserts the follow count is unchanged |
| 5 | Verification and reset emails arrive on Staging within 2 minutes (20 trials) | Manual log |
| 6 | Navigation shows Home, Discover, Create, My Split and Profile at 320 to 1440 px; faces work by swipe, tap and keyboard; reduced motion is respected; old Clique links redirect | Component tests; E2E with touch emulation; axe |
| 7 | Every follow, unfollow, post, comment, like and view writes exactly one event with the correct class; test accounts are classed test | DB completeness test |
| 8 | 500 posts with duplicate timestamps are all reachable by paging Home | DB test |
| 9 | The staging check run shows 18 migrations plus M1; Production is unchanged | Workflow evidence |
| 10 | All existing suites still pass (unit, guard, database, E2E) | CI |

### 10.4 Operational repairs

| Repair | Who | Environment |
|---|---|---|
| Apply the launch-gate migration to Staging | Claude, via the staging workflow | Staging (authorized) |
| Record the post-media deployments in the function ledger and evidence log; bring stale docs up to date | Claude | Repository |
| Set up the Resend account and DNS for the sending domain (free tier) | Founder | External |
| Custom SMTP settings | Claude prepares; founder applies on Production | Staging, then PB-1 |
| Store the media drain secret and apply the photo cleanup schedule on Member Production | Founder runs the existing workflow | PB-1 |
| Enable the scheduled health checks; add a free uptime check for both hosts | Founder sets the repository variables | PB-1 |
| Restore drill on a disposable free-tier project | Claude with the founder | Disposable |

**Production batch PB-1** needs explicit approval and about 45 minutes of founder time. It applies the SMTP settings on Member Production, stores the media drain secret and installs the cleanup schedule, and sets the health-check variables. It makes no schema change and activates no feature, and external access stays closed.

### 10.5 Risks

| Risk | Mitigation |
|---|---|
| Registration opens a path around the launch gate | The gate is checked inside the same transaction; a violation test proves registration is refused while external access is closed |
| Email deliverability | SPF, DKIM and DMARC on a sending subdomain; test with several email providers |
| The navigation change breaks existing tests | Old routes redirect; tests are updated in the same PR |
| Event volume | Batching, as already done for views; indexes; a retention policy entry in the privacy draft |

### 10.6 Work that proceeds in parallel and independently

* Stream C front-end work (the multi-face component and tokens), which doesn't touch migrations.
* The video device test page (Staging preview) and the founder's device testing.
* Legal review of `docs/policies/` by counsel.
* Founder work: advertiser and creator recruitment, Resend and DNS setup, subscription confirmation, and decisions N3 to N11.

### 10.7 Operating rules for all packages (D7)

**Within an authorized package, without further approval:** code; migrations, prepared and tested locally; branches and PRs; CI; documentation; and non-destructive staging deployments. All existing target checks, checksums and evidence stay in place.

**Still needs founder approval:**
* Production migrations, deployments, configuration and feature activation.
* External access.
* Destructive operations.
* Security or data retention changes.
* New paid services.
* Changes to economic rules or to this baseline.

**Production batches:**

| Batch | Date | Contents |
|---|---|---|
| PB-1 | Nov 28 | Operational repairs (section 10.4) |
| PB-2 | Dec 16 | All migrations and functions |
| PB-3 | Dec 20 | Release-candidate fixes |
| PB-4 | Dec 23 | Open external access |

Proposed process improvement: the founder approves each package's migration checksums once, in the package PR, rather than in separate commits.

---

## 11. Work-package backlog and dependencies

Hours are summed from the matrix rows assigned to each package.

| Package | Scope | Rows | Hours (most likely) | Depends on | Exit evidence |
|---|---|---|---|---|---|
| IP-1 | Foundation and operations: WP-01, INT-C01, INT-C12, CON-08, RWD-03 (capture), GOV-C13, REL-11, video device page | 17 | 64 | N1 | Section 10.3 |
| IP-2 | Relationships and Home: WP-03 except CON-08 | 12 | 32 | IP-1 | Clique-first Home and faces, mute, counts, Active Supporter tests |
| IP-3 | Governance core: GOV-C01 to C06, C10, C14, C16 to C18 | 11 | 33 | IP-1 | Control Center, blocking, reporting, enforcement and appeals journeys |
| IP-4 | Content and discovery: WP-02 and WP-04 except CNT-04 | 27 | 66 | IP-1, IP-2 | Save, repost, share pipeline, preview, edit, discovery with reasons |
| IP-5 | Video posts: CNT-04 | 1 | 37 | IP-1, N6 | Device matrix passes |
| IP-6 | Contributions and rewards: WP-05 except RWD-03, plus GOV-C07, GOV-C08 | 13 | 61 | IP-4, N7 | Ledger equals balances; every referral rule tested; settlement reconciles |
| IP-7 | Advertising: WP-06 including video creatives, plus GOV-C09 | 16 | 48 | IP-3, IP-4 | Campaign journey; report from day one; separation tests |
| IP-8 | Intelligence: WP-07 except INT-C01 and C12 | 13 | 40 | IP-1, IP-6, IP-7, N8 | Dictionary views match fixtures; North Star; founder overview |
| IP-9 | Brand, acquisition and visual design: WP-09 | 10 | 43 | Visual design approval (SP-DESIGN-002), Dec 7 screenshots | Website paths, disclosures, `/tour` economy retired |
| IP-10 | Release: WP-10 except REL-11, plus GOV-C11, C12, C15 | 15 | 53 | All | Section 9 and the release checklist |
| **Total** | | **135** | **477** | | |

**Critical path:** N1 → IP-1 → IP-4 (share links and previews) → IP-6 (referrals, ledger, pool) → IP-8 (metrics) → IP-10 → PB-2 → acceptance → go/no-go.

**In parallel:** IP-5 (video) after N6; IP-7 after IP-3; legal review; founder recruitment.

Task-level detail for each requirement is in the matrix action column. Acceptance tests per requirement follow section 9 and the release checklist (section 12).

---

## 12. Release blockers and external dependencies

| Blocker or dependency | Owner | Needed by |
|---|---|---|
| Legal review of the Terms, Privacy Notice, Community Standards, Rewards Rules and Advertising Policy, with answers to the blocking questions in `docs/policies/LEGAL-REVIEW-QUESTIONS.md` (privacy, consumer protection and contests, CASL, the IP licence for previews, pyramid-scheme provisions, securities characterization of the pool) | Founder and counsel | Comments Dec 16, final Dec 21 |
| Transactional email working on Production | Founder (PB-1) | Nov 28 |
| Photo cleanup schedule on Production | Founder (PB-1) | Nov 28 |
| Health checks and uptime monitoring | Founder (PB-1) | Nov 28 |
| Vercel Pro active before external participants | Founder | Dec 16 |
| Video device test on iPhone and Android | Founder or testers | Dec 1 |
| At least two advertisers with agreed test campaigns and creatives | Founder | Dec 10 |
| 10 to 15 creators ready to post in the first week | Founder | Dec 21 |
| Usability participants (5) | Founder | Dec 17 |
| Production batches approved: PB-2 Dec 16, PB-3 Dec 20, PB-4 Dec 23 | Founder | As listed |
| No critical defects in security, privacy, authorization or economic integrity; reconciliation exact | Claude | Dec 21 |

The v1 consolidated release checklist remains the release acceptance plan. It covers account, eligibility, discovery, relationships, distribution, publishing, engagement, referral, points accuracy, pool reconciliation, creator earnings, advertising, Support Intent, intelligence, data separation, moderation, admin audit, privacy, usability, security, deployment and rollback. It is extended by section 9 and by the four stakeholder journeys as the founder defined them.

---

## 13. Preservation and sanitization status

| Item | Status |
|---|---|
| Original v1 (unsanitized) | Delivered privately to the founder as a file on Nov 24, before any change; not in the repository |
| Private evidence index (infrastructure and run identifiers, E-01 to E-11) | Delivered privately to the founder; not in the repository |
| Sanitized v2 (this file) and supporting planning files | In the working tree for commit; contains no project or run identifiers, personal or company contact details, or credentials |
| Repository visibility | Public. Recommend making it private (N4). Until then, assume everything committed is world-readable |
