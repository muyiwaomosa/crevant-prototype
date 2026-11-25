#!/usr/bin/env bash
# Tests the staging rollback of 20261212000000 (privacy requests and switches),
# scripts/db/staging-rollback-privacy-switches.sql, against a LOCAL Supabase database.
# Local only. Called first by scripts/db/rollback-test.sh, because
# 20261212000000 is the newest migration.
set -uo pipefail
cd "$(dirname "$0")/../.."
DB_URL="${DB_URL:-postgresql://postgres:postgres@127.0.0.1:54322/postgres}"
case "$DB_URL" in
  *@127.0.0.1:*|*@localhost:*) ;;
  *) echo "Refusing: this test only runs against a local database." >&2; exit 1 ;;
esac
SQL=scripts/db/staging-rollback-privacy-switches.sql
PHRASE='REMOVE THE STAGING PRIVACY AND SWITCHES'
PSQL=(psql "$DB_URL" -X -q -At -v ON_ERROR_STOP=1)
pass=0; failed=0
ok()  { echo "PASS  privacy and switches rollback: $1"; pass=$((pass + 1)); }
bad() { echo "FAIL  privacy and switches rollback: $1"; failed=$((failed + 1)); }
rollback() { psql "$DB_URL" -X -q -v ON_ERROR_STOP=1 -v mode="$1" -v confirm="$2" -f "$SQL" 2>&1; }
q() { "${PSQL[@]}" -c "$1"; }
replica() { psql "$DB_URL" -X -q -v ON_ERROR_STOP=1 -c "begin" -c "set local session_replication_role = replica" -c "$1" -c "commit" >/dev/null 2>&1; }
present() { q "select to_regclass('ops.feature_switches') is not null and exists (select 1 from supabase_migrations.schema_migrations where version = '20261212000000')"; }
refuses() {
  local out code
  out=$(rollback "$2" "$3"); code=$?
  if [ $code -ne 0 ] && grep -q "$4" <<<"$out" && [ "$(present)" = t ]; then ok "refuses $1, changing nothing"; else bad "did not refuse $1 (exit $code): $(tail -2 <<<"$out" | tr '\n' ' ')"; fi
}

[ "$(present)" = t ] || { bad "20261212000000 is not applied here"; echo "Privacy and switches rollback tests: $pass passed, $failed failed"; exit 1; }
replica "delete from ops.member_request_events; delete from ops.member_requests; delete from ops.feature_switch_events"

refuses "a bad mode" "drop" "" "mode must be check or apply"
refuses "apply without the phrase" "apply" "" "needs the confirmation phrase"
refuses "apply with a wrong phrase" "apply" "remove it" "needs the confirmation phrase"
U=00000000-0000-4000-8000-fdfdfd00b019
q "insert into auth.users (id, email, email_confirmed_at) values ('$U', 'pr-rollback@example.test', now()) on conflict do nothing" >/dev/null
for case in "privacy request|insert into ops.member_requests (member_id, kind) values ('$U', 'access')|delete from ops.member_requests" \
            "switch change|insert into ops.feature_switch_events (feature, enabled, reason, changed_by) values ('ads', true, 'probe', 'test')|delete from ops.feature_switch_events"; do
  name=${case%%|*}; rest=${case#*|}; add=${rest%%|*}; remove=${rest#*|}
  replica "$add"
  refuses "while a $name exists" "check" "" "rows of data depend on privacy requests and switches"
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
left=$(q "select count(*) from pg_class where oid in (coalesce(to_regclass('ops.feature_switches'), 0), coalesce(to_regclass('ops.member_requests'), 0))")
fns=$(q "select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace where (n.nspname = 'public' and p.proname in ('app_features', 'app_founder_switches', 'app_founder_set_switch', 'app_submit_member_request', 'app_my_member_requests', 'app_withdraw_member_request', 'app_founder_member_requests', 'app_founder_resolve_member_request', 'app_founder_delete_member')) or (n.nspname = 'ops' and p.proname = 'feature_on')")
rec=$(q "select count(*) from supabase_migrations.schema_migrations where version = '20261212000000'")
old=$(q "select position('feature_on' in (select prosrc from pg_proc where oid = 'ads.choose(uuid, text, text)'::regprocedure)) = 0 and position('sharing_paused' in (select prosrc from pg_proc where oid = 'public.app_record_share(uuid, text)'::regprocedure)) = 0 and (select confdeltype from pg_constraint where conname = 'points_ledger_member_id_fkey') = 'c' and has_function_privilege('authenticated', 'public.app_record_share(uuid, text)', 'EXECUTE')")
[ "$left$fns$rec$old" = 000t ] && ok "apply removed the privacy and switch objects and the record, and put back ad matching, sharing and the ledger reference" || bad "left behind: tables $left, functions $fns, record $rec, earlier functions $old"
out=$(rollback check ""); code=$?
[ $code -ne 0 ] && grep -q 'expected objects are missing' <<<"$out" && ok "a second run refuses" || bad "a second run did not refuse (exit $code)"

echo "Privacy and switches rollback tests: $pass passed, $failed failed"
[ $failed -eq 0 ]
