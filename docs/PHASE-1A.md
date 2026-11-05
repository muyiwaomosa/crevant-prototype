# Phase 1A: public landing page and authentication foundation

Part of the Crevant 60-day pilot. Phase 1A builds the public entry point and invitation-controlled sign in. It does not start the pilot clock: the 60 days begin when invited participants can actually use the core product.

This file records the plan as approved by the founder, the decisions still open, and the deployment safeguards. Update it in a reviewed pull request when a decision changes.

## Scope and sequence

Each step is its own pull request and stops for the founder's review. Nothing is merged, deployed, applied to a database, or changed in Supabase or Vercel settings without explicit approval.

| Step | What it delivers | Status |
| --- | --- | --- |
| PR 1 | Public landing page, prototype moved to `/tour`, production safeguards, this document. No Supabase, no forms. | This PR |
| Validation | Invitation, email confirmation and password setting with public sign up disabled: first locally (done, below), then on staging with the founder's own email after the settings below are approved | Local done |
| PR 2 | Migration proposal: private `ops` schema (invitations, requests, admins, rate limits) and `public.profiles` with RLS. Run in CI only, not applied. | Planned |
| PR 3 | Sign in, sign out, password reset, protected `/app`, `/auth/confirm` | Planned |
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

No page collects personal information until all of these are true:

1. The privacy notice is published and approved by the founder.
2. The server side request function has its captcha, rate limit and retention rule in place.
3. The founder approves switching the request form on.

PR 1 has no forms, inputs, storage, cookies or calls to outside services on public pages, and tests enforce it.

## Landing page rules

* Lead with the long-term vision: creating as a profession, meaningful relationships, opportunities to earn, and work that keeps its value. The chronological feed is one feature, not the whole platform.
* Describe the Following feed by its order only: newest first, not ranked by engagement. Never imply that followers will see every post or that reach is guaranteed.
* Never imply guaranteed earnings or that any money feature is live.
* Label every feature with its real status: in the pilot, in development, or where we're headed.
* No invented user counts, testimonials or traction.

`src/public/public-site.test.tsx` enforces the required disclosures and a list of banned phrases.

## Decision required before launch: real voluntary support

Real voluntary financial support from audiences to creators is an important objective for the pilot. Phase 1A builds no payments, and simulated Support Intent is not assumed to be the final pilot monetization strategy. The founder must choose before the pilot clock starts.

| Option | What happens | Evidence for investors | Effort and risk |
| --- | --- | --- | --- |
| A. Support Intent only | Supporters state amounts; no money moves | Weakest | Already planned |
| B. Creators' own support links | Creators link their existing tip pages; Crevant never touches money | Clicks and self-reported totals | Days; low legal risk |
| C. Real payments through Stripe Connect | Supporters pay creators in the app; Crevant takes 0% during the pilot | Strongest (confirmed payments) | 2 to 3 weeks plus legal review; identity checks, refunds, disputes, terms, Canada and US; makes hosting commercial |
| D. A plus C for a subset of creators | Intent for everyone, real payments for some | Strong, and allows comparison | Same as C |

**Deadline:** before Phase 1C finishes, and in any case before the pilot clock starts, so that C or D has time for legal review and building. Payment provider fees must be checked on the provider's pricing page at decision time. Connection Points stay noncash, nontransferable and creator-specific whatever is chosen, and any real money lives in a separate `finance` schema that the separation tests already guard.

## Hosting reassessment

No paid upgrade is proposed during Phase 1A.

* Vercel Hobby is limited to non-commercial personal use. A startup's pilot is at best a grey area, and real payments would clearly be commercial.
* Vercel Hobby protects preview URLs behind Vercel login, so invited participants could not use previews anyway. During Phase 1A only the founder views previews, so nothing changes and the cost is $0.
* Before real participants arrive, compare with current terms and prices: Vercel Pro (about $20 a month), Cloudflare Pages free plan (500 builds a month; commercial terms to verify), and Netlify free (to verify). The comparison, with sources, comes to the founder at the end of Phase 1A.

## Supabase settings for later approval

None of these are changed until the founder approves each one:

* Auth site URL and allowed redirect URLs (the `main` preview address and `/auth/confirm`).
* Minimum password length of 10.
* Invite and password reset email templates using token-hash links to `/auth/confirm` (see the validation below).
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
