# Edge Function deployment (Phase 1B-2)

How the member Edge Functions (`avatar`, `post-media`) are deployed to staging
and to member Production, verified, rolled back and, in an emergency, deleted.
`join-waitlist` keeps its own procedure (`docs/WAITLIST.md`) and is never
deployed by anything here.

**State at the end of 1B-2: nothing has been deployed by these tools.**
`memberProduction.ref`, `.name` and `.region` are null, so every member
Production deployment and verification refuses; `postMediaFunctionApproved`
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
| A. Deployment | the deploy script, after deploying | the function is listed ACTIVE, with a new version, the gateway JWT check off, and nothing unexpected beside it. It records the version and the bundle hash (`ezbr_sha256`) |
| B. Endpoint behaviour | `verify-functions.yml` (independent, no secrets) | CORS for the approved origin only; no CORS header for any other origin, on preflight and POST; 401 without a session, with a malformed token, and from the approved origin (CORS grants nothing); the drain refuses without its key; no 503; `nosniff`; on member Production join-waitlist (and post-media unless approved) answer 404 |
| C. Deployed source | C1: the deploy script downloads the function and compares every file with the export. C2: the verify workflow recomputes the digest from the commit and compares it with `X-Splitpost-Build` | C1 `match`; C2 equal |

The deploy script reports C1 as `match`, `differs` (a failure) or
`unavailable`. **Limitation:** whether `supabase functions download` (CLI
2.122.1, `--use-api`) returns byte-identical files can only be confirmed on
a real project; until the rehearsal shows it does, C1 `unavailable` is
expected and is never counted as a pass. C2 always runs: it proves which
commit and source the deployed code reports, which catches a wrong commit,
function or stale deploy, but not a deliberate forgery by someone with
deploy access. The recorded bundle hash lets a later `functions list` show
whether the function changed without a deploy.

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
and that entry's verification run succeeded, was yours, and its title matches
the entry's target, function, commit and version exactly. A ledger that fails
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
* `scripts/functions-workflows.test.mjs`: the verify workflow (owner only, no secrets or environment, its own queue, inputs through env only, no deploys), with deliberate breaks; references, approvals, the ledger and the cross-file agreements.

## Residual risks

* Your Supabase CLI login can deploy anything to any project your account can reach, by hand, `--prune` included. The script prevents mistakes, not a deliberate manual command.
* C1 source download fidelity is unconfirmed until the rehearsal; C2 is what the deployed code reports about itself.
* `X-Splitpost-Build` exposes the deployed commit and a source digest to any caller.
* Emergency deletion skips the approval and database checks by design.
* Rollback eligibility relies on GitHub run history (deleting old runs removes rollback targets) and on the ledger on main.
* The new project may not have legacy API keys; the functions would then answer 503 until updated in a reviewed change.
* The `app.splitpost.ca` CSP must allow the member project when its reference is set (same PR).
* No photo cleanup schedule on member Production while photos are off.
