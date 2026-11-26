#!/usr/bin/env bash
# Tests the staging rollback of 20261218000000 (progression rules, SP-PRG-001),
# scripts/db/staging-rollback-progression-rules.sql, against a LOCAL Supabase database.
# Local only. Called first by scripts/db/rollback-test.sh, because
# 20261218000000 is the newest migration.
set -uo pipefail
cd "$(dirname "$0")/../.."
DB_URL="${DB_URL:-postgresql://postgres:postgres@127.0.0.1:54322/postgres}"
case "$DB_URL" in
  *@127.0.0.1:*|*@localhost:*) ;;
  *) echo "Refusing: this test only runs against a local database." >&2; exit 1 ;;
esac
SQL=scripts/db/staging-rollback-progression-rules.sql
PHRASE='REMOVE STAGING PROGRESSION RULES'
PSQL=(psql "$DB_URL" -X -q -At -v ON_ERROR_STOP=1)
pass=0; failed=0
ok()  { echo "PASS  progression rules rollback: $1"; pass=$((pass + 1)); }
bad() { echo "FAIL  progression rules rollback: $1"; failed=$((failed + 1)); }
rollback() { psql "$DB_URL" -X -q -v ON_ERROR_STOP=1 -v mode="$1" -v confirm="$2" -f "$SQL" 2>&1; }
q() { "${PSQL[@]}" -c "$1"; }
present() { q "select to_regclass('sim.qualification_decisions') is not null and exists (select 1 from supabase_migrations.schema_migrations where version = '20261218000000')"; }
refuses() {
  local out code
  out=$(rollback "$2" "$3"); code=$?
  if [ $code -ne 0 ] && grep -q "$4" <<<"$out" && [ "$(present)" = t ]; then ok "refuses $1, changing nothing"; else bad "did not refuse $1 (exit $code): $(tail -2 <<<"$out" | tr '\n' ' ')"; fi
}

[ "$(present)" = t ] || { bad "20261218000000 is not applied here"; echo "Progression rules rollback tests: $pass passed, $failed failed"; exit 1; }
[ "$(q "select count(*) from sim.goal_versions where set_by not like 'founder-approved:SP-PRG-001 %'") $(q "select count(*) from sim.qualifications")" = "0 0" ] \
  || { bad "earlier tests left progression history here; run on a freshly reset database"; echo "Progression rules rollback tests: $pass passed, $failed failed"; exit 1; }
refuses "a bad mode" "drop" "" "mode must be check or apply"
refuses "apply without the phrase" "apply" "" "needs the confirmation phrase"
refuses "apply with a wrong phrase" "apply" "remove it" "needs the confirmation phrase"
# A goal change is history: added, refused on, then removed with the append-only guard paused.
q "insert into sim.goal_versions (audience, targets, reason, set_by) values ('creator', '{}', 'rollback test', 'founder:test')" >/dev/null
refuses "while a goal change is recorded" "check" "" "would lose that history"
q "alter table sim.goal_versions disable trigger goal_versions_append_only" >/dev/null
q "delete from sim.goal_versions where reason = 'rollback test'" >/dev/null
q "alter table sim.goal_versions enable trigger goal_versions_append_only" >/dev/null
q "insert into supabase_migrations.schema_migrations (version, name) values ('20261231000000', 'later')" >/dev/null
refuses "while a later migration is recorded" "check" "" "later migration"
q "delete from supabase_migrations.schema_migrations where version = '20261231000000'" >/dev/null

out=$(rollback check ""); code=$?
[ $code -eq 0 ] && grep -q 'Check only' <<<"$out" && [ "$(present)" = t ] && ok "check passes and changes nothing" || bad "check (exit $code): $(tail -2 <<<"$out" | tr '\n' ' ')"
out=$(rollback apply "$PHRASE"); code=$?
if [ $code -eq 0 ] && grep -q 'Applied' <<<"$out"; then ok "apply succeeds"; else bad "apply (exit $code): $(tail -3 <<<"$out" | tr '\n' ' ')"; fi
left=$(q "select (to_regclass('sim.qualification_decisions') is null and to_regclass('sim.financial_holds') is null and to_regclass('sim.allocation_corrections') is null)::int
             + (select count(*) from information_schema.columns where table_schema = 'sim' and table_name = 'revenue_entries' and column_name in ('corrects', 'correction_kind', 'evidence_ref'))::int * 10
             + (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname in ('public', 'sim') and p.proname in ('app_founder_progression_report', 'app_founder_decide_qualification', 'qualification_status', 'eligible_member'))::int * 100
             + (select count(*) from supabase_migrations.schema_migrations where version = '20261218000000')::int * 1000
             + (select count(*) from sim.goal_versions)::int * 10000
             + (case when (select prosrc from pg_proc where oid = 'sim.goal_values(uuid,text)'::regprocedure) ~ 'active_supporters' then 0 else 100000 end)")
[ "$left" = 1 ] && ok "apply removed the rules, the benchmarks and the record, and restored the 20261217 functions" || bad "left behind (code $left)"
out=$(rollback check ""); code=$?
[ $code -ne 0 ] && grep -q 'expected objects are missing' <<<"$out" && ok "a second run refuses" || bad "a second run did not refuse (exit $code)"
# The earlier progression rollback now finds 20261217 exactly as it left it.
out=$(psql "$DB_URL" -X -q -v ON_ERROR_STOP=1 -v mode=check -v confirm= -f scripts/db/staging-rollback-progression.sql 2>&1); code=$?
[ $code -eq 0 ] && grep -q 'Check only' <<<"$out" && ok "the progression rollback check then passes" || bad "progression rollback check after (exit $code): $(tail -2 <<<"$out" | tr '\n' ' ')"

echo "Progression rules rollback tests: $pass passed, $failed failed"
[ $failed -eq 0 ]
