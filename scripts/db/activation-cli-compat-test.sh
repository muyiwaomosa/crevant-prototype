#!/usr/bin/env bash
# Proves the activation (scripts/db/staging-activate-member-access.sql)
# records 20261122000000 in a way the normal Supabase migration tooling fully
# accepts, using the CLI version the staging workflow pins. Disposable local
# infrastructure only: a throwaway database on the local server in
# ADMIN_DATABASE_URL and a temporary copy of supabase/; never a hosted project.
#
#   1. The real CLI applies every migration through 20261121000000 to an empty
#      database (`supabase db push`), so the CLI creates its own history table,
#      as on staging.
#   2. The activation runs (activate mode, one transaction).
#   3. `supabase migration list` shows 20261122000000 applied (local = remote),
#      and `supabase db push --dry-run` reports the database is up to date:
#      the CLI never tries to apply it again.
#   4. A later test migration (written only into the temporary copy) is
#      applied by `supabase db push`, alone, and the history lists it.
#
# Every CLI call asks for JSON output (--output-format json), so the checks
# don't depend on the environment's default output format.
#
# Usage: SUPABASE=<path to the pinned supabase CLI> ADMIN_DATABASE_URL=postgresql://postgres:postgres@localhost:5432/postgres scripts/db/activation-cli-compat-test.sh
set -uo pipefail
cd "$(dirname "$0")/../.."
: "${ADMIN_DATABASE_URL:?Set ADMIN_DATABASE_URL to a local PostgreSQL server}"
: "${SUPABASE:?Set SUPABASE to the pinned Supabase CLI}"
case "$ADMIN_DATABASE_URL" in
  *@127.0.0.1:*|*@localhost:*) ;;
  *) echo "Refusing: this test only runs against a local PostgreSQL server." >&2; exit 1 ;;
esac
PINNED="$(grep -E '^  SUPABASE_CLI_VERSION:' .github/workflows/deploy-db-staging.yml | awk '{print $2}')"
[ "$("$SUPABASE" --version | tr -d '[:space:]')" = "$PINNED" ] || { echo "FAIL  the CLI is not the version the staging workflow pins ($PINNED)"; exit 1; }
pass=0; failed=0
ok()  { echo "PASS  CLI compatibility: $1"; pass=$((pass + 1)); }
bad() { echo "FAIL  CLI compatibility: $1"; failed=$((failed + 1)); }

NAME="activation_cli_$$"
DB="$(sed -E "s#/[^/?]+(\?|$)#/$NAME\1#" <<<"$ADMIN_DATABASE_URL")"
# The CLI connects over TCP; local throwaway server, no TLS.
case "$DB" in *\?*) CLI_DB="$DB&sslmode=disable" ;; *) CLI_DB="$DB?sslmode=disable" ;; esac
WORK="$(mktemp -d)"
cleanup() { psql "$ADMIN_DATABASE_URL" -X -q -c "drop database if exists $NAME" >/dev/null 2>&1; rm -rf "${WORK:?}"; }
trap cleanup EXIT
psql "$ADMIN_DATABASE_URL" -X -q -v ON_ERROR_STOP=1 -c "drop database if exists $NAME" -c "create database $NAME" >/dev/null || exit 1
psql "$DB" -X -q -v ON_ERROR_STOP=1 -f scripts/db/bootstrap-roles.sql -f scripts/db/bootstrap-supabase-stub.sql >/dev/null || exit 1

# Temporary copies of supabase/: one stops at 20261121000000 (staging today).
for d in before after; do
  mkdir -p "$WORK/$d/supabase/migrations"
  cp supabase/config.toml "$WORK/$d/supabase/"
  cp -r supabase/templates "$WORK/$d/supabase/"
done
for f in supabase/migrations/*.sql; do
  v="$(basename "$f" | cut -d_ -f1)"
  [ "$v" \> 20261121000000 ] || cp "$f" "$WORK/before/supabase/migrations/"
  cp "$f" "$WORK/after/supabase/migrations/"
done

# 1. Staging today, through the standard tooling.
if out=$("$SUPABASE" db push --output-format json --db-url "$CLI_DB" --workdir "$WORK/before" --yes 2>&1) \
   && [ "$(psql "$DB" -X -q -At -c "select count(*) from supabase_migrations.schema_migrations where version <= '20261121000000'")" = "$(ls "$WORK/before/supabase/migrations" | wc -l | tr -d ' ')" ]; then
  ok "the CLI applied every migration through 20261121000000 and created its own history table"
else
  bad "initial db push: $(tail -3 <<<"$out" | tr '\n' ' ')"; exit 1
fi
F=00000000-0000-4000-8000-0000000fc001
psql "$DB" -X -q -v ON_ERROR_STOP=1 -c "set role supabase_auth_admin; insert into auth.users (id, email, email_confirmed_at) values ('$F', 'founder@cli-compat.test', now()); reset role;" >/dev/null || exit 1

# 2. The activation.
out=$(STAGING_FOUNDER_ACCOUNT_ID="$F" psql "$DB" -X -q -v ON_ERROR_STOP=1 -v mode=activate -v confirm='ACTIVATE STAGING MEMBER ACCESS' -f scripts/db/staging-activate-member-access.sql 2>&1)
grep -q '^Activated' <<<"$out" && ok "the activation committed" || { bad "activation: $(grep -E 'ERROR|FAIL' <<<"$out" | head -2 | tr '\n' ' ')"; exit 1; }

# 3. The CLI sees it as applied, and won't apply it again.
out=$("$SUPABASE" migration list --output-format json --db-url "$CLI_DB" --workdir "$WORK/after" 2>&1)
grep -q '"local":"20261122000000","remote":"20261122000000"' <<<"$out" \
  && ok "supabase migration list shows 20261122000000 applied (local = remote)" || bad "migration list: $(tail -2 <<<"$out" | tr '\n' ' ')"
out=$("$SUPABASE" db push --output-format json --db-url "$CLI_DB" --workdir "$WORK/after" --dry-run 2>&1)
grep -q '"upToDate":true' <<<"$out" \
  && ok "supabase db push --dry-run reports the database is up to date (it won't re-apply 20261122000000)" || bad "dry run after activation: $(tail -2 <<<"$out" | tr '\n' ' ')"

# 4. A later migration, through the standard tooling.
cat > "$WORK/after/supabase/migrations/20991231000000_followup_test.sql" <<'SQL'
-- TEST ONLY (temporary copy): a later migration after the activation.
create function ops.followup_test() returns int language sql set search_path = '' as 'select (select count(*) from ops.member_access)::int';
revoke all on function ops.followup_test() from public, anon, authenticated;
SQL
out=$("$SUPABASE" db push --output-format json --db-url "$CLI_DB" --workdir "$WORK/after" --dry-run 2>&1)
grep -q '"migrations":\["20991231000000_followup_test.sql"\]' <<<"$out" \
  && ok "a dry run lists only the later migration" || bad "dry run with a later migration: $(tail -2 <<<"$out" | tr '\n' ' ')"
out=$("$SUPABASE" db push --output-format json --db-url "$CLI_DB" --workdir "$WORK/after" --yes 2>&1); code=$?
if [ $code -eq 0 ] && grep -q 'Applying migration 20991231000000_followup_test.sql' <<<"$out" && ! grep -q 'Applying migration 20261122000000' <<<"$out" \
   && [ "$(psql "$DB" -X -q -At -c "select ops.followup_test()")" = 1 ]; then
  ok "supabase db push applied the later migration alone, on top of the activation"
else
  bad "db push of a later migration (exit $code): $(tail -3 <<<"$out" | tr '\n' ' ')"
fi
out=$("$SUPABASE" migration list --output-format json --db-url "$CLI_DB" --workdir "$WORK/after" 2>&1)
grep -q '"local":"20991231000000","remote":"20991231000000"' <<<"$out" && grep -q '"local":"20261122000000","remote":"20261122000000"' <<<"$out" \
  && ok "the history lists both, in order" || bad "final migration list: $(tail -2 <<<"$out" | tr '\n' ' ')"

echo "CLI compatibility tests: $pass passed, $failed failed"
[ $failed -eq 0 ]
