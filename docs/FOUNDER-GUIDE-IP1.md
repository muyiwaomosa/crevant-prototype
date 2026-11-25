# Founder guide: staging acceptance for IP-1, and PB-1

One place for every manual step. Part A gets staging ready for your
acceptance test of IP-1. Part B is the Production batch PB-1, which needs its
own approval. Nothing here opens member Production registration or external
pilot access.

Staging project: `kpudeppgokpjhvaqrprn`. Member app project on Vercel:
`splitpost-app`.

---

## Part A. Staging (authorized; about 30 minutes)

Do these in order. **A2 only after Claude confirms the migration is applied
and checked on staging.**

### A1. Resend for staging email (15 minutes)

Without this, Supabase's default sender reaches only team member addresses,
about two emails an hour, which is enough for one tester and nothing more.

1. Sign up at resend.com (free tier: 3,000 emails a month, 100 a day).
2. **Domains, Add domain:** `mail.splitpost.ca`, region closest to Canada
   (us-east-1).
3. Add the DNS records Resend shows at your DNS provider, exactly as shown:
   * MX record on `send.mail.splitpost.ca` (feedback and bounces);
   * TXT record on `send.mail.splitpost.ca` (SPF, `v=spf1 include:amazonses.com ~all`);
   * TXT record on `resend._domainkey.mail.splitpost.ca` (DKIM);
   * recommended: TXT record on `_dmarc.splitpost.ca`,
     `v=DMARC1; p=none; rua=mailto:<an inbox you read>` if you have no DMARC
     record yet. If one exists, leave it.
4. Click **Verify DNS records**. Wait until all show Verified (minutes to an
   hour).
5. **API Keys, Create API key:** name `supabase-staging`, permission
   **Sending access**, domain `mail.splitpost.ca`. Copy it once; don't paste
   it anywhere except the Supabase field below. Create a separate key
   `supabase-members-production` later in PB-1.
6. Supabase dashboard, staging project, **Authentication, Emails, SMTP
   Settings**, turn on **Enable custom SMTP**:

   | Field | Value |
   |---|---|
   | Sender email | `noreply@mail.splitpost.ca` |
   | Sender name | `Splitpost` |
   | Host | `smtp.resend.com` |
   | Port | `465` |
   | Username | `resend` |
   | Password | the `supabase-staging` API key |
   | Minimum interval between emails | `60` seconds (default) |

7. **Authentication, Rate Limits:** set "Rate limit for sending emails" to
   `30` an hour (Supabase's default once custom SMTP is on).

**Verify:** send yourself a password reset from the staging app's sign in
page. It should arrive from "Splitpost", subject "Reset your Splitpost
password", and Resend's **Emails** page should show it as Delivered.

### A2. Staging Auth settings (10 minutes; after Claude's go-ahead)

Staging project, Supabase dashboard:

1. **Authentication, Sign In / Providers, User Signups:** turn **Allow new
   users to sign up** on. Under **Email**, keep **Confirm email** on.
2. **Authentication, Auth Hooks, Add a new hook, Before User Created:**
   * Hook type: **Postgres**
   * Schema: `public`
   * Function: `hook_before_user_created`
   * Enable, then Create.
3. **Authentication, Emails, Templates:**

   | Template | Subject | Body (copy the file's whole contents) |
   |---|---|---|
   | Confirm signup | `Confirm your email for Splitpost` | `supabase/templates/confirmation.html` |
   | Invite user | `You're invited to Splitpost` | `supabase/templates/invite.html` |
   | Reset password | `Reset your Splitpost password` | `supabase/templates/recovery.html` |

4. **Authentication, URL Configuration:** Site URL must be the staging member
   app address (A3). Redirect URLs must include `<that address>/auth/confirm`.

**Verify** (Claude runs these too and reports back):

* Opening `/register` without a link says you need an invitation link.
* A sign up attempt without a valid link is refused with a plain message.
* Your invitation link (from Claude) lets you register, the email arrives,
  confirming it signs you in, and Home shows its three views.
* Existing staging accounts see the one-time 18+ confirmation.

If anything goes wrong: turn the hook **off** first (Auth Hooks, toggle), then
tell Claude. Sign ups and invites work as before once it is off.

### A3. A stable staging address for the member app (5 minutes)

`splitpost-app` builds Previews only for the branch named in its Ignored
Build Step, so this pull request's Preview was skipped. Recommended:

1. Vercel, `splitpost-app`, **Settings, Git, Ignored Build Step**, set the
   command to `[ "$VERCEL_GIT_COMMIT_REF" != "staging" ]`.
2. **Settings, Environment Variables:** make sure `VITE_SUPABASE_URL` and
   `VITE_SUPABASE_PUBLISHABLE_KEY` (the staging values) apply to Preview for
   the `staging` branch.
3. Tell Claude it may push `main` to a branch named `staging` (fast forward
   only, never anything that isn't on `main`). Your staging address is then
   `https://splitpost-app-git-staging-crevant.vercel.app`, behind your Vercel
   login, and it only changes when reviewed work reaches `main`.

### A4. Open staging registration (Claude does this)

`select ops.set_registration_settings('founder', 'staging acceptance', false);`
and an invitation link for you. Registration on member Production stays
paused.

---

## Part B. PB-1, member Production operations (needs your approval)

Nothing here changes a database schema or opens access. Each step lists how
it is verified. Approve the batch as a whole, then do the steps in order.

| # | Action | Where | Verify |
|---|---|---|---|
| B1 | Resend API key `supabase-members-production` (Sending access, `mail.splitpost.ca`); custom SMTP on the **member Production** project with the same settings as A1 | Resend; Supabase Auth, SMTP Settings | A password reset to your own account on app.splitpost.ca arrives from Splitpost; Resend shows Delivered |
| B2 | Drain key on member Production: generate one value on your computer (`openssl rand -hex 32`) and save the **same** value twice, as Edge Function secret `MEDIA_DRAIN_KEY` and in Project Settings, Vault as `media_drain_key` (`docs/PHOTOS.md`, step 3). Never into chat, GitHub, Vercel or a file | Supabase dashboard | B3 passes (a mismatch shows as "the drain answered HTTP 401") |
| B3 | Rerun the member Production photo cleanup schedule workflow, mode apply | GitHub Actions | The run passes its schedule checks; photos stay off until it does |
| B4 | Set repository variables `WAITLIST_HEALTH_ENABLED=true` and `PRODUCTION_WAITLIST_HEALTH_ENABLED=true` | GitHub, Settings, Secrets and variables, Actions, Variables | The next scheduled health runs pass |
| B5 | Free uptime checks on `https://www.splitpost.ca` and `https://app.splitpost.ca` (for example UptimeRobot, 5 minute interval, alerts to your email) | Uptime service | Both show Up |
| B6 | Merge PR #105 (staging post-media ledger), then add the member Production post-media ledger entry from your local deploy log | GitHub | The ledger check in CI passes on `main` |

Kept closed throughout: member Production registration (paused), the launch
gate (`external_access_approved = false`) and the registration page on
app.splitpost.ca (until the reviewed policies are published).

The member Production migration and Auth hook come later, in PB-2 (December
16), with the same order as staging: migration first, hook second.
