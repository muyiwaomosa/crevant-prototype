# SP-PRG-001: Progression and Engagement Framework

**Version:** 1.0 · **Business approval:** November 26, 2026 (founder) ·
**Status:** Approved for implementation · **Target MVP release:** December 23,
2026 · **Interface completion target:** December 10, 2026 · **Pilot
duration:** 60 days from authorized external pilot opening.

This is the founder's approved business specification, stored as received
(consolidating PRG-01 to PRG-07). The implementation alignment is in
[SP-PRG-001-ALIGNMENT.md](SP-PRG-001-ALIGNMENT.md).

## 1. Implementation directive

PR #126 already implemented G1 (configurable goals engine), G2 (creator
progression), G3 (simulated locked earnings), G4 (consumer progression) and G5
(simplified My Split). Do not rebuild them. Reconcile this specification with
the implementation, configure approved requirements, resolve genuine gaps and
proceed with implementation and continuous testing, without a new
comprehensive assessment or intermediate approval gates. Continue V1, D1, P1,
staging acceptance, video validation and recovery readiness in parallel.

## 2. PRG-01: Purpose and guiding principles

**Purpose:** encourage meaningful relationships, authentic contributions,
sustainable creator businesses and fair participation in the value content
generates; not screen time, repetitive engagement or recruitment. Journey:
**Discover → Connect → Contribute → Progress → Qualify → Earn → Grow.**

**Principles:** connection over attention; contribution over consumption;
progress over competition; consistency over volume; outcomes over actions;
transparency over uncertainty; ownership over automatic forfeiture; integrity
over exploitation.

**Mechanisms:** Connection Goals (milestones), Connection Points (recognition
and financially eligible contributions under existing rules), Connection Score
(future; weighted score deferred beyond the MVP). No other currency, public
ranking, leaderboard or mandatory streak. Qualification, points, financial
eligibility and progression never determine content distribution.

**Unified identity:** one account per member; creator and consumer
qualification operate independently within it; no account types or role
switching.

## 3. PRG-02: Creator qualification

All five milestones and integrity are required for initial qualification.

| ID | Dimension | Benchmark |
|---|---|---|
| CQ-01 | Creation | 20 eligible original posts |
| CQ-02 | Consistency | Publishing in 3 distinct weeks within a rolling 28 days |
| CQ-03 | Attraction | 100 genuine followers |
| CQ-04 | Connection | 5 members with the creator in their Clique |
| CQ-05 | Retention | 5 returning active supporters |
| CQ-06 | Integrity | Mandatory good standing |

* **CQ-01:** lifetime eligible original posts (text, photo, video); excludes
  drafts, reposts, deleted or removed content, confirmed duplicate spam;
  authoritative publication records.
* **CQ-02:** distinct Monday to Sunday UTC weeks with an eligible original post
  in the preceding 28 days; server timestamps; several posts in a week count
  once.
* **CQ-03:** distinct verified eligible members with a current genuine follow;
  excludes self-follows, duplicates, confirmed bots and confirmed fraud;
  genuine reciprocal support is not fraud.
* **CQ-04:** distinct eligible members currently keeping the creator in their
  Clique; excludes removed, self and confirmed fraudulent relationships.
* **CQ-05:** distinct eligible members who meaningfully engage (qualifying
  comments, saves, reposts, under the existing Active Supporter definitions,
  integrity and deduplication rules) in at least two distinct weeks within the
  preceding 28 days; excludes impressions, artificial and self engagement.
* **CQ-06:** applicable integrity and financial eligibility checks; an
  ordinary warning is not by itself a financial disqualification.

Show each milestone, progress, target, status and next step. Advertising
revenue, availability or minimum earnings are never a qualification
requirement.

## 4. PRG-03: Consumer qualification

| ID | Dimension | Benchmark |
|---|---|---|
| FQ-01 | Connection | 10 creators in their Clique |
| FQ-02 | Engagement | 30 meaningful engagements |
| FQ-03 | Retention | 4 active supporting weeks within a rolling 28 days |
| FQ-04 | Advocacy | 5 eligible external content shares |
| FQ-05 | Contribution | 5 qualified referrals |
| FQ-06 | Integrity | Mandatory good standing |

* **FQ-01:** 10 distinct genuine creators currently in the Clique; excludes
  self, removed and confirmed fraudulent accounts. A milestone, not a limit.
* **FQ-02:** lifetime eligible meaningful engagements (qualifying comments,
  saves, reposts) across at least three distinct creators; existing caps,
  deduplication and integrity rules; excludes impressions, repetitive likes,
  spam and self engagement.
* **FQ-03:** distinct Monday to Sunday UTC weeks in the preceding 28 days in
  which the member meaningfully supports at least one creator in their Clique;
  logging in, scrolling and ad consumption do not count; no hidden minimum
  elapsed participation.
* **FQ-04:** lifetime eligible, deduplicated external shares; excludes
  automated, duplicate and internal reposts. A share does not show anyone
  received it.
* **FQ-05:** lifetime qualified referrals under the existing attribution and
  integrity rules (genuine new verified member, direct attribution,
  intentional follow, integrity review, issuance rules); no self-referrals,
  duplicates, fraud or downstream recruitment; no multilevel rewards.
* **FQ-06:** same integrity and eligibility requirements as creators.

Recruitment must not dominate; no recurring referral quotas after
qualification.

## 5. PRG-04: Locked and unlocked earnings

**Approved principles:** day-one creator earnings; consumer Option A; no
duplicate monthly allocation of Connection Points; qualification and
integrity review before release; one-time initial qualification; no automatic
forfeiture of legitimate earnings; auditable compensating adjustments;
simulated pilot economics only.

**Revenue distribution** (net eligible content-associated advertising
revenue): Creator 40%, consumer reward pool 20%, Splitpost 40%. General feed
advertising revenue stays with Splitpost. Definitions, deductions,
attribution and percentages unchanged.

**Creators:** accumulate their attributed share regardless of qualification;
locked before qualification; eligible for release after qualification and
integrity review; never automatically platform revenue.

**Consumer Option A:** financially eligible points (qualified referrals only in
the pilot; recognition points have no monetary value) take part in the monthly
pool regardless of qualification. Point value = available eligible pool funds ÷
outstanding eligible points; member allocation = member's points × point
value; existing cent-level rounding. Allocated points are consumed and never
enter another pool. Unqualified members' value stays locked; qualified members
in good standing are eligible for release. With no eligible points, the pool
rolls forward; unused issuance capacity resets per existing rules; no minimum
point value.

**Lifecycle:** Estimated (provisional), Locked, Unlocked, Settled (simulated
statement), Paid (unavailable in the pilot). Accumulated is a summary, not a
state. No double counting.

**Adjustments:** append-only records and compensating entries for confirmed
invalid contributions, advertising refunds, revenue corrections, settlement
corrections, and successful appeals and restoration; idempotent and
auditable; no silent changes to history.

**Pilot restrictions:** everything simulated; nothing held, released,
withdrawn or paid; no real tips, recurring support or redemption; Support
Intent is nonbinding and never reported as revenue, MRR or ARR.

## 6. PRG-05: Maintaining qualification

* Initial qualification is a one-time milestone; ordinary declines never
  revoke it; no repeating the benchmarks.
* Qualification is persisted separately from financial eligibility, with its
  date and goal version; a restriction may pause release without erasing it.
* Inactivity does not confiscate legitimate earnings or revoke qualification;
  qualification does not guarantee earnings.
* No recurring quotas for creators or consumers.
* Optional, simple post-qualification growth guidance (never a condition).
* Statuses: In progress, Under review, Qualified, Eligibility paused,
  Qualification revoked.
* Every framework version has an effective date and audit record; earlier
  qualifications are protected; members still progressing get transparent
  transition rules; material changes need founder authorization.
* Revocation needs an authorized, documented governance decision; successful
  appeals restore qualification and eligibility; metric declines are not
  evidence of fraud.

## 7. PRG-06: Integrity and exceptions

**Principles:** authenticity over activity; evidence over suspicion;
prevention over punishment; proportionality over blanket penalties;
transparency over uncertainty; restoration over permanent exclusion where
appropriate; accountability over unrestricted discretion; privacy over
unnecessary surveillance.

* Safeguards: authoritative server records, verified status, approved
  definitions, deduplication, issuance limits, existing controls; suspicion
  triggers review, not guilt; reciprocal support is not manipulation.
* Lifecycle (reusing governance): detection, proportionate containment,
  investigation, determination, resolution, appeal, restoration;
  distinguishing accidental, repeated, deliberate and systemic abuse.
* **Targeted holds:** restrict only affected allocations where risk can be
  isolated; account-wide holds need a documented justification; a hold is not
  confiscation.
* Qualification review: if confirmed fraud was essential to the original
  qualification, reassess with evidence about that achievement; never revoke
  because current metrics fall; revocation authorized, documented, appealable.
* Member communication: the affected activity or balance, the reason, review
  status, impact, next steps and appeal rights; no unnecessary personal data or
  detection methods.
* Accountability: Control Center, role-based access, audit records, mandatory
  reasons, evidence references, append-only audit, compensating entries,
  revocation and restoration, appeal decisions, independent review where
  staffing permits, documented sole-reviewer exceptions, reconciliation,
  versioned rules, restricted evidence, tracking of open investigations and
  holds. No unrestricted balance editing.
* Exceptional circumstances (legal and accounting review before real money):
  never-qualified members, dormancy, deletion, deceased members, identity
  verification failures, regulatory restrictions, outstanding balances,
  reserves, wind-down. Verify the current pilot deletion behaviour against the
  no-automatic-forfeiture principle; do not silently set real-money policies.
* Integrity intelligence (where data is reliable): invalid referral and
  engagement rates, qualification rejection and revocation rates, ad fraud
  indicators, hold rates, investigation time, appeal overturn rates, held
  balances, reconciliation discrepancies; suspected versus confirmed.
* MVP: reuse existing mechanisms; lean simulated controls; advanced fraud
  detection, identity verification and real compliance deferred.

## 8. PRG-07: Pilot success metrics

* **North Star:** Weekly Active Creator–Consumer Connections (WACC), the
  existing authoritative definition.
* **Day 60 business targets:** 2,000 registered members; 50 activated
  creators; 1,200 activated consumers; WACC 3,000; 5 advertiser partners;
  creator qualification 25%; consumer qualification 10% (stretch); eligible
  distribution coverage 100%; Day 7 consumer retention 40%; Day 30 25%;
  activated consumers expressing Support Intent 10%. Populations overlap; never
  added together.
* **Planning targets (directional):** Day 30 / Day 60: members 1,000 / 2,000;
  activated creators 30 / 50; activated consumers 500 / 1,200; WACC 1,000 /
  3,000; advertisers 3 / 5; referral-driven acquisition 20% / 30%.
  Registration caps stay controlled; never raised automatically.
* **Activation definitions (proposed, reconcile with the existing dictionary;
  never silently replace):** creator: an eligible original post and at least
  one meaningful audience connection; consumer: follows at least three
  creators, at least one in their Clique, one meaningful engagement;
  advertiser: managed onboarding and an approved test campaign with measurable
  delivery.
* **Creator milestones (Day 60, directional):** 20 posts 50%; consistency 60%;
  100 followers 40%; 5 Clique 60%; 5 returning supporters 50%; full 25%.
* **Consumer milestones (directional):** 10 Clique 50%; 30 engagements 60%; 4
  weeks 40%; 5 shares 35%; 5 referrals 20%; full 10% stretch. Report referral
  availability and feasibility (for example 480 qualified referrals support at
  most 96 qualifying consumers, 8% of 1,200).
* **Connection and retention (directional):** Clique adoption 70%; WACC per
  activated consumer 2.5; creators with returning supporters 70%; week over
  week retained connections 50%; Day 1 retention 60%; weekly creator retention
  60%; qualified member retention after 30 days 60%. Coverage is availability,
  not impressions; matured cohorts and explicit denominators.
* **Economic validation:** attribution, 40:20:40, prequalification
  preservation, release transitions, no duplicate allocation, cent-level
  reconciliation, Support Intent, advertiser willingness to pay, cost
  assumptions; actual, simulated, intentions and projections kept apart.
* **Advertiser validation (directional):** 5 advertisers; 5 campaigns; 60%
  positive relevance; 60% would run again; 3 willing to pay; 100% delivery
  reconciliation. Interactive ads deferred; no money for ad consumption.
* **Gamification effectiveness:** completion, median time to qualification,
  abandonment, connections before and after, post-qualification retention,
  understanding, invalid activity, growth goal participation; no unsupported
  causal claims.
* **Qualitative:** at least 15 creators, 20 consumers and every advertiser
  partner interviewed.
* **Guardrails (zero tolerance, control objectives):** unauthorized financial
  adjustments; duplicate allocations; unresolved reconciliation discrepancies
  at acceptance; unauthorized personal data disclosure; qualification
  influencing distribution; automatic confiscation of legitimate earnings;
  material enforcement without audit records; unresolved critical security
  incidents at release.
* **Founder scorecard:** the existing Intelligence Engine and Control Center;
  each metric with definition, denominator, period and classification;
  "not yet measured" where evidence is unavailable.
* **Reviews:** Day 7, 14, 30, 45, 60 from authorized external opening.
* **Investment readiness:** six hypotheses classified validated, partially
  validated, invalidated or inconclusive; actual, simulated, test and
  projected data apart.

## 9. Member experience

* **My Split:** the central progression and rewards destination; monochrome
  symbol; single column; points (recognition versus eligible); creator and
  consumer progress; next step; qualification and eligibility status;
  accumulated, locked, unlocked and settled simulated amounts; history and
  opportunities; optional growth guidance; no dense dashboards or rankings;
  simulated and nonwithdrawable disclosure. Recommended wording: "Your
  legitimate allocated rewards remain attributed to you until you qualify,
  subject to applicable integrity and adjustment rules. All pilot amounts are
  simulated."
* **Home and Clique:** the approved unified Home (one feed, Clique first, the
  Clique row, catch-up, no expiry, no Clique cap); progression never
  influences it.
* **Discover and Profile:** the approved simplified designs; Reach,
  Connection, Earnings; the full-screen horizontal face transition where
  meaningful; five destinations: Home, Discover, Create, My Split, Profile.

## 10. Technical approach

Reuse existing identity, relationships, content, referrals, progression
engine, points ledger, simulated earnings, monthly pool, moderation and
appeals, intelligence, Control Center, switches and audit. Sequence:
reconcile definitions; configure benchmarks in staging; correct metric
discrepancies; validate creator and consumer qualification, prequalification
earnings and Option A, persistence and separate eligibility, holds,
adjustments and restoration; align My Split; extend intelligence; integrated
acceptance. Progression stays off by default until authorized staging
activation; never for Production or external participants without founder
authorization; no invented benchmarks.

## 11. Acceptance criteria

AC-01 creator qualification · AC-02 consumer qualification · AC-03 creator
earnings · AC-04 consumer Option A (full journey, qualified and unqualified in
one allocation) · AC-05 monthly settlement and reconciliation (valuation,
cents, zero-point rollover, idempotency, no duplicates, refunds and reversals)
· AC-06 maintaining qualification · AC-07 integrity and exceptions (targeted
restriction, documented decisions, revocation, appeal and restoration, no
unauthorized balance changes, member status) · AC-08 distribution
independence · AC-09 member experience (progress, next steps, labels, no
income claims, responsive, accessible, states, no overflow, navigation and
face transitions) · AC-10 intelligence and reporting · AC-11 security and
privacy · AC-12 feature-switch safety. Full text as approved.

## 12. Delivery governance

Routine implementation, testing, fixes, commits, PRs and authorized staging
work continue without repeated approval. Founder authorization remains
mandatory for material business or economic rule changes, benchmark changes,
material scope changes, unapproved spending, material privacy or security
changes, Production database or configuration changes, Production feature
activation, external pilot access, destructive recovery operations, real
financial transactions and legal policy approval. December 10 interface and
December 23 MVP targets stand; pilot targets are business validation
objectives, not release gates; schedule conflicts are reported with options.

**Core principle:** Earn from genuine contributions. Qualify through
meaningful progress. Benefit from the value you help create.
