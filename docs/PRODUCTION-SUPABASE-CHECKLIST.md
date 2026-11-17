# Production Supabase setup checklist (DRAFT)

**Status: plan only. Nothing here has been created.** Every step marked ⚠️
needs the founder's approval at the time. It sets up a Production database
for the public waitlist, kept apart from staging (`kpudeppgokpjhvaqrprn`) and
from the frozen demo (Vercel Production, built from `demo`, which uses no
database at all).

The waitlist launch order around it is in `docs/LAUNCH-RUNBOOK.md` and
`docs/WAITLIST.md` ("Activation checklist").

## Implementation sequence and status (2026-11-17)

**Key:** ✅ done · 🧭 needs your decision · 🔑 needs access to an outside
service (you, or me with credentials you grant) · ⚠️ needs your approval when
it runs. Nothing below has been created in Production.

| # | Step | Status | Who |
| --- | --- | --- | --- |
| **Already in place** | | | |
| A | Waitlist, acquisition, social core and platform access migrations: approved checksums, applied and checked on staging (seven recorded, all six check files pass) | ✅ | |
| B | The `join-waitlist` function: origin, Turnstile, consent, notice version and switch checks; salted rate limits; restricted database login. Tested in CI (Edge runtime, TLS, integration) | ✅ | |
| C | Every Production build fails closed until a Production project reference exists (`scripts/check-supabase-target.mjs`) | ✅ | |
| D | The form can't appear without an approved notice and every setting (`readWaitlistConfig`); the buttons say "Waitlist Opens Soon" until then (PR #37) | ✅ (pending merge) | |
| E | Deletion and purge tools (admin workflow, staging); emergency close (`scripts/db/emergency-close.sql`) | ✅ staging only | |
| **1. Decisions** | | | |
| 1.1 | Domain `splitpost.social`: registered, DNS, the privacy@ mailbox | 🧭🔑 | You |
| 1.2 | Supabase: a separate organisation and a paid plan with backups | 🧭🔑 | You |
| 1.3 | Region: Canada (Central), `ca-central-1` | 🧭 (working decision) | You |
| 1.4 | Canada-only sign-ups at launch, and how the form enforces it | 🧭 | You |
| 1.5 | Privacy notice 1.0 approved (`docs/PRIVACY-NOTICE-DRAFT.md`), after counsel | 🧭 | You and counsel |
| **2. Code, on `main`, reviewed PRs, no secrets** | | | |
| 2.1 | Self-host the fonts and drop Google from the CSP | Ready to build | Me ⚠️ |
| 2.2 | Production project reference in `config/supabase-projects.json` | After 3.1 | Me ⚠️ |
| 2.3 | CSP `connect-src` per environment (Production project for Production, staging for Previews) | After 3.1 | Me ⚠️ |
| 2.4 | A Production migration workflow and GitHub `production` environment (required reviewer, `main` only, its own secret) | Ready to build | Me ⚠️, you configure the environment 🔑 |
| 2.5 | Branch protection on `main`: App, Database, Integration, Browser, Public site | 🔑 GitHub settings | You |
| **3. Production project** | | | |
| 3.1 | Create the project; SSL enforced; only `public` exposed; Auth settings matching staging | 🔑 ⚠️ | You |
| 3.2 | Production `plan` (seven migrations), `apply`, `check`, then the read-only diagnostic | ⚠️ | Me, after your approval |
| 3.3 | Set the two waitlist role passwords in the database | 🔑 | You |
| **4. Bot check and function** | | | |
| 4.1 | Cloudflare Turnstile: a test widget for one fixed Preview, and a Production widget for splitpost.social only | 🔑 | You |
| 4.2 | Deploy `join-waitlist` to Production from your computer (`supabase login`), with its secrets: database login, Turnstile secret, a new rate salt, allowed origins and hostnames (splitpost.social only), proxy hop count. Function switch off | 🔑 ⚠️ | You, with my step-by-step |
| 4.3 | The three hosted checks: pooler login, TLS verification, proxy hop count | ⚠️ | You run, I read results |
| **5. End-to-end tests (switches still closed to the public)** | | | |
| 5.1 | On staging with the test widget: a successful signup, only the documented fields stored, a duplicate changes nothing, wrong consent, Turnstile, notice version or origin refused, close works, delete removes the entry | ⚠️ | Me and you |
| 5.2 | The same final check on Production with your own email, then delete it | ⚠️ | You |
| **6. Opening** | | | |
| 6.1 | Publish the approved notice (reviewed PR) | ⚠️ | Me |
| 6.2 | Vercel Production variables for the form; record the notice version; function switch on; `admin_open()` | 🔑 ⚠️ | You |
| 6.3 | Switch Production from the frozen demo to the public site, then allow indexing | 🔑 ⚠️ | You |

The detail for each step follows.

## 0. Decisions first

| Decision | Proposal |
| --- | --- |
| **Separate Supabase organisation** | Yes. A Supabase access token reaches every project in its organisation (`docs/PHASE-1A.md`), so Production goes in its own organisation, with its own owner account and two-factor sign-in. |
| **Region** | Working decision: Canada (Central), `ca-central-1`. Choose before creating the project; it can't be moved later. The privacy notice names it. |
| **Plan** | A paid plan with daily backups (and point-in-time recovery if affordable). The free plan has no downloadable backups. |
| **Automatic RLS option** | Either way works: migration `20261118000000` removes members' access to `public.rls_auto_enable()` if Supabase installs it, and check `006` verifies that. Record which was chosen. |
| **Domain** | Working decision: `splitpost.social`, for the site, the email sender, the privacy contact, Turnstile and the Auth site address. Production on `crevant-prototype.vercel.app` is the frozen demo and stays so until the switch. |

## 1. Create the project ⚠️

1. In the new organisation, create the project in the chosen region, with a
   long generated database password, stored only in a password manager.
2. Note its project reference (20 lowercase letters). It is not a secret.
3. **Database settings:** enforce SSL. Set network restrictions to allow only
   what's needed if the plan supports it.
4. **API settings:** expose only the `public` schema (plus `graphql_public`
   if Supabase requires it). `ops`, `social`, `waitlist_api`, `intent`, `sim`
   and `analytics` must not be exposed.
5. **Auth settings,** matching staging's approved settings
   (`docs/PHASE-1A.md`):
   * public sign up **off**; email sign in on; email confirmation required;
   * minimum password length 10;
   * Site URL and redirect URLs: the Production domain and `/auth/confirm`
     only;
   * invite and reset email templates using token-hash links after `#`;
   * a custom email sender on the Splitpost domain before any invitation.
6. Don't connect the Supabase GitHub integration (staging has it
   disconnected too).

## 2. Repository changes (reviewed PRs, no secrets) ⚠️

1. **Project reference:** set `production.ref` in
   `config/supabase-projects.json`. Until then every Production build fails
   closed for the waitlist (`scripts/check-supabase-target.mjs`).
2. **Content Security Policy:** `vercel.json` lets browsers connect only to
   staging (`connect-src 'self' https://kpudeppgokpjhvaqrprn.supabase.co`).
   Production needs its own project address there, and Preview must keep
   staging only. Decide how (per-environment headers or a build step), with
   tests.
3. **A Production migration workflow,** a copy of `deploy-db-staging.yml`
   with:
   * its own GitHub environment `production`: required reviewer (the
     founder), `main` only, its own `PRODUCTION_DATABASE_URL` secret;
   * the Production reference hard-coded and checked four ways, like
     staging's, so it can never touch staging and staging's can never touch
     Production;
   * `plan`, `apply` and `check` modes, and the same approved-checksum gate.
4. **Production admin and health workflows,** if wanted, built the same way.
   The existing waitlist admin, rollback and health workflows are pinned to
   staging. **No rollback workflow for Production:** the staging rollbacks
   refuse to run anywhere but staging, by design.
5. **Branch protection on `main`:** require App, Database, Integration,
   Browser and Public site to pass.

## 3. Database ⚠️

1. Production `plan`: it must list exactly the seven approved migrations,
   from `20261106000000` to `20261118000000`.
2. Production `apply`, then `check`: all six check files pass, including
   `006`.
3. Run `scripts/db/staging-diagnose-function-access.sql` in the Production
   SQL editor (read-only; despite the name it works on any project). Section 3
   returns no rows, 3b only `authenticated` reading `public.profiles`, 3c
   `public` and `waitlist_api`, and section 5 both waitlist switches off.
4. Set the `waitlist_writer` and `waitlist_admin` passwords directly in the
   database (`docs/WAITLIST.md`, "Database access"). Never in the repository.

## 4. The server function ⚠️

1. Create a Production Cloudflare Turnstile widget for the Production domain
   only.
2. From the founder's computer: `supabase login`, then deploy
   `join-waitlist` to the Production project with `--no-verify-jwt`. No access
   token is stored in GitHub.
3. Function secrets (values never in chat or the repository):
   `WAITLIST_DB_URL` (the `waitlist_writer` pooler address),
   `TURNSTILE_SECRET_KEY`, `WAITLIST_RATE_SALT` (new, 32+ random characters,
   different from staging), `WAITLIST_ALLOWED_ORIGINS` and
   `WAITLIST_ALLOWED_HOSTNAMES` (the Production domain only), optionally
   `WAITLIST_DB_CA_CERT`, and `WAITLIST_TRUSTED_PROXY_HOPS` once confirmed.
   Leave `WAITLIST_FUNCTION_ENABLED` off.

## 5. Hosted checks on Production ⚠️

Repeat the three mandatory staging checks against Production
(`docs/STAGING-CHECKS-WINDOWS.md`):

1. The pooler accepts `waitlist_writer.<production ref>`.
2. The function connects with full certificate verification.
3. The proxy hop count is confirmed, so a made-up `X-Forwarded-For` can't
   change the rate limit bucket.

## 6. End-to-end signup test (before opening) ⚠️

On one fixed Preview address with a **test** Turnstile widget, against
**staging** first, then a final check against Production with your own
email:

1. Submit the form: it says you're on the list.
2. The entry holds only the documented fields (admin `status` and `summary`
   show counts only).
3. Submitting again with the same email changes nothing.
4. A missing consent, a failed Turnstile, a wrong notice version or a wrong
   origin is refused.
5. **Close** works at once, and **delete** removes your test entry.

## 7. Opening ⚠️

Only after the privacy notice is approved and published
(`docs/PRIVACY-NOTICE-DRAFT.md`):

1. Vercel Production variables: `VITE_WAITLIST_ENDPOINT` (the Production
   function), `VITE_TURNSTILE_SITE_KEY`, `VITE_PRIVACY_NOTICE_URL=/privacy`,
   `VITE_PRIVACY_NOTICE_VERSION`, then `VITE_WAITLIST_FORM_ENABLED=true`.
2. Record the notice version with `waitlist_api.admin_set_notice_version`.
3. Turn on `WAITLIST_FUNCTION_ENABLED=true`, then `waitlist_api.admin_open()`.
4. Switch Production from the demo to the public site
   (`CREVANT_PRODUCTION_SITE_APPROVED=true`, Production branch `main`), and
   then allow indexing, per `docs/LAUNCH-RUNBOOK.md`.

## Never

* Use the staging project, its keys or its passwords for Production, or the
  other way round.
* Put a database address, password or service key in a repository secret
  (environment secrets only), in the code or in chat.
* Point the frozen demo (`demo` branch) at any database.
