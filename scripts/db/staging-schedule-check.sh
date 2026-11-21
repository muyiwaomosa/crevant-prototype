#!/usr/bin/env bash
# Runs scripts/db/staging-schedule-media-drain.sql against STAGING in CHECK
# MODE ONLY, for the "Photo cleanup schedule check on staging" workflow.
# Check mode does everything inside one transaction and rolls it back; this
# wrapper adds, before anything connects:
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

fail() { echo "::error::$1"; echo "Refused: $1" >&2; exit 1; }

[ $# -eq 0 ] || fail "this check takes no arguments (it only ever runs check mode)."
[ "${GITHUB_REF:-}" = refs/heads/main ] || fail "runs only from the main branch."

[ -f "$SCRIPT" ] || fail "the scheduler script is missing."
actual=$(sha256sum "$SCRIPT" | cut -d' ' -f1)
[ "$actual" = "$SCRIPT_SHA256" ] || fail "the scheduler script does not match the reviewed checksum."
echo "Scheduler script matches the reviewed checksum ($SCRIPT_SHA256)."

[ -n "${STAGING_DATABASE_URL:-}" ] || fail "STAGING_DATABASE_URL is not set."

local_test=false
if [ "${SCHEDULE_CHECK_LOCAL_TEST:-}" = 1 ]; then
  host=$(python3 -c 'import os; from urllib.parse import urlsplit; print((urlsplit(os.environ["STAGING_DATABASE_URL"]).hostname or "").lower())' 2>/dev/null || true)
  case "$host" in
    127.0.0.1|localhost) local_test=true ;;
    *) fail "the local test mode only accepts a local database." ;;
  esac
fi
if [ "$local_test" = true ]; then
  echo "Local test database: target and TLS checks skipped (local connection only)."
else
  [ "${PGSSLMODE:-}" = verify-full ] && [ -f "${PGSSLROOTCERT:-/nonexistent}" ] && [ "${REQUIRE_VERIFY_FULL:-}" = 1 ] \
    || fail "full TLS verification (verify-full with the committed root certificate) is required."
  scripts/db/verify-staging-target.sh || fail "the target is not the approved staging project."
fi

PSQL=(psql "$STAGING_DATABASE_URL" -X -q -At -v ON_ERROR_STOP=1)
now() { if [ "$local_test" = true ] && [ -n "${SCHEDULE_CHECK_EPOCH:-}" ]; then echo "$SCHEDULE_CHECK_EPOCH"; else date +%s; fi; }
pause() { if [ "$local_test" = true ] && [ -n "${SCHEDULE_CHECK_SLEEP:-}" ]; then "$SCHEDULE_CHECK_SLEEP" "$1"; else sleep "$1"; fi; }

# Stay clear of the quarter hour: from 60 seconds before to 90 seconds after.
s=$(( $(now) % 900 ))
wait=0
if [ $s -ge 840 ]; then wait=$(( 900 - s + 90 )); elif [ $s -lt 90 ]; then wait=$(( 90 - s )); fi
if [ $wait -gt 0 ]; then
  echo "Within the cleanup's 15 minute boundary: waiting $wait seconds."
  pause "$wait"
fi

# Read only: the cron jobs (command as md5 only) and the installed extensions.
FINGERPRINT=$(cat <<'SQL'
begin read only;
select 'job|' || j.jobid || '|' || j.jobname || '|' || j.schedule || '|' || j.active || '|' || j.username || '|' || pg_catalog.md5(j.command) || '|'
       || case when j.command ~ 'extensions\.http\(' then 'http' when j.command ~ 'net\.http_post' then 'pg_net' else 'other' end
from cron.job j order by j.jobid;
select 'extension|' || e.extname || '|' || e.extversion || '|' || n.nspname
from pg_catalog.pg_extension e join pg_catalog.pg_namespace n on n.oid = e.extnamespace order by e.extname;
select 'net schema|' || (pg_catalog.to_regnamespace('net') is not null);
rollback;
SQL
)
fingerprint() { "${PSQL[@]}" -c "$FINGERPRINT"; }
running() {
  "${PSQL[@]}" -c "begin read only; select count(*) from cron.job_run_details d join cron.job j on j.jobid = d.jobid
                   where j.jobname = 'post-media-drain' and d.status not in ('succeeded', 'failed')
                   and d.start_time > pg_catalog.now() - interval '10 minutes'; rollback;"
}

busy=$(running) || fail "could not read the cleanup's run history."
for _ in 1 2 3 4 5 6; do
  [ "$busy" = 0 ] && break
  echo "A cleanup run is in progress: waiting 10 seconds."
  pause 10
  busy=$(running) || fail "could not read the cleanup's run history."
done
[ "$busy" = 0 ] || fail "a cleanup run is still in progress after a minute; run this again later."

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
