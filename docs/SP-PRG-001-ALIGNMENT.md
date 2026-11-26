# SP-PRG-001 implementation alignment (Nov 26, 2026)

Reconciles the approved [SP-PRG-001](SP-PRG-001.md) with what PR #126
(20261217000000) built, and records what migration
`20261218000000_progression_rules.sql` and the accompanying app changes add.
Everything stays SIMULATED and behind the `progression` switch, which is off.

## 1. Already satisfied by PR #126 (kept, not rebuilt)

* One account; creator and consumer journeys independent within it.
* Versioned, append-only goal values with reasons; one-time qualification
  recorded with its date and goal version, never removed by later goal changes
  or declining activity.
* Append-only simulated states (locked, eligible, settled), ordered and
  enforced by the database; no double counting.
* Creator day-one earnings: shares accumulate before qualification, locked.
* Consumer Option A: eligible points take part in the month close regardless of
  qualification; allocated points are settled and never enter another pool;
  the allocated value is locked until qualification; zero-point months roll
  the pool forward (existing month close).
* Integrity as a gate (restriction or suspension in force).
* No feed, discovery, ranking or advertising function reads progression.
* My Split single column, Connection Points bar, simulated disclosure.

## 2. Gaps found and implemented

| Spec | Gap | Implemented |
|---|---|---|
| CQ-02, FQ-03 | Weeks over 6 weeks, local week start | Monday to Sunday UTC weeks within the preceding 28 days |
| CQ-03, CQ-04, FQ-01 | Eligibility of the people counted was partial | Eligible member: active pilot membership, confirmed email, no suspension in force, never self |
| CQ-05 | Active supporters, one week | Returning active supporters: followers who meaningfully engaged (comment, save, repost) in 2 distinct weeks of 28 days |
| FQ-01 | No Clique-size milestone | `clique_creators` (10) |
| FQ-02 | No lifetime engagement count | `meaningful_engagements` (30) from the points ledger (its caps, deduplication and reversals), plus `engaged_creators` (3) for "across three distinct creators", shown as its own step |
| FQ-04, FQ-05 | Shares over 28 days; referrals as "contributions" | Lifetime external shares from the ledger (one per post, never your own); lifetime qualified referrals (approved or settled) |
| PRG-02/03 | Benchmarks unset | The approved values recorded as goal version 1 of each journey, sourced to this approval |
| PRG-04 | Release on goals met, no review | Goals met → **Under review**; the founder's documented approval releases; revocation (evidence and a member message required) and restoration after appeal |
| PRG-05 | Qualification and eligibility mixed | Status kept apart: in progress, under review, qualified, eligibility paused (restriction or account hold), revoked |
| PRG-06 | No targeted holds | Holds on one revenue entry, one month's allocation, or an account (documented justification required); a hold pauses, never takes |
| PRG-04 5.6 | No compensating corrections | Refund, invalid activity, correction and restoration entries in the revenue ledger (never larger than what is left); allocation corrections that return value to the open pool; each goes through the same states |
| PRG-04 5.5 | Estimated, paused | Estimated shown for this month's eligible points; paused shown apart; Paid not offered |
| 9.1 | "Splitpost never takes them" | Replaced with the approved wording |
| 6.5 | No growth guidance | Optional guidance once qualified, never a condition |
| 7.6 | No member communication | Holds and revocations show the founder's message (not the internal reason or evidence) and the next step |
| PRG-07 | No progression scorecard | Control Center scorecard: milestone counts with denominators and definitions, statuses, referral feasibility, integrity counts, held simulated amounts (testers excluded) |

## 3. Benchmark configuration and metric alignment

Recorded by 20261218000000 (`set_by` `founder-approved:SP-PRG-001 v1.0
2026-11-26`); further changes remain founder-only in Control Center, and need
the founder's separate authorization under section 12.2.

* Creator: original posts 20, posting weeks 3, genuine followers 100, Clique
  connections 5, returning supporters 5.
* Consumer: Clique creators 10, meaningful engagements 30 (across 3 creators),
  supporting weeks 4, external shares 5, qualified referrals 5.

Definitions follow sections 3.2 and 4.2. Two interpretation notes: returning
supporters must follow the creator (the existing Active Supporter definition);
"confirmed bots and fraud" are excluded through the existing governance
(suspension) and referral review, not automated detection (deferred, 7.10).

## 4. Conflicts with existing behaviour

1. **Account deletion forfeits unsettled simulated points** (20261212, kept
   in 20261214): it records reversals of unsettled awards. How a deleted
   member's already allocated (locked) amounts are kept needs the same
   decision.
   This conflicts with "no automatic forfeiture" (7.8 asks to verify it).
   Nothing was changed: see decision 1.
2. **Activation definitions:** the existing consumer activation (a follow and
   a qualifying meaningful activity within 7 days of registering) differs from
   the proposed one (3 follows, 1 Clique, 1 engagement); no creator or
   advertiser activation definition exists. The existing one is kept; the
   scorecard labels its own denominators. See decision 2.
3. **Review workload:** every member who meets the goals waits for the
   founder's approval (5.1, "qualification and integrity review before
   release"). See decision 3.
4. **Referral feasibility:** with 5 referrals per consumer, consumer
   qualification is capped by available referrals (the scorecard reports the
   ceiling). Reported, not changed.

No conflict with privacy: members see only their own progress and the
founder's message; the scorecard is aggregates; decisions, holds and
corrections are private and append-only.

## 5. Progress and remaining work

Done: migration 20261218000000 with its staging check (034), rollback and
rollback test, reconciliation invariant, member surface lists; My Split
statuses, notices, wording, estimated and paused amounts, growth guidance;
Control Center review, holds, settlement and scorecard; browser journey.

Remaining: a Control Center form to place holds and record corrections (they
work through the founder functions and tests; the UI lists and releases
holds today); staging application of 20261217 (waiting at the environment
gate) and 20261218 after its D7 approval; staging configuration check and
acceptance.

## 6. Acceptance evidence (local and CI)

| AC | Evidence |
|---|---|
| AC-01, AC-02 | `300_progression.sql` blocks 1 to 4: every measure with its exclusions (deleted, hidden, old, self, unconfirmed, suspended, removed, reversed, pending), under review with date and version, no early qualification, restriction gate; independence of journeys in block 7 |
| AC-03 | Blocks 4 to 6: locked before review, approval releases, refund as a compensating entry, never larger than what is left |
| AC-04 | Block 7: a qualified-to-be and an unqualified member in one close; points consumed; locked, then unlocked; settled in block 8 |
| AC-05 | Blocks 7 and 8; existing rewards tests (cent reconciliation, one close per month, zero-point rollover); reconciliation invariants |
| AC-06 | Block 9: unfollow and raised goals keep qualification; inactivity takes nothing |
| AC-07 | Blocks 5, 8, 10: targeted hold pauses only its entry; account hold needs justification; release; revocation needs evidence and a message, keeps amounts attributed; restoration |
| AC-08 | Staging checks 033 and 034: no distribution, discovery or advertising function reads progression |
| AC-09 | Unit tests (statuses, wording, labels, notices, growth) and the browser journey (WCAG 2.2 AA, 320 and 390 px, no CSP violations) |
| AC-10 | Scorecard with definitions, denominators and classifications (unit test and block 11) |
| AC-11 | Member surface audit and approved-function lists; private tables; founder-only functions; append-only history |
| AC-12 | Off by default; switching off hides progress and keeps every record (block 12, journey) |

## 7. Schedule

No change to December 23. The progression work did not use the V1, D1 and P1
time budget's database; those three remain the critical path for December 10
and start next.

## 8. Founder decisions

1. **Deletion and forfeiture (pilot):** keep the current pilot behaviour
   (unsettled simulated awards are reversed when a member asks to be deleted,
   because their data is erased), or preserve simulated balances. Recommended:
   keep it for the simulated pilot, disclosed in the deletion flow, and decide
   real-money treatment in the legal review.
2. **Activation definitions:** adopt the proposed creator, consumer and
   advertiser activation definitions in the metrics dictionary (changing the
   existing consumer one), or keep the existing one. Recommended: adopt them
   from the pilot start, reported side by side with the old one for 30 days.
3. **Review step:** keep a founder review for every qualification (current),
   or approve automatically when no hold or open integrity case exists.
   Recommended: keep the review during the pilot.
4. **D7:** approve migration `20261218000000_progression_rules.sql` at merge.
