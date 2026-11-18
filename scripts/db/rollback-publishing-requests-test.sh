#!/usr/bin/env bash
# Tests scripts/db/staging-rollback-publishing-requests.sql against a LOCAL
# Supabase database. Local only: it refuses any other database. Called by
# scripts/db/rollback-test.sh first, because 20261119000000 is the newest
# migration and every earlier rollback refuses while it is recorded.
#
#   1. Every refusal: a later migration, a missing record, a bad or missing
#      mode, a missing or wrong confirmation. Each must refuse and change
#      nothing.
#   2. mode=check succeeds and changes nothing.
#   3. mode=apply removes exactly the migration's objects and record, and
#      keeps every post and comment and the original functions.
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

SQL=scripts/db/staging-rollback-publishing-requests.sql
PHRASE='REMOVE THE STAGING PUBLISHING REQUEST IDS'
PSQL=(psql "$DB_URL" -X -q -At -v ON_ERROR_STOP=1)
pass=0; failed=0
ok()  { echo "PASS  publishing request ids rollback: $1"; pass=$((pass + 1)); }
bad() { echo "FAIL  publishing request ids rollback: $1"; failed=$((failed + 1)); }

rollback() { psql "$DB_URL" -X -q -v ON_ERROR_STOP=1 -v mode="$1" -v confirm="$2" -f "$SQL" 2>&1; }
state() {
  "${PSQL[@]}" -c "select concat_ws('|', (select string_agg(version, ',' order by version) from supabase_migrations.schema_migrations),
    to_regprocedure('public.app_create_post(text, uuid)') is not null, to_regprocedure('public.app_add_comment(uuid, text, uuid)') is not null,
    to_regclass('social.posts_request_once') is not null, to_regclass('social.comments_request_once') is not null,
    (select count(*) from information_schema.columns where table_schema = 'social' and column_name = 'client_request_id'),
    (select count(*) from social.posts), (select count(*) from social.comments))"
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

refuses "a later migration is recorded" "later migration" \
  "insert into supabase_migrations.schema_migrations (version, name) values ('20991231000000', 'later')" "delete from supabase_migrations.schema_migrations where version = '20991231000000'"
refuses "the migration record is missing" "missing" \
  "delete from supabase_migrations.schema_migrations where version = '20261119000000'" "insert into supabase_migrations.schema_migrations (version, name) values ('20261119000000', 'publishing_request_ids')"
refuses "the mode is neither check nor apply" "mode must be check or apply" "select 1" "select 1" wipe "$PHRASE"
refuses "apply without the confirmation phrase" "confirmation phrase" "select 1" "select 1" apply ""
refuses "apply with a different phrase" "confirmation phrase" "select 1" "select 1" apply "remove the staging publishing request ids"

out=$(psql "$DB_URL" -X -q -v ON_ERROR_STOP=1 -f "$SQL" 2>&1); code=$?
[ $code -ne 0 ] && grep -q 'syntax error' <<<"$out" && ok "refuses to run with no mode given" || bad "ran with no mode (exit $code)"

# 2. A check run succeeds and changes nothing.
before=$(state)
out=$(rollback check ""); code=$?
[ $code -eq 0 ] && grep -q 'Check only' <<<"$out" && [ "$(state)" = "$before" ] \
  && ok "check mode passes and changes nothing" || bad "check mode (exit $code): $(tail -3 <<<"$out" | tr '\n' ' ')"

# 3. Apply removes exactly the migration's objects, and keeps the data.
counts_before=$("${PSQL[@]}" -c "select (select count(*) from social.posts) || '|' || (select count(*) from social.comments)")
out=$(rollback apply "$PHRASE"); code=$?
after=$("${PSQL[@]}" -c "select concat_ws('|',
  not exists (select 1 from supabase_migrations.schema_migrations where version = '20261119000000'),
  exists (select 1 from supabase_migrations.schema_migrations where version = '20261118000000'),
  to_regprocedure('public.app_create_post(text, uuid)') is null, to_regprocedure('public.app_add_comment(uuid, text, uuid)') is null,
  to_regprocedure('public.app_create_post(text)') is not null, to_regprocedure('public.app_add_comment(uuid, text)') is not null,
  to_regclass('social.posts_request_once') is null, to_regclass('social.comments_request_once') is null,
  (select count(*) from information_schema.columns where table_schema = 'social' and column_name = 'client_request_id') = 0)")
counts_after=$("${PSQL[@]}" -c "select (select count(*) from social.posts) || '|' || (select count(*) from social.comments)")
[ $code -eq 0 ] && grep -q 'Applied' <<<"$out" && [ "$after" = "t|t|t|t|t|t|t|t|t" ] && [ "$counts_after" = "$counts_before" ] \
  && ok "apply removes exactly the migration's objects and record, and keeps every post, comment and original function" \
  || bad "apply (exit $code, state $after, counts $counts_before -> $counts_after)"

# 4. A second run refuses.
out=$(rollback check ""); code=$?
[ $code -ne 0 ] && grep -q 'missing' <<<"$out" && ok "a second run refuses (nothing left to remove)" || bad "a second run did not refuse (exit $code)"

echo "Publishing request ids rollback tests: $pass passed, $failed failed"
[ $failed -eq 0 ]
