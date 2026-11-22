#!/usr/bin/env bash
# The "Photo cleanup schedule on member Production" workflow's only database
# step. MEMBER PRODUCTION only (splitpost-members-production). The workflow
# has already checked the target (scripts/db/verify-members-target.sh) and the
# database identity marker (scripts/db/verify-members-identity.sh) before this
# connects.
# MODE (from the workflow's dropdown):
#   verify  (default) Read only: the cleanup job and its runs, each run
#           matched to the drain function's own record of its pass.
#   check   The scheduler script in check mode: everything in one
#           transaction, rolled back; the cron jobs and extensions must be
#           exactly as before.
#   apply   Needs CONFIRM_PHRASE = SCHEDULE THE MEMBER PRODUCTION PHOTO CLEANUP.
#           Installs the http cleanup job (scripts/db/members-schedule-media-drain.sql,
#           which also installs pg_cron and http if needed), checks exactly one
#           job exists, then waits for the first scheduled run and verifies it
#           end to end. If the job committed but that run can't be verified,
#           it says so: the job stays installed (not rolled back) and the run fails.
#   remove  Pause: needs CONFIRM_PHRASE = UNSCHEDULE THE MEMBER PRODUCTION PHOTO CLEANUP.
#           Unschedules only the cleanup job and checks every other cron job
#           is untouched. Manual cleanup (Run cleanup now) keeps working.
# Never installs pg_net (refused by the SQL script if it is present). Run
# attribution, waits and fingerprints are the staging workflow's, unchanged
# (scripts/db/staging-photo-cleanup-lib.sh); only the target guard differs.
# Tested by scripts/db/members-photo-cleanup-test.sh.
set -euo pipefail
cd "$(dirname "$0")/../.."
# shellcheck source=scripts/db/staging-photo-cleanup-lib.sh
. scripts/db/staging-photo-cleanup-lib.sh

SCRIPT=scripts/db/members-schedule-media-drain.sql
# sha256 of the reviewed scheduler script. Changing the script needs a
# reviewed change to this line too.
SCRIPT_SHA256=d834e620846265942ee393d4ce1fa4b8a7705ad941f1bbb8bdf5ff08aee0485c
APPLY_PHRASE='SCHEDULE THE MEMBER PRODUCTION PHOTO CLEANUP'
PAUSE_PHRASE='UNSCHEDULE THE MEMBER PRODUCTION PHOTO CLEANUP'

MODE="${MODE:-verify}"
case "$MODE" in verify|check|apply|remove) ;; *) fail "mode must be verify, check, apply or remove." ;; esac
[ "$MODE" != apply ] || [ "${CONFIRM_PHRASE:-}" = "$APPLY_PHRASE" ] || fail "apply needs the confirmation phrase: $APPLY_PHRASE"
[ "$MODE" != remove ] || [ "${CONFIRM_PHRASE:-}" = "$PAUSE_PHRASE" ] || fail "remove (pause) needs the confirmation phrase: $PAUSE_PHRASE"

# The member Production guard (the shared guard is staging's): main only, no
# arguments, the pinned script, a connection string, then verify-full TLS and
# the member target (both skipped only for a local test database).
members_guard() {
  [ "$1" -eq 0 ] || fail "this takes no arguments."
  [ "${GITHUB_REF:-}" = refs/heads/main ] || fail "runs only from the main branch."
  [ -f "$SCRIPT" ] || fail "$SCRIPT is missing."
  local actual
  actual=$(sha256sum "$SCRIPT" | cut -d' ' -f1)
  [ "$actual" = "$SCRIPT_SHA256" ] || fail "$SCRIPT does not match the reviewed checksum."
  echo "$SCRIPT matches the reviewed checksum ($SCRIPT_SHA256)."
  [ -n "${MEMBERS_PRODUCTION_DATABASE_URL:-}" ] || fail "MEMBERS_PRODUCTION_DATABASE_URL is not set."
  LOCAL_TEST=false
  if [ "${SCHEDULE_CHECK_LOCAL_TEST:-}" = 1 ]; then
    local host
    host=$(python3 -c 'import os; from urllib.parse import urlsplit; print((urlsplit(os.environ["MEMBERS_PRODUCTION_DATABASE_URL"]).hostname or "").lower())' 2>/dev/null || true)
    case "$host" in
      127.0.0.1|localhost) LOCAL_TEST=true ;;
      *) fail "the local test mode only accepts a local database." ;;
    esac
  fi
  if [ "$LOCAL_TEST" = true ]; then
    echo "Local test database: target and TLS checks skipped (local connection only)."
  else
    [ "${PGSSLMODE:-}" = verify-full ] && [ -f "${PGSSLROOTCERT:-/nonexistent}" ] && [ "${REQUIRE_VERIFY_FULL:-}" = 1 ] \
      || fail "full TLS verification (verify-full with the committed root certificate) is required."
    scripts/db/verify-members-target.sh || fail "the target is not the approved member Production project."
  fi
  PSQL=(psql "$MEMBERS_PRODUCTION_DATABASE_URL" -X -q -At -v ON_ERROR_STOP=1)
}
members_guard $#
echo "Mode: $MODE"

# Before the first apply, pg_cron may not be installed: then there is no job,
# nothing running, and the fingerprint lists only the extensions.
has_cron() { [ "$(q "select to_regclass('cron.job') is not null")" = t ]; }
eval "$(declare -f job_state | sed '1s/^job_state/shared_job_state/')"
eval "$(declare -f running | sed '1s/^running/shared_running/')"
job_state() { if has_cron; then shared_job_state; else echo '0|||||0'; fi; }
running() { if has_cron; then shared_running; else echo 0; fi; }
NO_CRON_FINGERPRINT_SQL="select 'extension|' || e.extname || '|' || e.extversion || '|' || n.nspname
from pg_catalog.pg_extension e join pg_catalog.pg_namespace n on n.oid = e.extnamespace order by e.extname;
select 'net schema|' || (pg_catalog.to_regnamespace('net') is not null)"
fingerprint() { if has_cron; then q "$FINGERPRINT_SQL"; else q "$NO_CRON_FINGERPRINT_SQL"; fi; }

# Runs the reviewed script with a fixed mode and phrase. Only a local test may
# point it at a local drain address.
run_script() {
  local url
  url=$(local_setting SCHEDULE_TEST_DRAIN_URL)
  if [ -n "$url" ]; then
    psql "$MEMBERS_PRODUCTION_DATABASE_URL" -X -q -v ON_ERROR_STOP=1 -v mode="$1" -v confirm="$2" -v drain_url="$url" -f "$SCRIPT" 2>&1
  else
    psql "$MEMBERS_PRODUCTION_DATABASE_URL" -X -q -v ON_ERROR_STOP=1 -v mode="$1" -v confirm="$2" -f "$SCRIPT" 2>&1
  fi
}

IFS='|' read -r JOBS JOBID METHOD SCHEDULE ACTIVE OTHERS <<<"$(job_state)" || fail "could not read the cron jobs."
echo "Cleanup job now: $JOBS job(s) named post-media-drain; method ${METHOD:-none}, schedule ${SCHEDULE:-none}, active ${ACTIVE:-none}; other jobs calling the drain: $OTHERS"
[ "$OTHERS" = 0 ] || fail "another cron job calls the drain, so runs can't be attributed. Stop and investigate. Nothing changed."
[ "$JOBS" -le 1 ] || fail "$JOBS jobs are named post-media-drain. Stop and investigate. Nothing changed."

RESTART_HINT="To start a clean history once the cause is fixed: pause (remove), then apply, which installs a fresh http job (a new id)."
http_verdict() {
  report_runs
  [ "$UNATTRIBUTED" = 0 ] || fail "UNVERIFIED: $UNATTRIBUTED drain pass(es) match no run of this job, or runs were recorded under another command, so runs can't be reliably attributed. Stop and investigate. $RESTART_HINT"
  [ "$LATEST" != none ] || fail "UNVERIFIED: the http job has no finished run yet. Run verify again after the next quarter hour."
  [ "$SCHEDULE" = '*/15 * * * *' ] && [ "$ACTIVE" = true ] || fail "UNVERIFIED: the http job is not active every 15 minutes."
  [ "$FAILED_RUNS" = 0 ] && [ "$UNMATCHED_OK_RUNS" = 0 ] || fail "UNVERIFIED: since it was installed, $FAILED_RUNS run(s) failed and $UNMATCHED_OK_RUNS succeeded without exactly one matching drain pass. $RESTART_HINT"
  echo "Verdict: VERIFIED. $VERIFIED_IN_A_ROW consecutive verified run(s), none failed since it was installed. Nothing changed."
}

# --- verify -----------------------------------------------------------------
if [ "$MODE" = verify ]; then
  [ "$JOBS" = 1 ] || fail "UNVERIFIED: no cleanup job is scheduled (paused or never applied)."
  [ "$METHOD" = http ] || fail "UNVERIFIED: the cleanup job is not the http job."
  http_verdict
  exit 0
fi

# --- check (rolled back) --------------------------------------------------------
if [ "$MODE" = check ]; then
  boundary_wait
  running_wait
  before=$(fingerprint) || fail "could not read the cron jobs and extensions before the check."
  show "Before the check (cron commands shown as md5 only):" "$before"
  echo "Running the scheduler script in check mode (one transaction, rolled back):"
  set +e; out=$(run_script check ''); code=$?; set -e
  sed 's/^/  /' <<<"$out"
  after=$(fingerprint) || fail "could not read the cron jobs and extensions after the check."
  show "After the check:" "$after"
  [ "$before" = "$after" ] || fail "the cron jobs or extensions changed: check mode must leave nothing behind. Stop and investigate."
  echo "No persistent change: the cron jobs and installed extensions are exactly as before."
  [ $code -eq 0 ] || fail "check mode did not complete (exit $code); see its output above. Nothing changed."
  grep -q '^Done:' <<<"$out" && fail "the script reported a committed change, which check mode must never do."
  grep -q '^Check only: the schedule could be created' <<<"$out" || fail "check mode did not report its rollback."
  rows=$(grep -cE '^ *post-media-drain *\|' <<<"$out" || true)
  [ "$rows" = 1 ] || fail "check mode showed $rows cleanup jobs, expected exactly one."
  grep -Eq '^ *post-media-drain *\| *\*/15 \* \* \* \* *\| *t *\| *http \(synchronous\)' <<<"$out" \
    || fail "the job check mode would create is not the 15 minute http job."
  echo "Check passed: the http schedule (every 15 minutes) could be installed, and everything was rolled back."
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
  echo "Already applied: the cleanup job already uses the http extension. Nothing changed. Its verification:"
  http_verdict
  exit 0
fi
[ "$JOBS" = 0 ] || fail "apply expects no cleanup job (never applied, or paused); a job named post-media-drain exists that is not the http job. Nothing changed."
echo "No cleanup job is scheduled: apply installs a fresh http job."
boundary_wait
running_wait
before=$(fingerprint) || fail "could not read the cron jobs before applying."
show "Before (cron commands shown as md5 only):" "$before"
set +e; out=$(run_script apply "$APPLY_PHRASE"); code=$?; set -e
sed 's/^/  /' <<<"$out"
after=$(fingerprint) || fail "could not read the cron jobs after applying. The job may or may not have committed: run verify."
show "After:" "$after"
if [ $code -ne 0 ]; then
  [ "$before" = "$after" ] && fail "the scheduler script refused (exit $code); see above. Nothing changed."
  fail "the scheduler script failed (exit $code) and the jobs differ from before. Stop and run verify before anything else."
fi

# Exactly one job, and nothing else changed (beyond pg_cron and http themselves).
IFS='|' read -r JOBS NEWID METHOD SCHEDULE ACTIVE OTHERS <<<"$(job_state)"
problems=()
[ "$JOBS" = 1 ] || problems+=("$JOBS jobs are named post-media-drain (expected exactly one)")
[ "$METHOD" = http ] || problems+=("the cleanup job's method is ${METHOD:-none}, not http")
[ "$SCHEDULE" = '*/15 * * * *' ] && [ "$ACTIVE" = true ] || problems+=("the cleanup job is not active every 15 minutes")
[ "$OTHERS" = 0 ] || problems+=("$OTHERS other job(s) call the drain")
grep -q '^extension|http|.*|extensions$' <<<"$after" || problems+=("the http extension is not installed in extensions")
grep -q '^extension|pg_cron|' <<<"$after" || problems+=("pg_cron is not installed")
grep -q '^extension|pg_net|' <<<"$after" && problems+=("pg_net is installed, which must never happen on member Production")
grep -q '^net schema|true$' <<<"$after" && problems+=("a net schema exists")
filter() { others "$1" | grep -v '^extension|http|' | grep -v '^extension|pg_cron|' || true; }
[ "$(filter "$before")" = "$(filter "$after")" ] || problems+=("another cron job or extension changed")
if [ ${#problems[@]} -gt 0 ]; then
  printf '  problem: %s\n' "${problems[@]}"
  fail "INSTALLED BUT NOT AS EXPECTED: the job COMMITTED (it is not rolled back), but the checks above failed. Stop: pause it if needed, and investigate."
fi
echo "Installed: job $NEWID (http, every 15 minutes, active) is the only cleanup job. pg_net is not installed."

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
unverified() { fail "INSTALLED BUT UNVERIFIED: the http cleanup job is COMMITTED and scheduled (not rolled back), but $1. Next: fix the cause, then pause (remove) and apply again for a fresh job; verify alone can't clear a failed first run."; }
[ -n "$finished" ] && [ "$finished" != 0 ] || unverified "no run finished within $((wait_max / 60)) minutes"
report_runs
[ "$UNATTRIBUTED" = 0 ] || unverified "$UNATTRIBUTED drain pass(es) match no run of this job, or runs were recorded under another command, so the run can't be reliably attributed"
[ "$LATEST" = succeeded ] || unverified "its first run failed (see above)"
[ "$VERIFIED_IN_A_ROW" -ge 1 ] || unverified "its first run succeeded without exactly one matching drain pass"
echo "Verdict: APPLIED AND VERIFIED. The first scheduled run reached the drain function and completed a pass."
