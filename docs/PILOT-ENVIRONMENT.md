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
configuration, and the pinned build command), `src/entry.test.ts` (the
address rules), `src/public/member-host.test.tsx` (member pages only on the
member address), and the existing build, guard, Supabase target and header
tests, which are unchanged.

### The build command is pinned

`vercel.json` sets `"buildCommand": "npm run build"`. Vercel documents that
this overrides the Build Command in a project's dashboard settings, so a
dashboard change can't skip the checks above. `vercel.json` is shared by
every Vercel project that builds `main`:

* **Frozen demo (Production):** unaffected. It builds the `demo` branch,
  whose own `vercel.json` has no build command.
* **Demo project Previews and the public site project:** the repository
  records `npm run build` as the build command they use (README: Vercel's
  detected defaults; `docs/PUBLIC-SITE.md`: "no build command change"). In
  the splitpost project, `npm run build` and `npm run build:site` produce the
  same public site build, because the build identifies that project.
* **Dependency before merging:** the dashboards themselves can't be read
  from the repository. Before this is merged, check Settings, Build and
  Deployment, Build Command in both the `splitpost` and `crevant-prototype`
  projects: the Override toggle should be off, or set to `npm run build` (or
  `npm run build:site` in `splitpost`). If either shows anything else, stop
  and review before merging. The Previews of this pull request in both
  projects are a first signal: they build with the pinned command.

### Promoting a Preview, rollbacks and uploads

| Action | What happens | Control |
|---|---|---|
| Promote a Preview to Production | Vercel documents a **complete rebuild with Production environment variables**, so the guards run and refuse it (a Preview is never a build of `main`). **Expected behaviour, not yet verified on `splitpost-app`.** | Technical (the guards), pending the verification test below |
| Roll back, or re-promote an older Production deployment | No rebuild; that deployment already passed the guards when it was built from `main` | Procedure: know which deployment you are returning to |
| Upload a prebuilt bundle from the command line (`vercel deploy --prebuilt --prod`) | No build runs, so no checks run | Access: the founder is the only team member, with two-factor sign in, and no Vercel token exists in GitHub, CI or anywhere else. Recommended go-live control: a Git-only Deployment Policy (below) |
| Change the Build Command in the dashboard | Overridden by `vercel.json` (pinned above) | Technical |
| Change Production environment variables | The approval switch is meant to be changed this way | Access: founder only |

**Don't promote Previews in the member app project.** Go-live happens only
by merging to `main` with `CREVANT_MEMBER_APP_APPROVED=true` set.

### Promotion verification test (future; needs the founder's approval)

Run once, after the `splitpost-app` project exists and before go-live:

1. Push a throwaway branch with no meaningful changes (for example
   `verify/promotion-guard`), so Vercel builds a Preview in `splitpost-app`.
2. In Vercel, open that Preview and choose **Promote**.
3. **Expected:** the promotion's rebuild fails, with the guard's message
   that Production builds only `main`, and `app.splitpost.ca` keeps serving
   what it served before.
4. Record the result here, delete the branch and the failed deployment, and
   replace "expected behaviour" above with "verified on <date>".
5. If the promotion succeeds instead, stop: don't go live, and treat
   promotion as an unguarded path (access controls and a Git-only policy
   become mandatory).

### Recommended go-live control: Git-only Production deployments

Vercel's **Deployment Policies** can restrict which sources may create
deployments, per environment (for example: Production only from Git, never
from the command line or deploy hooks). Vercel documents them for Pro and
Enterprise teams, editable by Owners only. Recommended before go-live,
**subject to confirming availability on our plan**. Not enabled yet.

## The member app only shows member pages, on every address

A **member app build** (any build in the `splitpost-app` project) serves only
the member experience on **every address it is served from**: its protected
Vercel Previews, the project's own `.vercel.app` address and
`app.splitpost.ca`. A Preview therefore shows exactly what members will see.
`scripts/build.mjs` always sets `CREVANT_MEMBER_APP_BUILD` itself (`"true"`
only for that project, never taken from project settings), `vite.config.ts`
compiles it in and writes a marker into the page, and
`scripts/check-member-app-bundle.mjs` fails the build if the marker is
missing. The public site build never sets it, and its bundle check refuses
the marker. Any other full app build shows member-only pages on
`app.splitpost.ca` only, as before.

On those addresses the app serves only the member experience
(`src/public/PublicApp.tsx`, `MemberHostRoutes`):

* sign in, password reset, the invitation link (scanner-safe, unchanged),
  setting a password, the account page, the privacy notice (`/privacy`) and
  the members area (`/app`);
* every other path, **including client-side navigation** (the landing page,
  the waitlist, the pilot access page, anything unknown), goes to `/app`,
  which asks a signed-out visitor to sign in, with no redirect loop;
* its own layout (`src/public/MemberHostLayout.tsx`): the logo goes to
  `/app`; no marketing or waitlist links; a footer link to the privacy notice
  and one labelled link, **Splitpost website**, to `https://www.splitpost.ca`.

Previews of the other projects and local full app builds still serve every
page. The public site build never
includes any of this (it doesn't use `PublicApp`), and its bundle check
proves it carries no member route.

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

0. Before merging this pull request: confirm the Build Command setting in
   the `splitpost` and `crevant-prototype` projects (see "The build command
   is pinned").
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
6. With approval: run the promotion verification test (above).
7. Recommended before go-live, if the plan offers it: a Deployment Policy
   allowing Production deployments from Git only.
8. Keep the founder as the only team member, with two-factor sign in; create
   no Vercel tokens.

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
