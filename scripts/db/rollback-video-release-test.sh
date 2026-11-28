#!/usr/bin/env bash
# Tests the staging rollback of 20261220000000 (the video release decision),
# scripts/db/staging-rollback-video-release.sql, against a LOCAL Supabase database.
# Local only. Called by scripts/db/rollback-test.sh once link in bio
# (20261221000000) is rolled back.
set -uo pipefail
cd "$(dirname "$0")/../.."
DB_URL="${DB_URL:-postgresql://postgres:postgres@127.0.0.1:54322/postgres}"
case "$DB_URL" in
  *@127.0.0.1:*|*@localhost:*) ;;
  *) echo "Refusing: this test only runs against a local database." >&2; exit 1 ;;
esac
SQL=scripts/db/staging-rollback-video-release.sql
PHRASE='REMOVE STAGING VIDEO RELEASE DECISION'
PSQL=(psql "$DB_URL" -X -q -At -v ON_ERROR_STOP=1)
pass=0; failed=0
ok()  { echo "PASS  video release rollback: $1"; pass=$((pass + 1)); }
bad() { echo "FAIL  video release rollback: $1"; failed=$((failed + 1)); }
rollback() { psql "$DB_URL" -X -q -v ON_ERROR_STOP=1 -v mode="$1" -v confirm="$2" -f "$SQL" 2>&1; }
q() { "${PSQL[@]}" -c "$1"; }
present() { q "select exists (select 1 from supabase_migrations.schema_migrations where version = '20261220000000') and position('iphone_safari' in (select prosrc from pg_proc where oid = 'ops.video_ready()'::regprocedure)) = 0"; }
refuses() {
  local out code
  out=$(rollback "$2" "$3"); code=$?
  if [ $code -ne 0 ] && grep -q "$4" <<<"$out" && [ "$(present)" = t ]; then ok "refuses $1, changing nothing"; else bad "did not refuse $1 (exit $code): $(tail -2 <<<"$out" | tr '\n' ' ')"; fi
}

[ "$(present)" = t ] || { bad "20261220000000 is not applied here"; echo "Video release rollback tests: $pass passed, $failed failed"; exit 1; }
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
left=$(q "select (position('iphone_safari' in (select prosrc from pg_proc where oid = 'ops.video_ready()'::regprocedure)) > 0)::int
             + (position('android_chrome' in (select prosrc from pg_proc where oid = 'ops.video_ready()'::regprocedure)) > 0)::int
             + (select count(*) from supabase_migrations.schema_migrations where version = '20261220000000')::int * 10
             + (has_function_privilege('authenticated', 'ops.video_ready()', 'EXECUTE'))::int * 100")
[ "$left" = 2 ] && ok "apply restored the device-test gate and removed the record" || bad "left behind (code $left)"
out=$(rollback check ""); code=$?
[ $code -ne 0 ] && grep -q 'expected objects are missing' <<<"$out" && ok "a second run refuses" || bad "a second run did not refuse (exit $code)"
out=$(psql "$DB_URL" -X -q -v ON_ERROR_STOP=1 -v mode=check -v confirm= -f scripts/db/staging-rollback-pilot-closure.sql 2>&1); code=$?
[ $code -eq 0 ] && grep -q 'Check only' <<<"$out" && ok "the pilot closure rollback check then passes" || bad "pilot closure rollback check after (exit $code): $(tail -2 <<<"$out" | tr '\n' ' ')"

echo "Video release rollback tests: $pass passed, $failed failed"
[ $failed -eq 0 ]
