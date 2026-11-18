#!/usr/bin/env bash
# Tests scripts/db/staging-rollback-inner-clique.sql against a LOCAL Supabase
# database. Local only: it refuses any other database. Called by
# scripts/db/rollback-test.sh first, because 20261120000000 is the newest
# migration and every earlier rollback refuses while it is recorded.
#
#   1. Every refusal: a later migration, a missing record, a member over the
#      old limit of 10, a membership closed as 'replaced', a bad or missing
#      mode, a missing or wrong confirmation. Each must refuse and change
#      nothing.
#   2. mode=check succeeds and changes nothing.
#   3. mode=apply restores exactly the earlier definitions and keeps every
#      follow and membership.
#   4. A second run refuses.
#   5. The migration applied over existing memberships keeps them all.
#
# Leaves the migration removed, ready for the earlier rollback tests.
# rollback-test.sh reapplies everything at the end. Step 5 applies the
# migration over existing memberships and proves every one is kept.
set -uo pipefail
cd "$(dirname "$0")/../.."

DB_URL="${DB_URL:-postgresql://postgres:postgres@127.0.0.1:54322/postgres}"
case "$DB_URL" in
  *@127.0.0.1:*|*@localhost:*) ;;
  *) echo "Refusing: this test only runs against a local database." >&2; exit 1 ;;
esac

SQL=scripts/db/staging-rollback-inner-clique.sql
PHRASE='REMOVE THE STAGING INNER CLIQUE'
PSQL=(psql "$DB_URL" -X -q -At -v ON_ERROR_STOP=1)
pass=0; failed=0
ok()  { echo "PASS  inner clique rollback: $1"; pass=$((pass + 1)); }
bad() { echo "FAIL  inner clique rollback: $1"; failed=$((failed + 1)); }

rollback() { psql "$DB_URL" -X -q -v ON_ERROR_STOP=1 -v mode="$1" -v confirm="$2" -f "$SQL" 2>&1; }
state() {
  "${PSQL[@]}" -c "select concat_ws('|', (select string_agg(version, ',' order by version) from supabase_migrations.schema_migrations),
    to_regprocedure('public.app_clique_replace(uuid, uuid)') is not null,
    md5((select prosrc from pg_proc where oid = 'social.clique_members_guard()'::regprocedure)),
    md5((select prosrc from pg_proc where oid = 'public.app_unfollow(uuid)'::regprocedure)),
    md5((select string_agg(prosrc, '' order by oid) from pg_proc where oid in ('social.rate_check(text, uuid)'::regprocedure, 'public.app_clique_add(uuid)'::regprocedure, 'public.app_clique_remove(uuid)'::regprocedure))),
    to_regclass('social.clique_by_fan_recent') is not null,
    (select pg_get_constraintdef(oid) from pg_constraint where conname = 'clique_removal_reason'),
    (select count(*) from social.follows), (select count(*) from social.clique_members),
    (select count(*) from social.clique_members where removed_at is null))"
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

# Test members: a fan (...951) following 12 creators (...952 to ...963).
U="insert into auth.users (id, email, email_confirmed_at) select ('00000000-0000-4000-8000-000000000' || n)::uuid, 'ic-rollback' || n || '@example.test', now() from generate_series(951, 963) n on conflict do nothing"
F="insert into social.follows (follower_id, creator_id) select '00000000-0000-4000-8000-000000000951', ('00000000-0000-4000-8000-000000000' || n)::uuid from generate_series(952, 963) n on conflict do nothing"
"${PSQL[@]}" -c "$U; $F" >/dev/null || { echo "Could not create the test members" >&2; exit 1; }
add() { "${PSQL[@]}" -c "insert into social.clique_members (fan_id, creator_id) select '00000000-0000-4000-8000-000000000951', ('00000000-0000-4000-8000-000000000' || n)::uuid from generate_series($1, $2) n"; }
CLOSE_ALL="update social.clique_members set removed_at = now(), removal_reason = 'removed' where fan_id = '00000000-0000-4000-8000-000000000951' and removed_at is null"

refuses "a later migration is recorded" "later migration" \
  "insert into supabase_migrations.schema_migrations (version, name) values ('20991231000000', 'later')" "delete from supabase_migrations.schema_migrations where version = '20991231000000'"
refuses "the migration record is missing" "missing" \
  "delete from supabase_migrations.schema_migrations where version = '20261120000000'" "insert into supabase_migrations.schema_migrations (version, name) values ('20261120000000', 'inner_clique')"
add 952 962 >/dev/null
refuses "a member has 11 creators in their Inner Clique (over the old 10)" "more than 10" "select 1" "$CLOSE_ALL"
"${PSQL[@]}" -c "insert into social.clique_members (fan_id, creator_id) values ('00000000-0000-4000-8000-000000000951', '00000000-0000-4000-8000-000000000963')" >/dev/null
refuses "a membership was closed as replaced" "replaced" \
  "update social.clique_members set removed_at = now(), removal_reason = 'replaced' where fan_id = '00000000-0000-4000-8000-000000000951' and creator_id = '00000000-0000-4000-8000-000000000963' and removed_at is null" "select 1"
refuses "the mode is neither check nor apply" "mode must be check or apply" "select 1" "select 1" wipe "$PHRASE"
refuses "apply without the confirmation phrase" "confirmation phrase" "select 1" "select 1" apply ""
refuses "apply with a different phrase" "confirmation phrase" "select 1" "select 1" apply "remove the staging inner clique"

out=$(psql "$DB_URL" -X -q -v ON_ERROR_STOP=1 -f "$SQL" 2>&1); code=$?
[ $code -ne 0 ] && grep -q 'syntax error' <<<"$out" && ok "refuses to run with no mode given" || bad "ran with no mode (exit $code)"

# The 'replaced' row is append-only history: only a fresh local reset removes
# it. Disable the history guard for this test member alone, as the database owner.
"${PSQL[@]}" -c "alter table social.clique_members disable trigger user;
  delete from social.clique_members where fan_id = '00000000-0000-4000-8000-000000000951';
  alter table social.clique_members enable trigger user" >/dev/null || bad "could not clear the test member's history"
# Existing memberships to keep: 8 open, 2 closed.
add 952 961 >/dev/null
"${PSQL[@]}" -c "update social.clique_members set removed_at = now(), removal_reason = 'removed' where fan_id = '00000000-0000-4000-8000-000000000951' and creator_id in ('00000000-0000-4000-8000-000000000960', '00000000-0000-4000-8000-000000000961') and removed_at is null" >/dev/null
ROWS="select string_agg(creator_id || ':' || (removed_at is null) || ':' || coalesce(removal_reason, '-'), ',' order by id) from social.clique_members where fan_id = '00000000-0000-4000-8000-000000000951'"

# 2. A check run succeeds and changes nothing.
before=$(state)
out=$(rollback check ""); code=$?
[ $code -eq 0 ] && grep -q 'Check only' <<<"$out" && [ "$(state)" = "$before" ] \
  && ok "check mode passes and changes nothing" || bad "check mode (exit $code): $(tail -3 <<<"$out" | tr '\n' ' ')"

# 3. Apply restores exactly the earlier definitions, and keeps the data.
rows_before=$("${PSQL[@]}" -c "$ROWS")
follows_before=$("${PSQL[@]}" -c "select count(*) from social.follows")
out=$(rollback apply "$PHRASE"); code=$?
after=$("${PSQL[@]}" -c "select concat_ws('|',
  not exists (select 1 from supabase_migrations.schema_migrations where version = '20261120000000'),
  exists (select 1 from supabase_migrations.schema_migrations where version = '20261119000000'),
  to_regprocedure('public.app_clique_replace(uuid, uuid)') is null,
  (select prosrc ~ '>= 10' and prosrc !~ '>= 25' from pg_proc where oid = 'social.clique_members_guard()'::regprocedure),
  (select prosrc !~ 'advisory' from pg_proc where oid = 'public.app_unfollow(uuid)'::regprocedure),
  (select pg_get_constraintdef(oid) !~ 'replaced' from pg_constraint where conname = 'clique_removal_reason'),
  obj_description('social.clique_members_guard()'::regprocedure, 'pg_proc') is null,
  (select prosrc !~ 'clique' from pg_proc where oid = 'social.rate_check(text, uuid)'::regprocedure),
  (select bool_and(prosrc !~ 'rate_check') from pg_proc where oid in ('public.app_clique_add(uuid)'::regprocedure, 'public.app_clique_remove(uuid)'::regprocedure)),
  to_regclass('social.clique_by_fan_recent') is null)")
rows_after=$("${PSQL[@]}" -c "$ROWS")
follows_after=$("${PSQL[@]}" -c "select count(*) from social.follows")
[ $code -eq 0 ] && grep -q 'Applied' <<<"$out" && [ "$after" = "t|t|t|t|t|t|t|t|t|t" ] && [ "$rows_after" = "$rows_before" ] && [ "$follows_after" = "$follows_before" ] \
  && ok "apply restores the earlier definitions and removes the record, keeping every follow and membership" \
  || bad "apply (exit $code, state $after, follows $follows_before -> $follows_after)"

# 4. A second run refuses.
out=$(rollback check ""); code=$?
[ $code -ne 0 ] && grep -q 'missing' <<<"$out" && ok "a second run refuses (nothing left to remove)" || bad "a second run did not refuse (exit $code)"

# 5. Applying the migration over existing memberships keeps every one, open
#    and closed, then this rollback runs once more.
if out=$(psql "$DB_URL" -X -q -v ON_ERROR_STOP=1 -f supabase/migrations/20261120000000_inner_clique.sql 2>&1) \
   && "${PSQL[@]}" -c "insert into supabase_migrations.schema_migrations (version, name) values ('20261120000000', 'inner_clique')" >/dev/null; then
  rows_again=$("${PSQL[@]}" -c "$ROWS")
  [ "$rows_again" = "$rows_before" ] && [ "$("${PSQL[@]}" -c "select count(*) from social.follows")" = "$follows_before" ] \
    && ok "applying the migration over existing memberships keeps every follow and membership, open and closed" \
    || bad "the migration changed existing memberships: $rows_again"
else
  bad "the migration did not apply over existing memberships: $(tail -2 <<<"$out" | tr '\n' ' ')"
fi
out=$(rollback apply "$PHRASE"); code=$?
[ $code -eq 0 ] && grep -q 'Applied' <<<"$out" && ok "the rollback applies again after reapplying" || bad "second apply (exit $code)"

# Remove the test members (their follows and history go with the accounts),
# so the earlier rollbacks, which refuse while member data exists, can run.
"${PSQL[@]}" -c "delete from auth.users where id::text between '00000000-0000-4000-8000-000000000951' and '00000000-0000-4000-8000-000000000963'" >/dev/null \
  && [ "$("${PSQL[@]}" -c "select count(*) from social.clique_members where fan_id = '00000000-0000-4000-8000-000000000951'")" = 0 ] \
  && ok "the test members and their data are removed" || bad "could not remove the test members"

echo "Inner Clique rollback tests: $pass passed, $failed failed"
[ $failed -eq 0 ]
