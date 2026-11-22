# Edge Function deployment (Phase 1B-2)

How the member Edge Functions (`avatar`, `post-media`) are deployed to staging
and to member Production, verified, rolled back and, in an emergency, deleted.
`join-waitlist` keeps its own procedure (`docs/WAITLIST.md`) and is never
deployed by anything here.

**State: nothing has been deployed by these tools.** The member
Production project is recorded (`memberProduction` ref, name and region),
but no function is deployed there yet; the avatar deployment is deferred
for the founder-only launch; `postMediaFunctionApproved`
is false; the deployment ledger is empty.

## What protects what

| Safeguard | Where |
| --- | --- |
| Which projects a member function serves, and which browser origins may call it there | `supabase/functions/_shared/policy.ts`, with references only from `_shared/projects.ts` (generated from `config/supabase-projects.json`; CI fails if they differ) |
| join-waitlist never runs on member Production | its runtime guard (`waitlistProjectAllowed`): elsewhere than the waitlist project, staging or local Supabase it reads no secret and stays closed |
| Only approved, recorded commits are deployed | `scripts/functions/deploy.mjs`, on the founder's computer |
| Independent verification | `.github/workflows/verify-functions.yml` running `scripts/functions/verify.mjs` (no secrets) |
| Approval of a deployment, and rollback eligibility | `config/function-deployments.json`, changed only by a reviewed PR |
| An audit trail with operator and reason | `docs/function-evidence-log.md`, appended by the deploy script, committed by PR |

### Projects and origins

| Project | Served | Browser origins allowed |
| --- | --- | --- |
| staging (`kpudeppgokpjhvaqrprn`) | yes | the member app's Previews (`https://splitpost-app-*-crevant.vercel.app`) |
| member Production | only once its reference is set (and differs from staging and the waitlist project) | exactly `https://app.splitpost.ca` |
| local Supabase | yes | Previews and local browsers |
| the waitlist project, any other project, member Production while null | **no**: 503, no network call, no CORS grant | none |

Every other origin (the public site, `www`, the demo, the other
environment's origin, look-alikes, `null`) gets no CORS header at all: never a
wildcard, never credentials. CORS is not authorization: every route still
requires a signed-in session (401 otherwise), and the database then decides
membership (`no_pilot_access`), whatever the Origin. Note: the local Supabase
gateway adds its own `Access-Control-Allow-Origin: *`; hosted projects don't,
and the verifier fails on any wildcard.

Every response carries `X-Splitpost-Build`: `unstamped` in the repository,
`<commit>.<source digest>` in a deployed copy.

### Scope on member Production

* **avatar**: the default and only function deployable there.
* **post-media**: Production compatible and fully tested, but refused by the
  deploy script and the verifier while `postMediaFunctionApproved` is false in
  `config/member-production.json`. Changing that needs a reviewed PR (separate
  founder approval). It allows the deploy only: photo posting still needs
  `photosApproved`, and stays off in the database.
* **join-waitlist**: never. If it is ever found there, delete it (below).

### API keys (new keys first, legacy keys only as a fallback)

Supabase is retiring the legacy `anon` and `service_role` API keys (its
documentation says by the end of 2026). The member functions now read the
new **publishable** and **secret** keys, through
`supabase/functions/_shared/keys.ts`. No secret is created for this: hosted
Supabase provides these variables to every function.

| Kind | Read from, in order | Used for | Sent as |
| --- | --- | --- | --- |
| publishable | `SUPABASE_PUBLISHABLE_KEYS` (JSON, the key named `default`), `SUPABASE_PUBLISHABLE_KEY`, then the legacy `SUPABASE_ANON_KEY` | the caller's own Auth and database calls, only when the request carries no publishable key (the app always sends one) | `apikey`, with the caller's own token as `Authorization: Bearer` |
| secret | `SUPABASE_SECRET_KEYS` (JSON, `default`), `SUPABASE_SECRET_KEY`, then the legacy `SUPABASE_SERVICE_ROLE_KEY` | Storage and the service-only (`svc_*`) database steps, after the caller's checks pass | a new secret key on `apikey` **only** (it is not a JWT, and Supabase asks for it on `apikey`, not `Authorization`); the legacy JWT on both headers, as before |

* Only the key named `default` in a dictionary is used, so renaming or
  deleting the `default` secret key in the dashboard stops the function
  (503) unless the legacy key is still there. Adding other named keys
  changes nothing.
* A value of the wrong shape counts as missing (`sb_publishable_...`,
  `sb_secret_...`, or a JWT for the legacy keys). With no usable publishable
  key, or no usable secret key, the function refuses to run: 503
  `unavailable`, no network call. The verify workflow fails on any 503.
* At start-up each copy logs one line saying which **kind** of key it holds,
  for example `{"fn":"avatar","event":"keys","publishable":"new","secret":"new"}`
  (Edge Functions > Logs). It never logs a key. `"legacy"` there means the
  project is still on the fallback.
* Users are still verified by Supabase Auth (`/auth/v1/user`), not by
  checking JWTs locally. Project isolation, origins, `X-Splitpost-Build`,
  database-enforced membership and coded errors are unchanged.
* `keys.ts` is in `_shared/`, so it is part of every function's source digest
  (join-waitlist's too, which doesn't use it). Only the member functions'
  behaviour changes.

#### Rollout order (founder-approved, separate from the code change)

Merging the change deploys nothing. Each step below is a normal deploy with
`scripts/functions/deploy.mjs` and the verify workflow (above and below).

1. **Staging first.** Deploy `avatar`, then `post-media`, at the merged
   commit. Run **Verify Edge Functions** for each. In the staging dashboard,
   check each function's start-up log line says `"publishable":"new","secret":"new"`.
   Then the founder phone test (`docs/AVATARS.md`): upload, view and remove a
   profile picture; on staging, a photo post and its deletion (`docs/PHOTOS.md`).
   Record the versions in the ledger by PR, as usual.
2. **Then member Production** (`brfdqkondnnzsguailcc`), only once staging
   passed: `avatar` only (post-media stays refused while
   `postMediaFunctionApproved` is false). Verify, check the log line, record.
3. **Only then disable the legacy keys**, staging first, and repeat the
   checks on each project afterwards. Both projects still had their legacy
   keys in November 2026, so steps 1 and 2 don't depend on them. Disabling
   them is done in the dashboard (Settings > API Keys); check there that they
   can be re-enabled before relying on that, since Supabase is removing
   legacy keys altogether.
4. **After both projects run without legacy keys**, remove the fallback from
   `_shared/keys.ts` and its tests in a reviewed PR.

Rollback: while the legacy keys are enabled, rolling back to a commit from
before this change works as before. **Once a project's legacy keys are
disabled, every earlier commit answers 503 there**: its ledger entries are
no longer usable rollback targets, and a rollback must use a commit with
this change or later.

## Deploying

Prerequisites, on your own computer: `supabase login` (the token stays on your
machine), `gh auth login`, the pinned Supabase CLI (2.122.1), Node 22, and a
clean checkout of `main` at the commit to deploy.

For member Production also:

* `memberProduction.ref`, `.name` and `.region` set on main by a reviewed PR,
  all valid and consistent, with `_shared/projects.ts` regenerated in the same
  PR (`node scripts/functions/projects-sync.mjs --write`);
* the database activated (`docs/MEMBER-PRODUCTION.md`);
* a successful **member database `check` run** at the deploy commit, started
  by you, within the last 24 hours: its identity marker step must have passed.

```bash
node scripts/functions/deploy.mjs deploy --target member-production --function avatar --commit <full sha> --db-check-run <run id> --operator <your label> --confirm "DEPLOY avatar TO <ref>"
```

Staging is the same without `--db-check-run` (`--target staging`).

It refuses, calling nothing, unless all of these hold:

1. **The exact project.** The reference (and for member Production its name
   and region) comes from config on `origin/main`; it is not the waitlist
   project; and `supabase projects list` shows exactly one project with that
   reference, with that name and region.
2. **The phrase** names the function and the project: `DEPLOY <function> TO <ref>`.
3. **The commit** is a full SHA, is HEAD, is on `origin/main`, and the tree is
   clean; its own `projects.ts` names this project for this target.
4. **Identity evidence** (member Production): the database check run above,
   matched by its title (`member database check at <sha>`), commit, owner,
   success, the identity marker step and its age.
5. **Scope**: the function is allowed on that target; the project holds no
   unexpected function (delete it first).
6. **The pinned CLI** version.

Then it deploys a `git archive` export of exactly that commit, with only
`_shared/build-info.ts` stamped, using exactly
`supabase functions deploy avatar --project-ref <ref> --no-verify-jwt --use-api --workdir <export>` (or `post-media`, never any other name).
Never `--prune`, never without a function name, never any other flag (the
script refuses every option it doesn't know).

### Three separate results

| Result | Checked by | Pass means |
| --- | --- | --- |
| A. Deployment | the deploy script, after deploying | the function is listed ACTIVE, with a new version, the gateway JWT check off, and nothing unexpected beside it; and the public endpoint is then seen **serving exactly the new build** (`X-Splitpost-Build`), so the recorded deployment is the one answering, not only what the CLI reported. It records the CLI's version number and bundle hash (`ezbr_sha256`) |
| B. Endpoint behaviour | `verify-functions.yml` (independent, no secrets) | CORS for the approved origin only; no CORS header for any other origin, on preflight and POST; 401 without a session, with a malformed token, and from the approved origin (CORS grants nothing); the drain refuses without its key; no 503; `nosniff`; on member Production join-waitlist (and post-media unless approved) answer 404 |
| C. Deployed source | C1 (required): the deploy script downloads the deployed function and compares it **exactly** with the approved commit. C2: the verify workflow recomputes the digest from the commit and compares it with `X-Splitpost-Build` | C1 exact match; C2 equal |

**C1 is exact and required.** The expected files are exactly the ones the
deployed function is built from: its `index.ts` and every file it imports,
transitively (`importClosure` in `scripts/functions/source-digest.mjs`), as
exported and stamped. Every one must be in the download byte for byte; any
other downloaded file must be byte-identical to the commit too. A missing,
different or extra file, an empty download, or a download the CLI can't
perform all fail the deployment ("failed verification"). Whether
`supabase functions download` (CLI 2.122.1, `--use-api`) reproduces the
files exactly is confirmed in the disposable-project rehearsal; if it
doesn't, deployments fail closed until that is resolved in a reviewed change.

**Deployment version evidence.** The CLI's version number is recorded but
is self-reported by the founder's computer, so it is never trusted on its
own. The independent evidence is the build actually served: the verify
workflow, on GitHub's runner, records what it observed as a run annotation
(`Verified deployment: target, ref, function, mode, commit, observed_build`),
only when every check passed. A rollback requires that runner-observed
build to equal the ledger entry's build, for the same target, project,
function and commit.

### Deployment states

| From | Event | To |
| --- | --- | --- |
| not deployed | deploy passes every check, A passes | deployed, unverified |
| not deployed | a check fails | not deployed (nothing called) |
| deployed, unverified | A or C1 fails | failed verification |
| deployed, unverified | verify workflow (B, C2) passes at that commit and version | verified (evidence only) |
| verified | the founder records it in the ledger by reviewed PR | **approved** (the only live state; a rollback target) |
| failed verification | roll back to an approved deployment, or delete | deployed, unverified / deleted |
| approved | a newer approved commit is deployed, or a rollback | deployed, unverified |
| any | emergency delete, absence confirmed | deleted |
| deleted | a normal, approved deploy | deployed, unverified |
| post-media on member Production | while `postMediaFunctionApproved` is false | blocked |

### Verifying, then approving

1. Run **Verify Edge Functions** (Actions tab, main) with the target,
   function, mode `deployed`, `expected_commit` and `deployed_version` the
   deploy script printed. Its run title records all of them.
2. Only if it passes, add the deployment to `config/function-deployments.json`
   in a reviewed PR: target, ref, function, commit, version, build stamp,
   `approvedBy` (a label, never an email), `approvedAt`, `verifyRunId`, plus
   the evidence log rows. That merge is the founder's approval.

A passing verification alone authorizes nothing.

## Rollback

```bash
node scripts/functions/deploy.mjs rollback --target <t> --function <f> --commit <earlier sha> --db-check-run <run id> --operator <label> --reason "<why>" --confirm "ROLL BACK <f> ON <ref> TO <first 12 of sha>"
```

Accepted only when **both**: the commit has a founder-approved entry for
exactly this target, project, function and commit in the ledger **on main**;
and that entry's verification run succeeded, was yours, its title matches the
entry's target, function, commit and version exactly, and its one
runner-recorded "Verified deployment" annotation shows the same target,
project, function, commit and **observed build** as the entry. A ledger that fails
validation refuses every rollback. All deploy checks also apply (project
identity, phrase, a database check run at current main for member Production,
scope, CLI), and the export is of the rollback commit only. The result is
"deployed, unverified": run the verify workflow again, and record the new
version in the ledger by PR.

## Emergency deletion

```bash
node scripts/functions/deploy.mjs delete --target <t> --function <f> --operator <label> --reason "<why>" --confirm "DELETE <f> FROM <ref>"
```

It skips the commit, ledger and database checks on purpose (stopping a bad
function must be fast), but still requires the exact target, function and
phrase, checks the project's identity, and writes the operator and reason to
the evidence log **before** deleting. It then confirms with
`supabase functions list` that the function is gone (and records a failure if
not). join-waitlist may be deleted from member Production only. Afterwards run
the verify workflow in mode `removed` (404). Redeploying needs a normal,
approved deploy.

## Tests

* `supabase/functions/_shared/policy.test.ts`: every project and origin combination, the join-waitlist guard.
* `scripts/functions-deploy.test.mjs`: the deploy script on a throwaway repository with fake `supabase` and `gh`: every refusal (null or inconsistent member identity, the waitlist project, phrases, `--prune` and unknown flags, join-waitlist, commits, identity evidence missing, stale or mismatched, project name or region, unexpected functions, CLI version), post-deploy failures (JWT on, extra function, unchanged version, differing source), rollback authorization (no ledger entry, a verification that failed or doesn't match, a malformed ledger), and deletion (phrases, reason, operator, evidence first, absence).
* `scripts/e2e/functions-policy-edge.sh`: real Edge runtime copies as staging, a test member reference and refused projects; the verifier passes on correct deployments and catches an unstamped copy, another commit, changed source, a wildcard CORS copy and a refusing copy; join-waitlist answers exactly as main's version on the waitlist project and staging, and on member Production stays closed without reading a secret.
* `scripts/e2e/functions-policy-local.sh`: through the local gateway, a non-member is refused and an unauthenticated call gets 401 from any Origin, and a member is served the same from allowed and disallowed origins.
* `supabase/functions/_shared/keys.test.ts`: which key is chosen (new keys first, only `default`, the single-key variables, the legacy fallback, each kind on its own), malformed and missing values (no usable key), and how the secret key is sent (`apikey` only for a new key).
* `scripts/e2e/avatar-edge.sh` and `scripts/e2e/post-media-edge.sh`: the whole suite runs on a copy started with **only** the new keys, as hosted Supabase provides them; a copy with only the legacy keys still works (fallback); copies with no key, or with only a publishable key and malformed others, refuse to run (503, even the drain with its key); each copy's start-up line names the kind of key it holds, and no copy logs a key or anything shaped like one.
* `scripts/functions-workflows.test.mjs`: the verify workflow (owner only, no secrets or environment, its own queue, inputs through env only, no deploys), with deliberate breaks; references, approvals, the ledger and the cross-file agreements.

## Residual risks

* Your Supabase CLI login can deploy anything to any project your account can reach, by hand, `--prune` included. The script prevents mistakes, not a deliberate manual command.
* C1 (exact source comparison) is required; if the pinned CLI's download can't reproduce the files exactly, deployments fail closed until fixed (confirmed in the rehearsal).
* `X-Splitpost-Build` exposes the deployed commit and a source digest to any caller.
* Emergency deletion skips the approval and database checks by design.
* Rollback eligibility relies on GitHub run history (deleting old runs removes rollback targets) and on the ledger on main.
* API keys: the functions use the new publishable and secret keys, and fall back to the legacy keys only if no new key is present (see API keys above). That a secret key on `apikey` alone acts as `service_role` for Storage and PostgREST is proven on local Supabase (CLI 2.122.1) and follows Supabase's documentation, but on hosted Supabase it is proven only by the staging deploy and phone test (rollout step 1). If the `default` secret key is renamed, deleted or rotated without the legacy key, the functions answer 503 until it is back.
* The `app.splitpost.ca` CSP must allow the member project when its reference is set (same PR).
* No photo cleanup schedule on member Production while photos are off.
