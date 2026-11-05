# Crevant 60-day pilot: development plan

**Status:** approved in principle; revised for Support Intent. Phase 0 engineering is in PR #5. Nothing is merged, provisioned, deployed, or live.
**Goal:** launch a real multi-user Crevant quickly, run a 60-day pilot with creators and fans, and produce credible evidence for fundraising.
**Branding:** Crevant. Naming and logo changes are paused (Appendix A). The repository and the live demo (`crevant-prototype.vercel.app`) stay unchanged.
**Money:** the pilot collects **no payments**. Monetization demand is tested through nonbinding **Support Intent**, Creator Pro willingness to pay, and simulated advertising.

Contents

1. Pilot objectives and hypotheses
2. Decisions log
3. Minimum architecture
4. Data separation
5. Feature priorities
6. Public landing page
7. Accounts, invites, profiles
8. Publishing, video, carousels, feed
9. Engagement, Connection Points, creator rewards
10. Support Intent
11. Creator Memberships and tips (future)
12. Free analytics and Creator Pro
13. Simulated advertising
14. Safety, privacy, moderation, account deletion
15. Pilot analytics and metric definitions
16. Investor dashboard
17. Phases, effort, and the fastest safe path
18. Launch readiness criteria
19. Pilot timeline and measurement plan
20. Costs
21. Risks to the credibility of investor results
22. Founder setup checklist
23. Future real payments: research already done
24. Sources
25. How this plan was produced
Appendix A. Paused: FlipSocial working name and logo concept

---

## 1. Pilot objectives and hypotheses

| # | Hypothesis | Main evidence |
| --- | --- | --- |
| H1 | Creators value predictable access to followers through a chronological feed | Post reach consistency, creator posting retention, creator surveys |
| H2 | Connection Points and creator rewards encourage meaningful participation and repeat engagement | Engagement quality, repeat relationships, redemptions, fan retention |
| H3 | Fans want to support creators financially, both once and through ongoing memberships; creators value premium insights; the proposed revenue model motivates creators | **Support Intent** (hypothetical, nonbinding), Creator Pro feature use and stated willingness to pay, reactions to simulated ad models, surveys and interviews |

**Recruitment targets** (goals, not assumed outcomes): 20 active creators and 200 to 300 registered fans, staggered over the pilot. Creators invite fans from their existing audiences.

**The pilot loop:** fans engage, build relationships, express willingness to support, creators understand their audience, and Crevant measures monetization potential.

**Not allowed:** manufactured or seeded traction. The beta contains no seeded people, posts, engagement, or support intent.

---

## 2. Decisions log

| # | Decision |
| --- | --- |
| D1 | Shared multi user app on Supabase (Postgres, Auth, Storage, Edge Functions), frontend on Vercel |
| D2 | Unified experience: everyone can follow and create |
| D3 | Chronological Following feed, no ranking |
| D4 | Connection Points (CP) unchanged in concept, enforced on the server. **No second points currency** |
| D5 | Real non monetary creator rewards with manual fulfilment |
| D6 | Creators see participation and CP earned with them, with clear disclosure |
| D7 | 18+ only |
| D8 | Video upload and playback via Mux (subject to official pricing check); no watch CP |
| D9 | Separate staging and beta environments |
| D10 | Blocking, reporting, prioritised moderation queue, emergency escalation; no automatic global hiding |
| D11 | Crevant branding kept; FlipSocial paused |
| D12 | **No payments in the pilot.** No Stripe, no payouts, no recurring billing, no financial liabilities |
| D13 | **Support Intent:** fans indicate nonbinding one time or monthly support amounts ($3, $5, $10, $20) for a creator; no money collected, no subscription created, no payable balance |
| D14 | **Creator Memberships** (fans paying creators monthly) are a future feature; the pilot only tests demand through monthly Support Intent. No membership checkout, billing, or exclusive content |
| D15 | Proposed future economics: tips and memberships 80% creator, 20% Crevant of the amount left after actual processing fees; other payment costs separate (section 23). Not used in the pilot |
| D16 | **Creator Pro:** Free and Pro analytics; creators try Pro during the pilot; **paid subscription processing deferred**; proposed $19 a month price tested through stated willingness to pay |
| D17 | Advertising simulated throughout: feed ads 100% Crevant and carousel ads 50:50 in the illustrative model; no advertiser billing or payouts |
| D18 | Public landing page first; invite only access |
| D19 | Weekly email digest included (opt out) |
| D20 | Real activity, hypothetical Support Intent, simulated advertising, and (future) real money are kept in separate data areas and never added together |
| D21 | Creators from Canada and the US are both possible in the pilot, because no payments are processed. Support Intent amounts carry an explicit currency |

---

## 3. Minimum architecture

| Layer | Service | Purpose |
| --- | --- | --- |
| Frontend | Vercel Pro | React app and public landing page |
| Data, auth, storage, server code | Supabase | Postgres, Auth (one time codes), Storage (images), Edge Functions, `pg_cron` (scheduled jobs) |
| Video | Mux | Uploads, conversion to universally playable streams, signed playback |
| Email | Resend (paid tier) | Sign in codes, invites, digest, alerts |

**Removed for the pilot:** Stripe Connect, Stripe Billing, payouts, webhooks for money, and financial reconciliation (section 23 keeps the research for later).

**Server functions:**

- **Access:** `submit-application`, `redeem-invite`.
- **Video:** `create-video-upload`, `mux-webhook`, `video-playback-token`.
- **Accounts and safety:** `delete-account`, `emergency-alert`.

**Scheduled jobs:** `send-digest` (weekly), `purge-retention` (daily), `metric-snapshot` (weekly).

**Client libraries:** `@supabase/supabase-js`, `@tanstack/react-query`, Mux upload and player components.

---

## 4. Data separation

| Schema | Holds | Access |
| --- | --- | --- |
| `public` | Real activity: profiles, posts, follows, engagement, CP, rewards | Members, under row level security |
| `intent` | **Hypothetical** amounts: Support Intent and Creator Pro willingness to pay. Real behaviour, nonbinding amounts, never payments or balances | Each person manages their own through functions; creators see consented and aggregated views; admins |
| `sim` | Simulated advertising: fictional campaigns, ad slots, impressions, illustrative earnings | Members see their own illustrative figures; admins |
| `analytics` | Pilot measurement: events, post views, cohorts, snapshots, costs | Admins only |
| `finance` | **Not created in the pilot.** Reserved for real payments if they launch later | n/a |

**Enforcement (in PR #5):**

- Members have no direct access to `intent`, `sim`, or `analytics`, including to tables created later.
- No view or function may combine two amount schemas (`intent`, `sim`, and `finance` once it exists). CI checks every migration and has negative tests proving violations are caught.
- In the app, hypothetical support and illustrative ad earnings are separate types, each rendered by a component that always shows its label ("Indicated support, not payments" or "Illustrative, not payable").

---

## 5. Feature priorities

In the founder's order:

1. Public landing page
2. Authentication and profiles
3. Publishing and chronological feeds
4. Engagement and Connection Points
5. Creator rewards
6. Support Intent
7. Free and Pro analytics
8. Simulated advertising
9. Moderation, privacy, and pilot measurement

Moderation, privacy, and measurement are listed last but are **launch blockers**: no member joins before reporting, blocking, account deletion, and event capture work.

**Deferred:** real payments (tips, memberships, Pro billing), membership benefits and exclusive content, real advertising, algorithmic ranking, DMs, push notifications, native apps, watch CP, public profiles.

---

## 6. Public landing page

Signed out visitors see the landing page; signed in members go to their feed.

**What it explains:**

- What Crevant is, and why creators and fans should join.
- The chronological feed.
- Connection Points and rewards.
- How creators could earn in future: fan support (one time and memberships), Creator Pro, and advertising. During the pilot, fans can **indicate** support but no money changes hands, and ads are a demonstration.
- How to apply for the pilot.

**Honesty rules:**

- No invented user counts, testimonials, or earnings claims.
- Nothing suggests creators will be paid during the pilot.
- Links to terms, privacy, and contact details.

**Application form:** minimal data with consent, protected by a hidden honeypot field and rate limiting. Applications not selected are deleted after the pilot.

---

## 7. Accounts, invites, profiles

**Sign in.** Email one time code (6 digits plus a magic link). Public sign ups are disabled.

**Invites:**

- Admins invite recruited creators.
- Each creator has a personal invite link capped at 25 fan sign ups (adjustable). Each fan has 3 invites.
- `redeem-invite` checks validity, expiry, and cap, then creates the account and records the inviter and channel.

**Onboarding:**

- Display name and unique handle.
- 18+ confirmation, community guidelines (version stored), supporter visibility disclosure, research participation consent.
- Choosing who to follow.

**Profile:**

- Picture, bio, category, and **country** (Canada or US), which sets the currency shown on their Support Intent panel.

**Pilot role labels (analysis only):**

- `recruited_creator` (invited by an admin).
- `fan` (invited by link).
- **Emergent creator:** a fan who publishes.

**Internal accounts** (`is_internal`) are excluded from every metric.

---

## 8. Publishing, video, carousels, feed

**Posts:**

- Text, up to 500 characters.
- One image.
- **Carousel:** 2 to 10 images.
- One video, up to 60 seconds.

**Video on Mux:**

- The browser uploads directly to Mux; a webhook marks the post ready. Mux converts iPhone HEVC video, which failed to decode in our headless Chromium test, into streams that play everywhere.
- Signed playback with short expiry; tap to play; no autoplay with sound.
- **Caps:** 1080p, the basic quality tier, 5 uploads a day and 30 a month per member, and a kill switch.

**Following feed:**

- Your own posts plus those of people you follow, newest first, with keyset paging.
- Simulated ads use a fixed slot rule that never changes organic order.

**Post views.** At least 50% visible for 1 second, counted once per person per post; this powers reach.

---

## 9. Engagement, Connection Points, creator rewards

**Engagement.** Follow, like, save, and comment go through database functions that record the action and any CP in one transaction.

**CP rules (unchanged from Release 1, now server side):**

- Values and daily limits from `cp_rules`.
- Once per item.
- No CP from your own content.
- Follow bonus held while following.
- Comment quality checks in SQL, with one shared set of test cases for client and server.

**Creator rewards:**

- Real, non monetary rewards.
- Redemption locks the wallet and reward and re checks eligibility, using an idempotency key.
- Fulfilment notes; decline refunds the CP.
- No cash or cash equivalents.

**CP is unrelated to Support Intent.** Indicating support earns no CP, and CP cannot express or change support.

---

## 10. Support Intent

### Purpose

Measure how fans would want to support creators if payments existed, and how that differs between **one time support** (appreciation for content) and **monthly membership** (willingness to sustain a relationship).

### Experience

On a creator's profile, and from the creator's posts, a **Support this creator** panel:

1. Choose **One time support** or **Monthly membership**.
2. Choose **$3, $5, $10, or $20**, shown in the creator's currency (CAD for Canadian creators, USD for US creators, labelled explicitly, for example "C$5/mo").
3. See the summary, for example "Your indicated support: C$5/mo".
4. Read the notice, which is always visible on the panel and the confirmation:
   > This is an expression of interest only. No money is collected, no membership is activated, and you are not committing to pay.
5. **Visibility choice:**
   - Share my name with this creator; or
   - Count me anonymously. **This is the default.**
6. Optional follow up questions:
   - **Monthly only:** "What would you expect in return?" Choose any of: exclusive content, direct interaction with the creator, community access with other supporters, recognition, simply supporting the creator, other.
   - **Both types:** "If payments were available, how likely would you be to actually pay this amount?" Very unlikely to very likely (1 to 5).
7. **Preview my interest**, then **Confirm**.

**After saving:**

- The panel shows the fan's current indication with **Change** and **Withdraw**.
- Fans can see and manage all their indications from Profile.

**Rules:**

- A fan can hold one current one time indication and one current monthly indication per creator.
- No indicating support for yourself, and none between people in a block relationship.
- Creators can switch the panel off for themselves.
- Founder decision: presets only, which is recommended for clean, comparable data, or presets plus a custom amount.

### Data model (`intent` schema)

| Table | Columns | Notes |
| --- | --- | --- |
| `intent.support_intents` | `id`, `supporter_id`, `creator_id`, `kind` (one_time, monthly), `amount_cents`, `currency`, `share_name` (boolean), `expected_return` (array), `likelihood` (1 to 5, optional), `created_at`, `updated_at`, `withdrawn_at` | **One current row per supporter, creator, and kind**, enforced by a unique index on current rows, so repeat submissions update instead of adding and cannot inflate totals |
| `intent.support_intent_events` | `id`, `intent_id`, `event` (created, changed, withdrawn), `amount_cents`, `kind`, `at` | Append only history, for change and withdrawal analysis |
| `intent.pro_willingness` | `creator_id`, `answer` (would pay at the proposed price, would pay a lower amount, would not pay), `amount_cents`, `currency`, `reasons`, `at` | Creator Pro willingness to pay (section 12) |

All writes go through `set_support_intent` and `withdraw_support_intent` functions, which check consent, blocks, self support, and the creator's panel setting.

### What creators see (free analytics)

- **Aggregates for each kind:**
  - number of supporters;
  - total and median indicated amount;
  - supporters per 100 active followers.
- Expected return breakdown for monthly supporters.
- Names only for supporters who chose to share them.
- Privacy threshold: aggregates appear only once **3 or more** people have indicated. Below that, the panel says "Fewer than 3 supporters so far", so a creator with a small audience cannot work out who indicated what.
- Every figure is labelled **"Indicated support. Not payments, not earnings."** It is never shown on any earnings page or next to illustrative ad earnings.

### What is never done

- Collecting payment details.
- Creating a subscription.
- Creating a payable balance.
- Adding indicated support to any revenue figure.
- Sending reminders that pressure people to increase their amount.

---

## 11. Creator Memberships and tips (future)

| | Creator Membership | Creator Pro |
| --- | --- | --- |
| Who pays | Fans | Creators |
| Who benefits | The creator and their supporting community | The creator |
| Purpose | Support a creator on a recurring basis | Advanced insights and relationship tools |
| Pilot | Nonbinding monthly Support Intent | Free trial of premium features |
| Future | Real recurring payments; 80:20 net split proposed | Paid subscription; $19 a month proposed |

**Not built in the pilot:** membership checkout, recurring billing, exclusive content, member only areas, member badges.

The "What would you expect in return?" answers decide what the future membership offers: content access, a relationship, community, or pure support. One time tips are tested through one time Support Intent; real tips are also future (section 23).

---

## 12. Free analytics and Creator Pro

**Free for every creator:**

- Follower counts, post reach, likes, comments, saves, basic engagement.
- CP and reward management.
- **Aggregate Support Intent** (section 10).

None of this is restricted by Pro.

**Creator Pro.** It answers: what is working, who am I connecting with, and what should I do differently to grow? Every insight shows its sample size; below the minimum, the page says "Not enough data yet".

| Feature | Shows | Minimum data |
| --- | --- | --- |
| Format performance | Median reach and engagement by text, photo, carousel, video | At least 3 posts per compared format |
| Supporter relationships | Returning vs new supporters; supporters quiet for 14 days | At least 10 supporters |
| Content to support intent | Support indications made from a post, and indications within 72 hours of viewing a post (labelled correlation, not cause) | At least 5 indications |
| Audience timing | When followers are active; suggested posting windows | At least 20 followers and 14 days |
| Recommendations | Plain, evidence based suggestions with sample sizes | Only when the supporting insight is available |

**Trial without billing:**

- Eligible after 7 days on Crevant and 3 posts.
- One trial per creator. **14 days recommended** (configurable); 21 was the earlier proposal.
- No card, no checkout, no charge. When the trial ends, Pro switches back to Free with all data kept.
- **Willingness to pay** is asked at trial end and recorded in `intent.pro_willingness`: "Creator Pro is proposed at $19 a month. Would you pay this?" The answers are: yes; yes at a lower amount (which amount?); no (why?).
- Creators can also join a "Notify me when Pro launches" list.

**Measured separately:**

- **Usage:** feature use during the trial, from analytics events.
- **Stated willingness to pay:** from `intent`.

The two are never combined into a "conversion" figure, because no one actually pays.

---

## 13. Simulated advertising

**Feed ads:**

- One slot after every 6th organic post. Never first, never two in a row, none in short feeds.
- **Organic order never changes** (automated invariant test).
- Illustrative model: 100% Crevant.

**Carousel ads:**

- Creators can reserve one slot in carousels of 4 or more images. It is never on the first slide.
- Crevant chooses the fictional ad. An empty slot is omitted, with no blank slide.
- Illustrative model: 50:50.

**Labels and behaviour:**

- Every ad is labelled as a demo from a fictional advertiser.
- Tapping opens an explanation; no external links; no targeting.

**Illustrative earnings:**

- On their own page: **"Illustrative only. Not real earnings, not payable, not a forecast."**
- Calculated as impressions × an assumed CPM ÷ 1,000.
- Never combined with Support Intent.

**Measurement.** Real interactions with demo ads are reported as tolerance of placements, never as advertiser demand.

**Data:** `sim.campaigns`, `sim.ad_slots`, `sim.impressions` (viewer level purged after 30 days), `sim.interactions`, `sim.daily_totals`, `sim.settings`.

---

## 14. Safety, privacy, moderation, account deletion

**Blocking:**

- Mutual in effect and silent.
- Removes follows and hides each person from the other.
- Hides the blocked person's comments on the blocker's posts for everyone.
- Prevents all interaction.
- Freezes CP and refunds pending redemptions.
- **Withdraws Support Intent between the two people.**

**Reporting:**

- Severity tiers:
  - **Emergency:** child exploitation, credible threats, self harm risk, non consensual intimate imagery, doxxing.
  - **High:** harassment, hate, sexual content, graphic violence, impersonation.
  - **Standard:** spam, intellectual property, misleading reward, other.
- Immediate personal hiding for the reporter; no automatic global hiding.
- A prioritised queue, with first look within 1 hour for Emergency (while moderators are awake), 12 hours for High, and 48 hours for Standard.
- Audit log of every admin action.
- **Emergency escalation:** alert email, contain, preserve evidence (a proposed 90 day hold, subject to legal advice), case specific steps, incident review.

**Privacy:**

- First party analytics only; no third party trackers.
- No IP addresses or content text in analytics.
- Viewer level ad data deleted after 30 days.
- Groups smaller than 5 suppressed in exports.
- Support Intent shown to creators only as consented names or aggregates of 3 or more.
- The privacy notice lists Supabase, Vercel, Mux, and the email provider.

**Account deletion:**

- **Who and how:** started by the member after a fresh sign in code; idempotent steps.
- **What is deleted:**
  - social data, CP, and redemptions (counterparties keep anonymised history);
  - **Support Intent and its history;**
  - Pro willingness answers;
  - analytics events, post views, and sim impressions;
  - storage files and Mux assets.
- **Kept:** moderation records, anonymised.
- **A weekly script** removes orphaned files and assets.

With no payments, there are no financial records to retain.

---

## 15. Pilot analytics and metric definitions

**Principles:**

- No seeded traction. Internal accounts are excluded. Creator incentives are disclosed.
- First party, minimal data.
- Events are written by database triggers where possible; browser only signals go through a rate limited, deduplicated `track()` function.
- Definitions are frozen at **v1.0** before launch and versioned if changed.
- Report complete cohort windows only, with denominators.

**Definitions of "active":**

- **Visited:** opened the app.
- **Engaged:** posted, commented, liked, saved, followed, redeemed, or indicated support.

### Acquisition, activation, retention

| Metric | Definition | Denominator |
| --- | --- | --- |
| Invites issued, invite conversion | Capacity issued by channel; registrations ÷ link opens | Link opens |
| Creator driven acquisition share | Fans registered through a creator link | All registered fans |
| Fan referral rate | Activated fans who brought at least 1 registered fan | Activated fans |
| Fan activation (7 days) | Onboarded, follows at least 1, made at least 1 engagement, active on at least 2 separate days | Fans registered at least 7 days ago |
| Creator activation (14 days) | At least 3 posts, at least 1 reward, at least 1 registered invitee | Recruited creators registered at least 14 days ago |
| Week N retention | Cohort members active in week N | Cohort size, complete windows only |
| Creator posting retention | Recruited creators who posted in week N | Recruited creators past week N |
| DAU, WAU, stickiness | Distinct non internal active users; DAU ÷ WAU | Registered users; WAU |

### H1 and H2

| Metric | Definition | Denominator |
| --- | --- | --- |
| Post reach (7 days) | Followers who saw the post within 7 days | Author's followers at publish time |
| Reach consistency | Spread of reach across a creator's posts | Posts with complete windows |
| Caught up rate | Sessions reaching "all caught up" | Sessions with a feed view |
| Engagement quality | CP eligible comments ÷ all comments; comments per engaged fan | Comments; engaged fans |
| Repeat relationships | Fan and creator pairs engaging on at least 3 separate days in 30 days | Pairs where the fan follows the creator |
| Redemption rate, fulfilment | Fans who redeemed; fulfilled share and median time | Eligible fans; redemptions |
| Network effects | Fans following at least 2 creators; cross creator discovery; emergent creators | Activated fans |
| Video | Upload success; plays per video; completion; playback errors | Attempts; ready videos; plays |

### H3: Support Intent (hypothetical; never revenue)

| Metric | Definition | Denominator |
| --- | --- | --- |
| Panel to intent conversion | Fans who submitted an indication after viewing the panel | Fans who viewed the panel |
| Support intent rate | Active fans with at least 1 current indication | Active fans in the period |
| One time vs monthly mix | Share of current indications by kind | Current indications |
| Amount distribution | Count at each preset; median by kind | Current indications of that kind |
| Indicated monthly support per creator | Sum of current monthly indications | Per creator, with its supporter count |
| Support strength | Monthly supporters per 100 active followers; indicated monthly amount per active follower | The creator's active followers in the period |
| Changes and withdrawals | Indications changed or withdrawn within 30 days | Indications at least 30 days old |
| Supporter engagement over time | Supporters' week N retention compared with non supporters' (descriptive, not causal) | Cohort members |
| Stated likelihood to pay | Distribution of the 1 to 5 answer | Indications with an answer |
| Expected return | Share choosing each option | Monthly indications with an answer |
| Strongest support intent | Creators ranked by support strength (not by raw totals) | Creators with at least 10 active followers |

**Reporting rule.** Every Support Intent figure is labelled "indicated, nonbinding". The dashboard may show clearly labelled **conversion scenarios** (for example, if 10%, 25%, or 50% of monthly indications converted). These are assumptions, not forecasts, and never appear alongside real figures without that label.

### Creator Pro

| Metric | Definition | Denominator |
| --- | --- | --- |
| Trial activation | Eligible creators who started a trial | Eligible creators |
| Feature use | Trial creators using each Pro feature at least once; uses per week | Trial creators |
| Stated willingness to pay | Share answering "would pay at $19", "lower amount" (with amounts), "no" | Creators whose trial ended |
| Notify me list | Creators who joined | Creators whose trial ended |

### Simulated advertising (separate tabs; never evidence of demand)

| Metric | Definition |
| --- | --- |
| Demo ad impressions and taps | By placement |
| Carousel slot opt in | Carousels with a reserved slot ÷ eligible carousels |
| Illustrative earnings | Impressions × assumed CPM ÷ 1,000, split per model |

### Costs

| Metric | Definition |
| --- | --- |
| Monthly platform cost | Sum of vendor invoices |
| Cost per active user | Monthly cost ÷ monthly active users |
| Marginal cost per active user | Usage driven costs ÷ monthly active users |

---

## 16. Investor dashboard

The `/admin/pilot` page is admin only, with CSV export.

**Separate tabs:**

1. **Real activity**
2. **Support Intent (indicated, nonbinding)**
3. **Creator Pro (usage and stated willingness to pay)**
4. **Simulated ad activity**
5. **Simulated ad earnings (illustrative)**
6. **Costs**

**Rules:**

- No figure from tabs 2, 4, or 5 is ever added to another.
- Every figure shows its denominator and window.
- Groups smaller than 5 are suppressed in exports.

---

## 17. Phases, effort, and the fastest safe path

Effort is in working sessions.

| Phase | Depends on | Deliverables | Key acceptance tests | Main risks | Effort |
| --- | --- | --- | --- | --- | --- |
| **0. Foundations** (PR #5) | Staging accounts | Frozen `demo` branch, separated schemas, CI, secret scan, brand configuration | Done locally and in CI; remaining: apply to staging | Demo not yet isolated in Vercel | 0.5 to 1 remaining |
| **1. Landing, sign in, invites, profiles, analytics base** | 0 | Landing page and applications; invite links and caps; one time codes; onboarding; profiles with country; internal flag; events and `track()` | Uninvited, over cap, or expired invites refused; inviter recorded; internal accounts excluded | Email deliverability | 2 to 3 |
| **2. Publishing and feed** | 1, Mux | Text, image, carousel, video; chronological feed; post views | Order and paging; carousels; video device matrix; single counting of views | Video formats | 3 to 4 |
| **3. Engagement and CP** | 2 | Follows, likes, comments, saves; server side CP | Release 1 rules as database tests; shared comment tests | Client and server drift | 2 |
| **4. Creator rewards** | 3 | Rewards, redemption, fulfilment | Concurrent redemption spends once; decline refunds CP | None significant | 1 |
| **5. Support Intent** | 3 | Panel, consent, change and withdraw, follow up questions, creator aggregates, events | Repeat submissions update one row; withdraw removes from totals; blocked and self support refused; aggregates hidden below 3; names only with consent; no route from `intent` into any revenue figure | Misread as a commitment | 1 to 2 |
| **6. Free and Pro analytics** | 3, 5 | Free analytics; Pro trial without billing; thresholds; willingness to pay prompt | Insights hidden below thresholds; trial ends cleanly with data kept; no checkout exists | Thin data early on | 2 to 3 |
| **7. Simulated advertising** | 2 | Feed and carousel slots; campaigns; illustrative page | Organic order invariant; empty slots omitted; labels; separation from `intent` | Mistaken for income | 2 |
| **8. Moderation, privacy, deletion** | 3 | Blocking, reporting queue, emergency alerts, audit log, deletion | Block, report, emergency, audit, deletion tests | Counsel review time | 2 to 3 |
| **9. Pilot measurement and readiness** | All | Dashboard tabs, snapshots, data quality checks, surveys, digest, dry run | Readiness criteria (section 18) | Measurement gaps | 2 to 3 |

**Total:** about **17 to 24 working sessions**, down from 20 to 29, because payments and reconciliation are gone.

### Fastest safe path

- **Required before any member joins:** Phases 0 to 5, 8, and 9. Moderation, deletion, and measurement are not optional.
- **Finished during the rollout period:** Phase 6 (Pro needs creator data anyway, and eligibility takes 7 days) and Phase 7 (ads), both live by Day 0 so every measured cohort sees the same product.
- **Build to rollout:** about **5 to 7 weeks**.
- **Rollout:** 2 weeks with founding creators.
- **Day 0:** about **7 to 9 weeks** from the start of Phase 1. The payments version was 12 to 14 weeks.
- **What could shorten it further, with trade offs:** launching without video (saves about 1 session, but video matters to creators) or without carousels (removes the carousel ad test). Neither is recommended.
- **What must not be cut:** moderation and blocking, account deletion, internal account exclusion, and metric definitions frozen before Day 0.

---

## 18. Launch readiness criteria

**Before the rollout period (founding creators join):**

- Phases 0 to 5, 8, and 9 pass their tests on staging and on beta with internal accounts.
- Video device matrix passes; no console errors; 320 px layouts clean.
- Moderators named; emergency process rehearsed.
- Zero seeded content in beta; internal accounts flagged.
- Backups restored once; spend caps and billing alerts set.
- Email domain authenticated and tested with Gmail and Outlook.
- Privacy notice, terms, guidelines, research consent, and the Support Intent wording reviewed by counsel.

**Before Day 0:**

- Phases 6 and 7 pass their tests.
- Founding creators have published, set up rewards, and are eligible for Pro.
- Metric definitions frozen at v1.0; success thresholds written down; data quality checks pass for 3 consecutive days.

---

## 19. Pilot timeline and measurement plan

| Period | When | What happens | Measured? |
| --- | --- | --- | --- |
| **Build** | About 5 to 7 weeks | Phases 0 to 5, 8, 9 | No |
| **Rollout** | 2 weeks before Day 0 | 6 to 8 founding creators publish real posts and set up rewards; Pro and ads are finished | Reported separately as "rollout" |
| **Measurement window** | Day 0 to Day 59 | Fan invitations open; every feature live for every cohort | Yes: the investor dataset |
| **Follow-up (optional)** | Day 60 to Day 89 | No new members; observe retention of later cohorts and late changes or withdrawals of Support Intent | Reported as a labelled extension |

With no payments, there are no renewals or refunds to wait for, so the follow-up is optional.

**Schedule:**

- **Before rollout:** recruit about 25 creators, brief each one on what is real, hypothetical, simulated, and measured, and pre register success thresholds.
- **Day 0:** fan invites open; Support Intent live; founding creators eligible for Pro trials.
- **Days 0 to 14:** fans join in batches; wave 2 creators join on Days 7 to 14; creator survey on Day 14.
- **Days 15 to 28:** wave 3 brings the total to 20; **creator recruitment closes Day 28** so every creator's 14 day Pro trial ends inside the window; fan survey on Day 30.
- **Days 29 to 45:** steady state; **fan invites close Day 45**; creator survey on Day 45.
- **Days 46 to 59:** about 10 creator interviews, including what members should get.
- **Day 60:** data freeze and investor report.

**Surveys** include: "If payments were available, would you complete the support you indicated?" Answers are reported as stated intent alongside the in panel likelihood answer, never as verified willingness to pay.

**Weekly rhythm:**

- **Monday:** snapshot and data quality check.
- **Midweek:** creator check ins.
- **Ongoing:** moderation review.
- **Friday:** cost review and a one page update.

---

## 20. Costs

Third party figures. **Verify them on vendor pricing pages before signing up.**

| Item | Approx. per month | Notes |
| --- | --- | --- |
| Supabase Pro (beta) | $25 to $40 | Staging on the free plan |
| Vercel Pro | about $20 | |
| Mux | about $0 to $10 | Pilot volumes within free delivered minutes |
| Resend paid tier | about $20 | |
| Domain | about $1 to $2 | A Crevant domain |
| **Total** | **about $65 to $95** | No payment processing, Connect, or Billing fees |

A build of about 2 months (mostly staging, about $20 to $45 a month) plus the pilot comes to roughly **$250 to $400**, excluding legal costs. Legal work is smaller without payments.

---

## 21. Risks to the credibility of investor results

| Risk | Mitigation |
| --- | --- |
| **Stated intent is not revenue** | Labels everywhere; separate tab; conversion scenarios marked as assumptions; paired with behaviour (retention, engagement) and survey answers |
| **Social desirability** (fans indicate support to please creators they know) | Anonymous by default; report the share of anonymous vs named indications; compare amounts between them |
| **Anchoring on presets** | Report the distribution, not just averages; note that preset order and default affect choices; no preselected amount |
| **Cheap talk** (no cost to indicate) | Report changes and withdrawals; weight findings by stated likelihood; describe results as upper bound signals |
| **Friends and family inflate engagement or intent** | Internal flag; invite source tracked; report creator invited fans separately |
| **Seeded or fake activity** | None in beta; launch check; no bots |
| **Small samples look decisive** | Denominators and ranges; early signals framing |
| **Cherry picked metrics** | Pre registered thresholds; frozen versioned definitions |
| **Simulated ads, Support Intent, and real money confused** | Separate schemas, CI check, separate types, separate tabs, persistent labels |
| **Pro willingness from 20 creators** | Early signal only; report the reasons given |
| **Novelty effect** | Cohort retention through week 8; compare early and late cohorts |

---

## 22. Founder setup checklist

**Start now (in parallel):**

1. **Protect the demo:** set the existing Crevant Vercel project's production branch to `demo`, then confirm the live deployment shows `demo` as its source.
2. Brief counsel on the privacy notice, terms, community guidelines, research consent, Support Intent wording, and emergency process. Claude can draft first versions. No payment terms or tax set up are needed for the pilot.
3. Name at least two moderators, their on call hours, and an appeals email.
4. Check a Crevant domain's availability (and a basic trademark check).
5. Verify official pricing for Supabase, Vercel, Mux, and Resend.
6. Write down pilot success thresholds, including Support Intent and Pro willingness thresholds.

**Staging accounts (unblock development):**

7. A free Supabase project, `crevant-staging`.
8. A Mux staging environment.
9. A Vercel Pro project, `crevant-pilot`, linked to this repository (previews only).
10. Send Claude non secret identifiers; secrets only through the secure credential form.

**Before rollout:**

11. Buy the domain.
12. Email provider with domain authentication.
13. Supabase Pro project `crevant-pilot` with a spend cap; Mux production environment.
14. Point `pilot.<domain>` at Vercel and apply the Supabase Auth settings Claude provides.

**No longer needed for the pilot:** a Stripe account, Connect onboarding, the tax setup for tips, or financial reconciliation.

---

## 23. Future real payments: research already done

Kept for when Crevant moves from Support Intent to real tips, memberships, or Pro billing.

**Proposed economics:**

- For tips and memberships, the actual processing fee on each payment is deducted first; the remaining eligible amount is split 80% creator, 20% Crevant.
- Refund fees, dispute fees, Connect account and payout fees, and transfer currency conversion are separate costs, never part of the split.
- Rounding in whole cents: `creator = round_half_up(net × 0.80)`; `crevant = net − creator`. For example, 10.00 − 0.59 = 9.41, giving 7.53 and 1.88.

**Stripe findings (to re verify when payments return):**

- Using actual fees requires Stripe Connect **separate charges and transfers**: charge on the platform, read the balance transaction fee, then transfer the creator share with `source_transaction`. Destination charges need the platform fee at charge time.
- With asynchronous capture, the fee can arrive later in `charge.updated`, documented as within about an hour.
- Stripe does not return processing fees on refunds. Disputes carry a fee (about $15 in the US).
- Stripe documents cross border separate charges and transfers between Canada and the US. A Canadian platform could pay Canadian and US creators. Whether a Canadian account can settle USD without conversion, Canadian Connect pricing, service agreement terms, and tax reporting (GST or HST, Part XX, US forms) must be confirmed with Stripe and an accountant.
- **Reconciliation would be a launch requirement:** a balanced ledger, a per payment trace, and a daily automated check against Stripe.
- **When to revisit:** if the pilot shows strong Support Intent with high stated likelihood, a natural next step is a small real payment test with a subset of creators, measuring how much indicated support converts.

---

## 24. Sources

- [Supabase pricing](https://supabase.com/pricing)
- [Vercel Pricing in 2026 Explained (MassiveGRID)](https://massivegrid.com/blog/vercel-pricing-explained-2026/)
- [Mux video pricing](https://mux.com/docs/pricing/video)
- [Resend sending limits](https://resend.com/docs/knowledge-base/resend-sending-limits)
- [Stripe: Create separate charges and transfers](https://docs.stripe.com/connect/separate-charges-and-transfers)
- [Stripe: Cross-border payouts](https://docs.stripe.com/connect/cross-border-payouts)
- [Stripe: Asynchronous capture](https://docs.stripe.com/payments/payment-intents/asynchronous-capture)
- [Stripe Support: Understanding fees for refunded payments](https://support.stripe.com/questions/understanding-fees-for-refunded-payments)
- [CRA: Reporting rules for digital platforms](https://www.canada.ca/en/revenue-agency/programs/about-canada-revenue-agency-cra/compliance/reporting-rules-digital-platforms.html)

---

## 25. How this plan was produced

Drafted by Claude (an AI assistant) in Claude Code at the founder's direction, from reviews of the codebase and earlier plans, the founder's written decisions, a headless browser codec experiment, cost calculations, and web research. Costs and legal points are flagged for human verification.

---

## Appendix A. Paused: FlipSocial working name and logo concept

The FlipSocial working name, tagline ("Social media. Flipped."), and logo concept (`docs/brand/`) are **paused** and unused.

Open points if the rename is ever resumed:

- an existing "FlipSocial" app for Flipper Zero (flipsocial.net);
- the association with the shut down "Flip" app;
- perception of the six pointed star symbol;
- trademark and domain clearance.

The brand configuration file in PR #5 keeps a future rename cheap.
