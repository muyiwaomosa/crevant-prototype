# SP-REFINE-001: Product experience refinements and the connection framework (proposal, Nov 26)

Response to the founder's product review of Nov 26. Visual previews (six
phone screens, the approved brand): https://claude.ai/artifact/LT9k8aSFrFMz6MxRqtsvQ9.
Sections 1 to 4 are the user experience (Home is approved and built; Discover
and Profile need the founder's look at the previews). Sections 5 to 8 are a
business proposal: **nothing in them is implemented** until the founder
approves the rules (section 9).

## 1. Where the app differs from the approved design (SP-DESIGN-002)

| Area | Approved | In the app today | Fix |
|---|---|---|---|
| Home header | Logo and a feedback button; no page title | "Home" title and a sentence | Visual pass (V1) |
| Home tabs | Clique first, My Clique, Following | Same | **Done:** one feed (founder decision) |
| Clique strip | Apricot-to-seafoam rings, unseen count (9+) | Only creators with unseen posts, cobalt ring | **Done:** every Clique member, approved ring and count, Edit Clique tile |
| Composer | Create is its own destination; Home is for reading | A large composer at the top of Home | V1: Home opens on content; Create stays one tap away |
| Post cards | Full-bleed photo and video, creator over the image, 26 px radius; text posts in the display face | Plain cards, small text | V1 |
| Discover | Search, then one hero recommendation, then posts | Search, three faces, an interest drop-down, long cards with chips | D1 (preview 2 and 3) |
| Profile | Picture, name, bio, three counts, three actions, a post grid | Many sections; owner tools and insight faces on the same page | P1 (previews 4 and 5) |
| Insight names | Attention, Retention, Money | Same | Reach, Connection, Earnings (labels only) |
| Face transition | Whole-face swipe, 320 ms settle, 48 px threshold | Implemented (`src/components/FaceView.tsx`) and correct | Use it only where a destination has distinct views: Discover's focused views and Your insights. Not on Home or a public profile |

## 2. The simplified experience (previews)

* **Home** (built): one feed. Unseen posts from the member's Clique come first
  with no label, then everything else from the people they follow, newest
  first, each post once, nothing from outside. At the top, a row of Clique
  members: those with new posts first, with the ring and count; tapping one
  opens catch-up (new posts first, then their earlier posts, then back to
  Home). Not Stories: nothing expires. The last tile edits the Clique (no
  size limit, unchanged).
* **Discover** (preview 2): one question, "What are you looking for today?",
  one search box, then three ways in: **For you** (recommendations, each with
  its reason), **People** (creators, with fair rotation), **Topics** (preview
  3: pick a topic, see who and what, with why). One hero recommendation and a
  few posts on the first screen; everything else one tap deeper. Session
  intent, the creator rotation and discovery intelligence are unchanged
  underneath.
* **Someone's profile** (preview 4): picture, name, bio, Followers, In
  Cliques, Supporters, then Follow, Join Clique, Support, then their posts.
  Share, report and block move into the "···" menu.
* **Your profile** (preview 5): the same top, Edit profile and See as others
  do, then one **Your insights** card (Reach, Connection, Earnings, only you
  see it) that opens the three insight faces, which keep the approved What
  happened, What it means, What to do next. Settings hold the Clique, saved
  posts, blocked members, privacy and ad preferences.
* **My Split** (preview 6, proposal): one column. Connection Points (one bar:
  recognition and reward-eligible), Connection Score, the next goal with its
  steps, Earnings (accumulated, locked, unlocked, simulated). History and
  opportunities one tap deeper. Same symbol and navigation.

## 3. What is reused

`FaceView` (transition), `PostItem` and `PostList`, `MemberAvatar`, the
catch-up page and `app_catch_up`, `app_home_priority`, `app_unseen_creators`,
`app_my_relationships`, the Discover data functions (`app_discover_*`,
search, rotation, reasons), the insight faces' data (`app_my_audience`,
intelligence functions), the My Split ledger views, `CreatorCard`, the ad
slot. The refinements are presentation changes; Home needed **no** database
change, and Discover, Profile and the visual pass need none either.

## 4. Effort and the December 23 target

| Item | Effort | Status |
|---|---|---|
| H1 Home one feed, Clique row, catch-up | about 1 day | Built and tested (unit and journeys); merges after the full suite |
| V1 Visual fidelity: header, immersive cards, Home without the composer | 2 to 3 days | After the founder confirms previews 1 |
| D1 Discover (search first, three focused views) | 2 days | After the founder confirms previews 2 and 3 |
| P1 Profile split, Your insights, new names | 2 days | After the founder confirms previews 4 and 5 |
| Tests and journeys for the above | included | |

**Impact:** about 7 working days of UI work, no database change. If the
previews are confirmed by **December 1**, the refinements land by about
December 10, leaving the remaining days for acceptance. December 23 holds.
The framework (sections 5 to 8) is **not** proposed for December 23: each part
needs a migration, tests and legal input; recommended for the first pilot
iteration after launch, with the simulated locked-earnings display first if
the founder wants it earlier (about 3 days once approved).

## 5. The connection framework (proposal)

Principle: reward the value people contribute, not the time they spend.

* **Connection Goals:** short, visible checklists ("Publish 10 original
  posts", "Have 5 active supporters"), each with progress and a next action.
  Goals unlock things (earnings release, badges); they are never a currency.
* **Connection Score (0 to 100):** a private, explained measure over the last
  28 days, from four parts the member can see:
  * Contribution: original posts and meaningful comments (not volume: capped
    per week);
  * Relationships: active supporter relationships in both directions, and
    returning to the same creators;
  * Consistency: weeks active out of the last six;
  * Integrity: starts full; reduced only by confirmed violations, restored
    on a successful appeal.
  It is shown only to the member, never to others; it is **never used in
  distribution, ranking or advertising**, and it cannot be earned, spent or
  transferred. A database test can enforce that no feed or discovery function
  reads it.
* **Connection Points:** unchanged. One currency; recognition points versus
  reward-eligible points stay separate; qualified referrals remain the only
  financially eligible contribution.

## 6. Creator qualification and locked earnings (proposal)

**Illustrative benchmarks** (for the founder to set): 10 original posts;
posts in 4 of the last 6 weeks; 50 genuine followers (accounts in good
standing, not follow-for-follow); 5 active supporters; Connection Score of at
least 40; good standing. Reachable in about six weeks by a new creator;
nothing depends on audience size beyond 50.

**Earnings before qualification:** the creator share is attributed exactly as
today (the content share of eligible net advertising revenue, split 40:20:40,
creator share by valid ad impressions on their posts). What changes is a
**release state** on each creator-share entry: *locked* until the creator
qualifies, then *eligible for settlement* (after the usual fraud and integrity
review), then *settled* under the settlement rules. Splitpost never absorbs a
locked share. On screen: accumulated, locked, unlocked, progress, remaining
goals, next action (preview 6), with earning, qualifying, settlement and
withdrawal explained separately. Pilot: all simulated; nothing held or paid.

**Implications to resolve before any real money** (legal and accounting
review):

| Case | Proposed handling (needs approval) |
|---|---|
| Creators who never qualify | Locked balance kept; no expiry or forfeiture without a founder decision and legal review (unclaimed-property rules may apply) |
| Inactive or deleted accounts | Today a deletion forfeits simulated awards. For real money: decide between payout on request, holding as a liability, or a defined process under applicable law |
| Fraud | Entries from confirmed invalid traffic reversed by compensating entries (the ledger's existing reversal pattern), before release |
| Refunds and revenue adjustments | Reversals against the month's entries, locked or not, before release |
| Changed requirements | Grandfathering: progress counts against the rules in force when earned, unless the founder decides otherwise |
| Liabilities and reserves | Locked balances are an accrued liability; a reserve policy and its size are an accounting decision |
| Payment and identity checks | Identity verification and tax information at first release (real money only), through the payment provider |

## 7. Consumer progression (proposal)

* **Member progression** (goals, no money): build a Clique of people you
  actually read (no minimum size); support creators in 4 of 6 weeks; leave
  meaningful comments; share posts that bring someone to follow; return to
  creators you value.
* **Recognition points:** as today (comments, saves, reposts, shares).
* **Financially eligible contributions:** qualified referrals only, unchanged.
* **Financial reward qualification** (proposal): good standing, a verified
  identity at first release, and at least one qualified referral.
Guards: no rewards for following, liking, Clique size or time spent; daily
caps; referral integrity as today.

## 8. Interactive advertising: message comprehension (proposal)

An optional "Quick question" after a valid ad view, only for campaigns whose
advertiser opted in: one question, three answers in random order, one try.
A correct answer earns capped **recognition** points (proposed 2 points, at
most 3 a day, once per campaign); no money. Skippable; never blocks content.

Reporting adds: challenge participation, correct responses, comprehension
rate (correct over participants), shown separately from organic interest
(clicks, expressed interest) and verified conversions, with a fixed note that
comprehension is not purchase intent. Abuse controls: one attempt, answers
not shown first, the existing per-member ad caps, rate limits.

## 9. Implications for the existing engines

| Engine | Change |
|---|---|
| Rewards ledger | New point rule `ad_comprehension` (recognition, capped); a release state on creator-share entries (append-only, like award states); goals as read-only views over existing data |
| Advertising | Opt-in flag and one question per campaign; a responses table; new aggregate report rows (k-anonymity threshold as today) |
| Intelligence | Reach, Connection, Earnings are labels only; Connection Score is a new private view over existing analytics |
| Governance | Integrity reads confirmed enforcement records; appeals restore it; the score is excluded from every distribution and moderation decision |
| Distribution | No change: eligible chronological distribution and fair rotation are untouched |

## 10. Decisions for the founder

1. Confirm previews 1 to 5 (Home visual pass, Discover, Profile) so V1, D1
   and P1 can be built. **Recommended:** yes, by December 1.
2. Rename the insight faces to Reach, Connection and Earnings. **Recommended:** yes.
3. Approve the framework direction (goals, a private Connection Score, one
   points currency) for design detail. **Recommended:** yes, after launch.
4. Set the creator qualification benchmarks (section 6 gives a starting set).
5. Approve locked earnings in principle, with expiry, forfeiture and
   deleted-account handling deferred to legal review.
6. Approve the consumer financial-qualification rule (section 7).
7. Decide whether to pilot comprehension questions, and the point cap.
8. Timing: framework after December 23 (recommended), or the simulated
   locked-earnings display before it.
