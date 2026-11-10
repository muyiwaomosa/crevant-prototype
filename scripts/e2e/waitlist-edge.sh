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
EDGE_HOPS2_PORT="$((EDGE_PORT + 3))"
EDGE_NOHOPS_PORT="$((EDGE_PORT + 4))"
EDGE_HOSTED_PORT="$((EDGE_PORT + 5))"
# The local Supabase address, as SUPABASE_URL (the function's own project).
LOCAL_SUPABASE_URL="http://127.0.0.1:54321"
WRITER_PW="$(openssl rand -hex 24)"
ADMIN_PW="$(openssl rand -hex 24)"
SALT="$(openssl rand -hex 32)"
PSQL=(psql "$DB_URL" -v ON_ERROR_STOP=1 -q -X -At)

"${PSQL[@]}" -c "select 1" >/dev/null || { echo "Local Supabase database not reachable on 127.0.0.1:${DB_PORT}" >&2; exit 1; }

cleanup() {
  docker rm -f crevant-waitlist-edge crevant-waitlist-edge-bad crevant-waitlist-edge-real crevant-waitlist-edge-hops2 \
    crevant-waitlist-edge-nohops crevant-waitlist-edge-hosted >/dev/null 2>&1 || true
  "${PSQL[@]}" -c "alter role waitlist_writer password null; alter role waitlist_admin password null" >/dev/null 2>&1 || true
}
trap cleanup EXIT

"${PSQL[@]}" -c "alter role waitlist_writer password '${WRITER_PW}'; alter role waitlist_admin password '${ADMIN_PW}'"

# Pass this machine's outbound proxy and extra CA to the runtime if it has
# them (it downloads the pinned postgres driver from npm on start).
EXTRA=()
if [ -n "${HTTPS_PROXY:-}" ]; then EXTRA+=(-e HTTPS_PROXY -e HTTP_PROXY -e NO_PROXY=127.0.0.1,localhost); fi
if [ -n "${EDGE_CA_FILE:-}" ]; then EXTRA+=(-v "${EDGE_CA_FILE}:/extra-ca.crt:ro" -e DENO_CERT=/extra-ca.crt); fi

start_edge() { # name port db_url [trusted_hops]
  docker run -d --name "$1" --network host "${EXTRA[@]}" \
    -e WAITLIST_DB_URL="$3" -e WAITLIST_RATE_SALT="$SALT" -e SUPABASE_URL="$LOCAL_SUPABASE_URL" \
    -e WAITLIST_TRUSTED_PROXY_HOPS="${4-1}" \
    -e TEST_ORIGIN=https://site.test -e TEST_HOSTNAME=site.test \
    -v "$PWD/supabase/functions/join-waitlist:/home/deno/functions/join-waitlist:ro" \
    -v "$PWD/e2e/edge/waitlist-e2e:/home/deno/functions/waitlist-e2e:ro" \
    "$EDGE_IMAGE" start --main-service /home/deno/functions/waitlist-e2e --ip 127.0.0.1 --port "$2" >/dev/null
}

start_edge crevant-waitlist-edge "$EDGE_PORT" "postgresql://waitlist_writer:${WRITER_PW}@127.0.0.1:${DB_PORT}/postgres"
# The same function given a broader login (the database owner) must refuse it.
start_edge crevant-waitlist-edge-bad "$EDGE_BAD_PORT" "$DB_URL"
# Two trusted proxy hops, to prove the hop counting is not fixed at one.
start_edge crevant-waitlist-edge-hops2 "$EDGE_HOPS2_PORT" "postgresql://waitlist_writer:${WRITER_PW}@127.0.0.1:${DB_PORT}/postgres" 2

# The real entry point (index.ts), fully set up except for the Turnstile
# secret: it must start and stay closed.
docker run -d --name crevant-waitlist-edge-real --network host "${EXTRA[@]}" \
  -e WAITLIST_FUNCTION_ENABLED=true -e WAITLIST_ALLOWED_ORIGINS=https://site.test -e WAITLIST_ALLOWED_HOSTNAMES=site.test \
  -e SUPABASE_URL="$LOCAL_SUPABASE_URL" -e WAITLIST_TRUSTED_PROXY_HOPS=1 \
  -e WAITLIST_RATE_SALT="$SALT" -e WAITLIST_DB_URL="postgresql://waitlist_writer:${WRITER_PW}@127.0.0.1:${DB_PORT}/postgres" \
  -v "$PWD/supabase/functions/join-waitlist:/home/deno/functions/join-waitlist:ro" \
  "$EDGE_IMAGE" start --main-service /home/deno/functions/join-waitlist --ip 127.0.0.1 --port "$EDGE_REAL_PORT" >/dev/null

# The real entry point, fully set up but WITHOUT a confirmed proxy hop count.
# (TURNSTILE_SECRET_KEY is a placeholder here so that the hop count is the
# only thing missing; it is never sent anywhere, because the function stays
# closed. It exists only in this test container.)
start_real() { # name port supabase_url extra_env...
  local name=$1 port=$2 supa=$3; shift 3
  docker run -d --name "$name" --network host "${EXTRA[@]}" \
    -e WAITLIST_FUNCTION_ENABLED=true -e WAITLIST_ALLOWED_ORIGINS=https://site.test -e WAITLIST_ALLOWED_HOSTNAMES=site.test \
    -e WAITLIST_RATE_SALT="$SALT" -e SUPABASE_URL="$supa" "$@" \
    -e WAITLIST_DB_URL="postgresql://waitlist_writer:${WRITER_PW}@127.0.0.1:${DB_PORT}/postgres" \
    -v "$PWD/supabase/functions/join-waitlist:/home/deno/functions/join-waitlist:ro" \
    "$EDGE_IMAGE" start --main-service /home/deno/functions/join-waitlist --ip 127.0.0.1 --port "$port" >/dev/null
}
start_real crevant-waitlist-edge-nohops "$EDGE_NOHOPS_PORT" "$LOCAL_SUPABASE_URL" -e TURNSTILE_SECRET_KEY=placeholder-never-sent
# The real entry point told it runs on the hosted staging project, but given
# this machine's database: it must refuse the database (wrong project).
start_real crevant-waitlist-edge-hosted "$EDGE_HOSTED_PORT" "https://kpudeppgokpjhvaqrprn.supabase.co" -e WAITLIST_TRUSTED_PROXY_HOPS=1

for port in "$EDGE_PORT" "$EDGE_BAD_PORT" "$EDGE_HOPS2_PORT"; do
  for _ in $(seq 1 90); do
    curl -fs "http://127.0.0.1:${port}/__config" >/dev/null 2>&1 && break
    sleep 2
  done
done

EDGE_URL="http://127.0.0.1:${EDGE_PORT}" EDGE_BAD_URL="http://127.0.0.1:${EDGE_BAD_PORT}" \
EDGE_HOPS2_URL="http://127.0.0.1:${EDGE_HOPS2_PORT}" \
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

# Without a confirmed proxy hop count, the real entry point stays closed and says why.
nohops="$(curl -s -m 60 -X POST "http://127.0.0.1:${EDGE_NOHOPS_PORT}/" -H 'Origin: https://site.test' -H 'Content-Type: application/json' -d '{"email":"nohops@e2e.test"}' || true)"
if [ "$nohops" = '{"status":"closed"}' ] && docker logs crevant-waitlist-edge-nohops 2>&1 | grep -q 'WAITLIST_TRUSTED_PROXY_HOPS is not set'; then
  echo "PASS  without a confirmed proxy hop count the real entry point stays closed, and logs why"
else
  echo "FAIL  without a hop count the real entry point answered: $nohops" >&2
  exit 1
fi

# Told it runs on the hosted staging project, the real entry point refuses a
# database that isn't that project's: closed, health error, reason logged.
hosted="$(curl -s -m 60 -X POST "http://127.0.0.1:${EDGE_HOSTED_PORT}/" -H 'Origin: https://site.test' -H 'Content-Type: application/json' -d '{"email":"hosted@e2e.test"}' || true)"
hosted_health="$(curl -s -m 30 "http://127.0.0.1:${EDGE_HOSTED_PORT}/" || true)"
if [ "$hosted" = '{"status":"closed"}' ] && [ "$hosted_health" = '{"status":"error"}' ] \
   && docker logs crevant-waitlist-edge-hosted 2>&1 | grep -q "own Supabase project"; then
  echo "PASS  a function on the staging project refuses a database from anywhere else (closed, health error)"
else
  echo "FAIL  the hosted-project instance answered: $hosted / $hosted_health" >&2
  docker logs crevant-waitlist-edge-hosted 2>&1 | tail -5 >&2
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
logs="$(for c in crevant-waitlist-edge crevant-waitlist-edge-real crevant-waitlist-edge-hops2 crevant-waitlist-edge-nohops crevant-waitlist-edge-hosted; do docker logs "$c" 2>&1; done)"
if grep -qi "@e2e.test" <<<"$logs"; then
  echo "FAIL  the function logged an email address" >&2
  exit 1
fi
echo "PASS  the function's logs contain no email address"
# Nor any visitor address the tests sent (all from documentation ranges).
if grep -qE '(198\.51\.100|203\.0\.113|2001:db8)' <<<"$logs"; then
  echo "FAIL  the function logged a visitor address" >&2
  exit 1
fi
echo "PASS  the function's logs contain no visitor address"
