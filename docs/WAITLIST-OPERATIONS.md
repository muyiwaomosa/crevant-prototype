# Waitlist operations

How to run the waitlist day to day: the overview, invitation waves, retention, monitoring and emergency shutdown. Design and activation: `docs/WAITLIST.md`.

Everything here goes through the restricted logins from B2. The **Waitlist admin (staging)** workflow uses `waitlist_admin`, which can call the `waitlist_api.admin_*` entry points and nothing else. Every action needs your approval of the `staging` environment and prints counts only. Nothing here sends an email, sends an invitation or creates an account.

## Setup at activation (each needs approval)

| What | Where | Value |
|---|---|---|
| `WAITLIST_ADMIN_DATABASE_URL` | GitHub, `staging` environment secret | `postgresql://waitlist_admin.kpudeppgokpjhvaqrprn:<password>@<pooler host>:5432/postgres`. Session pooler, port 5432. Only `waitlist_admin` is accepted. |
| `WAITLIST_HEALTH_ENABLED` | GitHub repository variable | `true` turns on the daily health check |
| `WAITLIST_FUNCTION_URL` | GitHub repository variable | `https://kpudeppgokpjhvaqrprn.supabase.co/functions/v1/join-waitlist` |
| `WAITLIST_SITE_ORIGIN` | GitHub repository variable | the public site origin, e.g. `https://crevant.example` |
| `WAITLIST_EXPECTED_STATE` | GitHub repository variable | `closed` until launch, then `open` |

None of these exist yet. Until they do, the daily health check skips itself, and the admin workflow stops at the target check.

## Overview

Run the workflow with **summary**. It shows:
* the total, verified and unverified counts
* signups in the last 24 hours and the last 7 days
* counts by source and by "shares content"
* the participant groups (overlapping, plus "none answered")
* counts by status and by wave
* the switch and the notice version

It shows no addresses, names or IDs. **status** shows just the switch and the notice version.

## Invitation waves (preparation only, verified addresses only)

Waves pick people. They don't invite anyone, and nothing here sends anything.

**Only verified addresses can enter a wave.** This is enforced twice:
* the wave actions pick verified entries only
* the selections table refuses an unverified entry, whoever writes it

Unverified registrations still appear in the summary counts.

**Required dependency: email verification.** Waves can't be used until email verification is built, reviewed and approved (a separate change, which needs an email provider). Until then nobody is eligible, so waves stay empty.

1. **wave-preview:** set the group (`any`, `active_creator`, `aspiring_creator` or `supporter`). It shows how many verified entries are eligible, and, for information only, how many unverified entries in that group can't be picked. "Eligible" means verified with status `new`: not yet shortlisted, invited or not selected.
2. **wave-select:** set the wave name (e.g. `wave_1`), the group, the reasons (`group_balance`, `targeted_feedback` or `both`) and a count from 1 to 100.
   * It picks the earliest verified signups first, records the reasons and marks those entries shortlisted.
   * Nobody is picked twice.
3. **wave-summary:** counts for the wave by group, reason and verification.
4. **wave-clear:** undoes a wave. Entries in no other wave go back to `new`, and anyone already invited is left alone.

## Retention and deletion

* **Monthly purge, by hand.** On the first working day of each month, run **purge** with `retention_months` 12 and approve it. There's no scheduled deletion.
  * The purge removes entries whose last *verified* confirmation, or failing that their signup, is over 12 months old.
  * Their selections, consent records and unaccepted invitations go with them.
  * A repeat signup never extends anyone's retention.
  * Running it late is safe: it removes everything past 12 months at that moment.
* **Delete on request:**
  1. Confirm the request came from the address's own inbox.
  2. Find the waitlist ID in the Supabase dashboard (Table editor, `ops.waitlist`).
  3. Run **delete** with that ID. Never type an email address into GitHub.
  4. Reply within 30 days.

### Automating the monthly purge after launch (needs a decision; not built)

The admin workflow can't safely delete on a schedule without approval. Its `staging` environment needs a reviewer for every run. Removing the reviewer would also remove the approval from every other admin action (open, delete, waves), and the `waitlist_admin` login can do all of those.

The safe way to automate it would be:
1. **A third login, `waitlist_retention`,** that can call one function only: a purge fixed at 12 months. No other months, no deletion by ID, nothing else.
2. **A separate GitHub environment, `waitlist-retention`,** limited to `main`, with no reviewer, holding only that login's database URL.
3. **A monthly scheduled workflow** using only that environment, plus a monthly result line ("purged N entries").

Trade-offs:
* Deletion would happen without anyone approving each run. A mistake in the purge function would run unattended, but it's tested, it's fixed at 12 months, and it can only remove what the policy allows.
* One more stored credential, though narrower than any existing one.
* Its safety rests on branch protection on `main` (the workflow file can only change through a reviewed PR) and on the environment's `main` only rule.
* GitHub can delay or skip scheduled runs, and turns schedules off after 60 days without repository activity. A late run is still correct.

Recommendation: keep the manual monthly run at launch. Automate it this way only once branch protection is on, and only with your approval of the new login and environment.

## Monitoring

**The function's health response** (a GET request to the function):
* **Reveals nothing.** It answers only `{"status":"ok"}` or `{"status":"error"}`, with no CORS headers, and the same whatever the request contains. No error text, login, host, configuration, switch state or personal data. Problems are written only to the function's own logs, without the database URL.
* **Limits database load.** One function instance checks the database at most once every 30 seconds (every 10 after a failure), and simultaneous health requests share that one check. It's a bare `select 1` over the instance's single connection, which reads no data. The `waitlist_writer` login also has a statement timeout of 5 seconds and a cap of 20 connections for the whole role. Platform level request limits are Supabase's; this doesn't add a rate limit of its own.

**Daily health check** (`Waitlist health check` workflow, 19:23 UTC once `WAITLIST_HEALTH_ENABLED` is `true`, or run it by hand). It uses no secrets and submits nothing. It checks that:
1. the function answers, and its `waitlist_writer` database login connects (a GET request, which answers only `ok` or `error`)
2. the site's browser preflight is allowed
3. the function switch matches `WAITLIST_EXPECTED_STATE`

A failed run makes GitHub email you.

Limits of the health check:
* It can't see the database switch (use **status**).
* It runs at most daily, and GitHub can delay or skip scheduled runs.
* It checks from GitHub's network, not from visitors' networks.
* It doesn't solve Turnstile, so it can't prove a full signup works. The signup counts in **summary** show that.

**Function logs** (Supabase dashboard, Edge Functions, join-waitlist, Logs). One line per request: `{"event":"join","status":200,"result":"ok"}`, or `"event":"health"`. Never an email, address, IP or request body. If the database URL is wrong, a configuration line names the problem without the URL.

**Weekly:** run **summary**. Signups should be rising while the site has traffic, and the switch and notice version should be as expected.

### When the health check fails

| Failing check | Likely cause | What to do |
|---|---|---|
| health: did not answer | the function isn't deployed, or Supabase is down | check the Supabase status page and the function's deploy |
| health: database login could not connect | wrong `WAITLIST_DB_URL` password, pooler or certificate problem, or the project is paused | check the function logs' configuration line; reset the `waitlist_writer` password in both places; unpause the project |
| preflight: origin not allowed | `WAITLIST_ALLOWED_ORIGINS` or `WAITLIST_SITE_ORIGIN` is wrong | correct the secret or the variable |
| switch: unexpected state | someone changed `WAITLIST_FUNCTION_ENABLED`, or `WAITLIST_EXPECTED_STATE` is out of date | confirm which is right; close if in doubt |

In the function logs:
* many `"result":"error"` lines point to the database login or connection
* many `verification_failed` lines point to the Turnstile keys or hostnames
* many `notice_changed` lines mean the database notice version and `VITE_PRIVACY_NOTICE_VERSION` disagree
* a flood of `rate_limited` lines may be an attack, so close if needed

## Emergency shutdown

Use these in order. Any one of them stops new signups.

1. **Admin workflow, close.** It takes effect at once once you approve the staging run.
2. **If GitHub is unavailable, or the approval can't happen:**
   * Open the Supabase dashboard for the staging project `kpudeppgokpjhvaqrprn`, then the SQL editor.
   * Paste and run the whole of `scripts/db/emergency-close.sql`. It turns only the database switch off, changes nothing else, can be run more than once, and must show `submissions OFF`.
   * Or, in the Table editor, set `ops.settings`, row `waitlist_submissions`, `enabled` to `false`.
3. **Also turn the function off:** set the Edge Function secret `WAITLIST_FUNCTION_ENABLED` to `false`. The function then answers `closed` without touching the database.
4. **Hide the form:** remove `VITE_WAITLIST_FORM_ENABLED` in Vercel and redeploy, so `/join` shows "not open yet".
5. **Afterwards:** run **status**, set `WAITLIST_EXPECTED_STATE` to `closed`, and note what happened. Reopening needs the normal approved process: **open**, after the notice version is confirmed.

The emergency script is tested on every change:
* `supabase/tests-local/041_waitlist_operations.sql` runs it exactly as written
* `scripts/e2e/waitlist-edge.sh` runs it on Supabase's own database image while the function is live, and checks that signups are refused at once

## Branch protection (required before Production moves to the public site)

On GitHub, go to Settings, then Branches, and add a rule for `main`:
* require a pull request before merging
* require status checks to pass, all five of:
  * **App (types, unit tests, build, secret scan)**
  * **Database (migrations and separation checks)**
  * **Integration (real local Supabase)**, which includes the waitlist Edge runtime test
  * **Browser (sign-in journey on local Supabase)**
  * **Public site (site-only build and browser checks)**
* require branches to be up to date before merging
* don't allow bypassing the rules

The **Public site** check must be required before Production moves to the public site build, because it's what proves the public build holds no member code, keys or secrets.

## Staging rollback (staging only, not enabled)

If the waitlist migrations ever need to be applied to staging again from scratch, the **Waitlist rollback (staging)** workflow removes exactly what they created (`scripts/db/staging-rollback-waitlist.sql`). It is meant for staging before any real registration, never for Production, and it is **off**: it refuses to run until the founder approves using it and sets the staging environment variable `WAITLIST_ROLLBACK_ENABLED` to `true`. Remove that variable again afterwards.

**It refuses, changing nothing, if any of these exist:**
* registrations, consent records, selections or rate limit records
* a recorded privacy notice version, or submissions switched on
* anything in `ops.settings` besides the two waitlist switches
* a migration later than the waitlist ones, or a missing waitlist migration record
* anything extra in `waitlist_api`, or any object or function outside the list that depends on or mentions the waitlist
* anything the two login roles own, any privilege they hold outside `waitlist_api`, any role they belong to, or an open session as either of them

**How it works:**
* One transaction, with the waitlist tables locked, so nothing can be written between the checks and the drops.
* Every object is named in an inventory and dropped by its exact name. Nothing uses `CASCADE` or `DROP OWNED`, so if anything unexpected depends on an object, Postgres itself refuses and the whole transaction is undone.
* `check` (the default) runs every check *and every drop*, prints the inventory, then rolls it all back: a dry run that proves the real run would work.
* `apply` does the same and commits. It needs the typed phrase `DELETE THE STAGING WAITLIST`.
* Afterwards, the earlier migrations' objects (`ops.invitations`, `ops.admins`, profiles) are checked to be untouched, and the two waitlist migration records are removed, so the normal database workflow (`plan`, `apply`, `check`) can apply them again.

**Safeguards that don't depend on each other:** the enable variable; `main` only; the repository owner only; the typed project reference matching the staging project, the environment variable and the connection string (`scripts/db/verify-staging-target.sh`); full TLS certificate and hostname verification (`sslmode=verify-full`, which the connection string can't override); the shared queue with the database deploy workflow; and the staging environment's approval rule. The workflow does not assume that last one is configured (`docs/LAUNCH-RUNBOOK.md` explains how to check it).

**Tested** in CI against a local Supabase (`scripts/db/rollback-test.sh`): every refusal in both modes leaves everything unchanged, a clean dry run changes nothing, the removal leaves the earlier migrations intact, and the migrations then apply again cleanly and pass the staging checks.

**Before it could ever be used on staging (prerequisites, each needing approval):** confirm the staging session pooler's certificate verifies with `sslmode=verify-full` against the runner's system certificates (if not, the workflow fails closed; the fix is adding Supabase's public CA file in a reviewed PR), and confirm the GitHub environment settings.

## Still required before activation

The three hosted staging checks in `docs/WAITLIST.md` (pooler login, TLS certificate, proxy hop count) must pass on staging before any real signups.
