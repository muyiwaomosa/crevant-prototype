#!/usr/bin/env bash
# Tests scripts/db/staging-rollback-moderation.sql against a LOCAL
# Supabase database. Local only: it refuses any other database. Called by
# scripts/db/rollback-test.sh first, because 20261124000000 is the newest
# migration and every earlier rollback refuses while it is recorded.
#
#   1. Every refusal: a later migration, a missing record, any saved member
#      details, any saved interest, a bad or missing mode, a missing or wrong
#      confirmation. Each must refuse and change nothing.
#   2. mode=check succeeds and changes nothing.
#   3. mode=apply removes exactly the migration's objects and record, and
#      keeps everything from the earlier migrations.
#   4. A second run refuses.
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
SQL=scripts/db/staging-rollback-moderation.sql
PHRASE='REMOVE THE STAGING MODERATION'
PSQL=(psql "$DB_URL" -X -q -At -v ON_ERROR_STOP=1)
pass=0; failed=0
ok()  { echo "PASS  moderation rollback: $1"; pass=$((pass + 1)); }
bad() { echo "FAIL  moderation rollback: $1"; failed=$((failed + 1)); }
rollback() { psql "$DB_URL" -X -q -v ON_ERROR_STOP=1 -v mode="$1" -v confirm="$2" -f "$SQL" 2>&1; }
state() {
  "${PSQL[@]}" -c "select concat_ws('|', (select string_agg(version, ',' order by version) from supabase_migrations.schema_migrations),
    to_regclass('ops.moderators') is not null, to_regclass('ops.content_reports') is not null, to_regclass('ops.moderation_actions') is not null,
    (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname like 'app\_%'),
    case when to_regclass('ops.content_reports') is null then -1 else (select count(*) from ops.content_reports) end,
    case when to_regclass('ops.moderators') is null then -1 else (select count(*) from ops.moderators) end,
    (select count(*) from information_schema.columns where column_name = 'hidden_at' and table_schema = 'social'),
    (select count(*) from social.posts), (select count(*) from public.profiles))"
}
# refuses <description> <expected message> <setup sql> <teardown sql> [mode confirm]
refuses() {
  local desc=$1 want=$2 setup=$3 teardown=$4 before out code m c
  "${PSQL[@]}" -c "$setup" >/dev/null || { bad "$desc (setup failed)"; return; }
  before=$(state)
  for mc in "check|" "apply|$PHRASE"; do
    m=${5-${mc%%|*}}; c=${6-${mc#*|}}
    out=$(rollback "$m" "$c"); code=$?
    if [ $code -eq 0 ] || ! grep -qi -- "$want" <<<"$out"; then
      bad "$desc (mode=$m exit $code): $(tail -2 <<<"$out" | tr '\n' ' ')"
      "${PSQL[@]}" -c "$teardown" >/dev/null 2>&1; return
    fi
    if [ "$(state)" != "$before" ]; then
      bad "$desc (mode=$m changed something although it refused)"
      "${PSQL[@]}" -c "$teardown" >/dev/null 2>&1; return
    fi
    [ -n "${5-}" ] && break
  done
  "${PSQL[@]}" -c "$teardown" >/dev/null || { bad "$desc (teardown failed)"; return; }
  ok "refuses, changing nothing: $desc"
}

"${PSQL[@]}" -c "select 1" >/dev/null || { echo "Local database not reachable" >&2; exit 1; }
if [ "$("${PSQL[@]}" -c "select (select count(*) from ops.content_reports) + (select count(*) from ops.moderators) + (select count(*) from ops.moderator_events) + (select count(*) from ops.moderation_actions)")" != 0 ]; then
  echo "FAIL  moderation rollback: moderation records already exist in this database; this test needs none (see the CI job order)" >&2
  exit 1
fi

# 1. Refusals.
refuses "a later migration is recorded" "later migration" \
  "insert into supabase_migrations.schema_migrations (version, name) values ('20991231000000', 'later')" "delete from supabase_migrations.schema_migrations where version = '20991231000000'"
refuses "the migration record is missing" "missing" \
  "delete from supabase_migrations.schema_migrations where version = '20261124000000'" "insert into supabase_migrations.schema_migrations (version, name) values ('20261124000000', 'moderation')"
U=00000000-0000-4000-8000-0000000009e1
P=00000000-0000-4000-8000-0000000009e2
SETUP_USER="insert into auth.users (id, email, email_confirmed_at) values ('$U', 'rb-moderation@example.test', now()) on conflict do nothing"
TEARDOWN_USER="delete from auth.users where id = '$U'"
refuses "a report exists (a safety record: fix forward)" "report" \
  "$SETUP_USER; insert into ops.content_reports (reporter_id, target_type, target_id, reason, priority) values ('$U', 'post', gen_random_uuid(), 'spam', false)" "$TEARDOWN_USER; delete from ops.content_reports"
refuses "a post is hidden" "hidden item" \
  "$SETUP_USER; insert into social.posts (id, author_id, body, deleted_at, hidden_at) values ('$P', '$U', 'x', now(), now())" "$TEARDOWN_USER"
# Moderator history and the audit trail are append-only: the teardown (TEST
# ONLY, local database) lifts that guard to clean up after itself.
refuses "a moderator was granted (recorded history: fix forward)" "moderator row" \
  "$SETUP_USER; insert into ops.member_access (user_id, cohort, status, updated_by) values ('$U', 'tester', 'active', 'rollback-test'); select ops.grant_moderator('$U', 'rollback-test')" \
  "alter table ops.moderator_events disable trigger moderator_events_no_update; alter table ops.member_access_events disable trigger member_access_events_no_update; delete from ops.moderators where user_id = '$U'; delete from ops.moderator_events where user_id = '$U'; $TEARDOWN_USER; delete from ops.member_access_events where user_id = '$U'; alter table ops.moderator_events enable trigger moderator_events_no_update; alter table ops.member_access_events enable trigger member_access_events_no_update"
refuses "a moderation action was recorded" "moderation action" \
  "insert into ops.moderation_actions (actor_label, action) values ('rollback-test', 'retention_purge')" \
  "alter table ops.moderation_actions disable trigger moderation_actions_no_update; delete from ops.moderation_actions; alter table ops.moderation_actions enable trigger moderation_actions_no_update"
refuses "the mode is neither check nor apply" "mode must be check or apply" "select 1" "select 1" wipe "$PHRASE"
refuses "apply without the confirmation phrase" "confirmation phrase" "select 1" "select 1" apply ""
refuses "apply with a different phrase" "confirmation phrase" "select 1" "select 1" apply "remove the staging moderation"
out=$(psql "$DB_URL" -X -q -v ON_ERROR_STOP=1 -f "$SQL" 2>&1); code=$?
[ $code -ne 0 ] && grep -q 'syntax error' <<<"$out" && ok "refuses to run with no mode given" || bad "ran with no mode (exit $code)"

# 2. A check run succeeds and changes nothing.
before=$(state)
out=$(rollback check ""); code=$?
[ $code -eq 0 ] && grep -q 'Check only' <<<"$out" && [ "$(state)" = "$before" ] \
  && ok "check mode passes and changes nothing" || bad "check mode (exit $code): $(tail -3 <<<"$out" | tr '\n' ' ')"

# 3. Apply removes exactly the migration's objects and record, and restores the profile functions.
counts_before=$("${PSQL[@]}" -c "select (select count(*) from social.posts) || '|' || (select count(*) from public.profiles) || '|' || (select count(*) from auth.users) || '|' || (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname like 'app\_%')")
out=$(rollback apply "$PHRASE"); code=$?
after=$("${PSQL[@]}" -c "select concat_ws('|',
  not exists (select 1 from supabase_migrations.schema_migrations where version = '20261124000000'),
  exists (select 1 from supabase_migrations.schema_migrations where version = '20261123000000'),
  to_regclass('ops.moderators') is null, to_regclass('ops.content_reports') is null, to_regclass('ops.moderation_actions') is null,
  to_regprocedure('public.app_report(text, uuid, text, text)') is null, to_regprocedure('social.current_moderator()') is null,
  not exists (select 1 from information_schema.columns where column_name = 'hidden_at' and table_schema = 'social'),
  position('hidden_at' in (select prosrc from pg_proc where oid = 'public.app_discover_people(text, text, integer)'::regprocedure)) = 0,
  to_regclass('social.profile_details') is not null, to_regclass('ops.member_access') is not null)")
counts_after=$("${PSQL[@]}" -c "select (select count(*) from social.posts) || '|' || (select count(*) from public.profiles) || '|' || (select count(*) from auth.users) || '|' || ((select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname like 'app\_%') + 7)")
[ $code -eq 0 ] && grep -q 'Applied' <<<"$out" && [ "$after" = "t|t|t|t|t|t|t|t|t|t|t" ] && [ "$counts_after" = "$counts_before" ] \
  && ok "apply removes exactly the moderation objects and record, restores the profile functions, and keeps every account, post and earlier function" \
  || bad "apply (exit $code, state $after, counts $counts_before -> $counts_after)"

# 4. A second run refuses.
out=$(rollback check ""); code=$?
[ $code -ne 0 ] && grep -q 'missing' <<<"$out" && ok "a second run refuses (nothing left to remove)" || bad "a second run did not refuse (exit $code)"

echo "Moderation rollback tests: $pass passed, $failed failed"
[ $failed -eq 0 ]
