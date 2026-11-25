# Contributions and rewards (IP-6): review guide

Migration: `supabase/migrations/20261205000000_rewards.sql` (checksum recorded; merging approves it, D7). Everything is **simulated**: no money is collected, held or paid, Connection Points have no cash value, and all of it lives in the `sim` schema, apart from `intent` and any future `finance`.

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
| Founder | My Split, "Founder: review referrals and rewards": approve or reject qualified referrals, and the simulated reconciliation | GOV-C07, GOV-C08 |

The allocation percentages are kept out of member-facing text by the existing claims guard (`src/public/landing/claims.test.ts`) until the Rewards Rules are legally reviewed; screens say "creator share" and "fan rewards pool".

## Evidence (local)

Database suite with `021_rewards.sql` and `170_rewards.sql` (awards once each, own content and likes earn nothing, reversal, append-only, daily caps, pause, ads earn nothing, qualified referral and review, 40/20/40 split adds up, month close reconciles and runs once, My Split and creator earnings), the rollback test `rollback-rewards-test.sh`, unit tests for My Split, History, the founder review and creator earnings.
