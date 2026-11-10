# Public launch runbook

Status: **preparation only.** Production still serves the frozen `demo` branch. Nothing here has been carried out. Every step marked ⚠️ needs the founder's explicit approval at the time.

## Authorized deployment paths

| Environment | The only authorized way to change it |
|---|---|
| **Production** (`crevant-prototype.vercel.app`) | **Before the approved switch:** none. It stays on the `demo` branch. **After the approved switch:** a commit merged into `main` through a reviewed PR with all five CI checks green, which Vercel then builds from Git with the Production environment variables. |
| **Previews** | Pushes to branches; Vercel builds them from Git. |

The Production build guard (`scripts/guard-build-target.mjs`) only runs when Vercel **builds** from Git. The following actions skip it, so they are **not authorized deployment paths**, and must never be used for Production:

* **"Promote to Production" on a Preview deployment** (Vercel dashboard). It reuses the Preview's build without rebuilding. The guard never runs, and the Preview's own environment values (staging addresses, the staging publishable key in a full-app Preview) would be served at the production address.
  * Every unapproved build still shows the demo at the production address (the runtime fallback in `src/entry.ts`), so the public site wouldn't appear.
  * But the frozen demo build would be replaced, and an old or wrong build would be live.
* **Prebuilt Production deployments from a computer** (`vercel deploy --prebuilt --prod`, or `vercel build` followed by a prebuilt deploy). The output is built on someone's machine and uploaded as is, so nothing in this repository checks it.
* **Any other Vercel CLI or API Production deploy** (`vercel --prod`, deploy hooks) that isn't the Git integration building `main` after the approved switch.

**Safeguards these rely on, since Vercel can't be made to refuse them from this repository:**
1. **Account control:** two-factor sign-in on the Vercel account. The founder is the only team member. No Vercel access tokens are created.
2. **This rule:** promotion and prebuilt deploys are not used. If one happens by mistake, treat it as an incident: use Vercel's Instant Rollback to the last authorized Production deployment, then check.
3. **A check after every Production change:** before the switch, `scripts/check-production-demo.sh` (the demo's fingerprint). After the switch, the equivalent public site check (to be added with the switch).
4. **Before launch:** check Vercel's official documentation for a setting that blocks Production deployments until GitHub checks pass ("deployment checks"), and decide whether to use it.

## Search indexing rule

* **Before indexing approval:** every page on every address is `noindex`.
  * The production address's `/` and `/join` get it from the **initial HTML** the server sends (`<meta name="robots" content="noindex">`, written at build time).
  * Every other page gets it from the `X-Robots-Tag: noindex` **header**.
* **After indexing approval** (`CREVANT_ALLOW_INDEXING=true` in Production): only `/` and `/join` on `crevant-prototype.vercel.app` may be indexed.
  * `vercel.json` sends the `noindex` header for every other path there: one rule, `/((?!join$).+)`, which covers `/tour`, `/privacy`, member paths, `/join/…`, `/index.html` and any unknown path.
  * Every other address (all Previews) gets the header on every path.
* `robots.txt` and the sitemap follow the same rule. The page script also sets `noindex` on other pages. **Neither is relied on**: the header and the initial HTML enforce the rule without JavaScript.

## Checking a Preview's headers (Chrome, no tools needed)

1. Open the Preview address from the Vercel comment on the PR, and sign in to Vercel if asked.
2. Press **F12** (or right-click the page and choose **Inspect**). Choose the **Network** tab.
3. Tick **Disable cache**, then press **Ctrl+R** to reload.
4. Click the **first row** in the list (the page itself). Choose **Headers**, then scroll to **Response Headers**.
5. Find **`x-robots-tag`**. On a Preview it must read **`noindex`**.
6. Repeat for `/join`, `/tour` and `/privacy`: type the path at the end of the address, press Enter, and repeat steps 4 and 5.
7. Optional: open `/robots.txt`. It must read `User-agent: *` and `Disallow: /`.

## Checking the GitHub `staging` environment (no tools needed)

The staging workflows (database deploy, waitlist admin, staging rollback) each have their own safeguards, and also run in the GitHub `staging` environment. Don't rely on the environment's approval rule until it has been checked here:

1. In the repository, open **Settings**, then **Environments**, then **staging**.
2. **Required reviewers** lists you. **Prevent self-review** is off: with one reviewer, turning it on would lock you out.
3. **Deployment branches and tags** is **Selected branches and tags**, with only `main`.
4. **Environment secrets** shows only `STAGING_DATABASE_URL` and `WAITLIST_ADMIN_DATABASE_URL` (names only; values are never shown). **Environment variables** shows `SUPABASE_PROJECT_REF`, and **not** `WAITLIST_ROLLBACK_ENABLED` (the staging rollback stays off).
5. Open **Settings**, then **Secrets and variables**, then **Actions**. **Repository secrets** must hold no database address: a repository secret would skip the environment's approval.
6. Open **Settings**, then **Actions**, then **General**. **Workflow permissions** is **Read repository contents**, and workflows from fork pull requests need approval.

## Steps to the public waitlist (each ⚠️ needs approval at the time)

1. ⚠️ Merge the reviewed launch preparation PRs.
2. ⚠️ Accounts, the Production Supabase project, credentials, migrations and the function: see `docs/WAITLIST.md`, the launch readiness plan, and the three mandatory hosted checks.
3. ⚠️ **Switch Production to the public site.** In Vercel, set `CREVANT_PRODUCTION_SITE_APPROVED=true` (Production only), then set Production Branch Tracking to `main`. Leave the form and indexing variables off. Then check:
   * the site serves the public build
   * all paths except `/` and `/join` send `x-robots-tag: noindex`
   * `/` and `/join` say `noindex` in the page source
4. ⚠️ Publish the approved privacy notice (a reviewed PR).
5. ⚠️ Allow indexing: `CREVANT_ALLOW_INDEXING=true`, then redeploy from Git. Check that only `/` and `/join` say `index, follow` and send no `noindex` header.
6. ⚠️ Open the waitlist: see `docs/WAITLIST.md`.

**Rollback** of steps 3 and 5: set Production Branch Tracking back to `demo` (or use Instant Rollback to the last demo deployment), and remove `CREVANT_ALLOW_INDEXING`.
