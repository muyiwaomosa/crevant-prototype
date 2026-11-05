# Crevant prototype

Crevant is a creator-first platform built around two ideas:

1. **Connection without algorithmic ranking.** Fans see posts from the creators they follow in a simple chronological feed, newest first.
2. **Loyalty that is recognised.** Fans earn Connection Points (CP) through meaningful engagement and redeem them for rewards that creators define.

This repository is an interactive, mobile-first web prototype of that idea. It runs entirely in the browser with seeded sample data. There are no accounts, no server, and no payments.

> **Phase 1A (pilot) layout on `main`.** The public site (landing page, and placeholders for sign in and invitation requests) is served at `/`. The prototype described below lives at **`/tour`**, with a banner on every screen saying it is sample data; old links such as `/discover` redirect to `/tour/discover`. The live demo is the frozen `demo` branch and is unchanged. See `docs/PHASE-1A.md`.

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
| `npm test` | Runs the unit tests and the build guard tests |
| `npm run check:production` | Checks the live production site is still the frozen demo build |

## Deploying to Vercel

Import the repository in Vercel and accept the detected defaults (framework: Vite, build command `npm run build`, output directory `dist`). `vercel.json` adds a rewrite so deep links such as `/creator/amara` load the app instead of a 404. No environment variables or API keys are needed.

**Production is the `demo` branch.** Vercel's production branch setting (`demo`) is the primary safeguard. On `main`, `npm run build` also refuses to build when `VERCEL_ENV` is `production`, and if a `main` build is ever served on the production address it shows only the sample prototype. Never use "Promote to Production" on a `main` preview. See `docs/PHASE-1A.md`.

## What you can do

Since Release 2 there is **one experience for everyone**. There is no Fan or Creator mode: anyone can follow people, engage, publish, and offer rewards from the same navigation. See [docs/RELEASE-2.md](docs/RELEASE-2.md) for why.

- **Welcome.** First time visitors get a short, skippable introduction and choose who to follow. Nobody is asked to pick a role. It can be replayed from Profile.
- **Home.** Posts from people you follow, strictly newest first, grouped by day, with a filter by person and an "all caught up" marker. A "Share something" prompt leads to Create.
- **Discover.** Find people by interest or search, follow and unfollow, and open their profiles to see their posts, rewards, and your CP with them.
- **Create.** Publish a text post with an optional uploaded photo or sample illustration. It appears on your profile and at the top of your followers' feeds.
- **Rewards.** Three tabs: *Rewards* (grouped by person, filter by people you follow or everyone), *My CP* (your separate balance with each person, ways to earn, activity history), and *Redeemed* (history with demo codes).
- **Profile.** Your one profile: picture, name, handle, bio, your posts, saved posts, who you follow, and a simulated follower count. **Creator tools** (Profile → Creator tools) holds reward management and a clearly labelled simulated audience overview. Replay the welcome or **Reset demo** here.

Old links from earlier releases (`/studio`, `/studio/new`, `/studio/posts`, `/studio/rewards`, `/points`, `/creator/me`) redirect to their new homes.

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

Everyone has one profile and can add a profile picture from the Profile page. It is used everywhere you appear: profile, posts, comments, the Create page, and the rewards you offer. Pictures are checked (JPEG, PNG, WebP, or GIF up to 8 MB), cropped to a square, shrunk to 256 pixels, and stored as a small JPEG **in this browser only**. They are not uploaded to a server or shared across devices. Without a picture, initials are shown. Reset Demo removes it.

## Tests

```bash
npm test
```

Runs the Vitest unit tests for earning, reversal, redemption, eligibility, mutual followers, comment checks, video tracking, picture validation, and storage migration (versions 1, 2, and 3), plus the Phase 1A public site, tour routing and production fallback tests, then the build guard tests with Node's test runner.

A browser end to end script checks the acceptance criteria against a running build. It needs Playwright with Chromium installed separately:

```bash
npm run build
```

```bash
npx vite preview --port 4175 --strictPort
```

```bash
node e2e/phase1a-landing.e2e.cjs http://localhost:4175
```

```bash
node e2e/release2.e2e.cjs http://localhost:4175/tour
```

```bash
node e2e/release1.e2e.cjs http://localhost:4175/tour
```

`phase1a-landing` covers the public site, layout at 320 to 1280 pixels, no data collection, redirects, keyboard access and the production fallback. `release2` covers the unified experience and onboarding; `release1` covers creator specific CP, anti farming, redemption, and pictures.

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
  pages/tools/          Creator tools: reward manager, simulated audience, your posts list
  pages/OnboardingPage  First run welcome and choosing who to follow
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
