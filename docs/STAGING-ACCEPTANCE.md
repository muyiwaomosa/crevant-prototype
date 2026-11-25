# Staging acceptance: IP-1 and IP-2

One guide for everything the founder does to test IP-1 (Foundation) and IP-2
(Relationships and Home) on staging, plus the Production batch PB-1, which
needs its own approval.

* **Staging app:** https://splitpost-app-git-staging-crevant.vercel.app
  (behind your Vercel login; built only from the `staging` branch, which Claude
  fast-forwards to reviewed, merged `main` commits and nothing else).
* **Staging database:** project `kpudeppgokpjhvaqrprn`.
* **Never touched by anything here:** member Production. Its registration stays
  paused, its launch gate closed, and the registration page on app.splitpost.ca
  stays closed until the reviewed policies are published.

---

## Part A. Set up staging (about 30 minutes, once)

Do these in order. **A3 only after Claude confirms the database deploy is applied and checked.**

### A1. Staging app address (5 minutes)

1. Vercel, `splitpost-app`, **Settings, Git, Ignored Build Step**: set the command to
   `[ "$VERCEL_GIT_COMMIT_REF" != "staging" ]`
2. **Settings, Environment Variables:** make sure `VITE_SUPABASE_URL` and
   `VITE_SUPABASE_PUBLISHABLE_KEY` (the staging values) apply to **Preview**,
   including the `staging` branch. Leave Production variables alone.
3. Tell Claude when it's saved. Claude pushes `staging` again so Vercel builds it,
   and confirms the address loads.

### A2. Resend for staging email (15 minutes)

Without this, Supabase's default sender only reaches team addresses, about two emails an hour.

1. Sign up at resend.com (free tier).
2. **Domains, Add domain:** `mail.splitpost.ca`.
3. Add the DNS records Resend shows, exactly as shown (MX and SPF TXT on
   `send.mail.splitpost.ca`, DKIM TXT on `resend._domainkey.mail.splitpost.ca`).
   If `splitpost.ca` has no DMARC record yet, add TXT `_dmarc.splitpost.ca`:
   `v=DMARC1; p=none; rua=mailto:<an inbox you read>`.
4. **Verify DNS records**; wait until all are Verified.
5. **API Keys, Create API key:** `supabase-staging`, Sending access, domain
   `mail.splitpost.ca`. Paste it only into the Supabase field below.
6. Supabase, staging project, **Authentication, Emails, SMTP Settings**, Enable custom SMTP:

   | Field | Value |
   |---|---|
   | Sender email | `noreply@mail.splitpost.ca` |
   | Sender name | `Splitpost` |
   | Host | `smtp.resend.com` |
   | Port | `465` |
   | Username | `resend` |
   | Password | the `supabase-staging` key |

7. **Authentication, Rate Limits:** emails per hour `30`.

**Check:** a password reset from the staging app arrives from "Splitpost"; Resend shows Delivered.

### A3. Staging Auth settings (10 minutes; after Claude's go-ahead)

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

### A4. Open staging for testers (2 minutes)

Applying the launch gate to staging left staging's external access **closed**
(existing testers keep their access). Registration also starts paused. Open both
**on staging only**, and make yourself an invitation link: Supabase, staging
project, **SQL Editor**, run:

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
```

Your invitation link is `https://splitpost-app-git-staging-crevant.vercel.app/register/<invitation_code>`.
Every change is recorded (`ops.member_launch_events`, `ops.registration_setting_events`).
To close staging again: `select ops.set_registration_settings('founder', 'staging closed', true);`

---

## Part B. Acceptance tests

Use a fresh email address for each new account. Desktop and phone both.

### IP-1 Foundation

| # | Do | Expect |
|---|---|---|
| 1 | Open the staging app's `/register` with no code | "You need an invitation link" |
| 2 | Open your invitation link; register with an email and password, ticking 18+ | "Check your email"; the email arrives from Splitpost |
| 3 | Click the email link, then Continue | You're signed in; name setup appears |
| 4 | Finish setup | Home with five destinations: Home, Discover, Create, My Split (brand symbol), Profile |
| 5 | Swipe or use the tabs on Home | Three faces: Clique first, My Clique, Following |
| 6 | My Split, then Opportunities | Your personal referral link; the simulated rewards disclosure |
| 7 | Open the referral link in a private window and register a second account | It joins as a fan, attributed to you; it follows nobody automatically |
| 8 | Sign in with an existing staging tester | A one-time 18+ confirmation, then the app |
| 9 | In SQL: `select ops.set_registration_settings('founder', 'test pause', true);` then try to register | "Registration is paused right now…"; reopen with `false` |

### IP-2 Relationships and Home

Use your two new accounts: one posts as a creator, one follows.

| # | Do | Expect |
|---|---|---|
| 10 | As the follower, open the creator's profile | Followers, Clique, Active Supporters; buttons Follow, then Join Clique and Support |
| 11 | Follow, then Join Clique | Both confirmed; Clique count goes up |
| 12 | Support, choose $5 a month, Record my support intent | "Non-binding. Nothing is charged, now or later." and a confirmation; Withdraw is offered |
| 13 | As the creator, post twice; as the follower, open Home | "New from your Clique" shows the new posts first, then everything else newest first; nothing twice |
| 14 | Tap the creator's avatar in the Catch up strip | Unseen posts oldest first, ending "All caught up"; nothing expires |
| 15 | As the follower, comment something thoughtful (20+ characters) on a post | The creator's profile shows 1 Active Supporter |
| 16 | Profile, Your Clique (via My Clique, Manage Clique): Mute the creator | "Muted on Home"; their posts leave Home; still followed. Unmute brings them back |
| 17 | As the creator, open Profile | "Your audience": What happened, What it means, What to do next; Support Intent marked Non-binding |

Report anything that doesn't match to Claude with the row number. Defects are
fixed without reopening approved decisions.

---

## Part C. PB-1, member Production operations (needs your approval)

Nothing here changes a schema or opens access. Approve as a batch, then do in order.

| # | Action | Where | Verify |
|---|---|---|---|
| B1 | Resend key `supabase-members-production`; custom SMTP on member Production with the A2 settings | Resend; Supabase Auth | A password reset to your own account on app.splitpost.ca arrives from Splitpost |
| B2 | Drain key: `openssl rand -hex 32` on your computer; save the **same** value as Edge Function secret `MEDIA_DRAIN_KEY` and Vault `media_drain_key` on member Production (`docs/PHOTOS.md`). Never into chat, GitHub, Vercel or a file | Supabase dashboard | B3 passes |
| B3 | Rerun the member Production photo cleanup schedule workflow, mode apply | GitHub Actions | Schedule checks pass |
| B4 | Repository variables `WAITLIST_HEALTH_ENABLED=true` and `PRODUCTION_WAITLIST_HEALTH_ENABLED=true` | GitHub settings | Next health runs pass |
| B5 | Free uptime checks for www.splitpost.ca and app.splitpost.ca | Uptime service | Both Up |
| B6 | Merge PR #105 and add the member Production post-media ledger entry | GitHub | Ledger check passes on `main` |
