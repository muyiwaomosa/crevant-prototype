#!/usr/bin/env bash
# End-to-end test of the join-waitlist function in Supabase's Edge runtime,
# connected to a LOCAL Supabase database as the restricted waitlist_writer
# login (e2e/edge/waitlist-e2e, which swaps only Turnstile for a stand-in).
#
# Requires: local Supabase running with the migrations applied (supabase start,
# or scripts/ci/start-local-supabase.sh), Docker, and npm dependencies.
# Local only: it refuses any database that isn't on this machine.
#
# Each run gives the two login roles random throwaway passwords, and removes
# them again at the end, so the roles can't log in afterwards.
set -euo pipefail
cd "$(dirname "$0")/../.."

DB_PORT="${DB_PORT:-54322}"
DB_URL="postgresql://postgres:postgres@127.0.0.1:${DB_PORT}/postgres"
EDGE_IMAGE="${EDGE_IMAGE:-supabase/edge-runtime:v1.78.1}"
EDGE_PORT="${EDGE_PORT:-54398}"
EDGE_BAD_PORT="$((EDGE_PORT + 1))"
EDGE_REAL_PORT="$((EDGE_PORT + 2))"
WRITER_PW="$(openssl rand -hex 24)"
ADMIN_PW="$(openssl rand -hex 24)"
SALT="$(openssl rand -hex 32)"
PSQL=(psql "$DB_URL" -v ON_ERROR_STOP=1 -q -X -At)

"${PSQL[@]}" -c "select 1" >/dev/null || { echo "Local Supabase database not reachable on 127.0.0.1:${DB_PORT}" >&2; exit 1; }

cleanup() {
  docker rm -f crevant-waitlist-edge crevant-waitlist-edge-bad crevant-waitlist-edge-real >/dev/null 2>&1 || true
  "${PSQL[@]}" -c "alter role waitlist_writer password null; alter role waitlist_admin password null" >/dev/null 2>&1 || true
}
trap cleanup EXIT

"${PSQL[@]}" -c "alter role waitlist_writer password '${WRITER_PW}'; alter role waitlist_admin password '${ADMIN_PW}'"

# Pass this machine's outbound proxy and extra CA to the runtime if it has
# them (it downloads the pinned postgres driver from npm on start).
EXTRA=()
if [ -n "${HTTPS_PROXY:-}" ]; then EXTRA+=(-e HTTPS_PROXY -e HTTP_PROXY -e NO_PROXY=127.0.0.1,localhost); fi
if [ -n "${EDGE_CA_FILE:-}" ]; then EXTRA+=(-v "${EDGE_CA_FILE}:/extra-ca.crt:ro" -e DENO_CERT=/extra-ca.crt); fi

start_edge() { # name port db_url
  docker run -d --name "$1" --network host "${EXTRA[@]}" \
    -e WAITLIST_DB_URL="$3" -e WAITLIST_RATE_SALT="$SALT" \
    -e TEST_ORIGIN=https://site.test -e TEST_HOSTNAME=site.test \
    -v "$PWD/supabase/functions/join-waitlist:/home/deno/functions/join-waitlist:ro" \
    -v "$PWD/e2e/edge/waitlist-e2e:/home/deno/functions/waitlist-e2e:ro" \
    "$EDGE_IMAGE" start --main-service /home/deno/functions/waitlist-e2e --ip 127.0.0.1 --port "$2" >/dev/null
}

start_edge crevant-waitlist-edge "$EDGE_PORT" "postgresql://waitlist_writer:${WRITER_PW}@127.0.0.1:${DB_PORT}/postgres"
# The same function given a broader login (the database owner) must refuse it.
start_edge crevant-waitlist-edge-bad "$EDGE_BAD_PORT" "$DB_URL"

# The real entry point (index.ts), fully set up except for the Turnstile
# secret: it must start and stay closed.
docker run -d --name crevant-waitlist-edge-real --network host "${EXTRA[@]}" \
  -e WAITLIST_FUNCTION_ENABLED=true -e WAITLIST_ALLOWED_ORIGINS=https://site.test -e WAITLIST_ALLOWED_HOSTNAMES=site.test \
  -e WAITLIST_RATE_SALT="$SALT" -e WAITLIST_DB_URL="postgresql://waitlist_writer:${WRITER_PW}@127.0.0.1:${DB_PORT}/postgres" \
  -v "$PWD/supabase/functions/join-waitlist:/home/deno/functions/join-waitlist:ro" \
  "$EDGE_IMAGE" start --main-service /home/deno/functions/join-waitlist --ip 127.0.0.1 --port "$EDGE_REAL_PORT" >/dev/null

for port in "$EDGE_PORT" "$EDGE_BAD_PORT"; do
  for _ in $(seq 1 90); do
    curl -fs "http://127.0.0.1:${port}/__config" >/dev/null 2>&1 && break
    sleep 2
  done
done

EDGE_URL="http://127.0.0.1:${EDGE_PORT}" EDGE_BAD_URL="http://127.0.0.1:${EDGE_BAD_PORT}" \
DB_URL="$DB_URL" \
WRITER_URL="postgresql://waitlist_writer:${WRITER_PW}@127.0.0.1:${DB_PORT}/postgres" \
ADMIN_URL="postgresql://waitlist_admin:${ADMIN_PW}@127.0.0.1:${DB_PORT}/postgres" \
  node e2e/waitlist-edge.e2e.cjs

real="$(curl -s -m 60 -X POST "http://127.0.0.1:${EDGE_REAL_PORT}/" -H 'Origin: https://site.test' -H 'Content-Type: application/json' -d '{"email":"real@e2e.test"}' || true)"
if [ "$real" = '{"status":"closed"}' ]; then
  echo "PASS  the real entry point starts, and stays closed without its Turnstile secret"
else
  echo "FAIL  the real entry point did not answer closed: $real" >&2
  docker logs crevant-waitlist-edge-real 2>&1 | tail -5 >&2
  exit 1
fi

real_health="$(curl -s -m 30 "http://127.0.0.1:${EDGE_REAL_PORT}/" || true)"
if [ "$real_health" = '{"status":"ok"}' ]; then
  echo "PASS  the real entry point's health check connects as waitlist_writer, while closed"
else
  echo "FAIL  the real entry point's health check answered: $real_health" >&2
  exit 1
fi

# The admin script, as the restricted admin login, against Supabase's own image.
ADMIN_DB_URL="postgresql://waitlist_admin:${ADMIN_PW}@127.0.0.1:${DB_PORT}/postgres"
if out="$(DATABASE_URL="$ADMIN_DB_URL" REQUIRE_ADMIN_ROLE=1 ACTION=wave-preview GROUP=supporter scripts/db/waitlist-admin.sh)" \
   && grep -q '"eligible"' <<<"$out" \
   && ! DATABASE_URL="$DB_URL" REQUIRE_ADMIN_ROLE=1 ACTION=summary scripts/db/waitlist-admin.sh >/dev/null 2>&1; then
  echo "PASS  the admin script works as waitlist_admin and refuses the database owner's login"
else
  echo "FAIL  the admin script did not behave as expected: $out" >&2
  exit 1
fi

# The function's logs must never contain an email address.
if docker logs crevant-waitlist-edge 2>&1 | grep -qi "@e2e.test" || docker logs crevant-waitlist-edge-real 2>&1 | grep -qi "@e2e.test"; then
  echo "FAIL  the function logged an email address" >&2
  exit 1
fi
echo "PASS  the function's logs contain no email address"
