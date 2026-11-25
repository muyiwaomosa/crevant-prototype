#!/usr/bin/env bash
# Tests the staging rollback of 20261210000000 (intelligence),
# scripts/db/staging-rollback-intelligence.sql, against a LOCAL Supabase database.
# Local only. Called first by scripts/db/rollback-test.sh, because
# 20261210000000 is the newest migration.
set -uo pipefail
cd "$(dirname "$0")/../.."
DB_URL="${DB_URL:-postgresql://postgres:postgres@127.0.0.1:54322/postgres}"
case "$DB_URL" in
  *@127.0.0.1:*|*@localhost:*) ;;
  *) echo "Refusing: this test only runs against a local database." >&2; exit 1 ;;
esac
SQL=scripts/db/staging-rollback-intelligence.sql
PHRASE='REMOVE THE STAGING INTELLIGENCE'
PSQL=(psql "$DB_URL" -X -q -At -v ON_ERROR_STOP=1)
pass=0; failed=0
ok()  { echo "PASS  intelligence rollback: $1"; pass=$((pass + 1)); }
bad() { echo "FAIL  intelligence rollback: $1"; failed=$((failed + 1)); }
rollback() { psql "$DB_URL" -X -q -v ON_ERROR_STOP=1 -v mode="$1" -v confirm="$2" -f "$SQL" 2>&1; }
q() { "${PSQL[@]}" -c "$1"; }
replica() { psql "$DB_URL" -X -q -v ON_ERROR_STOP=1 -c "begin" -c "set local session_replication_role = replica" -c "$1" -c "commit" >/dev/null 2>&1; }
present() { q "select to_regclass('social.post_opens') is not null and exists (select 1 from supabase_migrations.schema_migrations where version = '20261210000000')"; }
refuses() {
  local out code
  out=$(rollback "$2" "$3"); code=$?
  if [ $code -ne 0 ] && grep -q "$4" <<<"$out" && [ "$(present)" = t ]; then ok "refuses $1, changing nothing"; else bad "did not refuse $1 (exit $code): $(tail -2 <<<"$out" | tr '\n' ' ')"; fi
}

[ "$(present)" = t ] || { bad "20261210000000 is not applied here"; echo "Intelligence rollback tests: $pass passed, $failed failed"; exit 1; }
replica "delete from social.post_opens; update ads.conversions set self_reported = null"

refuses "a bad mode" "drop" "" "mode must be check or apply"
refuses "apply without the phrase" "apply" "" "needs the confirmation phrase"
refuses "apply with a wrong phrase" "apply" "remove it" "needs the confirmation phrase"
U=00000000-0000-4000-8000-fdfdfd00b017
P=00000000-0000-4000-8000-fdfdfd00b018
q "insert into auth.users (id, email, email_confirmed_at) values ('$U', 'in-rollback@example.test', now()) on conflict do nothing" >/dev/null
q "insert into social.posts (id, author_id, body) values ('$P', '$U', 'probe') on conflict do nothing" >/dev/null
for case in "post open|insert into social.post_opens (viewer_id, post_id) values ('$U', '$P')|delete from social.post_opens"; do
  name=${case%%|*}; rest=${case#*|}; add=${rest%%|*}; remove=${rest#*|}
  replica "$add"
  refuses "while a $name exists" "check" "" "rows of data depend on intelligence"
  replica "$remove"
done
q "delete from social.posts where id = '$P'; delete from auth.users where id = '$U'" >/dev/null
q "insert into supabase_migrations.schema_migrations (version, name) values ('20261231000000', 'later')" >/dev/null
refuses "while a later migration is recorded" "check" "" "later migration"
q "delete from supabase_migrations.schema_migrations where version = '20261231000000'" >/dev/null

out=$(rollback check ""); code=$?
[ $code -eq 0 ] && grep -q 'Check only' <<<"$out" && [ "$(present)" = t ] && ok "check passes and changes nothing" || bad "check (exit $code): $(tail -2 <<<"$out" | tr '\n' ' ')"
out=$(rollback apply "$PHRASE"); code=$?
if [ $code -eq 0 ] && grep -q 'Applied' <<<"$out"; then ok "apply succeeds"; else bad "apply (exit $code): $(tail -3 <<<"$out" | tr '\n' ' ')"; fi
left=$(q "select count(*) from pg_class where oid = coalesce(to_regclass('social.post_opens'), 0)")
fns=$(q "select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace where (n.nspname = 'public' and p.proname in ('app_founder_overview', 'app_my_contribution_insights', 'app_creator_insights', 'app_note_open')) or (n.nspname = 'ops' and p.proname in ('connections', 'week_start'))")
rec=$(q "select count(*) from supabase_migrations.schema_migrations where version = '20261210000000'")
old=$(q "select to_regprocedure('public.app_founder_record_conversions(uuid, date, integer, text)') is not null and has_function_privilege('authenticated', 'public.app_founder_record_conversions(uuid, date, integer, text)', 'EXECUTE')")
[ "$left$fns$rec$old" = 000t ] && ok "apply removed the intelligence objects and the record, and put back the earlier conversion function" || bad "left behind: table $left, functions $fns, record $rec, earlier function $old"
out=$(rollback check ""); code=$?
[ $code -ne 0 ] && grep -q 'expected objects are missing' <<<"$out" && ok "a second run refuses" || bad "a second run did not refuse (exit $code)"

echo "Intelligence rollback tests: $pass passed, $failed failed"
[ $failed -eq 0 ]
