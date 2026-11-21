#!/usr/bin/env bash
# REHEARSAL BRANCH ONLY (rehearsal/members-disposable, never merged).
# Proves, on the disposable rehearsal project, that the two waitlist logins
# can't open a session THROUGH THE SUPABASE POOLER (Supavisor), on both of its
# ports: 5432 (session) and 6543 (transaction). It is NOT a direct (IPv6)
# connection test: GitHub's runners can't reach the direct host. The direct
# path is covered by CI's local test (scripts/db/members-workflow-test.sh).
#
#   waitlist-denial-probe.sh          set temporary passwords, try each role on each port, remove them
#   waitlist-denial-probe.sh cleanup  remove the temporary passwords (run again by the workflow, always)
#
# The temporary passwords are random, masked, never printed, and sent to the
# database only as SCRAM-SHA-256 verifiers (the plaintext never leaves this
# runner). They are removed on exit whatever happens (trap), and again by the
# workflow's always() step. Pass means: every login is refused with
# "too many connections for role" (connection limit 0). A login that works
# fails the probe; any other error is inconclusive and fails it too.
#
# Input: MEMBERS_PRODUCTION_DATABASE_URL (the rehearsal environment's
# session pooler URL, already checked by verify-members-target.sh and
# verify-members-identity.sh).
set -euo pipefail
: "${MEMBERS_PRODUCTION_DATABASE_URL:?}"
ROLES=(waitlist_writer waitlist_admin)
PORTS=(5432 6543)
admin() { psql "$MEMBERS_PRODUCTION_DATABASE_URL" -X -q -v ON_ERROR_STOP=1 "$@"; }

cleanup() {
  admin -c "alter role waitlist_writer password null" -c "alter role waitlist_admin password null" >/dev/null
  local limits; limits=$(admin -At -c "select string_agg(rolname || '=' || rolconnlimit, ' ' order by rolname) from pg_roles where rolname in ('waitlist_writer', 'waitlist_admin')")
  echo "Temporary passwords removed. Connection limits: $limits"
  [ "$limits" = "waitlist_admin=0 waitlist_writer=0" ] || { echo "::error::A waitlist login's connection limit is not 0: $limits"; return 1; }
}
if [ "${1:-}" = cleanup ]; then cleanup; exit $?; fi
trap 'cleanup || true' EXIT

read -r HOST REF < <(python3 - <<'PY'
import os, sys
from urllib.parse import urlsplit, unquote
u = urlsplit(os.environ["MEMBERS_PRODUCTION_DATABASE_URL"])
host = (u.hostname or "").lower()
user = unquote(u.username or "")
if not host.endswith(".pooler.supabase.com") or not user.startswith("postgres."):
    print("::error::The rehearsal database URL must be the session pooler URL (postgres.<ref>@<region>.pooler.supabase.com), so the pooler can be probed.", file=sys.stderr)
    sys.exit(1)
print(host, user.split(".", 1)[1])
PY
)

# scram <password>: a SCRAM-SHA-256 verifier, as Postgres stores it.
scram() {
  PW="$1" python3 - <<'PY'
import base64, hashlib, hmac, os
pw = os.environ["PW"].encode()
salt = os.urandom(16)
salted = hashlib.pbkdf2_hmac("sha256", pw, salt, 4096)
client = hmac.new(salted, b"Client Key", hashlib.sha256).digest()
server = hmac.new(salted, b"Server Key", hashlib.sha256).digest()
stored = hashlib.sha256(client).digest()
b = lambda x: base64.b64encode(x).decode()
print(f"SCRAM-SHA-256$4096:{b(salt)}${b(stored)}:{b(server)}")
PY
}

declare -A PASS
failed=0
for role in "${ROLES[@]}"; do
  PASS[$role]=$(openssl rand -hex 24)
  [ "${GITHUB_ACTIONS:-}" = true ] && echo "::add-mask::${PASS[$role]}"
  admin -c "alter role $role password '$(scram "${PASS[$role]}")'" >/dev/null
done
echo "Temporary passwords set (as SCRAM verifiers) for: ${ROLES[*]}"
for role in "${ROLES[@]}"; do
  for port in "${PORTS[@]}"; do
    out=$(PGPASSWORD="${PASS[$role]}" PGCONNECT_TIMEOUT=15 psql "host=$HOST port=$port dbname=postgres user=$role.$REF" -X -At -c "select current_user" 2>&1) && code=0 || code=$?
    out=${out//${PASS[$role]}/***}
    if [ $code -eq 0 ]; then
      echo "::error::FAIL  $role through the pooler on port $port: the login WORKED ($out)"; failed=1
    elif grep -qi "too many connections for role" <<<"$out"; then
      echo "PASS  $role through the pooler on port $port: refused (too many connections for role)"
    else
      echo "::error::INCONCLUSIVE  $role through the pooler on port $port: refused, but not by the connection limit: $(tail -1 <<<"$out")"; failed=1
    fi
  done
done
unset PASS
exit $failed
