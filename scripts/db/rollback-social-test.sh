#!/usr/bin/env bash
# Tests scripts/db/staging-rollback-social.sql against a LOCAL Supabase
# database, the same image and non-superuser postgres login staging uses.
# Local only: it refuses any other database. Called by
# scripts/db/rollback-test.sh before the waitlist rollback tests, because the
# social core migration comes after the waitlist and must be removed first.
#
#   1. Every refusal: each kind of member data, a later migration, a missing
#      record or object, an unexpected function or table, an outside view or
#      function, a bad mode, a missing or wrong confirmation. Each must refuse
#      and leave everything as it was.
#   2. mode=check on a clean database succeeds and changes nothing.
#   3. mode=apply removes exactly the inventory, leaving the earlier
#      migrations' objects untouched.
#   4. A second run refuses.
#
# Leaves the database with the social core removed, ready for the waitlist
# rollback tests. rollback-test.sh reapplies everything at the end.
set -uo pipefail
cd "$(dirname "$0")/../.."

DB_URL="${DB_URL:-postgresql://postgres:postgres@127.0.0.1:54322/postgres}"
case "$DB_URL" in
  *@127.0.0.1:*|*@localhost:*) ;;
  *) echo "Refusing: this test only runs against a local database." >&2; exit 1 ;;
esac

SQL=scripts/db/staging-rollback-social.sql
PHRASE='DELETE THE STAGING SOCIAL CORE'
PSQL=(psql "$DB_URL" -X -q -At -v ON_ERROR_STOP=1)
pass=0; failed=0
ok()   { echo "PASS  social rollback: $1"; pass=$((pass + 1)); }
bad()  { echo "FAIL  social rollback: $1"; failed=$((failed + 1)); }

rollback() { psql "$DB_URL" -X -q -v ON_ERROR_STOP=1 -v mode="$1" -v confirm="$2" -f "$SQL" 2>&1; }
state() {
  "${PSQL[@]}" -c "select concat_ws('|',
    to_regnamespace('social') is not null, to_regprocedure('public.app_feed(timestamp with time zone,integer)') is not null,
    (select string_agg(version, ',' order by version) from supabase_migrations.schema_migrations),
    (select count(*) from pg_proc where pronamespace = 'public'::regnamespace and proname like 'app\\_%'),
    (select count(*) from pg_class where relnamespace = to_regnamespace('social')))"
}
data() {
  "${PSQL[@]}" -c "select concat_ws('|', (select count(*) from social.posts), (select count(*) from social.follows),
    (select count(*) from social.follow_events), (select count(*) from social.clique_members),
    (select count(*) from social.likes), (select count(*) from social.comments))" 2>/dev/null
}

# refuses <description> <expected message> <setup sql> <teardown sql> [mode confirm]
refuses() {
  local desc=$1 want=$2 setup=$3 teardown=$4 before_s before_d out code m c
  "${PSQL[@]}" -c "$setup" >/dev/null || { bad "$desc (setup failed)"; return; }
  before_s=$(state); before_d=$(data)
  for mc in "check|" "apply|$PHRASE"; do
    m=${5-${mc%%|*}}; c=${6-${mc#*|}}
    out=$(rollback "$m" "$c"); code=$?
    if [ $code -eq 0 ] || ! grep -qi -- "$want" <<<"$out"; then
      bad "$desc (mode=$m exit $code): $(tail -2 <<<"$out" | tr '\n' ' ')"
      "${PSQL[@]}" -c "$teardown" >/dev/null 2>&1; return
    fi
    if [ "$(state)" != "$before_s" ] || [ "$(data)" != "$before_d" ]; then
      bad "$desc (mode=$m changed something although it refused)"
      "${PSQL[@]}" -c "$teardown" >/dev/null 2>&1; return
    fi
    [ -n "${5-}" ] && break
  done
  "${PSQL[@]}" -c "$teardown" >/dev/null || { bad "$desc (teardown failed)"; return; }
  ok "refuses, changing nothing: $desc"
}

"${PSQL[@]}" -c "select 1" >/dev/null || { echo "Local database not reachable" >&2; exit 1; }

A=00000000-0000-0000-0000-00000000f0a1
B=00000000-0000-0000-0000-00000000f0b2
USERS="insert into auth.users (id, email, email_confirmed_at) values ('$A', 'a@social-rollback.test', now()), ('$B', 'b@social-rollback.test', now()) on conflict do nothing"
POST="$USERS; insert into social.posts (id, author_id, body) values ('00000000-0000-0000-0000-0000000f0001', '$A', 'hello')"
CLEAN="delete from social.comments; delete from social.likes; delete from social.posts; delete from social.follows; delete from auth.users where email like '%@social-rollback.test'"

refuses "a post exists" "post(s)" "$POST" "$CLEAN"
refuses "a follow exists" "follow(s)" "$USERS; insert into social.follows (follower_id, creator_id) values ('$B', '$A')" "$CLEAN"
refuses "follow history exists" "follow event" "$USERS; insert into social.follow_events (follower_id, creator_id, action) values ('$B', '$A', 'followed')" \
  "delete from auth.users where email like '%@social-rollback.test'"
refuses "a Clique membership exists" "Clique membership" \
  "$USERS; insert into social.follows (follower_id, creator_id) values ('$B', '$A'); insert into social.clique_members (fan_id, creator_id) values ('$B', '$A')" \
  "delete from auth.users where email like '%@social-rollback.test'"
refuses "a like exists" "like(s)" "$POST; insert into social.likes (user_id, post_id) values ('$B', '00000000-0000-0000-0000-0000000f0001')" "$CLEAN"
refuses "a comment exists" "comment(s)" "$POST; insert into social.comments (post_id, author_id, body) values ('00000000-0000-0000-0000-0000000f0001', '$B', 'nice')" "$CLEAN"
refuses "a later migration is recorded" "later migration" \
  "insert into supabase_migrations.schema_migrations (version, name) values ('20991231000000', 'later')" "delete from supabase_migrations.schema_migrations where version = '20991231000000'"
refuses "the social core migration record is missing" "missing" \
  "delete from supabase_migrations.schema_migrations where version = '20261117000000'" "insert into supabase_migrations.schema_migrations (version, name) values ('20261117000000', 'social_core')"
refuses "social holds an unexpected table" "unexpected table" "create table social.extra (id int)" "drop table social.extra"
refuses "an unexpected public.app_* function exists" "unexpected function" \
  "create function public.app_extra() returns int language sql as 'select 1'" "drop function public.app_extra()"
refuses "an outside view depends on the social core (Postgres's own dependency check)" "depend" \
  "create view public.social_rollback_dep as select count(*) from social.posts" "drop view public.social_rollback_dep"
refuses "an outside function refers to the social core" "refer to the social core" \
  "create function public.social_rollback_fn() returns bigint language sql as 'select count(*) from social.posts'" "drop function public.social_rollback_fn()"
refuses "the mode is neither check nor apply" "mode must be check or apply" "select 1" "select 1" wipe "$PHRASE"
refuses "apply without the confirmation phrase" "confirmation phrase" "select 1" "select 1" apply ""
refuses "apply with a different phrase" "confirmation phrase" "select 1" "select 1" apply "delete the staging social core"

out=$(psql "$DB_URL" -X -q -v ON_ERROR_STOP=1 -f "$SQL" 2>&1); code=$?
[ $code -ne 0 ] && grep -q 'syntax error' <<<"$out" && ok "refuses to run with no mode given" || bad "ran with no mode (exit $code)"

# 2. A clean check run succeeds and changes nothing.
before=$(state)
out=$(rollback check ""); code=$?
if [ $code -eq 0 ] && grep -q 'Check only' <<<"$out" && [ "$(state)" = "$before" ]; then
  ok "check mode passes on a clean database and changes nothing"
else
  bad "check mode (exit $code): $(tail -3 <<<"$out" | tr '\n' ' ')"
fi
grep -qE '^ +32 \| table +\| social.posts *$' <<<"$out" && grep -qE '^ +33 \| schema +\| social *$' <<<"$out" \
  && ok "check mode lists every object it would remove" || bad "check mode did not list the inventory"

# 3. Apply removes exactly the inventory.
out=$(rollback apply "$PHRASE"); code=$?
after=$("${PSQL[@]}" -c "select concat_ws('|',
  to_regnamespace('social') is null,
  (select count(*) from pg_proc where pronamespace = 'public'::regnamespace and proname like 'app\\_%') = 0,
  not exists (select 1 from supabase_migrations.schema_migrations where version = '20261117000000'),
  to_regclass('public.profiles') is not null, to_regclass('ops.waitlist') is not null, to_regclass('ops.invitations') is not null,
  (select count(*) from supabase_migrations.schema_migrations where version in ('20261106000000', '20261107000000', '20261110000000', '20261111000000')) = 4,
  not exists (select 1 from pg_default_acl where defaclnamespace not in (select oid from pg_namespace)))")
if [ $code -eq 0 ] && grep -q 'Applied' <<<"$out" && [ "$after" = "t|t|t|t|t|t|t|t" ]; then
  ok "apply removes the social core and its migration record, and nothing from earlier migrations"
else
  bad "apply (exit $code, state $after): $(tail -3 <<<"$out" | tr '\n' ' ')"
fi
out=$(rollback check ""); code=$?
[ $code -ne 0 ] && grep -q 'missing' <<<"$out" && ok "a second run refuses (nothing left to remove)" || bad "a second run did not refuse (exit $code)"

echo "Social rollback tests: $pass passed, $failed failed"
[ $failed -eq 0 ]
