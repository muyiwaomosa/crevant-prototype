#!/usr/bin/env bash
# The avatar Edge Function (Build 5.2b) against a real LOCAL Supabase:
# Storage, the Edge runtime (with JWT verification, as hosted) and the
# database, through the same gateway the app uses (e2e/avatar-edge.e2e.cjs).
# The gateway's JWT check is off for this function (as deployed): the
# function verifies every caller with Supabase Auth itself, which these tests
# exercise with ES256 tokens (local Auth signs with ES256, like staging).
# Also starts more copies of the function in the same Edge runtime image:
#   * one with ONLY the new API keys (publishable and secret, as the JSON
#     dictionaries hosted Supabase provides): the whole suite runs on it;
#   * one with ONLY the legacy anon and service_role keys: the transition
#     fallback still works;
#   * one with no key at all, and one with only a publishable key and
#     malformed others: both must refuse to run (503);
#   * one given the PRODUCTION project's address, to prove it refuses to run there.
# The copy behind the gateway runs on whatever keys the local CLI gives it
# (CLI 2.122.1: the new keys, besides the legacy ones); it gets a smoke check.
#
# Requires: local Supabase running with Storage and the Edge runtime
# (scripts/ci/start-local-supabase.sh) and every migration applied. Local only.
set -euo pipefail
cd "$(dirname "$0")/../.."

status="$(supabase status -o json 2>/dev/null)"
val() { node -e 'const s=JSON.parse(process.argv[1]); process.stdout.write(s[process.argv[2]] || "")' "$status" "$1"; }
export API_URL="$(val API_URL)" DB_URL="$(val DB_URL)" ANON_KEY="$(val ANON_KEY)" SERVICE_ROLE_KEY="$(val SERVICE_ROLE_KEY)"
DB_URL="$DB_URL" scripts/db/local-open-launch-gate.sh  # test databases only: the launch gate (20261129000000) starts closed
export PUBLISHABLE_KEY="$(val PUBLISHABLE_KEY)" SECRET_KEY="$(val SECRET_KEY)" JWT_SECRET="$(val JWT_SECRET)"
case "$API_URL" in http://127.0.0.1:*|http://localhost:*) ;; *) echo "Refusing: API_URL is not local ($API_URL)" >&2; exit 1 ;; esac

EDGE_IMAGE="${EDGE_IMAGE:-supabase/edge-runtime:v1.78.1}"
GUARD_PORT="${GUARD_PORT:-54397}"
NEW_PORT="${NEW_PORT:-54400}" LEGACY_PORT="${LEGACY_PORT:-54401}" NOKEYS_PORT="${NOKEYS_PORT:-54402}" PARTIAL_PORT="${PARTIAL_PORT:-54403}"
case "$SECRET_KEY" in sb_secret_*) ;; *) echo "The local Supabase gave no secret key (sb_secret_...); a newer Supabase CLI is needed" >&2; exit 1 ;; esac
# shellcheck source=lib/private-ports.sh
. scripts/e2e/lib/private-ports.sh
export PRIVATE_PORTS_REDACT="$SERVICE_ROLE_KEY $ANON_KEY $PUBLISHABLE_KEY $SECRET_KEY $JWT_SECRET"
COPIES="crevant-avatar-guard crevant-avatar-new crevant-avatar-legacy crevant-avatar-nokeys crevant-avatar-partial"
# shellcheck disable=SC2086
cleanup() { docker rm -f $COPIES >/dev/null 2>&1 || true; }
trap cleanup EXIT
cleanup
# Reserve (CI), pull and wait for the port before binding it.
private_ports_prepare "$EDGE_IMAGE" "$GUARD_PORT" "$NEW_PORT" "$LEGACY_PORT" "$NOKEYS_PORT" "$PARTIAL_PORT"
# run_copy <container> <port> [docker -e arguments...]: the function alone, with exactly the given environment.
run_copy() {
  local name=$1 port=$2; shift 2
  docker run -d --name "$name" --network host "$@" \
    -v "$PWD/supabase/functions/avatar:/home/deno/functions/avatar:ro" \
    -v "$PWD/supabase/functions/_shared:/home/deno/functions/_shared:ro" \
    "$EDGE_IMAGE" start --main-service /home/deno/functions/avatar --ip 127.0.0.1 --port "$port" >/dev/null
}
NEW_PUB="{\"default\":\"$PUBLISHABLE_KEY\"}" NEW_SECRET="{\"default\":\"$SECRET_KEY\"}"
# The guard copy is given the Production project's address and well-formed
# new keys: it must refuse before any network call (so the keys are never used).
run_copy crevant-avatar-guard "$GUARD_PORT" -e SUPABASE_URL=https://hmrliwoychnqrbbydorg.supabase.co \
  -e SUPABASE_PUBLISHABLE_KEYS="$NEW_PUB" -e SUPABASE_SECRET_KEYS="$NEW_SECRET"
# Only the new keys (no legacy key in its environment at all).
run_copy crevant-avatar-new "$NEW_PORT" -e SUPABASE_URL="$API_URL" -e SUPABASE_PUBLISHABLE_KEYS="$NEW_PUB" -e SUPABASE_SECRET_KEYS="$NEW_SECRET"
# Only the legacy keys: the transition fallback.
run_copy crevant-avatar-legacy "$LEGACY_PORT" -e SUPABASE_URL="$API_URL" -e SUPABASE_ANON_KEY="$ANON_KEY" -e SUPABASE_SERVICE_ROLE_KEY="$SERVICE_ROLE_KEY"
# No key at all; and a publishable key with only malformed secret values (a
# dictionary without "default", a dummy legacy key): neither may run.
run_copy crevant-avatar-nokeys "$NOKEYS_PORT" -e SUPABASE_URL="$API_URL"
run_copy crevant-avatar-partial "$PARTIAL_PORT" -e SUPABASE_URL="$API_URL" -e SUPABASE_PUBLISHABLE_KEYS="$NEW_PUB" \
  -e SUPABASE_SECRET_KEYS="{\"automations\":\"$SECRET_KEY\"}" -e SUPABASE_SECRET_KEY=dummy -e SUPABASE_SERVICE_ROLE_KEY=dummy
# Each copy must answer; if not, stop here with its state and output.
for c in guard:$GUARD_PORT new:$NEW_PORT legacy:$LEGACY_PORT nokeys:$NOKEYS_PORT partial:$PARTIAL_PORT; do
  private_ports_wait_http "crevant-avatar-${c%%:*}" "${c##*:}" "http://127.0.0.1:${c##*:}/avatar/upload"
done
# The gateway's copy (served by the local Supabase Edge runtime).
private_ports_wait_gateway "$API_URL/functions/v1/avatar/upload"

explain_all() {
  private_ports_explain supabase_edge_runtime_crevant-prototype
  for c in guard:$GUARD_PORT new:$NEW_PORT legacy:$LEGACY_PORT nokeys:$NOKEYS_PORT partial:$PARTIAL_PORT; do private_ports_explain "crevant-avatar-${c%%:*}" "${c##*:}"; done
}
if ! FN_URL="http://127.0.0.1:$NEW_PORT/avatar" LEGACY_URL="http://127.0.0.1:$LEGACY_PORT/avatar" \
  NOKEYS_URL="http://127.0.0.1:$NOKEYS_PORT/avatar" PARTIAL_URL="http://127.0.0.1:$PARTIAL_PORT/avatar" \
  GUARD_URL="http://127.0.0.1:$GUARD_PORT/avatar" node e2e/avatar-edge.e2e.cjs; then
  explain_all
  exit 1
fi
# What each copy said at start-up: which kind of key it holds, never a key.
# shellcheck source=lib/key-logs.sh
. scripts/e2e/lib/key-logs.sh
if ! key_logs_check avatar crevant-avatar-new crevant-avatar-legacy crevant-avatar-nokeys crevant-avatar-partial crevant-avatar-guard \
  "$PUBLISHABLE_KEY $SECRET_KEY $ANON_KEY $SERVICE_ROLE_KEY"; then
  explain_all
  exit 1
fi
