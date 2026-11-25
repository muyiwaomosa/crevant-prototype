#!/usr/bin/env bash
# Tests the staging rollback of 20261204000000 (previews and search),
# scripts/db/staging-rollback-previews.sql, against a LOCAL Supabase database.
# Local only. Called first by scripts/db/rollback-test.sh, because
# 20261204000000 is the newest migration.
set -uo pipefail
cd "$(dirname "$0")/../.."
DB_URL="${DB_URL:-postgresql://postgres:postgres@127.0.0.1:54322/postgres}"
case "$DB_URL" in
  *@127.0.0.1:*|*@localhost:*) ;;
  *) echo "Refusing: this test only runs against a local database." >&2; exit 1 ;;
esac
SQL=scripts/db/staging-rollback-previews.sql
PHRASE='REMOVE THE STAGING PREVIEWS'
PSQL=(psql "$DB_URL" -X -q -At -v ON_ERROR_STOP=1)
pass=0; failed=0
ok()  { echo "PASS  previews rollback: $1"; pass=$((pass + 1)); }
bad() { echo "FAIL  previews rollback: $1"; failed=$((failed + 1)); }
rollback() { psql "$DB_URL" -X -q -v ON_ERROR_STOP=1 -v mode="$1" -v confirm="$2" -f "$SQL" 2>&1; }
q() { "${PSQL[@]}" -c "$1"; }
replica() { psql "$DB_URL" -X -q -v ON_ERROR_STOP=1 -c "begin" -c "set local session_replication_role = replica" -c "$1" -c "commit" >/dev/null 2>&1; }
present() { q "select to_regclass('social.preview_visits') is not null and exists (select 1 from supabase_migrations.schema_migrations where version = '20261204000000')"; }
refuses() {
  local out code
  out=$(rollback "$2" "$3"); code=$?
  if [ $code -ne 0 ] && grep -q "$4" <<<"$out" && [ "$(present)" = t ]; then ok "refuses $1, changing nothing"; else bad "did not refuse $1 (exit $code): $(tail -2 <<<"$out" | tr '\n' ' ')"; fi
}

[ "$(present)" = t ] || { bad "20261204000000 is not applied here"; echo "Previews rollback tests: $pass passed, $failed failed"; exit 1; }
replica "delete from social.search_metrics_daily; delete from social.preview_visits; delete from social.preview_optouts; delete from ops.public_preview_events;
  update social.follow_events set source = null where source = 'search'; update ops.public_preview_settings set enabled = false"

refuses "a bad mode" "drop" "" "mode must be check or apply"
refuses "apply without the phrase" "apply" "" "needs the confirmation phrase"
refuses "apply with a wrong phrase" "apply" "remove it" "needs the confirmation phrase"
U=00000000-0000-4000-8000-fdfdfd00af11
P=00000000-0000-4000-8000-fdfdfd00af21
q "insert into auth.users (id, email, email_confirmed_at) values ('$U', 'pv-rollback@example.test', now()) on conflict do nothing" >/dev/null
q "insert into social.posts (id, author_id, body) values ('$P', '$U', 'rollback probe')" >/dev/null
for case in "search count:insert into social.search_metrics_daily (day, surface, searches) values (current_date, 'search', 1):delete from social.search_metrics_daily" \
            "preview visit:insert into social.preview_visits (day, post_id, views) values (current_date, '$P', 1):delete from social.preview_visits" \
            "opt-out:insert into social.preview_optouts (member_id) values ('$U'):delete from social.preview_optouts" \
            "switch change:insert into ops.public_preview_events (actor, enabled, reason) values ('t', false, 'probe'):delete from ops.public_preview_events" \
            "preview switch on:update ops.public_preview_settings set enabled = true:update ops.public_preview_settings set enabled = false"; do
  name=${case%%:*}; rest=${case#*:}; add=${rest%%:*}; remove=${rest#*:}
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
left=$(q "select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace where (n.nspname = 'social' and c.relname in ('search_metrics_daily', 'preview_visits', 'preview_optouts', 'preview_rate')) or (n.nspname = 'ops' and c.relname in ('public_preview_settings', 'public_preview_events'))")
fns=$(q "select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace where (n.nspname = 'public' and p.proname in ('app_public_post', 'app_set_public_previews', 'app_public_previews_allowed', 'app_note_search', 'app_note_search_selection', 'app_founder_search_metrics')) or (n.nspname = 'ops' and p.proname = 'set_public_previews')")
rec=$(q "select count(*) from supabase_migrations.schema_migrations where version = '20261204000000'")
[ "$left$fns$rec" = 000 ] && ok "apply removed every table, function and the record" || bad "left behind: relations $left, functions $fns, record $rec"
q "select position('md5' in (select prosrc from pg_proc where oid = 'public.app_discover_content(text, integer)'::regprocedure)) = 0
   and position('''search''' in (select prosrc from pg_proc where oid = 'public.app_follow(uuid, text)'::regprocedure)) = 0
   and not has_function_privilege('anon', 'public.app_follow(uuid, text)', 'EXECUTE')" | grep -q t \
  && ok "discovery and following are as before, and visitors can call nothing" || bad "discovery or following were not restored"
out=$(rollback check ""); code=$?
[ $code -ne 0 ] && grep -q 'expected objects are missing' <<<"$out" && ok "a second run refuses" || bad "a second run did not refuse (exit $code)"

echo "Previews rollback tests: $pass passed, $failed failed"
[ $failed -eq 0 ]
