# Phase 1A: public landing page and authentication foundation

Part of the Crevant 60-day pilot. Phase 1A builds the public entry point and invitation-controlled sign in. It does not start the pilot clock: the 60 days begin when invited participants can actually use the core product.

This file records the plan as approved by the founder, the decisions still open, and the deployment safeguards. Update it in a reviewed pull request when a decision changes.

## Scope and sequence

Each step is its own pull request and stops for the founder's review. Nothing is merged, deployed, applied to a database, or changed in Supabase or Vercel settings without explicit approval.

| Step | What it delivers | Status |
| --- | --- | --- |
| PR 1 | Public landing page, prototype moved to `/tour`, production safeguards, this document. No Supabase, no forms. | This PR |
| Validation | Invitation, email confirmation and password setting with public sign up disabled: first locally (done, below), then on staging with the founder's own email after the settings below are approved | Local done |
| PR 2 | Database foundation: private `ops` schema (admins, invitations) and `public.profiles` with RLS, profile creation on email confirmation, and tests (see "Database foundation" below). Invitation requests and rate limits wait for the privacy notice. Run in CI only, not applied. | In review |
| PR 3 | Sign in, sign out, password reset, protected `/app`, `/auth/confirm` (see "Sign-in and accounts" below) | In review |
| PR 4 | Edge Functions `request-invite` and `send-invitation`, admin invite page, staging-only function deploy workflow. The request form exists but stays switched off. | Planned |
| Privacy | Draft privacy notice for the founder (and a lawyer) to review. Its approval is required before the request form can be switched on. | Planned |
| PR 5 | Minimal onboarding: display name and unique username, then the `/app` welcome | Planned |

Phase 1B adds creator invite links for audiences, full profiles (photo, bio, interests) and the remaining onboarding steps. Phase 1C adds real posts, following, comments, Connection Points and rewards. Phase 1D covers monetization and pilot measurement.

## Deployment mapping and safeguards

| Git branch | Vercel | Supabase |
| --- | --- | --- |
| `demo` (frozen at `421a0a1`) | **Production**: crevant-prototype.vercel.app | None (sample data in the browser) |
| `main` | Preview only | Staging, through Preview-only variables (from PR 3) |
| Feature branches | Preview | Staging (from PR 3) |

Safeguards, in order of importance:

1. **Primary: Vercel's production branch is `demo`** (Settings, Environments, Production, Branch Tracking). This is what keeps `main` off the production site. Claude does not change Vercel production settings or promote deployments.
2. **Build guard (defence in depth).** `scripts/guard-build-target.mjs` runs first in `npm run build` and fails the build when `VERCEL_ENV` is `production`. If the production branch were ever switched to `main`, the build would fail instead of replacing the demo.
3. **Runtime fallback (defence in depth).** "Promote to Production" reuses an existing preview build without rebuilding, so the build guard cannot stop it. If a `main` build is ever served on the production address, `src/entry.ts` shows only the sample prototype at the root, like the demo, and never the public site or sign in. **Never use "Promote to Production" on a `main` preview.**
4. **Live check after every merge.** `npm run check:production` fetches the production page and compares its files with the demo fingerprint (`/assets/index-DGNpDakc.js`, `/assets/index-B7VqJe87.css`).

Independent verification of the Vercel setting, by the founder: the Branch Tracking screen shows `demo`, and the repository's Deployments page on GitHub shows the Production environment only against `demo` commits.

`vercel.json` on `main` adds security headers (`nosniff`, strict referrer policy, no framing, a restrictive permissions policy) and `X-Robots-Tag: noindex` until the pilot opens. The `demo` branch keeps its own `vercel.json`, so production headers do not change. A full content security policy arrives with sign in (PR 3).

## Personal information

The invitation request form stays closed, and no page collects personal information from the public, until all of these are true:

1. The privacy notice is published and approved by the founder.
2. The server side request function has its captcha, rate limit and retention rule in place.
3. The founder approves switching the request form on.

The landing page, `/request-invite` and the not-found page have no forms, inputs, storage, cookies or calls to outside services, and tests enforce it.

From PR 3, invited members sign in with their email address and password, and Supabase keeps their session in their own browser. **Until the privacy notice is approved, nobody is invited except the founder's own test account.**

## Positioning

**"You don't need a million followers. You need the right 1,000."** (approved by the founder, Option A.)

Traditional social media pushes creators to chase virality, millions of followers and huge view counts. Crevant's hypothesis is that a smaller, highly committed community can create more meaningful value for a creator than a large, passive audience. **This is a vision we are testing in the pilot, not a proven earnings claim.**

Messaging hierarchy on the landing page, in order:

1. The idea: the right 1,000, with its hypothesis label right beside it.
2. The problem: audience size versus relationship depth ("Chasing size" compared with "Building depth"). This contrast runs through the whole page.
3. How Crevant helps: five building blocks, each with its real status. Find them (Following feed, newest first: in the pilot). Recognise them (Connection Points: in the pilot). Reward them (creator rewards: in the pilot). Let them back you (voluntary support: in development). Add to it (creator-content advertising: in development, a supplement rather than the centre of the model).
4. What success looks like here: the people who show up, not just the people who follow. Follower counts stay.
5. How it works, for creators and for supporters, Connection Points, the pilot, the FAQ, and the call to action.

## Landing page rules

* The "right 1,000" line always appears with its hypothesis label ("This is the idea we're testing in our pilot, not a promise of earnings"), or in the FAQ that explains 1,000 is not a magic number.
* Never pair an audience number with a money figure, and never promise a living, a replacement income or quitting a job.
* Describe the Following feed by its order only: newest first, not ranked by engagement. Never imply that followers will see every post or that reach is guaranteed.
* Never imply guaranteed earnings or that any money feature is live.
* Label every feature with its real status: in the pilot, in development, or where we're headed.
* No invented user counts, testimonials or traction.
* Follower counts are not hidden, and PR 1 introduces no new engagement mechanics.

`src/public/public-site.test.tsx` enforces the required disclosures, the hypothesis label, the section order and a list of banned patterns, including money figures near audience numbers.

## Supporter definitions (hypotheses to validate)

These are working definitions for the pilot, **not final metrics**. They will be reviewed with real pilot data and with the creators themselves, and may change before or during the pilot. All counts are per creator, exclude the creator's own account, and exclude internal accounts.

| Term | Proposed definition | Why |
| --- | --- | --- |
| **Follower** | An account that follows the creator. One click, no ongoing activity needed. | Context. Recorded and shown as today, but not treated as the measure of success. |
| **Active Supporter** | A person who takes a qualifying action with the creator on at least **4 separate days in a rolling 30-day window**. Qualifying actions: a comment that passes the existing quality check, a share, a reward redemption, or an offer of support (Support Intent, or real support if tested). Likes and views alone do not qualify. | Separates people who keep showing up from people who once clicked follow. |
| **Committed Supporter** | An Active Supporter in **two consecutive 30-day windows** who has also taken at least one commitment action with the creator: redeemed a reward, or offered support (hypothetical or real). | The "right 1,000" in miniature: sustained participation plus a sign of real value. |

How they will be validated:

1. **Against creators' own judgement.** Before seeing the numbers, each creator names the supporters they consider most committed. We compare that list with who the definitions pick out.
2. **Sensitivity.** Report results at 3, 4 and 6 active days, so the threshold is chosen on evidence rather than assumed.
3. **Stability.** Check that people do not flip in and out of each group week to week for trivial reasons.
4. **Gaming.** Check that Connection Point anti-farming rules also keep these counts honest.

Pilot reporting shows followers, Active Supporters and Committed Supporters side by side, plus the ratio of Active Supporters to followers and supporter retention week to week. Product ideas that put active supporters ahead of follower counts (profile display, a private "your core" view for creators, depth-based milestones) are for review in Phases 1B and 1C, not this PR.

## Pilot economics: the key validation question

**What economic value does an Active Supporter (and a Committed Supporter) represent for a creator?**

* **Value per Active Supporter** = support offered or given to a creator during a period ÷ that creator's Active Supporters in the same period. Also reported per Committed Supporter.
* **Hypothetical and real are never combined.** Support Intent (stated, nonbinding amounts) and actual payments (only if real support is approved and tested) are separate columns in every report, never added together, and always labelled.
* **Scale honestly.** With about 25 invited supporters per creator, the pilot cannot show what 1,000 people are worth. It can measure commitment rates, retention and value per supporter. Any projection to larger communities is a clearly labelled assumption in an investor model, not a pilot result.
* **Testing real support.** The option stays open to test real voluntary financial support with a **limited creator cohort before the pilot ends**, subject to the founder's separate approval, legal review, and payment infrastructure built and reviewed for that purpose (see the decision below).

## Decision required before launch: real voluntary support

Real voluntary financial support from audiences to creators is an important objective for the pilot, and it is central to testing the "right 1,000" hypothesis. Phase 1A builds no payments, and simulated Support Intent is not assumed to be the final pilot monetization strategy. The founder must choose before the pilot clock starts.

| Option | What happens | Evidence for investors | Effort and risk |
| --- | --- | --- | --- |
| A. Support Intent only | Supporters state amounts; no money moves | Weakest | Already planned |
| B. Creators' own support links | Creators link their existing tip pages; Crevant never touches money | Clicks and self-reported totals | Days; low legal risk |
| C. Real payments through Stripe Connect | Supporters pay creators in the app; Crevant takes 0% during the pilot | Strongest (confirmed payments) | 2 to 3 weeks plus legal review; identity checks, refunds, disputes, terms, Canada and US; makes hosting commercial |
| D. A plus C for a limited creator cohort | Intent for everyone, real payments for a small cohort of creators before the pilot ends | Strong, and allows comparison of stated against real value per supporter | Same as C, at smaller scale. Needs separate approval, legal review and payment infrastructure |

**Deadline:** before Phase 1C finishes, and in any case before the pilot clock starts, so that C or D has time for legal review and building. Payment provider fees must be checked on the provider's pricing page at decision time. Connection Points stay noncash, nontransferable and creator-specific whatever is chosen, and any real money lives in a separate `finance` schema that the separation tests already guard.

## Hosting reassessment

No paid upgrade is proposed during Phase 1A.

* Vercel Hobby is limited to non-commercial personal use. A startup's pilot is at best a grey area, and real payments would clearly be commercial.
* Vercel Hobby protects preview URLs behind Vercel login, so invited participants could not use previews anyway. During Phase 1A only the founder views previews, so nothing changes and the cost is $0.
* Before real participants arrive, compare with current terms and prices: Vercel Pro (about $20 a month), Cloudflare Pages free plan (500 builds a month; commercial terms to verify), and Netlify free (to verify). The comparison, with sources, comes to the founder at the end of Phase 1A.

## Database foundation (PR 2)

Migration: `supabase/migrations/20261107000000_profiles_and_ops.sql`. It changes no Supabase Auth configuration.

**`public.profiles`: one profile per confirmed login identity.**

| Column | What it is |
| --- | --- |
| `id` | The same id as the login identity in Supabase Auth. Deleting the identity deletes the profile (Phase 1A). |
| `username` | Unique handle: lowercase letters, numbers and underscores, 3 to 30 characters, not a reserved name. Empty until onboarding. Only lowercase is allowed, so uniqueness is case-insensitive. |
| `display_name` | 1 to 50 Unicode code points, any language and emoji. Leading and trailing whitespace and invisible characters are trimmed; invisible-only names and control characters are rejected. Empty until onboarding. |
| `created_at`, `updated_at` | Set by the database, never by members. |

No email, no role, no account type: everyone can create and support (unified accounts). Email and password stay in Supabase Auth.

**Who can do what with profiles (Phase 1A).**

* Visitors who aren't signed in: nothing.
* Signed-in members: read their own profile, and change only their own `username` and `display_name`. They cannot change any other column, add profiles or delete them.
* Server code (service role): everything.

**`ops`: private admin data**, locked like `intent`, `sim` and `analytics`. Members and visitors have no access, and it is not exposed through the Data API.

* `ops.admins`: who may send invitations. Added by hand with the founder's approval.
* `ops.invitations`: one row per invitation: email, optional neutral `source` and `campaign` labels (analysis only, never deciding what an account can do), who sent it, expiry, last sent, revoked, and who accepted it and when. At most one open invitation per email address.

**Profile creation.** A trigger on Supabase Auth's identity table creates a profile when an email is confirmed. It copies only the id and ignores anything attached at sign-up. Repeated confirmations are harmless, and invitees who never accept get no profile. The migration also backfills profiles for any identities already confirmed when it runs. Reserved usernames are written into the table's own rule, so members never need access to anything private.

**Triggers.** The profile creation function runs with elevated rights (Supabase Auth's role has none on profiles), a fixed empty search path, and cannot be called by members. The profile cleanup function (trimming display names and setting `updated_at`) runs with the caller's own rights and a fixed empty search path, and changes nothing else.

**Tests, in three layers.**

1. `supabase/tests/`: read-only, staging-safe checks of privileges, policies, functions, triggers and counts. CI runs them, and the staging deploy workflow runs them against staging after each apply.
2. `supabase/tests-local/`: tests that create fake identities (profile creation, backfill, isolation, validation), plus deliberate violations that the checks must catch. Throwaway databases only (`scripts/db/test.sh`, which refuses to run against a Supabase project or a database that already has an auth schema).
3. `scripts/db/integration.sh`: a real local Supabase in Docker (`supabase/config.toml`, local only), exercising real Supabase Auth and the Data API, including Unicode and protected-field attempts. Runs in CI as the "Integration" job.

## Privacy and retention requirement (before Connection Points or money)

In Phase 1A, deleting an account deletes its profile. **Before any Connection Points or financial records are implemented, a separate privacy and retention design must be approved.** It must support appropriate anonymization and legally required recordkeeping. No later table may silently delete history when an account is deleted; its deletion behaviour is decided by that design.

## Sign-in and accounts (PR 3)

| Page | What it does |
| --- | --- |
| `/auth/confirm` | Where invitation and password-reset emails land. Opening it does nothing: the one-time code is sent to Supabase only when a person presses **Continue**, so email scanners that open links cannot use them up. The code arrives after the `#` in the link, so it is removed from the address bar straight away. |
| `/auth/set-password` | Choose a password (at least 10 characters) after accepting an invitation or resetting it. Signed-in members only. |
| `/sign-in` | Email and password. The same message for a wrong password and an unknown email. No sign-up option: accounts are invitation-only. |
| `/forgot-password` | Asks for a reset email. Always shows the same message, so it never reveals whether an email has an account. |
| `/app` | Signed-in home. Reads only the member's own profile and shows "Your profile is ready". |
| `/app/account` | Email address, **Sign out**, and **Sign out of all devices**. |

Signed-in pages send other visitors to sign in and back afterwards, only ever to a page on this site.

**Safeguards.**

* The browser only ever gets the staging project URL and its publishable key. `scripts/check-supabase-target.mjs` runs before every build: Preview builds must use the staging project with a publishable key, Production builds must have no Supabase values, and any build fails if the key looks like a secret or service key. The app also refuses secret-looking keys at runtime.
* The app never calls Supabase's sign-up or one-time-code sign-in, and a test fails the build if it ever does. Supabase's own "Allow new users to sign up" stays off.
* **One-time codes stay out of server logs.** Email links put the code after `#` (`/auth/confirm#token_hash=...&type=invite`). Browsers never send that part to the web server, so the code does not reach Vercel or its request logs, and it is never included in a Referer header. A code in the query string (`?token_hash=`) is deliberately ignored, so a wrongly set up email template fails safely instead of leaking codes. The browser journey records every request Chromium sends and checks that the codes appear only in the body of the verification request to Supabase, and never in storage or the console.
* **Remaining limit: browser history.** The page removes the code from the address bar and from this tab's Back and Forward history. The browser's own history list (and anything that syncs it) can still remember the original link. The code is only useful to someone with access to that browser, works once, stops working after one hour, and does nothing until Continue is pressed. A link checker that rewrites links in an email (for example a company mail filter) sees the full link, as it would with any email link; the Continue button stops it from using the code.
* `vercel.json` adds a content security policy on `main` Preview builds: scripts only from this site, connections only to this site and the staging project, no framing. The `demo` branch keeps its own `vercel.json`.
* The production demo is unaffected: it is built only from `demo`, has no Supabase values, and a `main` build on the production address shows only the sample tour.

**Tests.** Unit tests cover every page state. `scripts/e2e/auth-journey.sh` runs the complete journey in a real browser against a real local Supabase with the real security headers, including email-scanner protection, expired and reused links, safe redirects and signing out of all devices. It runs in CI as the "Browser" job.

**Supabase settings.** PR 3 changes no Supabase settings. The exact dashboard steps (Site URL, redirect address, email templates, minimum password length of 10, one-hour link expiry) are provided after the PR is reviewed, for the founder to apply by hand.

## Supabase settings for later approval

None of these are changed until the founder approves each one:

* Auth site URL and allowed redirect URLs (the `main` preview address and `/auth/confirm`).
* Minimum password length of 10.
* Invite and password reset email templates using token-hash links to `/auth/confirm`, with the code after `#` (see the validation below).
* Captcha (Cloudflare Turnstile) for the request function.
* The founder's own admin account, created once from the Supabase dashboard.
* `SUPABASE_ACCESS_TOKEN` in the `staging` GitHub environment for function deploys. This token can reach every project in the Supabase organisation, so a future production project belongs in a separate organisation.
* Before real invites: a custom email sender (Supabase's built-in email only reaches the project team, at about 2 emails an hour), which needs a Crevant domain.

## Authentication validation (local, throwaway)

Run on 2026-11-05 against a local Supabase with settings matching staging (public sign up disabled, email login enabled, confirmation required), and token-hash email templates. Nothing touched staging and no real accounts were created. **29 of 29 checks passed:**

* Direct password sign up and one-time-code sign up for a new email are refused (`signup_disabled`), and no account is created.
* The publishable key cannot call the admin invite API (403).
* A trusted server invite works with sign up disabled. The invite email links to `/auth/confirm` with a token hash, and nothing happens until the page verifies it.
* Verifying confirms the email and starts a session. A 6 character password is rejected (`weak_password`); a strong one is accepted.
* The invite link cannot be reused, and an expired one is refused (`otp_expired`).
* The new user can sign in. A wrong password and an unknown email give the same error (`invalid_credentials`).
* After sign out, the old refresh token is rejected.
* Re-inviting an existing account fails (`email_exists`), so the invite function must answer the same way either way.
* Password reset: an unknown email gets the same success response and no email; a real account gets a link that starts a recovery session, sets a new password, makes the old one stop working, and cannot be reused.
* The `auth` schema is not reachable through the Data API.

**Setting to get right:** Supabase has two separate switches. "Allow new users to sign up" (the project-wide one, which is off on staging) is what keeps registration invitation only. The email provider's own switch must stay on, or nobody can sign in at all.
