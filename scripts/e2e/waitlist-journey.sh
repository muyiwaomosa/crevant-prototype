#!/usr/bin/env bash
# The waitlist journey in a real browser (e2e/waitlist-journey.e2e.cjs):
#   the real /join components (test-only harness, e2e/harness/waitlist)
#   -> the real join-waitlist function in Supabase's Edge runtime
#      (e2e/edge/waitlist-e2e: only Turnstile is a stand-in)
#   -> a LOCAL Supabase database, as the restricted waitlist_writer login.
#
# Requires: local Supabase running with the migrations applied
# (scripts/ci/start-local-supabase.sh), Docker, npm dependencies and
# Playwright's Chromium. Local only: it refuses any database not on this
# machine. The two login roles get throwaway passwords, removed at the end.
set -euo pipefail
cd "$(dirname "$0")/../.."

DB_PORT="${DB_PORT:-54322}"
DB_URL="postgresql://postgres:postgres@127.0.0.1:${DB_PORT}/postgres"
DB_URL="$DB_URL" scripts/db/local-open-launch-gate.sh  # test databases only: the launch gate (20261129000000) starts closed
EDGE_IMAGE="${EDGE_IMAGE:-supabase/edge-runtime:v1.78.1}"
EDGE_PORT="${JOURNEY_EDGE_PORT:-54410}"
HARNESS_PORT="${JOURNEY_HARNESS_PORT:-4190}"
HARNESS_URL="http://127.0.0.1:${HARNESS_PORT}"
ENDPOINT="http://127.0.0.1:${EDGE_PORT}/"
WRITER_PW="$(openssl rand -hex 24)"
ADMIN_PW="$(openssl rand -hex 24)"
SALT="$(openssl rand -hex 32)"
PSQL=(psql "$DB_URL" -v ON_ERROR_STOP=1 -q -X -At)

"${PSQL[@]}" -c "select 1" >/dev/null || { echo "Local Supabase database not reachable on 127.0.0.1:${DB_PORT}" >&2; exit 1; }

preview_pid=""
cleanup() {
  [ -n "$preview_pid" ] && kill "$preview_pid" 2>/dev/null || true
  docker rm -f crevant-waitlist-journey >/dev/null 2>&1 || true
  "${PSQL[@]}" -c "update ops.settings set enabled = false where key = 'waitlist_submissions'; update ops.settings set value = null where key = 'waitlist_notice_version'" >/dev/null 2>&1 || true
  "${PSQL[@]}" -c "alter role waitlist_writer password null; alter role waitlist_admin password null" >/dev/null 2>&1 || true
}
trap cleanup EXIT

"${PSQL[@]}" -c "alter role waitlist_writer password '${WRITER_PW}'; alter role waitlist_admin password '${ADMIN_PW}'"

EXTRA=()
if [ -n "${HTTPS_PROXY:-}" ]; then EXTRA+=(-e HTTPS_PROXY -e HTTP_PROXY -e NO_PROXY=127.0.0.1,localhost); fi
if [ -n "${EDGE_CA_FILE:-}" ]; then EXTRA+=(-v "${EDGE_CA_FILE}:/extra-ca.crt:ro" -e DENO_CERT=/extra-ca.crt); fi

# The function's port (54410) is inside Linux's range for temporary outgoing
# connections (32768 to 60999), and pulling the image opens many of those: one
# can take the port first ("Address already in use"). As for the Supabase
# ports (scripts/ci/start-local-supabase.sh): on CI runners reserve it before
# the pull, pull before binding, then wait until nothing holds it.
if [ "${GITHUB_ACTIONS:-}" = true ]; then
  sudo_cmd=""; [ "$(id -u)" -eq 0 ] || sudo_cmd=sudo
  reserved=$(sysctl -n net.ipv4.ip_local_reserved_ports)
  $sudo_cmd sysctl -q -w net.ipv4.ip_local_reserved_ports="${reserved:+$reserved,}$EDGE_PORT"
fi
docker image inspect "$EDGE_IMAGE" >/dev/null 2>&1 || docker pull -q "$EDGE_IMAGE" >/dev/null
port_busy() {
  local hex t tables=()
  hex=$(printf '%04X' "$EDGE_PORT")
  for t in /proc/net/tcp /proc/net/tcp6; do [ -r "$t" ] && tables+=("$t"); done
  # Any socket on the port that is not merely waiting to close (TIME_WAIT, state 06).
  awk -v h=":$hex" 'FNR > 1 && substr($2, length($2) - 4) == h && $4 != "06" { found = 1 } END { exit !found }' "${tables[@]}"
}
for _ in $(seq 1 30); do port_busy || break; sleep 1; done
port_busy && echo "::warning::Port $EDGE_PORT is still in use after 30 seconds"

# The function, accepting the harness's origin and hostname only.
docker rm -f crevant-waitlist-journey >/dev/null 2>&1 || true
docker run -d --name crevant-waitlist-journey --network host "${EXTRA[@]}" \
  -e WAITLIST_DB_URL="postgresql://waitlist_writer:${WRITER_PW}@127.0.0.1:${DB_PORT}/postgres" \
  -e WAITLIST_RATE_SALT="$SALT" -e SUPABASE_URL="http://127.0.0.1:54321" -e WAITLIST_TRUSTED_PROXY_HOPS=1 \
  -e TEST_ORIGIN="$HARNESS_URL" -e TEST_HOSTNAME=127.0.0.1 \
  -v "$PWD/supabase/functions/join-waitlist:/home/deno/functions/join-waitlist:ro" \
  -v "$PWD/supabase/functions/_shared:/home/deno/functions/_shared:ro" \
  -v "$PWD/e2e/edge/waitlist-e2e:/home/deno/functions/waitlist-e2e:ro" \
  "$EDGE_IMAGE" start --main-service /home/deno/functions/waitlist-e2e --ip 127.0.0.1 --port "$EDGE_PORT" >/dev/null
for _ in $(seq 1 90); do curl -fs "${ENDPOINT}__config" >/dev/null 2>&1 && break; sleep 2; done
curl -fs "${ENDPOINT}__config" | grep -q '"ok":true' || { echo "The test function did not start" >&2; docker logs crevant-waitlist-journey 2>&1 | tail -5 >&2; exit 1; }

# The harness: built on its own into e2e-dist/ (never into dist/), served locally.
VITE_E2E_WAITLIST_ENDPOINT="$ENDPOINT" node_modules/.bin/vite build --config e2e/harness/vite.config.ts --logLevel error
node_modules/.bin/vite preview --config e2e/harness/vite.config.ts --host 127.0.0.1 --port "$HARNESS_PORT" --strictPort >/dev/null 2>&1 &
preview_pid=$!
for _ in $(seq 1 60); do curl -fs "$HARNESS_URL/" >/dev/null 2>&1 && break; sleep 0.5; done

HARNESS_URL="$HARNESS_URL" ENDPOINT="$ENDPOINT" DB_URL="$DB_URL" \
  ADMIN_DB_URL="postgresql://waitlist_admin:${ADMIN_PW}@127.0.0.1:${DB_PORT}/postgres" \
  node e2e/waitlist-journey.e2e.cjs
