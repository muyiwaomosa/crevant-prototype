#!/usr/bin/env bash
# The post-media Edge Function (Build 5.3) against a real LOCAL Supabase:
# Storage, the Edge runtime and the database, through the same gateway the
# app uses (e2e/post-media-edge.e2e.cjs). The gateway's JWT check is off for
# this function (as deployed): it verifies every member with Supabase Auth.
#
# Also starts more copies of the function in the same Edge runtime image:
#   * one with ONLY the new API keys (publishable and secret, as the JSON
#     dictionaries hosted Supabase provides) and a test drain key (generated
#     here, never stored): the whole suite runs on it, the scheduled drain
#     and the browser origin checks included;
#   * one with ONLY the legacy anon and service_role keys: the transition
#     fallback still works;
#   * one with no key at all, and one with only a publishable key and
#     malformed others: both must refuse to run (503), even the drain;
#   * one given the PRODUCTION project's address, to prove it refuses to run.
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
export PUBLISHABLE_KEY="$(val PUBLISHABLE_KEY)" SECRET_KEY="$(val SECRET_KEY)"
case "$API_URL" in http://127.0.0.1:*|http://localhost:*) ;; *) echo "Refusing: API_URL is not local ($API_URL)" >&2; exit 1 ;; esac

EDGE_IMAGE="${EDGE_IMAGE:-supabase/edge-runtime:v1.78.1}"
DRAIN_PORT="${DRAIN_PORT:-54398}"
GUARD_PORT="${GUARD_PORT:-54399}"
LEGACY_PORT="${LEGACY_PORT:-54404}" NOKEYS_PORT="${NOKEYS_PORT:-54405}" PARTIAL_PORT="${PARTIAL_PORT:-54406}"
case "$SECRET_KEY" in sb_secret_*) ;; *) echo "The local Supabase gave no secret key (sb_secret_...); a newer Supabase CLI is needed" >&2; exit 1 ;; esac
DRAIN_KEY="$(node -e 'process.stdout.write(require("crypto").randomBytes(24).toString("hex"))')"
export DRAIN_KEY
# shellcheck source=lib/private-ports.sh
. scripts/e2e/lib/private-ports.sh
export PRIVATE_PORTS_REDACT="$DRAIN_KEY $SERVICE_ROLE_KEY $ANON_KEY $PUBLISHABLE_KEY $SECRET_KEY"
COPIES="crevant-media-drain crevant-media-guard crevant-media-legacy crevant-media-nokeys crevant-media-partial"
# shellcheck disable=SC2086
cleanup() { docker rm -f $COPIES >/dev/null 2>&1 || true; }
trap cleanup EXIT
cleanup
# Reserve (CI), pull and wait for every port before binding them.
private_ports_prepare "$EDGE_IMAGE" "$DRAIN_PORT" "$GUARD_PORT" "$LEGACY_PORT" "$NOKEYS_PORT" "$PARTIAL_PORT"
# run_copy <container> <port> [docker -e arguments...]: the function alone, with exactly the given environment.
run_copy() {
  local name=$1 port=$2; shift 2
  docker run -d --name "$name" --network host "$@" \
    -v "$PWD/supabase/functions/post-media:/home/deno/functions/post-media:ro" \
    -v "$PWD/supabase/functions/_shared:/home/deno/functions/_shared:ro" \
    "$EDGE_IMAGE" start --main-service /home/deno/functions/post-media --ip 127.0.0.1 --port "$port" >/dev/null
}
NEW_PUB="{\"default\":\"$PUBLISHABLE_KEY\"}" NEW_SECRET="{\"default\":\"$SECRET_KEY\"}"
# Only the new keys (no legacy key in its environment at all), and the drain key.
run_copy crevant-media-drain "$DRAIN_PORT" -e SUPABASE_URL="$API_URL" -e SUPABASE_PUBLISHABLE_KEYS="$NEW_PUB" -e SUPABASE_SECRET_KEYS="$NEW_SECRET" -e MEDIA_DRAIN_KEY="$DRAIN_KEY"
# The guard copy has the Production address and well-formed new keys: it must refuse before any network call.
run_copy crevant-media-guard "$GUARD_PORT" -e SUPABASE_URL=https://hmrliwoychnqrbbydorg.supabase.co \
  -e SUPABASE_PUBLISHABLE_KEYS="$NEW_PUB" -e SUPABASE_SECRET_KEYS="$NEW_SECRET" -e MEDIA_DRAIN_KEY="$DRAIN_KEY"
# Only the legacy keys: the transition fallback.
run_copy crevant-media-legacy "$LEGACY_PORT" -e SUPABASE_URL="$API_URL" -e SUPABASE_ANON_KEY="$ANON_KEY" -e SUPABASE_SERVICE_ROLE_KEY="$SERVICE_ROLE_KEY"
# No key at all; and a publishable key with only malformed secret values: neither
# may run, even for the drain with its key.
run_copy crevant-media-nokeys "$NOKEYS_PORT" -e SUPABASE_URL="$API_URL" -e MEDIA_DRAIN_KEY="$DRAIN_KEY"
run_copy crevant-media-partial "$PARTIAL_PORT" -e SUPABASE_URL="$API_URL" -e SUPABASE_PUBLISHABLE_KEYS="$NEW_PUB" -e MEDIA_DRAIN_KEY="$DRAIN_KEY" \
  -e SUPABASE_SECRET_KEYS="{\"automations\":\"$SECRET_KEY\"}" -e SUPABASE_SECRET_KEY=dummy -e SUPABASE_SERVICE_ROLE_KEY=dummy
# Each copy must answer; if not, stop here with its state and output.
for c in drain:$DRAIN_PORT guard:$GUARD_PORT legacy:$LEGACY_PORT nokeys:$NOKEYS_PORT partial:$PARTIAL_PORT; do
  private_ports_wait_http "crevant-media-${c%%:*}" "${c##*:}" "http://127.0.0.1:${c##*:}/post-media/photo"
done
# The gateway's copy (served by the local Supabase Edge runtime).
private_ports_wait_gateway "$API_URL/functions/v1/post-media/photo"

explain_all() {
  # Explain, then fail: the gateway's Edge runtime and every copy, redacted.
  private_ports_explain supabase_edge_runtime_crevant-prototype
  for c in drain:$DRAIN_PORT guard:$GUARD_PORT legacy:$LEGACY_PORT nokeys:$NOKEYS_PORT partial:$PARTIAL_PORT; do private_ports_explain "crevant-media-${c%%:*}" "${c##*:}"; done
}
if ! FN_URL="http://127.0.0.1:$DRAIN_PORT/post-media" DRAIN_URL="http://127.0.0.1:$DRAIN_PORT/post-media" GUARD_URL="http://127.0.0.1:$GUARD_PORT/post-media" \
  LEGACY_URL="http://127.0.0.1:$LEGACY_PORT/post-media" NOKEYS_URL="http://127.0.0.1:$NOKEYS_PORT/post-media" PARTIAL_URL="http://127.0.0.1:$PARTIAL_PORT/post-media" \
  node e2e/post-media-edge.e2e.cjs; then
  explain_all
  exit 1
fi
# What each copy said at start-up: which kind of key it holds, never a key.
# shellcheck source=lib/key-logs.sh
. scripts/e2e/lib/key-logs.sh
if ! key_logs_check post-media crevant-media-drain crevant-media-legacy crevant-media-nokeys crevant-media-partial crevant-media-guard \
  "$PUBLISHABLE_KEY $SECRET_KEY $ANON_KEY $SERVICE_ROLE_KEY $DRAIN_KEY"; then
  explain_all
  exit 1
fi
