#!/usr/bin/env bash
# Tests the staging rollback of 20261215000000 (founder decisions),
# scripts/db/staging-rollback-founder-decisions.sql, against a LOCAL Supabase database.
# Local only. Called first by scripts/db/rollback-test.sh, because
# 20261212000000 is the newest migration.
set -uo pipefail
cd "$(dirname "$0")/../.."
DB_URL="${DB_URL:-postgresql://postgres:postgres@127.0.0.1:54322/postgres}"
case "$DB_URL" in
  *@127.0.0.1:*|*@localhost:*) ;;
  *) echo "Refusing: this test only runs against a local database." >&2; exit 1 ;;
esac
SQL=scripts/db/staging-rollback-founder-decisions.sql
PHRASE='REMOVE THE STAGING FOUNDER DECISIONS'
PSQL=(psql "$DB_URL" -X -q -At -v ON_ERROR_STOP=1)
pass=0; failed=0
ok()  { echo "PASS  founder decisions rollback: $1"; pass=$((pass + 1)); }
bad() { echo "FAIL  founder decisions rollback: $1"; failed=$((failed + 1)); }
rollback() { psql "$DB_URL" -X -q -v ON_ERROR_STOP=1 -v mode="$1" -v confirm="$2" -f "$SQL" 2>&1; }
q() { "${PSQL[@]}" -c "$1"; }
replica() { psql "$DB_URL" -X -q -v ON_ERROR_STOP=1 -c "begin" -c "set local session_replication_role = replica" -c "$1" -c "commit" >/dev/null 2>&1; }
present() { q "select exists (select 1 from sim.point_rules where action = 'own_audience_referral') and exists (select 1 from supabase_migrations.schema_migrations where version = '20261215000000')"; }
refuses() {
  local out code
  out=$(rollback "$2" "$3"); code=$?
  if [ $code -ne 0 ] && grep -q "$4" <<<"$out" && [ "$(present)" = t ]; then ok "refuses $1, changing nothing"; else bad "did not refuse $1 (exit $code): $(tail -2 <<<"$out" | tr '\n' ' ')"; fi
}

[ "$(present)" = t ] || { bad "20261215000000 is not applied here"; echo "Founder decisions rollback tests: $pass passed, $failed failed"; exit 1; }
refuses "a bad mode" "drop" "" "mode must be check or apply"
refuses "apply without the phrase" "apply" "" "needs the confirmation phrase"
refuses "apply with a wrong phrase" "apply" "remove it" "needs the confirmation phrase"
replica "insert into sim.points_ledger (member_id, action, points, redeemable, status, rule_version, source_key) values (null, 'own_audience_referral', 20, false, 'recognized', 'd6-v1', 'rollback-test:own')"
refuses "while an own-audience recognition award exists" "check" "" "rows of data depend on founder decisions"
replica "delete from sim.points_ledger where source_key = 'rollback-test:own'"
q "insert into supabase_migrations.schema_migrations (version, name) values ('20261231000000', 'later')" >/dev/null
refuses "while a later migration is recorded" "check" "" "later migration"
q "delete from supabase_migrations.schema_migrations where version = '20261231000000'" >/dev/null

out=$(rollback check ""); code=$?
[ $code -eq 0 ] && grep -q 'Check only' <<<"$out" && [ "$(present)" = t ] && ok "check passes and changes nothing" || bad "check (exit $code): $(tail -2 <<<"$out" | tr '\n' ' ')"
out=$(rollback apply "$PHRASE"); code=$?
if [ $code -eq 0 ] && grep -q 'Applied' <<<"$out"; then ok "apply succeeds"; else bad "apply (exit $code): $(tail -3 <<<"$out" | tr '\n' ' ')"; fi
left=$(q "select count(*) from sim.point_rules where action = 'own_audience_referral'")
rec=$(q "select count(*) from supabase_migrations.schema_migrations where version = '20261215000000'")
old=$(q "select position('own_audience_referral' in (select prosrc from pg_proc where oid = 'sim.capture()'::regprocedure)) = 0 and position('escalate_to_founder' in (select prosrc from pg_proc where oid = 'public.app_mod_enforce(uuid, text, text, uuid, integer, text, boolean)'::regprocedure)) = 0 and has_function_privilege('authenticated', 'public.app_mod_enforce(uuid, text, text, uuid, integer, text, boolean)', 'EXECUTE')")
[ "$left$rec$old" = 00t ] && ok "apply removed the decisions and the record, and put back referral capture and enforcement" || bad "left behind: rule $left, record $rec, earlier functions $old"
out=$(rollback check ""); code=$?
[ $code -ne 0 ] && grep -q 'expected objects are missing' <<<"$out" && ok "a second run refuses" || bad "a second run did not refuse (exit $code)"

echo "Founder decisions rollback tests: $pass passed, $failed failed"
[ $failed -eq 0 ]
