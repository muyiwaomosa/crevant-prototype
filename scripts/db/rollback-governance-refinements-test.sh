#!/usr/bin/env bash
# Tests the staging rollback of 20261207000000 (governance refinements),
# scripts/db/staging-rollback-governance-refinements.sql, against a LOCAL Supabase database.
# Local only. Called first by scripts/db/rollback-test.sh, because
# 20261207000000 is the newest migration.
set -uo pipefail
cd "$(dirname "$0")/../.."
DB_URL="${DB_URL:-postgresql://postgres:postgres@127.0.0.1:54322/postgres}"
case "$DB_URL" in
  *@127.0.0.1:*|*@localhost:*) ;;
  *) echo "Refusing: this test only runs against a local database." >&2; exit 1 ;;
esac
SQL=scripts/db/staging-rollback-governance-refinements.sql
PHRASE='REMOVE THE STAGING GOVERNANCE REFINEMENTS'
PSQL=(psql "$DB_URL" -X -q -At -v ON_ERROR_STOP=1)
pass=0; failed=0
ok()  { echo "PASS  governance refinements rollback: $1"; pass=$((pass + 1)); }
bad() { echo "FAIL  governance refinements rollback: $1"; failed=$((failed + 1)); }
rollback() { psql "$DB_URL" -X -q -v ON_ERROR_STOP=1 -v mode="$1" -v confirm="$2" -f "$SQL" 2>&1; }
q() { "${PSQL[@]}" -c "$1"; }
replica() { psql "$DB_URL" -X -q -v ON_ERROR_STOP=1 -c "begin" -c "set local session_replication_role = replica" -c "$1" -c "commit" >/dev/null 2>&1; }
present() { q "select to_regprocedure('sim.restore_hidden(text, uuid)') is not null and exists (select 1 from supabase_migrations.schema_migrations where version = '20261207000000')"; }
refuses() {
  local out code
  out=$(rollback "$2" "$3"); code=$?
  if [ $code -ne 0 ] && grep -q "$4" <<<"$out" && [ "$(present)" = t ]; then ok "refuses $1, changing nothing"; else bad "did not refuse $1 (exit $code): $(tail -2 <<<"$out" | tr '\n' ' ')"; fi
}

[ "$(present)" = t ] || { bad "20261207000000 is not applied here"; echo "Governance refinements rollback tests: $pass passed, $failed failed"; exit 1; }
replica "delete from ops.appeals; delete from ops.member_notices; delete from ops.enforcement_lifts; delete from ops.enforcements; delete from sim.points_ledger where source_key like 'restored:%'"

refuses "a bad mode" "drop" "" "mode must be check or apply"
refuses "apply without the phrase" "apply" "" "needs the confirmation phrase"
refuses "apply with a wrong phrase" "apply" "remove it" "needs the confirmation phrase"
U=00000000-0000-4000-8000-fdfdfd00b014
q "insert into auth.users (id, email, email_confirmed_at) values ('$U', 'gr-rollback@example.test', now()) on conflict do nothing" >/dev/null
for case in "restored point entry|insert into sim.points_ledger (member_id, action, points, redeemable, status, rule_version, source_key) values ('$U', 'save', 2, false, 'recognized', 'd6-v1', 'restored:probe')|delete from sim.points_ledger where source_key = 'restored:probe'" \
            "immediate enforcement|insert into ops.enforcements (member_id, level, reason, immediate) values ('$U', 'warning', 'spam', true)|delete from ops.enforcements" \
            "sole-moderator notice|insert into ops.member_notices (member_id, kind, same_moderator) values ('$U', 'appeal_upheld', true)|delete from ops.member_notices"; do
  name=${case%%|*}; rest=${case#*|}; add=${rest%%|*}; remove=${rest#*|}
  replica "$add"
  refuses "while a $name exists" "check" "" "rows of data depend on the refinements"
  replica "$remove"
done
q "delete from auth.users where id = '$U'" >/dev/null
q "insert into supabase_migrations.schema_migrations (version, name) values ('20261231000000', 'later')" >/dev/null
refuses "while a later migration is recorded" "check" "" "later migration"
q "delete from supabase_migrations.schema_migrations where version = '20261231000000'" >/dev/null

out=$(rollback check ""); code=$?
[ $code -eq 0 ] && grep -q 'Check only' <<<"$out" && [ "$(present)" = t ] && ok "check passes and changes nothing" || bad "check (exit $code): $(tail -2 <<<"$out" | tr '\n' ' ')"
out=$(rollback apply "$PHRASE"); code=$?
if [ $code -eq 0 ] && grep -q 'Applied' <<<"$out"; then ok "apply succeeds"; else bad "apply (exit $code): $(tail -3 <<<"$out" | tr '\n' ' ')"; fi
left=$(q "select count(*) from pg_proc where oid in (coalesce(to_regprocedure('sim.restore_hidden(text, uuid)'), 0), coalesce(to_regprocedure('ops.other_moderator_available(uuid, uuid)'), 0), coalesce(to_regprocedure('public.app_mod_enforce(uuid, text, text, uuid, integer, text, boolean)'), 0))")
cols=$(q "select count(*) from information_schema.columns where (table_schema, table_name, column_name) in (('ops', 'enforcements', 'immediate'), ('ops', 'appeals', 'same_moderator'), ('ops', 'member_notices', 'same_moderator'))")
rec=$(q "select count(*) from supabase_migrations.schema_migrations where version = '20261207000000'")
[ "$left$cols$rec" = 000 ] && ok "apply removed the helpers, the new signature, the columns and the record" || bad "left behind: functions $left, columns $cols, record $rec"
src=$(q "select to_regprocedure('public.app_mod_enforce(uuid, text, text, uuid, integer, text)') is not null and (select prosrc from pg_proc where oid = 'public.app_mod_decide_appeal(uuid, boolean, text)'::regprocedure) !~ 'restore_hidden' and has_function_privilege('authenticated', 'public.app_my_notices()', 'EXECUTE')")
[ "$src" = t ] && ok "apply put back the 20261206000000 functions, with their grants" || bad "the 20261206000000 functions were not restored"
out=$(rollback check ""); code=$?
[ $code -ne 0 ] && grep -q 'expected objects are missing' <<<"$out" && ok "a second run refuses" || bad "a second run did not refuse (exit $code)"

echo "Governance refinements rollback tests: $pass passed, $failed failed"
[ $failed -eq 0 ]
