# Staging setup and acceptance

The one current guide for setting up staging and accepting what is built on it,
organised by stakeholder journey. It reflects everything merged to `main`.
Production batch PB-1, which needs its own approval, is at the end.

## 0. Founder action guide (start here)

Everything that needs you, in one place. **Sequential** steps depend on the one
before; **independent** ones can be done any time, in any order.

| # | Action | Where | Depends on | Expected result | How Claude verifies |
|---|---|---|---|---|---|
| ✓ | Database deploy run 45677972966 (20261204000000 to 20261210000000) | | | **Done Nov 25, 20:34 UTC**: applied, every staging security and separation check passed | Read the run log |
| 1 | **Approve the database deploy** [run 45696762050](https://github.com/muyiwaomosa/crevant-prototype/actions/runs/45696762050): 20261211000000 (unified onboarding) and 20261212000000 (privacy requests and switches), then every staging check | GitHub, the run, **Review deployments, staging, Approve** | Nothing | The run is green | Reads the run log and reports |
| 2 | **Step A: Vercel builds the staging app** (5 minutes) | Vercel, section 2 | Nothing | `splitpost-app-git-staging-crevant.vercel.app` loads the sign-in page | Pushes `staging`, loads the address |
| 3 | **Step B: Resend sends staging email** (15 minutes plus DNS time) | Resend and Supabase, section 2 | Nothing (start now: DNS can take hours) | A password reset arrives from "Splitpost" | Asks you to confirm the email arrived |
| 4 | **Step C: Supabase Auth** (10 minutes) | Supabase dashboard, section 2 | **Can be done now** (the account hook exists on staging since run 45677972966) | Signing up through a link works; a sign up without a link is refused | Runs the staging checks again |
| 5 | **Step D: activate staging** (2 minutes) | Supabase SQL editor, section 2 | **After 2, 3 and 4** | You have a founder account, an invitation link and the moderator role | Checks registration is open on staging only |
| 6 | **Authorize the merge of the video and hardening pull request, PR #114** (20261213000000 and 20261214000000 checksums, D7) once its six checks are green | GitHub | Nothing | Merged; one more staging deploy appears for you to approve (step 7) | Starts the deploy and fast-forwards `staging` |
| 7 | **Approve the video database deploy** | GitHub, the run | After 6 | The run is green | Reads the run log |
| 8 | **Set the staging Storage upload limit to at least 110 MB** (2 minutes) | Supabase dashboard, staging project, **Storage, Settings, Upload file size limit** | Independent (do any time before the device test) | The limit reads 110 MB or more | Confirms with you before the device test; a too-low limit shows as a clear upload error on the test page |
| 9 | Hands-on acceptance, section 3 | The staging app | After 5 | Each row behaves as written; note anything that doesn't in Feedback | Fixes what you report and redeploys |
| 10 | **The video device test**, `docs/video/DEVICE-TEST.md`: record and upload a 1 and a 5 minute clip on an iPhone and an Android phone, play them, copy the results; then record each result and the storage cap (50 GB proposed) in Control Center, Video posts | Your iPhone, an Android phone and a computer, on `/app/video-test` | **After 5, 7 and 8** | A pass or fail per device | Reads the results; if the iPhone 5 minute conversion fails, proposes the 1080p fallback before anything is turned on |
| 11 | Turn on **New video uploads** on staging | Control Center, Operational switches | After 10 passes | Members can post videos on staging (Production stays off) | Runs the video checks on staging |
| 12 | PB-1 member Production operations, section 4 | Resend, Supabase, GitHub | Independent | Production email, drain key and health checks in place | Reruns the schedule and health checks |

**Never done from here without separate authorization:** video on member
Production, member Production registration, external pilot access, Production
public previews, real money.

After step 5, staging stays usable while development continues: each merged
pull request gets its own small deploy for you to approve, and the `staging`
app branch follows `main`, so you can accept features as they land.

## 1. Where staging stands

| Layer | Status | What you do |
|---|---|---|
| **Database deploy waiting for you** | [run 45696762050](https://github.com/muyiwaomosa/crevant-prototype/actions/runs/45696762050) applies 20261211000000 and 20261212000000 | **Review deployments, staging, Approve** |
| Database already applied | Every migration up to 20261210000000, last applied Nov 25 at 20:34 (run 45677972966), all staging checks passed | Nothing |
| Next database deploy | 20261213000000 (video posts), after its pull request merges | Approve the one run when it appears |
| Staging app (Vercel) | Not building yet: `splitpost-app` builds only an older branch | Step A |
| Email | Supabase's default sender: team addresses only, about two an hour | Step B |
| Auth (sign up through links, the account hook, Splitpost emails) | Not configured | Step C (ready now) |
| Testers can register; previews; a moderator | Closed / off / none | Step D |

A deployed database is not a working staging app. Staging is fully functional
once the deploy above is approved and steps A to D are done.

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
| 20261211000000 | Unified onboarding: creator setup, invitations, advertising requests | In run 45696762050 |
| 20261212000000 | Privacy requests, account deletion, switches | In run 45696762050 |
| 20261213000000 | Video posts (uploads, playback and emergency controls, device tests) | After its merge |

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
