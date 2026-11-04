# Release 1: Creator specific Connection Points and rewards

Status: in review (not merged). Everything described here is a local, simulated prototype.

## Hypothesis

> Creator specific Connection Points may encourage more meaningful creator and fan relationships than a universal points balance.

This is a hypothesis to validate, not a settled product decision. Release 1 builds the smallest version that lets us test three things with real people:

1. Do fans understand that each creator has a separate balance?
2. Do rewards motivate meaningful participation rather than tapping for points?
3. Do creators see value in recognising their own supporters?

## Decision: test creator specific CP

In the MVP, CP was one universal balance. Points earned commenting on Amara's posts could pay for Marcus's reward, so a reward did not reflect loyalty to the creator offering it. Release 1 gives each fan a separate CP wallet per creator: CP earned with Creator A can only be spent on Creator A's rewards.

### Tradeoffs against universal CP

| | Creator specific (Release 1) | Universal (MVP) |
| --- | --- | --- |
| Meaning of a reward | Earned through loyalty to that creator | Could be funded by activity anywhere |
| Creator trust | Creators know who earned their perks | A stranger could redeem a creator's perk |
| Fan simplicity | Several balances to understand | One number |
| Reaching a reward | Slower: only one creator's posts count | Faster: everything counts |
| Cross creator discovery | No points incentive to explore | Points reward exploring |
| Fairness to small creators | Rewards are reachable by their own community | Large creators' rewards absorb points earned elsewhere |

A **hybrid** model (a universal balance for platform perks plus creator wallets) is a plausible future option. The code keeps the choice in one place, `src/lib/wallets.ts`: the `PointsModel` object maps each creator and reward to a wallet. The unit tests include a check that the same rules run under the universal model.

## Earning rules

| Action | CP to that creator | Earned at most | Daily limit, all creators |
| --- | --- | --- | --- |
| Follow a creator | 10 | Held while you follow; returned when you unfollow | 5 |
| Comment | 5 | Once per post, if it passes the quality checks | 6 |
| Watch a video | 3 | Once per video, after genuine playback | 5 |
| Like a post | 2 | Once per post | 10 |
| Save a post | 1 | Once per post | 10 |

Unchanged from the MVP: point values and daily limits for follow, comment, watch, like, and save; once per item earning; no CP for engaging with your own posts.

### Removed: daily check in and welcome bonus

Both were universal: they were not earned with any creator, so they cannot belong to a creator's wallet without inventing an attribution. Release 1 removes them rather than guess. This is the only change to which actions earn.

### Not changed, but worth discussing: likes and saves

Likes (2 CP) and saves (1 CP) are low signal and arguably reward tapping rather than participation. They were **left unchanged** in this release to keep the economy change within scope. Options for a later decision:

- Remove CP from likes and saves entirely.
- Keep them but lower the daily limits.
- Keep them but only count them once a fan has also commented or watched.

### Fixes for the three audited exploits

**A. Meaningless comments.** A comment still posts, but only earns CP if it:

- has at least 12 characters,
- is not mostly one repeated character (fewer than 4 different letters or digits, or a run of 7 or more of the same character),
- has at least 3 different words, and no single word is more than half of a comment of 6 or more words,
- is not a copy of one of the fan's earlier comments (ignoring case, spacing, and punctuation),
- contains no link or obvious self promotion ("follow me", "check out my page", "dm me", and similar).

The comment box shows, before posting, whether the comment will earn and why not. These checks cannot judge whether a comment is thoughtful; they only catch the obvious cases.

**B. Video seeking.** The player records how much media time was actually played, counting only small forward steps between time updates (1.5 seconds or less). Seeks and big jumps are ignored. CP is awarded when the video ends, only if at least 85% of its length was played **and** at least 85% of its timeline seconds were covered. Rewatching the same part does not add coverage.

**C. Follow and unfollow.** The follow bonus is held only while you follow. Unfollowing returns it. Following, unfollowing, and following again therefore nets zero. If the fan already spent the CP, the reversal takes the balance to zero (never negative) and records the remainder as owed; the next CP earned with that creator settles it first, shown as its own ledger entry.

## Redemption rules

- A reward needs: following the creator, enough CP **with that creator**, stock remaining, and not having redeemed it before.
- Redemption deducts exactly the cost from that creator's wallet only.
- Double spending is prevented in two layers. The store applies updates synchronously to a ref and re-checks eligibility against the latest state inside the update, so a second redemption is refused. The confirm button also ignores further clicks once a redemption succeeds.
- Every ledger entry records the creator, the kind of event, the amount, and the time.
- All rewards are labelled as simulated. The confirmation states that nothing is delivered and the creator is not contacted.

## Economy balancing

The MVP's reward costs (40 to 600 CP) were set for a pooled balance. With creator specific wallets, a fan can earn at most about **8 CP per post** with a creator (like 2, save 1, comment 5), plus 3 for each finished video and 10 while following. Each seeded creator has 3 posts, so a new tester can earn roughly 24 to 37 CP with one creator in a session.

New costs use two tiers per creator:

- **Entry rewards: 15 to 20 CP.** About two posts' worth of engagement, reachable in one session. 15 CP for most creators, 20 for Sofía and Marcus, whose posts include a video worth 3 CP.
- **Higher value rewards: 60 to 150 CP.** If a creator posts about 3 times a week and a fan engages fully, that is about 24 CP a week, so these take roughly 2.5 to 6 weeks. Limited stock rewards (calls, live seats, naming a track) sit at the top.

| Reward | Before | After |
| --- | --- | --- |
| Theo: Arctic wallpaper pack | 40 | 15 |
| Theo: Route files | 120 | 60 |
| Amara: Family recipe card | 60 | 15 |
| Amara: Seat at a live cook along | 400 | 120 |
| Hana: Annotated reading list | 50 | 15 |
| Hana: Book club guest pass | 180 | 75 |
| Kofi: Seed starting guide | 45 | 15 |
| Sofía: Sketchbook flip through | 80 | 20 |
| Sofía: Signed digital edition | 250 | 100 |
| Jordan: 10K plan | 90 | 15 |
| Jordan: Running form check | 300 | 90 |
| Priya: Thank you in the build log | 150 | 15 |
| Priya: 30 minute product chat | 500 | 150 |
| Marcus: Unreleased stems pack | 200 | 20 |
| Marcus: Name a track | 600 | 150 |

These are lower numbers, not inflated earning: point values and daily limits are unchanged. No time advance or activity simulation was added; the higher tier is meant to stay visibly out of reach in a first session. The creator reward form now suggests 15 to 150 CP and explains the per post earning rate.

## Existing demo data

Stored data is versioned. Version 1 (MVP) data is migrated to version 2 on first load:

- **Points are retired, not converted.** The old universal balance cannot be split between creators defensibly, because spending came out of a shared pool. The ledger starts empty and a notice on the Points page states the retired balance and why.
- **Everything else is kept:** follows, likes, saves, comments, published posts, created rewards, profile, and mode.
- **Old redemptions stay in history,** labelled "Old universal CP", and still count toward each reward's once per fan limit.
- **Earning history is cleared,** so fans can earn again under the new rules.
- Unrecognised or corrupt data falls back to a fresh demo. Reset Demo works as before.

## Profile pictures

Fans and creators can upload, preview, change, and remove a profile picture. In this prototype the fan and the creator are the same demo person, so one picture is shown wherever that identity appears: profile, creator page, posts, comments, studio, and rewards. Seeded creators keep generated initials avatars.

- Accepted: JPEG, PNG, WebP, GIF up to 8 MB. Other types, empty files, oversized files, and images that cannot be decoded get a specific error message.
- The image is centre cropped to a square and shrunk to 256 by 256 pixels as a JPEG (a few KB for simple images; capped at about 150 KB).
- It is saved to `localStorage` before being applied; if the browser storage is full, the old picture stays and an error is shown.
- **Pictures are not uploaded to a server and are not shared across devices.**
- The dialog traps keyboard focus, labels the file control, and announces errors.

## What changed

- `src/lib/points.ts`: pure engine for creator wallets, earning, follow reversal with owed CP, eligibility, redemption.
- `src/lib/wallets.ts`: swappable points model (creator specific now, universal for comparison).
- `src/lib/commentQuality.ts`, `src/lib/watch.ts`, `src/lib/avatar.ts`: comment checks, playback tracking, picture processing.
- `src/state/storage.ts`: version 2 schema and version 1 migration.
- `src/state/store.tsx`: actions call the engine against live state; `setAvatar` saves before applying.
- Points, Rewards, creator profile, post, profile, studio pages, and the reward card were updated. The daily check in card was removed from Home.
- The shared dialog now keeps keyboard focus inside while open.
- The phone header shows a compact CP link (no single balance) and hides the wordmark text below 360px so nothing overflows.

## Tests performed

All of the following were run on this branch.

- **Unit tests (Vitest): 65 passed.** Creator wallet isolation; once per item; daily limits including across creators and the next day; self engagement; comment quality cases; duplicate detection; follow cycles; reversal after spending with owed CP settled later; exact deduction; refusal one CP short; double redeem; stock; own rewards; legacy redemptions; progress maths; a 2,000 step random sequence asserting no wallet ever goes negative; watch tracking (full play, seek to end, jump without seek event, half then skip, rewatch, fast playback, 85% boundary); picture validation and cropping; migration from version 1, current version round trip, and corrupt data.
- **Browser end to end (Playwright, Chromium, production build): 64 checks passed.** Covers every acceptance criterion in this release, including a rapid triple click on Confirm, genuine 8 second playback versus seeking, the picture flows (wrong type, oversized, corrupt, preview, save, persistence, change, a simulated full storage quota, remove, reset), migration from version 1 data, the six existing journeys, no sideways scrolling at 320px on 10 routes, and zero console errors.
- `npm run build` (type check and Vite build) passed.
- Screens were reviewed visually at 390px, 320px, and 1440px.

## Known limitations

- **Client side rules are not secure.** Anyone can edit `localStorage` to change balances. The engine is pure so it can move to a server.
- Daily limits use the device's local date, so changing the device clock affects them.
- Video tracking counts media time between player updates. Fast playback (a few times normal speed) can still count, because the exact cut off depends on how often the browser reports progress. Server side checks would compare against wall clock time.
- Comment checks are heuristics in English. They can be gamed by varied low effort comments, and a few genuine comments (for example "Sooooooo good!!!") will not earn.
- The follow bonus is not held for the creators the demo starts you following. Unfollowing and following again grants it (and unfollowing returns it).
- Fan and creator share one identity and one picture in this prototype.
- Simulated audience engagement in the studio is unchanged.

## Open questions for user validation

1. Do fans understand separate balances without explanation, or do they look for one total?
2. Does seeing "Points from other creators cannot be used" feel fair or frustrating?
3. Are 15 CP entry rewards motivating, and do higher tiers feel achievable or out of reach?
4. Do fans change behaviour (more comments, fewer empty likes) when points are tied to one creator?
5. Should likes and saves earn CP at all?
6. Do creators value knowing that only their own community can redeem their rewards?
7. Is the follow bonus reversal understood, or does it feel punitive?
8. Would a hybrid model (platform wide plus creator wallets) be clearer?

## Role of AI assisted development

This release was implemented by Claude (an AI assistant) working in Claude Code at the founder's direction, against a written specification. Claude wrote the code, tests, and documentation, ran the unit tests, the production build, and the browser checks, and reviewed screenshots. The product hypothesis, scope, and acceptance criteria came from the founder. Pricing and rule choices documented above are proposals for human review and should be validated with real fans and creators before being treated as decisions.
