#!/usr/bin/env bash
# Tests the staging rollback of 20261219000000 (pilot closure, activation and triage),
# scripts/db/staging-rollback-pilot-closure.sql, against a LOCAL Supabase database.
# Local only. Called first by scripts/db/rollback-test.sh, because
# 20261219000000 is the newest migration.
set -uo pipefail
cd "$(dirname "$0")/../.."
DB_URL="${DB_URL:-postgresql://postgres:postgres@127.0.0.1:54322/postgres}"
case "$DB_URL" in
  *@127.0.0.1:*|*@localhost:*) ;;
  *) echo "Refusing: this test only runs against a local database." >&2; exit 1 ;;
esac
SQL=scripts/db/staging-rollback-pilot-closure.sql
PHRASE='REMOVE STAGING PILOT CLOSURE'
PSQL=(psql "$DB_URL" -X -q -At -v ON_ERROR_STOP=1)
pass=0; failed=0
ok()  { echo "PASS  pilot closure rollback: $1"; pass=$((pass + 1)); }
bad() { echo "FAIL  pilot closure rollback: $1"; failed=$((failed + 1)); }
rollback() { psql "$DB_URL" -X -q -v ON_ERROR_STOP=1 -v mode="$1" -v confirm="$2" -f "$SQL" 2>&1; }
q() { "${PSQL[@]}" -c "$1"; }
present() { q "select to_regclass('sim.balance_closures') is not null and exists (select 1 from supabase_migrations.schema_migrations where version = '20261219000000')"; }
refuses() {
  local out code
  out=$(rollback "$2" "$3"); code=$?
  if [ $code -ne 0 ] && grep -q "$4" <<<"$out" && [ "$(present)" = t ]; then ok "refuses $1, changing nothing"; else bad "did not refuse $1 (exit $code): $(tail -2 <<<"$out" | tr '\n' ' ')"; fi
}

[ "$(present)" = t ] || { bad "20261219000000 is not applied here"; echo "Pilot closure rollback tests: $pass passed, $failed failed"; exit 1; }
[ "$(q "select count(*) from sim.balance_closures")" = 0 ] \
  || { bad "earlier tests left balance closures here; run on a freshly reset database"; echo "Pilot closure rollback tests: $pass passed, $failed failed"; exit 1; }
refuses "a bad mode" "drop" "" "mode must be check or apply"
refuses "apply without the phrase" "apply" "" "needs the confirmation phrase"
refuses "apply with a wrong phrase" "apply" "remove it" "needs the confirmation phrase"
q "insert into sim.balance_closures (reason, closed_by) values ('account_deleted', 'rollback test')" >/dev/null
refuses "while a balance closure is recorded" "check" "" "would lose that audit record"
q "alter table sim.balance_closures disable trigger balance_closures_append_only" >/dev/null
q "delete from sim.balance_closures where closed_by = 'rollback test'" >/dev/null
q "alter table sim.balance_closures enable trigger balance_closures_append_only" >/dev/null
q "insert into supabase_migrations.schema_migrations (version, name) values ('20261231000000', 'later')" >/dev/null
refuses "while a later migration is recorded" "check" "" "later migration"
q "delete from supabase_migrations.schema_migrations where version = '20261231000000'" >/dev/null

out=$(rollback check ""); code=$?
[ $code -eq 0 ] && grep -q 'Check only' <<<"$out" && [ "$(present)" = t ] && ok "check passes and changes nothing" || bad "check (exit $code): $(tail -2 <<<"$out" | tr '\n' ' ')"
out=$(rollback apply "$PHRASE"); code=$?
if [ $code -eq 0 ] && grep -q 'Applied' <<<"$out"; then ok "apply succeeds"; else bad "apply (exit $code): $(tail -3 <<<"$out" | tr '\n' ' ')"; fi
left=$(q "select (to_regclass('sim.balance_closures') is null)::int
             + (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname in ('public', 'sim') and p.proname in ('app_founder_activation', 'app_my_deletion_consequences', 'review_concerns'))::int * 10
             + (select count(*) from supabase_migrations.schema_migrations where version = '20261219000000')::int * 100
             + (case when (select prosrc from pg_proc where oid = 'public.app_founder_delete_member(bigint,text)'::regprocedure) ~ 'balance_closures' then 1000 else 0 end)
             + (case when (select prosrc from pg_proc where oid = 'public.app_founder_progression_queue()'::regprocedure) ~ 'review_concerns' then 10000 else 0 end)")
[ "$left" = 1 ] && ok "apply removed the closure, activation and triage, and restored deletion and the review queue" || bad "left behind (code $left)"
out=$(rollback check ""); code=$?
[ $code -ne 0 ] && grep -q 'expected objects are missing' <<<"$out" && ok "a second run refuses" || bad "a second run did not refuse (exit $code)"
out=$(psql "$DB_URL" -X -q -v ON_ERROR_STOP=1 -v mode=check -v confirm= -f scripts/db/staging-rollback-progression-rules.sql 2>&1); code=$?
[ $code -eq 0 ] && grep -q 'Check only' <<<"$out" && ok "the progression rules rollback check then passes" || bad "progression rules rollback check after (exit $code): $(tail -2 <<<"$out" | tr '\n' ' ')"

echo "Pilot closure rollback tests: $pass passed, $failed failed"
[ $failed -eq 0 ]
