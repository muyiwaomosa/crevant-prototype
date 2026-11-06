# Crevant product strategy: creator income and the Creator Loyalty Network

**Status: proposed, for the founder's approval.** This records an evolution in product strategy and how it affects the pilot. Nothing here is approved for implementation. The loyalty model, payments, subscriptions, memberships and advertising systems are not being built until each is separately approved.

Related: `docs/PHASE-1A.md` (positioning, supporter definitions, pilot economics), `docs/BETA-MIGRATION-PLAN.md` on PR #4 (original pilot plan).

## 1. Long-term economic goal

**At least 25% of active creators earn US$5,000 or more per month through Crevant**, primarily from recurring fan support and creator advertising partnerships.

This is an internal, long-term goal. It must never appear as a claim or promise on the landing page or in marketing. The landing page copy rules in `docs/PHASE-1A.md` (no earnings figures, no promised living) still apply.

Definitions to agree before any reporting against the goal:

* **Active creator:** proposed as an account that published at least 4 posts in the last 30 days and has at least one Active Supporter. Internal accounts excluded.
* **Earns through Crevant:** creator net receipts after payment processing fees and any platform fee, in USD, for money that flowed through Crevant (recurring support, one-time support, advertising partnerships brokered or paid through Crevant). Income earned elsewhere does not count.
* **Per month:** a calendar month, and separately a trailing 3-month average so one-off spikes don't count as reaching the goal.

**Planning arithmetic (internal only, assumptions to validate):** $5,000 a month net from recurring support alone means roughly 600 supporters paying about $10 a month, or about 1,200 paying about $5, before fees. Card fees take a much larger share of small payments, so very small tiers make the goal harder. This is consistent with "the right 1,000" only if a large share of a creator's committed supporters pay every month, which is far above what most creator platforms see today. Advertising partnerships are therefore an important second source, not an extra. The goal is deliberately ambitious, and the 60-day pilot cannot validate it: it can only measure the leading indicators in section 5.

## 2. The Creator Loyalty Network (hypotheses to test)

| Element | Proposed behaviour | Status |
| --- | --- | --- |
| Unlimited following | Anyone can follow and interact with any number of creators | Current model |
| **Core 10** | Free users choose 10 creators from whom they earn Connection Points | Hypothesis |
| **Discovery Slots** | Temporary slots to earn CP with emerging creators without replacing a Core 10 choice | Hypothesis |
| **Paid expansion** | An optional paid membership raises the number of creators a user can earn CP with | Hypothesis |
| CP rules | Creator-specific, noncash, nontransferable | Unchanged and non-negotiable |
| Financial support | Voluntary, recurring, and completely separate from CP | Unchanged principle |

The 10-slot limit, the discovery mechanism and paid expansion are hypotheses, not requirements. The reasoning to test: a limit makes a user's choice meaningful, concentrates loyalty on fewer creators (deeper relationships), and gives CP signal value. Discovery Slots protect emerging creators from a closed market where everyone's slots are already full.

**Open questions and risks to resolve before any implementation:**

1. **Paid expansion and "CP can't be bought".** Paying for more slots buys the ability to earn CP with more creators, not CP itself. That distinction must hold in the design (no purchase ever mints CP) and should be reviewed by a lawyer for loyalty programme and consumer protection rules in Canada and the US.
2. **What happens to CP when a creator leaves someone's Core 10.** Proposed default: the balance stays redeemable with that creator, and only new earning stops. Swaps have a cooldown so slots can't be rotated to farm points.
3. **Effect on emerging creators.** If established creators fill most slots, new creators may struggle. Discovery Slots are the mitigation, and their effect must be measured.
4. **Effect on engagement.** Users may engage less with creators outside their Core 10. The pilot should compare depth and breadth, not assume the limit is better.
5. **App stores.** If Crevant later ships native apps, paid membership may fall under in-app purchase rules and fees. The web-only pilot avoids this.

## 3. Phase 1A and 1B decisions that would be expensive to reverse

Most of Phase 1A is unaffected. The table lists decisions where the wrong choice now would be costly later, and the recommended choice.

| Area | Expensive mistake | Recommended decision | Phase |
| --- | --- | --- | --- |
| Account model | A "creator" flag that gates features, or separate fan and creator accounts | One account type; creator status is derived from activity, never a gate | 1A (PR 2), 1B |
| Follows versus CP eligibility | Making "follows" the same thing as "earns CP from" | Keep follows and CP earning eligibility in separate tables from the start | 1B, 1C |
| CP storage | Balance columns updated in place | Append-only CP ledger per supporter and creator; balances computed from it | 1C |
| CP earning rules | Rules hard-coded in app code or schema | Earning policies stored as data, with each ledger entry recording the policy and rule version that applied | 1C |
| CP placement | CP tables in `public`, outside the separation checks | CP in its own server-only `loyalty` schema, added to the separation tests so nothing ever combines CP with money (`finance`) or hypothetical amounts (`intent`) | 1C (decide before building) |
| Experiments | No way to put users in different cohorts | A small cohort assignment table, so Core 10 can be tested against unlimited earning in the pilot | 1B |
| Analytics events | Recording only successful CP earning | Record every earning decision, including "not eligible" with the reason, so the effect of a slot limit can be measured | 1B |
| Invite attribution | Losing who invited whom, and through which creator | Record inviter, creator and channel on every redemption (already planned) | 1B |
| Invite caps | A fixed 25-per-creator cap in code | Cap stored per invitation (already planned as `max_uses`) so it can be raised for income tests | 1B |
| Money | Amounts as decimals, or no currency, or money mixed with CP | Integer minor units plus currency code, in `finance` only, linked to the creator's account | 1D |
| Production data | Real money on the free staging project | A separate production Supabase project, in a separate organisation, before any real payment | Before 1D |
| Landing copy | Saying CP is earned "with each creator" if Core 10 ships | Already fine for the pilot. If Core 10 is adopted, update the copy then. PR #7 is unchanged. | Later |

**PR #7 (landing page) and the PR 2 migration proposal are compatible with this strategy as planned.** Neither creates CP, follow, money or experiment tables. The only additions are the recommendations above for 1B and 1C.

## 4. Flexible Connection Points architecture (proposal)

Goal: support unlimited earning, Core 10, Discovery Slots and paid expansion with **no database redesign**, by treating eligibility as configuration. The prototype already does a version of this: `src/lib/wallets.ts` switches between a creator-scoped and a universal points model through one setting.

All tables live in a server-only `loyalty` schema. Members never write to them directly; earning and slot changes go through server functions.

| Table | Purpose |
| --- | --- |
| `earning_policies` | One row per policy: `unlimited`, `core10_v1`, and so on. Fields: slot limit (empty means unlimited), number of discovery slots, discovery length in days, swap cooldown, and other parameters. |
| `policy_assignments` | Which policy applies to which user, from when to when, and why: default, experiment cohort, or membership. Lets the pilot run cohorts side by side. |
| `entitlements` | Extra slots a user holds, from when to when, and their source (future membership, promotion). Never grants CP. |
| `earning_relationships` | Slot history: supporter, creator, kind (`core`, `discovery` or `open`), started, ended, end reason. A unique rule allows only one active row per supporter and creator. |
| `cp_ledger` | Append-only. Supporter, creator, amount, reason, source event (unique, so nothing is counted twice), the policy and relationship that allowed it, rule version, and a link to any entry it reverses. |
| `earn_decisions` | Every earning attempt and its outcome: earned, not eligible (with reason), daily cap reached, or blocked as farming. |

How each model works with the same tables:

* **Unlimited:** the policy has no slot limit. The first time someone earns with a creator, an `open` relationship is created automatically.
* **Core 10:** the policy's slot limit is 10. Earning is allowed only with an active `core` or `discovery` relationship. Choosing a creator creates a `core` relationship if a slot is free; removing one ends it, subject to the cooldown.
* **Discovery Slots:** `discovery` relationships with an expiry date, limited by the policy. They can be promoted to `core`.
* **Paid expansion:** effective slot limit = policy limit plus active entitlements. No schema change.

One server function, `can_earn(supporter, creator, time)`, answers whether earning is allowed and returns the policy and relationship to record. Slot changes lock the supporter's row so two requests can't both take the last slot. Existing prototype rules (creator-specific balances, daily caps, follow bonus and its reversal, clawbacks) map onto ledger reasons unchanged.

Moving from unlimited to Core 10 then needs only new policy rows and assignments, plus a decision about existing users (for example, grandfather their current creators into Core 10 for a set period). Each ledger entry keeps the policy it was earned under, so history stays interpretable.

Separation stays strict: the schema separation tests are extended so that no view or function combines `loyalty` with `finance`, `intent` or `sim`, and memberships can never create CP.

## 5. Updated 60-day pilot measurement plan

Additions to the measurement plan in `docs/PHASE-1A.md` and the original plan. Hypothetical (Support Intent) and real money are always reported in separate columns and never added together. Every figure is per creator unless stated, and internal accounts are excluded.

| Area | Measures |
| --- | --- |
| **Creator income** (real money, only if tested) | Gross and net receipts per creator per month by source (recurring support, one-time support, advertising partnerships); monthly run-rate; share of active creators with any income; share above $100, $500, $1,000 and $5,000 monthly run-rate |
| **Recurring supporter payments** | Paying supporters per creator; conversion from Active Supporter to paying; average monthly amount; new, cancelled and failed payments; refunds and disputes; recurring revenue per creator |
| **Value per supporter** | Value per Active Supporter and per Committed Supporter, hypothetical and real side by side |
| **Loyalty** | Followers, Active and Committed Supporters; supporter retention week to week; reward redemption; how concentrated each user's CP is across creators. For any Core 10 cohort: slots filled, swaps, time in slot, and engagement depth compared with the unlimited cohort |
| **Emerging-creator discovery** | Emerging creator, proposed: joined during the pilot, not recruited by Crevant, under 100 followers at the start. New supporter relationships with emerging creators per week; share of CP earned by emerging creators; time to first 10 Active Supporters; Discovery Slot use and promotion to Core 10 (if tested) |
| **Income distribution** | Share of total creator income, CP and Active Supporters held by the top 10% of creators; a concentration index for each; the distribution compared with the long-term goal |
| **Advertising partnerships** (if tested) | Partnerships offered and completed; value and creator share; disclosure compliance; brand and creator satisfaction |
| **Costs** | Platform cost per active creator; payment fees as a share of support |

**What the pilot can and can't show.** The pilot will probably have about 10 to 20 creators and a few hundred supporters. That's enough for direction (conversion rates, retention, value per supporter, early discovery patterns), not statistical proof. A Core 10 test inside the pilot would compare small groups, so results are directional and must be labelled that way. The $5,000 goal is reported only as a long-term reference line; pilot results feed an investor model as labelled assumptions, not forecasts.

## 6. Minimum infrastructure to test real support and advertising partnerships

Neither is built yet. This is the smallest responsible version of each, for separate approval.

### Recurring fan support (limited creator cohort)

1. **Legal first:** a company able to contract, creator and supporter terms, a refund and dispute policy, privacy notice updates, and tax responsibilities (creators are responsible for their own taxes; the payment provider issues tax forms where required). Lawyer review for Canada and the US. Scope: USD, web only.
2. **Payment provider:** Stripe Connect with Express accounts, so creators complete identity checks and get paid out on Stripe's hosted pages, plus Stripe Billing for monthly support. Hosted Checkout and the hosted customer portal (update card, cancel), so Crevant never handles card details. Platform fee 0% during the pilot. Fees to be checked on Stripe's pricing pages at decision time.
3. **Server code:** an Edge Function to create checkout sessions, and one webhook Edge Function that verifies signatures, ignores duplicates, and records events. Secret keys only in Edge Function secrets.
4. **Data:** `finance` tables for connected accounts, subscriptions, payments, refunds and disputes, in integer minor units with currency. RLS: supporters see their own payments; creators see their own totals. Separation tests extended.
5. **Production environment:** a separate production Supabase project (paid plan, backups) in its own organisation, and commercial-use hosting. Test mode end to end before any live payment.
6. **Operations:** a support address, a process for disputes and refunds, and a weekly reconciliation of Stripe against the `finance` tables.

Rough effort once legal work is under way: about 2 to 3 weeks of development, with legal lead time running in parallel.

### Creator advertising partnerships (concierge test)

1. **No ad system.** Crevant brokers a small number of brand partnerships by hand for pilot creators.
2. **Payment:** simplest is brand pays creator directly, with Crevant recording the deal. Paying through Crevant (invoices into the creator's Stripe account) can come later and reuses the Connect setup above.
3. **Product, minimal:** a "Paid partnership" label on posts (required disclosure under US and Canadian advertising rules), an admin-only record of each partnership in `finance` (value, dates, deliverables, status), and a simple post performance summary for the brand from existing analytics.
4. **Legal:** partnership agreement template, disclosure rules, brand safety and content guidelines.

Self-serve brand marketplaces and ad placements with revenue sharing are later phases.

## 7. Proposed roadmap changes (for approval)

| Phase | Change |
| --- | --- |
| **1A** | No change. PR #7 stays as reviewed. PR 2 migration proposal keeps one account type and creates no CP, follow or money tables. |
| **1B** | Add: cohort assignment table; analytics events that include earning decisions; invite cap stored per invitation (already planned); emerging-creator classification at sign up. |
| **1C** | Build CP on the flexible `loyalty` schema in section 4, launching with the **unlimited** policy. Core 10 and Discovery Slots are built only if Decision 1 below says to test them, behind a cohort flag. |
| **1D** | Split into: 1D-1 real support (Decision 2: existing options A to D, now including recurring support for a limited cohort); 1D-2 advertising partnerships concierge test (Decision 3); 1D-3 measurement dashboard including income and distribution. |
| **After the pilot** | Paid expansion of slots. Not in the pilot: it needs consumer billing, pricing and legal review. Willingness to pay can be explored through interviews or a clearly labelled survey. |

**Decisions needed, with deadlines:**

1. **Test Core 10 in the pilot?** Before Phase 1C build starts. Options: not in the pilot (simplest); a small cohort against unlimited (directional only); or research only (interviews and prototypes using `/tour`).
2. **Real support scope:** before Phase 1C finishes (unchanged deadline), now including recurring support for a limited cohort.
3. **Advertising partnerships concierge test:** before Phase 1D starts.
4. **Production infrastructure** (production Supabase project, commercial hosting): before any real money moves.

**Timeline and cost impact (estimates to confirm):** including real recurring support for a limited cohort and a concierge advertising test adds roughly 3 to 4 weeks of development to Phases 1C and 1D, with legal work in parallel; the pilot start may move accordingly. Added running costs are mainly Supabase Pro (about $25 a month), commercial hosting (about $0 to $20 a month depending on the provider chosen), payment fees on real volume, and legal fees (to be quoted).
