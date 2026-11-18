#!/usr/bin/env bash
# Tests scripts/db/staging-rollback-viewed-state.sql against a LOCAL Supabase
# database. Local only: it refuses any other database. Called by
# scripts/db/rollback-test.sh first, because 20261121000000 is the newest
# migration and every earlier rollback refuses while it is recorded.
#
#   1. Every refusal: a later migration, a missing record, any viewed-state
#      row (member data: fix forward instead), a bad or missing mode, a
#      missing or wrong confirmation. Each must refuse and change nothing.
#   2. mode=check succeeds and changes nothing.
#   3. mode=apply removes exactly the migration's objects and record.
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

SQL=scripts/db/staging-rollback-viewed-state.sql
PHRASE='REMOVE THE STAGING VIEWED STATE'
PSQL=(psql "$DB_URL" -X -q -At -v ON_ERROR_STOP=1)
pass=0; failed=0
ok()  { echo "PASS  viewed state rollback: $1"; pass=$((pass + 1)); }
bad() { echo "FAIL  viewed state rollback: $1"; failed=$((failed + 1)); }

rollback() { psql "$DB_URL" -X -q -v ON_ERROR_STOP=1 -v mode="$1" -v confirm="$2" -f "$SQL" 2>&1; }
state() {
  "${PSQL[@]}" -c "select concat_ws('|', (select string_agg(version, ',' order by version) from supabase_migrations.schema_migrations),
    to_regclass('social.post_views') is not null, to_regprocedure('public.app_mark_viewed(uuid[], text)') is not null,
    to_regprocedure('public.app_unseen_creators()') is not null, to_regprocedure('public.app_catch_up(uuid, timestamptz, uuid)') is not null,
    to_regprocedure('social.post_views_are_permanent()') is not null,
    case when to_regclass('social.post_views') is null then -1 else (select count(*) from social.post_views) end,
    (select count(*) from social.posts))"
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
  "delete from supabase_migrations.schema_migrations where version = '20261121000000'" "insert into supabase_migrations.schema_migrations (version, name) values ('20261121000000', 'viewed_state')"
# A real view: a viewer and a post by someone else. Removing the viewer's
# account is the only way the view goes (the table refuses direct deletes).
V=00000000-0000-4000-8000-0000000009e1; A=00000000-0000-4000-8000-0000000009e2
SETUP_VIEW="insert into auth.users (id, email, email_confirmed_at) values ('$V', 'rb-viewer@example.test', now()), ('$A', 'rb-author@example.test', now()) on conflict do nothing;
  insert into social.posts (author_id, body) values ('$A', 'A post to view');
  insert into social.post_views (viewer_id, post_id, basis) select '$V', id, 'visible' from social.posts where author_id = '$A'"
TEARDOWN_VIEW="delete from auth.users where id in ('$V', '$A')"
refuses "a viewed-state row exists (member data: fix forward)" "viewed-state row" "$SETUP_VIEW" "$TEARDOWN_VIEW"
refuses "the mode is neither check nor apply" "mode must be check or apply" "select 1" "select 1" wipe "$PHRASE"
refuses "apply without the confirmation phrase" "confirmation phrase" "select 1" "select 1" apply ""
refuses "apply with a different phrase" "confirmation phrase" "select 1" "select 1" apply "remove the staging viewed state"

out=$(psql "$DB_URL" -X -q -v ON_ERROR_STOP=1 -f "$SQL" 2>&1); code=$?
[ $code -ne 0 ] && grep -q 'syntax error' <<<"$out" && ok "refuses to run with no mode given" || bad "ran with no mode (exit $code)"

# 2. A check run succeeds and changes nothing.
before=$(state)
out=$(rollback check ""); code=$?
[ $code -eq 0 ] && grep -q 'Check only' <<<"$out" && [ "$(state)" = "$before" ] \
  && ok "check mode passes and changes nothing" || bad "check mode (exit $code): $(tail -3 <<<"$out" | tr '\n' ' ')"

# 3. Apply removes exactly the migration's objects and record.
posts_before=$("${PSQL[@]}" -c "select count(*) from social.posts")
out=$(rollback apply "$PHRASE"); code=$?
after=$("${PSQL[@]}" -c "select concat_ws('|',
  not exists (select 1 from supabase_migrations.schema_migrations where version = '20261121000000'),
  exists (select 1 from supabase_migrations.schema_migrations where version = '20261120000000'),
  to_regclass('social.post_views') is null, to_regprocedure('public.app_mark_viewed(uuid[], text)') is null,
  to_regprocedure('public.app_unseen_creators()') is null, to_regprocedure('public.app_catch_up(uuid, timestamptz, uuid)') is null,
  to_regprocedure('social.post_views_are_permanent()') is null,
  to_regprocedure('public.app_feed(timestamptz, integer)') is not null, to_regprocedure('public.app_clique_replace(uuid, uuid)') is not null)")
posts_after=$("${PSQL[@]}" -c "select count(*) from social.posts")
[ $code -eq 0 ] && grep -q 'Applied' <<<"$out" && [ "$after" = "t|t|t|t|t|t|t|t|t" ] && [ "$posts_after" = "$posts_before" ] \
  && ok "apply removes exactly the migration's objects and record, and nothing else" \
  || bad "apply (exit $code, state $after, posts $posts_before -> $posts_after)"

# 4. A second run refuses.
out=$(rollback check ""); code=$?
[ $code -ne 0 ] && grep -q 'missing' <<<"$out" && ok "a second run refuses (nothing left to remove)" || bad "a second run did not refuse (exit $code)"

echo "Viewed state rollback tests: $pass passed, $failed failed"
[ $failed -eq 0 ]
