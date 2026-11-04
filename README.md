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
| `npm test` | Runs the unit tests |

## Deploying to Vercel

Import the repository in Vercel and accept the detected defaults (framework: Vite, build command `npm run build`, output directory `dist`). `vercel.json` adds a rewrite so deep links such as `/creator/amara` load the app instead of a 404. No environment variables or API keys are needed.

## What you can do

### Fan mode

- **Home feed.** Posts from creators you follow, sorted strictly by time, grouped under Today, Yesterday, and date headings. Each post shows a relative time and the exact clock time. A short explainer describes how the feed works, a creator filter narrows it to one person, and an "all caught up" marker shows where the feed ends.
- **Posts.** Text, illustrated images, and short sample videos. Like, comment, and save. Opening a post shows its full comment thread.
- **Discover.** Eight sample creators across food, travel, tech, music, art, fitness, books, and wellness. Search, filter by interest, and follow or unfollow. Following someone adds their posts to Home immediately.
- **Creator profiles.** Cover, bio, follower count, all posts newest first, and that creator's rewards.
- **Connection Points.** A separate balance with each creator, progress toward that creator's next reward, a non spendable lifetime total, the earning rules with today's usage, and a day by day activity history showing which creator each entry belongs to.
- **Rewards.** Grouped and filterable by creator. Each group shows your balance with that creator, and each card shows the cost, the CP still needed, a progress bar, and a link to earn more with that creator. Redeeming asks for confirmation, deducts CP, and shows a demo confirmation code. Redemption history lives on the Rewards and Profile pages.
- **Profile.** Add, change, or remove a profile picture. Edit your name, handle, and bio. See saved posts, who you follow, and what you have redeemed. **Reset demo** restores the original state.

### Creator mode

Switch with the **Fan / Creator** toggle in the header (phones) or sidebar (desktop).

- **Overview.** Followers, likes, comments, saves, engagement rate, reward count, a seven-day follower chart, and recent post performance.
- **Create.** Publish a text post, optionally with an uploaded photo (resized in the browser) or a sample illustration. New posts appear at the top of the chronological Home feed.
- **Posts.** Everything you have published, with per-post stats and delete.
- **Rewards.** Create a demo reward with a title, description, type, CP cost, and optional limited quantity. It shows up on the fan Rewards page marked as yours.

## How Connection Points work (Release 1)

Since Release 1, **CP belongs to individual creators**. Points you earn by engaging with Amara can only be spent on Amara's rewards. A lifetime "CP earned" total is shown for reference but cannot be spent. See [docs/RELEASE-1.md](docs/RELEASE-1.md) for the hypothesis, tradeoffs, and reasoning.

| Action | CP (to that creator) | Earned at most | Daily limit, all creators |
| --- | --- | --- | --- |
| Follow a creator | 10 | Held while you follow; returned when you unfollow | 5 |
| Comment | 5 | Once per post, if it passes basic quality checks | 6 |
| Watch a video | 3 | Once per video, after 85% genuine playback | 5 |
| Like a post | 2 | Once per post | 10 |
| Save a post | 1 | Once per post | 10 |

Guardrails:

- Each like, save, comment, and watch is keyed to the post, so repeating it never earns twice.
- Comments earn nothing if they are under 12 characters, mostly one repeated character, repetitive (fewer than 3 different words or one word dominating), a copy of an earlier comment, or contain links or self promotion. The comment still posts.
- Video CP needs at least 85% of the video actually played and covered. Seeking or skipping ahead does not count.
- Unfollowing returns the follow bonus. If the balance cannot cover it (because CP was spent), the balance goes to zero and the rest is settled from your next CP with that creator, so balances never go negative.
- Engaging with your own posts earns nothing.
- Rewards need you to follow the creator, hold enough CP with that creator, and have stock left. Each reward can be redeemed once per fan.

These checks run in the browser. They stop accidental and casual farming but not someone who edits `localStorage` directly; a real version must enforce them on a server.

## Profile pictures

Fans and creators can add a profile picture from the Profile page or the Creator Studio. In this prototype the fan and the creator are the same demo person, so one picture is used everywhere your identity appears: profile, creator page, posts, comments, studio, and rewards. Pictures are checked (JPEG, PNG, WebP, or GIF up to 8 MB), cropped to a square, shrunk to 256 pixels, and stored as a small JPEG **in this browser only**. They are not uploaded to a server or shared across devices. Without a picture, initials are shown. Reset Demo removes it.

## Tests

```bash
npm test
```

Runs 65 unit tests (Vitest) for earning, reversal, redemption, eligibility, comment checks, video tracking, picture validation, and storage migration.

A browser end to end script checks the acceptance criteria against a running build. It needs Playwright with Chromium installed separately:

```bash
npm run build
```

```bash
npx vite preview --port 4175 --strictPort
```

```bash
node e2e/release1.e2e.cjs http://localhost:4175
```

## Technical choices

- **React 19, TypeScript, Vite.** Fast dev server, simple static output for Vercel.
- **Tailwind CSS v4.** Design tokens (brand teal, spark amber, ink neutrals, fonts) are defined in `src/index.css` with `@theme`.
- **React Router.** Real URLs for every screen so links can be shared and the back button works.
- **lucide-react** for icons and **clsx** for class names. No other UI library, which keeps the bundle around 120 KB gzipped.
- **Self-contained media.** Post artwork is inline SVG (`src/components/Artwork.tsx`) and the two sample videos in `public/media/` were generated locally with ffmpeg, so the demo never depends on third-party image hosts.
- **State.** A single React context (`src/state/store.tsx`) holds everything and persists it to `localStorage` under a versioned key. Seed content (`src/data/seed.ts`) is not copied into storage; only your own activity is, and seed timestamps are anchored to the moment you first opened the demo so the feed looks fresh.
- **Points engine.** `src/lib/points.ts` is pure and has no React dependency, so the same rules can move to a server later. `src/lib/wallets.ts` decides which wallet a point belongs to, so a universal or hybrid model can be compared by swapping one object.

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
- Uploaded post images and profile pictures are stored as compressed data URLs in `localStorage`, which typically holds about 5 MB. The app warns you if saving fails, and a profile picture that cannot be saved is not applied.
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
