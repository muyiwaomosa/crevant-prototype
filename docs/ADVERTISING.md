# Advertising (IP-7): review guide

Migrations: `supabase/migrations/20261208000000_advertising.sql` (merged, PR #111) and `20261209000000_ad_creatives_and_caps.sql` (image and video creatives; checksum recorded, merging approves it, D7). The objective: connect members with businesses offering relevant solutions to commercial needs the members chose to express. **Everything an advertiser pays is simulated during the pilot.** Campaign observations (impressions, clicks, feedback, verified conversions) are actual and kept in the `ads` schema, apart from the simulated money in `sim`.

| Capability | How | Requirements |
|---|---|---|
| Managed onboarding | Founder records what the advertiser sells, the problem it solves, the desired outcome, customer needs, the objective, the conversion action, eligibility limits and the commercial categories; approves or declines with a reason. No campaign runs for an advertiser that isn't approved. Audiences come from this onboarding: no automated or AI audience generation | ADV-02, refinement |
| Commercial categories | A fixed, reviewed list of 15 (home and kitchen, software and apps, travel and so on). No sensitive or prohibited category exists (health, religion, politics, dating, alcohol, gambling, crypto, loans, adult, weapons, tobacco), so none can be targeted | ADV-15, policy section 7 |
| Member preferences | Optional, editable, removable (Profile, "Ads and your preferences"): Interested or Don't show, per category; "Ads you hid" with Show again; Remove all. Access never depends on them | ADV-01 |
| Separation | Matching never reads content interests, follows, searches, comments or likes; `024_advertising.sql` checks the source of the matching functions on every deploy | ADV-D02 |
| Rules-based matching | In order: a category the member chose; then the topic of the post being viewed (contextual, never faith or health content); then a non-personalized ad if the campaign allows it; otherwise no ad. Respects status, dates, placement, approval, exclusions, a per-campaign daily cap (1 to 10), at most 20 ads a day per member and one per slot every 20 seconds. Fair rotation among equally relevant campaigns | ADV-03, ADV-07 |
| Placement | Content-associated: below someone else's post (never your own). General feed: one slot on Home between the Clique group and the rest, never removing or reordering posts | ADV-04, ADV-05 |
| Transparency and controls | Every ad is labelled Sponsored with the advertiser; "Why this ad" says which rule matched ("You chose…", "Shown with … posts. Not based on anything about you.", "Not personalized"); Relevant, Not relevant, Hide this ad, Report ad. Links open in a new tab with `rel="noopener noreferrer sponsored"` | ADV-08 |
| Measurement | One row per served ad: a valid view (half visible for a second), an outbound click (only after a view) and one piece of feedback each count once; rows can't be rewritten. Verified conversions are reconciled manually per campaign and month | ADV-09 to ADV-11 |
| Reporting | Aggregate only: eligible audience, reach, impressions, clicks, CTR, verified conversions, relevance and negative feedback, delivery by preference, context and non-personalized, content versus feed, advertiser satisfaction, simulated revenue. Groups under 10 are withheld. Nothing identifies a member | ADV-13, INT-06 |
| Commercial demand | Founder: how many members chose each category (under 10 withheld) | Refinement (basic) |
| Economics | Founder attributes a campaign's simulated eligible net revenue for a finished, open month. It is split between content-associated and general feed delivery in proportion to valid ad impressions; the content share goes to creators in proportion to **valid impressions of the ad served with their posts** (never organic post views), in whole cents, into 40/20/40; the general feed share is Splitpost's. Once per campaign and month; refused for an open or closed month | ADV-12, ADV-14 |
| Image and simple video creatives (20261209000000) | Managed: the founder uploads the file to the public `ad-creatives` bucket in Supabase (JPEG, PNG or WebP, or MP4, up to 8 MB), picks it in the campaign form and writes a text alternative. A campaign can't be activated until its file exists with the right type. Images load from Splitpost's own storage (already allowed by the security headers); video is fetched into a local blob link and plays inline, muted, with controls, never autoplaying, so no Production header change is needed. Plays (3 seconds) and completions count once, after a valid view, and are reported | ADV-06, ADV-09 |
| No rewards for ads | Viewing or clicking ads earns no Connection Points (`ad_view` is 0 and ad events never touch the ledger) | Founder decision |

## Hypotheses and metrics (for IP-8)

| Metric | Source | Kind |
|---|---|---|
| Eligible audience size | Members who chose a campaign category, less exclusions | Actual |
| Impressions, outbound clicks, CTR | `ads.impressions` | Actual |
| Verified conversions | Founder reconciliation with the advertiser | Actual (manual) |
| Hides, not relevant, reports | Member feedback on served ads | Actual |
| Consumer-reported relevance | "Relevant" feedback | Actual |
| Advertiser satisfaction | Founder records 1 to 5 per campaign | Actual (manual) |
| Revenue, creator share, fan pool | `sim.revenue_entries` through `sim.split` | Simulated |

No claim of superiority over other advertising is made from these until there is evidence.

## Deferred (post-MVP roadmap)

Aggregated commercial demand intelligence beyond counts, temporary purchase intent, automated audience mapping, demand-led advertiser acquisition, in-app creative upload and editing tools, and self-serve advertiser accounts.

## Evidence (local)

* Staging-safe check `024_advertising.sql`; behaviour tests `200_advertising.sql` (preferences, onboarding and approval, faith content refused, matching order, caps and spacing, observations once, hide and undo, aggregate report and thresholds, conversions, attribution to the creator, never an open or closed month).
* Rollback `scripts/db/staging-rollback-advertising.sql` (11 checks) within the full chain (98).
* Unit tests for the ad card, Why this ad, the click and hide, contextual and own-post cases, the feed slot, preferences, and the founder page.
* Browser journey `e2e/advertising-journey.e2e.cjs` (26 checks, WCAG 2.2 AA at 320 and 390 px): onboarding through to the creator's simulated share.
