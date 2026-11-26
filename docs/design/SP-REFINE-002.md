# SP-REFINE-002: Lean progression for December 23, and the open design questions (Nov 26)

Follows the founder's decisions on SP-REFINE-001 (Nov 26): Reach,
Connection and Earnings approved as names; goals, a private explainable
Connection Score, one points currency, transparent qualification journeys and
My Split as the progression centre approved in principle; locked creator
earnings approved in principle. **No threshold, formula or new financial rule
is approved**, so everything below that needs a number says so.

## 1. Do the existing metrics cover the creator journey?

Yes. Every step the founder named already has a measured, tested source. No
new measurement system is needed; qualification reads these.

| Journey step | What would count | Existing source |
|---|---|---|
| Create | Original posts (not reposts), weeks with a post | `social.posts` (author, created_at, repost flag); `app_creator_insights` posts |
| Attract | Genuine followers, new followers, where they came from | `app_my_audience` (followers, new 7 days, follow sources) |
| Connect | Members who put you in their Clique; comments on your posts | `app_my_audience` (clique count); `app_creator_insights` (comments, saves, reposts, shares) |
| Retain | Active supporters (meaningful activity in 28 days), returning members | `app_my_audience` (active supporters); `app_creator_insights` retention (returning, connections this week) |
| Earn | Creator share attributed by valid ad impressions | `sim.revenue_entries` (content ads, per creator); `app_my_simulated_earnings` |
| Integrity (eligibility, not a score) | Good standing: no active enforcement, no confirmed invalid activity | Governance enforcement records; referral integrity signals |

"Genuine followers" would mean followers in good standing who are adult,
email-verified members (the same filters the referral rules already use).

## 2. A lean implementation for December 23

| # | Item | What it is | Migration | Effort | Depends on |
|---|---|---|---|---|---|
| G1 | Goals engine | Goal definitions in a versioned table (like `sim.point_rules`), **values set by the founder in Control Center**, unset by default; one function returns each member's progress from the sources in section 1. Until a value is set, a goal shows progress ("12 original posts") without a target and unlocks nothing | Yes (one) | 3 days | Approval of the engine; thresholds can follow |
| G2 | Creator qualification progress | My Split card: steps, progress, next action; Your insights links to it | No (uses G1) | 1.5 days | G1 |
| G3 | Simulated locked earnings | An append-only release state on each creator-share entry (locked, eligible, settled), set from G1's qualification; My Split shows accumulated, locked, unlocked. Never absorbed by Splitpost | Yes (one, can share G1's) | 2.5 days | G1; founder confirms the states |
| G4 | Consumer qualification progress | My Split card from G1 (Clique, support, sharing, verified contributions), display only, no new financial rule | No | 1 day | G1 |
| G5 | Simplified My Split | One column (preview 6): points bar, goals, earnings, then history and opportunities one tap deeper | No | 2 days | Preview 6 confirmed |
| | Tests and journeys | Unit, database behaviour, rollback, one journey | | included | |

**Total:** about 10 working days, on top of about 7 for the UI refinements
(SP-REFINE-001). With one developer, both together would finish around
December 17 to 18, which is too close to December 23 for acceptance.

**Recommendation for December 23:** G1, G2, G3 and G5 behind an operational
switch (off by default, like video), merged by **December 12**, with the
UI refinements reduced to the previews the founder confirms first. If
acceptance runs short, the pilot opens with the switch off and nothing else
changes. G4 follows if G1 lands early. The Connection Score, achievements and
interactive advertising are phased after launch.

**Dependencies:** founder approval of G1 and G3 (engine and states) by
**December 1**; D7 approval of the migration at merge; threshold values can be
set later in Control Center without a release.

**Risks:** schedule (two workstreams in parallel; mitigated by the switch);
members reading simulated locked earnings as a promise (mitigated by the
Simulated label and the legal review of wording); threshold values arriving
late (mitigated: goals show progress without targets).

## 3. Locked earnings: the model approved in principle

* Attribution unchanged: eligible net content advertising revenue, the
  approved split, the creator share by valid ad impressions on their posts.
* Each creator-share entry gets a release state: **locked** (creator not yet
  qualified), **eligible** (qualified and integrity checks passed),
  **settled** (included in a settlement). States are append-only rows, so
  history is never rewritten; a reversal (fraud, refund) is a compensating
  entry, as in the rewards ledger.
* Splitpost never takes a locked share. Today a deleted creator's entries
  keep their amounts but lose the link to the account (`on delete set null`);
  for real money that case is for the legal and accounting review, with
  forfeiture, expiry, reserves and payment rules.

## 4. Consumers: a fuller qualification journey (proposal, nothing approved)

Steps, each from existing data:

1. **Clique:** at least one Clique member you have read in each of the last
   4 weeks (no minimum Clique size).
2. **Support:** an active supporter of creators you follow (meaningful
   comments, saves, reposts) in at least 3 of the last 6 weeks.
3. **Sharing:** shares that brought at least one person to view or follow.
4. **Verified contributions:** at least one qualified referral, or
   contributions confirmed in the monthly review.
5. **Integrity:** good standing (an eligibility gate, as for creators).

**Accumulating financially eligible points before qualification** (to
assess, not approved). Two ways to treat an unqualified member's eligible
points at a month close:

| | A: include and lock | B: exclude until qualified |
|---|---|---|
| Month close | Their points take their share of the fan pool; the value is fixed and locked | Their points are left out; the pool goes to qualified members |
| On qualifying | Locked value released | Points enter a later month's pool, at that month's value |
| Liability | Grows with locked value (needs reserve rules) | None until they qualify |
| Fairness | Value fixed when earned, like creators | Earlier qualified members gain at their expense |

Recommendation: **A**, for consistency with locked creator earnings, with
the same legal and accounting review. Anti-abuse unchanged: daily caps,
the monthly cap, referral integrity, review before release.

## 5. Connection Score: design questions answered (no formula approved)

* **Dimensions:** Relationships (largest share), Contribution, Consistency.
  Integrity is a separate eligibility gate, never a weighted part.
* **Window:** rolling 28 days, updated daily; Consistency looks at the last
  6 weeks.
* **Normalization:** each dimension 0 to 100 on a saturating curve with a cap,
  so more of one thing has diminishing returns and nothing scales without
  limit.
* **Caps and anti-abuse:** counts only relationships with members in good
  standing; reciprocal Clique pairs created together are counted once;
  per-day and per-week caps on contribution; no credit for follows, likes or
  time spent; confirmed invalid activity is removed from the window.
* **Members who create and consume:** one score; Relationships counts both
  directions (people who keep you in their Clique and people you support);
  Contribution counts both creating and supporting, each capped.
* **Explainability:** the member sees each dimension, what raised or lowered
  it this week, and one next action. Private to the member, never public,
  never used in distribution, ranking, moderation or advertising (enforced by
  a database test that no feed, discovery or ad function reads it).

## 6. Interactive advertising: experiment rules to approve

Advertiser opt-in per campaign; one question with three answers; one try;
skippable; never blocks content; correct answers earn capped recognition
points (cap to set); no money; reported separately from organic interest and
verified conversions, with the note that comprehension is not purchase intent.
Phased after launch unless the founder asks otherwise.

## 7. Decisions for the founder

1. Approve the lean plan for December 23 (G1, G2, G3, G5 behind a switch,
   merged by December 12), or a smaller subset.
2. Approve G1's engine and G3's release states by December 1.
3. Set the creator and consumer goal values (any time; Control Center).
4. Consumers' eligible points before qualification: A (include and lock,
   recommended) or B.
5. The Connection Score weights and thresholds, after launch.
6. Account deletion reconciliation: counting per transaction time is exact
   without any new data; a stable event identifier would need a migration.
   Recommended: keep the counting.

## 8. Built (Nov 26): G1 and G3, migration 20261217000000

Behind the operational switch **progression**, off by default. While it is
off, members see nothing and nobody qualifies.

**The goal catalogue** (measures only; the founder sets every value in Control
Center, with a reason, each change a new version):

| Journey | Measure | Counted from |
|---|---|---|
| Creator | `original_posts` | Your posts, not reposts, not deleted or hidden |
| Creator | `posting_weeks` | Calendar weeks with a post, last 6 weeks |
| Creator | `genuine_followers` | Followers who are active pilot members, not suspended or blocked |
| Creator | `active_supporters` | Followers with a meaningful comment on your posts in 28 days |
| Creator | `clique_connections` | Active members who keep you in their Clique |
| Consumer | `clique_engagement_weeks` | Weeks, of the last 4, with a meaningful comment, save or repost on a post by someone in your Clique |
| Consumer | `support_weeks` | Weeks, of the last 6, with a meaningful comment, save or repost on someone else's post |
| Consumer | `shares` | Shares of others' posts, last 28 days |
| Consumer | `verified_contributions` | Qualified referrals approved or settled |

One change from section 4: the Clique step counts **support for Clique
members, not reading**. An existing safeguard (since 20261121) keeps viewed
state out of anything reward-related, and qualification gates simulated
money, so reading time stays out.

**Rules the database enforces:**

* No default values: until every measure of a journey has a value (a whole
  number of 1 or more), nobody on that journey qualifies.
* Qualification is recorded once, under the version in force, and is never
  taken away by a later change to the values.
* Integrity is a gate, not a score: a restriction or suspension in force
  blocks qualification, release and settlement until it ends or is lifted.
* States are append-only rows: locked (no row), eligible, settled. Eligible
  only for a qualified member; settled only after eligible; each once.
  Splitpost never takes a locked amount. Nothing is paid.
* Consumers, Option A: at a month close, approved redeemable points take
  their share of the pool as today (settled points never enter another
  pool); the value is locked until the member qualifies.
* Nothing in feeds, discovery, ranking or advertising reads progression
  (checked on staging by 033).

**Open, unchanged:** the values themselves; deletion, dormancy and
disqualification treatment of balances; legal and accounting review before
any real money. Revenue entries have no reversal type today; a reversal
(fraud, refund) would need a compensating entry type before real money.
