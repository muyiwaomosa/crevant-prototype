#!/usr/bin/env bash
# One command for the integration suites on your LOCAL Supabase, in the same
# order as CI (.github/workflows/ci.yml: the Integration job, then the
# Scheduler job's suites, then npm test as in the App job), each timed.
# Local only: it refuses unless the stack's API and database are on
# 127.0.0.1 or localhost, and it clears any hosted connection string from the
# environment before a suite runs.
#
# Usage:
#   scripts/ci/local-integration.sh                     reset the local database, then every suite in CI order
#   scripts/ci/local-integration.sh <suite> [<suite>]   only these suites, on the database as it is now
#   scripts/ci/local-integration.sh --reset <suite>     reset first (the integration suite), then these
#   scripts/ci/local-integration.sh --list              the suites, in order
#
# The reset is the integration suite itself (scripts/db/integration.sh): the
# database goes back to Phase 0, identities are created, every migration is
# applied again, as in CI. While iterating on one suite you can skip it: the
# post-media and schedule suites can run again on the same database. The
# rollback suite needs an empty picture store, so after avatar-edge or
# post-media-edge, reset before running it.
#
# Stops at the first failing suite (later ones build on the state it leaves).
# Needs: Docker, psql, Node 22 with npm ci done, and the pinned Supabase CLI
# on PATH. Starts the local stack (scripts/ci/start-local-supabase.sh) if it
# isn't running.
set -uo pipefail
cd "$(dirname "$0")/../.."

# name|command, in CI order.
SUITES=(
  "integration|scripts/db/integration.sh"
  "waitlist-edge|scripts/e2e/waitlist-edge.sh"
  "waitlist-tls|scripts/e2e/waitlist-tls.sh"
  "rollback|scripts/db/rollback-test.sh"
  "request-ids-fallback|scripts/db/request-ids-fallback-test.sh"
  "avatar-edge|scripts/e2e/avatar-edge.sh"
  "post-media-edge|scripts/e2e/post-media-edge.sh"
  "schedule-media-drain|scripts/db/schedule-media-drain-test.sh"
  "schedule-check|scripts/db/staging-schedule-check-test.sh"
  "photo-cleanup|scripts/db/staging-photo-cleanup-test.sh"
  "unit|npm test"
)
names() { for s in "${SUITES[@]}"; do echo "${s%%|*}"; done; }
command_of() { for s in "${SUITES[@]}"; do [ "${s%%|*}" = "$1" ] && { echo "${s#*|}"; return 0; }; done; return 1; }
usage() { sed -n '9,13p' "$0" | sed 's/^# \{0,1\}//' >&2; exit 2; }

reset=false; chosen=()
while [ $# -gt 0 ]; do
  case "$1" in
    --list) names; exit 0 ;;
    --reset) reset=true ;;
    -h|--help) usage ;;
    -*) echo "Unknown option: $1" >&2; usage ;;
    *) command_of "$1" >/dev/null || { echo "Unknown suite: $1 (see --list)" >&2; exit 2; }; chosen+=("$1") ;;
  esac
  shift
done
if [ ${#chosen[@]} -eq 0 ]; then
  [ "$reset" = false ] || usage
  mapfile -t chosen < <(names)   # everything, starting with the reset
elif [ "$reset" = true ] && [ "${chosen[0]}" != integration ]; then
  chosen=(integration "${chosen[@]}")
fi

# --- Local only ------------------------------------------------------------------
command -v supabase >/dev/null || { echo "Refusing: the Supabase CLI is not on PATH." >&2; exit 1; }
[ -d node_modules ] || { echo "Refusing: run npm ci first." >&2; exit 1; }
if ! supabase status -o json >/dev/null 2>&1; then
  echo "Local Supabase isn't running: starting it."
  scripts/ci/start-local-supabase.sh || exit 1
fi
status="$(supabase status -o json 2>/dev/null)"
val() { node -e 'const s=JSON.parse(process.argv[1]); process.stdout.write(s[process.argv[2]] || "")' "$status" "$1"; }
API_URL="$(val API_URL)"; LOCAL_DB_URL="$(val DB_URL)"
case "$API_URL" in http://127.0.0.1:*|http://localhost:*) ;; *) echo "Refusing: the Supabase API is not local ($API_URL)." >&2; exit 1 ;; esac
case "$LOCAL_DB_URL" in *@127.0.0.1:*|*@localhost:*) ;; *) echo "Refusing: the database is not local." >&2; exit 1 ;; esac
docker inspect -f '{{.State.Running}}' supabase_db_crevant-prototype 2>/dev/null | grep -qx true \
  || { echo "Refusing: the local database container (supabase_db_crevant-prototype) is not running." >&2; exit 1; }
# Every suite reads the local database from DB_URL; no hosted connection string reaches them.
unset STAGING_DATABASE_URL PRODUCTION_DATABASE_URL DATABASE_URL ADMIN_DATABASE_URL ADMIN_DB_URL LOCAL_SUPABASE_DB_URL PGHOST PGPORT PGUSER PGPASSWORD PGDATABASE PGSERVICE
export DB_URL="$LOCAL_DB_URL"

# --- Run ---------------------------------------------------------------------------
results=(); total_start=$(date +%s); failed=''
for name in "${chosen[@]}"; do
  cmd=$(command_of "$name")
  echo
  echo "=== $name: $cmd"
  start=$(date +%s)
  # shellcheck disable=SC2086
  $cmd; code=$?
  took=$(( $(date +%s) - start ))
  results+=("$(printf '%-22s %4ss  %s' "$name" "$took" "$([ $code -eq 0 ] && echo passed || echo "FAILED (exit $code)")")")
  if [ $code -ne 0 ]; then failed=$name; break; fi
done

echo
echo "=== Durations"
printf '  %s\n' "${results[@]}"
echo "  $(printf '%-22s %4ss' total "$(( $(date +%s) - total_start ))")"
if [ -n "$failed" ]; then
  echo "Stopped at $failed. Rerun it alone with: scripts/ci/local-integration.sh $failed"
  exit 1
fi
echo "All ${#chosen[@]} suite(s) passed."
