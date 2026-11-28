#!/usr/bin/env bash
# Tests the staging rollback of 20261224000000 (waitlist review and
# invitations, member side), scripts/db/staging-rollback-waitlist-invitations.sql,
# against a LOCAL Supabase database. Local only. Called first by
# scripts/db/rollback-test.sh, because 20261224000000 is the newest migration.
set -uo pipefail
cd "$(dirname "$0")/../.."
DB_URL="${DB_URL:-postgresql://postgres:postgres@127.0.0.1:54322/postgres}"
case "$DB_URL" in
  *@127.0.0.1:*|*@localhost:*) ;;
  *) echo "Refusing: this test only runs against a local database." >&2; exit 1 ;;
esac
SQL=scripts/db/staging-rollback-waitlist-invitations.sql
PHRASE='REMOVE STAGING WAITLIST INVITATIONS'
PSQL=(psql "$DB_URL" -X -q -At -v ON_ERROR_STOP=1)
pass=0; failed=0
ok()  { echo "PASS  waitlist invitations rollback: $1"; pass=$((pass + 1)); }
bad() { echo "FAIL  waitlist invitations rollback: $1"; failed=$((failed + 1)); }
rollback() { psql "$DB_URL" -X -q -v ON_ERROR_STOP=1 -v mode="$1" -v confirm="$2" -f "$SQL" 2>&1; }
q() { "${PSQL[@]}" -c "$1"; }
present() { q "select exists (select 1 from supabase_migrations.schema_migrations where version = '20261224000000') and to_regclass('ops.waitlist_review') is not null"; }
refuses() {
  local out code
  out=$(rollback "$2" "$3"); code=$?
  if [ $code -ne 0 ] && grep -q "$4" <<<"$out" && [ "$(present)" = t ]; then ok "refuses $1, changing nothing"; else bad "did not refuse $1 (exit $code): $(tail -2 <<<"$out" | tr '\n' ' ')"; fi
}

[ "$(present)" = t ] || { bad "20261224000000 is not applied here"; echo "Waitlist invitations rollback tests: $pass passed, $failed failed"; exit 1; }
refuses "a bad mode" "drop" "" "mode must be check or apply"
refuses "apply without the phrase" "apply" "" "needs the confirmation phrase"
refuses "apply with a wrong phrase" "apply" "remove it" "needs the confirmation phrase"
q "insert into supabase_migrations.schema_migrations (version, name) values ('20261231000000', 'later')" >/dev/null
refuses "while a later migration is recorded" "check" "" "later migration"
q "delete from supabase_migrations.schema_migrations where version = '20261231000000'" >/dev/null

out=$(rollback check ""); code=$?
[ $code -eq 0 ] && grep -q 'Check only' <<<"$out" && [ "$(present)" = t ] && ok "check passes and changes nothing" || bad "check (exit $code): $(tail -2 <<<"$out" | tr '\n' ' ')"
out=$(rollback apply "$PHRASE"); code=$?
if [ $code -eq 0 ] && grep -q 'Applied' <<<"$out"; then ok "apply succeeds"; else bad "apply (exit $code): $(tail -3 <<<"$out" | tr '\n' ' ')"; fi
left=$(q "select (to_regclass('ops.waitlist_review') is not null)::int
             + (to_regclass('ops.waitlist_forget_queue') is not null)::int * 10
             + (to_regprocedure('public.svc_invitation_create(uuid)') is not null)::int * 100
             + (exists (select 1 from information_schema.columns where table_schema = 'ops' and table_name = 'invitations' and column_name = 'waitlist_id'))::int * 1000
             + (exists (select 1 from pg_trigger where tgname = 'registrations_accept_invitation'))::int * 10000
             + (to_regclass('ops.invitations') is null)::int * 100000
             + (select count(*) from supabase_migrations.schema_migrations where version = '20261224000000')::int * 1000000")
[ "$left" = 0 ] && ok "apply removed the copies, the tracking columns, triggers and functions, and the record, and kept the invitations table" || bad "left behind (code $left)"
out=$(rollback check ""); code=$?
[ $code -ne 0 ] && grep -q 'expected objects are missing' <<<"$out" && ok "a second run refuses" || bad "a second run did not refuse (exit $code)"
out=$(psql "$DB_URL" -X -q -v ON_ERROR_STOP=1 -v mode=check -v confirm= -f scripts/db/staging-rollback-waitlist-handoff.sql 2>&1); code=$?
[ $code -eq 0 ] && grep -q 'Check only' <<<"$out" && ok "the waitlist handoff rollback check then passes" || bad "waitlist handoff rollback check after (exit $code): $(tail -2 <<<"$out" | tr '\n' ' ')"
echo "Waitlist invitations rollback tests: $pass passed, $failed failed"
[ $failed -eq 0 ]
