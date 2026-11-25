#!/usr/bin/env bash
# Tests the staging rollback of 20261206000000 (governance),
# scripts/db/staging-rollback-governance.sql, against a LOCAL Supabase database.
# Local only. Called first by scripts/db/rollback-test.sh, because
# 20261206000000 is the newest migration.
set -uo pipefail
cd "$(dirname "$0")/../.."
DB_URL="${DB_URL:-postgresql://postgres:postgres@127.0.0.1:54322/postgres}"
case "$DB_URL" in
  *@127.0.0.1:*|*@localhost:*) ;;
  *) echo "Refusing: this test only runs against a local database." >&2; exit 1 ;;
esac
SQL=scripts/db/staging-rollback-governance.sql
PHRASE='REMOVE THE STAGING GOVERNANCE'
PSQL=(psql "$DB_URL" -X -q -At -v ON_ERROR_STOP=1)
pass=0; failed=0
ok()  { echo "PASS  governance rollback: $1"; pass=$((pass + 1)); }
bad() { echo "FAIL  governance rollback: $1"; failed=$((failed + 1)); }
rollback() { psql "$DB_URL" -X -q -v ON_ERROR_STOP=1 -v mode="$1" -v confirm="$2" -f "$SQL" 2>&1; }
q() { "${PSQL[@]}" -c "$1"; }
replica() { psql "$DB_URL" -X -q -v ON_ERROR_STOP=1 -c "begin" -c "set local session_replication_role = replica" -c "$1" -c "commit" >/dev/null 2>&1; }
present() { q "select to_regclass('social.blocks') is not null and exists (select 1 from supabase_migrations.schema_migrations where version = '20261206000000')"; }
refuses() {
  local out code
  out=$(rollback "$2" "$3"); code=$?
  if [ $code -ne 0 ] && grep -q "$4" <<<"$out" && [ "$(present)" = t ]; then ok "refuses $1, changing nothing"; else bad "did not refuse $1 (exit $code): $(tail -2 <<<"$out" | tr '\n' ' ')"; fi
}

[ "$(present)" = t ] || { bad "20261206000000 is not applied here"; echo "Governance rollback tests: $pass passed, $failed failed"; exit 1; }
replica "delete from ops.appeals; delete from ops.member_notices; delete from ops.enforcement_lifts; delete from ops.enforcements; delete from social.block_events; delete from social.blocks"

refuses "a bad mode" "drop" "" "mode must be check or apply"
refuses "apply without the phrase" "apply" "" "needs the confirmation phrase"
refuses "apply with a wrong phrase" "apply" "remove it" "needs the confirmation phrase"
U=00000000-0000-4000-8000-fdfdfd00b012
V=00000000-0000-4000-8000-fdfdfd00b013
q "insert into auth.users (id, email, email_confirmed_at) values ('$U', 'gv-rollback-u@example.test', now()), ('$V', 'gv-rollback-v@example.test', now()) on conflict do nothing" >/dev/null
for case in "block|insert into social.blocks (blocker_id, blocked_id) values ('$U', '$V')|delete from social.blocks" \
            "block history entry|insert into social.block_events (blocker_id, blocked_id, action) values ('$U', '$V', 'blocked')|delete from social.block_events" \
            "enforcement|insert into ops.enforcements (member_id, level, reason) values ('$U', 'warning', 'spam')|delete from ops.enforcements" \
            "notice|insert into ops.member_notices (member_id, kind) values ('$U', 'warning')|delete from ops.member_notices" \
            "comment report|insert into ops.content_reports (target_type, target_id, reason, priority) values ('comment', gen_random_uuid(), 'spam', false)|delete from ops.content_reports where target_type = 'comment'" \
            "new kind of moderation action|insert into ops.moderation_actions (actor_label, action, target_type, target_id) values ('t', 'enforce', 'member', '$U')|delete from ops.moderation_actions where action = 'enforce'"; do
  name=${case%%|*}; rest=${case#*|}; add=${rest%%|*}; remove=${rest#*|}
  replica "$add"
  refuses "while a $name exists" "check" "" "rows of governance data exist"
  replica "$remove"
done
q "delete from auth.users where id in ('$U', '$V')" >/dev/null
q "insert into supabase_migrations.schema_migrations (version, name) values ('20261231000000', 'later')" >/dev/null
refuses "while a later migration is recorded" "check" "" "later migration"
q "delete from supabase_migrations.schema_migrations where version = '20261231000000'" >/dev/null

out=$(rollback check ""); code=$?
[ $code -eq 0 ] && grep -q 'Check only' <<<"$out" && [ "$(present)" = t ] && ok "check passes and changes nothing" || bad "check (exit $code): $(tail -2 <<<"$out" | tr '\n' ' ')"
out=$(rollback apply "$PHRASE"); code=$?
if [ $code -eq 0 ] && grep -q 'Applied' <<<"$out"; then ok "apply succeeds"; else bad "apply (exit $code): $(tail -3 <<<"$out" | tr '\n' ' ')"; fi
left=$(q "select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace where (n.nspname = 'social' and c.relname in ('blocks', 'block_events', 'listed_members')) or (n.nspname = 'ops' and c.relname in ('enforcements', 'enforcement_lifts', 'member_notices', 'appeals'))")
fns=$(q "select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace where (n.nspname = 'public' and p.proname in ('app_block', 'app_unblock', 'app_my_blocks', 'app_mod_enforce', 'app_mod_lift', 'app_mod_member_record', 'app_my_standing', 'app_my_notices', 'app_mark_notices_read', 'app_appeal', 'app_mod_appeals', 'app_mod_decide_appeal')) or (n.nspname = 'ops' and p.proname in ('member_standing', 'standing_guard', 'notify_member', 'notices_read_only', 'appeals_decided_once'))")
trg=$(q "select count(*) from pg_trigger where tgname = 'standing_guard'")
rec=$(q "select count(*) from supabase_migrations.schema_migrations where version = '20261206000000'")
col=$(q "select count(*) from information_schema.columns where table_schema = 'social' and table_name = 'comments' and column_name = 'hidden_at'")
[ "$left$fns$trg$rec$col" = 00000 ] && ok "apply removed every table, function, trigger, column and the record" || bad "left behind: tables $left, functions $fns, triggers $trg, record $rec, column $col"
src=$(q "select (pg_get_viewdef('social.visible_members'::regclass) !~ 'blocks') and (select prosrc from pg_proc where oid = 'public.app_mod_hide(uuid, text)'::regprocedure) !~ 'comment' and (select prosrc from pg_proc where oid = 'public.app_report(text, uuid, text, text)'::regprocedure) ~ 'visible_members'")
[ "$src" = t ] && ok "apply put back the earlier view and moderation functions" || bad "the earlier view or functions were not restored"
out=$(rollback check ""); code=$?
[ $code -ne 0 ] && grep -q 'expected objects are missing' <<<"$out" && ok "a second run refuses" || bad "a second run did not refuse (exit $code)"

echo "Governance rollback tests: $pass passed, $failed failed"
[ $failed -eq 0 ]
