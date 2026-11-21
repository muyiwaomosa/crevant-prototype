#!/usr/bin/env bash
# The "Remove pg_net from staging" workflow's only database step.
# MODE:
#   check  (default) The gate, then scripts/db/staging-remove-pg-net.sql in
#          check mode (it drops pg_net inside a transaction and rolls back).
#   apply  Needs CONFIRM_PHRASE = REMOVE PG_NET FROM STAGING. Runs only if
#          the gate passes, then drops pg_net and checks nothing else changed.
# The gate (on top of the removal script's own seven checks): exactly one
# cleanup job, on http, active every 15 minutes; its two newest finished runs
# both succeeded and each matched exactly one drain pass recorded by the
# post-media function; no failed (or unmatched) run since the replacement; and
# no drain pass that can't be attributed to a run. Anything else refuses.
# Never touches the cleanup job, other cron jobs or other extensions.
# Afterwards: run "Deploy database to staging" in check mode (checks 001 to
# 013). Shared protections: scripts/db/staging-photo-cleanup-lib.sh. Tested by
# scripts/db/staging-photo-cleanup-test.sh.
set -euo pipefail
cd "$(dirname "$0")/../.."
# shellcheck source=scripts/db/staging-photo-cleanup-lib.sh
. scripts/db/staging-photo-cleanup-lib.sh

SCRIPT=scripts/db/staging-remove-pg-net.sql
# sha256 of the reviewed removal script (PR #85).
SCRIPT_SHA256=d2b211eab597f3a0a3258d2d1fe33ab47d18c7427745ab0323358cd8c135ad26
REMOVE_PHRASE='REMOVE PG_NET FROM STAGING'

MODE="${MODE:-check}"
case "$MODE" in check|apply) ;; *) fail "mode must be check or apply." ;; esac
[ "$MODE" != apply ] || [ "${CONFIRM_PHRASE:-}" = "$REMOVE_PHRASE" ] || fail "apply needs the confirmation phrase: $REMOVE_PHRASE"
guard $# "$SCRIPT" "$SCRIPT_SHA256"
echo "Mode: $MODE"

installed=$(q "select count(*) from pg_extension where extname = 'pg_net'") || fail "could not read the extensions."
if [ "$installed" = 0 ]; then
  echo "pg_net is not installed here. Nothing to remove, nothing changed."
  exit 0
fi

# --- the gate ---------------------------------------------------------------
IFS='|' read -r JOBS JOBID METHOD SCHEDULE ACTIVE OTHERS <<<"$(job_state)" || fail "could not read the cron jobs."
echo "Cleanup job: $JOBS job(s) named post-media-drain; method ${METHOD:-none}, schedule ${SCHEDULE:-none}, active ${ACTIVE:-none}; other jobs calling the drain: $OTHERS"
gate=()
[ "$JOBS" = 1 ] && [ "$METHOD" = http ] && [ "$SCHEDULE" = '*/15 * * * *' ] && [ "$ACTIVE" = true ] \
  || gate+=("there must be exactly one cleanup job, on http, active every 15 minutes")
[ "$OTHERS" = 0 ] || gate+=("another cron job calls the drain")
if [ "$JOBS" = 1 ] && [ "$METHOD" = http ]; then
  report_runs
  [ "$VERIFIED_IN_A_ROW" -ge 2 ] || gate+=("the two newest runs must both be verified ($VERIFIED_IN_A_ROW in a row so far)")
  [ "$FAILED_RUNS" = 0 ] || gate+=("$FAILED_RUNS run(s) failed since the replacement")
  [ "$UNMATCHED_OK_RUNS" = 0 ] || gate+=("$UNMATCHED_OK_RUNS run(s) succeeded without exactly one matching drain pass")
  [ "$UNATTRIBUTED" = 0 ] || gate+=("$UNATTRIBUTED drain pass(es) can't be attributed to a run")
fi
if [ ${#gate[@]} -gt 0 ]; then
  printf '  gate: %s\n' "${gate[@]}"
  fail "the removal gate is not met, so pg_net stays. Nothing changed."
fi
echo "Gate met: $VERIFIED_IN_A_ROW consecutive verified runs, none failed or unmatched, every drain pass attributed."

boundary_wait
running_wait
before=$(fingerprint) || fail "could not read the cron jobs and extensions before."
show "Before (cron commands shown as md5 only):" "$before"
set +e
if [ "$MODE" = apply ]; then
  out=$(psql "$STAGING_DATABASE_URL" -X -q -v ON_ERROR_STOP=1 -v mode=apply -v confirm="$REMOVE_PHRASE" -f "$SCRIPT" 2>&1); code=$?
else
  out=$(psql "$STAGING_DATABASE_URL" -X -q -v ON_ERROR_STOP=1 -v mode=check -v confirm= -f "$SCRIPT" 2>&1); code=$?
fi
set -e
sed 's/^/  /' <<<"$out"
after=$(fingerprint) || fail "could not read the cron jobs and extensions after. Run check mode to see the state."
show "After:" "$after"
jobs_of() { grep '^job|' <<<"$1" || true; }
[ "$(jobs_of "$before")" = "$(jobs_of "$after")" ] || fail "a cron job changed, which removal must never do. Stop and investigate."

if [ "$MODE" = check ]; then
  [ "$before" = "$after" ] || fail "check mode left a change behind. Stop and investigate."
  [ $code -eq 0 ] || fail "the removal script refused (exit $code); see above. Nothing changed."
  grep -q '^Check only: every check passed' <<<"$out" || fail "the removal script did not report its rollback."
  echo "Check passed: pg_net could be removed; everything was rolled back. Nothing changed."
  exit 0
fi

if [ $code -ne 0 ]; then
  [ "$before" = "$after" ] && fail "the removal script refused (exit $code); see above. Nothing changed."
  fail "the removal script failed (exit $code) and the state differs from before. Stop and run check mode."
fi
grep -q '^extension|pg_net|' <<<"$after" && fail "pg_net is still installed after apply."
grep -q '^net schema|false$' <<<"$after" || fail "the net schema is still present after apply."
[ "$(grep -v '^extension|pg_net|\|^net schema|' <<<"$before")" = "$(grep -v '^extension|pg_net|\|^net schema|' <<<"$after")" ] \
  || fail "something besides pg_net changed. Stop and investigate."
echo "Removed: pg_net and its net schema are gone; the cleanup job, every other cron job and extension are unchanged."
echo "Next: run Deploy database to staging in check mode (security checks 001 to 013), then this cleanup's verify."
