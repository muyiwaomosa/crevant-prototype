#!/usr/bin/env bash
# The avatar Edge Function (Build 5.2b) against a real LOCAL Supabase:
# Storage, the Edge runtime (with JWT verification, as hosted) and the
# database, through the same gateway the app uses (e2e/avatar-edge.e2e.cjs).
# The gateway's JWT check is off for this function (as deployed): the
# function verifies every caller with Supabase Auth itself, which these tests
# exercise with ES256 tokens (local Auth signs with ES256, like staging).
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
DB_URL="$DB_URL" scripts/db/local-open-launch-gate.sh  # test databases only: the launch gate (20261129000000) starts closed
export PUBLISHABLE_KEY="$(val PUBLISHABLE_KEY)" JWT_SECRET="$(val JWT_SECRET)"
case "$API_URL" in http://127.0.0.1:*|http://localhost:*) ;; *) echo "Refusing: API_URL is not local ($API_URL)" >&2; exit 1 ;; esac

EDGE_IMAGE="${EDGE_IMAGE:-supabase/edge-runtime:v1.78.1}"
GUARD_PORT="${GUARD_PORT:-54397}"
# shellcheck source=lib/private-ports.sh
. scripts/e2e/lib/private-ports.sh
export PRIVATE_PORTS_REDACT="$SERVICE_ROLE_KEY $ANON_KEY $PUBLISHABLE_KEY $JWT_SECRET"
cleanup() { docker rm -f crevant-avatar-guard >/dev/null 2>&1 || true; }
trap cleanup EXIT
cleanup
# Reserve (CI), pull and wait for the port before binding it.
private_ports_prepare "$EDGE_IMAGE" "$GUARD_PORT"
# The guard copy is given the Production project's address and dummy keys: it
# must refuse before any network call (so the dummy keys are never used).
docker run -d --name crevant-avatar-guard --network host \
  -e SUPABASE_URL=https://hmrliwoychnqrbbydorg.supabase.co -e SUPABASE_ANON_KEY=dummy -e SUPABASE_SERVICE_ROLE_KEY=dummy \
  -v "$PWD/supabase/functions/avatar:/home/deno/functions/avatar:ro" \
  -v "$PWD/supabase/functions/_shared:/home/deno/functions/_shared:ro" \
  "$EDGE_IMAGE" start --main-service /home/deno/functions/avatar --ip 127.0.0.1 --port "$GUARD_PORT" >/dev/null
# The copy must answer; if not, stop here with its state and output.
private_ports_wait_http crevant-avatar-guard "$GUARD_PORT" "http://127.0.0.1:$GUARD_PORT/avatar/upload"
# The gateway's copy (served by the local Supabase Edge runtime).
private_ports_wait_gateway "$API_URL/functions/v1/avatar/upload"

if ! GUARD_URL="http://127.0.0.1:$GUARD_PORT/avatar" node e2e/avatar-edge.e2e.cjs; then
  private_ports_explain supabase_edge_runtime_crevant-prototype
  private_ports_explain crevant-avatar-guard "$GUARD_PORT"
  exit 1
fi
