#!/usr/bin/env bash
# Runs the A3 proxy diagnostic (the real index.ts) in Supabase's Edge runtime
# on this machine, and checks it from outside. Local only: it contacts no
# hosted service. Temporary branch only.
#
# Four instances, each with throwaway settings made here:
#   good      enabled, a fresh random token, a 3 hour window
#   off       everything set except DIAG_ENABLED
#   elsewhere enabled, but SUPABASE_URL names another project
#   expiring  enabled, expiring 40 seconds after start (automatic refusal)
#
# Requires Docker and Node. The token exists only in this shell and the
# instances' environment, and is never printed.
set -euo pipefail
cd "$(dirname "$0")"

EDGE_IMAGE="${EDGE_IMAGE:-supabase/edge-runtime:v1.78.1}"
BASE_PORT="${BASE_PORT:-54410}"
STAGING_URL="https://kpudeppgokpjhvaqrprn.supabase.co"
TOKEN="$(openssl rand 32 | base64 | tr '+/' '-_' | tr -d '=\n')"
HASH="$(printf %s "$TOKEN" | openssl dgst -sha256 -r | cut -d' ' -f1)"
iso() { date -u -d "@$1" +%Y-%m-%dT%H:%M:%SZ; }
NOW=$(date -u +%s)
NAMES=(crevant-diag-good crevant-diag-off crevant-diag-elsewhere crevant-diag-expiring)

cleanup() { docker rm -f "${NAMES[@]}" >/dev/null 2>&1 || true; }
trap cleanup EXIT

start() { # name port enabled supabase_url activated expires
  docker run -d --name "$1" --network host \
    -e DIAG_ENABLED="$3" -e DIAG_TOKEN_SHA256="$HASH" -e SUPABASE_URL="$4" \
    -e DIAG_ACTIVATED_AT="$5" -e DIAG_EXPIRES_AT="$6" \
    -v "$PWD/deploy/supabase/functions/proxy-diagnostic:/home/deno/functions/proxy-diagnostic:ro" \
    "$EDGE_IMAGE" start --main-service /home/deno/functions/proxy-diagnostic --ip 127.0.0.1 --port "$2" >/dev/null
}
start crevant-diag-good      "$BASE_PORT"         true  "$STAGING_URL" "$(iso $((NOW - 60)))" "$(iso $((NOW + 3 * 3600)))"
start crevant-diag-off       "$((BASE_PORT + 1))" false "$STAGING_URL" "$(iso $((NOW - 60)))" "$(iso $((NOW + 3 * 3600)))"
start crevant-diag-elsewhere "$((BASE_PORT + 2))" true  "https://abcdefghijabcdefghij.supabase.co" "$(iso $((NOW - 60)))" "$(iso $((NOW + 3 * 3600)))"
start crevant-diag-expiring  "$((BASE_PORT + 3))" true  "$STAGING_URL" "$(iso $((NOW - 60)))" "$(iso $((NOW + 40)))"

for p in "$BASE_PORT" "$((BASE_PORT + 1))" "$((BASE_PORT + 2))" "$((BASE_PORT + 3))"; do
  for _ in $(seq 1 60); do
    curl -s -o /dev/null "http://127.0.0.1:$p/" && break
    sleep 1
  done
done

TOKEN="$TOKEN" EXPIRES_AT_EPOCH=$((NOW + 40)) BASE_PORT="$BASE_PORT" node e2e.cjs

# Logs: the status code only. No address, header value, token or hash.
logs="$(for n in "${NAMES[@]}"; do docker logs "$n" 2>&1; done)"
leaks=0
for needle in "$TOKEN" "$HASH" 81.2.69 198.51.100 203.0.113 2a00 2001:db8 'for=' '<script>' x-forwarded x-diag; do
  if grep -qiF -- "$needle" <<<"$logs"; then echo "FAIL  the runtime's logs contain a sensitive value"; leaks=$((leaks + 1)); fi
done
if grep -v '^{"event":"diag","status":\(200\|404\)}$' <<<"$(grep '"event"' <<<"$logs")" | grep -q .; then
  echo "FAIL  a log line other than {event, status}"; leaks=$((leaks + 1))
fi
[ "$(grep -c '"event":"diag"' <<<"$logs")" -gt 10 ] || { echo "FAIL  expected one log line per request"; leaks=$((leaks + 1)); }
[ $leaks -eq 0 ] && echo "PASS  logs hold only {event, status}: no address, header value, token or hash" || exit 1
