#!/usr/bin/env bash
# Tests the member Production database sequence on THROWAWAY local databases
# (it creates and drops its own on the server in ADMIN_DATABASE_URL). Never a
# hosted Supabase project.
#
#   1. Identity marker: provisioning refuses the placeholder, a malformed hash
#      and a project that already has app schemas (staging and the waitlist
#      project do); the row can't be changed, removed, truncated or replaced.
#      scripts/db/verify-members-identity.sh fails closed on a missing or
#      malformed secret, no schema, zero rows, two rows, the wrong label or the
#      wrong hash, passes on the right marker, and never prints the marker.
#   2. The new project, step by step, as the workflows run it: the foundation
#      migrations, the waitlist login lock, the activation (rehearse, refusals,
#      activate), the later migrations with the launch gate, and every check
#      (scripts/db/members-run-checks.sh --require-all). Check 003 passes with
#      the lock in place.
#   3. CONNECTION LIMIT 0 really denies logins: with a control password, the
#      waitlist logins connect before the lock and are refused after it,
#      directly and through a connection pooler (PgBouncer in Docker, session
#      mode, a fresh pooler per attempt so no pooled connection is reused).
#      The password is removed again afterwards.
#   4. The member Production check fails on each forbidden state: photos on,
#      external access open, an invitation, a waitlist row, a creator link, an
#      unlocked login, waitlist submissions on, the gate trigger disabled, the
#      marker's triggers disabled, pg_net's schema present.
#   5. The launch gate on member Production: the activation installs it in the
#      same transaction as membership, naming the founder; nobody else can be
#      given membership. Interrupted activations (the connection terminated
#      after the founder grant, mid-migrations; the gate migration itself
#      failing) leave no membership, no gate and no record, and a new
#      activation then succeeds. Membership without the gate, made by hand,
#      is refused by the member check and the verification.
#
# Roles are shared by every database on a server, so the waitlist logins'
# connection limits and passwords are restored on exit (trap).
#
# Usage: ADMIN_DATABASE_URL=postgresql://postgres:postgres@localhost:5432/postgres scripts/db/members-workflow-test.sh
# REQUIRE_POOLER_TEST=1 (CI) fails instead of skipping when Docker is missing.
set -uo pipefail
cd "$(dirname "$0")/../.."
: "${ADMIN_DATABASE_URL:?Set ADMIN_DATABASE_URL to a local PostgreSQL server (it creates throwaway databases)}"
case "$ADMIN_DATABASE_URL" in
  *supabase.co*|*supabase.com*) echo "Refusing: this test only runs against a local PostgreSQL server." >&2; exit 1 ;;
esac
MARKER=$(openssl rand -hex 32)
MARKER_SHA=$(printf '%s' "$MARKER" | sha256sum | cut -d' ' -f1)
OTHER_MARKER=$(openssl rand -hex 32)
FOUNDER=00000000-0000-4000-8000-0000000ab001
SECOND=00000000-0000-4000-8000-0000000ab002
CONTROL_PW="ctrl$(openssl rand -hex 12)"
POOLER_PORT=${POOLER_PORT:-6439}
pass=0; failed=0
tmpd=$(mktemp -d)
ok()  { echo "PASS  members: $1"; pass=$((pass + 1)); }
bad() { echo "FAIL  members: $1"; failed=$((failed + 1)); }
A=(psql "$ADMIN_DATABASE_URL" -X -q -v ON_ERROR_STOP=1)

db_url() { sed -E "s#/[^/?]+(\?|$)#/$1\1#" <<<"$ADMIN_DATABASE_URL"; }
db_part() { python3 -c "import sys;from urllib.parse import urlsplit;u=urlsplit(sys.argv[1]);print({'host':u.hostname,'port':u.port or 5432}[sys.argv[2]])" "$ADMIN_DATABASE_URL" "$1"; }
HOST=$(db_part host); PORT=$(db_part port)

restore_roles() {
  "${A[@]}" >/dev/null 2>&1 <<'SQL'
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'waitlist_writer') then
    alter role waitlist_writer connection limit 20 password null;
  end if;
  if exists (select 1 from pg_roles where rolname = 'waitlist_admin') then
    alter role waitlist_admin connection limit 5 password null;
  end if;
end $$;
SQL
}
cleanup() {
  rm -rf "$tmpd"
  docker rm -f members-pooler-test >/dev/null 2>&1 || true
  restore_roles
  # new_db runs in a subshell, so its databases are found by name (this run's process id).
  local d; for d in $("${A[@]}" -At -c "select datname from pg_database where datname like 'members\_%\_$$'"); do
    "${A[@]}" -c "drop database if exists $d" >/dev/null 2>&1
  done
}
trap cleanup EXIT

# new_db <name>: an empty database, like a new Supabase project before any migration.
new_db() {
  local name="members_${1}_$$"
  "${A[@]}" -c "drop database if exists $name" -c "create database $name" >/dev/null || return 1
  local url; url=$(db_url "$name")
  psql "$url" -X -q -v ON_ERROR_STOP=1 -f scripts/db/bootstrap-roles.sql >/dev/null &&
    psql "$url" -X -q -v ON_ERROR_STOP=1 -f scripts/db/bootstrap-supabase-stub.sql >/dev/null &&
    # A hosted project has Supabase Storage; this is the suite's test-only stand-in for it.
    psql "$url" -X -q -v ON_ERROR_STOP=1 -f supabase/tests-local/before/20261125000000.sql >/dev/null || return 1
  echo "$url"
}
# provision <url> <sha>: the identity provisioning file with the hash filled in.
provision() {
  sed "s/PASTE_THE_MARKER_SHA256_HERE/$2/" scripts/db/members-identity-provision.sql | psql "$1" -X -q -v ON_ERROR_STOP=1 2>&1
}
# apply_range <url> <from> <to>: apply and record migrations, as db push does.
apply_range() {
  local f v P=(psql "$1" -X -q -v ON_ERROR_STOP=1)
  "${P[@]}" -c "create schema if not exists supabase_migrations; create table if not exists supabase_migrations.schema_migrations (version text primary key, statements text[], name text)" >/dev/null || return 1
  for f in supabase/migrations/*.sql; do
    v=$(basename "$f" | cut -d_ -f1)
    [[ "$v" < "$2" || "$v" > "$3" ]] && continue
    "${P[@]}" -f "$f" >/dev/null 2>&1 || { echo "could not apply $f" >&2; return 1; }
    "${P[@]}" -c "insert into supabase_migrations.schema_migrations (version, name) values ('$v', '$(basename "$f" .sql | cut -d_ -f2-)')" >/dev/null || return 1
  done
}
# identity <url> <marker or __unset__>: output in $out, exit code in $code.
identity() {
  if [ "$2" = __unset__ ]; then
    out=$(env -u MEMBERS_DB_IDENTITY_MARKER MEMBERS_PRODUCTION_DATABASE_URL="$1" scripts/db/verify-members-identity.sh 2>&1); code=$?
  else
    out=$(MEMBERS_DB_IDENTITY_MARKER="$2" MEMBERS_PRODUCTION_DATABASE_URL="$1" scripts/db/verify-members-identity.sh 2>&1); code=$?
  fi
}
expect_identity() { # expect_identity <ok|fail> <description> <url> <marker> [message]
  identity "$3" "$4"
  # "::add-mask::" lines are consumed by the GitHub runner and never shown; the marker must not appear anywhere else.
  local visible; visible=$(grep -v '^::add-mask::' <<<"$out" || true)
  if [[ "$visible" == *"$MARKER"* || "$visible" == *"$OTHER_MARKER"* ]]; then bad "identity: $2 (the marker appeared in the output)"; return; fi
  if [ "$1" = ok ] && [ $code -eq 0 ] && grep -q 'Database identity verified' <<<"$out"; then ok "identity: $2"
  elif [ "$1" = fail ] && [ $code -ne 0 ] && { [ -z "${5:-}" ] || grep -qi -- "$5" <<<"$out"; }; then ok "identity refused: $2"
  else bad "identity: $2 (exit $code): $out"; fi
}
# login <role> <port>: try to connect with the control password; output in $out, exit code in $code.
login() {
  out=$(PGPASSWORD="$CONTROL_PW" PGCONNECT_TIMEOUT=5 psql "host=$HOST port=$2 user=$1 dbname=postgres sslmode=disable" -X -At -c "select current_user" 2>&1); code=$?
}
# pooler <role>: a fresh PgBouncer (session mode) in front of the server for this role.
pooler() {
  docker rm -f members-pooler-test >/dev/null 2>&1
  docker run -d --rm --name members-pooler-test --network host -e DB_HOST="$HOST" -e DB_PORT="$PORT" -e DB_USER="$1" \
    -e DB_PASSWORD="$CONTROL_PW" -e AUTH_TYPE=scram-sha-256 -e POOL_MODE=session -e LISTEN_PORT="$POOLER_PORT" \
    edoburu/pgbouncer:v1.24.1-p1 >/dev/null || return 1
  local i; for i in $(seq 1 30); do
    (exec 3<>"/dev/tcp/127.0.0.1/$POOLER_PORT") 2>/dev/null && return 0
    sleep 0.3
  done
  return 1
}
# member_check <url> <description> <expected FAIL text> <sql that sets up the forbidden state>
member_check() {
  out=$( { echo "begin;"; echo "$4"; echo '\ir supabase/tests-members/001_member_production.sql'; echo "rollback;"; } |
    psql "$1" -X -q -v ON_ERROR_STOP=1 -v photos_approved=false -v invitations_approved=false 2>&1); code=$?
  if [ $code -ne 0 ] && grep -qi -- "$3" <<<"$out"; then ok "member check catches: $2"
  else bad "member check misses: $2 (exit $code): $(grep -E 'ERROR|FAIL' <<<"$out" | head -2 | tr '\n' ' ')"; fi
}
activate() { # activate <url> <founder or __unset__> <mode> <confirm>
  local env_founder=(env -u MEMBERS_FOUNDER_ACCOUNT_ID)
  [ "$2" != __unset__ ] && env_founder=(env MEMBERS_FOUNDER_ACCOUNT_ID="$2")
  out=$("${env_founder[@]}" psql "$1" -X -q -v ON_ERROR_STOP=1 -v mode="$3" -v confirm="$4" \
    -v photos_approved=false -v invitations_approved=false -f scripts/db/members-activate-member-access.sql 2>&1); code=$?
}
recorded() { psql "$1" -X -q -At -c "select string_agg(version, ' ' order by version) from supabase_migrations.schema_migrations"; }

"${A[@]}" -c "select 1" >/dev/null || { echo "Local PostgreSQL server not reachable" >&2; exit 1; }
restore_roles

# ---------------------------------------------------------------------------
# 1. The identity marker.
U=$(new_db identity) || { echo "could not build a test database" >&2; exit 1; }
expect_identity fail "no env_identity schema" "$U" "$MARKER" "no identity marker"
out=$(psql "$U" -X -q -v ON_ERROR_STOP=1 -f scripts/db/members-identity-provision.sql 2>&1); code=$?
if [ $code -ne 0 ] && grep -q 'replace PASTE_THE_MARKER_SHA256_HERE' <<<"$out" && [ "$(psql "$U" -X -At -c "select to_regnamespace('env_identity') is null")" = t ]; then
  ok "provisioning refuses the unreplaced placeholder, nothing created"
else bad "provisioning with the placeholder (exit $code): $out"; fi
out=$(provision "$U" "${MARKER_SHA^^}"); code=$?
if [ $code -ne 0 ] && grep -q '64 lowercase hex' <<<"$out"; then ok "provisioning refuses a malformed hash"; else bad "provisioning a malformed hash (exit $code): $out"; fi
out=$(provision "$U" "$MARKER_SHA"); code=$?
if [ $code -eq 0 ] && grep -q 'marker recorded (hash only)' <<<"$out"; then ok "provisioning records the marker hash"; else bad "provisioning (exit $code): $out"; fi
expect_identity ok "the right marker" "$U" "$MARKER"
expect_identity fail "the secret is not set" "$U" __unset__ "MEMBERS_DB_IDENTITY_MARKER is not set"
expect_identity fail "the secret is empty" "$U" "" "MEMBERS_DB_IDENTITY_MARKER is not set"
expect_identity fail "the secret is not 64 hex characters" "$U" "not-a-marker" "64 lowercase hex"
expect_identity fail "the secret is in upper case" "$U" "${MARKER^^}" "64 lowercase hex"
expect_identity fail "a different marker (wrong hash)" "$U" "$OTHER_MARKER" "does not match"
out=$(MEMBERS_DB_IDENTITY_MARKER="$MARKER" env -u MEMBERS_PRODUCTION_DATABASE_URL scripts/db/verify-members-identity.sh 2>&1); code=$?
if [ $code -ne 0 ] && grep -q 'MEMBERS_PRODUCTION_DATABASE_URL is not set' <<<"$out"; then ok "identity refused: no database URL"; else bad "identity with no URL (exit $code)"; fi
out=$(MEMBERS_DB_IDENTITY_MARKER="$MARKER" MEMBERS_PRODUCTION_DATABASE_URL="postgresql://postgres:postgres@$HOST:$PORT/members_does_not_exist_$$" scripts/db/verify-members-identity.sh 2>&1); code=$?
if [ $code -ne 0 ] && grep -q 'Could not read the database' <<<"$out"; then ok "identity refused: the database can't be read"; else bad "identity on an unreachable database (exit $code): $out"; fi
# The identity check shows a failure category, never the error text (scripts/db/pg-error-category.test.sh).
if ADMIN_DATABASE_URL="$ADMIN_DATABASE_URL" scripts/db/pg-error-category.test.sh >"$tmpd/pg-error-category.log" 2>&1; then ok "identity failures show only a fixed category, never the error text"
else bad "identity failure categories: $(grep -E '^FAIL' "$tmpd/pg-error-category.log" | head -3 | tr '\n' ' ')"; fi
out=$(GITHUB_ACTIONS=true MEMBERS_DB_IDENTITY_MARKER="$MARKER" MEMBERS_PRODUCTION_DATABASE_URL="$U" scripts/db/verify-members-identity.sh 2>&1)
if grep -qx "::add-mask::$MARKER" <<<"$out" && [ "$(grep -v '^::add-mask::' <<<"$out" | grep -c "$MARKER")" = 0 ]; then ok "on GitHub Actions the marker is masked first and never printed"; else bad "marker masking"; fi
for c in "update env_identity.marker set marker_sha256 = repeat('0', 64)|can't be changed or removed" "delete from env_identity.marker|can't be changed or removed" \
         "truncate env_identity.marker|can't be changed or removed" \
         "insert into env_identity.marker (id, label, marker_sha256) values (false, 'splitpost-members-production', repeat('0', 64))|marker_id_check" \
         "insert into env_identity.marker (label, marker_sha256) values ('splitpost-members-production', repeat('0', 64))|marker_pkey"; do
  IFS='|' read -r stmt msg <<<"$c"
  out=$(psql "$U" -X -q -v ON_ERROR_STOP=1 -c "$stmt" 2>&1); code=$?
  if [ $code -ne 0 ] && grep -qF -- "$msg" <<<"$out"; then ok "the marker row can't be changed: ${stmt%% *} ($msg)"; else bad "the marker row change was not refused as expected: $stmt: $out"; fi
done
out=$(provision "$U" "$(printf '%s' "$OTHER_MARKER" | sha256sum | cut -d' ' -f1)"); code=$?
if [ $code -ne 0 ] && grep -q 'already exists' <<<"$out"; then ok "provisioning refuses to replace an existing marker"; else bad "re-provisioning (exit $code): $out"; fi
expect_identity ok "the right marker, after every attempt to change it" "$U" "$MARKER"
# Hand-made marker tables (the provisioning file prevents these states; the check must not rely on that).
for c in "zero rows|create table env_identity.marker (label text, marker_sha256 text)|holds 0 rows" \
         "two rows|create table env_identity.marker (label text, marker_sha256 text); insert into env_identity.marker values ('splitpost-members-production', '$MARKER_SHA'), ('splitpost-members-production', '$MARKER_SHA')|holds 2 rows" \
         "the wrong label|create table env_identity.marker (label text, marker_sha256 text); insert into env_identity.marker values ('kpudeppgokpjhvaqrprn', '$MARKER_SHA')|wrong label"; do
  IFS='|' read -r desc setup msg <<<"$c"
  W=$(new_db "hand_$RANDOM") || { bad "could not build a database"; continue; }
  psql "$W" -X -q -v ON_ERROR_STOP=1 -c "create schema env_identity; $setup" >/dev/null
  expect_identity fail "$desc" "$W" "$MARKER" "$msg"
done
# A project that already has app schemas (staging, the waitlist project) refuses provisioning.
S=$(new_db staging_shaped) || { echo "could not build a test database" >&2; exit 1; }
apply_range "$S" 20261106000000 20261111000000 || bad "could not build a staging-shaped database"
out=$(provision "$S" "$MARKER_SHA"); code=$?
if [ $code -ne 0 ] && grep -q 'already has app schemas or migrations' <<<"$out" && [ "$(psql "$S" -X -At -c "select to_regnamespace('env_identity') is null")" = t ]; then
  ok "provisioning refuses a project that already has app schemas (staging or the waitlist project)"
else bad "provisioning on a staging-shaped database (exit $code): $out"; fi
expect_identity fail "a staging-shaped database without a marker" "$S" "$MARKER" "no identity marker"

# ---------------------------------------------------------------------------
# 2 and 3. The new project, step by step.
M=$(new_db project) || { echo "could not build a test database" >&2; exit 1; }
provision "$M" "$MARKER_SHA" >/dev/null || bad "could not provision the marker"
out=$(MEMBERS_PRODUCTION_DATABASE_URL="$M" scripts/db/members-pending-migrations.sh 2>&1); code=$?
all=$(ls supabase/migrations/*.sql | xargs -n1 basename | cut -c1-14 | tr '\n' ' ' | sed 's/ $//')
if [ $code -eq 0 ] && [ "$out" = "$all" ]; then ok "a new project with no history: every migration pending"; else bad "pending on a new project (exit $code): $out"; fi
out=$(MEMBERS_PRODUCTION_DATABASE_URL="$M" scripts/db/members-run-checks.sh 2>&1); code=$?
if [ $code -eq 0 ] && grep -q 'PASS: one immutable identity marker' <<<"$out" && [ "$(grep -c '^Skipped' <<<"$out")" = 14 ]; then
  ok "check mode on the new project: the marker passes, every shared check skipped and named"
else bad "check mode on the new project (exit $code): $(tail -3 <<<"$out")"; fi
out=$(MEMBERS_PRODUCTION_DATABASE_URL="$M" scripts/db/members-run-checks.sh --require-all 2>&1); code=$?
if [ $code -ne 0 ] && grep -q 'were skipped' <<<"$out"; then ok "--require-all fails while checks are skipped"; else bad "--require-all on the new project (exit $code)"; fi

apply_range "$M" 20261106000000 20261121000000 || bad "could not apply the foundation"
psql "$M" -X -q -c "alter role waitlist_writer password '$CONTROL_PW'; alter role waitlist_admin password '$CONTROL_PW'" >/dev/null
login waitlist_writer "$PORT"
if [ $code -eq 0 ] && [ "$out" = waitlist_writer ]; then ok "control: before the lock, waitlist_writer logs in directly with the control password"; else bad "control login before the lock: $out"; fi
pooler_ok=false
if command -v docker >/dev/null 2>&1 && docker info >/dev/null 2>&1; then
  if pooler waitlist_writer; then
    login waitlist_writer "$POOLER_PORT"
    if [ $code -eq 0 ] && [ "$out" = waitlist_writer ]; then ok "control: before the lock, waitlist_writer logs in through the pooler"; pooler_ok=true
    else bad "control login through the pooler: $out"; fi
  else bad "could not start the pooler"; fi
  docker rm -f members-pooler-test >/dev/null 2>&1
elif [ "${REQUIRE_POOLER_TEST:-}" = 1 ]; then bad "Docker is not available, so the pooler denial test could not run"
else echo "SKIP  members: Docker is not available here; the pooler denial test runs in CI (REQUIRE_POOLER_TEST=1)"; fi
out=$(MEMBERS_PRODUCTION_DATABASE_URL="$M" scripts/db/members-run-checks.sh 2>&1); code=$?
if [ $code -ne 0 ] && grep -q 'may open connections' <<<"$out"; then ok "before the lock, the member check fails (waitlist logins can connect)"; else bad "member check before the lock (exit $code)"; fi

# The lock refuses while a waitlist session is open, and changes nothing.
PGPASSWORD="$CONTROL_PW" psql "host=$HOST port=$PORT user=waitlist_admin dbname=postgres sslmode=disable" -X -q -c "select pg_sleep(8)" >/dev/null 2>&1 &
sleeper=$!
for i in $(seq 1 30); do [ "$(psql "$M" -X -At -c "select count(*) from pg_stat_activity where usename = 'waitlist_admin'")" != 0 ] && break; sleep 0.2; done
out=$(psql "$M" -X -q -v ON_ERROR_STOP=1 -f scripts/db/members-lock-waitlist-roles.sql 2>&1); code=$?
if [ $code -ne 0 ] && grep -q 'has an open session' <<<"$out" && [ "$(psql "$M" -X -At -c "select rolconnlimit from pg_roles where rolname = 'waitlist_admin'")" = 5 ]; then
  ok "the lock refuses while a waitlist session is open, and changes nothing"
else bad "the lock with an open session (exit $code): $out"; fi
wait $sleeper 2>/dev/null
out=$(psql "$S" -X -q -v ON_ERROR_STOP=1 -f scripts/db/members-lock-waitlist-roles.sql 2>&1); code=$?
if [ $code -ne 0 ] && grep -q 'no member Production identity marker' <<<"$out"; then ok "the lock refuses a database without the marker"; else bad "the lock without a marker (exit $code): $out"; fi

out=$(psql "$M" -X -q -v ON_ERROR_STOP=1 -f scripts/db/members-lock-waitlist-roles.sql 2>&1); code=$?
if [ $code -eq 0 ] && grep -q 'PASS: waitlist_writer and waitlist_admin have connection limit 0' <<<"$out"; then ok "the lock applies"; else bad "the lock (exit $code): $out"; fi
out=$(psql "$M" -X -q -v ON_ERROR_STOP=1 -f scripts/db/members-lock-waitlist-roles.sql 2>&1); code=$?
if [ $code -eq 0 ]; then ok "the lock is idempotent"; else bad "the lock a second time (exit $code)"; fi
for r in waitlist_writer waitlist_admin; do
  login "$r" "$PORT"
  if [ $code -ne 0 ] && grep -q "too many connections for role \"$r\"" <<<"$out"; then ok "after the lock, $r is refused directly (too many connections for role)"
  else bad "$r direct login after the lock: $out"; fi
  if $pooler_ok; then
    if pooler "$r"; then
      login "$r" "$POOLER_PORT"
      if [ $code -ne 0 ] && grep -q "too many connections for role \"$r\"" <<<"$out"; then ok "after the lock, $r is refused through a fresh pooler"
      else bad "$r pooler login after the lock: $out"; fi
    else bad "could not start the pooler"; fi
    docker rm -f members-pooler-test >/dev/null 2>&1
  fi
done
psql "$M" -X -q -c "alter role waitlist_writer password null; alter role waitlist_admin password null" >/dev/null
out=$(psql "$M" -X -q -v ON_ERROR_STOP=1 -f supabase/tests/003_waitlist.sql 2>&1); code=$?
if [ $code -eq 0 ]; then ok "check 003 (unchanged) passes with the lock in place"; else bad "check 003 with the lock: $out"; fi
out=$(MEMBERS_PRODUCTION_DATABASE_URL="$M" scripts/db/members-run-checks.sh 2>&1); code=$?
if [ $code -eq 0 ] && grep -q 'PASS: waitlist_writer and waitlist_admin have connection limit 0' <<<"$out"; then ok "after the foundation and the lock, check mode passes"
else bad "check mode after the foundation (exit $code): $(grep -E 'ERROR|FAIL' <<<"$out" | head -3)"; fi

# The activation.
psql "$M" -X -q -v ON_ERROR_STOP=1 >/dev/null <<SQL || bad "could not create the accounts"
set role supabase_auth_admin;
insert into auth.users (id, email, email_confirmed_at) values ('$FOUNDER', 'founder@members.test', now()), ('$SECOND', 'second@members.test', now());
reset role;
SQL
before=$(recorded "$M")
activate "$M" __unset__ rehearse ""
if [ $code -ne 0 ] && grep -q 'MEMBERS_FOUNDER_ACCOUNT_ID is not set' <<<"$out"; then ok "activation refuses without the founder id"; else bad "activation without a founder (exit $code)"; fi
activate "$M" "$FOUNDER" activate "ACTIVATE STAGING MEMBER ACCESS"
if [ $code -ne 0 ] && grep -q 'needs the confirmation phrase: ACTIVATE MEMBER PRODUCTION ACCESS' <<<"$out"; then ok "activation refuses the staging phrase"; else bad "activation with the staging phrase (exit $code)"; fi
activate "$S" "$FOUNDER" rehearse ""
if [ $code -ne 0 ] && grep -q 'no member Production identity marker' <<<"$out"; then ok "activation refuses a database without the marker"; else bad "activation without a marker (exit $code): $(grep ERROR <<<"$out")"; fi
psql "$M" -X -q -c "alter role waitlist_admin connection limit 5" >/dev/null
activate "$M" "$FOUNDER" rehearse ""
if [ $code -ne 0 ] && grep -q 'waitlist logins are not locked' <<<"$out"; then ok "activation refuses while a waitlist login is unlocked"; else bad "activation with an unlocked login (exit $code)"; fi
psql "$M" -X -q -c "alter role waitlist_admin connection limit 0" >/dev/null
activate "$M" "$FOUNDER" rehearse ""
if [ $code -eq 0 ] && grep -q 'Rehearsal only' <<<"$out" && [ "$(recorded "$M")" = "$before" ] && [ "$(psql "$M" -X -At -c "select to_regclass('ops.member_access') is null")" = t ]; then
  ok "a rehearsal runs every step and check, and leaves nothing behind"
else bad "rehearsal (exit $code): $(grep -E 'ERROR|FAIL' <<<"$out" | head -3)"; fi
if grep -qiF "$FOUNDER" <<<"$out"; then bad "the founder id appeared in the activation output"; else ok "the founder id never appears in the output"; fi
activate "$M" "$FOUNDER" activate "ACTIVATE MEMBER PRODUCTION ACCESS"
if [ $code -eq 0 ] && grep -q 'Activated on member Production' <<<"$out" && grep -q 'the launch gate is enabled and closed with the founder as launch founder' <<<"$out"; then
  ok "the activation commits membership and the launch gate together"
else bad "activation (exit $code): $(grep -E 'ERROR|FAIL' <<<"$out" | head -3)"; fi
out=$(MEMBERS_FOUNDER_ACCOUNT_ID="$FOUNDER" PGOPTIONS='-c default_transaction_read_only=on' psql "$M" -X -q -v ON_ERROR_STOP=1 -v expect=activated -f scripts/db/members-verify-activation.sql 2>&1); code=$?
if [ $code -eq 0 ] && grep -q 'STATE: activated' <<<"$out"; then ok "the read-only verification reports activated, gate included"; else bad "verification after activation (exit $code): $out"; fi
activate "$M" "$FOUNDER" activate "ACTIVATE MEMBER PRODUCTION ACCESS"
if [ $code -ne 0 ] && grep -q 'already recorded' <<<"$out"; then ok "a second activation is refused"; else bad "second activation (exit $code)"; fi
out=$(MEMBERS_PRODUCTION_DATABASE_URL="$M" scripts/db/members-pending-migrations.sh 2>&1)
if [ -z "$out" ]; then ok "after the activation, nothing is pending (20261122000000 to 20261129000000 recorded)"; else bad "pending after activation: $out"; fi
want=$(ls supabase/migrations/*.sql | xargs -n1 basename | sed 's/\.sql$//' | tr '\n' ' ' | sed 's/ $//')
got=$(psql "$M" -X -At -c "select string_agg(version || '_' || name, ' ' order by version) from supabase_migrations.schema_migrations")
if [ "$got" = "$want" ]; then ok "the migration history records every migration once, in order, with its name (as db push would)"; else bad "migration history: $got"; fi
out=$(MEMBERS_PRODUCTION_DATABASE_URL="$M" scripts/db/members-run-checks.sh --require-all 2>&1); code=$?
if [ $code -eq 0 ] && grep -q '(0 skipped)' <<<"$out" && grep -q 'external member access is closed (founder only)' <<<"$out" && grep -q 'PASS: photo posting is off' <<<"$out"; then
  ok "after the activation, every check runs and passes; the gate is closed, photos are off"
else bad "checks after activation (exit $code): $(grep -E 'ERROR|FAIL' <<<"$out" | head -3)"; fi

# Interrupted activations: none may leave active membership without an enabled gate.
# ready_db <name>: a new project with the marker, the foundation, the lock and the two accounts.
ready_db() {
  local url; url=$(new_db "$1") || return 1
  provision "$url" "$MARKER_SHA" >/dev/null && apply_range "$url" 20261106000000 20261121000000 \
    && psql "$url" -X -q -v ON_ERROR_STOP=1 -f scripts/db/members-lock-waitlist-roles.sql >/dev/null 2>&1 || return 1
  psql "$url" -X -q -v ON_ERROR_STOP=1 -c "insert into auth.users (id, email, email_confirmed_at) values ('$FOUNDER', 'founder@members.test', now()), ('$SECOND', 'second@members.test', now())" >/dev/null || return 1
  echo "$url"
}
untouched() { # untouched <url> <recorded before>: no membership, no gate, history unchanged
  [ "$(recorded "$1")" = "$2" ] && [ "$(psql "$1" -X -At -c "select to_regclass('ops.member_access') is null and to_regclass('ops.member_launch_settings') is null")" = t ]
}
# a) The connection is terminated in the middle, after the founder grant (blocked at 20261125000000).
K=$(ready_db killed) || bad "could not build the interruption database"
kbefore=$(recorded "$K")
PGAPPNAME=members-lock-holder psql "$K" -X -q -c "begin" -c "lock table storage.buckets in access exclusive mode" -c "select pg_sleep(60)" >/dev/null 2>&1 &
holder=$!
for i in $(seq 1 100); do [ "$(psql "$K" -X -At -c "select count(*) from pg_locks l join pg_class c on c.oid = l.relation where c.relname = 'buckets' and l.mode = 'AccessExclusiveLock' and l.granted")" = 1 ] && break; sleep 0.1; done
( MEMBERS_FOUNDER_ACCOUNT_ID="$FOUNDER" PGAPPNAME=members-activation-killed psql "$K" -X -q -v ON_ERROR_STOP=1 -v mode=activate -v confirm='ACTIVATE MEMBER PRODUCTION ACCESS' \
    -v photos_approved=false -v invitations_approved=false -f scripts/db/members-activate-member-access.sql > "$tmpd/killed.log" 2>&1; echo $? > "$tmpd/killed.code" ) &
act=$!
waiting=""
for i in $(seq 1 150); do
  waiting=$(psql "$K" -X -At -c "select a.pid from pg_stat_activity a join pg_locks l on l.pid = a.pid and not l.granted where a.application_name = 'members-activation-killed' and a.query like '%storage.buckets%' limit 1")
  [ -n "$waiting" ] && break; sleep 0.1
done
if [ -n "$waiting" ]; then
  psql "$K" -X -q -c "select pg_terminate_backend($waiting)" >/dev/null
  wait $act
  # Release the lock: end the holder's session on the server (killing the client alone leaves it sleeping).
  psql "$K" -X -q -c "select pg_terminate_backend(pid) from pg_stat_activity where application_name = 'members-lock-holder'" >/dev/null
  wait $holder 2>/dev/null
  if [ "$(cat "$tmpd/killed.code")" != 0 ] && grep -qi 'terminat\|connection to server was lost\|server closed the connection' "$tmpd/killed.log" && untouched "$K" "$kbefore"; then
    ok "an activation terminated after the founder grant (mid-migrations) leaves no membership, no gate and no migration record"
  else bad "terminated activation (exit $(cat "$tmpd/killed.code")): $(tail -3 "$tmpd/killed.log" | tr '\n' ' ')"; fi
else
  kill $holder $act 2>/dev/null; wait 2>/dev/null
  bad "the activation never reached 20261125000000 while blocked (could not interrupt it mid-way)"
fi
out=$(MEMBERS_FOUNDER_ACCOUNT_ID="$FOUNDER" PGOPTIONS='-c default_transaction_read_only=on' psql "$K" -X -q -v ON_ERROR_STOP=1 -v expect=any -f scripts/db/members-verify-activation.sql 2>&1)
if grep -q 'STATE: not activated' <<<"$out"; then ok "after the interruption, the verification reports not activated (safe to run again)"; else bad "verification after interruption: $out"; fi
activate "$K" "$FOUNDER" activate "ACTIVATE MEMBER PRODUCTION ACCESS"
if [ $code -eq 0 ] && grep -q 'Activated on member Production' <<<"$out"; then ok "after the interruption, a new activation succeeds"; else bad "activation after interruption (exit $code): $(grep -E 'ERROR|FAIL' <<<"$out" | head -2)"; fi
# b) The last step, the launch gate itself, fails: everything before it is undone too.
G=$(ready_db gatefails) || bad "could not build the gate failure database"
gbefore=$(recorded "$G")
psql "$G" -X -q -c "create function ops.set_launch_founder(text, uuid, text) returns void language sql as 'select null'" >/dev/null
activate "$G" "$FOUNDER" activate "ACTIVATE MEMBER PRODUCTION ACCESS"
if [ $code -ne 0 ] && grep -q 'already exists' <<<"$out" && untouched "$G" "$gbefore"; then
  ok "if the launch gate migration fails, the membership, the grant and the earlier migrations are all undone"
else bad "gate failure (exit $code): $(grep -E 'ERROR' <<<"$out" | head -2)"; fi
# c) Membership without the gate (made by hand; the workflows can't produce it) is refused everywhere.
H=$(ready_db nogate) || bad "could not build the inconsistent database"
psql "$H" -X -q -v ON_ERROR_STOP=1 -f supabase/migrations/20261122000000_member_access.sql >/dev/null 2>&1 \
  && psql "$H" -X -q -v ON_ERROR_STOP=1 -c "insert into supabase_migrations.schema_migrations (version, name) values ('20261122000000', 'member_access')" \
       -c "select ops.grant_member_access('$FOUNDER', 'founder', 'founder', null, 'member production activation')" >/dev/null || bad "could not build membership without the gate"
out=$(MEMBERS_PRODUCTION_DATABASE_URL="$H" scripts/db/members-run-checks.sh 2>&1); code=$?
if [ $code -ne 0 ] && grep -q 'recorded without the launch gate' <<<"$out"; then ok "membership without the gate: the member check fails"; else bad "member check without the gate (exit $code)"; fi
out=$(MEMBERS_FOUNDER_ACCOUNT_ID="$FOUNDER" PGOPTIONS='-c default_transaction_read_only=on' psql "$H" -X -q -v ON_ERROR_STOP=1 -v expect=any -f scripts/db/members-verify-activation.sql 2>&1); code=$?
if [ $code -ne 0 ] && grep -q 'launch gate is not recorded and enabled' <<<"$out"; then ok "membership without the gate: the verification reports it inconsistent"; else bad "verification without the gate (exit $code): $(grep FAIL <<<"$out")"; fi

# 5. The launch gate on member Production.
if [ "$(psql "$M" -X -At -c "select founder_user_id = '$FOUNDER' and not external_access_approved from ops.member_launch_settings")" = t ]; then
  ok "the launch gate names the activated founder as the launch founder, closed"
else bad "launch founder after apply"; fi
out=$(psql "$M" -X -q -v ON_ERROR_STOP=1 -c "select ops.grant_member_access('$SECOND'::uuid, 'tester', 'founder', null, 'test')" 2>&1); code=$?
if [ $code -ne 0 ] && grep -q 'external member access is not approved' <<<"$out"; then ok "another account can't be given membership"; else bad "second account grant (exit $code): $out"; fi

# 4. The member check catches each forbidden state (each in a rolled-back transaction).
member_check "$M" "photo posting on" "photo posting is on although photos are not approved" "update ops.media_settings set photos_enabled = true;"
member_check "$M" "external access open" "external member access is open" "select ops.set_external_access('members-test', true, 'APPROVE EXTERNAL MEMBER ACCESS');"
member_check "$M" "an invitation" "ops.invitations holds rows" "alter table ops.invitations disable trigger user; insert into ops.invitations (email, expires_at) values ('i@members.test', now() + interval '1 day');"
member_check "$M" "a waitlist row" "ops.waitlist holds" "alter table ops.waitlist disable trigger user; insert into ops.waitlist (email, age_confirmed, waitlist_consent_version, waitlist_consented_at) values ('w@members.test', true, 'v1', now());"
member_check "$M" "a pilot creator" "ops.pilot_creators holds" "alter table ops.pilot_creators disable trigger user; insert into ops.pilot_creators (user_id) values ('$SECOND');"
member_check "$M" "an unlocked waitlist login" "may open connections" "alter role waitlist_writer connection limit 20;"
member_check "$M" "waitlist submissions on" "waitlist submissions are switched on" "update ops.settings set enabled = true where key = 'waitlist_submissions';"
member_check "$M" "membership given around the gate (replica mode)" "other than the launch founder hold active membership" "set local session_replication_role = replica; insert into ops.member_access (user_id, cohort, status, updated_by) values ('$SECOND', 'tester', 'active', 'bypass'); set local session_replication_role = origin;"
member_check "$M" "the gate trigger disabled" "launch gate trigger is missing or disabled" "alter table ops.member_access disable trigger member_access_launch_gate;"
member_check "$M" "the marker's triggers disabled" "immutability triggers" "alter table env_identity.marker disable trigger marker_no_change;"
member_check "$M" "pg_net's schema present" "pg_net" "create schema net;"
member_check "$M" "the marker readable by service_role" "can reach the identity marker" "grant usage on schema env_identity to service_role; grant select on env_identity.marker to service_role;"
member_check "$M" "a missing marker" "no identity marker" "alter schema env_identity rename to env_identity_old;"
out=$( { echo '\ir supabase/tests-members/001_member_production.sql'; } | psql "$M" -X -q -v ON_ERROR_STOP=1 -v photos_approved=maybe -v invitations_approved=false 2>&1); code=$?
if [ $code -ne 0 ] && grep -q 'must be true or false' <<<"$out"; then ok "member check refuses an approval that isn't true or false"; else bad "member check with a bad approval (exit $code)"; fi
# The approvals are read from config: true allows the feature (it does not require it).
out=$( { echo "begin; update ops.media_settings set photos_enabled = true;"; echo '\ir supabase/tests-members/001_member_production.sql'; echo "rollback;"; } |
  psql "$M" -X -q -v ON_ERROR_STOP=1 -v photos_approved=true -v invitations_approved=false 2>&1); code=$?
if [ $code -eq 0 ] && grep -q 'photo posting is on (approved)' <<<"$out"; then ok "with photos approved, photos on passes"; else bad "photos approved (exit $code): $out"; fi
# Nothing above may have left a change behind.
out=$(MEMBERS_PRODUCTION_DATABASE_URL="$M" scripts/db/members-run-checks.sh --require-all 2>&1); code=$?
if [ $code -eq 0 ]; then ok "after the negative cases, every check still passes (each was rolled back)"; else bad "checks after the negative cases: $(grep -E 'ERROR|FAIL' <<<"$out" | head -2)"; fi

echo
echo "members-workflow-test: $pass passed, $failed failed"
[ "$failed" -eq 0 ]
