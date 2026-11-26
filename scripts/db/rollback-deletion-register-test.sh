#!/usr/bin/env bash
# Tests the staging rollback of 20261216000000 (the deletion register),
# scripts/db/staging-rollback-deletion-register.sql, against a LOCAL Supabase database.
# Local only. Called first by scripts/db/rollback-test.sh, because
# 20261216000000 is the newest migration.
set -uo pipefail
cd "$(dirname "$0")/../.."
DB_URL="${DB_URL:-postgresql://postgres:postgres@127.0.0.1:54322/postgres}"
case "$DB_URL" in
  *@127.0.0.1:*|*@localhost:*) ;;
  *) echo "Refusing: this test only runs against a local database." >&2; exit 1 ;;
esac
SQL=scripts/db/staging-rollback-deletion-register.sql
PHRASE='REMOVE THE STAGING DELETION REGISTER'
PSQL=(psql "$DB_URL" -X -q -At -v ON_ERROR_STOP=1)
pass=0; failed=0
ok()  { echo "PASS  deletion register rollback: $1"; pass=$((pass + 1)); }
bad() { echo "FAIL  deletion register rollback: $1"; failed=$((failed + 1)); }
rollback() { psql "$DB_URL" -X -q -v ON_ERROR_STOP=1 -v mode="$1" -v confirm="$2" -f "$SQL" 2>&1; }
q() { "${PSQL[@]}" -c "$1"; }
present() { q "select to_regclass('ops.deletion_register') is not null and exists (select 1 from supabase_migrations.schema_migrations where version = '20261216000000')"; }
refuses() {
  local out code
  out=$(rollback "$2" "$3"); code=$?
  if [ $code -ne 0 ] && grep -q "$4" <<<"$out" && [ "$(present)" = t ]; then ok "refuses $1, changing nothing"; else bad "did not refuse $1 (exit $code): $(tail -2 <<<"$out" | tr '\n' ' ')"; fi
}

[ "$(present)" = t ] || { bad "20261216000000 is not applied here"; echo "Deletion register rollback tests: $pass passed, $failed failed"; exit 1; }
# Anything left by earlier tests is reported first (the drain would have logged it).
q "select public.svc_deletion_register_reported(array(select id from ops.deletion_register where reported_at is null))" >/dev/null
refuses "a bad mode" "drop" "" "mode must be check or apply"
refuses "apply without the phrase" "apply" "" "needs the confirmation phrase"
refuses "apply with a wrong phrase" "apply" "remove it" "needs the confirmation phrase"
q "insert into ops.deletion_register (kind, target_id, event) values ('post', gen_random_uuid(), 'deleted')" >/dev/null
refuses "while a deletion is not yet in the function log" "check" "" "not yet in the function log"
q "select public.svc_deletion_register_reported(array(select id from ops.deletion_register where reported_at is null))" >/dev/null
q "insert into supabase_migrations.schema_migrations (version, name) values ('20261231000000', 'later')" >/dev/null
refuses "while a later migration is recorded" "check" "" "later migration"
q "delete from supabase_migrations.schema_migrations where version = '20261231000000'" >/dev/null

out=$(rollback check ""); code=$?
[ $code -eq 0 ] && grep -q 'Check only' <<<"$out" && [ "$(present)" = t ] && ok "check passes and changes nothing" || bad "check (exit $code): $(tail -2 <<<"$out" | tr '\n' ' ')"
out=$(rollback apply "$PHRASE"); code=$?
if [ $code -eq 0 ] && grep -q 'Applied' <<<"$out"; then ok "apply succeeds"; else bad "apply (exit $code): $(tail -3 <<<"$out" | tr '\n' ' ')"; fi
left=$(q "select (to_regclass('ops.deletion_register') is null)::int + (select count(*) from pg_trigger where tgname in ('register_account_deletion', 'register_post_deletion', 'register_comment_deletion'))::int * 10 + (select count(*) from supabase_migrations.schema_migrations where version = '20261216000000')::int * 100")
[ "$left" = 1 ] && ok "apply removed the register, its triggers and the record" || bad "left behind (code $left)"
out=$(rollback check ""); code=$?
[ $code -ne 0 ] && grep -q 'expected objects are missing' <<<"$out" && ok "a second run refuses" || bad "a second run did not refuse (exit $code)"

echo "Deletion register rollback tests: $pass passed, $failed failed"
[ $failed -eq 0 ]
