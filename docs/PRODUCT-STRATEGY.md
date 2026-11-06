# Crevant product strategy: creator income and the Creator Loyalty Network

**Status: roadmap direction approved in principle by the founder; details below are proposals awaiting approval.** Nothing here is approved for implementation. The loyalty experiment, payments, recurring support and advertising partnerships are built only after each is separately approved. **All timelines and costs in this document are preliminary estimates.**

Related: `docs/PHASE-1A.md` (positioning, supporter definitions, pilot economics), `docs/BETA-MIGRATION-PLAN.md` on PR #4 (original pilot plan).

## 1. Long-term economic objective

**At least 25% of eligible active creators earn US$5,000 or more per month in net creator earnings through Crevant, sustained for three consecutive months.**

This is an internal, long-term objective. It must never appear as a claim or promise on the landing page or in marketing; the copy rules in `docs/PHASE-1A.md` still apply.

### What counts as earnings

**Net creator earnings** are measured **after** Crevant platform fees and payment provider fees (processing, recurring billing, payout and dispute fees), and **before** the creator's personal taxes and business expenses. Refunds and lost disputes are deducted in the month they occur. Only money that flows through Crevant counts: recurring support, one-time support, and advertising partnerships brokered or paid through Crevant. Hypothetical Support Intent never counts. Connection Points are never money and never count.

### Who is an eligible active creator (proposed, for approval)

A creator counts as an **eligible active creator** for a three-month measurement window when all of these are true for every month in the window:

1. The account existed for the whole window, and is not internal, suspended or banned.
2. They published at least 4 posts in the month.
3. They had at least 1 Active Supporter (definition in `docs/PHASE-1A.md`) in the month.
4. They had completed creator verification with the payment provider, so they were able to receive money.

The definition is versioned. Any change is recorded with its date and reason, and earlier results are never quietly recalculated under a new definition.

### Reporting rule

Every report shows the result for **eligible active creators** and also for **all active creators** (published at least once in the month) and **all creators**, with each group's size. That way the eligibility rules cannot make the result look better than it is.

### Planning arithmetic (internal only, assumptions to validate)

$5,000 a month net from recurring support alone needs roughly 600 supporters paying about $10 a month, or about 1,200 paying about $5, before fees. Fees take a larger share of small payments. This fits "the right 1,000" only if a large share of a creator's committed supporters pay every month, far above what most creator platforms see today, so advertising partnerships are an important second source. The 60-day pilot cannot validate the objective; it measures the leading indicators in section 6.

## 2. Financial reporting definitions

Every financial report keeps these lines separate and never adds across them unless the line says so. All amounts are stored in integer minor units with a currency code; reporting is in USD.

| Line | Definition |
| --- | --- |
| **Gross supporter contributions** | Everything supporters paid (recurring and one-time), before any fee, refund or dispute |
| Refunds and disputes | Refunded amounts and disputes lost, shown separately and deducted below |
| Payment provider fees | Processing, recurring billing, payout and dispute fees charged by the payment provider |
| **Crevant revenue** | Money Crevant keeps: platform fees on support, any commission on advertising partnerships, and in future, membership fees. Proposed 0% platform fee and 0% commission during the pilot |
| **Net creator earnings from support** | Gross supporter contributions minus refunds, lost disputes, payment provider fees and Crevant's platform fee |
| **Creator advertising revenue** | Value of advertising partnerships to the creator: the gross deal value, and the creator's net share after any Crevant commission and fees |
| **Total net creator earnings** | Net creator earnings from support plus the creator's net advertising revenue. This is the figure used for the long-term objective |
| Hypothetical Support Intent | Stated, nonbinding amounts. Reported in a separate section, clearly labelled, and never added to any line above |

Connection Points appear in no financial report.

## 3. The Creator Loyalty Network

| Element | Behaviour | Status |
| --- | --- | --- |
| Unlimited following | Anyone can follow and interact with any number of creators | Current model |
| **Core 10** | Users choose a set number of creators from whom they earn Connection Points | **Pilot experiment** (section 5) |
| **Discovery Slots** | Temporary slots to earn CP with emerging creators without replacing a core choice | **Pilot experiment** (section 5) |
| Paid expansion | An optional paid membership raises the number of creators a user can earn CP with | Hypothesis, after the pilot |
| CP rules | Creator-specific, noncash, nontransferable | Unchanged and non-negotiable |
| Financial support | Voluntary, recurring, and completely separate from CP and from Support Intent | Unchanged principle |

Core 10 and Discovery Slots are tested as an experiment, not adopted as permanent product rules.

**Open questions before any permanent adoption:**

1. **Paid expansion and "CP can't be bought".** A purchase may only change how many creators a user can earn with. No purchase ever creates CP. Lawyer review for loyalty programme and consumer protection rules in Canada and the US before it is offered.
2. **Swapping a creator out.** Proposed: the balance stays redeemable with that creator; only new earning stops. Swaps have a cooldown so slots can't be rotated to farm points.
3. **Emerging creators.** Discovery Slots are the mitigation for a closed market; their effect is measured.
4. **App stores.** Native apps may bring in-app purchase rules for paid membership. The web-only pilot avoids this.

## 4. Architecture principles that must hold

These are the decisions that would be expensive to reverse. PR #7 and the PR 2 migration proposal (Phase 1A) are compatible with all of them.

1. **One account type.** Creator status is derived from activity and never gates features.
2. **Follows are separate from CP earning eligibility.** Separate tables from the start; following someone never implies earning CP from them.
3. **An auditable CP ledger.** Append-only entries per supporter and creator; balances are computed from the ledger; reversals are new entries that point at the original. Each entry records the earning policy and rule version that applied.
4. **Earning rules are configuration.** Unlimited and Core 10 are rows of data, not separate code paths or schemas.
5. **CP lives in its own server-only `loyalty` schema**, added to the separation tests so nothing combines CP with `finance`, `intent` or `sim`.
6. **Money lives only in `finance`**, in integer minor units with currency, on a separate production database before any real payment.

### What each phase does (and does not) add

* **Phase 1B:** no new loyalty infrastructure. If the pilot needs cohorts assigned at sign up, Phase 1B includes the **design** of experiment assignment so the data model is ready; it is implemented only if needed then. Emerging-creator **eligibility is defined** (section 5) before any classification is implemented.
* **Phase 1C:** the CP engine, built on the `loyalty` schema, with **earning-attempt tracking implemented alongside it**, and the Core 10 plus Discovery Slots experiment (section 5).

### Flexible CP data model (Phase 1C, proposal)

All tables are in the server-only `loyalty` schema. Members never write to them directly.

| Table | Purpose |
| --- | --- |
| `earning_policies` | One row per policy, for example `unlimited` and `core_discovery_pilot`. Fields: core slot limit (empty means unlimited), discovery slots, discovery length in days, swap cooldown, other parameters |
| `policy_assignments` | Which policy applies to which user, from when to when, and why (default, experiment arm, or future membership). **Doubles as the experiment assignment record**, so no separate experiment framework is needed |
| `earning_relationships` | Slot history: supporter, creator, kind (`core`, `discovery` or `open`), started, ended, end reason. Only one active row per supporter and creator |
| `cp_ledger` | Append-only. Supporter, creator, amount, reason, source event (unique, so nothing counts twice), policy, relationship, rule version, reversal link |
| `earn_decisions` | Every earning attempt and its outcome: earned, not eligible (with reason), daily cap, or blocked as farming |
| `entitlements` | Extra slots and their source. **Not built in the pilot**; listed so paid expansion later needs no redesign. Never grants CP |

One server function, `can_earn(supporter, creator, time)`, decides eligibility and returns the policy and relationship to record. Slot changes lock the supporter's row so two requests can't both take the last slot. Existing prototype rules (creator-specific balances, daily caps, follow bonus and its reversal, clawbacks) map onto ledger reasons unchanged. The prototype already switches points models through one setting (`src/lib/wallets.ts`), which is the same idea.

## 5. Pilot experiment: Core plus Discovery Slots versus unlimited earning

The smallest practical implementation, proposed for approval.

**Design**

* **Unit:** supporters (users), randomly assigned 50/50 when they join the pilot: **control** (unlimited earning) or **treatment** (core slots plus Discovery Slots). Creators have supporters in both arms. Assignment is recorded in `policy_assignments` and never changes during the pilot.
* **Consent:** onboarding tells participants that some features differ between groups as part of the research, in the research consent step already planned.

**Treatment rules (pilot parameters, stored as policy data)**

* **Core slots:** the user picks creators to earn CP with, up to the slot limit. A creator who invited the user fills the first slot by default; the user can change it.
* **Discovery Slots:** 2 slots, each lasting 14 days, usable only with creators who meet the emerging-creator definition below. A discovery creator can be promoted to a core slot if one is free.
* **Swaps:** 7-day cooldown per slot. Removing a creator stops new earning; their existing balance stays redeemable.
* **Messages:** clear explanations when an action doesn't earn ("You're not earning Connection Points with Maya yet. Add her to your Core to start.").

**The slot limit needs a decision.** The pilot will probably have about 10 to 20 creators, and most supporters will follow a handful. A limit of 10 would rarely bind, so the experiment would show almost nothing. Options: (a) keep 10 and report how often it binds; (b) scale the limit to the pilot, for example 3 core slots plus 2 Discovery Slots, recorded as a pilot parameter. **Recommended: (b)**, because it tests the mechanism, while being clear that the permanent number is a separate decision.

**Minimum product surface (treatment arm only):** a "Your Core" picker listing followed creators; a "Try earning with this creator" action on eligible emerging creators' profiles; the not-earning messages above. The control arm sees nothing new. No paid expansion.

**Emerging-creator eligibility (proposed definition, to approve before any classification is built):** an account that publishes at least one post during the pilot, was **not** recruited or invited by Crevant as a creator, and had fewer than 100 followers when the pilot began. Pilot participants who start creating ("emergent creators" in the original plan) are the main expected group. Risk: there may be few of them, which limits what Discovery Slots can show.

**Measures**

* **Primary:** depth of loyalty: active days per supporter-creator pair, and Committed Supporters per creator.
* **Secondary:** breadth (creators engaged per supporter); share of CP earned with emerging creators; Discovery Slot use and promotion to core; supporter retention; reward redemption; conversion to real or hypothetical support (reported separately); a short satisfaction survey.
* **Guardrails:** drop in overall engagement; complaints about the slot limit; any farming patterns. The founder can stop the experiment if a guardrail is hit.

Analysis plan and measures are written down before the pilot starts. With a few hundred supporters, results are directional and reported as such.

## 6. Updated 60-day pilot measurement plan

Additions to the plan in `docs/PHASE-1A.md` and the original plan. The financial lines follow section 2. Hypothetical and real money are never combined. Internal accounts are excluded.

| Area | Measures |
| --- | --- |
| **Creator income** (real money, limited cohort) | Total net creator earnings per creator per month, split into net support earnings and advertising revenue; monthly run-rate; share of creators with any earnings; share above $100, $500, $1,000 and $5,000 a month; reported for eligible active, all active and all creators |
| **Recurring supporter payments** | Gross supporter contributions; paying supporters per creator; conversion from Active Supporter to paying; average monthly amount; new, cancelled and failed payments; refunds and disputes |
| **Crevant revenue** | Shown separately (expected to be zero during the pilot at a 0% fee) |
| **Value per supporter** | Net creator earnings per Active Supporter and per Committed Supporter, with hypothetical Support Intent per supporter alongside in a separate column |
| **Loyalty** | Followers, Active and Committed Supporters; supporter retention week to week; reward redemption; how concentrated each user's CP is across creators; the experiment measures in section 5 |
| **Emerging-creator discovery** | Using the section 5 definition: new supporter relationships with emerging creators per week; share of CP earned by emerging creators; time to first 10 Active Supporters; Discovery Slot use and promotion |
| **Income distribution** | Share of total net creator earnings, CP and Active Supporters held by the top 10% of creators; a concentration index for each; comparison with the long-term objective as a reference line |
| **Advertising partnerships** | Partnerships offered and completed; gross deal value; creator net share; Crevant commission (if any); disclosure compliance; brand and creator satisfaction |
| **Costs** | Platform cost per active creator; payment provider fees as a share of gross contributions |

## 7. Real recurring support (limited creator cohort)

Included in the roadmap for a small group of creators (proposed 3 to 5), web only, in USD. It stays completely separate from CP and from Support Intent. **It is not activated until every item in the readiness checklist (section 9) is complete and the founder approves activation.**

Minimum infrastructure:

1. **Payment provider:** Stripe Connect with Express accounts (creator verification and payouts on Stripe's hosted pages) and Stripe Billing for monthly support. Hosted Checkout and the hosted customer portal, so Crevant never handles card details. Proposed 0% platform fee during the pilot. Fees confirmed on Stripe's pricing pages at decision time.
2. **Server code:** an Edge Function to create checkout sessions, and a webhook Edge Function that verifies signatures, ignores duplicates and records events. Secret keys only in Edge Function secrets.
3. **Data:** `finance` tables for connected accounts, subscriptions, payments, refunds and disputes, following section 2. RLS: supporters see their own payments; creators see their own totals. Separation tests extended.
4. **Production environment:** a separate production Supabase project (paid plan, backups) in its own organisation, and commercial-use hosting.

## 8. Hand-brokered advertising partnership test

A small number of brand partnerships brokered by hand for pilot creators. **No automated advertising marketplace and no ad serving.**

1. **Payment:** simplest is brand pays creator directly, with Crevant recording the deal. Paying through Crevant (invoice into the creator's Stripe account) can follow later and reuses section 7.
2. **Product, minimal:** a "Paid partnership" label on posts (required disclosure under US and Canadian advertising rules); an admin-only record of each partnership in `finance` (gross deal value, creator share, any Crevant commission, dates, deliverables, status); a simple post performance summary for the brand from existing analytics.
3. **Legal:** partnership agreement template, disclosure rules, brand safety and content guidelines.

## 9. Readiness checklist before any real-money launch

Every item must be complete, with evidence, and the founder must approve activation. This applies to recurring support and to any partnership payment that flows through Crevant.

**Legal and policy**

- [ ] Legal entity able to contract and receive payouts
- [ ] Lawyer review (Canada and US) of creator terms, supporter terms, refund and dispute policy, partnership agreement, and disclosure rules
- [ ] Privacy notice updated for payment data
- [ ] Tax responsibilities documented (creators handle their own taxes; payment provider tax forms where required)

**Creator verification**

- [ ] Each cohort creator has completed verification with the payment provider and is payout-eligible
- [ ] Creators acknowledge the support terms

**Payments, cancellation, refunds and disputes**

- [ ] Full flow tested end to end in test mode: subscribe, renew, fail and retry, cancel, refund, dispute
- [ ] Supporters can cancel at any time from the hosted portal, and cancellation stops future charges
- [ ] Refund process written down, including who decides and how fast
- [ ] Dispute process written down, including evidence submission and who handles it

**Reconciliation and reporting**

- [ ] Weekly reconciliation of the payment provider against `finance` records, with any difference investigated
- [ ] Reports show every line in section 2 separately, with Support Intent kept apart

**Security**

- [ ] Webhook signature verification and duplicate handling tested
- [ ] Payment secrets only in Edge Function secrets; secret scan passes
- [ ] RLS tests: supporters see only their own payments, creators only their own totals
- [ ] Separation tests confirm no view or function combines `finance` with `loyalty`, `intent` or `sim`
- [ ] Security review of the payment code and admin tools

**Operations**

- [ ] Separate production Supabase project with backups, in its own organisation
- [ ] Commercial-use hosting in place
- [ ] Support contact and response expectations published
- [ ] Monitoring and alerts for failed webhooks and payment errors
- [ ] Incident plan, including how to pause payments
- [ ] Founder sign-off on activation

## 10. Roadmap (approved in principle)

| Phase | Plan |
| --- | --- |
| **1A** | No change. PR #7 stays as reviewed, with separate approval. PR 2 migration proposal keeps one account type and creates no CP, follow or money tables. |
| **1B** | Invitations, onboarding and profiles as planned. Design experiment assignment if the pilot needs cohorts at sign up (implement only if needed). Agree the emerging-creator definition. No new loyalty infrastructure. |
| **1C** | Real posts, follows, comments and rewards. CP engine on the `loyalty` schema with an auditable ledger and earning-attempt tracking. Core plus Discovery Slots experiment against unlimited earning. |
| **1D** | 1D-1: real recurring support for a limited cohort, activated only after the readiness checklist. 1D-2: hand-brokered advertising partnership test. 1D-3: measurement dashboard with the section 2 financial lines and section 6 measures. |
| **After the pilot** | Decide whether to adopt the loyalty model permanently. Paid expansion only after consumer billing, pricing and legal review. |

**Preliminary estimates (to be confirmed):** real recurring support and the partnership test add roughly 3 to 4 weeks of development across Phases 1C and 1D, with legal work in parallel; the experiment adds roughly 1 week to Phase 1C. The pilot start may move accordingly. Added running costs are mainly a paid production Supabase plan (about $25 a month), commercial hosting (about $0 to $20 a month depending on provider), payment provider fees on real volume, and legal fees (to be quoted).

## 11. Unresolved decisions

1. **Eligible active creator definition** (section 1): approve or adjust.
2. **Pilot slot limit:** keep 10, or scale to the pilot (recommended: 3 core plus 2 Discovery Slots).
3. **Discovery Slot parameters:** 2 slots for 14 days, and the emerging-creator definition (section 5).
4. **Platform fee and partnership commission during the pilot:** proposed 0% for both.
5. **Real support cohort:** size (proposed 3 to 5 creators), support amounts or tiers, minimum amount, USD only.
6. **Partnership payments:** brand pays creator directly (recommended for the test) or through Crevant.
7. **Production hosting provider**, after the hosting comparison promised at the end of Phase 1A.
8. **Experiment guardrail thresholds** and who can stop the experiment (proposed: the founder).
9. **Research consent wording** for the experiment and payment cohorts.
