# Crevant waitlist (`/join`)

Status: **infrastructure only, switched off.** Nothing here collects data until every item in the activation checklist below is approved and done.

One unified waitlist, no roles. People give an email, confirm they are 18 or older, and agree to be contacted about the pilot. Everything else is optional. Joining does not create an account or secure a place in the pilot.

## How it fits together

1. **Form** (`src/public/waitlist/`). Rendered on `/join` only when the frontend switch is on. Loads Cloudflare Turnstile only then. Has a hidden honeypot field.
2. **Server function** (`supabase/functions/join-waitlist/`). A Supabase Edge Function that checks the origin, size and shape of the request, the honeypot and the Turnstile token (including the hostname), then hashes the client IP with a salt and calls the database. It holds the only key that can write. Not deployed.
3. **Database** (`supabase/migrations/20261110000000_waitlist.sql`). Private `ops` schema with row level security on and no policies, so visitors and signed in members can't read or write anything. Only `service_role` can call `public.waitlist_submit`. Not applied to staging yet.

What is stored: email, optional answers (interests, whether they share content, platform, audience band, public link), first source and campaign from the link, the 18+ confirmation, waitlist consent with the approved privacy notice version and time, a consent history, first joined and last confirmed dates, and a selection status. No IP address, name, password or role is stored. Rate limits keep only hashed keys.

## Verified addresses, marketing and invitations

Nothing verifies that a person owns the address they typed yet (there are no confirmation emails). So:

* **No marketing consent is collected.** The form has no marketing option, the server function never forwards one, and the database refuses marketing consent for any address without `email_verified_at`.
* **No waitlist entry can be invited** until its address is verified. The database refuses to mark an unverified entry as invited, and refuses to create, move or resend an invitation for an address that is on the waitlist but unverified. Invitations for addresses not on the waitlist (for example founder outreach) are unaffected.
* Nothing sets `email_verified_at` yet. Verification, and any marketing option, come in a later reviewed change with approved wording.

## The three switches (all off by default, including Preview)

| Switch | Where | Off means |
| --- | --- | --- |
| `VITE_WAITLIST_FORM_ENABLED` | Vercel env (build time) | `/join` shows the "not open yet" box, no form, no Turnstile |
| `WAITLIST_FUNCTION_ENABLED` | Edge Function secret | the function answers `closed` and touches nothing |
| `ops.settings` `waitlist_submissions` | staging database | the database answers `closed` and stores nothing |

The form also stays off unless the Turnstile site key, privacy notice URL, notice version and Supabase settings are all present. The function also stays closed if `TURNSTILE_SECRET_KEY` is missing or `WAITLIST_RATE_SALT` is shorter than 32 characters. Any one switch being off stops submissions.

## Approved privacy notice version

The database holds the one notice version people must have been shown, in `ops.settings` `waitlist_notice_version` (empty by default). While it's empty every submission is `closed`. A submission quoting any other version is refused as `notice_changed`, and the form asks the person to reload. So consent records can only ever name the approved notice, whatever a direct request claims. When the notice changes, update this value and `VITE_PRIVACY_NOTICE_VERSION` together.

## Abuse protection

* Cloudflare Turnstile, verified on the server with an allowed hostname list.
* Honeypot field: a filled one gets a normal looking "ok" and nothing is stored.
* Rate limits in the database: 60 a minute overall, 10 an hour per client (salted IP hash), 3 a day per email. The database refuses a submission without a client hash, so the per-client limit can't be skipped.
* The client address comes only from the `X-Forwarded-For` entry added by Supabase's own proxy (`WAITLIST_TRUSTED_PROXY_HOPS` from the right, default 1). Entries a client writes itself, and headers like `CF-Connecting-IP`, are ignored. IPv6 addresses are grouped by /64. A missing or malformed address falls into one shared bucket rather than skipping the limit.
* Requests over 4 KB, non JSON requests and unknown origins are refused.

## Deletion and retention

Both run through the **Waitlist admin (staging)** workflow, which reuses the staging deploy safety: main only, the `staging` environment approval, the `STAGING_DATABASE_URL` secret and `scripts/db/verify-staging-target.sh`. It prints counts only.

* **Delete on request:** find the person's waitlist id in the Supabase dashboard, run the workflow with `delete` and that id. Never type an email address into GitHub. This removes the entry, its consent history and notes, its rate counter and any unaccepted invitation.
* **Retention purge:** run with `purge`. Removes entries with no confirmed interest for the given number of months, with their pending (unaccepted) invitations and rate counters, exactly as deletion on request does. **Proposed period: 12 months from last confirmed interest, subject to legal review.** Joining again refreshes the date. Running it on a schedule is a later decision.
* **Summary:** counts by source and answers, plus whether submissions are on. The summary view reads with the caller's rights (`security_invoker`), so it can't be used to get around the table's row level security.

## Activation checklist (needs approval before any real data)

Decisions:

- [ ] Privacy notice approved and published, and its version string chosen (for example `notice-2026-11`)
- [ ] Legal operator confirmed (intended: 1000859123 Ontario Inc., subject to legal confirmation)
- [ ] Contact address for privacy requests
- [ ] Retention period approved (proposed 12 months)
- [ ] Email verification designed and approved before any marketing option or waitlist invitation (see above)
- [ ] Supabase project region confirmed in the dashboard
- [ ] Activation itself approved

Setup, once approved:

1. Create a Cloudflare Turnstile widget for the approved hostnames. Site key goes to Vercel, secret key goes to the function.
2. Apply the migration to staging through the existing approved migration workflow.
3. Deploy the function with an approved `SUPABASE_ACCESS_TOKEN`: `supabase functions deploy join-waitlist --no-verify-jwt`.
4. Set function secrets: `TURNSTILE_SECRET_KEY`, `WAITLIST_RATE_SALT` (random, at least 32 characters), `WAITLIST_ALLOWED_ORIGINS`, `WAITLIST_ALLOWED_HOSTNAMES`, and `WAITLIST_TRUSTED_PROXY_HOPS` once confirmed. `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are provided by Supabase.
   Confirm the hop count before opening: send test requests with a made up `X-Forwarded-For` value and check (by rate limit behaviour, without logging addresses) that the made up value doesn't change the client bucket.
5. Add `https://challenges.cloudflare.com` to `script-src` and `frame-src` in `vercel.json`, and the function URL is already covered by `connect-src`.
6. Set Vercel env: `VITE_TURNSTILE_SITE_KEY`, `VITE_PRIVACY_NOTICE_URL`, `VITE_PRIVACY_NOTICE_VERSION`, then `VITE_WAITLIST_FORM_ENABLED=true`.
7. Record the approved notice version: `update ops.settings set value = '<approved version>', updated_at = now() where key = 'waitlist_notice_version';`
8. Turn on `WAITLIST_FUNCTION_ENABLED=true`, then the database switch: `update ops.settings set enabled = true, updated_at = now() where key = 'waitlist_submissions';`
9. Public launch needs Production moved off `demo`, which is a separate decision.

To switch off fast, flip the database switch back to `false`. That takes effect at once.

## Not included yet

No confirmation emails, no email verification, no marketing consent, no analytics, no accounts, no invitations sent.

## Tests

* `npm test`: form, switch and function handler tests, plus the admin workflow guards.
* `npm run test:db`: applies migrations to an empty Postgres and checks access, switches, the approved notice version, validation, consent history, verified address rules, rate limits, deletion, retention and the summary view. `supabase/tests/003_waitlist.sql` is read only and safe to run on staging.
