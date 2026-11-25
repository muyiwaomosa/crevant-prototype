#!/usr/bin/env bash
# Tests the staging rollback of 20261201000000 (relationships),
# scripts/db/staging-rollback-relationships.sql, against a LOCAL Supabase
# database. Local only: it refuses any other database. Called first by
# scripts/db/rollback-test.sh, because 20261201000000 is the newest migration.
#
#   1. Every refusal: a bad mode, a missing or wrong phrase, member data present
#      (each kind), a Clique above the restored limit, a later migration. Each
#      changes nothing.
#   2. check changes nothing; apply removes exactly the migration's objects and
#      record and restores every replaced function; a second run refuses.
#
# Leaves the migration removed, ready for the earlier rollback tests.
# rollback-test.sh reapplies everything at the end.
set -uo pipefail
cd "$(dirname "$0")/../.."
DB_URL="${DB_URL:-postgresql://postgres:postgres@127.0.0.1:54322/postgres}"
case "$DB_URL" in
  *@127.0.0.1:*|*@localhost:*) ;;
  *) echo "Refusing: this test only runs against a local database." >&2; exit 1 ;;
esac
SQL=scripts/db/staging-rollback-relationships.sql
PHRASE='REMOVE THE STAGING RELATIONSHIPS'
PSQL=(psql "$DB_URL" -X -q -At -v ON_ERROR_STOP=1)
pass=0; failed=0
ok()  { echo "PASS  relationships rollback: $1"; pass=$((pass + 1)); }
bad() { echo "FAIL  relationships rollback: $1"; failed=$((failed + 1)); }
rollback() { psql "$DB_URL" -X -q -v ON_ERROR_STOP=1 -v mode="$1" -v confirm="$2" -f "$SQL" 2>&1; }
q() { "${PSQL[@]}" -c "$1"; }
replica() { psql "$DB_URL" -X -q -v ON_ERROR_STOP=1 -c "begin" -c "set local session_replication_role = replica" -c "$1" -c "commit" >/dev/null 2>&1; }
present() { q "select to_regclass('social.mutes') is not null and to_regclass('intent.support_intents') is not null and exists (select 1 from supabase_migrations.schema_migrations where version = '20261201000000')"; }
refuses() { # refuses <what> <mode> <phrase> <expected message>
  local out code
  out=$(rollback "$2" "$3"); code=$?
  if [ $code -ne 0 ] && grep -q "$4" <<<"$out" && [ "$(present)" = t ]; then ok "refuses $1, changing nothing"; else bad "did not refuse $1 (exit $code): $(tail -2 <<<"$out" | tr '\n' ' ')"; fi
}

[ "$(present)" = t ] || { bad "20261201000000 is not applied here"; echo "Relationships rollback tests: $pass passed, $failed failed"; exit 1; }

# Test setup: clear what the local suites and journeys left, so this starts
# from the empty state of a fresh staging deploy.
replica "delete from social.mutes; delete from social.mute_events; delete from intent.support_intents;
  update social.follow_events set source = null where source is not null;
  delete from analytics.events where name in ('muted', 'unmuted', 'support_intent_recorded')"
for fan in $(q "select fan_id from social.clique_members where removed_at is null group by fan_id having count(*) > 25"); do
  replica "update social.clique_members set removed_at = now(), removal_reason = 'removed' where fan_id = '$fan' and removed_at is null and id not in (select id from social.clique_members where fan_id = '$fan' and removed_at is null order by added_at limit 25)"
done

# 1. Refusals.
refuses "a bad mode" "drop" "" "mode must be check or apply"
refuses "apply without the phrase" "apply" "" "needs the confirmation phrase"
refuses "apply with a wrong phrase" "apply" "remove it" "needs the confirmation phrase"
U=00000000-0000-4000-8000-fdfdfd00ab11
V=00000000-0000-4000-8000-fdfdfd00ab12
q "insert into auth.users (id, email, email_confirmed_at) values ('$U', 'rel-rollback-u@example.test', now()), ('$V', 'rel-rollback-v@example.test', now()) on conflict do nothing" >/dev/null
q "insert into social.mutes (member_id, creator_id) values ('$U', '$V')" >/dev/null
refuses "while a mute exists" "check" "" "rows of member data exist"
q "delete from social.mutes" >/dev/null
q "insert into social.mute_events (member_id, creator_id, action) values ('$U', '$V', 'muted')" >/dev/null
replica "delete from analytics.events where name = 'muted'"
refuses "while mute history exists" "check" "" "rows of member data exist"
replica "delete from social.mute_events"
q "insert into intent.support_intents (member_id, creator_id, choice) values ('$U', '$V', 'usd_5')" >/dev/null
replica "delete from analytics.events where name = 'support_intent_recorded'"
refuses "while a Support Intent exists" "check" "" "rows of member data exist"
replica "delete from intent.support_intents"
q "insert into social.follows (follower_id, creator_id) values ('$U', '$V')" >/dev/null
q "insert into social.follow_events (follower_id, creator_id, action, source) values ('$U', '$V', 'followed', 'profile')" >/dev/null
refuses "while a follow has a recorded source" "check" "" "rows of member data exist"
replica "update social.follow_events set source = null where follower_id = '$U'"
q "insert into analytics.events (name, data_class) values ('support_intent_recorded', 'test')" >/dev/null
refuses "while Support Intent events exist" "check" "" "rows of member data exist"
replica "delete from analytics.events where name = 'support_intent_recorded'"
for i in $(seq 1 26); do
  C=$(printf '00000000-0000-4000-8000-fdfdfd00ac%02d' "$i")
  q "insert into auth.users (id, email, email_confirmed_at) values ('$C', 'rel-rollback-c$i@example.test', now()) on conflict do nothing" >/dev/null
  q "insert into social.follows (follower_id, creator_id) values ('$U', '$C') on conflict do nothing" >/dev/null
  q "insert into social.clique_members (fan_id, creator_id) values ('$U', '$C')" >/dev/null
done
refuses "while a Clique holds more than 25" "check" "" "more than 25"
q "delete from auth.users where id = '$U' or id = '$V' or email like 'rel-rollback-c%@example.test'" >/dev/null
q "insert into supabase_migrations.schema_migrations (version, name) values ('20261231000000', 'later')" >/dev/null
refuses "while a later migration is recorded" "check" "" "later migration"
q "delete from supabase_migrations.schema_migrations where version = '20261231000000'" >/dev/null

# 2. check, then apply.
out=$(rollback check ""); code=$?
[ $code -eq 0 ] && grep -q 'Check only' <<<"$out" && [ "$(present)" = t ] && ok "check passes and changes nothing" || bad "check (exit $code): $(tail -2 <<<"$out" | tr '\n' ' ')"
out=$(rollback apply "$PHRASE"); code=$?
if [ $code -eq 0 ] && grep -q 'Applied' <<<"$out"; then ok "apply succeeds"; else bad "apply (exit $code): $(tail -3 <<<"$out" | tr '\n' ' ')"; fi
left=$(q "select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace where (n.nspname, c.relname) in (('social','mutes'),('social','mute_events'),('intent','support_intents'),('social','comments_live_by_author_time'))")
fns=$(q "select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace where (n.nspname = 'public' and p.proname in ('app_mute','app_unmute','app_home_priority','app_record_support_intent','app_support_intent','app_my_relationships','app_my_audience')) or (n.nspname = 'social' and p.proname in ('is_active_supporter','meaningful_comment','mute_history_is_append_only')) or (n.nspname = 'intent' and p.proname = 'support_intents_append_only')")
col=$(q "select count(*) from information_schema.columns where table_schema = 'social' and table_name = 'follow_events' and column_name = 'source'")
rec=$(q "select count(*) from supabase_migrations.schema_migrations where version = '20261201000000'")
[ "$left$fns$col$rec" = 0000 ] && ok "apply removed every table, index, function, the source column and the record" || bad "left behind: relations $left, functions $fns, source column $col, record $rec"
q "select to_regprocedure('public.app_follow(uuid)') is not null and to_regprocedure('public.app_follow(uuid, text)') is null
   and (select pg_get_function_result('public.app_member(text)'::regprocedure)) !~ 'active_supporter'
   and (select prosrc from pg_proc where oid = 'social.clique_members_guard()'::regprocedure) ~ '>= 25'
   and position('social.mutes' in (select prosrc from pg_proc where oid = 'public.app_feed_page(timestamp with time zone, uuid, integer, text)'::regprocedure)) = 0
   and position('mute_events' in (select prosrc from pg_proc where oid = 'analytics.capture()'::regprocedure)) = 0
   and has_function_privilege('authenticated', 'public.app_follow(uuid)', 'EXECUTE') and not has_function_privilege('anon', 'public.app_follow(uuid)', 'EXECUTE')
   and has_function_privilege('authenticated', 'public.app_member(text)', 'EXECUTE') and not has_function_privilege('anon', 'public.app_member(text)', 'EXECUTE')" | grep -q t \
  && ok "follow, profile, Home, the Clique guard and events are as the earlier migrations defined them, with members-only access" \
  || bad "a replaced function was not restored"
out=$(rollback check ""); code=$?
[ $code -ne 0 ] && grep -q 'expected objects are missing' <<<"$out" && ok "a second run refuses" || bad "a second run did not refuse (exit $code)"

echo "Relationships rollback tests: $pass passed, $failed failed"
[ $failed -eq 0 ]
