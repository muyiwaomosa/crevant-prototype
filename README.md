# Crevant prototype

Crevant is a creator-first platform built around two ideas:

1. **Connection without algorithmic ranking.** Fans see posts from the creators they follow in a simple chronological feed, newest first.
2. **Loyalty that is recognised.** Fans earn Connection Points (CP) through meaningful engagement and redeem them for rewards that creators define.

This repository is an interactive, mobile-first web prototype of that idea. It runs entirely in the browser with seeded sample data. There are no accounts, no server, and no payments.

> **Prototype notice.** Every creator, post, comment, follower count, point, and reward in this app is fictional or simulated. Connection Points have no monetary value and rewards are never delivered. The chronological feed demonstrates that followers *can* see every post in order; it does not claim that every follower *will* see every post.

## Quick start

Requires Node.js 20 or newer.

```bash
npm install
```

```bash
npm run dev
```

Then open the URL Vite prints (usually http://localhost:5173).

Other scripts:

| Command | What it does |
| --- | --- |
| `npm run build` | Type checks and builds a production bundle into `dist/` |
| `npm run preview` | Serves the production build locally |
| `npm run typecheck` | Runs the TypeScript compiler only |

## Deploying to Vercel

Import the repository in Vercel and accept the detected defaults (framework: Vite, build command `npm run build`, output directory `dist`). `vercel.json` adds a rewrite so deep links such as `/creator/amara` load the app instead of a 404. No environment variables or API keys are needed.

## What you can do

### Fan mode

- **Home feed.** Posts from creators you follow, sorted strictly by time, grouped under Today, Yesterday, and date headings. Each post shows a relative time and the exact clock time. A short explainer describes how the feed works, a creator filter narrows it to one person, and an "all caught up" marker shows where the feed ends.
- **Posts.** Text, illustrated images, and short sample videos. Like, comment, and save. Opening a post shows its full comment thread.
- **Discover.** Eight sample creators across food, travel, tech, music, art, fitness, books, and wellness. Search, filter by interest, and follow or unfollow. Following someone adds their posts to Home immediately.
- **Creator profiles.** Cover, bio, follower count, all posts newest first, and that creator's rewards.
- **Connection Points.** Balance, lifetime earned and redeemed totals, the earning rules with today's usage, your top creator connections, and a day-by-day activity history.
- **Rewards.** Browse rewards from creators you follow or from everyone. Each card shows its cost, type, and remaining stock. Redeeming asks for confirmation, deducts CP, and shows a demo confirmation code. Redemption history lives on the Rewards and Profile pages.
- **Profile.** Edit your name, handle, and bio. See saved posts, who you follow, and what you have redeemed. **Reset demo** restores the original state.

### Creator mode

Switch with the **Fan / Creator** toggle in the header (phones) or sidebar (desktop).

- **Overview.** Followers, likes, comments, saves, engagement rate, reward count, a seven-day follower chart, and recent post performance.
- **Create.** Publish a text post, optionally with an uploaded photo (resized in the browser) or a sample illustration. New posts appear at the top of the chronological Home feed.
- **Posts.** Everything you have published, with per-post stats and delete.
- **Rewards.** Create a demo reward with a title, description, type, CP cost, and optional limited quantity. It shows up on the fan Rewards page marked as yours.

## How Connection Points work

| Action | CP | Earned at most | Daily limit |
| --- | --- | --- | --- |
| Daily check in | 5 | Once per day | 1 |
| Follow a creator | 10 | Once per creator, ever | 5 |
| Comment (12+ characters) | 5 | Once per post | 6 |
| Watch a video to the end | 3 | Once per video | 5 |
| Like a post | 2 | Once per post | 10 |
| Save a post | 1 | Once per post | 10 |

Guardrails against farming:

- Every award is keyed to the action and the item (for example `like:p_amara_1`). Unliking and liking again, or unfollowing and following again, never earns twice.
- Each action type has a daily limit. Past it, the action still works but earns nothing, and a message explains why.
- Engaging with your own posts earns nothing.
- The four creators you follow at the start are pre-marked as rewarded, so unfollowing and refollowing them does not mint points.
- New visitors get a 50 CP welcome bonus so a cheap reward is reachable quickly.

Rewards require you to follow the creator, have enough CP, and have stock left, and each reward can be redeemed once per fan.

## Technical choices

- **React 19, TypeScript, Vite.** Fast dev server, simple static output for Vercel.
- **Tailwind CSS v4.** Design tokens (brand teal, spark amber, ink neutrals, fonts) are defined in `src/index.css` with `@theme`.
- **React Router.** Real URLs for every screen so links can be shared and the back button works.
- **lucide-react** for icons and **clsx** for class names. No other UI library, which keeps the bundle around 120 KB gzipped.
- **Self-contained media.** Post artwork is inline SVG (`src/components/Artwork.tsx`) and the two sample videos in `public/media/` were generated locally with ffmpeg, so the demo never depends on third-party image hosts.
- **State.** A single React context (`src/state/store.tsx`) holds everything and persists it to `localStorage` under a versioned key. Seed content (`src/data/seed.ts`) is not copied into storage; only your own activity is, and seed timestamps are anchored to the moment you first opened the demo so the feed looks fresh.
- **Points engine.** `src/lib/points.ts` is pure and has no React dependency, so the same rules can move to a server later.

### Project layout

```
src/
  types.ts              Domain types (Creator, Post, Reward, LedgerEntry, ...)
  data/seed.ts          Sample creators, posts, comments, rewards
  lib/points.ts         CP rules, daily limits, balance helpers
  lib/simulate.ts       Simulated audience growth for posts you publish
  lib/time.ts           Relative times and day labels
  state/storage.ts      localStorage load, save, reset
  state/store.tsx       App state, derived data, and all actions
  components/           Layout, PostCard, CreatorCard, RewardCard, Artwork, UI primitives
  pages/                Home, Discover, Creator, Post, Points, Rewards, Profile
  pages/studio/         Creator overview, composer, posts, rewards
```

## Known limitations

- No accounts, authentication, or backend. Everything lives in one browser; clearing site data or using another device starts fresh.
- Points are calculated on the client and could be edited in dev tools. That is fine for a demo and is exactly why the engine is isolated for a server move.
- Engagement on posts you publish is simulated and grows over time. Comments from other fans are seeded and static.
- Uploaded images are stored as compressed data URLs in `localStorage`, which typically holds about 5 MB. The app warns you if saving fails.
- Video posts use two short generated clips. Creators cannot upload video yet.
- No notifications, direct messages, or moderation tools.
- Light theme only.

## Suggested next steps

1. **Accounts and a database.** Add auth (for example Supabase, Clerk, or Auth.js) and move the store's actions behind an API. The types in `src/types.ts` are a starting schema.
2. **Server-side points ledger.** Run `evaluateEarn` on the server, make the ledger append-only, and add basic abuse signals.
3. **Creator fulfilment.** Let creators see redemption requests, mark them fulfilled, and message the fan.
4. **Follower delivery options.** Explore opt-in email or push digests so creators have a direct channel, while being honest about what is guaranteed.
5. **Media storage.** Upload images and video to object storage with resizing and moderation.
6. **Testing and analytics.** Unit tests for the points engine, Playwright tests for the main flows, and privacy-friendly product analytics.
7. **Brand refinement.** Iterate on the wordmark, add dark mode, and run an accessibility audit with real assistive tech users.
