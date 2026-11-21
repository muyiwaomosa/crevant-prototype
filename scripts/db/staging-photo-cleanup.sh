#!/usr/bin/env bash
# The "Photo cleanup schedule on staging" workflow's only database step.
# MODE (from the workflow's dropdown):
#   verify  (default) Read only: the cleanup job and its runs, each run
#           matched to the drain function's own record of its pass.
#   apply   Needs CONFIRM_PHRASE = SCHEDULE THE STAGING PHOTO CLEANUP.
#           Replaces the pg_net cleanup job with the http one (one
#           transaction, scripts/db/staging-schedule-media-drain.sql), checks
#           it was replaced and not duplicated, then waits for the first
#           scheduled run and verifies it end to end. If the replacement
#           committed but that run can't be verified, it says so: the new job
#           stays installed (not rolled back) and the run fails.
#   remove  Pause: needs CONFIRM_PHRASE = UNSCHEDULE THE STAGING PHOTO CLEANUP.
#           Unschedules only the cleanup job (never a job that isn't it), and
#           checks every other cron job is untouched. Manual cleanup (Run
#           cleanup now) keeps working without it.
# Nothing here removes pg_net (scripts/db/staging-pgnet-removal.sh, a
# separate workflow) or restores the old pg_net job. Shared protections:
# scripts/db/staging-photo-cleanup-lib.sh. Tested by
# scripts/db/staging-photo-cleanup-test.sh.
set -euo pipefail
cd "$(dirname "$0")/../.."
# shellcheck source=scripts/db/staging-photo-cleanup-lib.sh
. scripts/db/staging-photo-cleanup-lib.sh

SCRIPT=scripts/db/staging-schedule-media-drain.sql
# sha256 of the reviewed scheduler script (PR #85). Changing the script needs
# a reviewed change to this line too.
SCRIPT_SHA256=33ad800a2b9c27db7b3d22bfb3416cdefc8554a74c94d13adfe9fac80666484d
APPLY_PHRASE='SCHEDULE THE STAGING PHOTO CLEANUP'
PAUSE_PHRASE='UNSCHEDULE THE STAGING PHOTO CLEANUP'

MODE="${MODE:-verify}"
case "$MODE" in verify|apply|remove) ;; *) fail "mode must be verify, apply or remove." ;; esac
[ "$MODE" != apply ] || [ "${CONFIRM_PHRASE:-}" = "$APPLY_PHRASE" ] || fail "apply needs the confirmation phrase: $APPLY_PHRASE"
[ "$MODE" != remove ] || [ "${CONFIRM_PHRASE:-}" = "$PAUSE_PHRASE" ] || fail "remove (pause) needs the confirmation phrase: $PAUSE_PHRASE"
guard $# "$SCRIPT" "$SCRIPT_SHA256"
echo "Mode: $MODE"

# Runs the reviewed script with a fixed mode and phrase. Only a local test may
# point it at a local drain address.
run_script() {
  local url
  url=$(local_setting SCHEDULE_TEST_DRAIN_URL)
  if [ -n "$url" ]; then
    psql "$STAGING_DATABASE_URL" -X -q -v ON_ERROR_STOP=1 -v mode="$1" -v confirm="$2" -v drain_url="$url" -f "$SCRIPT" 2>&1
  else
    psql "$STAGING_DATABASE_URL" -X -q -v ON_ERROR_STOP=1 -v mode="$1" -v confirm="$2" -f "$SCRIPT" 2>&1
  fi
}

IFS='|' read -r JOBS JOBID METHOD SCHEDULE ACTIVE OTHERS <<<"$(job_state)" || fail "could not read the cron jobs."
echo "Cleanup job now: $JOBS job(s) named post-media-drain; method ${METHOD:-none}, schedule ${SCHEDULE:-none}, active ${ACTIVE:-none}; other jobs calling the drain: $OTHERS"
[ "$OTHERS" = 0 ] || fail "another cron job calls the drain, so runs can't be attributed. Stop and investigate. Nothing changed."
[ "$JOBS" -le 1 ] || fail "$JOBS jobs are named post-media-drain. Stop and investigate. Nothing changed."

RESTART_HINT="To start a clean history once the cause is fixed: pause (remove), then apply, which installs a fresh http job (a new id). The old pg_net job is never restored."
# The verify verdict for the http job (used by verify, and by apply when the
# job is already installed, so neither can pass an unverified job).
http_verdict() {
  report_runs
  [ "$UNATTRIBUTED" = 0 ] || fail "UNVERIFIED: $UNATTRIBUTED drain pass(es) match no run of this job, or runs were recorded under another command, so runs can't be reliably attributed. Stop and investigate. $RESTART_HINT"
  [ "$LATEST" != none ] || fail "UNVERIFIED: the http job has no finished run yet. Run verify again after the next quarter hour."
  [ "$SCHEDULE" = '*/15 * * * *' ] && [ "$ACTIVE" = true ] || fail "UNVERIFIED: the http job is not active every 15 minutes."
  [ "$FAILED_RUNS" = 0 ] && [ "$UNMATCHED_OK_RUNS" = 0 ] || fail "UNVERIFIED: since the replacement, $FAILED_RUNS run(s) failed and $UNMATCHED_OK_RUNS succeeded without exactly one matching drain pass. $RESTART_HINT"
  echo "Verdict: VERIFIED. $VERIFIED_IN_A_ROW consecutive verified run(s), none failed since the replacement. Nothing changed."
}

# --- verify -----------------------------------------------------------------
if [ "$MODE" = verify ]; then
  [ "$JOBS" = 1 ] || fail "UNVERIFIED: no cleanup job is scheduled (paused or never applied)."
  if [ "$METHOD" = pg_net ]; then
    report_runs
    echo "Verdict: the old pg_net job is still in place (not yet replaced). Its runs only queue a request, so they can't be verified this way. Nothing changed."
    exit 0
  fi
  [ "$METHOD" = http ] || fail "UNVERIFIED: the cleanup job is neither the http nor the pg_net job."
  http_verdict
  exit 0
fi

# --- remove (pause) -----------------------------------------------------------
if [ "$MODE" = remove ]; then
  before=$(fingerprint) || fail "could not read the cron jobs before pausing."
  show "Before pausing (cron commands shown as md5 only):" "$before"
  set +e; out=$(run_script remove "$PAUSE_PHRASE"); code=$?; set -e
  sed 's/^/  /' <<<"$out"
  after=$(fingerprint) || fail "could not read the cron jobs after pausing."
  show "After pausing:" "$after"
  [ "$(others "$before")" = "$(others "$after")" ] || fail "something other than the cleanup job changed. Stop and investigate."
  [ $code -eq 0 ] || fail "the pause was refused (exit $code); see above. Nothing changed."
  grep -q '^job|[0-9]*|post-media-drain|' <<<"$after" && fail "the cleanup job is still scheduled."
  echo "Paused: the cleanup job is unscheduled; every other cron job and extension is untouched."
  echo "Queued deletions wait safely. Moderation > Photo storage > Run cleanup now still works by hand. To resume, run apply."
  exit 0
fi

# --- apply --------------------------------------------------------------------
if [ "$METHOD" = http ]; then
  # Never replaces an installed http job, and only succeeds if it is verified.
  echo "Already applied: the cleanup job already uses the http extension. Nothing changed. Its verification:"
  http_verdict
  exit 0
fi
# Two starting points only: staging today (one active pg_net job), or paused
# (no cleanup job, e.g. after remove, before or after pg_net's removal).
if [ "$JOBS" = 0 ]; then
  echo "No cleanup job is scheduled (paused): apply installs a fresh http job."
else
  [ "$JOBS" = 1 ] && [ "$METHOD" = pg_net ] && [ "$ACTIVE" = true ] \
    || fail "apply expects one active pg_net cleanup job or a paused cleanup (none scheduled). Nothing changed."
fi
boundary_wait
running_wait
before=$(fingerprint) || fail "could not read the cron jobs before applying."
show "Before (cron commands shown as md5 only):" "$before"
set +e; out=$(run_script apply "$APPLY_PHRASE"); code=$?; set -e
sed 's/^/  /' <<<"$out"
after=$(fingerprint) || fail "could not read the cron jobs after applying. The replacement may or may not have committed: run verify."
show "After:" "$after"
if [ $code -ne 0 ]; then
  [ "$before" = "$after" ] && fail "the scheduler script refused (exit $code); see above. Nothing changed."
  fail "the scheduler script failed (exit $code) and the jobs differ from before. Stop and run verify before anything else."
fi

# Replaced, not duplicated.
IFS='|' read -r JOBS NEWID METHOD SCHEDULE ACTIVE OTHERS <<<"$(job_state)"
problems=()
[ "$JOBS" = 1 ] || problems+=("$JOBS jobs are named post-media-drain (expected exactly one)")
[ "$METHOD" = http ] || problems+=("the cleanup job's method is ${METHOD:-none}, not http")
[ "$SCHEDULE" = '*/15 * * * *' ] && [ "$ACTIVE" = true ] || problems+=("the cleanup job is not active every 15 minutes")
[ "$NEWID" != "$JOBID" ] || problems+=("the job id did not change, so the old job wasn't replaced")
[ "$OTHERS" = 0 ] || problems+=("$OTHERS other job(s) call the drain")
grep -q '|post-media-drain|.*|pg_net$' <<<"$after" && problems+=("a pg_net cleanup job is still scheduled")
grep -q '^extension|http|.*|extensions$' <<<"$after" || problems+=("the http extension is not installed in extensions")
[ "$(grep -c '^extension|pg_net|' <<<"$before")" = "$(grep -c '^extension|pg_net|' <<<"$after")" ] || problems+=("pg_net was installed or removed, which apply must never do")
[ "$(others "$before" | grep -v '^extension|http|')" = "$(others "$after" | grep -v '^extension|http|')" ] || problems+=("another cron job or extension changed")
if [ ${#problems[@]} -gt 0 ]; then
  printf '  problem: %s\n' "${problems[@]}"
  fail "INSTALLED BUT NOT AS EXPECTED: the replacement COMMITTED (it is not rolled back), but the checks above failed. Stop: pause it if needed, and investigate."
fi
if [ -n "$JOBID" ]; then
  echo "Replaced, not duplicated: job $JOBID (pg_net) is gone; job $NEWID (http, every 15 minutes, active) is the only cleanup job."
else
  echo "Installed: job $NEWID (http, every 15 minutes, active) is the only cleanup job."
fi
grep -q '^extension|pg_net|' <<<"$after" && echo "pg_net is still installed (unchanged)." || echo "pg_net is not installed (unchanged)."


# Wait for the first scheduled run and verify it end to end.
interval=$(local_setting SCHEDULE_TEST_INTERVAL)
if [ -n "$interval" ]; then
  "${PSQL[@]}" -c "select cron.alter_job($NEWID, schedule := '$interval')" >/dev/null
fi
wait_max=$(local_setting SCHEDULE_TEST_WAIT_MAX); wait_max=${wait_max:-1080}
step=15; [ "$LOCAL_TEST" = true ] && step=1
echo "Waiting for the first scheduled run (up to $((wait_max / 60)) minutes)..."
finished=''
for _ in $(seq 1 $((wait_max / step))); do
  finished=$(q "select count(*) from cron.job_run_details where jobid = $NEWID and status in ('succeeded', 'failed') and end_time is not null") || true
  [ -n "$finished" ] && [ "$finished" != 0 ] && break
  sleep "$step"
done
[ -n "$interval" ] && "${PSQL[@]}" -c "select cron.alter_job($NEWID, schedule := '*/15 * * * *')" >/dev/null
unverified() { fail "INSTALLED BUT UNVERIFIED: the http cleanup job is COMMITTED and scheduled (not rolled back), but $1. Next: fix the cause, then pause (remove) and apply again for a fresh job; verify alone can't clear a failed first run. The old pg_net job is never restored."; }
[ -n "$finished" ] && [ "$finished" != 0 ] || unverified "no run finished within $((wait_max / 60)) minutes"
report_runs
[ "$UNATTRIBUTED" = 0 ] || unverified "$UNATTRIBUTED drain pass(es) match no run of this job, or runs were recorded under another command, so the run can't be reliably attributed"
[ "$LATEST" = succeeded ] || unverified "its first run failed (see above)"
[ "$VERIFIED_IN_A_ROW" -ge 1 ] || unverified "its first run succeeded without exactly one matching drain pass"
echo "Verdict: APPLIED AND VERIFIED. The first scheduled run reached the drain function and completed a pass."
echo "Removing pg_net (if still installed) is a separate workflow, after at least two consecutive verified runs."
