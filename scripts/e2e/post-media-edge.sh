#!/usr/bin/env bash
# The post-media Edge Function (Build 5.3) against a real LOCAL Supabase:
# Storage, the Edge runtime and the database, through the same gateway the
# app uses (e2e/post-media-edge.e2e.cjs). The gateway's JWT check is off for
# this function (as deployed): it verifies every member with Supabase Auth.
#
# Also starts two more copies of the function in the same Edge runtime image:
#   * one with a test drain key (generated here, never stored), for the
#     scheduled drain and the browser origin checks;
#   * one given the PRODUCTION project's address, to prove it refuses to run.
#
# Requires: local Supabase running with Storage and the Edge runtime
# (scripts/ci/start-local-supabase.sh) and every migration applied. Local only.
set -euo pipefail
cd "$(dirname "$0")/../.."

status="$(supabase status -o json 2>/dev/null)"
val() { node -e 'const s=JSON.parse(process.argv[1]); process.stdout.write(s[process.argv[2]] || "")' "$status" "$1"; }
export API_URL="$(val API_URL)" DB_URL="$(val DB_URL)" ANON_KEY="$(val ANON_KEY)" SERVICE_ROLE_KEY="$(val SERVICE_ROLE_KEY)"
DB_URL="$DB_URL" scripts/db/local-open-launch-gate.sh  # test databases only: the launch gate (20261129000000) starts closed
export PUBLISHABLE_KEY="$(val PUBLISHABLE_KEY)"
case "$API_URL" in http://127.0.0.1:*|http://localhost:*) ;; *) echo "Refusing: API_URL is not local ($API_URL)" >&2; exit 1 ;; esac

EDGE_IMAGE="${EDGE_IMAGE:-supabase/edge-runtime:v1.78.1}"
DRAIN_PORT="${DRAIN_PORT:-54398}"
GUARD_PORT="${GUARD_PORT:-54399}"
DRAIN_KEY="$(node -e 'process.stdout.write(require("crypto").randomBytes(24).toString("hex"))')"
export DRAIN_KEY
cleanup() { docker rm -f crevant-media-drain crevant-media-guard >/dev/null 2>&1 || true; }
trap cleanup EXIT
cleanup
FUNCS="-v $PWD/supabase/functions/post-media:/home/deno/functions/post-media:ro -v $PWD/supabase/functions/_shared:/home/deno/functions/_shared:ro"
# shellcheck disable=SC2086
docker run -d --name crevant-media-drain --network host \
  -e SUPABASE_URL="$API_URL" -e SUPABASE_ANON_KEY="$ANON_KEY" -e SUPABASE_SERVICE_ROLE_KEY="$SERVICE_ROLE_KEY" -e MEDIA_DRAIN_KEY="$DRAIN_KEY" \
  $FUNCS "$EDGE_IMAGE" start --main-service /home/deno/functions/post-media --ip 127.0.0.1 --port "$DRAIN_PORT" >/dev/null
# The guard copy has the Production address and dummy keys: it must refuse before any network call.
# shellcheck disable=SC2086
docker run -d --name crevant-media-guard --network host \
  -e SUPABASE_URL=https://hmrliwoychnqrbbydorg.supabase.co -e SUPABASE_ANON_KEY=dummy -e SUPABASE_SERVICE_ROLE_KEY=dummy -e MEDIA_DRAIN_KEY="$DRAIN_KEY" \
  $FUNCS "$EDGE_IMAGE" start --main-service /home/deno/functions/post-media --ip 127.0.0.1 --port "$GUARD_PORT" >/dev/null
for port in "$DRAIN_PORT" "$GUARD_PORT"; do
  for _ in $(seq 1 60); do
    curl -s -o /dev/null -X OPTIONS "http://127.0.0.1:$port/post-media/photo" && break
    sleep 1
  done
done
# The gateway's copy (served by the local Supabase Edge runtime).
for _ in $(seq 1 60); do
  [ "$(curl -s -o /dev/null -w '%{http_code}' -X OPTIONS -H 'Origin: http://127.0.0.1:4176' "$API_URL/functions/v1/post-media/photo")" = 204 ] && break
  sleep 1
done

DRAIN_URL="http://127.0.0.1:$DRAIN_PORT/post-media" GUARD_URL="http://127.0.0.1:$GUARD_PORT/post-media" node e2e/post-media-edge.e2e.cjs
