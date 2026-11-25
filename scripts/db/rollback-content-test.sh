#!/usr/bin/env bash
# Tests the staging rollback of 20261202000000 (content),
# scripts/db/staging-rollback-content.sql, against a LOCAL Supabase database.
# Local only. Called first by scripts/db/rollback-test.sh, because
# 20261202000000 is the newest migration.
#
#   1. Every refusal (bad mode, phrase, each kind of member data, a later
#      migration) changes nothing.
#   2. check changes nothing; apply removes exactly the migration's objects and
#      record and restores Active Supporter and events; a second run refuses.
set -uo pipefail
cd "$(dirname "$0")/../.."
DB_URL="${DB_URL:-postgresql://postgres:postgres@127.0.0.1:54322/postgres}"
case "$DB_URL" in
  *@127.0.0.1:*|*@localhost:*) ;;
  *) echo "Refusing: this test only runs against a local database." >&2; exit 1 ;;
esac
SQL=scripts/db/staging-rollback-content.sql
PHRASE='REMOVE THE STAGING CONTENT'
PSQL=(psql "$DB_URL" -X -q -At -v ON_ERROR_STOP=1)
pass=0; failed=0
ok()  { echo "PASS  content rollback: $1"; pass=$((pass + 1)); }
bad() { echo "FAIL  content rollback: $1"; failed=$((failed + 1)); }
rollback() { psql "$DB_URL" -X -q -v ON_ERROR_STOP=1 -v mode="$1" -v confirm="$2" -f "$SQL" 2>&1; }
q() { "${PSQL[@]}" -c "$1"; }
replica() { psql "$DB_URL" -X -q -v ON_ERROR_STOP=1 -c "begin" -c "set local session_replication_role = replica" -c "$1" -c "commit" >/dev/null 2>&1; }
present() { q "select to_regclass('social.saves') is not null and exists (select 1 from supabase_migrations.schema_migrations where version = '20261202000000')"; }
refuses() { # refuses <what> <mode> <phrase> <expected message>
  local out code
  out=$(rollback "$2" "$3"); code=$?
  if [ $code -ne 0 ] && grep -q "$4" <<<"$out" && [ "$(present)" = t ]; then ok "refuses $1, changing nothing"; else bad "did not refuse $1 (exit $code): $(tail -2 <<<"$out" | tr '\n' ' ')"; fi
}

[ "$(present)" = t ] || { bad "20261202000000 is not applied here"; echo "Content rollback tests: $pass passed, $failed failed"; exit 1; }

# Start from the empty state of a fresh staging deploy.
replica "delete from social.post_edits; delete from social.saves; delete from social.reposts; delete from social.content_actions;
  update social.posts set topic = null, edited_at = null where topic is not null or edited_at is not null;
  delete from analytics.events where name in ('post_edited', 'post_saved', 'post_unsaved', 'post_reposted', 'post_unreposted')"

refuses "a bad mode" "drop" "" "mode must be check or apply"
refuses "apply without the phrase" "apply" "" "needs the confirmation phrase"
refuses "apply with a wrong phrase" "apply" "remove it" "needs the confirmation phrase"
U=00000000-0000-4000-8000-fdfdfd00ad11
V=00000000-0000-4000-8000-fdfdfd00ad12
P=00000000-0000-4000-8000-fdfdfd00ad21
q "insert into auth.users (id, email, email_confirmed_at) values ('$U', 'cnt-rollback-u@example.test', now()), ('$V', 'cnt-rollback-v@example.test', now()) on conflict do nothing" >/dev/null
q "insert into social.posts (id, author_id, body) values ('$P', '$V', 'rollback probe')" >/dev/null
for case in "topic:update social.posts set topic = 'money' where id = '$P':update social.posts set topic = null where id = '$P'" \
            "save:insert into social.saves (member_id, post_id) values ('$U', '$P'):delete from social.saves" \
            "repost:insert into social.reposts (reposter_id, post_id) values ('$U', '$P'):delete from social.reposts" \
            "action:insert into social.content_actions (member_id, action) values ('$U', 'save'):delete from social.content_actions" \
            "edit:insert into social.post_edits (post_id, editor_id, previous_body) values ('$P', '$V', 'x'):delete from social.post_edits"; do
  name=${case%%:*}; rest=${case#*:}; add=${rest%%:*}; remove=${rest#*:}
  replica "$add"
  refuses "while a $name exists" "check" "" "rows of member data exist"
  replica "$remove"
done
q "insert into analytics.events (name, data_class) values ('post_saved', 'test')" >/dev/null
refuses "while content events exist" "check" "" "rows of member data exist"
replica "delete from analytics.events where name = 'post_saved'"
q "delete from auth.users where id in ('$U', '$V')" >/dev/null
q "insert into supabase_migrations.schema_migrations (version, name) values ('20261231000000', 'later')" >/dev/null
refuses "while a later migration is recorded" "check" "" "later migration"
q "delete from supabase_migrations.schema_migrations where version = '20261231000000'" >/dev/null

out=$(rollback check ""); code=$?
[ $code -eq 0 ] && grep -q 'Check only' <<<"$out" && [ "$(present)" = t ] && ok "check passes and changes nothing" || bad "check (exit $code): $(tail -2 <<<"$out" | tr '\n' ' ')"
out=$(rollback apply "$PHRASE"); code=$?
if [ $code -eq 0 ] && grep -q 'Applied' <<<"$out"; then ok "apply succeeds"; else bad "apply (exit $code): $(tail -3 <<<"$out" | tr '\n' ' ')"; fi
left=$(q "select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'social' and c.relname in ('post_edits','saves','reposts','content_actions','posts_live_by_topic')")
fns=$(q "select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace where (n.nspname = 'public' and p.proname in ('app_set_post_topic','app_edit_post','app_post_edits','app_save','app_unsave','app_saved_page','app_repost','app_unrepost','app_post_meta','app_feed_items_page')) or (n.nspname = 'social' and p.proname in ('content_rate_check','content_history_is_append_only'))")
col=$(q "select count(*) from information_schema.columns where table_schema = 'social' and table_name = 'posts' and column_name in ('topic','edited_at')")
rec=$(q "select count(*) from supabase_migrations.schema_migrations where version = '20261202000000'")
[ "$left$fns$col$rec" = 0000 ] && ok "apply removed every table, index, function, column and the record" || bad "left behind: relations $left, functions $fns, columns $col, record $rec"
q "select position('social.saves' in (select prosrc from pg_proc where oid = 'social.is_active_supporter(uuid, uuid)'::regprocedure)) = 0
   and position('post_edits' in (select prosrc from pg_proc where oid = 'analytics.capture()'::regprocedure)) = 0
   and position('support_intents' in (select prosrc from pg_proc where oid = 'analytics.capture()'::regprocedure)) > 0" | grep -q t \
  && ok "Active Supporter and events are as relationships defined them" || bad "Active Supporter or events were not restored"
out=$(rollback check ""); code=$?
[ $code -ne 0 ] && grep -q 'expected objects are missing' <<<"$out" && ok "a second run refuses" || bad "a second run did not refuse (exit $code)"

echo "Content rollback tests: $pass passed, $failed failed"
[ $failed -eq 0 ]
