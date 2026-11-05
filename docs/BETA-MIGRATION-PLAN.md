# Crevant 60-day pilot: development plan

**Status:** approved by the founder, with three adjustments under review (tipping economics wording, Canadian and US creators, pilot timeline). Phase 0 engineering is in PR #5; nothing is merged, provisioned, or live.
**Goal:** build a real MVP and run a 60-day pilot with creators and fans, to produce credible evidence for fundraising.
**Branding:** Crevant. All naming and logo changes are paused (Appendix A). The repository and the live demo (`crevant-prototype.vercel.app`) stay unchanged.

Contents

1. Pilot objectives and hypotheses
2. Decisions log
3. Minimum architecture
4. Data separation: real activity, real money, simulation, analytics
5. Feature scope and priorities
6. Public landing page
7. Accounts, invites, profiles
8. Publishing, video, carousels, feed, engagement
9. Connection Points and rewards
10. Direct tipping (80:20 after processing fees)
10a. Canadian and US creators: evaluation
11. Financial reconciliation
12. Free analytics and Creator Pro
13. Simulated advertising
14. Safety, privacy, moderation, account deletion
15. Pilot analytics and metric definitions
16. Investor dashboard
17. Phases: dependencies, deliverables, tests, risks, costs, effort
18. Launch readiness criteria
19. Pilot timeline and 60-day measurement plan
20. Costs
21. Risks to the credibility of investor results
22. Founder setup checklist
23. Sources
24. How this plan was produced
Appendix A. Paused: FlipSocial working name and logo concept

---

## 1. Pilot objectives and hypotheses

Validate whether Crevant can become a scalable, creator first social network.

| # | Hypothesis | Main evidence |
| --- | --- | --- |
| H1 | Creators value predictable access to their followers through a chronological feed | Post reach consistency, creator posting retention, creator surveys |
| H2 | Connection Points and creator rewards encourage meaningful participation and repeat engagement | Engagement quality, repeat fan and creator relationships, redemptions, fan retention |
| H3 | The proposed revenue model (80:20 tips, Creator Pro, simulated ads) is compelling enough to motivate creator adoption, while real ad economics remain unvalidated | Real tips and Pro conversions; surveys and interviews about the ad model; carousel ad slot opt in |

**Recruitment targets** (goals, not assumed outcomes): 20 active creators and 200 to 300 registered fans, with a staggered rollout over 60 days. Creators invite fans from their existing audiences.

**Not allowed:** manufactured or seeded traction. The beta contains no seeded people, posts, engagement, tips, or reviews.

---

## 2. Decisions log

| # | Decision |
| --- | --- |
| D1 | Shared multi user app: Supabase (Postgres, Auth, Storage, Edge Functions), Vercel frontend |
| D2 | Unified experience: everyone can follow and create |
| D3 | Chronological Following feed, no ranking |
| D4 | Creator specific Connection Points (CP), enforced on the server; CP never touches money |
| D5 | Real non monetary rewards with manual fulfilment |
| D6 | Creators see participation and CP earned with them, with clear disclosure |
| D7 | 18+ only |
| D8 | Video upload and playback; no watch CP |
| D9 | Separate staging and beta environments |
| D10 | Blocking, reporting, prioritised moderation queue, emergency escalation; no automatic global hiding |
| D11 | Mux is the preferred video service, subject to official pricing verification |
| D12 | Crevant branding kept; FlipSocial name and logo **paused** |
| D13 | **Direct tips are real.** The actual payment processing fee on each tip is deducted first; the remaining eligible net amount is split 80% creator, 20% Crevant. Refunds, disputes, payout fees, Connect account fees, and currency conversion on transfers are **separate costs**, never part of the split (section 10, Money rules) |
| D14 | Tip policy for the pilot: tips from 3 to 100 in the tip's currency; Crevant absorbs the separate costs (refund fees, dispute fees, Connect account and payout fees, transfer conversion), so creators keep a clean 80% of net; refunds only for errors or fraud; weekly creator payouts. **Geography under evaluation:** Canadian and US creators (section 10a). Not expanded in the build until confirmed |
| D15 | **Creator Pro:** free trial, then paid; proposed $19 a month (not final); no card for the trial; eligible after 7 days on Crevant and 3 posts; never charged without explicit authorisation. Trial length: 21 days approved; **14 days recommended** so conversions fall inside the measurement window (section 19) |
| D16 | **Advertising simulated for the whole pilot.** Feed ads: 100% Crevant in the model. Ads in creator carousels: 50:50 in the model. Illustrative only, never payable, never added to real balances |
| D17 | Public landing page is the first experience; the platform stays invite only |
| D18 | **Staged rollout before measurement (recommended, awaiting confirmation):** features are staged during a founding creator rollout period, so tipping and Pro eligibility are live from Day 0 of the 60-day measurement window and every cohort has the same product. A 30-day follow-up window observes first renewals, late refunds, and disputes (section 19). Replaces the earlier in-pilot staging (tips day 14, Pro day 21) |
| D19 | Weekly email digest included (opt out) |
| D20 | Financial reconciliation is a launch requirement for tipping, not a later feature |

---

## 3. Minimum architecture

| Layer | Service | Purpose |
| --- | --- | --- |
| Frontend | Vercel Pro | React app and public landing page |
| Data, auth, storage, server code | Supabase | Postgres, Auth (one time codes), Storage (images), Edge Functions (webhooks and server actions), `pg_cron` (scheduled jobs) |
| Video | Mux | Direct uploads, conversion to universally playable streams, signed playback |
| Money | Stripe: **Connect** for tips, **Billing** for Creator Pro | Hosted checkout, creator identity checks and payouts, subscriptions |
| Email | Resend (paid tier) | Sign in codes, invites, digest, alerts |

No servers of our own.

**Server functions (Supabase Edge Functions):**

- **Content:** `submit-application`, `redeem-invite`, `create-video-upload`, `mux-webhook`, `video-playback-token`.
- **Payments:** `stripe-connect-onboard`, `create-tip-checkout`, `create-pro-checkout`, `stripe-portal-session`, `stripe-webhook` (one endpoint for platform and Connect events).
- **Accounts and safety:** `delete-account`, `emergency-alert`.

**Scheduled jobs (`pg_cron`):** `reconcile-finance` (daily), `send-digest` (weekly), `purge-retention` (daily), `metric-snapshot` (weekly).

**Client libraries:**

- `@supabase/supabase-js` and `@tanstack/react-query`.
- Mux upload and player components.
- Stripe is used only through hosted Checkout and the customer portal, so card data never touches Crevant.

---

## 4. Data separation: real activity, real money, simulation, analytics

| Schema | Holds | Access |
| --- | --- | --- |
| `public` | Real activity: profiles, posts, follows, engagement, CP, rewards | Members, under row level security |
| `finance` | Real money: tips, ledger, transfers, payouts, refunds, disputes, subscriptions, Stripe events, reconciliation | Server functions; each person sees only their own records; admins |
| `sim` | Simulated advertising: fictional campaigns, ad slots, impressions, illustrative earnings | Members see their own illustrative figures; admins |
| `analytics` | Pilot measurement: events, post views, cohorts, snapshots, costs | Admins only |

**Enforcement, not just intent:**

- **Database:** `sim` and `finance` have separate grants. No view or function may reference both; an automated CI check fails any migration that tries. Members and anonymous visitors have no direct access to `finance`, `sim`, or `analytics` tables; they go through views and functions that apply row rules.
- **App code:** real money and illustrative amounts are different TypeScript types. Illustrative amounts render only through an `IllustrativeAmount` component that always shows "Illustrative, not payable".
- **Pages:** simulated earnings are never added to real balances, never shown on the Earnings page, and never sent to Stripe.

---

## 5. Feature scope and priorities

| Priority | Feature |
| --- | --- |
| Must | Public landing page and pilot applications |
| Must | Invite only accounts with **creator invite links**, fan invites, referral attribution |
| Must | Profiles with pictures; research consent; 18+; guidelines |
| Must | Text, image, **carousel**, and video posts; chronological feed; follows, likes, comments, saves |
| Must | Server side creator specific CP; real non monetary rewards and fulfilment |
| Must | Free creator analytics (real, never simulated) |
| Must | Reporting, blocking, moderation queue, emergency escalation, account deletion |
| Must | Pilot analytics, internal account flagging, investor dashboard, data quality checks |
| Must (live from Day 0; proven during rollout) | Real tipping with Stripe Connect, finance ledger, reconciliation |
| Must (eligible from Day 0) | Creator Pro trial and subscription |
| Should | Simulated feed and carousel advertising with illustrative earnings |
| Should | In app surveys (creators days 14 and 45; fans day 30); weekly email digest |
| Paused | FlipSocial rename and logo |
| Deferred | Real advertising, ad billing, ad payouts, algorithmic ranking, DMs, push notifications, native apps, watch CP, public profiles, partial refunds, multiple currencies |

---

## 6. Public landing page

Signed out visitors see the landing page; signed in members go to their feed.

**What it explains:**

- What Crevant is, and why creators and fans should join.
- The chronological feed, and how Connection Points and rewards work.
- How creators earn: tips are real; ads are simulated during the pilot.
- What Creator Pro offers, at a proposed price.
- How to apply for the pilot.

**Application form:**

- Stores the minimum needed, with consent.
- Protected by a hidden honeypot field and rate limiting.
- Applications not selected are deleted after the pilot.

**Honesty rules:**

- No invented user counts or testimonials. Ads are described as a demonstration. The Pro price is "proposed".
- Links to terms, privacy, refund policy, and contact details are included. Stripe also requires these for account approval.

---

## 7. Accounts, invites, profiles

**Sign in.** Email one time code (6 digits plus a magic link). Public sign ups are disabled in Supabase Auth.

**Invites:**

- Admins invite recruited creators.
- Each creator has a personal invite link capped at 25 fan sign ups (adjustable). Each fan has 3 invites.
- The `redeem-invite` function checks that the code is valid, unexpired, and under its cap. It then creates the account and records the inviter, the channel (admin, creator, or fan), and a timestamp.

**Onboarding:**

- Display name and unique handle.
- 18+ confirmation and acceptance of the community guidelines (version stored).
- Supporter visibility disclosure and research participation consent.
- Choosing who to follow, with suggestions from real members.

**Pilot role labels (analysis only, never a product role):**

- `recruited_creator`: invited by an admin.
- `fan`: invited through a creator or fan link.
- **Emergent creator:** a fan who publishes.

**Internal accounts.** Team, testers, and moderators have `is_internal = true` and are excluded from every metric.

---

## 8. Publishing, video, carousels, feed, engagement

**Post types:**

- Text, up to 500 characters.
- One image.
- **Carousel:** 2 to 10 images.
- One video: up to 60 seconds, through Mux.

**Video with Mux:**

- The browser uploads directly to Mux. A webhook marks the post ready once Mux has converted the video to streams that play everywhere.
- Viewers get a short lived signed playback token. Video plays on tap, never autoplays with sound, and nothing loads until tapped.
- **Caps:** 1080p, the basic quality tier, 5 uploads a day and 30 a month per member, and a kill switch.
- **Evidence:** a headless Chromium test played H.264 but failed to decode HEVC, the format iPhones record by default. Mux converts it.
- **Fallback:** if Mux's official pricing does not hold, use direct Supabase delivery with an H.264 only upload gate (see Sources).

**Following feed:**

- Your own posts plus those of people you follow, strictly newest first.
- Keyset paging on (`created_at`, `id`).
- Simulated ads are inserted by a fixed slot rule that never changes organic order.

**Engagement.** Follow, like, save, and comment go through database functions. Each writes the action and any CP in one transaction and returns the outcome message.

**Post views.** A post counts as seen when at least 50% is visible for at least 1 second. Each person and post is recorded once, which powers reach.

---

## 9. Connection Points and rewards

**CP rules carried over from Release 1, now enforced server side:**

- Values and daily limits from `cp_rules`, with daily limits resetting at midnight UTC.
- Once per item.
- No CP from your own content.
- Follow bonus held while following and reversed on unfollow, with any shortfall owed.
- Comment quality checks in SQL. One shared set of test cases covers both client and server.

**Redemption:**

- Locks the wallet and the reward.
- Re checks following, balance with that creator, stock, block status, and prior redemption.
- Uses an idempotency key, so a retry never redeems twice.

**Fulfilment:**

- Each reward says how it will be delivered.
- The fan can add a note (280 characters).
- The creator marks it fulfilled or declined. A decline refunds the CP.
- Rewards may not be cash or cash equivalents.

**CP and money are completely separate.** Tips earn no CP, and CP can never be bought, sold, transferred, or exchanged for money.

---

## 10. Direct tipping (80:20 after processing fees)

### How Stripe supports the split

- **Funds flow: separate charges and transfers.**
  1. The fan pays Crevant's platform account through Stripe hosted Checkout.
  2. After success, we read Stripe's **actual** fee from the charge's balance transaction (gross, fee, net).
  3. We calculate the split, then create a **transfer** of the creator share to the creator's connected account. The transfer passes the charge as `source_transaction`, so it becomes available when the charge's funds do.
  4. Crevant's share remains on the platform.
- **Why not destination charges:** they require the platform fee at charge time, before the actual fee is known.
- **Delayed fee information:** with asynchronous capture, the balance transaction can arrive later in a `charge.updated` event, which Stripe documents as within about an hour. The tip stays "processing" until the fee is known. This delays the start of the creator's pending period, not settlement itself, which follows Stripe's availability schedule.
- **Fee payer:** under this flow Stripe assesses processing fees on the platform account, and the platform carries negative balance liability for connected accounts.
- **Creator onboarding:** Stripe hosted Express onboarding handles identity verification and bank details. Eligible creator countries are under evaluation (section 10a).

### Calculation (integer cents, server side)

- `net = gross − actual_fee`
- `creator = round_half_up(net × 0.80)`
- `crevant = net − creator`, so the two always sum to `net`

**Example:** gross $10.00, fee $0.59 (hypothetical), net $9.41, creator $7.53, Crevant $1.88.

### Money rules: what is inside the 80:20 split and what is not

**Inside the split (deducted before splitting):**

- The **processing fee** is the total fee Stripe deducts on that tip's charge, as shown on its balance transaction. This includes the card fee, any international card surcharge, and any currency conversion Stripe applies to the charge itself.
- Whether sales tax that Stripe charges on its own fee (for example GST or HST on a Canadian account) counts as part of the processing fee is a question for the accountant. Until confirmed, it is recorded on its own line and treated as part of the processing fee.

**Outside the split (separate costs, recorded on their own ledger lines, never deducted from the creator's 80%):**

| Cost | When it happens | Who bears it in the pilot | Effect on the creator |
| --- | --- | --- | --- |
| Processing fee not returned on a refund | A tip is refunded (errors or fraud only) | Crevant | The creator's allocation for that tip is reversed, because the fan got the money back. Nothing more is taken from the creator |
| Dispute fee | A fan's bank opens a dispute | Crevant | None beyond the reversal below |
| Disputed amount, if lost | Dispute lost | Creator and Crevant allocations reversed; Crevant absorbs any part the creator was already paid out | The creator's allocation for that tip is reversed if still in their Stripe balance; if already paid out, Crevant absorbs it during the pilot |
| Connect active account fee | Each month a creator receives a payout | Crevant | None |
| Payout fees | Each payout to a creator's bank | Crevant | None |
| Cross border and currency conversion costs on transfers | Only if Crevant's balance currency differs from the creator's (section 10a) | Crevant | None |
| Stripe Billing fees | Creator Pro subscriptions only | Crevant (separate flow) | Not related to tips |

**Reporting.** Creator earnings are always reported as the sum of creator allocations on completed tips. Crevant's tip revenue is reported twice: before and after these separate costs. Separate costs are never netted into the processing fee.

**Test vectors** (become automated tests in Phase 5):

| Gross | Fee | Net | Creator 80% | Crevant 20% |
| --- | --- | --- | --- | --- |
| 10.00 | 0.59 | 9.41 | 7.53 | 1.88 |
| 3.00 | 0.39 | 2.61 | 2.09 | 0.52 |
| 100.00 | 3.20 | 96.80 | 77.44 | 19.36 |
| 7.77 | 0.53 | 7.24 | 5.79 | 1.45 |

Each row sums exactly: creator plus Crevant equals net, and net plus fee equals gross. Fees shown are examples; real fees come from Stripe.

### Tip states

| State | Meaning | Stripe trigger |
| --- | --- | --- |
| Processing | Paid; actual fee not yet known | `payment_intent.succeeded` / `charge.succeeded` |
| Pending | Split recorded and transfer created; funds not yet available | Balance transaction received; `transfer.created` |
| Available | In the creator's Stripe balance | Availability date passed |
| Paid out | Included in a payout to the creator's bank | Connected account `payout.paid` |
| Refunded | Reversed | `charge.refunded`; transfer reversal |
| Disputed | Bank dispute open, won, or lost | `charge.dispute.*` |

### Product rules

- **Where:** fans tip from a creator's profile or from that creator's posts, once the creator's payouts are enabled.
- **Amounts:** $3, $5, and $10 suggestions, or custom from $3 to $100.
- **Before paying,** the fan sees the amount, an estimated fee, and the approximate creator and Crevant shares.
- **Afterwards,** receipts and the creator's Earnings page show the **actual** gross, fee, net, creator share, and Crevant share for every tip.
- **Messages:** an optional short message, which goes through moderation. Tips are private between the fan and the creator; there are no leaderboards.
- **Restrictions:** no tipping yourself, and no tips between blocked accounts.
- **No duplicates:** every Stripe event is stored by its unique ID and processed once.

### Refunds, disputes, failures (pilot policy, D14)

- **Refunds:** full refunds only, for errors or fraud, at Crevant's discretion. Creator and Crevant shares are reversed. Stripe does not return its processing fee on refunds; **Crevant absorbs it**.
- **Disputes:** the creator transfer is reversed where possible. Crevant absorbs the dispute fee (about $15 in the US; confirm the Canadian amount), and any shortfall if the creator has already been paid out (limited by the 100 cap). A won dispute restores the shares.
- **Failed payments** never create a tip.
- **Connect costs:** about $2 per creator paid out in a month, plus 0.25% and 25¢ per payout (US figures; Canadian pricing to be confirmed), absorbed by Crevant. Payouts are weekly.

### Legal and tax (counsel and accountant)

- Tip terms and refund policy.
- How Crevant's share and subscription revenue are treated for tax.
- Creator tax forms (Stripe Connect offers them).
- Sales tax on subscriptions.

**This plan is not legal or tax advice.**

---

## 10a. Canadian and US creators: evaluation

**Status:** evaluated, not implemented. The build stays single country until the founder decides and Stripe confirms the points below.

**Key correction.** Crevant is developed from Canada, so its Stripe platform account would normally be opened by the Canadian entity, as a Canadian Stripe account. A "US only" pilot would then be a cross border setup, not the simplest one. The real choice is between **Canada only** and **Canada plus US**.

### What Stripe supports

- **Funds flow.** Stripe's documentation for separate charges and transfers lists cross border transfers on the payments balance as supported between the United States, Canada, the United Kingdom, the EEA, and Switzerland. A Canadian platform transferring to US creators, and to Canadian creators, is therefore within the documented corridors.
- **Restriction.** Stripe's cross border payout documentation describes this as working for separate charges and transfers **without** `on_behalf_of`, which matches our design. It also notes limits for accounts on the "recipient" service agreement. Which service agreement our creators' Express accounts use must be confirmed with Stripe.
- **Onboarding.** Stripe hosted Express onboarding is available for both Canadian and US individuals. Each creator onboards in their own country, and Stripe verifies identity and bank details.

### Currencies

**Recommended design:** each creator's tips are charged in the creator's own currency. Canadian creators receive tips in CAD; US creators in USD.

- **CAD tips to Canadian creators:** domestic for Crevant. No conversion.
- **USD tips to US creators:** Crevant's Canadian account receives USD. If the account can hold and settle USD, the creator's transfer is made in USD with no conversion. Third party sources disagree on whether a Canadian account can settle in USD, so this must be confirmed with Stripe. If it cannot, Stripe converts USD to CAD on the charge (a fee inside the processing fee, which lowers the net before the split), and converts again on the transfer to the US creator (a separate cost Crevant absorbs). That double conversion is the main cost risk of including US creators.
- **Fans paying across the border** (a Canadian fan tipping a US creator, or the reverse) use an international card. Stripe adds an international card surcharge, which is part of the processing fee, and the fan's bank may add its own foreign exchange fee.

### Costs

Canadian pricing figures are from third party guides and are **not verified**.

| Item | Canadian Stripe account (unverified) |
| --- | --- |
| Domestic card | about 2.9% plus C$0.30 |
| International card surcharge | sources disagree: 0.8% or 1.5% |
| Currency conversion | about 2% for non US accounts |
| Cross border payouts | Stripe documents a 0.25% fee per cross border payout |
| Connect active account and payout fees | Canadian amounts not found; confirm |
| Dispute fee | Canadian amount not found; confirm |

### Implications for the build

- Every money amount already carries a currency. Reconciliation, ledgers, and reports run **per currency**.
- Investor reports show CAD and USD separately, plus a combined figure converted at a stated rate, with the rate source shown.
- Tip presets per currency: for example C$3, C$5, C$10 and US$3, US$5, US$10, with the 3 to 100 range in each currency.
- **Creator Pro** is priced in each currency (for example US$19 and a CAD equivalent to be set).
- **Testing.** Phase 5 tests cover four routes: Canadian fan to Canadian creator, US to US, Canadian to US, and US to Canadian.
- **Effort.** About 1 to 2 extra working sessions over a single currency build, plus Stripe confirmations before starting.

### Tax and reporting (accountant and counsel)

These are not answered here and are not tax advice:

- GST or HST registration and collection for Crevant's commission and Creator Pro.
- US sales tax on subscriptions.
- Whether Canada's reporting rules for digital platform operators (Part XX) apply to tips through Crevant.
- What reporting a Canadian platform owes for US creators (for example Form 1099 obligations).
- Whether Stripe's tax form features are available to a Canadian platform.

### Questions for Stripe before deciding

1. Can Crevant's Canadian platform account hold and settle USD (multi currency settlement), so USD tips are transferred to US creators without conversion?
2. For a Canadian platform using separate charges and transfers to US Express accounts: which service agreement applies, and what fees apply to transfers and payouts?
3. Canadian Connect pricing: active account fee, payout fees, and dispute fee.
4. Is a tipping or creator support platform an accepted business type for Connect in both countries?
5. Are negative balance liability and transfer reversals handled the same way for US and Canadian connected accounts?

### Recommendation

- **If Stripe confirms USD settlement and the cross border transfer terms:** support Canadian and US creators, each paid in their own currency. This widens creator recruitment and adds about 1 to 2 sessions of work.
- **If not:** launch with **Canadian creators only, in CAD**, which is domestic and simplest for a Canadian company, and add US creators after the pilot. Fans in either country can still tip Canadian creators.
- Do not expand the implementation until the founder decides and Stripe confirms.

---

## 11. Financial reconciliation

A launch requirement for tipping (D20). Every $10 contribution must be traceable from Stripe to fee, creator allocation, Crevant commission, transfer, and payout, including refunds and disputes.

**Balanced ledger (`finance.ledger_entries`):**

- Every financial event posts entries that sum to zero, across accounts such as fan contributions, processing fees, creator payable (per creator), Crevant revenue, refunds, and disputes.
- Entries are append only; corrections are new entries.

**Trace view, one row per tip:**

- PaymentIntent, charge, and balance transaction (gross, fee, net).
- Allocation (creator, Crevant) and transfer.
- Connected account payout.
- Refund, transfer reversal, or dispute.

**Daily job `reconcile-finance`:**

- **Matching:** every Stripe charge has exactly one tip, and every tip has exactly one charge.
- **Amounts:**
  - gross, fee, and net match Stripe;
  - creator plus Crevant equals net;
  - each transfer equals the creator share;
  - payouts match;
  - the ledger balances.
- **Exceptions:** mismatches go to `finance.reconciliation_exceptions`, with an admin alert email.

**Month end.** A CSV export for the accountant.

---

## 12. Free analytics and Creator Pro

**Free for every creator.** Follower counts, post reach, likes, comments, saves, basic engagement, CP and reward management, and complete earnings, fees, and payout status. These are never restricted by subscription status.

**Creator Pro.** It answers: what is working, who am I connecting with, and what should I do differently to grow?

Every insight shows its sample size. When the minimum below is not met, the page shows "Not enough data yet" and what is needed. Nothing is invented.

| Feature | Shows | Minimum data |
| --- | --- | --- |
| Format performance | Median reach and engagement for text, photo, carousel, video | At least 3 posts per compared format |
| Supporter relationships | Returning vs new supporters; supporters quiet for 14 days | At least 10 supporters |
| Content to tip | Tips made from a post; tips within 72 hours of viewing a post (labelled correlation) | At least 5 tips |
| Audience timing | When followers are active; suggested posting windows | At least 20 followers and 14 days |
| Recommendations | Plain, evidence based suggestions with sample sizes | Only when the supporting insight is available |

**Trial and billing:**

- **Trial:** 21 days (configurable), no card. Eligible after 7 days on Crevant and 3 posts; one trial per account.
- **Trial end:** an automatic downgrade to Free. **Nothing is ever charged without explicit authorisation.**
- **Reminders:** in app and by email, 3 days before the trial ends, with the price and how to subscribe.
- **Subscribing:**
  - Stripe hosted Checkout, showing the price ($19 proposed), renewal date, and cancellation terms beforehand.
  - Cancellation and payment details through the Stripe customer portal. Cancellation takes effect at the end of the paid period.
  - Failed renewals: Stripe retries, with a 7 day grace period, then downgrade.
- **Data is preserved** on downgrade.
- **Kept distinct from tips:**
  - Subscriptions use Stripe Billing on Crevant's own account; tips use Connect.
  - They have separate products, metadata (`flow = pro_subscription` vs `flow = tip`), webhook handlers, finance tables, and reports.

---

## 13. Simulated advertising

**Feed ads:**

- One slot after every 6th organic post. Never first, never two in a row, none in feeds with fewer than 6 posts.
- **Organic order never changes** (automated invariant test).
- Model: **100% Crevant**.

**Carousel ads:**

- When publishing a carousel of 4 or more images, a creator can reserve one ad slot. It is never on the first slide, and there is at most one per carousel.
- Crevant chooses the fictional ad. If none is available, the slot is omitted and the carousel shows only the creator's images, with no blank slide.
- Model: **50:50** creator and Crevant.

**Labels and behaviour:**

- Every ad is labelled as a demo from a fictional advertiser.
- Tapping opens an explanation sheet. No external links, no targeting.

**Illustrative earnings:**

- On their own page, labelled **"Illustrative only. Not real earnings, not payable, not a forecast."**
- Calculated as impressions × an assumed CPM ÷ 1,000; the assumption is stored in `sim.settings` and shown on the page.
- Never added to real balances; no billing or payout controls exist.

**Measurement.** Real interactions with demo ads (impressions, taps, carousel swipe past) are reported as user tolerance of ad placements, **not** as advertiser demand or revenue.

**Data model (`sim` schema):** `sim.campaigns`, `sim.ad_slots` (feed or carousel, with post reference), `sim.impressions` (viewer level, purged after 30 days), `sim.interactions`, `sim.daily_totals`, `sim.settings`.

---

## 14. Safety, privacy, moderation, account deletion

**Blocking:**

- Mutual in effect and silent.
- Removes follows both ways and hides each person from the other.
- Hides the blocked person's comments on the blocker's posts for everyone.
- Prevents all interaction, including tips.
- Freezes CP with the blocker and refunds any pending redemptions.

**Comments on your own posts.** Authors can delete any comment on their posts.

**Reporting:**

- Severity tiers:
  - **Emergency:** child exploitation, credible threats, self harm risk, non consensual intimate imagery, doxxing.
  - **High:** harassment, hate, sexual content, graphic violence, impersonation.
  - **Standard:** spam, intellectual property, misleading reward, other.
- The reporter's view hides the item immediately. There is **no automatic global hiding**.

**Moderation queue:**

- Ordered by severity, then number of distinct reporters, then age.
- First look within 1 hour for Emergency (while moderators are awake), 12 hours for High, 48 hours for Standard.
- Every admin action is audited.

**Emergency escalation:**

1. Alert email to the on call moderators.
2. Contain: hide content, suspend if needed.
3. Preserve evidence: a restricted hold, proposed 90 days, subject to legal advice.
4. Case specific steps: for child exploitation, follow the counsel agreed process (in the US this includes NCMEC); for self harm risk, crisis resources and emergency services if life is at imminent risk; for credible threats, law enforcement; for intimate imagery and doxxing, remove first.
5. Incident review.

**Privacy:**

- First party analytics only; no third party trackers.
- No IP addresses or content text stored in analytics.
- Viewer level ad data deleted after 30 days.
- Groups smaller than 5 suppressed in exports.
- The privacy notice lists Supabase, Vercel, Mux, Stripe, and the email provider as processors.

**Account deletion:**

- **Who and how:** started by the member after a fresh sign in code; idempotent steps.
- **What is deleted:** social data, CP, redemptions (counterparties keep anonymised history), analytics events, post views, sim impressions, Supabase storage files, and Mux assets.
- **Money:**
  - Financial records in `finance` are **kept with the person's identity removed** for the legally required period, so reconciliation and tax records stay intact.
  - A creator with money still pending or available cannot finish deletion until it has been paid out.
  - Pro subscriptions are cancelled at deletion.
- **Moderation records** are kept, anonymised.
- **A weekly script** removes orphaned storage files and Mux assets.

---

## 15. Pilot analytics and metric definitions

**Principles:**

- No seeded traction. Internal accounts are excluded. Creator incentives are disclosed.
- First party, minimal data.
- Events are written by database triggers wherever possible. The few browser only signals go through a rate limited, deduplicated `track()` function.
- Definitions are frozen at **v1.0** before launch, and versioned if changed.
- Report only complete cohort windows, with denominators shown.

**Event store:**

- `analytics.events`: user, event, timestamp, small properties.
- `analytics.post_views`, `analytics.cohorts`, `analytics.metric_snapshots` (weekly), `analytics.costs` (from invoices).

**Definitions of "active":**

- **Visited:** opened the app.
- **Engaged:** posted, commented, liked, saved, followed, redeemed, or tipped.

### Acquisition and referrals

| Metric | Definition | Denominator |
| --- | --- | --- |
| Invites issued | Invite capacity issued, by channel (admin to creator, creator to fan, fan to fan) | Count |
| Invite conversion | Registrations ÷ invite link opens, per channel | Link opens |
| Registrations | Accounts created through valid invites | Count |
| Creator driven acquisition share | Fans registered through a creator link | All registered fans |
| Fans acquired per creator | Registrations through each creator's link | Per creator |
| Fan referral rate | Activated fans who brought at least 1 registered fan | Activated fans |

### Activation and retention

| Metric | Definition | Denominator |
| --- | --- | --- |
| Fan activation (7 days) | Onboarded, follows at least 1 person, made at least 1 engagement, active on at least 2 separate days | Fans registered at least 7 days ago |
| Creator activation (14 days) | At least 3 posts, at least 1 reward, at least 1 registered invitee | Recruited creators registered at least 14 days ago |
| Week N retention | Cohort members active in week N (weeks 1 to 8) | Cohort size, complete windows only |
| Creator posting retention | Recruited creators who posted in week N | Recruited creators past week N |
| DAU, WAU, stickiness | Distinct non internal active users; DAU ÷ WAU | Registered users; WAU |

### H1: predictable access

| Metric | Definition | Denominator |
| --- | --- | --- |
| Post reach (7 days) | Followers who saw the post within 7 days | Author's followers at publish time |
| Reach consistency | Spread of reach across a creator's posts | Posts with complete windows |
| Caught up rate | Sessions reaching "all caught up" | Sessions with at least 1 feed view |
| Creator survey | Days 14 and 45: confidence that followers see posts, compared with their main platform (1 to 5) | Responding creators |

### H2: CP and rewards

| Metric | Definition | Denominator |
| --- | --- | --- |
| Engagement quality | CP eligible comments ÷ all comments; comments per engaged fan | All comments; engaged fans |
| Repeat relationships | Fan and creator pairs engaging on at least 3 separate days in 30 days | Pairs where the fan follows the creator |
| CP participation | Fans earning CP in the week; median CP per engaged fan | Active fans |
| Redemption rate | Fans who redeemed at least once | Fans ever eligible to redeem |
| Fulfilment | Fulfilled redemptions; median time to fulfil | Redemptions |

### Network effects

| Metric | Definition | Denominator |
| --- | --- | --- |
| Multi creator fans | Fans following at least 2 creators | Activated fans |
| Cross creator discovery | Fans following a creator other than their inviter | Activated fans |
| Creator to creator follows | Recruited creators following another creator | Recruited creators |
| Emergent creators | Fans who published at least 1 post | Activated fans |

### Video

| Metric | Definition | Denominator |
| --- | --- | --- |
| Video share | Posts with video | All posts |
| Upload success | Videos reaching ready | Upload attempts |
| Plays per video; completion | Distinct viewers starting playback; plays reaching 85% | Ready videos; plays started |
| Playback errors | Plays ending in error, by device class | Plays started |

### Real financial transactions (excluding internal accounts, Stripe test mode, refunded and lost dispute tips)

| Metric | Definition | Denominator |
| --- | --- | --- |
| Completed contribution volume | Sum of gross of completed tips | Count; also per active fan |
| Unique contributing fans | Fans with at least 1 completed tip | Count; rate over activated fans |
| Creators receiving tips | Activated creators with at least 1 completed tip | Activated creators with payouts enabled (also over all activated creators) |
| Time to first tip | Share of creators with a first tip within 14 and 30 days of tips being enabled for them | Creators at least 14 (or 30) days past enablement |
| Creator net earnings | Sum of creator allocations | Per tipped creator |
| Crevant transaction revenue | Sum of Crevant allocations; also net of platform paid payment costs | Count |
| Payment costs | Stripe fees on tips; Connect account and payout fees; dispute fees; fees absorbed on refunds | Count |
| Refund and dispute rates | Refunded or disputed tips | Completed tips |

### Creator Pro

| Metric | Definition | Denominator |
| --- | --- | --- |
| Trial activation | Eligible creators starting a trial | Eligible creators |
| Feature use | Trial and paid creators using each Pro feature at least once | Trial and paid creators |
| Trial to paid | Trials converting within 7 days of ending | Trials ended |
| Paid retention, cancellation | Renewed or cancelled at first renewal | Subscribers who reached a renewal |
| Subscription revenue | Invoiced amount after refunds and Billing fees | Count |
| Willingness to pay signals | Pro page views, checkouts started, survey answers | Eligible creators |

### Simulated advertising (separate tabs; never evidence of demand)

| Metric | Definition |
| --- | --- |
| Demo ad impressions, taps | By placement (feed, carousel) |
| Carousel slot opt in | Carousels with a reserved slot ÷ eligible carousels |
| Illustrative earnings | Impressions × assumed CPM ÷ 1,000, split per model |

### Costs

| Metric | Definition |
| --- | --- |
| Monthly platform cost | Sum of vendor invoices |
| Cost per active user | Monthly cost ÷ monthly active users |
| Marginal cost per active user | Usage driven costs ÷ monthly active users |
| Video cost per delivered minute | Mux cost ÷ minutes delivered |

---

## 16. Investor dashboard

The `/admin/pilot` page is admin only, with CSV export.

**Four separate tabs:**

1. **Real activity**
2. **Real financial transactions**
3. **Simulated ad activity**
4. **Simulated ad earnings**

Plus a **Reconciliation** page (exceptions, trace search) and a **Costs** page.

**Rules:**

- Every figure shows its denominator and cohort window.
- Groups smaller than 5 are suppressed in exports.
- Money figures are shown with a 14 day lag option, so late refunds and disputes are reflected.

---

## 17. Phases

Effort is in working sessions.

| Phase | Depends on | Deliverables | Key acceptance tests | Main risks | Cost impact | Effort |
| --- | --- | --- | --- | --- | --- | --- |
| **0. Foundations** | Founder accounts (in parallel) | Frozen `demo` branch; Crevant brand configuration; `supabase/migrations` with the four schemas and grants; database tests; separation check; CI; secret scan; environment templates | Demo unchanged; migrations apply to an empty database; separation and grant tests pass; no secrets in the build | Stripe platform review lead time (start now) | Vercel Pro about $20 a month | 1 to 2 |
| **1. Landing, sign in, invites, analytics base** | 0 | Landing page and applications; invite links with caps; one time code sign in; onboarding (18+, guidelines, consent); profiles and pictures; internal flag; events and `track()` | Uninvited, over cap, or expired invites refused; every registration records its inviter; internal accounts excluded; landing copy accurate | Email deliverability | Resend paid tier about $20 a month | 2 to 3 |
| **2. Publishing and feed** | 1, Mux | Text, image, carousel, video; feed; follows, likes, comments, saves; post views | Chronological order and paging; carousels render; video device matrix passes; views counted once | Video formats; carousel complexity | Mux about $0 to $10 | 3 to 4 |
| **3. CP, rewards, free analytics** | 2 | Server side CP, redemption, fulfilment; free creator analytics | Release 1 rules as database tests; concurrent redemption spends once; reach matches hand calculation | Client and server drift | None | 2 to 3 |
| **4. Safety, privacy, deletion** | 3 | Blocking, reporting queue, emergency alerts, audit log, deletion (finance records anonymised and retained) | Block, report, emergency, audit, deletion tests | Retention rules need counsel | None | 2 to 3 |
| **5. Tipping and reconciliation** | 1 to 4, Stripe approval, legal terms | Express onboarding; hosted tip checkout; webhook handling; split; transfers; ledger; refunds; disputes; payouts; daily reconciliation; Earnings page | $10 tip with $0.59 fee records 10.00 / 0.59 / 9.41 / 7.53 / 1.88; 5 identical webhooks produce 1 tip; late fee keeps "processing"; refund and dispute reversals; payout moves to "paid out"; zero exceptions over 200 test transactions and a corrupted entry is detected; no secret keys in the bundle | Money bugs; Stripe review; fraud; tax | Connect up to about $40 plus payout fees; $15 per dispute | 4 to 6 |
| **6. Creator Pro** | 3, 5 | Trial, hosted subscription checkout and portal, Pro analytics with thresholds, downgrade | Trial never charges; terms shown before paying; failed renewal grace then downgrade; data preserved; insights hidden below thresholds | Weak price signal from 20 creators | Billing about 0.7% of revenue | 2 to 3 |
| **7. Simulated ads** | 2 | Feed and carousel slots; fictional campaigns; illustrative earnings page | Organic order invariant; empty slots omitted; no `sim` to `finance` path; labels everywhere | Mistaken for real income | None | 2 |
| **8. Dashboard and readiness** | All | Four tab dashboard, reconciliation and costs pages, surveys, digest, data quality checks, dry run | Readiness criteria (section 18) | Measurement gaps | None | 2 to 3 |

**Total:** about 20 to 29 working sessions.

**Timing (recommended, D18; see section 19):**

- **Build:** Phases 0 to 5, 7, and 8 must be complete before the rollout period starts, because founding creators onboard to payouts during rollout. About **9 to 11 weeks**.
- **Rollout:** 3 weeks with founding creators. Phase 6 (Creator Pro) finishes during rollout.
- **Day 0** of the 60-day measurement window is therefore about **12 to 14 weeks** from the start of Phase 1. That is later than the earlier in-pilot staging, but every cohort is measured on the same product.

---

## 18. Launch readiness criteria

**Before the rollout period starts:**

- All Phase 0 to 4, 7, and 8 tests pass on staging and on beta with internal accounts.
- Video device matrix passes; no console errors; 320 px layouts clean.
- Moderators named; emergency process rehearsed.
- Metric definitions frozen at v1.0; founder success thresholds written down in advance.
- Data quality checks pass for 3 consecutive days.
- Zero seeded content in beta; internal accounts flagged.
- Backups restored once; spend caps and billing alerts set.
- Email domain authenticated and tested with Gmail and Outlook.
- Privacy notice, terms, guidelines, and research consent reviewed by counsel.

**Before founding creators can receive tips (start of rollout):**

- Stripe live account approved; creator Express onboarding tested.
- **Live rehearsal** by internal (excluded) accounts with real cards and small amounts, including a refund. Disputes are verified in test mode, where Stripe's test cards can trigger them.
- **100% of rehearsal transactions reconcile**, with zero unresolved exceptions, and the alert email is confirmed to reach admins.
- Tip terms, refund policy, and tax setup reviewed.

**Before Day 0:**

- Everything above, plus at least 7 days of rollout with real tips reconciling daily and zero unresolved exceptions.
- Founding creators have published, set up rewards, and completed payout onboarding.
- Metric definitions frozen at v1.0 and thresholds written down; the measurement clock starts.

**Before Pro trials open (Day 0):**

- Price and terms copy reviewed.
- A trial confirmed to end without any charge.
- Subscription and cancellation rehearsed.

---

## 19. Pilot timeline and 60-day measurement plan

### Why the earlier staging weakens the evidence

With tipping from day 14, Pro from day 21, a 21 day trial, and creators joining until day 35:

- **Tips:** the first creators have 14 days without tipping, so "time to first tip" and tip volume are measured on unequal exposure.
- **Pro conversion:** a creator joining on day 30 is eligible around day 37, and a 21 day trial ends around day 58. The 7 day conversion window then closes after day 60, so many outcomes fall outside the pilot.
- **Paid retention:** the first renewal comes about 30 days after conversion, around days 72 to 95. That is not observable in a 60 day window at all.
- **Late refunds and disputes** for tips in the final weeks arrive after day 60, so final monetization numbers would not be stable at day 60.

### Recommended timeline: four separate periods

| Period | When | What happens | Measured? |
| --- | --- | --- | --- |
| **Build** | About 9 to 11 weeks | Phases 0 to 5, 7, 8 | No |
| **Rollout** | 3 weeks before Day 0 | 6 to 8 founding creators publish real posts, set up rewards, and complete payout onboarding. Internal live payment rehearsal; real tips may start among founding creators' early fans with daily reconciliation. Pro finishes building | Reported separately as "rollout", never mixed into the 60 day figures |
| **Measurement window** | Day 0 to Day 59 | Fan invitations open. Tipping and Pro eligibility live for every cohort from Day 0 | Yes: the 60 day investor dataset |
| **Follow-up window** | Day 60 to Day 89 | No new creators or fans. Observe first Pro renewals, late refunds and disputes, and later cohorts' retention | Reported as a clearly labelled extension |

Founding creators' rollout posts are real content by real people, not seeded traction. They are disclosed as rollout activity.

### Creator Pro trial length

| | 14 day trial (recommended) | 21 day trial (approved) |
| --- | --- | --- |
| Last creator join date for conversion inside Day 59 | About Day 28 (eligible Day 35, trial ends Day 49, conversion window ends Day 56) | About Day 21 (eligible Day 28, trial ends Day 49, window ends Day 56) |
| Founding creators | Trial ends about Day 14; first renewal about Day 44 to 51, **inside the window** | Trial ends about Day 21; first renewal about Day 51 to 58, inside the window |
| Trade off | Less time with data per creator | More time, but creator recruitment must close a week earlier |

Recommendation: **14 days**, with Pro eligibility at 7 days and 3 posts, and creator recruitment closing on Day 28.

### Measurement window schedule

**Before rollout:**

- Recruit about 25 creators (to allow for drop off).
- Brief each one on what is real, simulated, and measured.
- Pre register success thresholds.

**Rollout weeks 1 to 3:** founding creators onboard, publish at least 3 posts, set up rewards and payouts. Daily reconciliation of any real tips.

**Day 0:** fan invites open; tips live; founding creators eligible for Pro trials.

**Days 0 to 14:**

- Fans join in batches through creator links.
- Wave 2 creators join (Days 7 to 14).
- Creator survey on Day 14.

**Days 15 to 28:**

- Wave 3 creators join, bringing the total to 20.
- **Creator recruitment closes Day 28.**
- Carousel ad slots introduced.
- Fan survey on Day 30.

**Days 29 to 45:**

- Steady state; **fan invites close Day 45**, so every fan cohort has at least 14 days of data.
- Creator survey on Day 45.

**Days 46 to 59:** about 10 creator interviews.

**Day 60:** measurement data freeze and **interim investor report** (60 day results).

**Days 60 to 89:** follow-up window.

**Day 90:** final report with renewals, late refunds and disputes, and complete cohort retention.

### Monetization metric windows

| Metric | Window | Included creators or fans |
| --- | --- | --- |
| Tips per creator, time to first tip | First 30 days after tips are enabled for the creator | Creators enabled by Day 30 |
| Contributing fan rate | First 30 days after fan registration | Fans registered by Day 30 |
| Trial to paid conversion | Within 7 days after trial end | Trials ending by Day 52 (Day 60 report) or Day 82 (Day 90 report) |
| Paid retention | First renewal | Conversions by Day 29 (Day 60 report) or Day 59 (Day 90 report) |
| Net monetization | Tips completed in the window, minus refunds and lost disputes known at the report date | Reported again at Day 90 with later reversals |

### Weekly operating rhythm

- **Monday:** snapshot and data quality check.
- **Midweek:** creator check ins.
- **Ongoing:** moderation review, reconciliation exceptions review.
- **Friday:** cost review and a one page update.

---

## 20. Costs

Figures come from third party guides and Stripe support pages. **Verify them on the vendors' own pricing pages before signing up.**

| Item | Approx. per month | Notes |
| --- | --- | --- |
| Supabase Pro (beta) | $25 to $40 | Staging on the free plan |
| Vercel Pro | about $20 | |
| Mux | about $0 to $10 | Pilot volumes are within the free delivered minutes |
| Resend paid tier | about $20 | |
| Domain | about $1 to $2 | A Crevant domain, after availability check |
| Stripe Connect | up to about $40, plus about $20 to $30 in payout fees | $2 per creator paid out in a month; 0.25% plus 25¢ per weekly payout |
| Stripe Billing | about 0.7% of subscription revenue | A few dollars |
| Disputes | $15 each | |
| **Total** | **about $85 to $165** | Card processing fees are deducted from each tip, not an operating cost |

A 2 to 3 month build (mostly staging, about $20 to $45 a month) plus the 60 day pilot comes to roughly **$350 to $550**, excluding legal and accounting.

**Unit economics, honestly presented.** Crevant's 20% of a $10 tip is $1.88. Connect's per creator and payout fees, which Crevant absorbs, can offset this for low volume creators. The dashboard shows Crevant's tip revenue both before and after these costs.

---

## 21. Risks to the credibility of investor results

| Risk | Mitigation |
| --- | --- |
| Friends, family, or team inflating activity or tips | Internal flag; no self tipping; mutual creator tipping flagged; report the share of tips from creator invited fans |
| Seeded or fake activity | None in beta; database check at launch; no bots; no paid engagement |
| Creator incentives distort behaviour | Record and disclose every incentive |
| Small samples look decisive | Denominators and ranges; framed as early signals |
| Cherry picked metrics | Pre registered thresholds; frozen versioned definitions |
| Novelty effect | Cohort retention through week 8; compare early and late cohorts |
| Points drive shallow engagement | Measure comment quality and repeat relationships |
| Late refunds or disputes | 14 day lag option; show refunds and disputes alongside volume |
| Real money and simulated earnings confused | Separate schemas, CI check, separate types and pages, persistent labels |
| Pro price "validated" by 20 creators | Early signal only; paired with willingness to pay surveys; disclose any discounts |
| Measurement gaps | Daily data quality checks; incident log |
| Late cohorts with incomplete data | Complete windows only; invites close around day 45 |
| Selection bias | Describe recruitment; avoid over generalising |
| Payment incident damages trust | Reconciliation required before tips; $100 cap; alerts; published policy |

---

## 22. Founder setup checklist

**Start now (long lead times, in parallel):**

1. Open Crevant's Stripe account through the entity Crevant operates from (expected: Canada), start Connect setup in test mode, and ask Stripe the five questions in section 10a. Stripe's review has the longest lead time.
2. Brief counsel and an accountant: privacy notice, terms, tip terms and refund policy, community guidelines, emergency process, tax treatment. Claude can draft first versions.
3. Name at least two moderators, their on call hours, and an appeals email.
4. Check a Crevant domain's availability (and a basic trademark check).
5. Verify official pricing for Supabase, Vercel, Mux, Stripe, and Resend.
6. Write down your pilot success thresholds.

**Protect the demo (before any engineering merges to `main`):**

7. Set the existing Crevant Vercel project's production branch to `demo` (Claude creates the branch in Phase 0).

**Staging accounts (unblock development):**

8. A free Supabase organisation with project `crevant-staging`.
9. A Mux account with a staging environment.
10. A Vercel Pro team with a new project, `crevant-pilot`, linked to this repository (previews only for now).
11. Send Claude non secret identifiers. Secrets go only through the secure credential form.

**Before launch:**

12. Buy the domain.
13. Email provider with domain authentication records.
14. Supabase Pro organisation with project `crevant-pilot`, with the spend cap set.
15. Mux production environment.
16. Point `pilot.<domain>` at Vercel and apply the Supabase Auth settings Claude provides.
17. Stripe live mode approval before the rollout period starts.

---

## 23. Sources

- [Supabase pricing](https://supabase.com/pricing)
- [Vercel Pricing in 2026 Explained (MassiveGRID)](https://massivegrid.com/blog/vercel-pricing-explained-2026/)
- [Mux video pricing](https://mux.com/docs/pricing/video)
- [Resend sending limits](https://resend.com/docs/knowledge-base/resend-sending-limits)
- [Stripe: How charges work in a Connect integration](https://docs.stripe.com/connect/charges)
- [Stripe: Create separate charges and transfers](https://stripe.com/docs/connect/special-case-transfers)
- [Stripe: Funds segregation for separate charges and transfers](https://docs.stripe.com/connect/funds-segregation)
- [Stripe: Asynchronous capture](https://docs.stripe.com/payments/payment-intents/asynchronous-capture)
- [Stripe Support: Monetizing payments with Stripe Connect](https://support.stripe.com/questions/monetizing-payments-with-stripe-connect)
- [Stripe Support: Understanding fees for refunded payments](https://support.stripe.com/questions/understanding-fees-for-refunded-payments)
- [Stripe changelog: Express connected accounts and negative balance liability](https://docs.stripe.com/changelog/dahlia/2026-06-24/express-connected-accounts-v1-stripe-owned-pricing-negative-balance-liability)
- [Stripe chargeback fees (Redo)](https://redo.com/resources/articles/chargebacks/stripe-chargeback-fees)
- [Stripe Billing pricing (usagepricing.com)](https://usagepricing.com/blueprint/stripe-billing)

---

## 24. How this plan was produced

Drafted by Claude (an AI assistant) in Claude Code at the founder's direction, from reviews of the codebase and earlier plans, the founder's written decisions, a headless browser codec experiment, cost calculations, and web research on vendor pricing and Stripe behaviour. Costs, legal, and tax points are flagged for human verification.

---

## Appendix A. Paused: FlipSocial working name and logo concept

The FlipSocial working name, tagline ("Social media. Flipped."), and logo concept (`docs/brand/`) are **paused**. They are kept for reference only and are not used anywhere in the product.

Open points if the rename is ever resumed:

- an existing "FlipSocial" app for Flipper Zero (flipsocial.net);
- the association with the shut down "Flip" app, which reportedly left creators unpaid;
- perception of the six pointed star symbol;
- trademark and domain clearance.

The brand configuration file introduced in Phase 0 keeps any future rename cheap.
