# MVP release readiness checklist (Nov 27, final phase)

The single actionable list for completing the approved MVP and opening the
controlled pilot. `docs/DELIVERY-TRACKER.md` keeps the history; this file
says what is left, who does it, what it waits on, how long it takes and what
"done" means. No separate assessment is kept anywhere else.

**Release target: December 23** (PB-4, the controlled pilot opens).
Planned dates are latest dates: a step moves earlier when its criteria are met.

**Freezes in force**

* **MVP scope:** frozen. No new features, redesigns or architectural changes
  unless one is needed to fix an approved-scope defect or a release blocker.
* **Landing page:** frozen again after SP-BRAND-003 (accepted and closed
  Nov 27; www.splitpost.ca serves `ac40597`). It changes only after
  meaningful feedback from prospective members.

**Gates that stay in place:** production activation, external pilot access,
destructive recovery operations and real financial transactions each need
the founder's explicit authorization at the time. Nothing here lifts one.

**Four kinds of readiness**, kept apart:

| Kind | Means | Who can complete it |
|---|---|---|
| **T. Technical acceptance** | The product works as approved: automated checks, then the founder's hands-on acceptance on staging | Claude (automated), founder (acceptance) |
| **O. Operational readiness** | We can run, monitor, recover and release it safely | Founder authorizes; Claude prepares and verifies |
| **L. Legal readiness** | The documents members agree to, and the rules behind them, are reviewed | Founder and qualified Canadian counsel |
| **B. Business validation** | People outside the team respond to it | Prospective members and the pilot cohort |

**Who:** **Founder** means only you can do it (a click, a decision, a
signature, hands-on testing). **Claude** means Claude does it and reports
back. **Counsel** means external legal counsel.

Staging app: https://splitpost-app-git-staging-crevant.vercel.app and
member Production app: https://app.splitpost.ca, both on the latest commit on
main (the last change to the app itself was `787c465`, Nov 27; later commits
change only docs). Claude tells you the exact value to check at the start of
each session.
Member Production is live for the founder only: text, photo and video
posting, progression and moderation work there; registration, invitations
and the waitlist are closed. Acceptance procedure:
`docs/FOUNDER-TESTING-GUIDE.md`.

## 1. Three workstreams, run in parallel

Done and not to be repeated unless a later change touches what they tested:
T1, T2, T4 (video released and accepted in Production), O3 (PB-2), the PB-1
items marked verified in O1, and in O5 the moderator role, the six photo
processing checks, founder photos, progression and video.

Nothing here opens registration, invitations or the waitlist, and rewards
stay simulated. Recruiting conversations in workstream 3 happen outside the
product. No link, invitation or campaign is issued until O7.

### Workstream 1: Product readiness

| # | Action | Item | Who | Effort | Latest |
|---|---|---|---|---|---|
| 1.1 | Hands-on acceptance of the member journey on your phone and laptop (testing guide parts A to C and E, your founder-account steps; the tester steps are 1.2 and can be the same sitting), with the speed and Reduce Motion checks in the same session. Video (part D) is already accepted | T3, T5 | Founder | 2 h | Dec 5 |
| 1.2 | **Staging tester session**: the two-account part of the guide, played by a second test account (yours, or a founding team member's). Covers joining by invitation, the tester's Home, engaging with your post, the Clique, My Split and goals, the welcome walkthrough again and the deletion preview | T7 | Founder | 45 min | Dec 5 |
| 1.3 | Fix each finding: P0 and P1 the same day, P2 fixed or accepted by you | O4 | Claude; founder accepts | Depends on findings | Dec 16 |
| 1.4 | Release candidate regression after any fix, then your acceptance | T6, O4 | Claude; founder | 30 min for you | Dec 20 |

### Workstream 2: Operational and legal readiness

| # | Action | Item | Who | Effort | Latest |
|---|---|---|---|---|---|
| 2.1 | Send counsel the review package (`docs/policies/COUNSEL-PACKAGE.md`: four member documents, the Advertising Policy and 20 blocking questions) | L1 | Founder | 1 h to send | **Dec 1** |
| 2.2 | Request a password reset to your own account on app.splitpost.ca and confirm it arrives from Splitpost | O1 | Founder | 5 min | Dec 5 |
| 2.3 | Authorize the staging recovery exercise in writing, then run its dashboard steps with Claude in a quiet hour | O2 | Founder; Claude runs checks | 1 h | Dec 12 |
| 2.4 | Set up the two uptime checks | O1 | Founder; Claude verifies | 15 min | Dec 18 |
| 2.5 | Record counsel's answers and update the drafts; publish the final versions and link them from registration | L1 | Claude drafts; founder approves | 1 day | Dec 20 |

### Workstream 3: Business readiness

| # | Action | Item | Who | Effort | Latest |
|---|---|---|---|---|---|
| 3.1 | Founding creators: a shortlist of creators, conversations to confirm interest, and their consent to the public name they want shown | B3 | Founder | Ongoing | Dec 15 |
| 3.2 | Cohort selection: the named first 10 to 20 members (creators and supporters), and the order they are invited in | O6 | Founder | 1 h | Dec 15 |
| 3.3 | Advertiser recruitment: a shortlist and early conversations only. No campaign is activated until the Advertising Policy is reviewed and questions 20 and 21 are answered | B4 | Founder | Ongoing | Before any campaign |
| 3.4 | Confirm advertising and sharing stay at their defaults for the pilot (or set them) | O5 | Founder | 15 min | Dec 15 |
| 3.5 | Pilot communications: the invitation message, the welcome note and a short pilot FAQ, drafted from approved copy. They are sent only after O7, with the CASL elements counsel confirms (question 23) | B5 | Claude drafts; founder approves | 2 h for Claude, 30 min for you | Dec 18 |
| 3.6 | Authorize PB-4, external pilot access | O7 | Founder | 15 min | Dec 23 |

## 2. What Claude does without waiting

| Item | Status |
|---|---|
| Fix every P0 and P1 the same day it is reported; P2 by pilot impact | Ongoing; nothing open |
| Verify each founder step from the read-only side (staging checks, Verify Edge Functions, CI) | Ready |
| Keep main green: full CI on every change, the 20 browser journeys, WCAG 2.2 AA, the PB-2 rehearsal | Green at `787c465` (the video playback fix) |
| Recovery exercise queries, ready to send | **Done**: `scripts/db/recovery/staging-exercise.sql` |
| Keep staging and member Production at the same commit and migrations | **Done**: both at `787c465`; 20261220 applied to both |
| Release candidate regression before PB-2 and PB-3 (T6) | Scheduled for each |
| Update this list after every change | Ongoing |

## 3. Outstanding items

Effort is working time, not elapsed time. "Depends on" lists what must be
true first.

### T. Technical acceptance

| ID | Item | Status | Owner | Depends on | Effort | Acceptance criteria |
|---|---|---|---|---|---|---|
| T1 | Staging serves the accepted build (live deployment verification) | **Done** Nov 27: the canonical staging address serves `00ee129` (private window). A normal window had shown a cached `9d17683`; no deployment or configuration change was needed | Founder | None | 1 min | In a **private window**, View Source shows `splitpost-commit` = the expected commit. Required at every acceptance session and after every deployment, on staging and on app.splitpost.ca |
| T2 | Progression on for staging | **Done** Nov 27 (founder); confirmed independently by the staging checks in run 46062877363 (progression switch ON) | Founder | T1 | 1 min | Control Center shows Progression on, with your reason; the next staging check shows the switch on |
| T3 | **Interface milestone**: hands-on acceptance of interface, onboarding, gamification, My Split and publishing (closes UAT-001-3 and UAT-001-4) | Built, automated checks green; **awaiting your acceptance** | Founder; Claude fixes findings | T1, T2 | 2 h, plus fixes | Every step of parts B and C of the testing guide behaves as written on your phone and laptop; no open P0 or P1; each P2 fixed or accepted by you; you record "accepted" here |
| T4 | **Video release** (closes UAT-001-2) | **Changed by founder decision, Nov 27:** device testing is no longer an activation gate (approved change to the video release criteria; migration 20261220000000). Device tests stay available and recorded for diagnosis; none was recorded or changed by the decision | Founder (switch on); Claude (migration, checks, verification) | **Done and accepted Nov 27.** Migration merged (D7, `7c0411a`) and applied to staging (run 46062877363) and member Production (run 46064254403), check 036 passed on both. Founder set the 50 GB cap, switched New video uploads on and published an 11 second video; after the PROD-VID-1 fix (`787c465`) it showed a preview, played with sound and played again after a refresh | 30 min | The 50 GB cap is set and New video uploads is on in member Production with a reason; check 036 passes; limits, server file checks, moderation, cleanup and the separate playback switch unchanged; members get video when the pilot opens (no separate step) |
| T5 | Real-device speed and reduced motion | Emulated checks done (sign-in 2.1 s, landing 1.24 s on Slow 4G) | Founder | T3 (same session) | 10 min | Sign-in about 2 s and Home about 3 s on your phone with Wi-Fi off; with Reduce Motion on, the walkthrough changes faces without sliding |
| T6 | Release candidate regression | Green at `787c465` | Claude | Any fix merged | 2 h each time | Full CI green (unit, types, build, secret scan, database, separation, reconciliation, 20 browser journeys with WCAG 2.2 AA, public site and launch rehearsal) at the exact commit PB-2 and PB-3 use |
| T7 | **Staging tester session** (tracked since Nov 27; workstream 1.2) | Not started | Founder, with a second test account | T1, T2 (done) | 45 min | Every tester step of part B of the testing guide behaves as written for the second account, alongside your founder account; findings recorded in Feedback and classified here. No one outside the founding team is invited |

### O. Operational readiness

| ID | Item | Status | Owner | Depends on | Effort | Acceptance criteria |
|---|---|---|---|---|---|---|
| O1 | **PB-1** member Production operations: SMTP, drain key, cleanup schedule, health checks, uptime checks (`docs/STAGING-ACCEPTANCE.md`, section 4, B1 to B5; B6 is superseded by PB-2 step 6) | **In progress.** Configured: B1 email (delivery verified at D5); B2 drain key, **verified** by C5. **Verified** Nov 27: B3 health checks, staging run 46048046293 and Production run 46050341372 pass (function answers, login connects, preflight allowed, switch as expected). Production waitlist closed Nov 27 to match intent: database switch OFF (run 46048561266) and function switch off (founder); 2 unverified entries from before Nov 20, none since. B4 uptime deferred to external pilot readiness (founder). B5 PR #105 closed. C5 photo cleanup schedule on member Production **applied and verified** Nov 27 (run 46053163571: job 1 every 15 minutes, first run reached the drain, pg_net absent). D1 Production sign-in configured Nov 27 (founder): sign-ups off, email confirmation on, Before User Created hook on, three templates, Site URL and redirect app.splitpost.ca | Founder; Claude verifies | None | 1 h | A password reset to your account arrives from Splitpost; the cleanup schedule checks pass; the next health runs pass; both uptime checks are Up |
| O2 | **Staging recovery exercise** (`docs/RECOVERY.md`; queries in `scripts/db/recovery/staging-exercise.sql`) | Prepared; **awaiting your written authorization** for the in-place restore | Founder authorizes and runs dashboard steps; Claude runs checks | T4 is done, so any staging daily backup from Nov 28 on qualifies; a quiet hour | 1 h together | Both test deletions come back with the restore and are deleted again by the re-apply; its second run changes nothing; staging checks (including 032 and the reconciliation) and Verify Edge Functions pass; device results present; sign-in, Home and a photo work; total time within the 4 hour objective. Only then does recovery count as demonstrated |
| O3 | **PB-2** migrations and post-media to member Production (`docs/PB-2-RUNBOOK.md`) | **Done Nov 27** (founder authorized). Restore point Nov 27 10:00:34 UTC. Apply run 46050706596: exactly the 20 migrations 20261130 to 20261219, all recorded, 35 member checks passed, 0 skipped. Post-apply check run 46051191624 passed. post-media v3 deployed at `1fa2e7a` (founder, source exact match) and verified (run 46051971520, 455 passed); avatar v1 verified unchanged (run 46051975445, 226 passed). Ledger entry recorded (PR #136). Founder only: launch gate on, invitations closed | Founder authorizes each run; Claude prepares and reads results | No open P0 or P1; O1 (the drain key is needed before post-media); a restore point | 1.5 h | `plan` lists exactly the 20 migrations 20261130 to 20261219; `apply` passes every member check (016 to 035); post-media verified and recorded in the ledger by reviewed PR. Invitations stay closed |
| O4 | **PB-3** release candidate fixes | Nothing open | Claude; founder accepts | T3, T4, O3 | depends on findings | Every fix through full CI; staging and Production at the same commit; your acceptance recorded |
| O5 | Pilot switch states for Production: progression, photos, advertising, sharing, video | **In progress.** Done Nov 27 (founder, verified; not to be repeated): **moderator role** granted to the launch founder only (recorded with `ops.grant_moderator`) and verified; **all six hosted photo processing checks** passed; **photo posting** on for the founder only (`photos_enabled` true, audience `founder`) and verified; **progression** on in member Production; **video** on (50 GB cap, New video uploads and playback on; T4). Remaining: confirm advertising and sharing stay at their defaults | Founder decides | O3 | 15 min | Each switch set in Control Center with a reason; photos stay founder only until PB-4 |
| O6 | Cohort plan: who is invited first, how many, invitation links, the pilot welcome | Not started | Founder; Claude prepares the welcome text from approved copy | L1 for the documents members accept | 1 h | A named first cohort and size; invitation links issued only after O7 |
| O7 | **PB-4** external pilot access | Not started; needs separate authorization | Founder | T3, T7, O1 to O6, L1 | 15 min | Your written authorization; invitations approved in `config/member-production.json` by reviewed PR; the first invited member can register on app.splitpost.ca |
| O8 | Delete the rehearsal project (saves about $10 a month) | Kept on purpose | Founder approves; Claude checks dependencies | O2 passed | 15 min | No workflow or check refers to it; your explicit approval |

Already done (evidence in the tracker): staging on Pro with daily backups,
110 MB upload limit, backups and restore drill in every CI run, security and
authorization fixes (20261214), reconciliation suite, deletion register and
its immediate reporting, recovery objectives approved (RPO 24 h, RTO 4 h).

### L. Legal readiness

| ID | Item | Status | Owner | Depends on | Effort | Acceptance criteria |
|---|---|---|---|---|---|---|
| L1 | **Pilot documents**: Terms of Use and Pilot Participation Terms, Member Privacy Notice (including the media backup line and the deletion register), Community Standards, Rewards Rules as they apply to simulated amounts (Part G, goals and locked value, added Nov 27), and the 20 blocking questions in `docs/policies/LEGAL-REVIEW-QUESTIONS.md` | Drafts v0.1 ready; **review package ready** (`docs/policies/COUNSEL-PACKAGE.md`); **not yet with counsel** | Founder and counsel; Claude updates the drafts | Counsel engaged | 1 h to brief; counsel's time; Claude 1 day for changes | Counsel's written sign-off on each document for an invitation-only, adult, simulated-earnings pilot; every blocking question answered; final text linked from registration before O7 |
| L2 | Rewards Rules for allocation percentages | Not needed for the pilot | Counsel | Showing percentages to members | Later | Required before any allocation percentage is shown; percentages stay hidden in the pilot |
| L3 | Regulated financial products review | Deferred | Counsel | Real financial functionality | Later | Required before any real money moves; nothing in the MVP moves money |

### B. Business validation

| ID | Item | Status | Owner | When | Acceptance criteria |
|---|---|---|---|---|---|
| B1 | Prospective members' response to the landing page and waitlist | Live since publication | Founder | Ongoing | The trigger for revisiting the frozen landing page; not a release gate |
| B2 | Pilot cohort feedback on the member journey | After O7 | Pilot members, through Feedback | From Dec 23 | Findings classified P0 to P3 here; not a release gate |
| B3 | Founding creators: shortlist, interest confirmed, consent to the public name shown | Not started | Founder | By Dec 15 | Enough confirmed creators for the first cohort (O6); creator links issued only after O7 and the CASL answer |
| B4 | Advertiser recruitment | Not started | Founder | Conversations any time; campaigns only after the Advertising Policy review (questions 20, 21) | A shortlist and recorded interest; no campaign activated during the members-only pilot without that review |
| B5 | Pilot communications: invitation, welcome note, pilot FAQ | Not started | Claude drafts from approved copy; founder approves | By Dec 18 | Approved text; the CASL elements counsel requires; nothing sent before O7 |

## 4. Risks to December 23

| Risk | Level | Why | What keeps the date |
|---|---|---|---|
| **Legal review (L1) not started** | **High, flagged now** | The pilot documents must be reviewed before invitations, and counsel's lead time is outside our control. Without them, O7 cannot happen on Dec 23 | Counsel engaged by Dec 1 with the pack and the blocking questions; sign-off by Dec 18 |
| Founder acceptance (T3) still to do | Medium | Findings need fix time before PB-2 on Dec 16 | T3 by Dec 5 leaves a week for fixes |
| Video compatibility (T4) | Medium, accepted | Without device tests, some phones may hit conversion, upload or playback problems | Founder decision Nov 27: found and fixed from pilot feedback; device test page kept for diagnosis; clear error messages; uploads can be paused without hiding published videos |
| PB-1 approval (O1) | Low | PB-2's post-media step needs the Production drain key | Approve by Dec 5 |
| Recovery exercise (O2) | Low | Needs your written authorization and a quiet hour | Run by Dec 12 |

No risk today comes from remaining development: none is outstanding.

## 5. Findings

Severity: **P0** critical security, privacy, financial integrity or data
loss (fixed immediately, you are told at once); **P1** a core journey broken
(fixed immediately); **P2** significant usability, clarity or performance
(fixed or accepted by you before release); **P3** minor or a future
enhancement (post-launch backlog).

| ID | Severity | Finding | Status |
|---|---|---|---|
| UAT-001-1 | P2 | Landing page mobile hero too crowded | **Accepted and closed** Nov 27 (SP-BRAND-003, live at `ac40597`) |
| BRAND-003 | P2 | Mobile hero hierarchy, logo-inspired illustration, realistic screenshots, HOW problem statements | **Accepted and closed** Nov 27 (PR #134, live at `ac40597`). Landing freeze reinstated |
| UAT-001-2 | P1 | Video unavailable | **Resolved by decision** Nov 27: video released without a device-test gate (T4); activation through the release process |
| PROD-VID-1 | P1 | Production video blank at 0:00 and does not play (founder, Nov 27, first 11 second video) | **Resolved and accepted** Nov 27 (PR #138, live at `787c465`): the existing video shows a preview, plays with sound and plays after a refresh. Root cause: the app.splitpost.ca security policy allowed video only from the site itself (`media-src 'self' blob:`), so the browser blocked the signed Storage link; the release decision missed the documented `media-src` step. Also: no poster for that post, so nothing showed before play; a second failure showed no message; the delivery estimate called issued links "plays". Fixed by allowing media from the member project only, a first-frame preview when there is no poster, an actionable error, poster capture that works where the browser loads no frame on its own, and "links issued" wording. |
| UAT-001-3 | P2, blocks the interface milestone | Interface did not match the approved designs | Built and merged (`00ee129`); **awaiting T3** |
| UAT-001-4 | P2 | Gamification and progression not obvious | Built and merged (`00ee129`); **awaiting T3** |
| UAT-001-5 | P2 | Profile tab label mismatch (WCAG 2.5.3) | **Resolved** |

**Open P0 or P1:** none.

**Post-launch backlog (P3 and deferred)**

| ID | Item | Source |
|---|---|---|
| BL-1 | Weighted Connection Score, leaderboards, rankings, advanced achievements | Deferred by the founder, Nov 26 |
| BL-2 | Interactive advertising as a controlled experiment | Approved in principle, after launch |
| BL-3 | Media backup and recovery approach for photos and videos | Required before any cohort beyond the controlled pilot |
| BL-4 | App topic names aligned with launch market segments | Not needed (founder, Nov 27): segments need not match the app's topics |

## 6. Ready to release

PB-4 can be authorized when: T3, T5 and T7 are accepted (T4 is done); O1 to O6 are done; L1 is signed off; there is no open
P0 or P1 and every P2 is fixed or accepted; and you authorize it. If all of
that is true before December 23, the pilot opens earlier.
