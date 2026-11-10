# Crevant waitlist (`/join`)

Status: **infrastructure only, switched off.** Nothing here collects data until every item in the activation checklist below is approved and done. The migration has not been applied to any environment, and the function has not been deployed.

One unified waitlist, no roles. People give an email, confirm they are 18 or older, and agree to be contacted about the pilot. A few research questions are optional. Joining does not create an account or secure a place in the pilot.

## How it fits together

1. **Form** (`src/public/waitlist/`). Rendered on `/join` only when the frontend switch is on, in the full app and in the public site build. It posts JSON straight to the server function, with **no Supabase key**. It loads Cloudflare Turnstile (action `join`) only when switched on, and has a hidden honeypot field.
2. **Server function** (`supabase/functions/join-waitlist/`). A Supabase Edge Function. It checks:
   * the origin, size and shape of the request
   * the honeypot
   * the Turnstile token: success, an allowed hostname, and the action `join`

   Then it makes salted rate limit keys and calls the database as the restricted `waitlist_writer` login. It never uses the service role key or the platform's own database URL, and it refuses to start with any other database login. Not deployed.
3. **Database** (`supabase/migrations/20261110000000_waitlist.sql`), in the staging Supabase project in **us-west-2 (West US, Oregon)**. The private `ops` schema has row level security on and no policies, so visitors and signed in members can't read or write anything. The only entry points are the `waitlist_api` functions, each callable by one dedicated login role. Not applied yet.

## What is stored, and what isn't

| Field | Why |
|---|---|
| Email | **Required.** The only contact detail |
| 18+ confirmation (yes or no, no date of birth) | **Required.** Adults only |
| Waitlist consent, privacy notice version, time | **Required.** Proof of consent, one record per person |
| Interests (6 fixed choices) | Optional research |
| Shares content (yes / not yet) | Optional research |
| Platform, audience band (only after "yes") | Optional research, rough bands |
| Source label from `?src=` | Which channel worked. First party, never shared |
| Joined at, verified at, last verified confirmation | Retention and verification |
| Participant groups (worked out from the answers above, not asked) | Analysis: who joined |
| Status, invitation link, selection reasons per wave (fixed list) | Internal, for invitations later |

**Not stored:**
* public links
* campaign labels
* marketing consent
* names
* IP addresses
* roles
* free text notes

Rate limit counters hold only salted HMAC keys and are kept for two days.

## Participant groups and selection reasons

Two different things, kept apart:

**Who someone is: participant groups.** These are worked out by the database from the person's own optional answers. Nobody is asked anything extra, and staff never type labels about a person. A person can be in more than one group, or in none.

| Group | When |
|---|---|
| `active_creator` | They share content today ("Yes") |
| `aspiring_creator` | "Not yet", but they chose a creator goal: reaching followers, a closer community, or earning sustainably |
| `supporter` | They chose supporting or discovering creators |

The groups are a generated column (`participant_groups`), so they can't be edited by hand. They're for analysis only: never a role, never copied to an account, and they never decide what anyone can do. The admin summary counts each group (overlapping) and those who answered none.

**Why someone was picked: selection reasons.** These are recorded per invitation wave, with one or both reasons from a fixed list and never free text:

| Reason | Meaning |
|---|---|
| `group_balance` | To balance the pilot's participant groups |
| `targeted_feedback` | To get feedback on something specific |

The group definitions and the reasons need approval (see the checklist).

## Duplicates, verification and invitations

Nothing yet proves a visitor owns the address they type, so:

* **A repeat submission changes nothing.** If the address is already on the list, the answers, consent and retention date all stay as they were. The visitor still sees "ok", so nobody can find out who has joined. Changes and deletions go through the privacy contact.
* **Unverified and verified entries are kept apart.** Every entry starts unverified (`email_verified_at` empty, `verified` false), and the admin summary counts the two separately.
* **No unverified entry can be invited.** The database refuses to mark an unverified entry as invited. It also refuses to create, move or resend an invitation for an address that's on the waitlist but unverified, and it refuses to record a confirmation of interest for one. Invitations for addresses not on the waitlist (for example founder outreach) are unaffected.
* **There is no marketing consent at all.**
* **Email verification comes before the first invitation wave.** It means a confirmation email with a signed link, which needs an email provider. That's a separate, reviewed change.

## Database access

| Login | Used by | Can do | Can't do |
|---|---|---|---|
| `waitlist_writer` | the join-waitlist function | `waitlist_api.submit` | read or write any table; call any other function; the admin actions |
| `waitlist_admin` | the waitlist admin workflow | `waitlist_api.admin_summary`, `admin_status`, `admin_delete`, `admin_purge`, `admin_set_notice_version`, `admin_open`, `admin_close`, and (B3) `admin_wave_preview`, `admin_wave_select`, `admin_wave_summary`, `admin_wave_clear` | read or write any table; submit; anything else |

Both roles have no special powers: no superuser, no creating roles or databases, no replication, no bypassing row level security, and no membership of other roles. The `waitlist_api` functions run as the table owner, with a fixed empty search path and fully qualified names, so each can do exactly its one job. The schema isn't exposed through the Data API, and no API role (`anon`, `authenticated`, `service_role`) can use it.

**No passwords are in the repository.** The migration creates both roles without a password, and a role without a password can't log in. When activation is approved, the founder sets each password in the Supabase SQL editor, from a password manager:

```sql
alter role waitlist_writer password '<random 32+ characters>';
alter role waitlist_admin password '<random 32+ characters>';
```

**Function connection.** `WAITLIST_DB_URL` goes through the Supabase pooler, with the user `waitlist_writer.kpudeppgokpjhvaqrprn` in transaction mode (port 6543). It uses TLS with full certificate verification. If the pooler's certificate isn't publicly trusted, add Supabase's CA certificate (public, not a secret) as `WAITLIST_DB_CA_CERT`. Prepared statements are off, as the transaction pooler needs.

**Verified locally:** the real function code was run in Supabase's Edge runtime (`supabase/edge-runtime:v1.78.1`) against Supabase's own Postgres 17 image, logged in as `waitlist_writer` (`scripts/e2e/waitlist-edge.sh`, also in CI). Three things still have to be confirmed on staging (Phase E). They are hosted staging checks 1 to 3 in the activation checklist:
* that the hosted pooler accepts the custom login
* which certificate it presents
* the proxy hop count

If the pooler refuses the custom login, the plan stops there and comes back for a decision. It doesn't fall back to a broader credential.

**Residual risk:** Supabase gives every Edge Function `SUPABASE_SERVICE_ROLE_KEY` and `SUPABASE_DB_URL` as environment variables, and they can't be removed. This function never reads them. The restricted login limits what our code can do, and what a leaked `WAITLIST_DB_URL` can do. It can't stop someone who could run their own code inside the function from reading those platform variables.

## The switches (all off by default, including Preview)

| Switch | Where | Off means |
|---|---|---|
| `VITE_WAITLIST_FORM_ENABLED` | Vercel env (build time) | `/join` shows the "not open yet" box, no form, no Turnstile |
| `WAITLIST_FUNCTION_ENABLED` | Edge Function secret | the function answers `closed` and touches nothing |
| `ops.settings` `waitlist_submissions` | staging database | the database answers `closed` and stores nothing |
| `ops.settings` `waitlist_notice_version` | staging database | empty: every submission is `closed` |

The form also stays off unless the function address, Turnstile site key, privacy notice URL and notice version are all set. The function also stays closed without:
* a valid `waitlist_writer` database URL
* `TURNSTILE_SECRET_KEY`
* a `WAITLIST_RATE_SALT` of at least 32 characters

Any one switch being off stops submissions.

## Approved privacy notice version

The database holds the one notice version people must have been shown. It's set through `waitlist_api.admin_set_notice_version`. While it's empty, every submission is `closed`. A submission quoting any other version is refused as `notice_changed`, and the form asks the person to reload. So consent records can only ever name the approved notice. When the notice changes, update this value and `VITE_PRIVACY_NOTICE_VERSION` together.

## Abuse protection

* **Cloudflare Turnstile,** verified on the server: success, an allowed hostname, and the action `join`.
* **Honeypot field:** a filled one gets a normal looking "ok", and nothing is stored or verified.
* **Origin allowlist:** exact origins only. The preflight allows the `content-type` header only.
* **Rate limits in the database:**
  * 60 a minute overall
  * 10 an hour per client
  * 3 a day per email

  The keys are HMAC-SHA256 with the secret `WAITLIST_RATE_SALT`, separately for the email and the client address, so they can't be reversed or matched without the salt. The database refuses a submission without both keys.
* **Client address:** taken only from the `X-Forwarded-For` entry added by Supabase's own proxy (`WAITLIST_TRUSTED_PROXY_HOPS` from the right, default 1). Entries a client writes itself, and headers like `CF-Connecting-IP`, are ignored. IPv6 addresses are grouped by /64. A missing or malformed address falls into one shared bucket rather than skipping the limit.
* **Request limits:** requests over 4 KB and non JSON requests are refused.

## Deletion and retention

Both run through the **Waitlist admin (staging)** workflow, as the restricted `waitlist_admin` login only (`WAITLIST_ADMIN_DATABASE_URL`). It keeps the staging deploy safety: `main` only, the `staging` environment approval, and `scripts/db/verify-staging-target.sh`, which also refuses any other login. It prints counts only. Day to day procedures, including waves, monitoring and emergency shutdown, are in `docs/WAITLIST-OPERATIONS.md`.

* **Delete on request:** find the person's waitlist ID in the Supabase dashboard, then run the workflow with `delete` and that ID. Never type an email address into GitHub. This removes the entry, its consent record, its selection reasons and any unaccepted invitation. Rate limit counters are salted and can't be linked to the address. They expire within two days.
* **Retention purge:** run with `purge`. It removes entries whose last verified confirmation, or failing that their signup, is older than the given number of months. Their pending invitations go too. **Proposed period: 12 months, subject to legal review.** An unverified repeat submission never extends it.
* **Summary:** counts by source and answers, verified and unverified apart, plus the switch and notice version. The summary view reads with the caller's rights (`security_invoker`).

## Activation checklist (needs approval before any real data)

Decisions:

- [ ] Privacy notice approved and published, and its version string chosen (for example `notice-2026-11`)
- [ ] Legal operator confirmed (intended: 1000859123 Ontario Inc., subject to legal confirmation)
- [ ] Contact address for privacy requests
- [ ] Retention period approved (proposed 12 months)
- [ ] Participant group definitions and selection reasons approved (see "Participant groups and selection reasons")
- [ ] Email verification designed and approved before any waitlist invitation (see above)
- [x] Supabase project region confirmed: **us-west-2 (West US, Oregon)**, staging project `kpudeppgokpjhvaqrprn` (confirmed 2026-11-10). The privacy notice should say where data is stored.
- [x] GitHub `staging` environment limited to `main` with a required reviewer, and the Supabase GitHub integration disconnected (confirmed 2026-11-10)
- [ ] **Branch protection on `main`** requiring pull requests and these CI checks: App, Database, Integration, Browser, and **Public site**. The Public site job must be a required check before Production moves to the public site build.
- [ ] **Hosted staging check 1: pooler login.** The Supabase pooler accepts the custom `waitlist_writer.kpudeppgokpjhvaqrprn` login. If it doesn't, stop and decide; never fall back to a broader credential.
- [ ] **Hosted staging check 2: TLS certificate.** The function connects with full certificate verification, adding Supabase's public CA as `WAITLIST_DB_CA_CERT` if needed. Never turn verification off.
- [ ] **Hosted staging check 3: proxy hop count.** `WAITLIST_TRUSTED_PROXY_HOPS` is confirmed, so a made up `X-Forwarded-For` value can't change the client bucket.
- [ ] Operations set up (`docs/WAITLIST-OPERATIONS.md`): `WAITLIST_ADMIN_DATABASE_URL`, the health check variables, and a monthly reminder to run the purge (no scheduled deletion)
- [ ] Activation itself approved

Setup, once approved (each step needs approval):

1. **Turnstile:** create two Cloudflare Turnstile widgets. A test widget for one fixed Preview address, deleted after testing, and a Production widget for the production domain only. Site keys go in Vercel; secret keys go in the function.
2. **Migration:** apply it to staging through the existing approved migration workflow (`plan`, then `apply`, then `check`).
3. **Role passwords:** set the two passwords (see "Database access").
4. **Deploy the function** from the founder's computer with `supabase login` (no access token stored in GitHub): `supabase functions deploy join-waitlist --no-verify-jwt`.
5. **Function secrets:**
   * `WAITLIST_DB_URL` (the `waitlist_writer` pooler URL)
   * `TURNSTILE_SECRET_KEY`
   * `WAITLIST_RATE_SALT` (random, at least 32 characters)
   * `WAITLIST_ALLOWED_ORIGINS`
   * `WAITLIST_ALLOWED_HOSTNAMES`
   * optionally `WAITLIST_DB_CA_CERT`
   * `WAITLIST_TRUSTED_PROXY_HOPS`, once confirmed
6. **Smoke test on staging,** covering hosted staging checks 1 to 3 in the checklist above. All three must pass before activation:
   * The pooler accepts `waitlist_writer.<ref>`.
   * The certificate verifies.
   * The hop count is confirmed: send test requests with a made up `X-Forwarded-For` value and check, by rate limit behaviour and without logging addresses, that the made up value doesn't change the client bucket.
7. **Security policy:** the Content Security Policy in `vercel.json` already allows `https://challenges.cloudflare.com` in `script-src` and `frame-src` (added with the public site build). The function address is covered by `connect-src`.
8. **Vercel env:** `VITE_WAITLIST_ENDPOINT` (`https://kpudeppgokpjhvaqrprn.supabase.co/functions/v1/join-waitlist`), `VITE_TURNSTILE_SITE_KEY`, `VITE_PRIVACY_NOTICE_URL` and `VITE_PRIVACY_NOTICE_VERSION`, then `VITE_WAITLIST_FORM_ENABLED=true`.
9. **Notice version:** record the approved version with `waitlist_api.admin_set_notice_version('<version>')`.
10. **Open:** turn on `WAITLIST_FUNCTION_ENABLED=true`, then `waitlist_api.admin_open()`.
11. **Public launch:** Production must move to the public site build, which is a separate decision (`docs/PUBLIC-SITE.md`).

To close fast, run the admin workflow's **close** action. If GitHub is unavailable, run `scripts/db/emergency-close.sql` in the Supabase SQL editor (`docs/WAITLIST-OPERATIONS.md`, "Emergency shutdown"). Either takes effect at once.

## Not included yet

* confirmation emails or email verification
* marketing consent
* analytics
* accounts
* invitations sent

## Tests

* **`npm test`:**
  * form, switch and function handler tests: salted keys, Turnstile hostname and action, the origin, the database login refusal, bound parameters
  * the admin workflow guards
* **`npm run test:db`:** applies the migrations to an empty Postgres, then:
  * runs the staging-safe checks in `supabase/tests/003_waitlist.sql`: locked tables, both roles' exact privileges, the entry points, minimal fields, verification rules
  * runs the behaviour tests in `supabase/tests-local/040_waitlist.sql`, as the real login roles
  * replays 39 deliberate violations, all of which must be caught
* **`scripts/e2e/waitlist-edge.sh`** (in the CI Integration job): the function in Supabase's Edge runtime against a local Supabase, as `waitlist_writer`. It checks:
  * the switches
  * the origin and preflight
  * the Turnstile hostname and action
  * the honeypot
  * the notice version
  * a repeat submission changing nothing
  * spoofed address rotation
  * salted keys
  * what each login can't do
  * closing
  * that the function refuses a broader login
  * that the logs hold no email address
