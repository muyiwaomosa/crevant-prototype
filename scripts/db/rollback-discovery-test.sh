#!/usr/bin/env bash
# Tests the staging rollback of 20261203000000 (discovery),
# scripts/db/staging-rollback-discovery.sql, against a LOCAL Supabase database.
# Local only. Called first by scripts/db/rollback-test.sh, because
# 20261203000000 is the newest migration.
set -uo pipefail
cd "$(dirname "$0")/../.."
DB_URL="${DB_URL:-postgresql://postgres:postgres@127.0.0.1:54322/postgres}"
case "$DB_URL" in
  *@127.0.0.1:*|*@localhost:*) ;;
  *) echo "Refusing: this test only runs against a local database." >&2; exit 1 ;;
esac
SQL=scripts/db/staging-rollback-discovery.sql
PHRASE='REMOVE THE STAGING DISCOVERY'
PSQL=(psql "$DB_URL" -X -q -At -v ON_ERROR_STOP=1)
pass=0; failed=0
ok()  { echo "PASS  discovery rollback: $1"; pass=$((pass + 1)); }
bad() { echo "FAIL  discovery rollback: $1"; failed=$((failed + 1)); }
rollback() { psql "$DB_URL" -X -q -v ON_ERROR_STOP=1 -v mode="$1" -v confirm="$2" -f "$SQL" 2>&1; }
q() { "${PSQL[@]}" -c "$1"; }
replica() { psql "$DB_URL" -X -q -v ON_ERROR_STOP=1 -c "begin" -c "set local session_replication_role = replica" -c "$1" -c "commit" >/dev/null 2>&1; }
present() { q "select to_regclass('social.shares') is not null and exists (select 1 from supabase_migrations.schema_migrations where version = '20261203000000')"; }
refuses() {
  local out code
  out=$(rollback "$2" "$3"); code=$?
  if [ $code -ne 0 ] && grep -q "$4" <<<"$out" && [ "$(present)" = t ]; then ok "refuses $1, changing nothing"; else bad "did not refuse $1 (exit $code): $(tail -2 <<<"$out" | tr '\n' ' ')"; fi
}

[ "$(present)" = t ] || { bad "20261203000000 is not applied here"; echo "Discovery rollback tests: $pass passed, $failed failed"; exit 1; }
replica "delete from social.shares; delete from analytics.events where name = 'post_shared'"

refuses "a bad mode" "drop" "" "mode must be check or apply"
refuses "apply without the phrase" "apply" "" "needs the confirmation phrase"
refuses "apply with a wrong phrase" "apply" "remove it" "needs the confirmation phrase"
U=00000000-0000-4000-8000-fdfdfd00ae11
P=00000000-0000-4000-8000-fdfdfd00ae21
q "insert into auth.users (id, email, email_confirmed_at) values ('$U', 'dsc-rollback@example.test', now()) on conflict do nothing" >/dev/null
q "insert into social.posts (id, author_id, body) values ('$P', '$U', 'rollback probe')" >/dev/null
replica "insert into social.shares (member_id, post_id, channel) values ('$U', '$P', 'copy_link')"
refuses "while a share exists" "check" "" "rows of member data exist"
replica "delete from social.shares"
q "insert into analytics.events (name, data_class) values ('post_shared', 'test')" >/dev/null
refuses "while share events exist" "check" "" "rows of member data exist"
replica "delete from analytics.events where name = 'post_shared'"
q "delete from auth.users where id = '$U'" >/dev/null
q "insert into supabase_migrations.schema_migrations (version, name) values ('20261231000000', 'later')" >/dev/null
refuses "while a later migration is recorded" "check" "" "later migration"
q "delete from supabase_migrations.schema_migrations where version = '20261231000000'" >/dev/null

out=$(rollback check ""); code=$?
[ $code -eq 0 ] && grep -q 'Check only' <<<"$out" && [ "$(present)" = t ] && ok "check passes and changes nothing" || bad "check (exit $code): $(tail -2 <<<"$out" | tr '\n' ' ')"
out=$(rollback apply "$PHRASE"); code=$?
if [ $code -eq 0 ] && grep -q 'Applied' <<<"$out"; then ok "apply succeeds"; else bad "apply (exit $code): $(tail -3 <<<"$out" | tr '\n' ' ')"; fi
left=$(q "select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'social' and c.relname in ('shares', 'posts_live_search')")
fns=$(q "select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace where (n.nspname = 'public' and p.proname in ('app_discover_content', 'app_search_posts', 'app_record_share')) or (n.nspname = 'social' and p.proname = 'shares_are_append_only') or (n.nspname = 'analytics' and p.proname = 'capture_share')")
rec=$(q "select count(*) from supabase_migrations.schema_migrations where version = '20261203000000'")
[ "$left$fns$rec" = 000 ] && ok "apply removed every table, index, function and the record" || bad "left behind: relations $left, functions $fns, record $rec"
out=$(rollback check ""); code=$?
[ $code -ne 0 ] && grep -q 'expected objects are missing' <<<"$out" && ok "a second run refuses" || bad "a second run did not refuse (exit $code)"

echo "Discovery rollback tests: $pass passed, $failed failed"
[ $failed -eq 0 ]
