#!/usr/bin/env bash
# Tests the staging rollback of 20261217000000 (progression),
# scripts/db/staging-rollback-progression.sql, against a LOCAL Supabase database.
# Local only. Called first by scripts/db/rollback-test.sh, because
# 20261217000000 is the newest migration.
set -uo pipefail
cd "$(dirname "$0")/../.."
DB_URL="${DB_URL:-postgresql://postgres:postgres@127.0.0.1:54322/postgres}"
case "$DB_URL" in
  *@127.0.0.1:*|*@localhost:*) ;;
  *) echo "Refusing: this test only runs against a local database." >&2; exit 1 ;;
esac
SQL=scripts/db/staging-rollback-progression.sql
PHRASE='REMOVE STAGING PROGRESSION'
PSQL=(psql "$DB_URL" -X -q -At -v ON_ERROR_STOP=1)
pass=0; failed=0
ok()  { echo "PASS  progression rollback: $1"; pass=$((pass + 1)); }
bad() { echo "FAIL  progression rollback: $1"; failed=$((failed + 1)); }
rollback() { psql "$DB_URL" -X -q -v ON_ERROR_STOP=1 -v mode="$1" -v confirm="$2" -f "$SQL" 2>&1; }
q() { "${PSQL[@]}" -c "$1"; }
present() { q "select to_regclass('sim.goal_versions') is not null and exists (select 1 from ops.feature_switches where feature = 'progression') and exists (select 1 from supabase_migrations.schema_migrations where version = '20261217000000')"; }
refuses() {
  local out code
  out=$(rollback "$2" "$3"); code=$?
  if [ $code -ne 0 ] && grep -q "$4" <<<"$out" && [ "$(present)" = t ]; then ok "refuses $1, changing nothing"; else bad "did not refuse $1 (exit $code): $(tail -2 <<<"$out" | tr '\n' ' ')"; fi
}

[ "$(present)" = t ] || { bad "20261217000000 is not applied here"; echo "Progression rollback tests: $pass passed, $failed failed"; exit 1; }
[ "$(q "select count(*) from sim.goal_versions") + $(q "select count(*) from sim.qualifications")" = "0 + 0" ] \
  || { bad "earlier tests left progression history here; run on a freshly reset database"; echo "Progression rollback tests: $pass passed, $failed failed"; exit 1; }
refuses "a bad mode" "drop" "" "mode must be check or apply"
refuses "apply without the phrase" "apply" "" "needs the confirmation phrase"
refuses "apply with a wrong phrase" "apply" "remove it" "needs the confirmation phrase"
q "update ops.feature_switches set enabled = true where feature = 'progression'" >/dev/null
refuses "while the switch is on" "check" "" "the progression switch is on"
q "update ops.feature_switches set enabled = false where feature = 'progression'" >/dev/null
# A goal version is history: the append-only guard is paused only to remove the test row again.
q "alter table sim.goal_versions disable trigger goal_versions_append_only" >/dev/null
q "insert into sim.goal_versions (audience, targets, reason, set_by) values ('creator', '{}', 'rollback test', 'founder:test')" >/dev/null
refuses "while goal values are recorded" "check" "" "would lose that history"
q "delete from sim.goal_versions where reason = 'rollback test'" >/dev/null
q "alter table sim.goal_versions enable trigger goal_versions_append_only" >/dev/null
q "insert into supabase_migrations.schema_migrations (version, name) values ('20261231000000', 'later')" >/dev/null
refuses "while a later migration is recorded" "check" "" "later migration"
q "delete from supabase_migrations.schema_migrations where version = '20261231000000'" >/dev/null

out=$(rollback check ""); code=$?
[ $code -eq 0 ] && grep -q 'Check only' <<<"$out" && [ "$(present)" = t ] && ok "check passes and changes nothing" || bad "check (exit $code): $(tail -2 <<<"$out" | tr '\n' ' ')"
out=$(rollback apply "$PHRASE"); code=$?
if [ $code -eq 0 ] && grep -q 'Applied' <<<"$out"; then ok "apply succeeds"; else bad "apply (exit $code): $(tail -3 <<<"$out" | tr '\n' ' ')"; fi
left=$(q "select (to_regclass('sim.goal_versions') is null and to_regclass('sim.qualifications') is null and to_regclass('sim.creator_share_states') is null and to_regclass('sim.allocation_states') is null)::int
             + (select count(*) from ops.feature_switches where feature = 'progression')::int * 10
             + (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname in ('public', 'sim') and p.proname in ('app_my_progress', 'app_founder_set_goals', 'app_founder_goals', 'app_founder_settle_eligible', 'goal_values', 'release_qualified'))::int * 100
             + (select count(*) from supabase_migrations.schema_migrations where version = '20261217000000')::int * 1000
             + (case when (select prosrc from pg_proc where oid = 'public.app_features()'::regprocedure) ~ 'progression' then 10000 else 0 end)")
[ "$left" = 1 ] && ok "apply removed the tables, functions, switch and record, and restored app_features" || bad "left behind (code $left)"
out=$(rollback check ""); code=$?
[ $code -ne 0 ] && grep -q 'expected objects are missing' <<<"$out" && ok "a second run refuses" || bad "a second run did not refuse (exit $code)"

echo "Progression rollback tests: $pass passed, $failed failed"
[ $failed -eq 0 ]
