# Public site build

Status: **built and tested, not deployed.** Production still serves the frozen `demo` build. Moving Production to this build needs the founder's explicit approval and a separate reviewed change.

## What it is

`npm run build:site` builds only what public visitors should see:

* the landing page
* `/join` (the waitlist page, closed until activation)
* the sample tour under `/tour` (fictional data, already disclosed), with old prototype links redirecting into it

It has no member pages. Sign in, password reset, invitation confirmation, `/app` and account pages aren't in the files at all, and their addresses show the public "Page not found" page. The Supabase client library isn't included, and no Supabase project address or key is.

`npm run build` still builds the full app for Previews and local work, unchanged.

## How it stays separate

1. **Its own entry point.** `src/site/main.tsx` uses `SiteApp`, which imports only public pages. Both builds start through `src/boot.tsx`, so they handle every address the same way, including the production demo address fallback.
2. **Member links removed at build time.** Shared pages (`PublicLayout`, the landing hero) only show "Sign in" in the full app. The site build removes those links entirely, not just hides them.
3. **Supabase settings removed.** The site build deletes `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` before Vite reads them, whatever the build environment has set.
4. **The bundle check** (`scripts/check-site-bundle.mjs`) reads the finished files and fails the build on any of these:
   * the site marker missing
   * source maps
   * the Supabase client
   * Auth, Data, Storage or Realtime API paths
   * sign in or password code
   * member routes or member page text
   * a Supabase project address
   * a Supabase key or a JSON Web Token
   * a secret
5. **The secret scan** (`scripts/check-bundle-secrets.sh`) runs as well.
6. **The Production block stays.** `scripts/guard-build-target.mjs` still refuses every Production build, including this one, so Production can't change until a reviewed change says so.

## Tests

* `npm test`:
  * the site routes: no member links, member paths not found, `/join` redirects
  * the full app still linking to sign in
  * the bundle check, with every kind of planted content
  * the Content Security Policy
  * the build script keeping the Production block
* `scripts/e2e/public-site.sh` (also the **Public site** CI job): builds the site with made up Supabase settings present (they must not appear), then checks in Chromium on desktop and phone, with the real `vercel.json` security headers applied:
  * the security headers are really in force
  * the landing page and `/join` render with nothing to type into
  * every member path is "not found"
  * the tour works
  * no request goes to Supabase or any other outside service (fonts aside)
  * no console or Content Security Policy errors

## Content Security Policy

`vercel.json` allows scripts and frames from `https://challenges.cloudflare.com` only, for the waitlist's bot check (Cloudflare Turnstile). The only other outside sources are Google Fonts styles and fonts. `connect-src` still allows the staging Supabase project, for the full app on Preview and for the waitlist function later.

## Production safeguards (launch preparation)

Production still serves the frozen `demo` branch. These safeguards are in `main` so the later, approved switch is safe, and none of them can affect the demo, which has its own `package.json` and never runs them.

* **One build entry point.** `npm run build` (`scripts/build.mjs`) builds:
  * the full app everywhere, as before
  * the public site build for Vercel Production always, or for a Preview branch with `CREVANT_BUILD=site`
* **Two locks on Production.** A Production build of `main` fails unless it's the public site build **and** `CREVANT_PRODUCTION_SITE_APPROVED=true` is set in Vercel's Production environment variables. That variable is set only at the approved switch, together with moving Production Branch Tracking to `main`.
* **The demo stays protected.** Every build except an approved Production build still shows the demo at `crevant-prototype.vercel.app`, so promoting a Preview can't replace it.
* **Separate waitlist addresses.** Project references live in `config/supabase-projects.json`, where staging is set and **Production is `null`**.
  * A Preview or local build may only use the staging function.
  * A Production build may only use the Production function, and while it's `null`, any waitlist address fails the build (fail closed).
  * The Production bundle check refuses the staging project; other builds refuse the Production project once it's set.
* **Privacy gate.** `/privacy` says plainly that no notice is published and registrations aren't open. The form can't turn on unless an **approved** notice exists (`src/public/privacy/approved-notice.json` plus its text, added in a reviewed PR) whose version matches `VITE_PRIVACY_NOTICE_VERSION`, with the notice URL `/privacy`. A Production build with the form on and no approved notice (or a test notice) fails.
* **Search indexing.** Indexing is off everywhere unless an approved Production build also has `CREVANT_ALLOW_INDEXING=true`. Then only `/` and `/join` on `crevant-prototype.vercel.app` may be indexed.
  * `vercel.json` sends `noindex` on every other address (Previews, deployment addresses) and on `/tour`, `/privacy`, member paths and deeper paths of the production address.
  * The robots meta tag and `robots.txt` default to `noindex` and "disallow all".
  * The sitemap exists only once indexing is allowed.
* **Tests.** These run in the Public site CI job: an unapproved build at the production address still shows the demo, and an approved build shows the public site with only `/` and `/join` indexable. Unit and script tests cover the guards, endpoints, indexing and privacy gate.

To verify on a Preview once deployed: the response has `X-Robots-Tag: noindex` (the header rules use Vercel `has`/`missing` host conditions, which can only be confirmed on Vercel itself).

## Not done yet (each needs approval)

Moving Production to this build would need:

* Vercel Production Branch Tracking set to `main`, and `CREVANT_PRODUCTION_SITE_APPROVED=true` in Production variables (no build command change: `npm run build` chooses the site build itself)
* `scripts/check-production-demo.sh` changed to check for this build
* branch protection on `main`, with the **Public site** CI job as a required check (alongside App, Database, Integration and Browser)
* `CREVANT_ALLOW_INDEXING=true` in Production variables, at the separate indexing approval

The waitlist form works in this build without any Supabase key: it posts to the function address in `VITE_WAITLIST_ENDPOINT`. That address is the one Supabase address the bundle check allows. `scripts/e2e/public-site.sh` also builds the site with the form configured, and checks the bundle holds the function address and no key.
