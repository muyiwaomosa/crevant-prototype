# Intelligence (IP-8): review guide

Migration: `supabase/migrations/20261210000000_intelligence.sql` (checksum recorded; merging approves it, D7). The UI is in `src/app/insights.tsx`.

Every view answers three questions, in this order, in plain words: **What happened? What does it mean? What should I do next?** No complex dashboards: one short story per face, a few figures, and one suggested action.

Every figure carries a visible label saying what kind of number it is:

| Label | Meaning |
|---|---|
| Actual | Counted from real member activity on Splitpost |
| Test data | From the tester cohort; never mixed into an actual figure |
| Simulated | Pilot money. Nothing is paid or charged |
| Non-binding | Support Intent: what members said they might do, not a payment |
| Hypothesis | A business assumption still to be tested |

## North Star: Weekly Active Creator-Consumer Connections

The count of distinct (consumer, creator) pairs in a Monday to Sunday week (America/Toronto) where the consumer followed the creator at the time and did something meaningful with that creator's content: a meaningful comment, a save, a repost, a share or opening a post (SP-TA-001 §6.2). Self pairs, blocked pairs and deleted comments are excluded. Tester accounts are counted apart as test data. Pairs that involve the founder are flagged, so the founder can see how much of the ecosystem still depends on them. One function, `ops.connections`, computes it for every view, so the creator, consumer and founder figures always agree.

Post opens are recorded by `app_note_open` (someone else's visible post only; at most 600 an hour per member). Nothing records what a member searched for or builds a profile of what they look at.

## Creator: the Profile cube

> **Nov 28 (SP-UX-003):** the creator faces and the supporter's week are now one page, **Your Insights** (`/app/insights`), opened from Profile, for every member: Reach, Content, Audience, Connection, Your support and Monetization, each with the same three questions or "Not yet measured". Simulated earnings moved to My Split. The data and functions below are unchanged.

Profile now has four faces, reached by swiping or by the visible tab buttons (keyboard and screen reader accessible): **Profile, Attention, Retention, Money**.

| Face | What it shows | Source |
|---|---|---|
| Attention | Followers and new followers against the previous period; where new followers came from (search, discover, profile, share); people reached; top posts | `social.follows`, `follow_events`, `post_views`, `post_opens` |
| Retention | Active supporters; Clique; returning consumers; this week's connections against last week's | `ops.connections`, relationships |
| Money | Simulated earnings by month with a You / Fans / Splitpost bar (no percentages, legal safeguard); ads shown with your posts (actual impressions and clicks); actual income, $0.00 during the pilot; Support Intent, non-binding | `sim` ledger, `ads.impressions`, `app_my_audience` |

Support Intent is read through its own function rather than the money function, because the schema separation check forbids a single function from reading both intent and simulated money.

## Consumer: My Split

My Split stays the centre. A short story at the top ("Your week") covers the creators you connected with, your recognized, pending and eligible points, referral status, and one opportunity (a recent post from someone you follow). It uses the Splitpost symbol, not a diamond. Points valuations remain marked Simulated.

## Advertiser (aggregate only)

The campaign report now opens with the same three steps, then: eligible audience, reach, impressions, clicks, CTR, delivery by preference versus context versus non-personalized, relevance and negative feedback, video plays and completions, **verified** conversions and, on a separate row, **self-reported** conversions (what the advertiser told us without verification). Groups under 10 are withheld. It never shows a member, a search or a profile. Export report gives a CSV.

## Founder: Control Center

Profile, Control Center (founder only). The North Star for the last eight weeks with test and founder-dependent pairs shown apart, then one line each for acquisition, activation (followed someone and made a connection within 7 days), retention, discovery, content, rewards (Simulated), advertising, governance and operations (external access open or closed). A business hypotheses section is labelled Hypothesis. Export CSV and JSON for evidence. Feedback stays in its own inbox (the feedback privacy check forbids other functions from reading it).

Simulated outcomes are never presented as commercial success: revenue, shares and pool values only appear under the Simulated label, and no projection is shown as a result.

## Evidence (local)

* Staging-safe check `026_intelligence.sql` (functions, privileges, empty search paths, no intent and simulated money together, no feedback).
* Behaviour tests `220_intelligence.sql`: every figure checked against the source events and the ledger, including self and blocked pairs, deleted comments, tester and founder pairs, and week boundaries.
* Rollback `scripts/db/staging-rollback-intelligence.sql` in the full chain.
* Unit tests for each face, the stories, the labels and the Control Center export (823 in total).
* Browser journey `e2e/intelligence-journey.e2e.cjs`: a fan connects with a creator; the creator, the fan and the founder each see the same connection; WCAG 2.2 AA at 320 and 390 px.
