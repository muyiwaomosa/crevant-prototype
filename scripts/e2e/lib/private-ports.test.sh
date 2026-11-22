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
  docker rm -f crevant-ports-test-stops crevant-ports-test-silent crevant-ports-test-leaky >/dev/null 2>&1 || true
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

# 6. Every secret the e2e scripts pass to a container, printed by that
# container in every way we can think of, never reaches the explanation:
# its environment values are read from the container itself (not listed by
# hand), and tokens, keys, signed links and email addresses are masked by
# shape. Ordinary configuration stays readable.
rnd() { openssl rand -hex "$1"; }
JWT_A="eyJhbGciOiJIUzI1NiJ9.eyJyb2xlIjoic2VydmljZV9yb2xlIn0.$(rnd 16)"
JWT_B="eyJhbGciOiJFUzI1NiJ9.eyJyb2xlIjoiYW5vbiJ9.$(rnd 16)"
DRAIN="$(rnd 24)"; SALT_V="$(rnd 32)"; WPW="$(rnd 24)"; OPW="$(rnd 24)"; JWTS="jwt-secret-$(rnd 16)"
SKEY="sb_secret_$(rnd 12)"; PKEY="sb_publishable_$(rnd 12)"; TURN="turnstile-$(rnd 12)"
docker run -d --name crevant-ports-test-leaky \
  -e SUPABASE_URL=http://127.0.0.1:54321 -e SUPABASE_SERVICE_ROLE_KEY="$JWT_A" -e SUPABASE_ANON_KEY="$JWT_B" \
  -e MEDIA_DRAIN_KEY="$DRAIN" -e WAITLIST_RATE_SALT="$SALT_V" -e WRITER_PW="$WPW" -e POSTGRES_PASSWORD="$OPW" \
  -e WAITLIST_DB_URL="postgresql://waitlist_writer:${WPW}@127.0.0.1:54322/postgres" -e SUPABASE_INTERNAL_JWT_SECRET="$JWTS" \
  -e SUPABASE_INTERNAL_SECRET_KEY="$SKEY" -e SUPABASE_INTERNAL_PUBLISHABLE_KEY="$PKEY" -e TURNSTILE_SECRET_KEY="$TURN" \
  -e WAITLIST_TRUSTED_PROXY_HOPS=1 -e WAITLIST_ALLOWED_ORIGINS=https://site.test \
  --entrypoint sh "$EDGE_IMAGE" -c 'env | sort
    echo "boot: connecting to $WAITLIST_DB_URL as writer (password $WRITER_PW)"
    echo "request: Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY apikey=$SUPABASE_ANON_KEY"
    echo "link: /storage/v1/object/sign/post-photos/a.jpg?token=$MEDIA_DRAIN_KEY&download=1"
    echo "member: someone.private@example.com signed up"
    echo "other: postgresql://reader:inline-pass-not-in-env@127.0.0.1:5432/x"
    exit 4' >/dev/null
for _ in $(seq 1 20); do [ "$(docker inspect -f '{{.State.Status}}' crevant-ports-test-leaky)" = exited ] && break; sleep 0.25; done
private_ports_explain crevant-ports-test-leaky 54482 >"$tmp/leaky" 2>&1 || true
leaked=""
for v in "$JWT_A" "$JWT_B" "$DRAIN" "$SALT_V" "$WPW" "$OPW" "$JWTS" "$SKEY" "$PKEY" "$TURN" "someone.private@example.com" "inline-pass-not-in-env"; do
  grep -qF -- "$v" "$tmp/leaky" && leaked="$leaked ${v:0:6}..."
done
if [ -z "$leaked" ] && grep -q 'status=exited exit=4' "$tmp/leaky" && grep -q 'SUPABASE_URL=http://127.0.0.1:54321' "$tmp/leaky" \
   && grep -q 'WAITLIST_TRUSTED_PROXY_HOPS=1' "$tmp/leaky" && grep -q 'connecting to \*\*\* as writer (password \*\*\*)' "$tmp/leaky" && grep -q 'postgresql://reader:\*\*\*@127.0.0.1:5432/x' "$tmp/leaky" \
   && grep -q 'Bearer \*\*\*' "$tmp/leaky" && grep -q 'token=\*\*\*&download=1' "$tmp/leaky" && grep -q '\*\*\*@\*\*\*' "$tmp/leaky"; then
  pass "a container printing twelve secrets (env, URLs, header, signed link, email) shows none of them; configuration stays readable"
else
  fail "secret masking in container output" "leaked:${leaked:- none}; output: $(head -c 600 "$tmp/leaky" | private_ports_redact crevant-ports-test-leaky)"
fi

echo
[ "$failures" -eq 0 ] && echo "ALL CHECKS PASSED" || { echo "$failures CHECK(S) FAILED"; exit 1; }
