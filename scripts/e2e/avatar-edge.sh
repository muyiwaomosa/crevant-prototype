#!/usr/bin/env bash
# The avatar Edge Function (Build 5.2b) against a real LOCAL Supabase:
# Storage, the Edge runtime (with JWT verification, as hosted) and the
# database, through the same gateway the app uses (e2e/avatar-edge.e2e.cjs).
# Also starts a second copy of the function in the same Edge runtime image,
# given the PRODUCTION project's address, to prove it refuses to run there.
#
# Requires: local Supabase running with Storage and the Edge runtime
# (scripts/ci/start-local-supabase.sh) and every migration applied. Local only.
set -euo pipefail
cd "$(dirname "$0")/../.."

status="$(supabase status -o json 2>/dev/null)"
val() { node -e 'const s=JSON.parse(process.argv[1]); process.stdout.write(s[process.argv[2]] || "")' "$status" "$1"; }
export API_URL="$(val API_URL)" DB_URL="$(val DB_URL)" ANON_KEY="$(val ANON_KEY)" SERVICE_ROLE_KEY="$(val SERVICE_ROLE_KEY)"
case "$API_URL" in http://127.0.0.1:*|http://localhost:*) ;; *) echo "Refusing: API_URL is not local ($API_URL)" >&2; exit 1 ;; esac

EDGE_IMAGE="${EDGE_IMAGE:-supabase/edge-runtime:v1.78.1}"
GUARD_PORT="${GUARD_PORT:-54397}"
cleanup() { docker rm -f crevant-avatar-guard >/dev/null 2>&1 || true; }
trap cleanup EXIT
cleanup
# The guard copy is given the Production project's address and dummy keys: it
# must refuse before any network call (so the dummy keys are never used).
docker run -d --name crevant-avatar-guard --network host \
  -e SUPABASE_URL=https://hmrliwoychnqrbbydorg.supabase.co -e SUPABASE_ANON_KEY=dummy -e SUPABASE_SERVICE_ROLE_KEY=dummy \
  -v "$PWD/supabase/functions/avatar:/home/deno/functions/avatar:ro" \
  "$EDGE_IMAGE" start --main-service /home/deno/functions/avatar --ip 127.0.0.1 --port "$GUARD_PORT" >/dev/null
for _ in $(seq 1 60); do
  curl -s -o /dev/null -X OPTIONS "http://127.0.0.1:$GUARD_PORT/avatar/upload" && break
  sleep 1
done
# The gateway's copy (served by the local Supabase Edge runtime).
for _ in $(seq 1 60); do
  [ "$(curl -s -o /dev/null -w '%{http_code}' -X OPTIONS -H 'Origin: http://127.0.0.1:4176' "$API_URL/functions/v1/avatar/upload")" = 204 ] && break
  sleep 1
done

GUARD_URL="http://127.0.0.1:$GUARD_PORT/avatar" node e2e/avatar-edge.e2e.cjs
