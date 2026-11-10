#!/usr/bin/env bash
# Tests scripts/db/staging-rollback-waitlist.sql against a LOCAL Supabase
# database (supabase start, or scripts/ci/start-local-supabase.sh), the same
# image and the same non-superuser postgres login the staging workflow uses.
# Local only: it refuses any other database.
#
#   1. Every refusal: registrations, consent records, selections, rate limit
#      records, a notice version, open submissions, extra settings, a later
#      migration, extra objects in waitlist_api, an outside view or function,
#      an outside privilege, a role membership, an open session, a missing
#      object, a bad mode, a missing or wrong confirmation. Each one must
#      refuse in both modes and leave everything exactly as it was.
#   2. mode=check on a clean database succeeds and changes nothing.
#   3. mode=apply removes exactly the inventory and nothing from the earlier
#      migrations.
#   4. The migrations then apply again cleanly (supabase migration up), the
#      staging-safe checks pass, and a new check run succeeds.
#
# Requires: psql, and the Supabase CLI on PATH for step 4.
set -uo pipefail
cd "$(dirname "$0")/../.."

DB_URL="${DB_URL:-postgresql://postgres:postgres@127.0.0.1:54322/postgres}"
case "$DB_URL" in
  *@127.0.0.1:*|*@localhost:*) ;;
  *) echo "Refusing: this test only runs against a local database." >&2; exit 1 ;;
esac
SQL=scripts/db/staging-rollback-waitlist.sql
PHRASE='DELETE THE STAGING WAITLIST'
PSQL=(psql "$DB_URL" -X -q -At -v ON_ERROR_STOP=1)
SUBMIT='waitlist_api.submit(text,text[],text,text,text,text,boolean,boolean,text,text,text)'
pass=0; failed=0
ok()   { echo "PASS  $1"; pass=$((pass + 1)); }
bad()  { echo "FAIL  $1"; failed=$((failed + 1)); }

rollback() { # mode confirm -> prints output, returns psql's exit code
  psql "$DB_URL" -X -q -v ON_ERROR_STOP=1 -v mode="$1" -v confirm="$2" -f "$SQL" 2>&1
}
# A fingerprint of everything the rollback could touch, to prove a refusal
# changed nothing.
state() {
  "${PSQL[@]}" -c "select concat_ws('|',
    to_regprocedure('$SUBMIT') is not null, to_regnamespace('waitlist_api') is not null,
    (select count(*) from pg_roles where rolname in ('waitlist_writer', 'waitlist_admin')),
    (select string_agg(version, ',' order by version) from supabase_migrations.schema_migrations),
    (select count(*) from pg_trigger where tgname in ('invitations_require_verified_waitlist_email', 'waitlist_selections_require_verified')),
    (select count(*) from pg_proc where pronamespace in ('ops'::regnamespace, 'waitlist_api'::regnamespace)),
    (select count(*) from pg_class where relnamespace = 'ops'::regnamespace))"
}
data() {
  "${PSQL[@]}" -c "select concat_ws('|', (select count(*) from ops.waitlist), (select count(*) from ops.waitlist_consents),
    (select count(*) from ops.waitlist_selections), (select count(*) from ops.waitlist_rate_limits),
    (select string_agg(key || ':' || enabled || ':' || coalesce(value, '-'), ',' order by key) from ops.settings))"
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
[ "$("${PSQL[@]}" -c "select rolsuper from pg_roles where rolname = current_user")" = f ] \
  && ok "runs as a non-superuser postgres login, as on hosted Supabase" || bad "expected a non-superuser login"
# Start from the clean state the staging project will be in.
"${PSQL[@]}" -c "delete from ops.waitlist where email like '%@e2e.test'; delete from ops.waitlist_rate_limits;
  update ops.settings set enabled = false, value = null where key in ('waitlist_submissions', 'waitlist_notice_version')" >/dev/null

W="insert into ops.waitlist (email, age_confirmed, waitlist_consent_version, waitlist_consented_at)"
CLEAN="delete from ops.waitlist where email like '%@rollback.test'"
refuses "a registration exists" "registration" \
  "$W values ('a@rollback.test', true, 'v1', now())" "$CLEAN"
refuses "a consent record exists" "consent record" \
  "$W values ('b@rollback.test', true, 'v1', now()); insert into ops.waitlist_consents (waitlist_id, kind, granted, notice_version) select id, 'waitlist', true, 'v1' from ops.waitlist where email = 'b@rollback.test'" "$CLEAN"
refuses "a selection exists" "selection" \
  "insert into ops.waitlist (email, age_confirmed, waitlist_consent_version, waitlist_consented_at, email_verified_at) values ('c@rollback.test', true, 'v1', now(), now()); insert into ops.waitlist_selections (waitlist_id, wave, reasons) select id, 'w1', '{group_balance}' from ops.waitlist where email = 'c@rollback.test'" "$CLEAN"
refuses "a rate limit record exists" "rate limit record" \
  "insert into ops.waitlist_rate_limits (bucket, window_start, hits) values ('global', now(), 1)" "delete from ops.waitlist_rate_limits"
refuses "a privacy notice version is recorded" "notice version" \
  "update ops.settings set value = 'notice-1' where key = 'waitlist_notice_version'" "update ops.settings set value = null where key = 'waitlist_notice_version'"
refuses "submissions are switched on" "switched on" \
  "update ops.settings set enabled = true where key = 'waitlist_submissions'" "update ops.settings set enabled = false where key = 'waitlist_submissions'"
refuses "ops.settings holds another switch" "ops.settings holds" \
  "insert into ops.settings (key) values ('another_switch')" "delete from ops.settings where key = 'another_switch'"
refuses "a later migration is recorded" "later migration" \
  "insert into supabase_migrations.schema_migrations (version, name) values ('20991231000000', 'later')" "delete from supabase_migrations.schema_migrations where version = '20991231000000'"
refuses "a waitlist migration record is missing" "missing" \
  "delete from supabase_migrations.schema_migrations where version = '20261111000000'" "insert into supabase_migrations.schema_migrations (version, name) values ('20261111000000', 'waitlist_admin_tools')"
refuses "waitlist_api holds an unexpected table" "unexpected table" \
  "create table waitlist_api.extra (id int)" "drop table waitlist_api.extra"
refuses "waitlist_api holds an unexpected function" "unexpected function" \
  "create function waitlist_api.extra() returns int language sql as 'select 1'" "drop function waitlist_api.extra()"
refuses "an outside view depends on the waitlist (Postgres's own dependency check)" "depend" \
  "create view public.rollback_dep as select count(*) from ops.waitlist" "drop view public.rollback_dep"
refuses "an outside function refers to the waitlist" "refer to the waitlist" \
  "create function public.rollback_fn() returns bigint language sql as 'select count(*) from ops.waitlist'" "drop function public.rollback_fn()"
refuses "a login role holds a privilege outside waitlist_api" "outside waitlist_api" \
  "grant select on ops.admins to waitlist_writer" "revoke select on ops.admins from waitlist_writer"
refuses "a login role belongs to another role" "belongs to another role" \
  "create role rollback_group nologin; grant rollback_group to waitlist_admin" "revoke rollback_group from waitlist_admin; drop role rollback_group"
refuses "the mode is neither check nor apply" "mode must be check or apply" "select 1" "select 1" wipe "$PHRASE"
refuses "apply without the confirmation phrase" "confirmation phrase" "select 1" "select 1" apply ""
refuses "apply with a different phrase" "confirmation phrase" "select 1" "select 1" apply "delete the staging waitlist"

# An open session as a login role.
SESSION_PW=$(openssl rand -hex 16)
"${PSQL[@]}" -c "alter role waitlist_writer password '$SESSION_PW'" >/dev/null
PGPASSWORD=$SESSION_PW psql "postgresql://waitlist_writer@127.0.0.1:${DB_URL##*:}" -X -q -c "select pg_sleep(30)" >/dev/null 2>&1 &
sleeper=$!
for _ in $(seq 1 20); do
  [ "$("${PSQL[@]}" -c "select count(*) from pg_stat_activity where usename = 'waitlist_writer'")" != 0 ] && break
  sleep 0.5
done
refuses "a login role has an open session" "open session" "select 1" "select 1"
"${PSQL[@]}" -c "select pg_terminate_backend(pid) from pg_stat_activity where usename = 'waitlist_writer'; alter role waitlist_writer password null" >/dev/null
wait $sleeper 2>/dev/null || true

# An unset mode stops before anything runs.
out=$(psql "$DB_URL" -X -q -v ON_ERROR_STOP=1 -f "$SQL" 2>&1); code=$?
[ $code -ne 0 ] && grep -q 'syntax error' <<<"$out" && ok "refuses to run with no mode given" || bad "ran with no mode (exit $code)"

# 2. A clean check run succeeds and changes nothing.
before=$(state)
out=$(rollback check ""); code=$?
if [ $code -eq 0 ] && grep -q 'Check only' <<<"$out" && [ "$(state)" = "$before" ]; then
  ok "check mode passes on a clean database, prints the inventory, and changes nothing"
else
  bad "check mode (exit $code): $(tail -3 <<<"$out" | tr '\n' ' ')"
fi
grep -qE '^ +28 \| role +\| waitlist_writer' <<<"$out" && grep -qE '^ +26 \| table +\| ops.waitlist *$' <<<"$out" \
  && ok "check mode lists every object it would remove" || bad "check mode did not list the inventory"

# 3. Apply removes exactly the inventory.
out=$(rollback apply "$PHRASE"); code=$?
after=$("${PSQL[@]}" -c "select concat_ws('|',
  to_regprocedure('$SUBMIT') is null, to_regnamespace('waitlist_api') is null, to_regclass('ops.waitlist') is null,
  to_regclass('ops.settings') is null, (select count(*) from pg_roles where rolname like 'waitlist\\_%') = 0,
  not exists (select 1 from supabase_migrations.schema_migrations where version in ('20261110000000', '20261111000000')),
  to_regclass('ops.invitations') is not null, to_regclass('ops.admins') is not null, to_regclass('public.profiles') is not null,
  to_regprocedure('ops.profiles_before_write()') is not null,
  (select count(*) from supabase_migrations.schema_migrations where version in ('20261106000000', '20261107000000')) = 2)")
if [ $code -eq 0 ] && grep -q 'Applied' <<<"$out" && [ "$after" = "t|t|t|t|t|t|t|t|t|t|t" ]; then
  ok "apply removes the waitlist objects, roles and migration records, and nothing from earlier migrations"
else
  bad "apply (exit $code, state $after): $(tail -3 <<<"$out" | tr '\n' ' ')"
fi
out=$(rollback check ""); code=$?
[ $code -ne 0 ] && grep -q 'missing' <<<"$out" && ok "a second run refuses (nothing left to remove)" || bad "a second run did not refuse (exit $code)"

# 4. The migrations apply again cleanly.
if out=$(supabase migration up --local 2>&1); then
  ok "the waitlist migrations apply again cleanly"
else
  bad "reapplying the migrations failed: $(tail -3 <<<"$out" | tr '\n' ' ')"
fi
if out=$(for f in supabase/tests/*.sql; do psql "$DB_URL" -X -q -v ON_ERROR_STOP=1 -f "$f" || exit 1; done 2>&1); then
  ok "the staging-safe database checks pass after reapplying"
else
  bad "database checks after reapplying: $(tail -3 <<<"$out" | tr '\n' ' ')"
fi
out=$(rollback check ""); code=$?
[ $code -eq 0 ] && ok "after reapplying, a new check run passes again" || bad "check after reapply (exit $code): $(tail -2 <<<"$out" | tr '\n' ' ')"

echo "Rollback tests: $pass passed, $failed failed"
[ $failed -eq 0 ]
