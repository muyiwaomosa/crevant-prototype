# Foundation v2 (IP-1): review guide and runbook

Migration: `supabase/migrations/20261130000000_foundation_v2.sql`. Authorized by the founder on November 25, 2026 as Implementation Package 1 (SP-TA-001 v2, section 10). Checksum in `supabase/approved-migrations.sha256`: merging the pull request is the founder's approval of it (process agreed in D7).

**Safe defaults everywhere:** registration starts **paused**, the launch gate is unchanged (closed on member Production), and nothing in the migration grants membership by itself.

## 1. What it adds

| Area | What | Requirements |
|---|---|---|
| Adult eligibility | `ops.age_attestations` (one row per account, never edited). `social.current_access()` requires it, so every member function refuses an account without one (`adult_attestation_required`). Members granted before this migration confirm once in the app (`public.app_attest_adult`). Not backfilled: a confirmation must be the person's own | FND-07 |
| Controlled registration | `ops.registration_settings` (paused, overall cap 200, daily cap 25, per-referrer daily cap 5; changes recorded in `ops.registration_setting_events`), `ops.registration_links` (founder invitation links; one personal referral link per member), `ops.registrations` (who joined through which link; first-touch referrer; never edited except clearing references when an account is deleted), `ops.blocked_email_domains` | FND-01, BRD-07, RWD-03 (capture only) |
| Account creation hook | `public.hook_before_user_created`, called by Supabase Auth before any sign-up or invite creates an account. Allows an account when the email has an open founder invitation in `ops.invitations`, or when the sign-up carries a valid registration code **and** the 18+ confirmation, the email domain is not disposable, registration is not paused or full, and external access is open. Admin-created accounts (Auth admin users API) do not pass through it | FND-01 |
| Claiming membership | `public.app_claim_access(code, adult, wording)`: after email verification, re-checks the link and every limit under one lock, records the confirmation, the registration and its attribution, increments the link's uses and grants membership (cohort from the link). The launch gate trigger still decides last. Never follows anyone, never reopens a revoked membership | FND-01, RWD-03 |
| Events | `analytics.events`, written only by server triggers on posts, comments, likes, follow history, Clique history and registrations, so each action is recorded once with its data class (actual, founder, test). Viewed state is deliberately **not** read (it stays a UX signal inside the social core). Members cannot read events | INT-C01, INT-C12 |
| Home paging | `app_feed_page` and `app_member_posts_page` page on `(created_at, id)`: posts with the same timestamp are never skipped (DEF-01). `app_feed_page` filters to My Clique. The earlier functions stay for older pages | CON-08, CON-07 |
| Founder | `app_founder_registration`, `app_founder_set_registration`, `app_founder_create_invitation_link` (founder cohort only) | BRD-07 |

The app: five destinations (Home, Discover, Create, My Split, Profile), the reusable multi-face view (`src/components/FaceView.tsx`) on Home (Clique first, My Clique, Following) and My Split (Overview, History, Opportunities with the personal referral link), the registration page at `/register/<code>`, the 18+ confirmation screen, and plain messages for every registration outcome. Anonymous visitors still can call no database function at all.

## 2. Evidence (local, November 25, 2026)

| Layer | Result |
|---|---|
| Typecheck, production build, bundle secret scan | Pass |
| Unit and component tests (Vitest) | 774 passed, 3 skipped |
| Build and workflow guard tests | 291 passed |
| Database suite on an empty PostgreSQL 16 (`scripts/db/test.sh`): all 19 migrations, staging-safe checks including the new `016_foundation_v2.sql`, behaviour tests including the new `120_foundation_v2.sql`, the member surface audit and its violation tests | Pass |
| Real Supabase Auth integration (`scripts/db/integration.sh`) | 135 passed, 0 failed |
| Rollback chain (`scripts/db/rollback-test.sh`) including the new `rollback-foundation-v2-test.sh` | 74 passed, 0 failed |
| New browser journey (`e2e/registration-journey.e2e.cjs`), real browser, real Auth and email, production security headers | All passed: paused refusal, invitation registration, email confirmation, claim with the link's cohort, Home faces, My Split referral link, referral registration with attribution and no automatic follow, the 18+ screen, WCAG 2.2 AA, 320 and 390 px, no CSP violations, no console errors |
| Existing journeys (social, moderation, feedback, auth) | All functional checks pass. The social journey's console check reports 503s from the profile picture function, which cannot run in the assessment sandbox (its file descriptor limit); the photo and avatar journeys need the same function and run in CI |

## 3. Production batch PB-1 (founder approval needed; about 45 minutes)

Nothing here changes the database schema or opens external access.

| # | Step | Where | Why |
|---|---|---|---|
| 1 | Create a Resend account (free tier) and verify a sending subdomain (for example `mail.splitpost.ca`) with SPF, DKIM and DMARC | Resend, DNS | Supabase's default sender only reaches team members at 2 emails an hour |
| 2 | Set custom SMTP (Resend host, port 465 or 587, user `resend`, the API key as password, sender `Splitpost <noreply@mail.splitpost.ca>`) on **Staging**, then member Production | Supabase Auth settings | Registration, confirmation and password reset emails |
| 3 | Store the media drain secret in Vault as `media_drain_key` on member Production, then rerun the existing photo cleanup schedule workflow (apply) | Supabase SQL editor; GitHub workflow | DEF-02; photos stay off until this passes |
| 4 | Set the repository variables `WAITLIST_HEALTH_ENABLED` and `PRODUCTION_WAITLIST_HEALTH_ENABLED` to `true`; add a free uptime check for www.splitpost.ca and app.splitpost.ca | GitHub settings; uptime service | DEF-06 |
| 5 | Merge PR #105 (staging post-media ledger) and add the member Production post-media entry from your local deploy log | Repository | DEF-05; the ledger is an approval record, so only you can add it |

## 4. Applying M1 (staging now, Production in PB-2)

Order matters, because Auth calls the hook as soon as it is configured:

1. Merge the IP-1 pull request (this approves the checksum).
2. Run the staging database deploy workflow: `plan`, then `apply`, then `check` (the read-only checks include `016_foundation_v2.sql`).
3. **Then** in the staging project's Auth settings: turn on sign-ups (Allow new users to sign up), add the **Before User Created** hook as a Postgres function, `public.hook_before_user_created`, and set the confirmation email template from `supabase/templates/confirmation.html` (subject "Confirm your email for Splitpost"). Also update the invite and recovery templates, which still say Crevant on hosted projects.
4. On staging, open registration for testing: `select ops.set_registration_settings('founder', 'staging test', false);` (external access on staging is already open).
5. Member Production repeats steps 2 and 3 in PB-2 (December 16). Registration stays paused and the launch gate closed until PB-4 (December 23).

**Never turn on the hook before the migration is applied:** Auth would call a missing function and refuse every sign-up and invite. To undo on staging, turn the hook off first, then run `scripts/db/staging-rollback-foundation-v2.sql` (it refuses once any member data exists; after that, fix forward).

## 5. Operating controls (no deployment needed)

| Task | How |
|---|---|
| Pause or resume registration | `select ops.set_registration_settings('founder', '<reason>', true);` (or `false`), or `app_founder_set_registration` from the app's Control Center once built (IP-3) |
| Change limits | `select ops.set_registration_settings('founder', '<reason>', null, <total cap>, <daily cap>, <per-referrer daily cap>);` |
| Create an invitation link | `select ops.create_invitation_link('founder', 'creator', <uses>, interval '14 days');` then share `https://app.splitpost.ca/register/<code>` |
| Invite by email instead | Record it first: `insert into ops.invitations (email, source, campaign, expires_at) values ('<email>', 'founder', '<label>', now() + interval '14 days');` then send the invite from the Auth dashboard. Without the record, the hook refuses the invite |
| Block a disposable domain | `insert into ops.blocked_email_domains values ('<domain>');` |
| See the history | `select * from ops.registration_setting_events order by changed_at desc;` |

## 6. Deliberate decisions in this package

* **No anonymous function.** A public "is this link valid?" check was removed during build: anonymous visitors can still call nothing. The sign-up itself returns the hook's plain message.
* **Registration page closed on the production address** until the reviewed pilot terms and member privacy notice are published (`POLICIES_PUBLISHED` in `src/public/auth/RegisterPage.tsx`, changed only in a reviewed PR). Previews and staging show the form for testing; the database decides who may register either way.
* **Test-only automatic confirmation:** local test databases record a `test` confirmation for fixture members (`supabase/tests-local/006_adult_attestation_for_tests.sql`, `scripts/db/local-open-launch-gate.sh`), as they already open the launch gate. Never installed on staging or Production.
* **First touch:** the first registration link a browser opens is kept for seven days and used even if another link is opened later.
* **Nothing is rewarded yet.** Referral attribution is recorded; Connection Points arrive with IP-6.
