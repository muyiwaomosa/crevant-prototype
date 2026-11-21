#!/usr/bin/env bash
# Runs scripts/db/staging-schedule-media-drain.sql against STAGING in CHECK
# MODE ONLY, for the "Photo cleanup schedule check on staging" workflow.
# Check mode does everything inside one transaction and rolls it back; this
# wrapper adds, before anything connects (the shared guards in
# scripts/db/staging-photo-cleanup-lib.sh):
#   * main only (GITHUB_REF), no arguments of any kind;
#   * the scheduler script must match the reviewed checksum pinned below;
#   * a connection string, verified as the approved staging project
#     (scripts/db/verify-staging-target.sh), with full TLS verification;
# and around the check:
#   * waits outside the cleanup's 15 minute boundary (and for a run in
#     progress to finish);
#   * read-only fingerprints of the cron jobs and installed extensions before
#     and after; any difference fails the run.
# mode=check and an empty confirmation are fixed here: nothing can select
# apply or remove, and pg_net removal is not reachable from this script.
# Never prints the connection string, the password, a cron command (only its
# md5) or the Vault secret.
#
# Tested locally by scripts/db/staging-schedule-check-test.sh, which uses
# SCHEDULE_CHECK_LOCAL_TEST=1: accepted only with a 127.0.0.1 or localhost
# connection string, so it can never skip the target checks for a hosted one.
set -euo pipefail
cd "$(dirname "$0")/../.."

SCRIPT=scripts/db/staging-schedule-media-drain.sql
# sha256 of the reviewed scheduler script (PR #85, f77442a). Changing the
# script needs a reviewed change to this line too.
SCRIPT_SHA256=33ad800a2b9c27db7b3d22bfb3416cdefc8554a74c94d13adfe9fac80666484d

# The shared guards (main only, no arguments, the pinned checksum, the
# connection string, verify-full TLS and the approved staging project, all
# before connecting), the boundary and in-progress waits, and the read-only
# fingerprint: the same code the apply and removal wrappers use.
# shellcheck source=scripts/db/staging-photo-cleanup-lib.sh
. scripts/db/staging-photo-cleanup-lib.sh
guard $# "$SCRIPT" "$SCRIPT_SHA256"

# Stay clear of the quarter hour (from 60 seconds before to 90 seconds
# after), and wait for a cleanup run in progress to finish.
boundary_wait
running_wait

before=$(fingerprint) || fail "could not read the cron jobs and extensions before the check."
echo "Before the check (cron commands shown as md5 only):"
sed 's/^/  /' <<<"$before"

echo "Running the scheduler script in check mode (one transaction, rolled back):"
set +e
out=$(psql "$STAGING_DATABASE_URL" -X -q -v ON_ERROR_STOP=1 -v mode=check -v confirm= -f "$SCRIPT" 2>&1)
code=$?
set -e
sed 's/^/  /' <<<"$out"

after=$(fingerprint) || fail "could not read the cron jobs and extensions after the check."
echo "After the check:"
sed 's/^/  /' <<<"$after"
if [ "$before" != "$after" ]; then
  echo "Differences (before, after):"
  diff <(echo "$before") <(echo "$after") | sed 's/^/  /' || true
  fail "the cron jobs or extensions changed: check mode must leave nothing behind. Stop and investigate."
fi
echo "No persistent change: the cron jobs and installed extensions are exactly as before."

[ $code -eq 0 ] || fail "check mode did not complete (exit $code); see its output above. Nothing changed."
grep -q '^Done:' <<<"$out" && fail "the script reported a committed change, which check mode must never do."
grep -q '^Check only: the schedule could be created' <<<"$out" || fail "check mode did not report its rollback."
rows=$(grep -cE '^ *post-media-drain *\|' <<<"$out" || true)
[ "$rows" = 1 ] || fail "check mode showed $rows cleanup jobs, expected exactly one."
grep -Eq '^ *post-media-drain *\| *\*/15 \* \* \* \* *\| *t *\| *http \(synchronous\)' <<<"$out" \
  || fail "the job check mode would create is not the 15 minute http job."
echo "Check passed: the http schedule (every 15 minutes) could replace the current job, and everything was rolled back."
