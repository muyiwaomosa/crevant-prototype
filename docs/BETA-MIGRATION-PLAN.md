# FlipSocial private beta: migration plan

**Status:** proposed for approval. Nothing in this plan has been provisioned or implemented.
**Scope:** move the current localStorage prototype to a shared, invite only, multi user beta for about 5 to 10 creators and 30 to 50 fans, using Supabase (auth, Postgres, storage, server functions) with the frontend on Vercel.
**Unchanged for now:** the GitHub repository (`muyiwaomosa/crevant-prototype`) and the live demo (`crevant-prototype.vercel.app`).

Contents

1. Decisions log
2. Brand and naming: FlipSocial
3. Current architecture and what can be reused
4. Environments: demo, staging, beta
5. Database schema
6. Authentication, profiles, invite only access
7. Posts, follows, feed, likes, comments, video
8. Connection Points and rewards on the server
9. Advertising demonstration (illustrative only)
10. Security rules and abuse prevention
11. Moderation and safety
12. Media storage, privacy, account deletion
13. Implementation phases and acceptance tests
14. Costs
15. Risks, effort, deferred features
16. Open items that need your input
17. Sources
18. How this plan was produced

---

## 1. Decisions log

| # | Decision | Source |
| --- | --- | --- |
| D1 | Shared multi user app on Supabase; frontend stays on Vercel | Founder |
| D2 | Keep the unified experience: everyone can follow and create | Founder |
| D3 | Keep the chronological Following feed with no ranking | Founder |
| D4 | Keep creator specific Connection Points (CP), now enforced on the server | Founder |
| D5 | Real, non monetary rewards with manual fulfilment; CP has no cash value | Founder |
| D6 | Creators can see participation and CP earned with them, with clear disclosure | Founder |
| D7 | 18+ only for the initial beta | Founder |
| D8 | Basic video upload and playback in scope; video watch CP deferred | Founder |
| D9 | Separate staging and beta environments, subject to cost and domain | Founder |
| D10 | Blocking is in scope for the beta | Founder |
| D11 | Rebrand to **FlipSocial**, tagline **Social media. Flipped.** | Founder |
| D12 | Fictional, clearly labelled ads in the feed plus an illustrative 50:50 creator earnings dashboard; no real billing or payouts | Founder |
| D13 | No automatic global hiding from report counts; personal hiding, prioritised queue, admin review, separate emergency escalation | Founder |
| D14 | No real payments, no algorithmic ranking, no unnecessary infrastructure | Founder |

---

## 2. Brand and naming: FlipSocial

**Name:** FlipSocial. **Tagline:** Social media. Flipped.

**Logo concept** (`docs/brand/`, concept only, not final):

- Two pyramids forming a six pointed star. The **inverted pyramid** is full size, in front, and in the darkest colour, so it dominates by size, layering, and weight. It stands for a creator economy where more people benefit. The upright pyramid is smaller, sits behind, and is brass.
- Each pyramid is split into a light and a dark face to read as a pyramid rather than a flat triangle.
- Files: `flipsocial-mark.svg` (light backgrounds), `flipsocial-mark-dark.svg` (dark backgrounds), `flipsocial-concept.png` (lockups, small sizes, palette).

![FlipSocial concept](brand/flipsocial-concept.png)

**Palette** (restrained, premium). Contrast ratios were calculated against Ivory unless stated.

| Token | Hex | Use | Contrast |
| --- | --- | --- | --- |
| Midnight | `#141B2D` | Primary text, primary buttons, dark surfaces | 15.6:1 |
| Slate | `#454D61` | Secondary text | 7.7:1 |
| Ivory | `#F7F4EE` | Page background | n/a |
| Linen | `#E9E3D7` | Cards on dark, lines, quiet surfaces | n/a |
| Brass | `#B8955A` | Accent **fills only** (CP spark, highlights); also text on Midnight | 2.6:1 on Ivory (not for text); 6.1:1 on Midnight |
| Brass Deep | `#7D5F2C` | Accent text on light backgrounds | 5.4:1 |
| Pine | `#2F5D50` | Success | 7.5:1 with white text |
| Garnet | `#9A2F2F` | Errors, destructive actions | 6.8:1 |

**Things to check before committing to the brand** (flagged, not blocking):

1. **Name already in use.** A web search found an existing "FlipSocial" social app for the Flipper Zero device (flipsocial.net). No trademark filing showed up, but that search is not a clearance. Please run a proper trademark search in your markets before public use.
2. **Association with "Flip".** A social shopping app called Flip (also known as "Flip Social Shopping") shut down in 2025 and was reported to have left creators with unpaid earnings. Because FlipSocial will show creator earnings, consider how that association could land with creators.
3. **Symbol.** A six pointed star of two triangles is a widely recognised religious and cultural symbol (the Star of David) and appears in other traditions. The asymmetric, two colour, faceted treatment helps distinguish it, but get feedback from a diverse group before finalising.

**Naming for environments** (domain availability not yet checked):

| Thing | Proposed name |
| --- | --- |
| Domain | `flipsocial.app` preferred; alternatives `getflipsocial.com`, `flipsocial.co` (`flipsocial.net` is taken) |
| Beta URL | `beta.flipsocial.app` |
| Staging URL | Vercel preview URLs, or `staging.flipsocial.app` |
| Vercel project | `flipsocial-beta` (staging uses its preview deployments) |
| Supabase projects | `flipsocial-beta` (Pro organisation), `flipsocial-staging` (Free organisation) |
| Sign in email sender | `hello@flipsocial.app` or `no-reply@flipsocial.app` |
| Demo | stays `crevant-prototype.vercel.app`, branded Crevant, untouched |

The rebrand of the app itself (name, logo, palette tokens, favicon, page titles, email templates) happens in Phase 1 on the beta codebase only.

---

## 3. Current architecture and what can be reused

The current app (`main`, Release 2) is a React 19, TypeScript, Vite, Tailwind v4 single page app with React Router.

**localStorage dependencies:**

- All state lives in one React context (`src/state/store.tsx`), loaded from and saved to one localStorage key by `src/state/storage.ts`. That is the only file touching localStorage.
- Persisted: profile and picture, follows, likes, saves, comments, published posts, created rewards, the CP ledger, redemptions, onboarding state.
- Seeded content: eight fictional accounts, their posts, comments, rewards (`src/data/seed.ts`), plus simulated numbers (`src/lib/simulate.ts`, `SELF_FOLLOWER_TREND`, base follower counts).
- Images are stored as compressed JPEG data URLs inside localStorage.
- A single hardcoded user, `SELF_ID = 'me'`, appears 33 times in 11 files.
- All CP rules run in the browser (`src/lib/points.ts`). They are pure and tested, but tamperable.

**Reuse:**

| Area | Verdict |
| --- | --- |
| `ui.tsx`, `Modal` (with focus trap), `Tabs`, `Avatar`, `Toasts`, `Layout`, Tailwind tokens | Reuse; restyle with FlipSocial tokens |
| `Wordmark` | Replace with the FlipSocial mark and wordmark |
| `PostCard`, `CreatorCard`, `RewardCard`, `AvatarEditor` | Reuse with small changes: data from query hooks, media from storage URLs |
| Pages: Home, Discover, Create, Rewards, Profile, Post, Creator, Onboarding, Creator tools | Keep layouts; swap `useStore()` for query hooks; add loading, error, and empty states |
| `lib/time.ts`, `lib/format.ts` | Reuse |
| `lib/commentQuality.ts`, `lib/watch.ts` | Keep as client side hints only; the server decides |
| `lib/points.ts`, `lib/wallets.ts` and tests | Become the specification; rules move to Postgres; the same test cases check both |
| `lib/avatar.ts`, `lib/image.ts` | Reuse resizing; output a Blob for upload instead of a data URL; canvas re encoding also strips location metadata |
| `state/store.tsx`, `state/storage.ts` | Replace with a data layer: `@supabase/supabase-js` plus `@tanstack/react-query` |
| `lib/simulate.ts`, simulated follower counts and trends | Remove from the beta; every organic number must be real |
| `data/seed.ts` | Becomes a staging only seed script |
| `e2e/*.cjs` | Adapt to run against staging with test accounts |

New client libraries: `@supabase/supabase-js`, `@tanstack/react-query`, and `tus-js-client` for resumable video upload (only if video stays on Supabase Storage; see section 7).

---

## 4. Environments: demo, staging, beta

| Environment | Frontend | Backend | Data | Purpose |
| --- | --- | --- | --- | --- |
| Demo | Existing Vercel project, `crevant-prototype.vercel.app`, built from a frozen `demo` branch | None (localStorage) | Fictional seed | Public walkthrough; unchanged |
| Staging | `flipsocial-beta` Vercel project, preview deployments | Supabase `flipsocial-staging` (Free) | Seeded test accounts; safe to wipe | Testing every change before beta |
| Beta | `flipsocial-beta` Vercel project, production deployment on `beta.flipsocial.app` | Supabase `flipsocial-beta` (Pro) | Real members only | The private beta |

- The demo is frozen rather than kept in sync. Maintaining a local and a server version in one codebase would double the work.
- Database changes are versioned SQL files in `supabase/migrations`, applied to staging first, then to beta.
- Each Vercel environment has its own Supabase URL and publishable key. The secret service key never appears in Vercel's browser visible variables or in the frontend.
- No demo data moves to the beta. Beta members start fresh.

---

## 5. Database schema

All tables have `created_at`. IDs are UUIDs; a person's ID is their Supabase Auth user ID.

| Table | Key columns | Notes |
| --- | --- | --- |
| `profiles` | `id`, `handle` (unique, case insensitive), `display_name`, `bio`, `category`, `avatar_path`, `onboarding_status`, `is_admin`, `suspended_at`, `beta_cohort`, `deletion_requested_at` | One profile per person; no fan or creator role. `beta_cohort` is a research label set by admins, never shown |
| `guideline_acceptances` | `user_id`, `guidelines_version`, `age_confirmed`, `accepted_at` | Recorded during onboarding |
| `follows` | `follower_id`, `followee_id` | Primary key on the pair; no self follows |
| `blocks` | `blocker_id`, `blocked_id` | Primary key on the pair; no self blocks |
| `posts` | `id`, `author_id`, `body` (max 500), `media_type` (none, image, video), `media_path`, `poster_path`, `duration_seconds`, `width`, `height`, `media_status` (ready, processing, failed), `likes_count`, `comments_count`, `hidden_at` | Index on (`author_id`, `created_at` desc) |
| `post_likes` | `user_id`, `post_id` | Primary key on the pair |
| `post_saves` | `user_id`, `post_id` | Private to the saver |
| `comments` | `id`, `post_id`, `author_id`, `body` (max 400), `hidden_at` | |
| `rewards` | `id`, `owner_id`, `title`, `description`, `fulfilment_info`, `cost` (5 to 1,000), `kind`, `stock`, `redeemed_count`, `active` | Anyone can offer rewards |
| `cp_rules` | `action`, `points`, `daily_limit` | Tunable without a release |
| `cp_wallets` | `fan_id`, `creator_id`, `balance` (>= 0), `owed` (>= 0), `lifetime_earned`, `frozen` | One row per relationship. Non negative enforced by the database |
| `cp_ledger` | `id`, `fan_id`, `creator_id`, `kind`, `amount`, `ref_id` | Append only. Unique on (`fan_id`, `kind`, `ref_id`) for once per item grants |
| `cp_follow_bonus` | `fan_id`, `creator_id`, `granted_at` | Bonus held while following |
| `redemptions` | `id`, `reward_id`, `fan_id`, `creator_id`, `cost`, `code`, `status` (pending, fulfilled, declined, cancelled), `fan_note`, `fulfilment_note`, `idempotency_key`, `reward_title_snapshot`, `fulfilled_at` | Unique on (`reward_id`, `fan_id`) |
| `reports` | `id`, `reporter_id`, `target_type`, `target_id`, `category`, `severity`, `note`, `status`, `assigned_to` | |
| `moderation_actions` | `id`, `admin_id`, `action`, `target_type`, `target_id`, `reason`, `report_id` | Audit log; never edited |
| `moderation_notices` | `id`, `user_id`, `message`, `read_at` | What an affected person sees in the app |
| `evidence_holds` | `id`, `target_type`, `target_id`, `snapshot`, `storage_path`, `expires_at` | Restricted to admins; see section 11 |
| `demo_ads` | `id`, `advertiser_name`, `headline`, `body`, `image_path`, `active` | Fictional creatives; admin managed |
| `ad_settings` | `slot_interval`, `illustrative_cpm_usd`, `creator_share` | Demo assumptions in one place |
| `ad_impressions` | `viewer_id`, `ad_id`, `slot_post_id`, `attributed_creator_id`, `day` | Unique on (`viewer_id`, `ad_id`, `slot_post_id`, `day`); viewer level rows deleted after 30 days |
| `ad_daily_totals` | `creator_id`, `day`, `impressions` | Aggregates kept after viewer rows are purged |
| `deletion_log` | `id`, `hashed_user_id`, `requested_at`, `completed_at`, `counts`, `storage_status` | Non identifying record that a deletion ran |

---

## 6. Authentication, profiles, invite only access

- **Sign in:** email one time code, sent both as a 6 digit code and a magic link. The code works inside Instagram and TikTok in app browsers, where links often open in the wrong browser.
- **Invite only:** public sign ups are turned off in Supabase Auth. Admins invite the roughly 60 members from the Supabase dashboard or a small admin script run locally. Unknown emails cannot sign in.
- **Profiles:** created automatically by a database trigger on first sign in. Onboarding then collects display name and handle (checked for uniqueness), confirms **18+**, and records acceptance of the community guidelines and the supporter visibility disclosure (D6).
- **Supporter disclosure** (shown in onboarding and the privacy notice): "When you engage with someone's posts, they can see that you support them and how many CP you've earned with them."
- **Rollout:** invite creators about a week before fans, so fans arrive to a populated feed. Stagger invites over several days (see the email limit note in section 14).
- **Email:** a sending service (Resend or Postmark) connected through Supabase custom SMTP, on the FlipSocial domain.

---

## 7. Posts, follows, feed, likes, comments, video

**Following feed:** posts from people you follow plus your own, strictly newest first, 20 at a time with keyset paging on (`created_at`, `id`). No ranking. Day dividers and "all caught up" carry over. Fictional ads are inserted by a fixed rule that never changes organic order (section 9).

**Visibility:** everything is visible only to signed in members, minus anything hidden or involving a block (section 11). Nothing is public.

**Engagement through server functions:** following, liking, saving, and commenting go through database functions (`follow_user`, `like_post`, `save_post`, `add_comment`, and their reverses). Each writes the action and any CP in one transaction and returns an outcome ("+2 CP with Amara" or a reason), keeping the existing feedback. Publishing posts is a direct insert protected by security rules.

**Discover:** real members A to Z, search by name or handle, excluding blocked accounts.

**No realtime infrastructure:** the feed refreshes on open, pull to refresh, and tab focus.

### Video

- **Limits:** MP4 or MOV, up to 60 seconds and 50 MB, one per post. Checked in the browser before upload and enforced by the storage bucket.
- **Poster:** the browser captures a frame and uploads a small JPEG so feeds load fast.
- **Playback:** HTML video, tap to play, never autoplays with sound, `preload="none"` until tapped.
- **No watch CP** in the beta (D8). Videos still earn like, save, and comment CP.

**Cross device playback: what was verified.** On 5 November 2026, test files were generated and played in headless Chromium 153 (no hardware decoding):

| File | Codec | Result |
| --- | --- | --- |
| `h264.mp4` | H.264 | Decoded and played |
| `h264.mov` | H.264 in a QuickTime container | Decoded and played |
| `hevc.mp4` | HEVC (H.265) | Failed to decode |
| `hevc.mov` | HEVC in QuickTime | Failed to decode |
| `vp9.webm` | VP9 | Decoded and played |

The container is not the problem; the **codec** is. H.264 plays; HEVC does not in this build. iPhones record HEVC by default ("High Efficiency"). Safari and Apple devices play HEVC, and some desktop Chrome installs can with hardware support, but Android phones and many desktop browsers cannot be relied on. This was **one engine, not real devices**: Safari, Firefox, iPhone, and Android still need testing on real hardware in Phase 2.

**Plan and fallback:**

1. **Detect the codec on upload.** The browser reads the file's header for the HEVC codec tag (`hvc1` or `hev1`). This does not depend on whether the uploader's own browser can play it (an iPhone can play its own HEVC, but Android viewers cannot).
2. **Primary path, no new service:** accept H.264 (and VP9) directly to Supabase Storage.
3. **Device gate in Phase 2:** upload real videos from an iPhone (Safari, from Photos and from the camera), an Android phone, and a desktop; play each on iPhone Safari, Android Chrome, desktop Chrome, Safari, Firefox, and Edge. Note whether iOS converts HEVC to H.264 when choosing a video in Safari.
4. **Fallback if HEVC arrives (likely):** route all video through **Mux**. It converts any input to H.264 adaptive streams that play everywhere, makes posters, and lowers bandwidth by streaming the right quality for each device. It needs two small server functions (create upload URL; receive the "ready" webhook) and signed playback for privacy. `posts.media_status` already supports "processing". At beta volumes the cost is a few dollars a month (section 14).
5. **Interim measure if the gate fails before Mux is wired:** block HEVC uploads with a clear message and show iPhone users how to switch the camera to "Most Compatible". This is a stopgap, not a long term answer.
6. **Not recommended:** converting video in the browser (WebCodecs). It is complex, slow, and drains phone batteries.

**Decision rule:** if any HEVC video in the Phase 2 gate fails on a target device, adopt Mux before inviting members. Images stay on Supabase Storage either way.

---

## 8. Connection Points and rewards on the server

- All CP writes happen inside database functions. Clients can read their own wallets and ledger and never write to them.
- Rules carried over from Release 1:
  - Values and daily limits from `cp_rules`.
  - Once per item, enforced by the ledger's unique constraint.
  - Nobody earns from their own content.
  - The follow bonus is held while following and reversed on unfollow, with any shortfall recorded as owed.
  - Comment quality checks are ported to SQL.
- The TypeScript comment checks stay in the browser for the live hint. **One shared file of test cases** runs against both, so they cannot drift.
- Daily limits reset at midnight UTC; the UI shows the local reset time.
- **No watch CP** (D8).
- **Redemption:** one function locks the fan's wallet and the reward, re checks following, balance with that creator, stock, block status, and prior redemption, then deducts and records. A client generated idempotency key makes retries and double taps safe.
- **Real fulfilment (D5):**
  - Each reward states "How you'll receive this".
  - The fan may add a note at redemption (max 280 characters, with a warning not to share sensitive details).
  - The creator marks it fulfilled with a delivery note, or declines, which refunds the CP in the same transaction.
  - Guidelines ban cash and cash equivalents (money, gift cards, vouchers) as rewards. CP can never be bought, sold, transferred, or exchanged for money.
- **Supporters list (D6):** creators see people who earned CP with them, ranked by lifetime CP, excluding anyone in a block relationship.

---

## 9. Advertising demonstration (illustrative only)

**Purpose:** show how FlipSocial's proposed 50:50 split of eligible advertising revenue between creators and the platform could look, without real advertisers, billing, revenue, or payouts.

**Ad placements:**

- Fictional advertisers only, with invented brand names. No real companies, logos, or products.
- Every ad is labelled **"Sponsored · Demo ad, not a real advertiser"**.
- Tapping an ad opens an "About this demo ad" sheet explaining the demonstration. There are no external links.
- Ads earn no CP and cannot be liked, saved, or commented on. Members can report an ad like any content.
- No targeting and no personal data: ads rotate in a fixed order. Nobody's interests are profiled.

**Placement rule (organic order never changes):**

- One ad slot after every 6th organic post in the Following feed (`ad_settings.slot_interval`), counting organic posts only.
- Never in the first position, never two in a row, and no ads in feeds with fewer than 6 posts.
- Ads appear only in the Following feed: not on profiles, post pages, Discover, or onboarding.
- **Invariant, tested:** removing every ad from a rendered feed gives exactly the same organic posts in exactly the same order as the plain chronological query.

**Simple attribution assumption (for the demo):**

1. An **impression** is an ad at least 50% visible for at least 1 continuous second, counted once per viewer, per ad, per slot, per UTC day.
2. Each impression is **attributed to the creator of the organic post immediately above the ad slot** ("preceding post" rule).
3. **Excluded:** a creator viewing ads next to their own posts; viewers in a block relationship with that creator; hidden posts.
4. **Illustrative eligible revenue** = attributed impressions × an assumed CPM ÷ 1,000. The demo assumes **$5 CPM**, a round figure that is not a market estimate, stored in `ad_settings` and shown on the dashboard.
5. **Split:** 50% to the creator, 50% to the platform.

**Illustrative earnings dashboard** (Profile, then Creator tools, then "Ad earnings (illustrative)"):

- A persistent banner: **"Illustrative only. These are not real earnings, no advertiser has paid, and nothing here is payable."**
- Attributed impressions by day and by post; illustrative eligible revenue; creator 50% share; platform 50% share; and the assumptions in plain words.
- Figures are shown as "illustrative $" and never as a balance, wallet, or withdrawable amount. There is no withdraw or payout button.

**Privacy:** recording impressions means recording that a member saw an ad. Viewer level rows are deleted after 30 days; only daily totals per creator remain. The privacy notice says so.

**What this does not do:** real advertiser accounts, billing, invoicing, payout rails, tax handling, ad targeting, third party ad networks, or tracking pixels.

---

## 10. Security rules and abuse prevention

Row level security is on for every table.

| Table | Read | Write |
| --- | --- | --- |
| `profiles` | Members, minus blocks | Owner, except admin, suspension, and cohort fields |
| `posts`, `comments` | Members, minus hidden and blocks; authors always see their own | Authors insert and delete their own; post authors can delete comments on their posts |
| `post_likes`, `follows` | Own rows | Only through engagement functions |
| `post_saves` | Owner | Owner, through functions |
| `blocks` | Blocker | Through `block_user` and `unblock_user` |
| `cp_wallets`, `cp_ledger` | The fan, and the creator for their own supporters | Never by clients |
| `rewards` | Members, minus blocks | Owner, within constraints |
| `redemptions` | Fan and reward owner | Owner updates status and note through functions |
| `reports` | Reporter (own reports) and admins | Insert by members; status by admins |
| `moderation_*`, `evidence_holds`, `ad_settings`, `demo_ads` | Admins (`demo_ads` readable by members) | Admins |
| `ad_impressions` | Nobody directly | Through `record_ad_impression` |

All server functions:

- set a fixed search path;
- check the caller and refuse anyone signed out or suspended;
- call `is_blocked_between(a, b)` where relevant.

Supabase's security advisor runs before every release.

**Abuse limits:**

- Daily caps: 20 posts, 100 comments, 50 follows.
- Tighter caps for an account's first 48 hours: 5 posts, 30 comments.
- Text length limits; no self follow or self engagement.
- Suspended accounts can read their own data and delete their account, but cannot act.
- Invite only entry is the main defence against fake accounts.
- An admin query flags pairs of accounts inflating each other's CP.

---

## 11. Moderation and safety

### Blocking

Anyone can block anyone from a profile, post, or comment. Blocking is mutual in effect and silent.

When A blocks B:

- Follows in both directions are removed. Normal follow bonus reversal applies.
- Neither sees the other's posts, profile, comments, rewards, ads attributed to the other, or supporter entries. Each sees "This account isn't available".
- B's comments on A's posts are hidden from everyone; A's comments on B's posts are hidden from B.
- B cannot follow, like, save, comment on, or redeem anything of A's. The server functions refuse it.
- B's CP with A is frozen, not deleted. B's pending redemptions of A's rewards are cancelled and refunded into the frozen wallet.
- Unblocking restores visibility and unfreezes the CP; it does not restore follows.

### Creators control their space

Authors can delete any comment on their own posts. CP already earned from that comment stays.

### Reporting

- **Categories and severity:**

| Severity | Categories |
| --- | --- |
| Emergency | Child sexual exploitation; credible threat of violence; self harm or suicide risk; non consensual intimate imagery; doxxing (publishing private information) |
| High | Harassment or bullying; hate; sexual content; graphic violence; impersonation |
| Standard | Spam; intellectual property; misleading reward; other |

- **Immediate personal hiding:** the reporter stops seeing the reported item at once, and is offered the option to block.
- **No automatic global hiding** based on report counts (D13). Content stays visible to others until an admin acts.

### Prioritised moderation queue

- A `moderation_queue` view in the Supabase dashboard, ordered by:
  1. severity (Emergency, then High, then Standard);
  2. number of distinct reporters;
  3. age of the oldest report.
- Admin functions hide or restore content, suspend or unsuspend accounts, place evidence holds, resolve reports, and send in app notices.
- Every action is written to `moderation_actions`.
- **Review targets:**

| Severity | First look | Notes |
| --- | --- | --- |
| Emergency | Within 1 hour while moderators are awake; immediately on waking otherwise | Follow the escalation process below |
| High | Within 12 hours | |
| Standard | Within 48 hours | |

### Emergency escalation process

1. **Alert.** An Emergency report triggers an immediate email to every on call moderator. This uses a small server function and the email service.
2. **Contain.** The moderator hides the content for everyone and, where warranted, suspends the account. Both actions are logged.
3. **Preserve.** An evidence hold copies the content and metadata into a restricted admin only store. This survives account deletion for a fixed period (proposed 90 days, subject to legal advice).
4. **Specific cases:**
   - **Child sexual exploitation:** do not download, forward, or screenshot the material. Follow the legal process agreed in advance with counsel; in the United States this includes reporting to NCMEC.
   - **Self harm or suicide risk:** send the person an in app notice with crisis resources for their country. If there is an imminent risk to life and you have identifying information, contact emergency services.
   - **Credible threats:** preserve evidence; contact law enforcement where appropriate.
   - **Non consensual intimate imagery and doxxing:** remove first, review second.
5. **Follow up.** Notify the reporter that action was taken, without details. Record an incident note. Review the process after each emergency.

The legal duties referred to here vary by country. **This plan is not legal advice**; the process must be agreed with counsel before launch.

### Prevention and transparency

- Community guidelines accepted at onboarding (version stored), including the no cash rewards rule and the illustrative ads explanation.
- In app notices tell people when their content is removed or their account is suspended, with an appeals email.
- **Deferred:** muting (unfollow covers it), keyword filters, restricting who can comment, automated scanning of images and video, in app appeals.

---

## 12. Media storage, privacy, account deletion

### Storage

- Private buckets: `avatars` (2 MB, images), `post-media` (images 5 MB; video 50 MB if video stays on Supabase), `evidence` (admins only).
- Objects are stored under the owner's user ID folder. Bucket settings enforce types and sizes. Media is served through short lived signed URLs fetched in batches.
- If video moves to Mux, videos use signed playback IDs and never sit in Supabase Storage.
- Browser side resizing strips location metadata from images.

### Account deletion (consistent procedure)

Started by the member from Profile, after a fresh one time code (sign in within the last 10 minutes). A single server function, `delete-account`, runs these steps. Each step is idempotent, so a retry finishes the job.

1. **Mark** `profiles.deletion_requested_at`, sign the person out everywhere, and stop all actions from that account.
2. **Evidence check.** If the person is the subject of an open Emergency report, the relevant items are already copied to an evidence hold; holds are kept until they expire.
3. **One database transaction** (`delete_account_data`):
   - **Redemptions where they are the fan:** pending ones are cancelled. Their redemption rows are deleted. Rewards' `redeemed_count` and stock are recalculated.
   - **Redemptions of their rewards by others:** pending ones are cancelled. Those fans keep a history entry that shows the reward title snapshot and "Account deleted". Because the creator's wallets are deleted, no refund is owed.
   - **CP:** all wallets, ledger rows, and follow bonuses where they are the fan or the creator are deleted. Fans are told in the deletion explainer that CP with a deleted account disappears.
   - **Social:** their posts, comments, likes, saves, follows, and blocks are deleted. Like and comment counts on other people's posts are recalculated by the same triggers.
   - **Ads:** impressions they viewed and impressions attributed to them are deleted; daily totals for them are deleted.
   - **Moderation:** reports they filed are kept with the reporter removed. Reports about them and `moderation_actions` are kept with the target anonymised.
   - **Record** a `deletion_log` row with a hashed ID, counts, and timestamps.
4. **Media:** delete every object under their folder in `avatars` and `post-media`, and their Mux assets if Mux is used. Failures are recorded on the `deletion_log` row and retried.
5. **Delete the Auth user.**
6. **Reconcile:** a weekly admin script lists storage objects and Mux assets with no matching profile, and deletes them.

**What the person is told before confirming:** what is deleted, that comments on others' posts disappear, that CP and pending redemptions are cancelled, that the action is permanent, and that some safety records may be retained for a limited time where required.

### Privacy notice (to be written with counsel)

It covers:

- what is stored, including impression records for illustrative ads;
- who can see what, including supporters' CP visibility;
- retention: 30 days for viewer level ad data, the evidence hold period;
- deletion;
- the 18+ requirement;
- contact details.

Data export can be handled manually, on request, during the beta.

---

## 13. Implementation phases and acceptance tests

**Phase 0: setup** (mostly founder tasks: accounts, domain, keys).

- Accept: demo URL unchanged; migrations apply to an empty project; previews point at staging; no secret in the built frontend; CI runs unit tests on every pull request.

**Phase 1: accounts, profiles, rebrand.** Invite only sign in, profile creation, onboarding (18+, guidelines, supporter disclosure), profile and picture with storage uploads, sign out, FlipSocial branding.

- Accept:
  - an invited email signs in; an uninvited one cannot;
  - handles are unique regardless of case;
  - an automated database test proves one member cannot edit another's profile;
  - a 10 MB or PDF upload is rejected by storage itself;
  - the FlipSocial name and logo appear everywhere; no Crevant branding remains in the beta.

**Phase 2: social core and video.** Posts with images and video, follows, Following feed, likes, saves, comments, Discover, author comment deletion.

- Accept:
  - posts appear in followers' feeds newest first, with correct paging, no duplicates or gaps;
  - saves are private; deleted posts vanish everywhere;
  - over 60 seconds or over 50 MB is rejected;
  - an interrupted upload resumes;
  - **device gate:** the video matrix in section 7 passes, or Mux is adopted and passes.

**Phase 3: CP, rewards, fulfilment.**

- Accept:
  - every Release 1 rule passes as a database test;
  - shared comment test cases pass on client and server;
  - 20 simultaneous redeem calls produce one redemption and one deduction;
  - a browser insert into wallets or the ledger is refused;
  - mutual followers earn independently;
  - decline refunds exactly the cost;
  - fan notes are visible only to the fan and the creator.

**Phase 4: moderation, safety, deletion.**

- Accept:
  - **block:** after A blocks B, B's content is gone from all of A's screens and B's comments vanish from A's posts for everyone; B cannot act on A's content even by calling the functions directly; B's pending redemption is refunded and the wallet frozen; unblocking restores it;
  - **report:** a reported item disappears for the reporter only; ten reports alone do not hide it for anyone else; an admin hide does;
  - **emergency:** an Emergency report sends an alert email within a minute; an evidence hold survives the subject's account deletion;
  - **audit:** every admin action is in the audit log;
  - **suspension:** a suspended account cannot post but can delete itself;
  - **deletion:** removes all rows listed in section 12; counts on others' posts are corrected; storage objects and Mux assets are removed; the reconcile script finds nothing left behind.

**Phase 5: illustrative ads.** Demo ad creatives, placement, impressions, dashboard.

- Accept:
  - **ordering invariant:** the organic order with ads removed equals the chronological query, across 500 generated feed pages;
  - **placement:** no ad first, no two adjacent, none in short feeds;
  - **impressions:** a creator viewing next to their own post records nothing; impressions are deduplicated per viewer per day;
  - **dashboard maths:** matches impressions × CPM ÷ 1,000 × 50%;
  - **labels:** every ad and every dashboard figure carries an illustrative label; there is no payout or withdraw control anywhere.

**Phase 6: beta readiness.** Remove all simulated organic numbers, error and empty states, backups confirmed and one restore tested, team dry run on staging, then invite creators, then fans.

- Accept: all suites green on staging; no console errors; 320 px layouts clean; go or no go checklist signed off.

---

## 14. Costs

**Pricing was not verified on the vendors' own pages.** Figures come from third party pricing guides from late 2026, plus Cloudflare's and Mux's documented rates as summarised by search results. Confirm each before signing up.

### Base monthly cost

| Item | Choice | Approx. per month |
| --- | --- | --- |
| Supabase beta | Pro: about $25, including about $10 of compute credit (one Micro database), about 100 GB file storage, and about 250 GB uncached egress | ~$25 |
| Supabase staging | Free plan in a separate organisation (pauses after a week idle, which is fine for staging) | $0 |
| Vercel | Pro, because Hobby is personal and non commercial only; about $20 including one deploying seat; viewers free | ~$20 |
| Email | Resend free: 3,000 a month, **100 a day** | $0 |
| Domain | `.app` or `.com`, billed yearly | ~$1 to $2 |
| Error monitoring (optional) | A free tier such as Sentry's, or rely on Vercel and Supabase logs | $0 |
| **Base total** | | **about $45 to $50** |

**Email daily limit:** 60 invitations plus 60 first sign ins on the same day would exceed 100 a day. Stagger invites over 2 to 3 days, or use Resend's paid tier (about $20 a month) during launch week.

### Video bandwidth scenarios

Assumptions: average video 30 seconds and about 25 MB as uploaded from a phone; about 60 members.

| Scenario | Videos a month | Plays per video | Share watched | Data out | Extra on Supabase Pro | Cloudflare Stream | Mux |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Light | 40 | 25 | 60% | ~15 GB | $0 | ~$5 | under $1 |
| Expected | 150 | 40 | 70% | ~105 GB | $0 | ~$7 | ~$1 |
| Heavy | 400 | 60 | 80% | ~480 GB | ~$21 | ~$20 | ~$4 |
| Stress | 1,000 | 100 | 100% | ~2,500 GB | ~$202 | ~$65 | ~$9 |

- **Supabase extra** is egress over the included ~250 GB at ~$0.09 per GB. Storage growth is 1 to 25 GB a month, well inside the included 100 GB for months.
- **Cloudflare Stream:** $5 per 1,000 minutes stored (prepaid) and $1 per 1,000 minutes delivered, with no separate bandwidth fee.
- **Mux:** first 100,000 delivered minutes a month free, then about $0.001 a minute; storage about $0.003 per minute per month at 1080p; basic encoding free. Mux's plan minimums and any free plan asset caps must be checked.

### Totals

| Path | Expected month | Heavy month |
| --- | --- | --- |
| Video on Supabase | ~$45 to $50 | ~$70 |
| Video on Mux | ~$46 to $51 | ~$49 to $54 |

In the stress case, Supabase would be about $250 against about $55 on Mux. Mux is both the codec fallback and protection against a bandwidth surprise.

---

## 15. Risks, effort, deferred features

### Risks

| Risk | Mitigation |
| --- | --- |
| A security rule mistake leaks private data | Database tests for every table from three viewpoints: owner, other member, signed out |
| HEVC videos do not play for some members | Codec detection, Phase 2 device gate, Mux fallback |
| Illustrative ad earnings are mistaken for real money | Persistent labels; no balance or payout UI; guidelines; onboarding explanation; research questions check understanding |
| Brand: name in use, "Flip" association, symbol perception | Trademark search; diverse feedback on the mark before launch |
| Client and server CP rules drift | Shared test cases |
| Sign in emails go to spam | Own domain with proper email authentication; test with Gmail and Outlook first |
| Empty feeds at launch | Invite creators first |
| No notifications, so people do not return | Accept for the beta and measure it; a weekly digest is the first candidate afterwards |
| A moderator is unavailable during an emergency | At least two named on call moderators; documented process |
| Supporter visibility feels invasive | Disclosure at onboarding; research question |
| Scope creep | Hold the deferred list |

### Effort

| Work | Sessions |
| --- | --- |
| Phase 1 | 1 to 2 |
| Phase 2 (including video) | 2 to 3, plus 1 if Mux is adopted |
| Phase 3 | 2 |
| Phase 4 | 2 to 3 |
| Phase 5 (ads) | 1 to 2 |
| Phase 6 | 1 |
| **Total** | **about 10 to 16 working sessions** |

Realistic elapsed time is **about 4 to 6 weeks**, driven by founder setup tasks (accounts, domain, email, legal texts, moderator roster), review rounds, and real device testing.

### Deferred

- Payments of any kind, real ad billing, creator payouts.
- Algorithmic ranking or "for you" feeds; ad targeting.
- Realtime feeds; push and email notifications other than sign in and moderator alerts.
- Video watch CP; direct messages; native apps; public profiles and search indexing.
- Muting; keyword filters; automated content scanning; in app appeals; self serve data export.
- Editing posts; multiple media per post; a hybrid points model.
- An admin interface beyond the Supabase dashboard.

---

## 16. Open items that need your input

1. Final approval of this plan.
2. Domain choice after checking availability, and a trademark check for FlipSocial.
3. Logo concept feedback, including the symbol perception point in section 2.
4. Accounts created by you:
   - Supabase beta on Pro;
   - Supabase staging on Free;
   - Vercel project on Pro;
   - email sending account.
5. Moderation roster: at least two named moderators, on call hours, and an appeals contact email.
6. Legal: privacy notice, terms, community guidelines, and the emergency process reviewed by counsel.
7. Whether to adopt Mux from the start or only if the Phase 2 device gate fails.

---

## 17. Sources

- [Supabase pricing (official)](https://supabase.com/pricing)
- [Supabase Pricing in 2026 (MakerKit)](https://makerkit.dev/blog/saas/supabase-pricing)
- [Supabase Pricing 2026: Free vs Pro vs Team (nocode.mba)](https://www.nocode.mba/articles/supabase-pricing)
- [Supabase Pricing: Free Tier Limits, Pro Costs and Egress (Activepieces)](https://www.activepieces.com/blog/supabase-pricing-free-tier-limits-pro-costs-egress)
- [Neon vs Supabase free plan](https://neon.com/guides/neon-vs-supabase-free-plan)
- [Vercel Pricing in 2026 Explained (MassiveGRID)](https://massivegrid.com/blog/vercel-pricing-explained-2026/)
- [Is Vercel free? What the Hobby plan covers in 2026 (DEV Community)](https://dev.to/abhijais1/is-vercel-free-what-the-hobby-plan-covers-in-2026-2ke)
- [Is Vercel Free for Business? Hobby vs Pro](https://thesearchsherpa.com/is-vercel-free-for-small-business/)
- [Cloudflare Stream pricing (official docs)](https://developers.cloudflare.com/stream/pricing)
- [Mux video pricing (official docs)](https://mux.com/docs/pricing/video)
- [Mux pricing](https://mux.com/pricing)
- [Resend sending limits (official docs)](https://resend.com/docs/knowledge-base/resend-sending-limits)
- [Resend free tier explained 2026](https://automationatlas.io/answers/resend-free-tier-explained-2026/)
- [FlipSocial for Flipper Zero](https://www.flipsocial.net/)
- [FlipSocial app listing (Awesome Flipper)](https://awesome-flipper.com/application/lab.flipper.net/gpio/flip_social/)
- [Flip shuts down (Newsweek)](https://www.newsweek.com/california-tiktok-rival-flip-shuts-down-2122060)
- [Flip shutters (Beauty Independent)](https://www.beautyindependent.com/once-valued-over-1b-social-shopping-app-flip-shutters/)

---

## 18. How this plan was produced

This plan was drafted by Claude (an AI assistant) in Claude Code at the founder's direction, from a review of the `main` branch, the founder's written decisions, a headless browser codec experiment, contrast calculations, and web searches for pricing and name usage. The logo is a concept sketch, not a finished identity. Costs, legal points, and brand checks are flagged for human verification. Nothing here has been provisioned or implemented.
