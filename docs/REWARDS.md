# Contributions and rewards (IP-6): review guide

Migration: `supabase/migrations/20261205000000_rewards.sql` (merged, PR #110). Everything is **simulated**: no money is collected, held or paid, Connection Points have no cash value, and all of it lives in the `sim` schema, apart from `intent` and any future `finance`.

| Capability | How | Requirements |
|---|---|---|
| Connection Points | One append-only ledger (`sim.points_ledger`), one platform-wide balance per member, awarded only by server triggers on the authoritative tables | RWD-01, RWD-05 |
| Approved point table (D6) | Versioned (`sim.point_rules`, `d6-v1`): meaningful comment 2, save 2, repost 5, external share 5, qualified referral 100; follow, Clique, like and advertising 0. Every entry names its rule version | RWD-02 |
| Recognized versus redeemable | Only qualified referrals are redeemable (financially eligible, simulated). Everything else is recognized contribution | RWD-02, founder decision |
| No rewards for consuming ads | `ad_view` is 0 and awards nothing | founder decision |
| Qualified referrals | A member who joined through someone's referral link (first touch), confirmed adult, verified email, then makes their own first follow. Never self, once per referred member. Held for the founder's review | RWD-04, GOV-C07 |
| Integrity | One award per source (dedup key), never for your own content, daily caps per action, monthly budget for redeemable points, a pause switch, reversals as new rows (a deleted comment reverses its points) | RWD-06, RWD-12 |
| Simulated pool | Simulated net revenue: content-associated ads split 40% creator, 20% fan rewards pool, 40% Splitpost (whole cents; the three always add up); general feed ads 100% Splitpost. Recorded by the founder until IP-7 records it from campaigns | RWD-07 |
| Valuation | Open pool divided by approved redeemable points outstanding | RWD-08 |
| Simulated month close | Allocates the open pool to approved redeemable points in whole cents and refuses unless the lines equal the pool exactly; one close per month, only after the month ends | RWD-09, GOV-C08 |
| My Split | Overview: recognized, redeemable (approved and waiting), estimated value marked Simulated, the disclosure. History: newest first, with reversals. Opportunities: the referral link | RWD-10 |
| Creator earnings | The creator's simulated share by month on their profile (Money, marked Simulated) | RWD-11 |
| Founder | My Split, "Founder: review referrals and rewards": approve or reject qualified referrals, the simulated reconciliation, record simulated revenue for a month (content advertising names the creator; feed advertising is Splitpost's), and close a finished month | GOV-C07, GOV-C08 |
| Restorations and caps (20261209000000) | A restoration corrects an earlier entry and is not a new contribution, so restored entries don't count toward daily caps. Duplicate prevention, the monthly redeemable budget and the append-only ledger are unchanged | Founder decision |
| Moderation and rewards | Points earned on hidden content are reversed; when the content is restored (by a moderator or a successful appeal) the legitimate points come back as compensating entries, once (`docs/GOVERNANCE.md`) | RWD-12 |

The allocation percentages are kept out of member-facing text by the existing claims guard (`src/public/landing/claims.test.ts`) until the Rewards Rules are legally reviewed; screens say "creator share" and "fan rewards pool".

## Evidence (local)

* Browser journey `e2e/rewards-journey.e2e.cjs` (29 checks): points from real contributions, likes and own content earn nothing, no double award, My Split and History, a reversal, a referral through a real referral link with email confirmation and the referred member's own first follow, founder review, simulated content and feed revenue with the 40/20/40 reconciliation, the referrer's simulated valuation, the creator's simulated share without percentages, the month close reconciling to the cent and only once.

Database suite with `021_rewards.sql` and `170_rewards.sql` (awards once each, own content and likes earn nothing, reversal, append-only, daily caps, pause, ads earn nothing, qualified referral and review, 40/20/40 split adds up, month close reconciles and runs once, My Split and creator earnings), the rollback test `rollback-rewards-test.sh`, unit tests for My Split, History, the founder review and creator earnings.

## Economic transparency

Members are told everything is simulated and how points become eligible. The allocation rules (40% creator, 20% fan rewards pool, 40% Splitpost for content advertising; feed advertising to Splitpost) are enforced and reconciled by the database but stay off member screens until the Rewards Rules are legally reviewed. Once approved, they are shown in My Split; the claims guard (`src/public/landing/claims.test.ts`) is the switch to change.
