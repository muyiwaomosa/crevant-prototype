# Staging setup and acceptance

The one current guide for setting up staging and accepting what is built on it,
organised by stakeholder journey. It reflects everything merged to `main`.
Production batch PB-1, which needs its own approval, is at the end.

## 1. Where staging stands

| Layer | Status | What you do |
|---|---|---|
| **Database deploy waiting for you** | [Run 45652930512](https://github.com/muyiwaomosa/crevant-prototype/actions/runs/45652930512) applies 20261204000000 (previews and search), 20261205000000 (rewards) and 20261206000000 (governance), then runs every staging security and separation check | **Review deployments, staging, Approve** |
| Database already applied | Every migration up to 20261203000000 (IP-1, IP-2, IP-4a and IP-4b), checked Nov 25 at 14:00 and 14:59 | Nothing |
| Next database deploy | 20261207000000 (governance refinements), after its pull request merges | Approve that run when it appears |
| Staging app (Vercel) | Not building yet: `splitpost-app` builds only an older branch | Step A |
| Email | Supabase's default sender: team addresses only, about two an hour | Step B |
| Auth (sign up through links, the account hook, Splitpost emails) | Not configured | Step C, after the deploy above |
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
| 20261204000000 | Fair rotation, search measurement, public previews | In run 45652930512 |
| 20261205000000 | Contributions and rewards (simulated) | In run 45652930512 |
| 20261206000000 | Governance | In run 45652930512 |
| 20261207000000 | Governance refinements | After its merge |

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
| 23 | As the fan, My Split; as the creator, Profile | The fan's redeemable points valued at $20.00, Simulated; the creator's simulated share $40.00, "Nothing is paid during the pilot" |
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
