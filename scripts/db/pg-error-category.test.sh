#!/usr/bin/env bash
# Tests scripts/db/pg-error-category.sh and its use in
# scripts/db/verify-members-identity.sh:
#   1. realistic libpq and Supavisor error texts map to the right category;
#   2. the output is always exactly one word from the fixed list, and never
#      contains any part of the input (secrets planted in every sample, and in
#      random and hostile inputs);
#   3. the helper can only print literals (static check of its source);
#   4. with ADMIN_DATABASE_URL (a LOCAL server; hosted Supabase is refused),
#      the real identity script fails with the right category for a wrong
#      password, a closed port, a missing role (which Postgres reports as a
#      password failure), a missing database, a failed
#      TLS verification and an unparsable URL, and its whole output contains
#      no password, user, database name, host, port, URL or marker.
# Read only: part 4 creates one throwaway role and drops it on exit.
set -uo pipefail
cd "$(dirname "$0")/../.."
. scripts/db/pg-error-category.sh
pass=0; failed=0
ok()  { echo "PASS  pg-error-category: $1"; pass=$((pass + 1)); }
bad() { echo "FAIL  pg-error-category: $1"; failed=$((failed + 1)); }
CATS=" $(sed -n 's/^#   \([a-z_]*\) .*/\1/p' scripts/db/pg-error-category.sh | tr '\n' ' ')"
rnd() { openssl rand -hex 8; }
PW="Pw$(rnd)Secret"; USR="postgres.leak$(rnd)"; HOSTN="aws-9-leak$(rnd).pooler.supabase.com"; IP="203.0.113.$((RANDOM % 200 + 20))"
TOKEN="sbp_$(rnd)$(rnd)"; MARKER=$(openssl rand -hex 32); URL="postgresql://$USR:$PW@$HOSTN:5432/postgres"
SECRETS=("$PW" "$USR" "leak" "$HOSTN" "$IP" "$TOKEN" "$MARKER" "$URL" "supabase.com" "5432" "postgresql://")

# check <expected category> <description> <error text>
check() {
  local got lines s
  got="$(printf '%s' "$3" | pg_error_category)"
  lines="$(printf '%s\n' "$got" | grep -c .)"
  if [ "$lines" != 1 ] || [[ ! "$got" =~ ^[a-z_]+$ ]] || [[ "$CATS" != *" $got "* ]]; then bad "$2: output is not one listed category"; return; fi
  for s in "${SECRETS[@]}"; do [[ "$got" == *"$s"* ]] && { bad "$2: the output contains part of the input"; return; }; done
  if [ -z "$1" ] || [ "$got" = "$1" ]; then ok "$2 -> $got"; else bad "$2: expected $1, got $got"; fi
}

# 1 and 2. Realistic texts, each carrying the secrets a real message could.
C="connection to server at \"$HOSTN\" ($IP), port 5432 failed"
check invalid_connection_string "unparsable URL" "psql: error: invalid URI query parameter: \"x$PW\""
check invalid_connection_string "bad percent encoding" "psql: error: invalid percent-encoded token: \"$PW%zz\""
check dns_lookup_failed "DNS" "psql: error: could not translate host name \"$HOSTN\" to address: Name or service not known"
check network_unreachable "no route" "psql: error: $C: Network is unreachable"
check tcp_connection_refused "pooler port closed" "psql: error: $C: Connection refused
	Is the server running on that host and accepting TCP/IP connections?"
check tcp_timeout "pooler silent" "psql: error: $C: timeout expired"
check tls_not_supported "no TLS offered" "psql: error: $C: server does not support SSL, but SSL was required"
check tls_certificate_failed "certificate rejected" "psql: error: $C: SSL error: certificate verify failed"
check tls_certificate_failed "host name mismatch" "psql: error: $C: server certificate for \"$HOSTN\" does not match host name \"$HOSTN\""
check tls_certificate_failed "root CA missing" "psql: error: root certificate file \"/home/runner/$TOKEN.crt\" does not exist"
check tls_handshake_failed "TLS dropped" "psql: error: $C: SSL SYSCALL error: EOF detected"
check pooler_circuit_breaker "Supavisor circuit breaker" "psql: error: $C: FATAL:  (ECIRCUITBREAKER) too many authentication errors for $USR"
check pooler_max_clients "Supavisor client limit" "psql: error: $C: FATAL:  (EMAXCLIENTS) Max client connections reached"
check pooler_tenant_or_user_not_found "Supavisor unknown tenant" "psql: error: $C: FATAL:  Tenant or user not found"
check pooler_upstream_unavailable "Supavisor cannot reach Postgres" "psql: error: $C: FATAL:  (EDBHANDLEREXITED) DbHandler exited: {:error, :econnrefused} for $USR"
check pooler_upstream_unavailable "Supavisor econnrefused" "psql: error: $C: FATAL:  Connection failed {:error, :econnrefused}"
check password_authentication_failed "wrong password" "psql: error: $C: FATAL:  password authentication failed for user \"$USR\""
check role_does_not_exist "missing role" "psql: error: $C: FATAL:  role \"$USR\" does not exist"
check database_does_not_exist "missing database" "psql: error: $C: FATAL:  database \"leak$TOKEN\" does not exist"
check too_many_connections "role limit" "psql: error: $C: FATAL:  too many connections for role \"$USR\""
check too_many_connections "slots" "psql: error: $C: FATAL:  remaining connection slots are reserved for roles with the SUPERUSER attribute"
check database_not_accepting_connections "starting" "psql: error: $C: FATAL:  the database system is starting up"
check server_closed_connection "dropped" "psql: error: $C: server closed the connection unexpectedly
	This probably means the server terminated abnormally"
check query_error "connected, query failed" "ERROR:  permission denied for schema env_identity $TOKEN"
check no_error_text "no text" ""
check unknown "unrecognized text" "psql: something new happened to $USR at $HOSTN with $PW"
# Hostile: the input tries to look like output, or holds only secrets.
check "" "input that is only secrets" "$URL $PW $MARKER $TOKEN"
check "" "input with a newline and a fake category" "unknown
$PW"
check "" "input with shell metacharacters" "\$(echo $PW) \`id\` '; echo $TOKEN #"
for i in $(seq 1 200); do
  r="$(head -c $((RANDOM % 300 + 1)) /dev/urandom | tr -d '\0') $PW $URL"
  got="$(printf '%s' "$r" | pg_error_category)"
  if [[ "$CATS" != *" $got "* ]] || [[ "$got" == *"$PW"* ]]; then bad "random input $i: output $got"; break; fi
done
[ "$i" = 200 ] && ok "200 random inputs with secrets: always one listed category, never the input"

# 3. Static: the helper prints only literal words (no variable, no input).
body="$(sed -n '/^pg_error_category()/,/^}/p' scripts/db/pg-error-category.sh)"
outs="$(grep -oE '(echo|printf)[^;]*' <<<"$body")"
if [ -n "$outs" ] && ! grep -vqE '^echo [a-z_]+ *$' <<<"$outs"; then ok "the helper's only output is literal category words"
else bad "the helper has an echo or printf that is not a literal word"; fi
for n in $(grep -oE 'echo [a-z_]+' <<<"$body" | cut -d' ' -f2 | sort -u); do
  [[ "$CATS" == *" $n "* ]] || bad "category $n is printed but not documented"
done
# The error file appears on exactly three lines: created and removed, and read only by the helper in each of the two failure messages.
uses="$(grep -n 'errf' scripts/db/verify-members-identity.sh | cut -d: -f2-)"
want="$(printf '%s\n' \
  'errf="$(mktemp)"; trap '"'"'rm -f "$errf"'"'"' EXIT' \
  '  -c "rollback" 2>"$errf")" || fail "Could not read the database to check its identity (cause: $(pg_error_category <"$errf"))."' \
  '  -c "rollback" 2>"$errf")" || fail "Could not read the identity marker (cause: $(pg_error_category <"$errf"))."')"
if [ "$uses" = "$want" ]; then ok "the identity script reads the error file only through the helper"
else bad "the identity script uses the error file some other way"; fi

# The error file: created private (mode 600) before psql writes to it, and removed afterwards.
FAKE=$(mktemp -d); T=$(mktemp -d)
cat >"$FAKE/psql" <<'FAKEPSQL'
#!/usr/bin/env bash
stat -L -c %a /proc/self/fd/2 >"$MODE_FILE"; echo "psql: error: connection failed: Connection refused" >&2; exit 2
FAKEPSQL
chmod +x "$FAKE/psql"
out=$(PATH="$FAKE:$PATH" MODE_FILE="$FAKE/mode" TMPDIR="$T" MEMBERS_DB_IDENTITY_MARKER="$MARKER" MEMBERS_PRODUCTION_DATABASE_URL="$URL" scripts/db/verify-members-identity.sh 2>&1)
if [ "$(cat "$FAKE/mode" 2>/dev/null)" = 600 ] && [ -z "$(ls -A "$T")" ] && grep -qF '(cause: tcp_connection_refused).' <<<"$out" && [[ "$out" != *"$PW"* && "$out" != *"$HOSTN"* ]]; then
  ok "the error file is mode 600 while psql writes to it, and is removed after a failure"
else bad "error file permissions or removal (mode $(cat "$FAKE/mode" 2>/dev/null), leftover: $(ls -A "$T" | wc -l))"; fi
rm -rf "$FAKE" "$T"

# 4. End to end with the real identity script, on a LOCAL server only.
if [ -n "${ADMIN_DATABASE_URL:-}" ]; then
  case "$ADMIN_DATABASE_URL" in *supabase.co*|*supabase.com*) echo "Refusing: local PostgreSQL only." >&2; exit 1 ;; esac
  H=$(python3 -c "import sys;from urllib.parse import urlsplit;print(urlsplit(sys.argv[1]).hostname)" "$ADMIN_DATABASE_URL")
  P=$(python3 -c "import sys;from urllib.parse import urlsplit;print(urlsplit(sys.argv[1]).port or 5432)" "$ADMIN_DATABASE_URL")
  R="leakrole$(rnd)"; RPW="RolePw$(rnd)Secret"; DBN="leakdb$(rnd)"
  psql "$ADMIN_DATABASE_URL" -X -q -c "create role $R login password '$RPW'" >/dev/null
  trap 'psql "$ADMIN_DATABASE_URL" -X -q -c "drop role if exists $R" >/dev/null 2>&1' EXIT
  CLOSED=$((P + 17))
  e2e() { # e2e <category> <description> <url> [extra env]
    local out code s T; T=$(mktemp -d)
    out=$(env ${4:-} TMPDIR="$T" GITHUB_ACTIONS=true MEMBERS_DB_IDENTITY_MARKER="$MARKER" MEMBERS_PRODUCTION_DATABASE_URL="$3" PGCONNECT_TIMEOUT=5 \
      scripts/db/verify-members-identity.sh 2>&1); code=$?
    [ -z "$(ls -A "$T")" ] || bad "end to end, $2: the error file was left behind"; rmdir "$T"
    local visible; visible=$(grep -v '^::add-mask::' <<<"$out" || true)
    for s in "$RPW" "$R" "$DBN" "$MARKER" "$3" "$H" ":$P" ":$CLOSED" "postgresql://" "$PW" "leak"; do
      [[ "$visible" == *"$s"* ]] && { bad "end to end, $2: the output contains a sensitive value"; return; }
    done
    if [ $code -ne 0 ] && grep -qF "(cause: $1)." <<<"$visible" && [ "$(grep -c . <<<"$visible")" = 1 ]; then ok "end to end, $2 -> $1, nothing sensitive shown"
    else bad "end to end, $2: expected cause $1 (exit $code): $(sed -E 's/[A-Za-z0-9]{12,}/<redacted>/g' <<<"$visible")"; fi
  }
  e2e password_authentication_failed "wrong password" "postgresql://$R:wrong$RPW@$H:$P/postgres?sslmode=disable"
  e2e tcp_connection_refused "nothing listening" "postgresql://$R:$RPW@$H:$CLOSED/postgres?sslmode=disable"
  # Postgres answers a missing role exactly like a wrong password (it never reveals which roles exist).
  e2e password_authentication_failed "missing role (reported by Postgres as a password failure)" "postgresql://no$R:$RPW@$H:$P/postgres?sslmode=disable"
  e2e database_does_not_exist "missing database" "postgresql://$R:$RPW@$H:$P/$DBN?sslmode=disable"
  e2e invalid_connection_string "unparsable URL" "postgresql://$R:$RPW@$H:$P/postgres?sslmode=bogus$RPW"
  if [ "$(psql "$ADMIN_DATABASE_URL" -X -At -c 'show ssl')" = on ]; then
    e2e tls_certificate_failed "verify-full against an untrusted certificate" "postgresql://$R:$RPW@$H:$P/postgres" \
      "PGSSLMODE=verify-full PGSSLROOTCERT=$PWD/config/certs/supabase-root-2021-ca.crt"
  else
    e2e tls_not_supported "verify-full against a server without TLS" "postgresql://$R:$RPW@$H:$P/postgres" \
      "PGSSLMODE=verify-full PGSSLROOTCERT=$PWD/config/certs/supabase-root-2021-ca.crt"
  fi
  # Unchanged behaviour once connected: no marker, the right marker, a wrong marker. The error file is removed on success too.
  ident() { local T; T=$(mktemp -d); out=$(TMPDIR="$T" GITHUB_ACTIONS=true MEMBERS_DB_IDENTITY_MARKER="$2" MEMBERS_PRODUCTION_DATABASE_URL="$1" scripts/db/verify-members-identity.sh 2>&1); code=$?; leftover=$(ls -A "$T"); rmdir "$T" 2>/dev/null || rm -rf "$T"; }
  MDB="leakmarker$(rnd)"
  psql "$ADMIN_DATABASE_URL" -X -q -c "create database $MDB" >/dev/null
  trap 'psql "$ADMIN_DATABASE_URL" -X -q -c "drop database if exists $MDB" -c "drop role if exists $R" >/dev/null 2>&1' EXIT
  MURL=$(sed -E "s#/[^/?]+(\?|$)#/$MDB\1#" <<<"$ADMIN_DATABASE_URL")
  ident "$MURL" "$MARKER"
  if [ $code -ne 0 ] && grep -qF "This database has no identity marker" <<<"$out" && ! grep -q 'cause:' <<<"$out" && [ -z "$leftover" ]; then ok "end to end, a readable database without a marker is refused as before"; else bad "end to end, no marker (exit $code)"; fi
  if sed "s/PASTE_THE_MARKER_SHA256_HERE/$(printf '%s' "$MARKER" | sha256sum | cut -d' ' -f1)/" scripts/db/members-identity-provision.sql | psql "$MURL" -X -q -v ON_ERROR_STOP=1 >/dev/null 2>&1; then
    ident "$MURL" "$MARKER"
    if [ $code -eq 0 ] && grep -q 'Database identity verified' <<<"$out" && [ -z "$leftover" ]; then ok "end to end, the right marker still passes, and the error file is removed on success"; else bad "end to end, right marker (exit $code, leftover: ${leftover:+yes})"; fi
    ident "$MURL" "$(openssl rand -hex 32)"
    if [ $code -ne 0 ] && grep -q 'does not match MEMBERS_DB_IDENTITY_MARKER' <<<"$out" && ! grep -q 'cause:' <<<"$out" && [ -z "$leftover" ]; then ok "end to end, a wrong marker is refused as before"; else bad "end to end, wrong marker (exit $code)"; fi
    ident "$MURL" "not-a-marker"
    if [ $code -ne 0 ] && grep -q '64 lowercase hex' <<<"$out"; then ok "end to end, a malformed marker is refused before connecting, as before"; else bad "end to end, malformed marker (exit $code)"; fi
  else bad "end to end: could not provision a throwaway marker database"; fi
else
  echo "SKIP  pg-error-category: end to end (set ADMIN_DATABASE_URL to a local server)"
fi

echo
echo "pg-error-category tests: $pass passed, $failed failed"
[ "$failed" -eq 0 ]
