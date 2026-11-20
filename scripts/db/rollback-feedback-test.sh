#!/usr/bin/env bash
# Tests scripts/db/staging-rollback-feedback.sql against a LOCAL Supabase
# database. Local only: it refuses any other database. Called by
# scripts/db/rollback-test.sh first, because 20261126000000 is the newest
# migration and every earlier rollback refuses while it is recorded.
#
#   1. Every refusal: a later migration, a missing record, any feedback, any
#      note, any audit entry, a bad or missing mode, a missing or wrong
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
SQL=scripts/db/staging-rollback-feedback.sql
PHRASE='REMOVE THE STAGING FEEDBACK'
PSQL=(psql "$DB_URL" -X -q -At -v ON_ERROR_STOP=1)
pass=0; failed=0
ok()  { echo "PASS  feedback rollback: $1"; pass=$((pass + 1)); }
bad() { echo "FAIL  feedback rollback: $1"; failed=$((failed + 1)); }
rollback() { psql "$DB_URL" -X -q -v ON_ERROR_STOP=1 -v mode="$1" -v confirm="$2" -f "$SQL" 2>&1; }
state() {
  "${PSQL[@]}" -c "select concat_ws('|', (select string_agg(version, ',' order by version) from supabase_migrations.schema_migrations),
    to_regclass('ops.feedback') is not null, to_regclass('ops.feedback_notes') is not null, to_regclass('ops.feedback_actions') is not null,
    (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname like 'app\_%'),
    case when to_regclass('ops.feedback') is null then -1 else (select count(*) from ops.feedback) end,
    case when to_regclass('ops.feedback_actions') is null then -1 else (select count(*) from ops.feedback_actions) end,
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
if [ "$("${PSQL[@]}" -c "select (select count(*) from ops.feedback) + (select count(*) from ops.feedback_notes) + (select count(*) from ops.feedback_actions)")" != 0 ]; then
  echo "FAIL  feedback rollback: feedback records already exist in this database; this test needs none (see the CI job order)" >&2
  exit 1
fi

# 1. Refusals.
refuses "a later migration is recorded" "later migration" \
  "insert into supabase_migrations.schema_migrations (version, name) values ('20991231000000', 'later')" "delete from supabase_migrations.schema_migrations where version = '20991231000000'"
refuses "the migration record is missing" "missing" \
  "delete from supabase_migrations.schema_migrations where version = '20261126000000'" "insert into supabase_migrations.schema_migrations (version, name) values ('20261126000000', 'feedback')"
U=00000000-0000-4000-8000-0000000009f1
SETUP_USER="insert into auth.users (id, email, email_confirmed_at) values ('$U', 'rb-feedback@example.test', now()) on conflict do nothing"
TEARDOWN_USER="delete from auth.users where id = '$U'"
FEEDBACK="insert into ops.feedback (id, submitter_id, category, feature, body, client_request_id) values ('00000000-0000-4000-8000-0000000009f2', '$U', 'problem', 'home', 'A member''s message', gen_random_uuid())"
refuses "feedback exists (members' messages: fix forward)" "feedback entr" \
  "$SETUP_USER; $FEEDBACK" "$TEARDOWN_USER"
refuses "a private note exists" "note" \
  "$SETUP_USER; $FEEDBACK; insert into ops.feedback_notes (feedback_id, body) values ('00000000-0000-4000-8000-0000000009f2', 'note')" "$TEARDOWN_USER"
# The audit trail is append-only: the teardown (TEST ONLY, local database)
# lifts that guard to clean up after itself.
refuses "an audit entry was recorded" "audit entr" \
  "insert into ops.feedback_actions (actor_label, action) values ('rollback-test', 'retention_purge')" \
  "alter table ops.feedback_actions disable trigger feedback_actions_no_update; delete from ops.feedback_actions; alter table ops.feedback_actions enable trigger feedback_actions_no_update"
refuses "the mode is neither check nor apply" "mode must be check or apply" "select 1" "select 1" wipe "$PHRASE"
refuses "apply without the confirmation phrase" "confirmation phrase" "select 1" "select 1" apply ""
refuses "apply with a different phrase" "confirmation phrase" "select 1" "select 1" apply "remove the staging feedback"
out=$(psql "$DB_URL" -X -q -v ON_ERROR_STOP=1 -f "$SQL" 2>&1); code=$?
[ $code -ne 0 ] && grep -q 'syntax error' <<<"$out" && ok "refuses to run with no mode given" || bad "ran with no mode (exit $code)"

# 2. A check run succeeds and changes nothing.
before=$(state)
out=$(rollback check ""); code=$?
[ $code -eq 0 ] && grep -q 'Check only' <<<"$out" && [ "$(state)" = "$before" ] \
  && ok "check mode passes and changes nothing" || bad "check mode (exit $code): $(tail -3 <<<"$out" | tr '\n' ' ')"

# 3. Apply removes exactly the migration's objects and record.
counts_before=$("${PSQL[@]}" -c "select (select count(*) from social.posts) || '|' || (select count(*) from public.profiles) || '|' || (select count(*) from auth.users) || '|' || (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname like 'app\_%')")
out=$(rollback apply "$PHRASE"); code=$?
after=$("${PSQL[@]}" -c "select concat_ws('|',
  not exists (select 1 from supabase_migrations.schema_migrations where version = '20261126000000'),
  exists (select 1 from supabase_migrations.schema_migrations where version = '20261125000000'),
  to_regclass('ops.feedback') is null, to_regclass('ops.feedback_notes') is null, to_regclass('ops.feedback_actions') is null,
  to_regprocedure('public.app_feedback_submit(text, text, text, uuid)') is null, to_regprocedure('social.current_founder()') is null,
  to_regprocedure('ops.purge_feedback(integer, text, text)') is null,
  to_regprocedure('ops.history_append_only()') is not null, to_regclass('ops.moderation_actions') is not null, to_regclass('social.avatars') is not null)")
counts_after=$("${PSQL[@]}" -c "select (select count(*) from social.posts) || '|' || (select count(*) from public.profiles) || '|' || (select count(*) from auth.users) || '|' || ((select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname like 'app\_%') + 6)")
[ $code -eq 0 ] && grep -q 'Applied' <<<"$out" && [ "$after" = "t|t|t|t|t|t|t|t|t|t|t" ] && [ "$counts_after" = "$counts_before" ] \
  && ok "apply removes exactly the feedback objects and record, and keeps every account, post and earlier function (including moderation and pictures)" \
  || bad "apply (exit $code, state $after, counts $counts_before -> $counts_after)"

# 4. A second run refuses.
out=$(rollback check ""); code=$?
[ $code -ne 0 ] && grep -q 'missing' <<<"$out" && ok "a second run refuses (nothing left to remove)" || bad "a second run did not refuse (exit $code)"

echo "Feedback rollback tests: $pass passed, $failed failed"
[ $failed -eq 0 ]
