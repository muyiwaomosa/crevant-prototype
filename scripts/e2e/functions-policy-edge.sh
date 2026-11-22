#!/usr/bin/env bash
# Phase 1B-2: the Edge Function project and origin policy, and the
# independent verifier, on the real Edge runtime ("guard copies": each
# function started on its own with a chosen SUPABASE_URL and dummy keys, so
# nothing reaches a real project). Test only; needs Docker.
#
#   1. avatar and post-media as staging, and as member Production (a copy with
#      a TEST member reference written into _shared/projects.ts): the verifier
#      (scripts/functions/verify.mjs) passes: the approved origin only, no CORS
#      grant for any other origin, 401 without a session, the build stamp.
#   2. The verifier catches: an unstamped copy, a stamp for another commit,
#      source that differs from the stamp, a permissive (wildcard) CORS copy,
#      and a copy that refuses to run (503).
#   3. Member Production while its reference is null, the waitlist project and
#      an unknown project: the member functions refuse to run (503).
#   4. join-waitlist: on the waitlist project and staging, responses are
#      identical to its version before the guard (7c8a9ce; status, body, CORS); on member Production
#      and an unknown project it stays closed without reading any secret
#      (its database setting is never even parsed).
set -euo pipefail
cd "$(dirname "$0")/../.."
command -v docker >/dev/null && docker info >/dev/null 2>&1 || { echo "Docker is required" >&2; exit 1; }
EDGE_IMAGE="${EDGE_IMAGE:-supabase/edge-runtime:v1.78.1}"
STAGING=kpudeppgokpjhvaqrprn
WAITLIST=hmrliwoychnqrbbydorg
MEMBER=membersprodtestrefab
COMMIT=$(git rev-parse HEAD)
# The reference for "unchanged": join-waitlist as it was before the Phase 1B-2
# runtime guard (the last commit before it, on main). Pinned, so the
# comparison stays meaningful after the guard itself is on main.
BEFORE_GUARD=7c8a9ce360dac79dee400694104a990c6f66b6bb
git cat-file -e "$BEFORE_GUARD^{commit}" 2>/dev/null || git fetch -q --no-tags origin "$BEFORE_GUARD"
OTHER_COMMIT=$(printf 'f%.0s' $(seq 1 40))
PORT=58460  # the last port used is kept in a file: start runs in a subshell
# The copies use ports from this block, each once. It is inside Linux's range
# for temporary outgoing connections, so on CI it is reserved from them
# (scripts/e2e/lib/private-ports.sh), and each port is checked for any socket,
# not only a listener, before use.
PORT_FIRST=$((PORT + 1)) PORT_LAST=$((PORT + 60))
# shellcheck source=lib/private-ports.sh
. scripts/e2e/lib/private-ports.sh
echo "Temporary connection range: $(private_ports_range). Private ports: $PORT_FIRST to $PORT_LAST"
private_ports_reserve "$PORT_FIRST-$PORT_LAST"
docker image inspect "$EDGE_IMAGE" >/dev/null 2>&1 || docker pull -q "$EDGE_IMAGE" >/dev/null
pass=0; failed=0
ok()  { echo "PASS  functions policy: $1"; pass=$((pass + 1)); }
bad() { echo "FAIL  functions policy: $1"; failed=$((failed + 1)); }
TMP=$(mktemp -d)
# start runs in a subshell (its port is captured), so containers are cleaned up by name.
cleanup() { docker ps -aq --filter name=fnpol- | xargs -r docker rm -f >/dev/null 2>&1 || true; rm -rf "$TMP"; }
trap cleanup EXIT
echo "$PORT" > "$TMP/port"
reset() { docker ps -aq --filter name=fnpol- | xargs -r docker rm -f >/dev/null 2>&1 || true; }

# copy <name> <function> [member]: a copy of supabase/functions, stamped like a deploy (and with the test member reference).
copy() {
  local dir="$TMP/$1"
  mkdir -p "$dir/supabase"
  cp -r supabase/functions "$dir/supabase/functions"
  # Every copy names its own member reference, whatever config records: the
  # test one, or none (null), so these cases never depend on the real project.
  local ref=null
  [ "${3:-}" = member ] && ref="'$MEMBER'"
  sed -i "s/^export const MEMBER_PRODUCTION_REF: string | null = .*$/export const MEMBER_PRODUCTION_REF: string | null = $ref/" "$dir/supabase/functions/_shared/projects.ts"
  grep -qx "export const MEMBER_PRODUCTION_REF: string | null = $ref" "$dir/supabase/functions/_shared/projects.ts" || { echo "could not write the member reference ($ref) into the copy" >&2; exit 1; }
  local digest; digest=$(node scripts/functions/source-digest.mjs "$dir" "$2")
  printf "export const BUILD = '%s.%s'\n" "$COMMIT" "$digest" > "$dir/supabase/functions/_shared/build-info.ts"
  echo "$dir"
}
# This machine's outbound proxy and extra CA, if any (join-waitlist downloads its pinned driver from npm on start).
EXTRA=()
if [ -n "${HTTPS_PROXY:-}" ]; then EXTRA+=(-e HTTPS_PROXY -e HTTP_PROXY -e NO_PROXY=127.0.0.1,localhost); fi
if [ -n "${EDGE_CA_FILE:-}" ]; then EXTRA+=(-v "${EDGE_CA_FILE}:/extra-ca.crt:ro" -e DENO_CERT=/extra-ca.crt); fi
# start <container> <functions root> <function> <SUPABASE_URL> [docker args...]: prints the port.
# The copy must answer (any HTTP reply); if it never does, the script stops
# here with its state and output (redacted), instead of a later "fetch failed".
# If the port was taken between the check and the bind ("Address already in
# use"), the copy is started again on the next port, at most twice: a start-up
# retry only, never a test retry.
start() {
  local name=$1 root=$2 fn=$3 url=$4; shift 4
  local attempt
  for attempt in 1 2 3; do
    PORT=$(( $(cat "$TMP/port") + 1 ))
    # Skip ports with any socket on them (a listener, or an outgoing connection).
    while private_ports_holders "$PORT" >/dev/null || (exec 3<>"/dev/tcp/127.0.0.1/$PORT") 2>/dev/null; do PORT=$((PORT + 1)); done
    if [ "$PORT" -gt "$PORT_LAST" ]; then
      echo "::error::functions policy: no free test port left in $PORT_FIRST to $PORT_LAST" >&2
      return 1
    fi
    echo "$PORT" > "$TMP/port"
    docker rm -f "$name" >/dev/null 2>&1 || true
    docker run -d --name "$name" --network host "${EXTRA[@]}" -e SUPABASE_URL="$url" -e SUPABASE_ANON_KEY=dummy -e SUPABASE_SERVICE_ROLE_KEY=dummy "$@" \
      -v "$root/supabase/functions/$fn:/home/deno/functions/$fn:ro" -v "$root/supabase/functions/_shared:/home/deno/functions/_shared:ro" \
      "$EDGE_IMAGE" start --main-service "/home/deno/functions/$fn" --ip 127.0.0.1 --port "$PORT" >/dev/null
    if private_ports_wait_http "$name" "$PORT" "http://127.0.0.1:$PORT/$fn/x" 120 2>"$TMP/start.err"; then
      echo "$PORT"
      return 0
    fi
    if [ "$attempt" -lt 3 ] && grep -q 'Address already in use' "$TMP/start.err"; then
      echo "::warning::$name could not bind port $PORT (taken after it was checked); starting it on the next port" >&2
      continue
    fi
    cat "$TMP/start.err" >&2
    return 1
  done
}
# A config root for the verifier with the test member reference, name and region.
CFG="$TMP/config-root"
mkdir -p "$CFG/config"
cp config/member-production.json "$CFG/config/"
# This root keeps post-media unapproved (whatever main records), to show the verifier refuses it then.
node -e "const fs = require('fs'); const p = '$CFG/config/member-production.json'; const m = JSON.parse(fs.readFileSync(p, 'utf8')); m.postMediaFunctionApproved = false; fs.writeFileSync(p, JSON.stringify(m))"
node -e "
const fs = require('fs'); const c = JSON.parse(fs.readFileSync('config/supabase-projects.json', 'utf8'))
c.memberProduction = { ref: '$MEMBER', name: 'splitpost-members-production', region: 'ca-central-1' }
fs.writeFileSync('$CFG/config/supabase-projects.json', JSON.stringify(c))"
# The same, with post-media approved (only to show post-media itself is Production compatible).
CFG_PM="$TMP/config-root-pm"; cp -r "$CFG" "$CFG_PM"
node -e "const fs = require('fs'); const p = '$CFG_PM/config/member-production.json'; const m = JSON.parse(fs.readFileSync(p, 'utf8')); m.postMediaFunctionApproved = true; fs.writeFileSync(p, JSON.stringify(m))"
verify() { # verify <expect pass|fail> <description> <expected text or ''> <args...>
  local want=$1 desc=$2 text=$3; shift 3
  local out code
  out=$(node scripts/functions/verify.mjs "$@" 2>&1); code=$?
  if { [ "$want" = pass ] && [ $code -eq 0 ]; } || { [ "$want" = fail ] && [ $code -ne 0 ] && { [ -z "$text" ] || grep -q -- "$text" <<<"$out"; }; }; then ok "$desc ($(tail -1 <<<"$out"))"
  else bad "$desc (exit $code): $(grep -E 'FAIL|REFUSED' <<<"$out" | head -3 | tr '\n' ' ')"; fi
}
set +e

# 1. Passing deployments, staging and member Production, both functions.
for fn in avatar post-media; do
  reset
  S=$(copy "$fn-staging" "$fn")
  P=$(start "fnpol-$fn-staging" "$S" "$fn" "https://$STAGING.supabase.co")
  verify pass "$fn as staging: the verifier passes (Preview origin only, no CORS for others, 401 without a session, build stamp)" '' \
    --target staging --function "$fn" --mode deployed --commit "$COMMIT" --source-root "$S" --base-url "http://127.0.0.1:$P"
  # On GitHub, a passing run records what the runner itself observed being served.
  digest=$(node scripts/functions/source-digest.mjs "$S" "$fn")
  note=$(GITHUB_ACTIONS=true node scripts/functions/verify.mjs --target staging --function "$fn" --mode deployed --commit "$COMMIT" --source-root "$S" --base-url "http://127.0.0.1:$P" 2>&1 | grep '^::notice title=Verified deployment::' || true)
  if [ "$note" = "::notice title=Verified deployment::target=staging ref=$STAGING function=$fn mode=deployed commit=$COMMIT observed_build=$COMMIT.$digest" ]; then ok "$fn: a passing verification records the runner-observed build"
  else bad "$fn: verification evidence line: $note"; fi
  note=$(GITHUB_ACTIONS=true node scripts/functions/verify.mjs --target staging --function "$fn" --mode deployed --commit "$OTHER_COMMIT" --source-root "$S" --base-url "http://127.0.0.1:$P" 2>&1 | grep -c '^::notice title=Verified deployment' || true)
  if [ "$note" = 0 ]; then ok "$fn: a failing verification records no evidence"; else bad "$fn: a failing verification recorded evidence"; fi
  # 2. The verifier catches mismatched build metadata and source.
  verify fail "$fn: a stamp for another commit is caught" 'build:' \
    --target staging --function "$fn" --mode deployed --commit "$OTHER_COMMIT" --source-root "$S" --base-url "http://127.0.0.1:$P"
  CHANGED="$TMP/$fn-changed"; cp -r "$S" "$CHANGED"; echo '// not what was deployed' >> "$CHANGED/supabase/functions/$fn/handler.ts"
  verify fail "$fn: source that differs from the deployed stamp is caught" 'build:' \
    --target staging --function "$fn" --mode deployed --commit "$COMMIT" --source-root "$CHANGED" --base-url "http://127.0.0.1:$P"
  cfg=$CFG; [ "$fn" = post-media ] && cfg=$CFG_PM
  verify fail "$fn as staging, checked as member Production: the member origin is refused there" 'cors:' \
    --target member-production --function "$fn" --mode deployed --commit "$COMMIT" --source-root "$S" --base-url "http://127.0.0.1:$P" --config-root "$cfg" --skip-absence
  M=$(copy "$fn-member" "$fn" member)
  P=$(start "fnpol-$fn-member" "$M" "$fn" "https://$MEMBER.supabase.co")
  verify pass "$fn as member Production (test reference): the verifier passes (app.splitpost.ca only)" '' \
    --target member-production --function "$fn" --mode deployed --commit "$COMMIT" --source-root "$M" --base-url "http://127.0.0.1:$P" --config-root "$cfg" --skip-absence
done
# post-media on member Production is refused by the verifier while unapproved, unless explicitly for the approved config.
verify fail "post-media on member Production: not verifiable as deployed while postMediaFunctionApproved is false" 'not approved' \
  --target member-production --function post-media --mode deployed --commit "$COMMIT" --source-root "$TMP/post-media-member" --base-url "http://127.0.0.1:$PORT" --config-root "$CFG" --skip-absence
# (the passing member post-media check above used a copy of the config with post-media approved)

reset
# 2b. An unstamped copy (the repository as is) and a permissive CORS copy.
U=$(mktemp -d -p "$TMP"); mkdir -p "$U/supabase"; cp -r supabase/functions "$U/supabase/functions"
P=$(start fnpol-unstamped "$U" avatar "https://$STAGING.supabase.co")
verify fail "an unstamped deployment is caught" 'build:' \
  --target staging --function avatar --mode deployed --commit "$COMMIT" --source-root "$U" --base-url "http://127.0.0.1:$P"
W=$(copy wildcard avatar)
sed -i "s/    : { Vary: 'Origin' }/    : { 'Access-Control-Allow-Origin': '*', Vary: 'Origin' }/" "$W/supabase/functions/_shared/policy.ts"
grep -q "'Access-Control-Allow-Origin': '\*'" "$W/supabase/functions/_shared/policy.ts" || bad "could not build the permissive copy"
digest=$(node scripts/functions/source-digest.mjs "$W" avatar); printf "export const BUILD = '%s.%s'\n" "$COMMIT" "$digest" > "$W/supabase/functions/_shared/build-info.ts"
P=$(start fnpol-wildcard "$W" avatar "https://$STAGING.supabase.co")
verify fail "a permissive (wildcard) CORS deployment is caught" 'cors:' \
  --target staging --function avatar --mode deployed --commit "$COMMIT" --source-root "$W" --base-url "http://127.0.0.1:$P"

reset
# 3. Refusing to run: member Production while its reference is null, the waitlist project, an unknown project.
N=$(copy null-member avatar)
for case in "member Production while its reference is null|https://$MEMBER.supabase.co" "the waitlist project|https://$WAITLIST.supabase.co" "an unknown project|https://abcdefghijabcdefghij.supabase.co"; do
  IFS='|' read -r what url <<<"$case"
  P=$(start "fnpol-refuse-$RANDOM" "$N" avatar "$url")
  code=$(curl -s -o /dev/null -w '%{http_code}' -X POST -H 'Content-Type: application/json' -d '{}' "http://127.0.0.1:$P/avatar/urls")
  acao=$(curl -s -D - -o /dev/null -X OPTIONS -H 'Origin: https://app.splitpost.ca' -H 'Access-Control-Request-Method: POST' "http://127.0.0.1:$P/avatar/urls" | grep -ci '^access-control-allow-origin' || true)
  if [ "$code" = 503 ] && [ "$acao" = 0 ]; then ok "avatar on $what refuses to run (503, no CORS grant)"; else bad "avatar on $what: $code, CORS grants $acao"; fi
done
P=$(start fnpol-refuse-verify "$N" avatar "https://$MEMBER.supabase.co")
verify fail "the verifier fails a function that refuses to run" 'a 503 means' \
  --target member-production --function avatar --mode deployed --commit "$COMMIT" --source-root "$N" --base-url "http://127.0.0.1:$P" --config-root "$CFG" --skip-absence

reset
# 4. join-waitlist: identical to main's version where allowed; closed, no secret read, elsewhere.
OLD="$TMP/join-old"; mkdir -p "$OLD/supabase/functions/join-waitlist" "$OLD/supabase/functions/_shared"
for f in index.ts handler.ts db.ts; do git show "$BEFORE_GUARD:supabase/functions/join-waitlist/$f" > "$OLD/supabase/functions/join-waitlist/$f"; done
grep -q waitlistProjectAllowed "$OLD/supabase/functions/join-waitlist/index.ts" && bad "the reference copy already has the guard (wrong reference commit)"
NEW="$TMP/join-new"; mkdir -p "$NEW/supabase"; cp -r supabase/functions "$NEW/supabase/functions"
NEWM=$(copy join-member join-waitlist member)
WENV=(-e WAITLIST_FUNCTION_ENABLED=true -e WAITLIST_ALLOWED_ORIGINS=https://site.test -e WAITLIST_ALLOWED_HOSTNAMES=site.test
      -e WAITLIST_RATE_SALT=a-test-salt-that-is-long-enough-12345 -e TURNSTILE_SECRET_KEY=placeholder-never-sent -e WAITLIST_CLIENT_ADDRESS=ignore
      -e "WAITLIST_DB_URL=postgresql://not_the_writer:pw@db.example.invalid:5432/postgres")
probe() { # probe <port>: status, body and CORS for a fixed set of requests
  local p=$1
  for req in "GET||" "OPTIONS|https://site.test|" "POST|https://site.test|{}" "POST|https://evil.example|{}" "POST||{\"email\":\"a@b.test\"}"; do
    IFS='|' read -r m o b <<<"$req"
    local args=(-s -D - -X "$m")
    [ -n "$o" ] && args+=(-H "Origin: $o")
    [ -n "$b" ] && args+=(-H 'Content-Type: application/json' -d "$b")
    curl "${args[@]}" "http://127.0.0.1:$p/join-waitlist" | tr -d '\r' | grep -iE '^HTTP/|^access-control-|^content-type|^\{' | sed -E 's/^(HTTP\/[0-9.]+) /HTTP /' | sort
    echo "--"
  done
}
for where in "the waitlist project|https://$WAITLIST.supabase.co" "staging|https://$STAGING.supabase.co"; do
  IFS='|' read -r what url <<<"$where"
  newname="fnpol-join-new-$RANDOM"
  Po=$(start "fnpol-join-old-$RANDOM" "$OLD" join-waitlist "$url" "${WENV[@]}")
  Pn=$(start "$newname" "$NEW" join-waitlist "$url" "${WENV[@]}")
  a=$(probe "$Po"); b=$(probe "$Pn")
  if [ "$(grep -c '^HTTP' <<<"$a")" = 5 ] && [ "$a" = "$b" ]; then ok "join-waitlist on $what answers exactly as before the guard ($(grep -c '^HTTP' <<<"$a") requests compared)"
  else bad "join-waitlist on $what differs from its version before the guard:"; diff <(echo "$a") <(echo "$b") | head -10; fi
  if docker logs "$newname" 2>&1 | grep -q 'not an approved project'; then bad "join-waitlist on $what logged the project guard"; fi
done
for where in "member Production|https://$MEMBER.supabase.co|$NEWM" "an unknown project|https://abcdefghijabcdefghij.supabase.co|$NEW"; do
  IFS='|' read -r what url root <<<"$where"
  name="fnpol-join-closed-$RANDOM"
  P=$(start "$name" "$root" join-waitlist "$url" "${WENV[@]}")
  probe "$P" >/dev/null
  logs=$(docker logs "$name" 2>&1)
  post=$(curl -s -o /dev/null -w '%{http_code}' -X POST -H 'Origin: https://site.test' -H 'Content-Type: application/json' -d '{}' "http://127.0.0.1:$P/join-waitlist")
  if grep -q 'not an approved project for join-waitlist' <<<"$logs" && ! grep -q 'WAITLIST_DB_URL' <<<"$logs" && [ "$post" != 200 ] && [ "$post" != 201 ]; then
    ok "join-waitlist on $what stays closed and never reads its secrets (the database setting is not even parsed; POST $post)"
  else bad "join-waitlist on $what: POST $post, logs: $(head -c 300 <<<"$logs")"; fi
done
# The allowed version does parse the (deliberately wrong) database setting: so its absence above means it was not read.
name="fnpol-join-parses-$RANDOM"
P=$(start "$name" "$NEW" join-waitlist "https://$STAGING.supabase.co" "${WENV[@]}")
probe "$P" >/dev/null
if docker logs "$name" 2>&1 | grep -q 'WAITLIST_DB_URL'; then ok "control: on staging the same settings ARE read (the wrong database setting is reported)"; else bad "control: the staging copy did not report the wrong database setting"; fi

echo "Functions policy tests: $pass passed, $failed failed"
[ "$failed" -eq 0 ]
