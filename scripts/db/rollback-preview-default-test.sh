#!/usr/bin/env bash
# Tests the staging rollback of 20261222000000 (public previews on by default),
# scripts/db/staging-rollback-preview-default.sql, against a LOCAL Supabase database.
# Local only. Called first by scripts/db/rollback-test.sh, because
# 20261222000000 is the newest migration.
set -uo pipefail
cd "$(dirname "$0")/../.."
DB_URL="${DB_URL:-postgresql://postgres:postgres@127.0.0.1:54322/postgres}"
case "$DB_URL" in
  *@127.0.0.1:*|*@localhost:*) ;;
  *) echo "Refusing: this test only runs against a local database." >&2; exit 1 ;;
esac
SQL=scripts/db/staging-rollback-preview-default.sql
PHRASE='REMOVE STAGING PREVIEW DEFAULT'
PSQL=(psql "$DB_URL" -X -q -At -v ON_ERROR_STOP=1)
pass=0; failed=0
ok()  { echo "PASS  preview default rollback: $1"; pass=$((pass + 1)); }
bad() { echo "FAIL  preview default rollback: $1"; failed=$((failed + 1)); }
rollback() { psql "$DB_URL" -X -q -v ON_ERROR_STOP=1 -v mode="$1" -v confirm="$2" -f "$SQL" 2>&1; }
q() { "${PSQL[@]}" -c "$1"; }
present() { q "select exists (select 1 from supabase_migrations.schema_migrations where version = '20261222000000') and to_regclass('social.preview_optouts') is not null"; }
refuses() {
  local out code
  out=$(rollback "$2" "$3"); code=$?
  if [ $code -ne 0 ] && grep -q "$4" <<<"$out" && [ "$(present)" = t ]; then ok "refuses $1, changing nothing"; else bad "did not refuse $1 (exit $code): $(tail -2 <<<"$out" | tr '\n' ' ')"; fi
}

[ "$(present)" = t ] || { bad "20261222000000 is not applied here"; echo "Preview default rollback tests: $pass passed, $failed failed"; exit 1; }
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
left=$(q "select (to_regclass('social.preview_optouts') is not null)::int
             + (position('preview_consents' in (select prosrc from pg_proc where oid = 'public.app_public_post(uuid, text)'::regprocedure)) = 0)::int * 10
             + (position('preview_optouts' in (select prosrc from pg_proc where oid = 'public.app_public_previews_allowed()'::regprocedure)) > 0)::int * 100
             + (has_function_privilege('anon', 'public.app_public_post(uuid, text)', 'EXECUTE') is false)::int * 1000
             + (select count(*) from supabase_migrations.schema_migrations where version = '20261222000000')::int * 10000")
[ "$left" = 0 ] && ok "apply restored opt-in previews (visitors still allowed the one preview function) and removed the table and the record" || bad "left behind (code $left)"
out=$(rollback check ""); code=$?
[ $code -ne 0 ] && grep -q 'expected objects are missing' <<<"$out" && ok "a second run refuses" || bad "a second run did not refuse (exit $code)"
out=$(psql "$DB_URL" -X -q -v ON_ERROR_STOP=1 -v mode=check -v confirm= -f scripts/db/staging-rollback-profile-link.sql 2>&1); code=$?
[ $code -eq 0 ] && grep -q 'Check only' <<<"$out" && ok "the profile link rollback check then passes" || bad "profile link rollback check after (exit $code): $(tail -2 <<<"$out" | tr '\n' ' ')"

echo "Preview default rollback tests: $pass passed, $failed failed"
[ $failed -eq 0 ]
