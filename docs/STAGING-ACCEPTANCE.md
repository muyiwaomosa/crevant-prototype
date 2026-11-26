# Staging setup and acceptance

The one current guide for setting up staging and accepting what is built on it,
organised by stakeholder journey. It reflects everything merged to `main`.
Production batch PB-1, which needs its own approval, is at the end.

## 0. Founder action guide (start here)

One prioritized list of what is still yours, in order. Done so far: every
merged migration through 20261215000000 is on staging (run 45736045685, all
checks passed); founder media acceptance passed on Nov 26 (BUG-001 to 003
closed); the deletion register is approved (D7, conditional) and goes to
staging with PR #120.

**Why this order:** on the Free plan the project-wide upload limit cannot
exceed 50 MB, so the 110 MB video limit (and the 5-minute device-test clips)
needs staging on Pro first. The transfer also gives staging its daily
backups, which the recovery exercise on staging needs.

| # | Action (time) | Exactly where and how | Depends on | Expected result | Claude then |
|---|---|---|---|---|---|
| **1** | ~~Deploy post-media to staging~~ **Done Nov 26:** v3 at 74d41d7 (video and deletion register reporting), verified by run 45862869246 (454 checks), recorded in the ledger | | | | Checks deletion reporting on staging after your next test deletion (action 10) |
| **2** | **Transfer prerequisites** (5 min) | Supabase: Crevant, Team: you are Owner. Splitpost Production, Team: same login. Crevant, Billing: nothing overdue. `crevant-staging`, Project Settings, Integrations: disconnect GitHub if connected | Nothing | All four true; tell Claude | Records the baseline (`docs/INFRASTRUCTURE.md`, 2a) |
| **3** | **Transfer `crevant-staging` to Splitpost Production** (5 min, no downtime) | `crevant-staging`, Project Settings, General, Transfer project, Splitpost Production; read the added compute (about $10 a month), confirm | 2 | Same name and reference, now under Splitpost Production | Within the hour: staging checks, sign-in, Edge Functions, cleanup job (T4) |
| **4** | **Storage upload limit 110 MB** (2 min) | `crevant-staging`, Storage, Settings, *Global file size limit*: 110 MB, Save (the `post-videos` bucket already allows 110 MB; on Free it cannot go above 50 MB) | 3 | The limit reads 110 MB | A too-low limit shows as a clear upload error on the test page |
| **5** | **Video device test** (half a day) | `/app/video-test` on the staging app, on an iPhone (Safari) and an Android phone (Chrome): a 1-minute and a 5-minute clip each (`docs/video/DEVICE-TEST.md`). Then Control Center, Video posts: record each result, and set the storage cap (50 GB proposed) | 4. Founder and testers only | A pass or fail per phone, recorded | Reads the results; proposes the 1080p fallback only if the iPhone fails |
| **6** | **Turn on New video uploads (staging only)** | Control Center, Operational switches, with a reason | 5 passes and the cap is set (the server refuses otherwise) | Members can post videos on staging; Production stays off | Runs the video checks on staging |
| **7** | **Next day: confirm backups, then decide on the rehearsal project** | `crevant-staging`, Database, Backups: one daily backup listed. Then, only if you are sure the Nov 22 rehearsal is finished and nothing in it is needed, tell Claude you authorize deleting `splitpost-members-rehearsal-v2` (or delete it: Project Settings, General, Delete project; irreversible) | 3, plus one day | A backup is listed; the total returns to about $45 a month after the deletion | Runs the recovery exercise on staging (completes the deletion safeguard) |
| **8** | **Staging email and Auth**, if not done | Section 2, steps B and C (Resend, Supabase Auth) | Nothing | A password reset arrives from "Splitpost"; sign-up without an invitation link is refused | Runs the staging checks |
| **9** | **Confirm your invitation link and moderator role** | Section 2, step D, only if either is missing | Nothing | Profile shows the link; Moderation is available | Checks registration is open on staging only |
| **10** | **Remaining acceptance** (section 3; media rows already accepted, not repeated) | The staging app | 1 for video and deletion reporting | Each row behaves as written; anything else goes in Feedback | Fixes defects as reported |
| **11** | **Real-device speed check** (Journey 9, row 61) | Your phone, Wi-Fi off | Nothing | Sign-in in about 2 s, Home in about 3 s | Investigates if slower |
| **12** | Independent, any time: PB-1 member Production operations (section 4); legal review of the Rewards Rules, the pilot privacy notice (including the media backup line and the deletion register row) and regulated financial products (`docs/policies/`) | Resend, Supabase, GitHub; counsel | Nothing | Production email and health checks in place; reviewed text | Updates the drafts |

### Infrastructure status (Nov 26)

* **Vercel:** Pro since Nov 25. `splitpost-app` now also builds `main`
  (founder, Nov 26): its Production builds are still refused by the build
  guard until member Production is approved, so each merge shows one refused
  Production build there. Returning the Ignored Build Step to `staging` only
  avoids that noise once staging no longer needs `main`. Every push builds three projects
  (`crevant-prototype`, `splitpost`, `splitpost-app`); `splitpost-app` skips
  everything but the `staging` branch, and `splitpost` skips branch previews
  too, so most pushes build only `crevant-prototype`. Claude batches commits.
  Check the Vercel **Usage** page weekly; video is served from Supabase
  Storage, not Vercel.
* **Supabase:** two organizations. **Splitpost Production (Pro, $25 a month,
  spend cap on)** holds member Production, the waitlist and the disposable
  rehearsal project. **Crevant (Free)** holds `crevant-staging`, which
  therefore has **no backups** and pauses after a week of inactivity until it
  is moved (actions 2, 3 and 7). Every merged migration through 20261215000000 is
  applied on staging.
* **Recovery:** approved pilot objectives, RPO 24 hours and RTO 4 hours (not
  service commitments), in force for staging after its transfer; no separate
  photo and video backup during the controlled pilot, disclosed in the
  composer; the deletion safeguard is approved (D7) and demonstrated locally; it is complete after the staging exercise (action 7). Procedure in
  `docs/RECOVERY.md`, drilled in every CI run.
* **GitHub Actions:** six CI jobs per push (about 10 minutes of runner time).

**Never done from here without separate authorization:** video on member
Production, member Production registration, external pilot access, Production
public previews, real money.

After A4, staging stays usable while development continues: each merged
pull request gets its own small deploy for you to approve, and the `staging`
app branch follows `main`, so you can accept features as they land.

## 1. Where staging stands

| Layer | Status | What you do |
|---|---|---|
| Database | Every merged migration, up to 20261215000000, applied Nov 26 at 03:15 (run 45736045685), all staging checks passed | Nothing |
| Next database deploy | None pending | Approve a run only when one appears |
| Backups | None: staging is on the Free plan | Actions 2, 3 and 7 |
| Staging app (Vercel) | Builds the `staging` branch (at merged main); behind your Vercel login | A1: confirm it loads, the commit and the Preview variables |
| Email | Supabase's default sender: team addresses only, about two an hour | Action 8 |
| Auth (sign up through links, the account hook, Splitpost emails) | Not configured | A3 (ready now) |
| Testers can register; previews; a moderator | Closed / off / none | A4 |

A deployed database is not a working staging app. Staging is fully functional
once A1 to A4 are done.

* **Staging app:** https://splitpost-app-git-staging-crevant.vercel.app (behind
  your Vercel login; built only from the `staging` branch, which Claude
  fast-forwards to reviewed, merged `main` commits and nothing else; it is at
  `main` now).
* **Staging database:** Supabase project `kpudeppgokpjhvaqrprn`.
* **Never touched by anything here:** member Production. Its registration stays
  paused, its launch gate closed, public previews off, and nothing financial is
  real.

### Exact migration state

| Migration | What | Staging |
|---|---|---|
| 20261106000000 to 20261130000000 | Foundations through foundation v2 and the launch gate | Applied |
| 20261201000000 | Relationships and Home | Applied |
| 20261202000000, 20261203000000 | Content, discovery and sharing | Applied |
| 20261204000000 | Fair rotation, search measurement, public previews | Applied Nov 25 (run 45677972966) |
| 20261205000000 | Contributions and rewards (simulated) | Applied Nov 25 (run 45677972966) |
| 20261206000000 | Governance | Applied Nov 25 (run 45677972966) |
| 20261207000000 | Governance refinements | Applied Nov 25 (run 45677972966) |
| 20261208000000 | Advertising | Applied Nov 25 (run 45677972966) |
| 20261209000000 | Image and video ad creatives, frequency caps, restored points outside daily caps | Applied Nov 25 (run 45677972966) |
| 20261210000000 | Intelligence | Applied Nov 25 (run 45677972966) |
| 20261211000000 | Unified onboarding: creator setup, invitations, advertising requests | Applied Nov 25 (run 45696762050) |
| 20261212000000 | Privacy requests, account deletion, switches | Applied Nov 25 (run 45696762050) |
| 20261213000000 | Video posts (uploads, playback and emergency controls, device tests) | Applied Nov 26 (run 45710436593) |
| 20261214000000 | Release hardening (deletion with full history, advertiser thresholds, locks) | Applied Nov 26 (run 45710436593) |
| 20261215000000 | Founder decisions: own-audience referrals recognized, moderator discipline escalated | Applied Nov 26 (run 45736045685) |

---

## 2. Set up staging (about 30 minutes, once)

Do these in order. **C only after Claude confirms the database deploy is applied and checked.**

### A. Vercel: build the staging app (5 minutes)

1. Vercel, project `splitpost-app`, **Settings, Git, Ignored Build Step**: set the command to
   `[ "$VERCEL_GIT_COMMIT_REF" != "staging" ]`
2. **Settings, Environment Variables:** make sure `VITE_SUPABASE_URL` and
   `VITE_SUPABASE_PUBLISHABLE_KEY` hold the **staging** values and apply to
   **Preview** (which includes the `staging` branch). Leave Production variables alone.
3. Tell Claude. Claude pushes `staging` again so Vercel builds it and confirms the address loads.

### B. Resend: staging email (15 minutes)

1. Sign up at resend.com (free tier).
2. **Domains, Add domain:** `mail.splitpost.ca`.
3. Add the DNS records Resend shows, exactly as shown (MX and SPF TXT on
   `send.mail.splitpost.ca`, DKIM TXT on `resend._domainkey.mail.splitpost.ca`).
   If `splitpost.ca` has no DMARC record yet, add TXT `_dmarc.splitpost.ca`:
   `v=DMARC1; p=none; rua=mailto:<an inbox you read>`.
4. **Verify DNS records** and wait until all are Verified.
5. **API Keys, Create API key:** `supabase-staging`, Sending access, domain
   `mail.splitpost.ca`. Paste it only into the Supabase field below.
6. Supabase, staging project, **Authentication, Emails, SMTP Settings**, enable custom SMTP:

   | Field | Value |
   |---|---|
   | Sender email | `noreply@mail.splitpost.ca` |
   | Sender name | `Splitpost` |
   | Host | `smtp.resend.com` |
   | Port | `465` |
   | Username | `resend` |
   | Password | the `supabase-staging` key |

7. **Authentication, Rate Limits:** emails per hour `30`.

**Check:** a password reset from the staging app arrives from "Splitpost", and Resend shows Delivered.

### C. Supabase Auth (10 minutes; after Claude's go-ahead)

Staging project, Supabase dashboard:

1. **Authentication, Sign In / Providers:** **Allow new users to sign up** on; **Confirm email** stays on.
2. **Authentication, Auth Hooks, Add a new hook, Before User Created:** type **Postgres**,
   schema `public`, function `hook_before_user_created`, enabled.
3. **Authentication, Emails, Templates** (paste each file's whole contents from the repository):

   | Template | Subject | File |
   |---|---|---|
   | Confirm signup | `Confirm your email for Splitpost` | `supabase/templates/confirmation.html` |
   | Invite user | `You're invited to Splitpost` | `supabase/templates/invite.html` |
   | Reset password | `Reset your Splitpost password` | `supabase/templates/recovery.html` |

4. **Authentication, URL Configuration:** Site URL
   `https://splitpost-app-git-staging-crevant.vercel.app`; add Redirect URL
   `https://splitpost-app-git-staging-crevant.vercel.app/auth/confirm`.

If anything goes wrong, turn the hook **off** first, then tell Claude.

### D. Activate staging (2 minutes)

Supabase, staging project, **SQL Editor**. Run the first block; register your
own account through the invitation link it creates (section 3, journey 1); then
run the second block with your account's id (Authentication, Users).

```sql
do $$
begin
  if to_regclass('env_identity.marker') is not null then
    raise exception 'This is the member Production database. Stop: these steps are for staging only.';
  end if;
end $$;
select ops.set_external_access('founder', true, 'APPROVE EXTERNAL MEMBER ACCESS');
select ops.set_registration_settings('founder', 'staging acceptance', false);
select ops.create_invitation_link('founder', 'creator', 10, interval '14 days') as invitation_code;
-- Public previews of shared posts: staging only (Production needs its own approval).
select ops.set_public_previews('founder', true, 'staging acceptance');
```

```sql
-- After registering: you as the launch founder and a moderator (staging only).
select ops.set_launch_founder('founder', '<your user id>', 'SET THE LAUNCH FOUNDER');
select ops.grant_member_access('<your user id>', 'founder', 'staging acceptance');
select ops.grant_moderator('<your user id>', 'founder', 'staging acceptance');
```

Your invitation link is `https://splitpost-app-git-staging-crevant.vercel.app/register/<invitation_code>`.
Every change is recorded. To close staging again:
`select ops.set_registration_settings('founder', 'staging closed', true);`

---

## 3. Acceptance tests, by stakeholder journey

### Acceptance results so far (founder, on staging)

| Date | What | Result | Finding |
|---|---|---|---|
| Nov 26 | Sign in to staging | **Accepted** | |
| Nov 26 | Text post; text post with a topic | **Accepted** | |
| Nov 26 | BUG-001 Photo post | Failed, then **Accepted** on the canonical staging URL | Resolved in the tested staging environment |
| Nov 26 | BUG-002 Profile picture upload | Failed, then **Accepted** (upload, and persistence after refreshing) | Resolved in the tested staging environment |
| Nov 26 | BUG-003 An existing photo in the Home feed | Failed, then **Accepted** (retrieval after refreshing) | Resolved in the tested staging environment |
| Nov 26 | Photo post with caption and topic; photo post deletion | **Accepted** | |

**BUG-001 to BUG-003, likely cause (not conclusively verified):** the media
functions accept only the staging address pattern and leave out the browser's
permission header for any other address, which a browser reports as a
connection error, while text posts go to the database API, which accepts any
address. On the canonical staging URL
(`https://splitpost-app-git-staging-crevant.vercel.app`) all three passed.
PR #118's diagnostics stay in place (code MEDIA-UNREACHABLE and a console line
naming the function and the page address) in case it recurs.

Media rows not yet exercised by the founder (no need to repeat the accepted
ones): replacing and removing a profile picture; another member seeing the
photo and a signed-out visitor not; a post whose file is gone showing
"couldn't load" without breaking the feed. Automated checks cover these
locally and in CI.

Use a fresh email address for each new account, on desktop and phone. You need
four accounts: **you** (founder and moderator), a **creator**, a **fan**, and a
**referred** member. Report anything that doesn't match with its number.

### Journey 1. A new member joins

| # | Do | Expect |
|---|---|---|
| 1 | Open `/register` with no code | "You need an invitation link" |
| 2 | Open your invitation link; register with an email and password, ticking 18+ | "Check your email"; it arrives from Splitpost |
| 3 | Click the email link, then Continue, and finish setup | Home with five destinations: Home, Discover, Create, My Split (brand symbol), Profile |
| 4 | Sign in with an existing staging tester | A one-time 18+ confirmation, then the app |
| 5 | In SQL `select ops.set_registration_settings('founder', 'test pause', true);`, then try to register | "Registration is paused right now…"; reopen with `false` |

### Journey 2. A fan finds and follows creators

| # | Do | Expect |
|---|---|---|
| 6 | Discover | Opens on For you: posts in your interests from people you don't follow, each with its reason; "What are you here for today?" narrows it |
| 7 | Search "budget" (or a word from a post) | People, Posts and Topics results |
| 8 | Open the creator's profile; Follow, then Join Clique | Both confirmed; Followers and Clique counts go up; nothing is followed automatically |
| 9 | Support, $5 a month, Record my support intent | "Non-binding. Nothing is charged, now or later."; Withdraw is offered |
| 10 | As the creator, post twice; as the fan, open Home | "New from your Clique" first, then everything newest first, nothing twice |
| 11 | Tap the creator in the Catch up strip | Unseen posts oldest first, ending "All caught up"; nothing expires |
| 12 | Save a post, then Profile, Saved; Repost another | Saved only for you; Home shows the repost once to your followers, "Reposted by" you |
| 13 | Mute the creator (Your Clique, Manage) | Their posts leave Home; still followed. Unmute brings them back |

### Journey 3. A creator publishes and shares

| # | Do | Expect |
|---|---|---|
| 14 | Create a post with a topic; then edit it | The topic shows; "Edited" on the card |
| 15 | Share your post (copy link) before opting in | A note says only members can open it until you allow public previews |
| 16 | Open the link in a private window; then Profile, Sharing outside Splitpost: tick "Allow public previews of my posts"; reopen; untick; reopen | Unavailable, then the preview (text, topic, you, join and sign-in links), then unavailable |
| 17 | Profile, after a fan's thoughtful comment | "Your audience": What happened, What it means, What to do next; 1 Active Supporter |

### Journey 4. Contributions and rewards (all simulated)

| # | Do | Expect |
|---|---|---|
| 18 | As the fan: a thoughtful comment, a save and a repost on the creator's posts; then My Split | Recognized 9, marked as not redeemable; the simulated disclosure |
| 19 | My Split, History; then delete the comment and look again | Each contribution with the creator; then a Reversed entry of -2 |
| 20 | As the fan, My Split, Opportunities: open your referral link privately and register the **referred** account; confirm it and follow someone | The referred account joins as a fan, attributed to you; your My Split shows 100 waiting for review |
| 21 | As you: My Split, "Founder: review referrals and rewards"; Approve | The queue empties; the fan now has 100 redeemable points |
| 22 | On the same page: last month, Content advertising, the creator's username, $100, a note, Record; then Feed advertising, $50 | Reconciliation: revenue $150, creators $40, fan pool $20, Splitpost $90 (always adding up) |
| 23 | As the fan, My Split; as the creator, Profile, Money | The fan's redeemable points valued at $20.00, Simulated; the creator's simulated share $40.00, "Nothing is paid during the pilot" |
| 24 | As you, Close the month (simulated), then again | "It reconciles to the cent"; then "That month is already closed"; the fan sees the points allocated |

Allocation percentages are not shown to members until the Rewards Rules are legally reviewed; the database enforces them.

### Journey 5. Safety and governance

| # | Do | Expect |
|---|---|---|
| 25 | As the fan, open the referred member's profile, Block, read the explanation, confirm | "You blocked …" with Unblock; as the referred member, the fan's profile and posts are gone and nothing says why |
| 26 | As the creator, report one of the fan's comments (the flag beside it) | "Thanks for letting us know" |
| 27 | As you, Profile, Moderation: open the report; Hide; then Give a warning | Hidden; "Warning recorded"; the account panel shows the history |
| 28 | As the fan, open Home, then Notices | A banner about new notices; Notices says what was hidden and why, never who reported |
| 29 | As the fan, Appeal; as you, Moderation, Appeals | You took the original action and are the only moderator: the page says so and asks for a reason (after 20261207000000) |
| 30 | Write a reason and Reverse | The comment is back; the fan's notice says the same moderator reviewed it; their comment points are back (after 20261207000000) |
| 31 | Give the fan a restriction; as the fan, try to post | Home says the account is restricted and until when; posting is refused |
| 32 | On a report, choose Suspension and "Serious violation: act now" without a note, then with one | Asks for the reason, then records an immediate suspension (after 20261207000000) |

### Journey 6. Advertising: from advertiser to creator earnings (after 20261208000000)

| # | Do | Expect |
|---|---|---|
| 33 | As you, Profile, Advertising: onboard an advertiser (what they sell, the problem, the outcome, customer needs, objective, conversion action, a category); Approve | The advertiser shows as approved |
| 34 | Create a campaign (both placements, the same category, Money & business as a content topic); Activate | Faith and Health aren't offered as topics; the campaign is active |
| 35 | As the fan, Profile, Ads and your preferences: set the category to Interested; open one of the creator's Money posts | A Sponsored ad under the post; Why this ad: "You chose …" |
| 36 | As the referred member (no preferences), open the same post; then a Faith post | Why this ad: "Shown with Money & business posts. Not based on anything about you."; no ad on the Faith post |
| 37 | Click the ad's button; then Not relevant on another; then Hide this ad | The site opens in a new tab; "Thanks…"; the hidden ad goes and is listed under Ads you hid, with Show again |
| 38 | As you, Advertising, Report | Aggregate counts only; audience and reach under 10 show "fewer than 10"; no names |
| 39 | Record verified conversions; at the start of next month, Attribute simulated revenue for this month | Content share to creators, feed share to Splitpost; the creator's simulated share rises; a second attribution is refused |
| 40 | (after 20261209000000) In Supabase Storage, upload a JPEG or PNG to the `ad-creatives` bucket; in the campaign form choose Image, pick the file and write a text alternative; Activate. Then try activating a campaign whose file you haven't uploaded | The ad under the post shows the image with its text alternative and "Sponsored · shown with {creator}'s post"; the second campaign is refused because the file is missing |
| 41 | (after 20261209000000) Repeat with a short MP4 and Video | It plays only when tapped, muted, with controls; the report shows video plays and completions |
| 42 | (after 20261209000000) As the fan, Why this ad, "Don't show ads from …" | No more ads from that advertiser; listed under Ads you hid |
| 43 | (after 20261210000000) As you, record verified conversions, then a self-reported figure; Export report | Two separate rows, self-reported clearly marked; the CSV has no member names |

### Journey 7. Intelligence: what happened, what it means, what to do next (after 20261210000000)

| # | Do | Expect |
|---|---|---|
| 44 | As the fan, open one of the creator's posts, save it; then My Split | "Your week" says you connected with 1 creator, in three steps; points marked as not redeemable; simulated values labelled Simulated |
| 45 | As the creator, Profile: swipe or tap through Profile, Attention, Retention, Money | Four faces, each with the three steps; the tabs work with a keyboard and a screen reader |
| 46 | Attention | New followers against the previous period, where they came from (for example Search), people reached, top posts |
| 47 | Retention | Active supporters, Clique, returning fans, and this week's connections against last week's (1 this week) |
| 48 | Money | Simulated earnings marked Simulated with a You / Fans / Splitpost bar and no percentages; Ads shown with your posts, Actual; Actual income $0.00; Support Intent, Non-binding |
| 49 | As you, Profile, Control Center | The North Star (Weekly Active Creator-Consumer Connections) for 8 weeks, with test data and founder-dependent connections apart; every line labelled Actual, Simulated, Test data or Hypothesis; no member named |
| 50 | Export CSV and JSON | Each row carries its kind; the figures match the page |

### Journey 8. One account: onboarding, creating, advertising and privacy (after 20261211000000 and 20261212000000)

| # | Do | Expect |
|---|---|---|
| 51 | As you, Control Center, Invitation links: create a link for the creator's username; copy it; register a new account through it | Setup asks what brings you here (optional; Continue works without an answer), then shows "You're here because of" the creator, with Follow and Not now. Nobody is followed until you choose |
| 52 | Finish setup | The last step explains My Split in three points: points are recognized, some become redeemable after review, everything is simulated and nothing is paid. No percentages. Choosing "Share my own work" offers "Set up my creator profile" |
| 53 | As the creator, Profile | "Share your own work": choose up to 3 posting topics (a fourth is not allowed), a link to write a first post, and "Copy my invitation link" with how many joined through it |
| 54 | As a member whose interests match, open Discover, Creators | The creator appears with their posting topics; a member who has never posted or chosen topics does not |
| 55 | As any member, Profile, Advertise with Splitpost: send a request | "Waiting for review"; a second request is refused while one is open |
| 56 | As you, Advertising | The advertiser shows "Requested by @member from their account"; approve it and create a campaign as before; the member then sees the campaign and a report with groups under 10 withheld |
| 57 | As a member, Profile, Your data and privacy: ask for a copy; then ask to delete the account (the checkbox is required) | Both listed as Open; Withdraw works |
| 58 | As you, Control Center, Privacy requests: mark the copy done with a note; on the deletion, type a wrong username, then the right one | The wrong one is refused; the right one deletes the account, its posts and follows. My Split totals for everyone else are unchanged |
| 59 | Control Center, Operational switches: turn advertising off with a reason; open Home as a member; turn it back on | No ads while off; the change and reason are listed; Video posts cannot be turned on yet |
| 60 | Control Center, Registration: pause, then reopen, with a reason | Registration through links is refused while paused |

### Journey 9. Release readiness: speed, recovery and integrity

| # | Do this | Expect |
|---|---|---|
| 61 | On your phone with Wi-Fi off, in a private tab: open sign-in, sign in, scroll Home, open a post, like it (`docs/PERFORMANCE.md`, Real-device check) | Sign-in appears in about 2 seconds, Home with posts in about 3; nothing stutters or jumps |
| 62 | Supabase, SQL editor (staging): paste `scripts/db/audit/reconciliation.sql` and run it | 12 rows, every `ok` is true (read-only; changes nothing) |
| 63 | Supabase, staging, Database, Backups (after the transfer, B2) | At least one daily backup is listed (`docs/RECOVERY.md`) |
| 64 | As a creator, add a photo to a new post | Above the caption: "Keep your original. During the pilot, Splitpost does not keep a separate backup of photos and videos." |

---

## 4. PB-1, member Production operations (needs your approval)

Nothing here changes a schema or opens access. Approve as a batch, then do in order.

| # | Action | Where | Verify |
|---|---|---|---|
| B1 | Resend key `supabase-members-production`; custom SMTP on member Production with the step B settings | Resend; Supabase Auth | A password reset to your own account on app.splitpost.ca arrives from Splitpost |
| B2 | Drain key: `openssl rand -hex 32` on your computer; save the **same** value as Edge Function secret `MEDIA_DRAIN_KEY` and Vault `media_drain_key` on member Production (`docs/PHOTOS.md`). Never into chat, GitHub, Vercel or a file | Supabase dashboard | B3 passes |
| B3 | Rerun the member Production photo cleanup schedule workflow, mode apply | GitHub Actions | Schedule checks pass |
| B4 | Repository variables `WAITLIST_HEALTH_ENABLED=true` and `PRODUCTION_WAITLIST_HEALTH_ENABLED=true` | GitHub settings | Next health runs pass |
| B5 | Free uptime checks for www.splitpost.ca and app.splitpost.ca | Uptime service | Both Up |
| B6 | Merge PR #105 and add the member Production post-media ledger entry | GitHub | Ledger check passes on `main` |
