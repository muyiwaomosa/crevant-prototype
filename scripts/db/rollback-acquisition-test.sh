#!/usr/bin/env bash
# Tests scripts/db/staging-rollback-acquisition.sql against a LOCAL Supabase
# database, the same image and non-superuser postgres login staging uses.
# Local only: it refuses any other database. Called by
# scripts/db/rollback-test.sh before the waitlist rollback tests, because the
# acquisition migration comes after the waitlist and must be removed first.
#
#   1. Every refusal: pilot creators, links, redemptions, events, preview
#      limit records, waitlist answers, invitation attribution, a later
#      migration, a missing record or object, an outside function, a login
#      role privilege, an open session, a bad mode, a missing or wrong
#      confirmation. Each must refuse and leave everything as it was.
#   2. mode=check on a clean database succeeds and changes nothing.
#   3. mode=apply removes exactly the inventory, leaving the waitlist
#      migrations' objects untouched.
#   4. A second run refuses.
#
# Leaves the database with the acquisition migration removed, ready for the
# waitlist rollback tests. rollback-test.sh reapplies everything at the end.
set -uo pipefail
cd "$(dirname "$0")/../.."

DB_URL="${DB_URL:-postgresql://postgres:postgres@127.0.0.1:54322/postgres}"
case "$DB_URL" in
  *@127.0.0.1:*|*@localhost:*) ;;
  *) echo "Refusing: this test only runs against a local database." >&2; exit 1 ;;
esac
SQL=scripts/db/staging-rollback-acquisition.sql
PHRASE='DELETE THE STAGING CREATOR ACQUISITION'
PSQL=(psql "$DB_URL" -X -q -At -v ON_ERROR_STOP=1)
pass=0; failed=0
ok()   { echo "PASS  acquisition rollback: $1"; pass=$((pass + 1)); }
bad()  { echo "FAIL  acquisition rollback: $1"; failed=$((failed + 1)); }

rollback() { psql "$DB_URL" -X -q -v ON_ERROR_STOP=1 -v mode="$1" -v confirm="$2" -f "$SQL" 2>&1; }
state() {
  "${PSQL[@]}" -c "select concat_ws('|',
    to_regclass('ops.creator_links') is not null, to_regclass('ops.acquisition_events') is not null,
    to_regprocedure('waitlist_api.invite_preview(text,text)') is not null,
    (select count(*) from pg_attribute where attrelid = 'ops.waitlist'::regclass and attnum > 0 and not attisdropped),
    (select count(*) from pg_attribute where attrelid = 'ops.invitations'::regclass and attnum > 0 and not attisdropped),
    (select string_agg(version, ',' order by version) from supabase_migrations.schema_migrations),
    (select count(*) from pg_trigger where not tgisinternal),
    (select count(*) from pg_proc where pronamespace in ('ops'::regnamespace, 'waitlist_api'::regnamespace)),
    (select count(*) from pg_class where relnamespace = 'ops'::regnamespace))"
}
data() {
  "${PSQL[@]}" -c "select concat_ws('|', (select count(*) from ops.pilot_creators), (select count(*) from ops.creator_links),
    (select count(*) from ops.creator_link_redemptions), (select count(*) from ops.acquisition_events),
    (select count(*) from ops.invite_preview_limits), (select count(*) from ops.waitlist), (select count(*) from ops.invitations))"
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
if [ "$("${PSQL[@]}" -c "select count(*) from supabase_migrations.schema_migrations where version = '20261116000000'")" != 1 ]; then
  echo "FAIL  acquisition rollback: the acquisition migration is not applied here" >&2; exit 1
fi
# The earlier local tests leave events and preview limit records
# behind (this is a throwaway local database); start from staging's clean state.
"${PSQL[@]}" -c "delete from ops.acquisition_events; delete from ops.invite_preview_limits; delete from ops.creator_link_redemptions;
  delete from ops.creator_links; delete from ops.pilot_creators; update ops.invitations set creator_link_id = null where creator_link_id is not null;
  update ops.waitlist set intent = null, introduced_by_creator = null, creator_link_id = null
   where intent is not null or introduced_by_creator is not null or creator_link_id is not null" >/dev/null

U="insert into auth.users (id, email, email_confirmed_at) values ('00000000-0000-0000-0000-00000000a0c1', 'creator@rollback.test', now()) on conflict do nothing"
PC="$U; insert into ops.pilot_creators (user_id) values ('00000000-0000-0000-0000-00000000a0c1')"
LINK="$PC; insert into ops.creator_links (creator_id, code, expires_at) values ('00000000-0000-0000-0000-00000000a0c1', 'abcdefabcdefabcdefab', now() + interval '30 days')"
CLEAN="delete from ops.creator_links; delete from ops.pilot_creators; delete from auth.users where email = 'creator@rollback.test'"
W="insert into ops.waitlist (email, age_confirmed, waitlist_consent_version, waitlist_consented_at"

refuses "a pilot creator exists" "pilot creator" "$PC" "$CLEAN"
refuses "a creator link exists" "creator link" "$LINK" "$CLEAN"
refuses "an acquisition event exists" "acquisition event" \
  "insert into ops.acquisition_events (event) values ('waitlist_signup')" "delete from ops.acquisition_events"
refuses "a preview limit record exists" "preview limit" \
  "insert into ops.invite_preview_limits (bucket, window_start) values ('preview', now())" "delete from ops.invite_preview_limits"
refuses "a waitlist entry has an acquisition answer" "acquisition answers" \
  "$W, intent) values ('a@rollback.test', true, 'v1', now(), 'discover')" "delete from ops.waitlist where email = 'a@rollback.test'"
refuses "a later migration is recorded" "later migration" \
  "insert into supabase_migrations.schema_migrations (version, name) values ('20991231000000', 'later')" "delete from supabase_migrations.schema_migrations where version = '20991231000000'"
refuses "the acquisition migration record is missing" "missing" \
  "delete from supabase_migrations.schema_migrations where version = '20261116000000'" "insert into supabase_migrations.schema_migrations (version, name) values ('20261116000000', 'creator_acquisition')"
refuses "an outside view depends on the acquisition tables (Postgres's own dependency check)" "depend" \
  "create view public.rollback_dep as select count(*) from ops.creator_links" "drop view public.rollback_dep"
refuses "an outside view depends on a new waitlist column" "depend" \
  "create view public.rollback_dep2 as select intent from ops.waitlist" "drop view public.rollback_dep2"
refuses "an outside function refers to creator acquisition" "refer to creator acquisition" \
  "create function public.rollback_fn() returns bigint language sql as 'select count(*) from ops.acquisition_events'" "drop function public.rollback_fn()"
refuses "a login role holds a privilege on an acquisition table" "privilege" \
  "grant select on ops.creator_links to waitlist_admin" "revoke select on ops.creator_links from waitlist_admin"
refuses "the mode is neither check nor apply" "mode must be check or apply" "select 1" "select 1" wipe "$PHRASE"
refuses "apply without the confirmation phrase" "confirmation phrase" "select 1" "select 1" apply ""
refuses "apply with the waitlist's phrase" "confirmation phrase" "select 1" "select 1" apply "DELETE THE STAGING WAITLIST"

SESSION_PW=$(openssl rand -hex 16)
"${PSQL[@]}" -c "alter role waitlist_admin password '$SESSION_PW'" >/dev/null
PGPASSWORD=$SESSION_PW psql "postgresql://waitlist_admin@127.0.0.1:${DB_URL##*:}" -X -q -c "select pg_sleep(30)" >/dev/null 2>&1 &
sleeper=$!
for _ in $(seq 1 20); do
  [ "$("${PSQL[@]}" -c "select count(*) from pg_stat_activity where usename = 'waitlist_admin'")" != 0 ] && break
  sleep 0.5
done
refuses "a login role has an open session" "open session" "select 1" "select 1"
"${PSQL[@]}" -c "select pg_terminate_backend(pid) from pg_stat_activity where usename = 'waitlist_admin'; alter role waitlist_admin password null" >/dev/null
wait $sleeper 2>/dev/null || true

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
grep -qE '^ +28 \| table +\| ops.creator_links *$' <<<"$out" && grep -qE '^ +27 \| column +\| ops.waitlist.intent *$' <<<"$out" \
  && ok "check mode lists every object it would remove" || bad "check mode did not list the inventory"

# 3. Apply removes exactly the inventory; the waitlist is as the waitlist migrations made it.
waitlist_cols_expected=$("${PSQL[@]}" -c "select count(*) - 3 from pg_attribute where attrelid = 'ops.waitlist'::regclass and attnum > 0 and not attisdropped")
join_src_before=$("${PSQL[@]}" -c "select md5(prosrc) from pg_proc where oid = 'ops.join_waitlist(text,text[],text,text,text,text,boolean,boolean,text,text,text)'::regprocedure")
out=$(rollback apply "$PHRASE"); code=$?
after=$("${PSQL[@]}" -c "select concat_ws('|',
  to_regclass('ops.creator_links') is null, to_regclass('ops.pilot_creators') is null, to_regclass('ops.acquisition_events') is null,
  to_regclass('ops.invite_preview_limits') is null, to_regprocedure('waitlist_api.submit_v2(text,text[],text,text,text,text,boolean,boolean,text,text,text,text,boolean,text)') is null,
  to_regprocedure('waitlist_api.invite_preview(text,text)') is null,
  not exists (select 1 from pg_attribute where attrelid = 'ops.waitlist'::regclass and attname in ('intent', 'introduced_by_creator', 'creator_link_id') and not attisdropped),
  not exists (select 1 from pg_attribute where attrelid = 'ops.invitations'::regclass and attname = 'creator_link_id' and not attisdropped),
  (select count(*) from pg_attribute where attrelid = 'ops.waitlist'::regclass and attnum > 0 and not attisdropped) = $waitlist_cols_expected,
  (select md5(prosrc) from pg_proc where oid = 'ops.join_waitlist(text,text[],text,text,text,text,boolean,boolean,text,text,text)'::regprocedure) = '$join_src_before',
  to_regprocedure('waitlist_api.submit(text,text[],text,text,text,text,boolean,boolean,text,text,text)') is not null,
  not exists (select 1 from supabase_migrations.schema_migrations where version = '20261116000000'),
  (select count(*) from supabase_migrations.schema_migrations where version in ('20261110000000', '20261111000000')) = 2)")
if [ $code -eq 0 ] && grep -q 'Applied' <<<"$out" && [ "$after" = "t|t|t|t|t|t|t|t|t|t|t|t|t" ]; then
  ok "apply removes exactly the acquisition objects, leaving the waitlist as its migrations made it"
else
  bad "apply (exit $code, state $after): $(tail -3 <<<"$out" | tr '\n' ' ')"
fi

# 4. A second run refuses.
out=$(rollback check ""); code=$?
[ $code -ne 0 ] && grep -q 'missing' <<<"$out" && ok "a second run refuses (nothing left to remove)" || bad "a second run did not refuse (exit $code)"

echo "Acquisition rollback tests: $pass passed, $failed failed"
[ $failed -eq 0 ]
