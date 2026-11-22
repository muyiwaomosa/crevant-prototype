#!/usr/bin/env bash
# Tests for scripts/e2e/lib/private-ports.sh: a busy port, a container that
# stops, and one that never answers all fail at once with an explanation, and
# secret values never reach that explanation. Needs Docker and the pinned Edge
# runtime image (pulled if missing). Local only; uses ports 54480 to 54482.
set -euo pipefail
cd "$(dirname "$0")/../../.."
. scripts/e2e/lib/private-ports.sh
EDGE_IMAGE="${EDGE_IMAGE:-supabase/edge-runtime:v1.78.1}"
failures=0
pass() { echo "PASS  $1"; }
fail() { echo "FAIL  $1${2:+  ($2)}"; failures=$((failures + 1)); }
tmp="$(mktemp -d)"
holder_pid=""
cleanup() {
  [ -n "$holder_pid" ] && kill "$holder_pid" 2>/dev/null || true
  docker rm -f crevant-ports-test-stops crevant-ports-test-silent >/dev/null 2>&1 || true
  rm -rf "$tmp"
}
trap cleanup EXIT

# 1. Redaction: URL credentials and listed values, taken literally.
out="$(PRIVATE_PORTS_REDACT="s3cr.t+1 other-secret" private_ports_redact <<'IN'
postgresql://waitlist_writer:pw-in-url@127.0.0.1:54322/postgres
key s3cr.t+1 and other-secret, but s3crXt+1 is not it
http://127.0.0.1:54398/post-media
IN
)"
if [ "$out" = 'postgresql://waitlist_writer:***@127.0.0.1:54322/postgres
key *** and ***, but s3crXt+1 is not it
http://127.0.0.1:54398/post-media' ]; then pass "redaction masks URL passwords and listed values, literally"; else fail "redaction" "$out"; fi

# 2. The range is printed, from the kernel.
range="$(private_ports_range)"
[[ "$range" =~ ^[0-9]+\ to\ [0-9]+$ ]] && pass "the temporary connection range is read ($range)" || fail "range" "$range"

# 3. A free port passes; a held port fails, naming the port and its holder.
if PRIVATE_PORTS_WAIT=2 private_ports_prepare "$EDGE_IMAGE" 54480 >"$tmp/free" 2>&1; then pass "a free port is ready"; else fail "a free port is ready" "$(cat "$tmp/free")"; fi
python3 -c 'import socket,time; s=socket.socket(); s.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1); s.bind(("127.0.0.1", 54481)); s.listen(); time.sleep(60)' &
holder_pid=$!
for _ in $(seq 1 20); do private_ports_holders 54481 >/dev/null && break; sleep 0.2; done
if PRIVATE_PORTS_WAIT=2 private_ports_prepare "$EDGE_IMAGE" 54480 54481 >"$tmp/busy" 2>&1; then
  fail "a held port fails preparation" "it passed"
elif grep -q 'still in use after 2 seconds: 54481' "$tmp/busy" && grep -q 'Port 54481 is held by:' "$tmp/busy" && grep -q 'state=0A' "$tmp/busy"; then
  pass "a held port fails preparation at once, naming the port and its listening holder"
else
  fail "a held port's explanation" "$(cat "$tmp/busy")"
fi
kill "$holder_pid" 2>/dev/null || true; wait "$holder_pid" 2>/dev/null || true; holder_pid=""

# 4. A container that stops fails at once (not after the full wait), with its
# exit status and output, and a secret in that output is masked.
docker run -d --name crevant-ports-test-stops --entrypoint sh "$EDGE_IMAGE" -c 'echo "boot failed for postgresql://u:leaked-pw@db/x with token tok-SECRET-123"; exit 3' >/dev/null
start=$(date +%s)
if PRIVATE_PORTS_REDACT="tok-SECRET-123" private_ports_wait_http crevant-ports-test-stops 54482 "http://127.0.0.1:54482/" 30 >"$tmp/stops" 2>&1; then
  fail "a stopped container fails" "it passed"
else
  took=$(( $(date +%s) - start ))
  if grep -q 'stopped before answering on port 54482' "$tmp/stops" && grep -q 'status=exited exit=3' "$tmp/stops" \
     && grep -q 'boot failed for postgresql://u:\*\*\*@db/x with token \*\*\*' "$tmp/stops" \
     && ! grep -q 'leaked-pw\|tok-SECRET-123' "$tmp/stops" && [ "$took" -lt 15 ]; then
    pass "a stopped container fails in ${took}s with its exit status and redacted output"
  else
    fail "a stopped container's explanation" "took ${took}s: $(cat "$tmp/stops")"
  fi
fi

# 5. A running container that never answers fails after the wait, explained.
docker run -d --name crevant-ports-test-silent --entrypoint sh "$EDGE_IMAGE" -c 'echo still starting; sleep 60' >/dev/null
if private_ports_wait_http crevant-ports-test-silent 54482 "http://127.0.0.1:54482/" 3 >"$tmp/silent" 2>&1; then
  fail "a silent container fails" "it passed"
elif grep -q 'did not answer on port 54482 within 3 seconds' "$tmp/silent" && grep -q 'status=running' "$tmp/silent" && grep -q 'still starting' "$tmp/silent"; then
  pass "a container that never answers fails after the wait, with its state and output"
else
  fail "a silent container's explanation" "$(cat "$tmp/silent")"
fi

echo
[ "$failures" -eq 0 ] && echo "ALL CHECKS PASSED" || { echo "$failures CHECK(S) FAILED"; exit 1; }
