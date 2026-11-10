# Waitlist operations

How to run the waitlist day to day: the overview, invitation waves, retention, monitoring and emergency shutdown. Design and activation: `docs/WAITLIST.md`.

Everything here goes through the restricted logins from B2. The **Waitlist admin (staging)** workflow uses `waitlist_admin`, which can call the `waitlist_api.admin_*` entry points and nothing else. Every action needs your approval of the `staging` environment and prints counts only. Nothing here sends an email, sends an invitation or creates an account.

## Setup at activation (each needs approval)

| What | Where | Value |
|---|---|---|
| `WAITLIST_ADMIN_DATABASE_URL` | GitHub, `staging` environment secret | `postgresql://waitlist_admin.kpudeppgokpjhvaqrprn:<password>@<pooler host>:5432/postgres`. Session pooler, port 5432. Only `waitlist_admin` is accepted. |
| `WAITLIST_SCHEDULE_ENABLED` | GitHub repository variable | `true` turns on the monthly retention run |
| `WAITLIST_HEALTH_ENABLED` | GitHub repository variable | `true` turns on the daily health check |
| `WAITLIST_FUNCTION_URL` | GitHub repository variable | `https://kpudeppgokpjhvaqrprn.supabase.co/functions/v1/join-waitlist` |
| `WAITLIST_SITE_ORIGIN` | GitHub repository variable | the public site origin, e.g. `https://crevant.example` |
| `WAITLIST_EXPECTED_STATE` | GitHub repository variable | `closed` until launch, then `open` |

None of these exist yet. Until they do, both scheduled jobs skip themselves, and the admin workflow stops at the target check.

## Overview

Run the workflow with **summary**. It shows:
* the total, verified and unverified counts
* signups in the last 24 hours and the last 7 days
* counts by source and by "shares content"
* the participant groups (overlapping, plus "none answered")
* counts by status and by wave
* the switch and the notice version

It shows no addresses, names or IDs. **status** shows just the switch and the notice version.

## Invitation waves (preparation only)

Waves pick people. They don't invite anyone: an invitation needs a verified address (enforced in the database), and nothing here sends anything.

1. **wave-preview:** set the group (`any`, `active_creator`, `aspiring_creator` or `supporter`). It shows how many entries are eligible, verified and unverified. "Eligible" means status `new`: not yet shortlisted, invited or not selected.
2. **wave-select:** set the wave name (e.g. `wave_1`), the group, the reasons (`group_balance`, `targeted_feedback` or `both`) and a count from 1 to 100.
   * It picks the earliest signups first, records the reasons and marks those entries shortlisted.
   * Nobody is picked twice.
   * Tick **verified_only** once verification exists.
3. **wave-summary:** counts for the wave by group, reason and verification.
4. **wave-clear:** undoes a wave. Entries in no other wave go back to `new`, and anyone already invited is left alone.

## Retention and deletion

* **Monthly purge.** Once `WAITLIST_SCHEDULE_ENABLED` is `true`, a run starts on the 3rd of each month at 15:41 UTC and applies the 12 month purge. It still waits for your approval.
  * The purge removes entries whose last *verified* confirmation, or failing that their signup, is over 12 months old.
  * Their selections, consent records and unaccepted invitations go with them.
  * A repeat signup never extends anyone's retention.
* **By hand:** run **purge** with `retention_months` (12).
* **Delete on request:**
  1. Confirm the request came from the address's own inbox.
  2. Find the waitlist ID in the Supabase dashboard (Table editor, `ops.waitlist`).
  3. Run **delete** with that ID. Never type an email address into GitHub.
  4. Reply within 30 days.

Limits of the monthly run:
* GitHub may start a scheduled run late, or skip it under heavy load.
* An unapproved run is cancelled after the approval window. Check the Actions tab after the 3rd.
* GitHub turns schedules off in repositories with no activity for 60 days.

## Monitoring

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

## Still required before activation

The three hosted staging checks in `docs/WAITLIST.md` (pooler login, TLS certificate, proxy hop count) must pass on staging before any real signups.
