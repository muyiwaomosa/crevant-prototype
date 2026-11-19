# Pilot environment (milestone M1)

The member app for invited pilot members runs at **app.splitpost.ca**. This
file records how that environment is put together, what protects it, and the
manual steps that must be completed (and approved) before real pilot members
are invited. Change it only in a reviewed pull request.

Nothing in this file has been applied to a hosted environment yet. Each
manual step below needs the founder's explicit approval at the time.

## The three addresses

| Address | Vercel project | What it serves | Supabase project |
|---|---|---|---|
| `www.splitpost.ca` | `splitpost` | The public site only (no sign in, no member code) | Production (waitlist only) |
| `app.splitpost.ca` | `splitpost-app` (to be created) | The member app: sign in, invitations, the members area | **Staging (the pilot database)** |
| `crevant-prototype.vercel.app` | `crevant-prototype` | The frozen demo (`demo` branch) | none |

The member app must never use the Production (waitlist) project, and the
public site must never contain member code. Both are enforced by the build,
not by convention.

## What protects the member app build (in code, this PR)

All of these fail closed: anything missing, unknown or unexpected stops the
build.

1. **Project identity** (`config/vercel-projects.json`, `scripts/vercel-project.mjs`).
   The member app project is recognised only by its exact Vercel project ID.
   That ID is `null` until the project exists; while it is `null`, no build
   is treated as the member app and its Production build is refused. If two
   projects are ever given the same ID, no project is recognised at all.
2. **Which build** (`scripts/build.mjs`). In the member app project every
   build (Preview and Production) is the member app, whatever else is set.
   The public site and demo projects keep their existing builds.
3. **Vercel Production guard** (`scripts/guard-build-target.mjs`). A member
   app Production build is allowed only when all of these hold: it is the
   member app build; `CREVANT_MEMBER_APP_APPROVED=true` is set in the member
   app project; the public site's approval variable is **not** set there;
   and Vercel built it from Git, `muyiwaomosa/crevant-prototype@main`. The
   public site and demo rules are unchanged.
4. **Supabase target, before the build** (`scripts/check-supabase-target.mjs`).
   In the member app project, Preview and Production alike, the build must
   use exactly the staging (pilot) project and a publishable key. The
   Production project, in any form, is refused; so are a local stack, any
   other project, a missing key, a secret or service key, and any waitlist
   address (members never use the waitlist form).
5. **The finished bundle, after the build** (`scripts/check-member-app-bundle.mjs`).
   The built files must point at the staging project, and must never contain
   the Production project reference, any other project, a waitlist address,
   or anything secret. Then the existing secret scan runs.
6. **The address itself** (`src/entry.ts`). On `app.splitpost.ca` only the
   member pages are served (`/app`, sign in, password reset, the invitation
   link, the privacy notice); every other path goes to `/app`. The
   invitation link's `#token_hash` is never touched by a redirect. Pages
   there are marked `noindex`.
7. **Headers** (`vercel.json`, unchanged). `app.splitpost.ca` already gets the
   security policy that allows connections only to this site and the staging
   project, the other security headers, and `X-Robots-Tag: noindex` on every
   path. Tests prove it (`scripts/member-app.test.mjs`).

Tests: `scripts/member-app.test.mjs` (every allowed and refused build
configuration), `src/entry.test.ts` (the address rules), and the existing
build, guard, Supabase target and header tests, which are unchanged.

Known limit, as for the public site: the build guard cannot stop **Promote to
Production** of an existing Preview, which reuses a build without running the
checks again. Never promote a Preview in the member app project.

## Database authorization audit (read only)

`scripts/db/audit/member-surface.sql` checks, from the system catalogs only
(no table rows, no personal data), exactly what a signed-in account or an
anonymous visitor can reach in the parts of the database this repository
owns:

1. exactly the 24 member functions are callable by signed-in accounts, and
   none by anonymous visitors;
2. each runs as its owner with an empty search path, and each except
   `app_me` checks the caller through `social.current_member()`;
3. anonymous visitors reach no tables; signed-in accounts reach only
   `public.profiles` (read, and update `username` and `display_name`);
4. `public.profiles` has row level security with only read-own and
   update-own policies;
5. the private schemas are closed, with row level security everywhere;
6. there are no storage buckets and no storage policies for members or
   visitors (until the photo and video workstream adds them).

It runs in a read only session and a read only transaction that is rolled
back. CI runs it against the throwaway database built from the migrations
(`scripts/db/test.sh`), and proves it catches nine deliberate violations
(`scripts/db/audit/violations/`).

It is deliberately **not** in `supabase/tests/`, because the staging deploy
workflow runs every file there against hosted staging. Running it against
hosted staging is a separate step that needs the founder's approval:

```bash
AUDIT_TARGET=staging EXPECTED_PROJECT_REF=kpudeppgokpjhvaqrprn \
SUPABASE_PROJECT_REF=kpudeppgokpjhvaqrprn CONFIRM_PROJECT_REF=kpudeppgokpjhvaqrprn \
STAGING_DATABASE_URL='(the staging connection string, never pasted into chat)' \
scripts/db/audit-member-surface.sh
```

The runner refuses Production outright, reuses the staging target checks
(project, TLS, typed confirmation), and prints only PASS and FAIL lines.

When milestone M3 (invitation security) changes the member functions, the
audit's allow-list changes in the same pull request.

## Manual steps (each needs the founder's approval when it is done)

### Vercel

1. Confirm the team's plan (Vercel, team settings, Billing). Vercel's terms
   allow Hobby for non-commercial use only; Pro is needed before real pilot
   members use the app.
2. Create the project **`splitpost-app`** from this repository, Production
   branch `main`, default build command (`npm run build`). Keep
   "Automatically expose System Environment Variables" on, so the build can
   identify the project.
3. Environment variables, for Production and Preview:
   * `VITE_SUPABASE_URL`: the staging project's address;
   * `VITE_SUPABASE_PUBLISHABLE_KEY`: the staging **publishable** key;
   * leave `CREVANT_MEMBER_APP_APPROVED` **unset** until go-live is approved;
   * never set `CREVANT_PRODUCTION_SITE_APPROVED` or `VITE_WAITLIST_ENDPOINT`
     in this project (the build refuses them).
4. Send the project's ID (Settings, General, Project ID; not a secret). It
   is recorded in `config/vercel-projects.json`, `memberApp.projectId`, in a
   reviewed pull request. Until then every Production build there is refused.
5. After DNS: add the domain `app.splitpost.ca` to this project.

### DNS

1. Confirm where `splitpost.ca`'s DNS is hosted.
2. Add the record Vercel shows when the domain is added (normally a CNAME
   for `app`). Nothing else changes for `www`.
3. The email records for `mail.splitpost.ca` come in milestone M2, not here.

### Supabase (staging project, the pilot database)

1. Confirm the organization's plan and that Database, Backups lists a
   backup. Pro (or above) is required before real pilot members: the Free
   plan has no restorable backups and pauses inactive projects.
2. Authentication, URL configuration:
   * Site URL: `https://app.splitpost.ca`;
   * Redirect URLs: `https://app.splitpost.ca/auth/confirm`.
3. Authentication settings:
   * new user sign-ups: **off**;
   * confirm email: **on**;
   * minimum password length: **10**;
   * email link (OTP) expiry: **86400** seconds (24 hours; this also applies
     to password reset links).
4. Check that the invite and recovery email templates use the scanner-safe
   link format `{{ .SiteURL }}/auth/confirm#token_hash={{ .TokenHash }}&type=...`
   (see `supabase/templates/`). The approved wording comes in milestone M2.
5. Organization members: the founder only, with multi-factor authentication.

### Data protection for the pilot database

From the first real invitation, the staging project holds real people's
accounts and is treated as live:

* no `db reset`, no deleting the project, and no destructive migration
  without the founder's explicit approval and a backup from the same day;
* migrations only through the existing approved workflow (checksums,
  plan, then apply);
* the service role key only in server-side function settings, never in the
  browser, the repository or GitHub;
* deletion requests and retention follow the decisions recorded before
  launch (milestone planning).

## M1 is complete when

* CI is green on this pull request;
* the member app project exists, its ID is recorded, and a Preview builds
  against staging while Production stays refused;
* every Supabase setting above is confirmed;
* a staging backup is listed (once on a paid plan);
* the read only audit passes against staging (with approval);
* `app.splitpost.ca` serves the member app, `noindex`, after go-live
  approval.

## Rollback

* Unset `CREVANT_MEMBER_APP_APPROVED` or remove the domain in Vercel: the
  address stops serving a new Production build.
* Revert the Supabase URL settings to their previous values.
* Revert this pull request: the guards return to refusing every member app
  Production build.
