# Crevant product strategy: creator income and the Creator Loyalty Network

**Status: strategy approved in principle by the founder, with the decisions recorded in section 11.** Nothing here is approved for implementation. The loyalty experiment, payments, recurring support and advertising partnerships are built only after each is separately approved. **All timelines and costs in this document are preliminary estimates.**

Related: `docs/PHASE-1A.md` (positioning, supporter definitions, pilot economics), `docs/BETA-MIGRATION-PLAN.md` on PR #4 (original pilot plan).

## 1. Long-term economic objective

**At least 25% of active creators earn US$5,000 or more per month in net creator earnings through Crevant, sustained for three consecutive months.** Results for monetization-eligible creators are reported separately.

This is an internal, long-term objective. It must never appear as a claim or promise on the landing page or in marketing; the copy rules in `docs/PHASE-1A.md` still apply.

### What counts as earnings

**Net creator earnings** are measured **after** Crevant platform fees and payment provider fees (processing, recurring billing, payout and dispute fees), and **before** the creator's personal taxes and business expenses. Refunds and lost disputes are deducted in the month they occur. Only money that flows through Crevant counts: recurring support, one-time support, and advertising partnerships brokered through Crevant, including those where the brand pays the creator directly and the deal is recorded by Crevant. Hypothetical Support Intent never counts. Connection Points are never money and never count.

### Creator groups (three separate groups)

| Group | Definition (proposed) | Used for |
| --- | --- | --- |
| **Registered creators** | Every account that has published at least one post. Not internal, suspended or banned. Everyone has the same account type, so this group is defined by activity, not by sign-up | Context and funnel reporting |
| **Active creators** | In a given month: published at least 4 posts and had at least 1 Active Supporter (definition in `docs/PHASE-1A.md`). Not internal, suspended or banned. **Payment verification is not required** | **Denominator of the long-term objective** |
| **Monetization-eligible creators** | Active creators who have also completed verification with the payment provider and can receive money | Reported separately, alongside the objective |

**How the objective is calculated.** For a three-month window: the denominator is creators who were active creators in all three months; the numerator is those among them with at least US$5,000 in net creator earnings in each of the three months. The same calculation is repeated for monetization-eligible creators and reported next to it, with every group's size shown.

**Reporting rule.** Every report shows registered, active and monetization-eligible creators separately, with the size of each group. The definitions are versioned: any change is recorded with its date and reason, and earlier results are never quietly recalculated under a new definition.

### Planning arithmetic (internal only, assumptions to validate)

$5,000 a month net from recurring support alone needs roughly 600 supporters paying about $10 a month, or about 1,200 paying about $5, before fees. Fees take a larger share of small payments. This fits "the right 1,000" only if a large share of a creator's committed supporters pay every month, far above what most creator platforms see today, so advertising partnerships are an important second source. The 60-day pilot cannot validate the objective; it measures the leading indicators in section 6.

## 2. Financial reporting definitions

Every financial report keeps these lines separate and never adds across them unless the line says so. All amounts are stored in integer minor units with a currency code; reporting is in USD.

| Line | Definition |
| --- | --- |
| **Gross supporter contributions** | Everything supporters paid (recurring and one-time), before any fee, refund or dispute |
| Refunds and disputes | Refunded amounts and disputes lost, shown separately and deducted below |
| Payment provider fees | Processing, recurring billing, payout and dispute fees charged by the payment provider |
| **Crevant revenue** | Money Crevant keeps: platform fees on support, any commission on advertising partnerships, and in future, membership fees. **0% commission on pilot fan support and hand-brokered partnerships** (approved, subject to legal and financial review), so pilot Crevant revenue is expected to be zero |
| **Net creator earnings from support** | Gross supporter contributions minus refunds, lost disputes, payment provider fees and Crevant's platform fee |
| **Creator advertising revenue** | Value of advertising partnerships to the creator: the gross deal value, and the creator's net share after any Crevant commission and fees |
| **Total net creator earnings** | Net creator earnings from support plus the creator's net advertising revenue. This is the figure used for the long-term objective |
| Hypothetical Support Intent | Stated, nonbinding amounts. Reported in a separate section, clearly labelled, and never added to any line above |

Connection Points appear in no financial report.

**Costs and future commission economics are kept apart from actual results.** During the pilot Crevant records its actual operating costs (hosting, database, email, tools) and the payment provider costs it bears, per active creator. Any future commission is modelled separately as clearly labelled scenarios (for example, what Crevant revenue and net creator earnings would have been at a given commission rate). Scenarios are never reported as actual revenue.

## 3. The Creator Loyalty Network

| Element | Behaviour | Status |
| --- | --- | --- |
| Unlimited following | Anyone can follow and interact with any number of creators | Current model |
| **Core slots** (Core 10 proposed long term) | Users choose a set number of creators from whom they earn Connection Points | **Pilot experiment with Core 3** (section 5). Core 10 is not validated by the pilot |
| **Discovery Slots** | Temporary slots to earn CP with creators outside a user's core choices, without replacing them | **Pilot experiment** (section 5). Not restricted to emerging creators until that definition is validated |
| Paid expansion | An optional paid membership raises the number of creators a user can earn CP with | Hypothesis, after the pilot |
| CP rules | Creator-specific, noncash, nontransferable | Unchanged and non-negotiable |
| Financial support | Voluntary, recurring, and completely separate from CP and from Support Intent | Unchanged principle |

The pilot tests whether limited earning eligibility changes behaviour. It is an experiment, not a permanent product rule, and it does not validate Core 10.

**Open questions before any permanent adoption:**

1. **Paid expansion and "CP can't be bought".** A purchase may only change how many creators a user can earn with. No purchase ever creates CP. Lawyer review for loyalty programme and consumer protection rules in Canada and the US before it is offered.
2. **Swapping a creator out.** Proposed: the balance stays redeemable with that creator; only new earning stops. Swaps have a cooldown so slots can't be rotated to farm points.
3. **Emerging creators.** Discovery Slots are the intended mitigation for a closed market. In the pilot they are open to any creator outside a user's core, and outcomes for emerging creators are tracked separately.
4. **App stores.** Native apps may bring in-app purchase rules for paid membership. The web-only pilot avoids this.

## 4. Architecture principles that must hold

These are the decisions that would be expensive to reverse. PR #7 and the PR 2 migration proposal (Phase 1A) are compatible with all of them.

1. **One account type.** Creator status is derived from activity and never gates features.
2. **Follows are separate from CP earning eligibility.** Separate tables from the start; following someone never implies earning CP from them.
3. **An auditable CP ledger.** Append-only entries per supporter and creator; balances are computed from the ledger; reversals are new entries that point at the original. Each entry records the earning policy and rule version that applied.
4. **Earning rules are configuration.** Unlimited earning and slot-limited earning (Core 3 in the pilot, Core 10 or another size later) are rows of data, not separate code paths or schemas.
5. **CP lives in its own server-only `loyalty` schema**, added to the separation tests so nothing combines CP with `finance`, `intent` or `sim`.
6. **Money lives only in `finance`**, in integer minor units with currency, on a separate production database before any real payment.

### What each phase does (and does not) add

* **Phase 1B:** no new loyalty infrastructure. If the pilot needs cohorts assigned at sign up, Phase 1B includes the **design** of experiment assignment so the data model is ready; it is implemented only if needed then. The emerging-creator definition (section 5) is proposed for validation and used for **reporting only**; nothing restricts features by it until it is validated.
* **Phase 1C:** the CP engine, built on the `loyalty` schema, with **earning-attempt tracking implemented alongside it**, and the Core 3 plus 2 Discovery Slots experiment (section 5).

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

## 5. Pilot experiment: Core 3 plus Discovery Slots versus unlimited earning

**Approved as a small pilot experiment only.** It tests whether limited earning eligibility changes behaviour. It does not validate Core 10, or any slot number, as a permanent product rule. The founder retains final authority over the experiment.

**Design**

* **Unit:** supporters (users), randomly assigned 50/50 when they join the pilot: **control** (unlimited earning) or **treatment** (Core 3 plus 2 Discovery Slots). Creators have supporters in both arms. Assignment is recorded in `policy_assignments` and never changes during the pilot.
* **Consent:** participants are told that some features differ between groups as part of the research. **The consent wording is reviewed and approved by the founder before anyone is enrolled** (section 9).

**Treatment rules (stored as policy data)**

* **Core 3:** the user picks up to 3 creators to earn CP with. A creator who invited the user fills the first slot by default; the user can change it.
* **Discovery Slots:** 2 slots, each lasting 14 days, usable with **any creator outside the user's Core**. A discovery creator can be promoted to a Core slot if one is free.
* **Swaps:** 7-day cooldown per slot. Removing a creator stops new earning; their existing balance stays redeemable.
* **Messages:** clear explanations when an action doesn't earn ("You're not earning Connection Points with Maya yet. Add her to your Core or a Discovery Slot to start.").

**Minimum product surface (treatment arm only):** a "Your Core" picker listing followed creators; a "Try earning with this creator" action on other creators' profiles for Discovery Slots; the not-earning messages above. The control arm sees nothing new. No paid expansion.

**Emerging creators: tracked, not restricted.** Proposed definition, to be validated with pilot data: an account that publishes at least one post during the pilot, was **not** recruited or invited by Crevant as a creator, and had fewer than 100 followers when the pilot began. It is used only to report emerging-creator outcomes separately (Discovery Slot use, CP earned, new supporters). Restricting Discovery Slots to emerging creators is a later decision, made only after the definition is validated.

**Measures**

* **Primary:** depth of loyalty: active days per supporter-creator pair, and Committed Supporters per creator.
* **Secondary:** breadth (creators engaged per supporter); Discovery Slot use and promotion to Core; outcomes for emerging creators; supporter retention; reward redemption; conversion to real or hypothetical support (reported separately); a short satisfaction survey.
* **Guardrails:** drop in overall engagement; complaints about the slot limit; any farming patterns.

The analysis plan and measures are written down before the pilot starts. With a few hundred supporters, results are directional and reported as such.

### Immediate pause conditions

The founder has final authority over the experiment and over real-money features: whether to resume, change or end them. To keep participants safe, **any of the conditions below triggers an immediate pause**, without waiting for a scheduled review. The founder and any operator the founder designates may pause; only the founder may resume.

**Loyalty experiment** (pause means: every participant temporarily returns to unlimited earning; no CP is removed):

* CP is credited twice, to the wrong person or creator, or not at all for eligible actions, beyond isolated cases that are corrected the same day.
* Earning decisions contradict the assigned policy (for example, a control user is limited, or a treatment user earns outside their slots).
* Ledger balances don't match the ledger entries.
* Any exposure of one user's data to another.
* A guardrail is breached, or participants report confusion or harm the team can't resolve quickly.

**Real recurring support and partnership records** (pause means: stop new sign-ups and checkouts; pause renewals with the payment provider if needed; never delete records):

* Any unexpected, duplicate or incorrect charge.
* Webhook failures or a backlog that leaves payments unrecorded.
* A reconciliation difference between the payment provider and `finance` records that can't be explained.
* A rise in refunds or disputes, or any sign of fraud.
* Any security issue affecting payment data, secrets or admin tools.
* A legal or payment-provider concern raised about the programme.

Each pause is logged with the time, reason, who paused it, and the steps taken. A written note goes to the founder before anything is resumed. The technical "pause switch" for each feature is part of its build and is tested before launch.

## 6. Updated 60-day pilot measurement plan

Additions to the plan in `docs/PHASE-1A.md` and the original plan. The financial lines follow section 2. Hypothetical and real money are never combined. Internal accounts are excluded.

| Area | Measures |
| --- | --- |
| **Creator income** (real money, limited cohort) | Total net creator earnings per creator per month, split into net support earnings and advertising revenue; monthly run-rate; share of creators with any earnings; share above $100, $500, $1,000 and $5,000 a month; reported for active creators (the objective's denominator), monetization-eligible creators and registered creators |
| **Recurring supporter payments** | Gross supporter contributions; paying supporters per creator; conversion from Active Supporter to paying; average monthly amount; new, cancelled and failed payments; refunds and disputes |
| **Crevant revenue** | Shown separately (expected to be zero during the pilot at 0% commission) |
| **Value per supporter** | Net creator earnings per Active Supporter and per Committed Supporter, with hypothetical Support Intent per supporter alongside in a separate column |
| **Loyalty** | Followers, Active and Committed Supporters; supporter retention week to week; reward redemption; how concentrated each user's CP is across creators; the experiment measures in section 5 |
| **Emerging-creator discovery** | Using the proposed section 5 definition, tracked separately: new supporter relationships with emerging creators per week; share of CP earned by emerging creators; time to first 10 Active Supporters; Discovery Slot use with emerging creators compared with other creators |
| **Income distribution** | Share of total net creator earnings, CP and Active Supporters held by the top 10% of creators; a concentration index for each; comparison with the long-term objective as a reference line |
| **Advertising partnerships** | Partnerships offered and completed; gross deal value; creator net share; Crevant commission (if any); disclosure compliance; brand and creator satisfaction |
| **Costs** | Actual operating cost per active creator; payment provider fees as a share of gross contributions; future commission scenarios modelled separately and labelled as scenarios |

## 7. Real recurring support (limited creator cohort)

**Provisionally approved for 3 to 5 creators**, web only. It stays completely separate from CP and from Support Intent. **Minimum contributions, transaction currencies and payment tiers are deferred** until the payment provider's constraints and the participants' countries have been reviewed. Reporting is in USD, converting other currencies at a documented rate. **It is not activated until every item in the readiness checklist (section 9) is complete and the founder approves activation.**

Minimum infrastructure:

1. **Payment provider:** Stripe Connect with Express accounts (creator verification and payouts on Stripe's hosted pages) and Stripe Billing for monthly support. Hosted Checkout and the hosted customer portal, so Crevant never handles card details. 0% Crevant commission during the pilot, subject to legal and financial review. Fees, supported countries and currencies confirmed with the provider at decision time; Stripe is the working assumption, not a final choice.
2. **Server code:** an Edge Function to create checkout sessions, and a webhook Edge Function that verifies signatures, ignores duplicates and records events. Secret keys only in Edge Function secrets.
3. **Data:** `finance` tables for connected accounts, subscriptions, payments, refunds and disputes, following section 2. RLS: supporters see their own payments; creators see their own totals. Separation tests extended.
4. **Production environment:** a separate production Supabase project (paid plan, backups) in its own organisation, and commercial-use hosting.

## 8. Hand-brokered advertising partnership test

A small number of brand partnerships brokered by hand for pilot creators. **No automated advertising marketplace and no ad serving.**

1. **Payment: brands pay creators directly.** Crevant does not hold or move partnership money in the pilot. 0% Crevant commission, subject to legal and financial review.
2. **Written terms for every partnership:** an agreement between brand and creator (from a reviewed template) covering deliverables, dates, payment amount and timing, disclosure, content approval, and Crevant's limited role as introducer and record keeper.
3. **Clear disclosures:** a "Paid partnership" label on the creator's posts, meeting US and Canadian advertising disclosure rules.
4. **Records:** an admin-only record of each partnership in `finance` (gross deal value, creator net share, dates, deliverables, status), with confirmation from the creator when payment is received, and a copy of the signed terms stored securely. A simple post performance summary for the brand from existing analytics.
5. **Legal:** template review, disclosure rules, brand safety and content guidelines.

## 9. Readiness checklist before any real-money launch

Every item must be complete, with evidence, and the founder must approve activation. This applies to recurring support and to any partnership payment that flows through Crevant.

**Legal and policy**

- [ ] Legal and financial review of the 0% commission approach
- [ ] Legal entity able to contract and receive payouts
- [ ] Lawyer review (Canada and US) of creator terms, supporter terms, refund and dispute policy, partnership agreement, and disclosure rules
- [ ] Privacy notice updated for payment data
- [ ] **Participant consent wording reviewed and approved by the founder before enrollment** (experiment and payment cohort)
- [ ] Payment provider, supported countries, currencies, minimum contribution and tiers decided for the participants' countries
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
- [ ] Incident plan, including the pause conditions in section 5, and each pause switch tested
- [ ] Founder sign-off on activation

## 10. Roadmap (approved in principle)

| Phase | Plan |
| --- | --- |
| **1A** | No change. PR #7 stays as reviewed, with separate approval. PR 2 migration proposal keeps one account type and creates no CP, follow or money tables. Hosting options presented to the founder at the end of Phase 1A. |
| **1B** | Invitations, onboarding and profiles as planned. Design experiment assignment if the pilot needs cohorts at sign up (implement only if needed). Propose the emerging-creator definition for validation (reporting only). No new loyalty infrastructure. |
| **1C** | Real posts, follows, comments and rewards. CP engine on the `loyalty` schema with an auditable ledger and earning-attempt tracking. Core 3 plus 2 Discovery Slots (14 days) experiment against unlimited earning, with tested pause switches. |
| **1D** | 1D-1: real recurring support for 3 to 5 creators (provisional), activated only after the readiness checklist. 1D-2: hand-brokered advertising partnership test, brands paying creators directly. 1D-3: measurement dashboard with the section 2 financial lines and section 6 measures. |
| **After the pilot** | Decide whether to adopt any slot-based loyalty model permanently, and at what size (the pilot does not validate Core 10). Paid expansion only after consumer billing, pricing and legal review. |

**Preliminary estimates (to be confirmed):** real recurring support and the partnership test add roughly 3 to 4 weeks of development across Phases 1C and 1D, with legal work in parallel; the experiment adds roughly 1 week to Phase 1C. The pilot start may move accordingly. Added running costs are mainly a paid production Supabase plan (about $25 a month), commercial hosting (about $0 to $20 a month depending on provider), payment provider fees on real volume, and legal fees (to be quoted).

## 11. Decisions

### Decided by the founder

1. **Creator groups:** registered, active and monetization-eligible creators are reported separately. Payment verification is not required to count as active. The long-term objective uses **active creators** as its denominator, with monetization-eligible results reported separately (section 1).
2. **Loyalty experiment:** Core 3 plus 2 Discovery Slots for 14 days, as a small pilot experiment only. It tests whether limited earning eligibility changes behaviour and does not validate Core 10 (section 5).
3. **Discovery Slots are not restricted to emerging creators** until the definition is validated. Emerging-creator outcomes are tracked separately (section 5).
4. **0% Crevant commission** on pilot fan support and hand-brokered partnerships, subject to legal and financial review. Actual operating and payment costs are recorded, and future commission economics are modelled separately (section 2).
5. **Real recurring support for 3 to 5 creators, provisionally approved** (section 7).
6. **Advertising pilot:** brands pay creators directly, with clear partnership disclosures, written terms and appropriate records (section 8).
7. **Hosting options** will be presented at the end of Phase 1A.
8. **Authority and safety:** the founder retains final authority over the experiment. The plan defines conditions for immediately pausing unsafe or malfunctioning features (section 5).
9. **Consent:** participant consent wording must be reviewed before enrollment (sections 5 and 9).

### Still open

1. Minimum contributions, transaction currencies and payment tiers for real support, after reviewing payment provider constraints and participants' countries.
2. Payment provider choice (Stripe is the working assumption).
3. Validation of the proposed creator-group definitions and the emerging-creator definition with pilot data.
4. Specific guardrail thresholds for the experiment, written into the analysis plan before the pilot starts.
5. Which operators the founder designates as able to pause features.
6. The consent wording itself, drafted for the founder's review.
7. Production hosting provider, after the end-of-Phase 1A comparison.
