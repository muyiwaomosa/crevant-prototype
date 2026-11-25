#!/usr/bin/env bash
# Tests the staging rollback of 20261205000000 (rewards),
# scripts/db/staging-rollback-rewards.sql, against a LOCAL Supabase database.
# Local only. Called first by scripts/db/rollback-test.sh, because
# 20261205000000 is the newest migration.
set -uo pipefail
cd "$(dirname "$0")/../.."
DB_URL="${DB_URL:-postgresql://postgres:postgres@127.0.0.1:54322/postgres}"
case "$DB_URL" in
  *@127.0.0.1:*|*@localhost:*) ;;
  *) echo "Refusing: this test only runs against a local database." >&2; exit 1 ;;
esac
SQL=scripts/db/staging-rollback-rewards.sql
PHRASE='REMOVE THE STAGING REWARDS'
PSQL=(psql "$DB_URL" -X -q -At -v ON_ERROR_STOP=1)
pass=0; failed=0
ok()  { echo "PASS  rewards rollback: $1"; pass=$((pass + 1)); }
bad() { echo "FAIL  rewards rollback: $1"; failed=$((failed + 1)); }
rollback() { psql "$DB_URL" -X -q -v ON_ERROR_STOP=1 -v mode="$1" -v confirm="$2" -f "$SQL" 2>&1; }
q() { "${PSQL[@]}" -c "$1"; }
replica() { psql "$DB_URL" -X -q -v ON_ERROR_STOP=1 -c "begin" -c "set local session_replication_role = replica" -c "$1" -c "commit" >/dev/null 2>&1; }
present() { q "select to_regclass('sim.points_ledger') is not null and exists (select 1 from supabase_migrations.schema_migrations where version = '20261205000000')"; }
refuses() {
  local out code
  out=$(rollback "$2" "$3"); code=$?
  if [ $code -ne 0 ] && grep -q "$4" <<<"$out" && [ "$(present)" = t ]; then ok "refuses $1, changing nothing"; else bad "did not refuse $1 (exit $code): $(tail -2 <<<"$out" | tr '\n' ' ')"; fi
}

[ "$(present)" = t ] || { bad "20261205000000 is not applied here"; echo "Rewards rollback tests: $pass passed, $failed failed"; exit 1; }
replica "delete from sim.settlement_lines; delete from sim.settlements; delete from sim.revenue_entries; delete from sim.points_ledger"

refuses "a bad mode" "drop" "" "mode must be check or apply"
refuses "apply without the phrase" "apply" "" "needs the confirmation phrase"
refuses "apply with a wrong phrase" "apply" "remove it" "needs the confirmation phrase"
U=00000000-0000-4000-8000-fdfdfd00b011
q "insert into auth.users (id, email, email_confirmed_at) values ('$U', 'rw-rollback@example.test', now()) on conflict do nothing" >/dev/null
for case in "points entry|insert into sim.points_ledger (member_id, action, points, redeemable, status, rule_version, source_key) values ('$U', 'save', 2, false, 'recognized', 'd6-v1', 'probe')|delete from sim.points_ledger" \
            "simulated revenue entry|insert into sim.revenue_entries (month, kind, net_cents, note, recorded_by) values (date_trunc('month', now())::date, 'feed_ad', 1, 'probe', 't')|delete from sim.revenue_entries" \
            "settlement|insert into sim.settlements (month, pool_cents, points, closed_by) values (date_trunc('month', now())::date, 0, 0, 't')|delete from sim.settlements"; do
  name=${case%%|*}; rest=${case#*|}; add=${rest%%|*}; remove=${rest#*|}
  replica "$add"
  refuses "while a $name exists" "check" "" "rows of data exist"
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
left=$(q "select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'sim' and c.relname in ('point_rules', 'reward_settings', 'points_ledger', 'revenue_entries', 'settlements', 'settlement_lines')")
fns=$(q "select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace where (n.nspname = 'public' and p.proname in ('app_my_points', 'app_my_points_history', 'app_my_simulated_earnings', 'app_founder_referral_queue', 'app_founder_review_referral', 'app_founder_record_sim_revenue', 'app_founder_close_month', 'app_founder_rewards_overview', 'app_founder_set_rewards')) or n.nspname = 'sim'")
trg=$(q "select count(*) from pg_trigger where tgname like 'rewards\_%' and not tgisinternal")
rec=$(q "select count(*) from supabase_migrations.schema_migrations where version = '20261205000000'")
[ "$left$fns$trg$rec" = 0000 ] && ok "apply removed every table, function, trigger and the record" || bad "left behind: tables $left, functions $fns, triggers $trg, record $rec"
out=$(rollback check ""); code=$?
[ $code -ne 0 ] && grep -q 'expected objects are missing' <<<"$out" && ok "a second run refuses" || bad "a second run did not refuse (exit $code)"

echo "Rewards rollback tests: $pass passed, $failed failed"
[ $failed -eq 0 ]
