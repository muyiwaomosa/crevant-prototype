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
# Later migrations follow the waitlist: content (20261202000000,
# scripts/db/rollback-content-test.sh, the newest, so it goes first),
# relationships (20261201000000, scripts/db/rollback-relationships-test.sh),
# foundation v2 (20261130000000, scripts/db/rollback-foundation-v2-test.sh),
# the member launch gate (20261129000000,
# scripts/db/rollback-member-launch-gate-test.sh), the photo audience (20261128000000,
# scripts/db/rollback-photo-audience-test.sh),
# photo posts (20261127000000, scripts/db/rollback-post-photos-test.sh),
# feedback (20261126000000, scripts/db/rollback-feedback-test.sh),
# profile pictures (20261125000000, scripts/db/rollback-avatars-test.sh),
# moderation (20261124000000, scripts/db/rollback-moderation-test.sh),
# profile details (20261123000000, scripts/db/rollback-profile-details-test.sh),
# pilot membership (20261122000000, scripts/db/rollback-member-access-test.sh),
# viewed state (20261121000000), the Inner Clique (20261120000000,
# scripts/db/rollback-inner-clique-test.sh), publishing request ids
# (20261119000000, scripts/db/rollback-publishing-requests-test.sh), creator acquisition
# (20261116000000), the Release 1 social core (20261117000000) and platform
# function access (20261118000000). Each rollback refuses while a later
# migration is recorded, so they run newest first: platform access
# (scripts/db/rollback-platform-access-test.sh), social core
# (scripts/db/rollback-social-test.sh), creator acquisition
# (scripts/db/rollback-acquisition-test.sh), then this one. After
# reapplying, this test proves the order holds: each rollback refuses until
# the later ones have run.
# rollback has run.
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

# Later migrations first, newest first: each refuses while a later one is
# recorded. The social core (20261117000000), then creator acquisition
# (20261116000000).
CONTENT=$("${PSQL[@]}" -c "select exists (select 1 from supabase_migrations.schema_migrations where version = '20261202000000')")
if [ "$CONTENT" = t ]; then
  # The newest migration (content) goes first.
  out=$(psql "$DB_URL" -X -q -v ON_ERROR_STOP=1 -v mode=check -v confirm= -f scripts/db/staging-rollback-relationships.sql 2>&1); code=$?
  [ $code -ne 0 ] && grep -q 'later migration' <<<"$out" \
    && ok "the relationships rollback refuses while content is recorded" \
    || bad "the relationships rollback did not refuse while content is recorded (exit $code)"
  if DB_URL="$DB_URL" bash scripts/db/rollback-content-test.sh; then
    ok "content: its rollback refuses while member data or a later migration exists, and otherwise removes exactly its own objects"
  else
    bad "the content rollback tests failed"
  fi
fi
RELATIONSHIPS=$("${PSQL[@]}" -c "select exists (select 1 from supabase_migrations.schema_migrations where version = '20261201000000')")
if [ "$RELATIONSHIPS" = t ]; then
  # Then relationships.
  out=$(psql "$DB_URL" -X -q -v ON_ERROR_STOP=1 -v mode=check -v confirm= -f scripts/db/staging-rollback-foundation-v2.sql 2>&1); code=$?
  [ $code -ne 0 ] && grep -q 'later migration' <<<"$out" \
    && ok "the foundation v2 rollback refuses while relationships is recorded" \
    || bad "the foundation v2 rollback did not refuse while relationships is recorded (exit $code)"
  if DB_URL="$DB_URL" bash scripts/db/rollback-relationships-test.sh; then
    ok "relationships: its rollback refuses while member data, a Clique above 25 or a later migration exists, and otherwise removes exactly its own objects and restores every replaced function"
  else
    bad "the relationships rollback tests failed"
  fi
fi
FOUNDATION=$("${PSQL[@]}" -c "select exists (select 1 from supabase_migrations.schema_migrations where version = '20261130000000')")
if [ "$FOUNDATION" = t ]; then
  # Then foundation v2.
  out=$(psql "$DB_URL" -X -q -v ON_ERROR_STOP=1 -v mode=check -v confirm= -f scripts/db/staging-rollback-member-launch-gate.sql 2>&1); code=$?
  [ $code -ne 0 ] && grep -q 'later migration' <<<"$out" \
    && ok "the member launch gate rollback refuses while foundation v2 is recorded" \
    || bad "the member launch gate rollback did not refuse while foundation v2 is recorded (exit $code)"
  if DB_URL="$DB_URL" bash scripts/db/rollback-foundation-v2-test.sh; then
    ok "foundation v2: its rollback refuses while member data or a later migration exists, and otherwise removes exactly its own objects and restores the access check"
  else
    bad "the foundation v2 rollback tests failed"
  fi
fi
GATE=$("${PSQL[@]}" -c "select exists (select 1 from supabase_migrations.schema_migrations where version = '20261129000000')")
if [ "$GATE" = t ]; then
  # Next newest: the member launch gate.
  out=$(psql "$DB_URL" -X -q -v ON_ERROR_STOP=1 -v mode=check -v confirm= -f scripts/db/staging-rollback-photo-audience.sql 2>&1); code=$?
  [ $code -ne 0 ] && grep -q 'later migration' <<<"$out" \
    && ok "the photo audience rollback refuses while the member launch gate is recorded" \
    || bad "the photo audience rollback did not refuse while the member launch gate is recorded (exit $code)"
  if DB_URL="$DB_URL" bash scripts/db/rollback-member-launch-gate-test.sh; then
    ok "the member launch gate: no trigger bypass for postgres or service_role, the founder set only when unambiguous, existing access kept, and its rollback refuses safely and removes exactly its own objects"
  else
    bad "the member launch gate tests failed"
  fi
fi
AUDIENCE=$("${PSQL[@]}" -c "select exists (select 1 from supabase_migrations.schema_migrations where version = '20261128000000')")
if [ "$AUDIENCE" = t ]; then
  # Then the photo audience.
  out=$(psql "$DB_URL" -X -q -v ON_ERROR_STOP=1 -v mode=check -v confirm= -f scripts/db/staging-rollback-post-photos.sql 2>&1); code=$?
  [ $code -ne 0 ] && grep -q 'later migration' <<<"$out" \
    && ok "the photo posts rollback refuses while the photo audience is recorded" \
    || bad "the photo posts rollback did not refuse while the photo audience is recorded (exit $code)"
  if DB_URL="$DB_URL" bash scripts/db/rollback-photo-audience-test.sh; then
    ok "the photo audience rollback refuses while photos are on or an audience change is recorded, and removes exactly its own objects"
  else
    bad "the photo audience rollback tests failed"
  fi
fi
PHOTOS=$("${PSQL[@]}" -c "select exists (select 1 from supabase_migrations.schema_migrations where version = '20261127000000')")
if [ "$PHOTOS" = t ]; then
  # Then photo posts.
  out=$(psql "$DB_URL" -X -q -v ON_ERROR_STOP=1 -v mode=check -v confirm= -f scripts/db/staging-rollback-feedback.sql 2>&1); code=$?
  [ $code -ne 0 ] && grep -q 'later migration' <<<"$out" \
    && ok "the feedback rollback refuses while photo posts are recorded" \
    || bad "the feedback rollback did not refuse while photo posts are recorded (exit $code)"
  if DB_URL="$DB_URL" bash scripts/db/rollback-post-photos-test.sh; then
    ok "the photo posts rollback refuses safely (including once any photo record or file exists) and restores the post readers exactly"
  else
    bad "the photo posts rollback tests failed"
  fi
fi
FEEDBACK=$("${PSQL[@]}" -c "select exists (select 1 from supabase_migrations.schema_migrations where version = '20261126000000')")
if [ "$FEEDBACK" = t ]; then
  # Then feedback.
  out=$(psql "$DB_URL" -X -q -v ON_ERROR_STOP=1 -v mode=check -v confirm= -f scripts/db/staging-rollback-avatars.sql 2>&1); code=$?
  [ $code -ne 0 ] && grep -q 'later migration' <<<"$out" \
    && ok "the profile pictures rollback refuses while feedback is recorded" \
    || bad "the profile pictures rollback did not refuse while feedback is recorded (exit $code)"
  if DB_URL="$DB_URL" bash scripts/db/rollback-feedback-test.sh; then
    ok "the feedback rollback refuses safely (including once any feedback, note or audit entry exists) and removes exactly its own objects"
  else
    bad "the feedback rollback tests failed"
  fi
fi
AVATARS=$("${PSQL[@]}" -c "select exists (select 1 from supabase_migrations.schema_migrations where version = '20261125000000')")
if [ "$AVATARS" = t ]; then
  # Then profile pictures.
  out=$(psql "$DB_URL" -X -q -v ON_ERROR_STOP=1 -v mode=check -v confirm= -f scripts/db/staging-rollback-moderation.sql 2>&1); code=$?
  [ $code -ne 0 ] && grep -q 'later migration' <<<"$out" \
    && ok "the moderation rollback refuses while profile pictures are recorded" \
    || bad "the moderation rollback did not refuse while profile pictures are recorded (exit $code)"
  if DB_URL="$DB_URL" bash scripts/db/rollback-avatars-test.sh; then
    ok "the profile pictures rollback refuses safely (including once any picture record or file exists) and removes exactly its own objects"
  else
    bad "the profile pictures rollback tests failed"
  fi
fi
MODERATION=$("${PSQL[@]}" -c "select exists (select 1 from supabase_migrations.schema_migrations where version = '20261124000000')")
if [ "$MODERATION" = t ]; then
  # Then moderation.
  out=$(psql "$DB_URL" -X -q -v ON_ERROR_STOP=1 -v mode=check -v confirm= -f scripts/db/staging-rollback-profile-details.sql 2>&1); code=$?
  [ $code -ne 0 ] && grep -q 'later migration' <<<"$out" \
    && ok "the profile details rollback refuses while moderation is recorded" \
    || bad "the profile details rollback did not refuse while moderation is recorded (exit $code)"
  if DB_URL="$DB_URL" bash scripts/db/rollback-moderation-test.sh; then
    ok "the moderation rollback refuses safely (including once any report, moderator, action or hidden item exists) and restores exactly the previous state"
  else
    bad "the moderation rollback tests failed"
  fi
fi
DETAILS=$("${PSQL[@]}" -c "select exists (select 1 from supabase_migrations.schema_migrations where version = '20261123000000')")
if [ "$DETAILS" = t ]; then
  # Then profile details.
  out=$(psql "$DB_URL" -X -q -v ON_ERROR_STOP=1 -v mode=check -v confirm= -f scripts/db/staging-rollback-member-access.sql 2>&1); code=$?
  [ $code -ne 0 ] && grep -q 'later migration' <<<"$out" \
    && ok "the pilot membership rollback refuses while profile details are recorded" \
    || bad "the pilot membership rollback did not refuse while profile details are recorded (exit $code)"
  if DB_URL="$DB_URL" bash scripts/db/rollback-profile-details-test.sh; then
    ok "the profile details rollback refuses safely (including once a member has saved details) and removes exactly its own objects"
  else
    bad "the profile details rollback tests failed"
  fi
fi
MEMBER=$("${PSQL[@]}" -c "select exists (select 1 from supabase_migrations.schema_migrations where version = '20261122000000')")
if [ "$MEMBER" = t ]; then
  # Then pilot membership.
  out=$(psql "$DB_URL" -X -q -v ON_ERROR_STOP=1 -v mode=check -v confirm= -f scripts/db/staging-rollback-viewed-state.sql 2>&1); code=$?
  [ $code -ne 0 ] && grep -q 'later migration' <<<"$out" \
    && ok "the viewed state rollback refuses while pilot membership is recorded" \
    || bad "the viewed state rollback did not refuse while pilot membership is recorded (exit $code)"
  if DB_URL="$DB_URL" bash scripts/db/rollback-member-access-test.sh; then
    ok "the pilot membership rollback refuses safely (including once membership or its history exists) and restores exactly the previous state"
  else
    bad "the pilot membership rollback tests failed"
  fi
fi
VIEWED=$("${PSQL[@]}" -c "select exists (select 1 from supabase_migrations.schema_migrations where version = '20261121000000')")
if [ "$VIEWED" = t ]; then
  # Then viewed state.
  out=$(psql "$DB_URL" -X -q -v ON_ERROR_STOP=1 -v mode=check -v confirm= -f scripts/db/staging-rollback-inner-clique.sql 2>&1); code=$?
  [ $code -ne 0 ] && grep -q 'later migration' <<<"$out" \
    && ok "the Inner Clique rollback refuses while viewed state is recorded" \
    || bad "the Inner Clique rollback did not refuse while viewed state is recorded (exit $code)"
  if DB_URL="$DB_URL" bash scripts/db/rollback-viewed-state-test.sh; then
    ok "the viewed state rollback refuses safely (including once views exist) and removes exactly its own objects"
  else
    bad "the viewed state rollback tests failed"
  fi
fi
INNER=$("${PSQL[@]}" -c "select exists (select 1 from supabase_migrations.schema_migrations where version = '20261120000000')")
if [ "$INNER" = t ]; then
  # Then the Inner Clique.
  out=$(psql "$DB_URL" -X -q -v ON_ERROR_STOP=1 -v mode=check -v confirm= -f scripts/db/staging-rollback-publishing-requests.sql 2>&1); code=$?
  [ $code -ne 0 ] && grep -q 'later migration' <<<"$out" \
    && ok "the publishing request ids rollback refuses while the Inner Clique is recorded" \
    || bad "the publishing request ids rollback did not refuse while the Inner Clique is recorded (exit $code)"
  if DB_URL="$DB_URL" bash scripts/db/rollback-inner-clique-test.sh; then
    ok "the Inner Clique rollback refuses safely and restores exactly the earlier definitions"
  else
    bad "the Inner Clique rollback tests failed"
  fi
fi
REQUESTS=$("${PSQL[@]}" -c "select exists (select 1 from supabase_migrations.schema_migrations where version = '20261119000000')")
if [ "$REQUESTS" = t ]; then
  # Then publishing request ids.
  out=$(psql "$DB_URL" -X -q -v ON_ERROR_STOP=1 -v mode=check -v confirm= -f scripts/db/staging-rollback-platform-access.sql 2>&1); code=$?
  [ $code -ne 0 ] && grep -q 'later migration' <<<"$out" \
    && ok "the platform function access rollback refuses while publishing request ids is recorded" \
    || bad "the platform function access rollback did not refuse while publishing request ids is recorded (exit $code)"
  if DB_URL="$DB_URL" bash scripts/db/rollback-publishing-requests-test.sh; then
    ok "the publishing request ids rollback refuses safely and removes exactly its own objects"
  else
    bad "the publishing request ids rollback tests failed"
  fi
fi
PLATFORM=$("${PSQL[@]}" -c "select exists (select 1 from supabase_migrations.schema_migrations where version = '20261118000000')")
SOCIAL_APPLIED=$("${PSQL[@]}" -c "select exists (select 1 from supabase_migrations.schema_migrations where version = '20261117000000')")
if [ "$PLATFORM" = t ]; then
  out=$(psql "$DB_URL" -X -q -v ON_ERROR_STOP=1 -v mode=check -v confirm= -f scripts/db/staging-rollback-social.sql 2>&1); code=$?
  [ $code -ne 0 ] && grep -q 'later migration' <<<"$out" \
    && ok "the social core rollback refuses while platform function access is recorded" \
    || bad "the social core rollback did not refuse while platform function access is recorded (exit $code)"
  if DB_URL="$DB_URL" bash scripts/db/rollback-platform-access-test.sh; then
    ok "the platform function access rollback refuses safely and removes only its record"
  else
    bad "the platform function access rollback tests failed"
  fi
fi
ACQ=$("${PSQL[@]}" -c "select count(*) from supabase_migrations.schema_migrations where version = '20261116000000'")
if [ "$SOCIAL_APPLIED" = t ]; then
  refuses "the social core migration is still recorded (it must be removed first)" "later migration" "select 1" "select 1"
  if [ "$ACQ" = 1 ]; then
    out=$(psql "$DB_URL" -X -q -v ON_ERROR_STOP=1 -v mode=check -v confirm= -f scripts/db/staging-rollback-acquisition.sql 2>&1); code=$?
    [ $code -ne 0 ] && grep -q 'later migration' <<<"$out" \
      && ok "the acquisition rollback refuses while the social core is recorded" \
      || bad "the acquisition rollback did not refuse while the social core is recorded (exit $code)"
  fi
  if DB_URL="$DB_URL" bash scripts/db/rollback-social-test.sh; then
    ok "the social core rollback refuses safely and removes exactly its own objects"
  else
    bad "the social core rollback tests failed"
  fi
fi
if [ "$ACQ" = 1 ]; then
  if DB_URL="$DB_URL" bash scripts/db/rollback-acquisition-test.sh; then
    ok "the creator acquisition rollback refuses safely and removes exactly its own objects"
  else
    bad "the creator acquisition rollback tests failed"
  fi
fi

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
if [ "$AUDIENCE" = t ] || [ "$PHOTOS" = t ] || [ "$FEEDBACK" = t ] || [ "$AVATARS" = t ] || [ "$MODERATION" = t ] || [ "$DETAILS" = t ] || [ "$MEMBER" = t ] || [ "$VIEWED" = t ] || [ "$INNER" = t ] || [ "$REQUESTS" = t ] || [ "$PLATFORM" = t ] || [ "$SOCIAL_APPLIED" = t ] || [ "$ACQ" = 1 ]; then
  # Everything is back: the waitlist rollback must refuse until the later ones are removed.
  out=$(rollback check ""); code=$?
  [ $code -ne 0 ] && grep -q 'later migration' <<<"$out" \
    && ok "after reapplying, the waitlist rollback refuses while a later migration is recorded" \
    || bad "the waitlist rollback did not refuse while a later migration is recorded (exit $code)"
  if [ "$GATE" = t ]; then
    # The gate is back, closed as the migration leaves it; reopened (recorded) for the local tests, its own rollback check passes.
    DB_URL="$DB_URL" scripts/db/local-open-launch-gate.sh >/dev/null || bad "could not reopen the launch gate"
    out=$(psql "$DB_URL" -X -q -v ON_ERROR_STOP=1 -v mode=check -v confirm= -f scripts/db/staging-rollback-member-launch-gate.sql 2>&1); code=$?
    if [ "$FOUNDATION" = t ]; then
      [ $code -ne 0 ] && grep -q 'later migration' <<<"$out" \
        && ok "after reapplying, the member launch gate rollback refuses while foundation v2 is recorded" \
        || bad "the member launch gate rollback did not refuse after reapply while foundation v2 is recorded (exit $code)"
      out=$(psql "$DB_URL" -X -q -v ON_ERROR_STOP=1 -v mode=check -v confirm= -f scripts/db/staging-rollback-foundation-v2.sql 2>&1); code=$?
      if [ "$RELATIONSHIPS" = t ]; then
        [ $code -ne 0 ] && grep -q 'later migration' <<<"$out" \
          && ok "after reapplying, the foundation v2 rollback refuses while relationships is recorded" \
          || bad "the foundation v2 rollback did not refuse after reapply while relationships is recorded (exit $code)"
        out=$(psql "$DB_URL" -X -q -v ON_ERROR_STOP=1 -v mode=check -v confirm= -f scripts/db/staging-rollback-relationships.sql 2>&1); code=$?
        if [ "$CONTENT" = t ]; then
          [ $code -ne 0 ] && grep -q 'later migration' <<<"$out" \
            && ok "after reapplying, the relationships rollback refuses while content is recorded" \
            || bad "the relationships rollback did not refuse after reapply while content is recorded (exit $code)"
          out=$(psql "$DB_URL" -X -q -v ON_ERROR_STOP=1 -v mode=check -v confirm= -f scripts/db/staging-rollback-content.sql 2>&1); code=$?
          [ $code -eq 0 ] && grep -q 'Check only' <<<"$out" \
            && ok "after reapplying, the content rollback check passes again" \
            || bad "content rollback check after reapply (exit $code): $(tail -2 <<<"$out" | tr '\n' ' ')"
        else
          [ $code -eq 0 ] && grep -q 'Check only' <<<"$out" \
            && ok "after reapplying, the relationships rollback check passes again" \
            || bad "relationships rollback check after reapply (exit $code): $(tail -2 <<<"$out" | tr '\n' ' ')"
        fi
      else
        [ $code -eq 0 ] && grep -q 'Check only' <<<"$out" \
          && ok "after reapplying, the foundation v2 rollback check passes again" \
          || bad "foundation v2 rollback check after reapply (exit $code): $(tail -2 <<<"$out" | tr '\n' ' ')"
      fi
    else
      [ $code -eq 0 ] && grep -q 'Check only' <<<"$out" \
        && ok "after reapplying, the member launch gate rollback check passes again" \
        || bad "member launch gate rollback check after reapply (exit $code): $(tail -2 <<<"$out" | tr '\n' ' ')"
    fi
  fi
  if [ "$AUDIENCE" = t ]; then
    out=$(psql "$DB_URL" -X -q -v ON_ERROR_STOP=1 -v mode=check -v confirm= -f scripts/db/staging-rollback-photo-audience.sql 2>&1); code=$?
    if [ "$GATE" = t ]; then
      [ $code -ne 0 ] && grep -q 'later migration' <<<"$out" \
        && ok "after reapplying, the photo audience rollback refuses while the member launch gate is recorded" \
        || bad "the photo audience rollback did not refuse after reapply while the gate is recorded (exit $code)"
    else
    [ $code -eq 0 ] && grep -q 'Check only' <<<"$out" \
      && ok "after reapplying, the photo audience rollback check passes again" \
      || bad "photo audience rollback check after reapply (exit $code): $(tail -2 <<<"$out" | tr '\n' ' ')"
    fi
  fi
  if [ "$PHOTOS" = t ]; then
    out=$(psql "$DB_URL" -X -q -v ON_ERROR_STOP=1 -v mode=check -v confirm= -f scripts/db/staging-rollback-post-photos.sql 2>&1); code=$?
    if [ "$AUDIENCE" = t ]; then
      [ $code -ne 0 ] && grep -q 'later migration' <<<"$out" \
        && ok "after reapplying, the photo posts rollback refuses while the photo audience is recorded" \
        || bad "the photo posts rollback did not refuse after reapply while the photo audience is recorded (exit $code)"
    else
    [ $code -eq 0 ] && grep -q 'Check only' <<<"$out" \
      && ok "after reapplying, the photo posts rollback check passes again" \
      || bad "photo posts rollback check after reapply (exit $code): $(tail -2 <<<"$out" | tr '\n' ' ')"
    fi
  fi
  if [ "$FEEDBACK" = t ]; then
    out=$(psql "$DB_URL" -X -q -v ON_ERROR_STOP=1 -v mode=check -v confirm= -f scripts/db/staging-rollback-feedback.sql 2>&1); code=$?
    if [ "$PHOTOS" = t ]; then
      [ $code -ne 0 ] && grep -q 'later migration' <<<"$out" \
        && ok "after reapplying, the feedback rollback refuses while photo posts are recorded" \
        || bad "the feedback rollback did not refuse after reapply while photo posts are recorded (exit $code)"
    else
    [ $code -eq 0 ] && grep -q 'Check only' <<<"$out" \
      && ok "after reapplying, the feedback rollback check passes again" \
      || bad "feedback rollback check after reapply (exit $code): $(tail -2 <<<"$out" | tr '\n' ' ')"
    fi
  fi
  if [ "$AVATARS" = t ]; then
    out=$(psql "$DB_URL" -X -q -v ON_ERROR_STOP=1 -v mode=check -v confirm= -f scripts/db/staging-rollback-avatars.sql 2>&1); code=$?
    if [ "$FEEDBACK" = t ]; then
      [ $code -ne 0 ] && grep -q 'later migration' <<<"$out" \
        && ok "after reapplying, the profile pictures rollback refuses while feedback is recorded" \
        || bad "the profile pictures rollback did not refuse after reapply while feedback is recorded (exit $code)"
    else
    [ $code -eq 0 ] && grep -q 'Check only' <<<"$out" \
      && ok "after reapplying, the profile pictures rollback check passes again" \
      || bad "profile pictures rollback check after reapply (exit $code): $(tail -2 <<<"$out" | tr '\n' ' ')"
    fi
  fi
  if [ "$MODERATION" = t ]; then
    out=$(psql "$DB_URL" -X -q -v ON_ERROR_STOP=1 -v mode=check -v confirm= -f scripts/db/staging-rollback-moderation.sql 2>&1); code=$?
    if [ "$AVATARS" = t ]; then
      [ $code -ne 0 ] && grep -q 'later migration' <<<"$out" \
        && ok "after reapplying, the moderation rollback refuses while profile pictures are recorded" \
        || bad "the moderation rollback did not refuse after reapply while profile pictures are recorded (exit $code)"
    else
    [ $code -eq 0 ] && grep -q 'Check only' <<<"$out" \
      && ok "after reapplying, the moderation rollback check passes again" \
      || bad "moderation rollback check after reapply (exit $code): $(tail -2 <<<"$out" | tr '\n' ' ')"
    fi
  fi
  if [ "$DETAILS" = t ]; then
    out=$(psql "$DB_URL" -X -q -v ON_ERROR_STOP=1 -v mode=check -v confirm= -f scripts/db/staging-rollback-profile-details.sql 2>&1); code=$?
    if [ "$MODERATION" = t ]; then
      [ $code -ne 0 ] && grep -q 'later migration' <<<"$out" \
        && ok "after reapplying, the profile details rollback refuses while moderation is recorded" \
        || bad "the profile details rollback did not refuse after reapply while moderation is recorded (exit $code)"
    else
    [ $code -eq 0 ] && grep -q 'Check only' <<<"$out" \
      && ok "after reapplying, the profile details rollback check passes again" \
      || bad "profile details rollback check after reapply (exit $code): $(tail -2 <<<"$out" | tr '\n' ' ')"
    fi
  fi
  if [ "$MEMBER" = t ]; then
    out=$(psql "$DB_URL" -X -q -v ON_ERROR_STOP=1 -v mode=check -v confirm= -f scripts/db/staging-rollback-member-access.sql 2>&1); code=$?
    if [ "$DETAILS" = t ]; then
      [ $code -ne 0 ] && grep -q 'later migration' <<<"$out" \
        && ok "after reapplying, the pilot membership rollback refuses while profile details are recorded" \
        || bad "the pilot membership rollback did not refuse after reapply while profile details are recorded (exit $code)"
    else
    [ $code -eq 0 ] && grep -q 'Check only' <<<"$out" \
      && ok "after reapplying, the pilot membership rollback check passes again" \
      || bad "pilot membership rollback check after reapply (exit $code): $(tail -2 <<<"$out" | tr '\n' ' ')"
    fi
  fi
  if [ "$VIEWED" = t ]; then
    out=$(psql "$DB_URL" -X -q -v ON_ERROR_STOP=1 -v mode=check -v confirm= -f scripts/db/staging-rollback-viewed-state.sql 2>&1); code=$?
    if [ "$MEMBER" = t ]; then
      [ $code -ne 0 ] && grep -q 'later migration' <<<"$out" \
        && ok "after reapplying, the viewed state rollback refuses while pilot membership is recorded" \
        || bad "the viewed state rollback did not refuse after reapply while pilot membership is recorded (exit $code)"
    else
    [ $code -eq 0 ] && grep -q 'Check only' <<<"$out" \
      && ok "after reapplying, the viewed state rollback check passes again" \
      || bad "viewed state rollback check after reapply (exit $code): $(tail -2 <<<"$out" | tr '\n' ' ')"
    fi
  fi
  if [ "$INNER" = t ]; then
    out=$(psql "$DB_URL" -X -q -v ON_ERROR_STOP=1 -v mode=check -v confirm= -f scripts/db/staging-rollback-inner-clique.sql 2>&1); code=$?
    if [ "$VIEWED" = t ]; then
      [ $code -ne 0 ] && grep -q 'later migration' <<<"$out" \
        && ok "after reapplying, the Inner Clique rollback refuses while viewed state is recorded" \
        || bad "the Inner Clique rollback did not refuse after reapply while viewed state is recorded (exit $code)"
    else
    [ $code -eq 0 ] && grep -q 'Check only' <<<"$out" \
      && ok "after reapplying, the Inner Clique rollback check passes again" \
      || bad "Inner Clique rollback check after reapply (exit $code): $(tail -2 <<<"$out" | tr '\n' ' ')"
    fi
    # Relationships (20261201000000) removes the limit again once it is reapplied.
    [ "$("${PSQL[@]}" -c "select prosrc ~ '>= 25' from pg_proc where oid = 'social.clique_members_guard()'::regprocedure")" = "$([ "$RELATIONSHIPS" = t ] && echo f || echo t)" ] \
      && ok "after reapplying, the Clique guard is as the newest migration defines it" || bad "after reapplying, the Clique guard is not as the newest migration defines it"
  fi
  if [ "$REQUESTS" = t ]; then
    out=$(psql "$DB_URL" -X -q -v ON_ERROR_STOP=1 -v mode=check -v confirm= -f scripts/db/staging-rollback-publishing-requests.sql 2>&1); code=$?
    if [ "$INNER" = t ]; then
      [ $code -ne 0 ] && grep -q 'later migration' <<<"$out" \
        && ok "after reapplying, the publishing request ids rollback refuses while the Inner Clique is recorded" \
        || bad "the publishing request ids rollback did not refuse after reapply while the Inner Clique is recorded (exit $code)"
    else
      [ $code -eq 0 ] && grep -q 'Check only' <<<"$out" \
        && ok "after reapplying, the publishing request ids rollback check passes again" \
        || bad "publishing request ids rollback check after reapply (exit $code): $(tail -2 <<<"$out" | tr '\n' ' ')"
    fi
  fi
  if [ "$PLATFORM" = t ]; then
    out=$(psql "$DB_URL" -X -q -v ON_ERROR_STOP=1 -v mode=check -v confirm= -f scripts/db/staging-rollback-platform-access.sql 2>&1); code=$?
    if [ "$REQUESTS" = t ]; then
      [ $code -ne 0 ] && grep -q 'later migration' <<<"$out" \
        && ok "after reapplying, the platform function access rollback refuses while publishing request ids is recorded" \
        || bad "the platform function access rollback did not refuse after reapply while publishing request ids is recorded (exit $code)"
    else
      [ $code -eq 0 ] && grep -q 'Check only' <<<"$out" \
        && ok "after reapplying, the platform function access rollback check passes again" \
        || bad "platform function access rollback check after reapply (exit $code): $(tail -2 <<<"$out" | tr '\n' ' ')"
    fi
  fi
  if [ "$SOCIAL_APPLIED" = t ]; then
    out=$(psql "$DB_URL" -X -q -v ON_ERROR_STOP=1 -v mode=check -v confirm= -f scripts/db/staging-rollback-social.sql 2>&1); code=$?
    if [ "$PLATFORM" = t ]; then
      # With relationships recorded, app_follow(uuid) has a second argument, so the
      # social core rollback refuses even earlier: its inventory no longer matches.
      [ $code -ne 0 ] && grep -Eq "later migration$([ "$RELATIONSHIPS" = t ] && echo '|expected objects are missing')" <<<"$out" \
        && ok "after reapplying, the social core rollback refuses while platform function access is recorded" \
        || bad "the social core rollback did not refuse after reapply while platform function access is recorded (exit $code)"
    else
      [ $code -eq 0 ] && grep -q 'Check only' <<<"$out" \
        && ok "after reapplying, the social core rollback check passes again" \
        || bad "social core rollback check after reapply (exit $code): $(tail -2 <<<"$out" | tr '\n' ' ')"
    fi
  fi
  if [ "$ACQ" = 1 ]; then
    out=$(psql "$DB_URL" -X -q -v ON_ERROR_STOP=1 -v mode=check -v confirm= -f scripts/db/staging-rollback-acquisition.sql 2>&1); code=$?
    if [ "$SOCIAL_APPLIED" = t ]; then
      [ $code -ne 0 ] && grep -q 'later migration' <<<"$out" \
        && ok "after reapplying, the acquisition rollback refuses while the social core is recorded" \
        || bad "the acquisition rollback did not refuse after reapply while the social core is recorded (exit $code)"
    else
      [ $code -eq 0 ] && grep -q 'Check only' <<<"$out" \
        && ok "after reapplying, the acquisition rollback check passes again" \
        || bad "acquisition check after reapply (exit $code): $(tail -2 <<<"$out" | tr '\n' ' ')"
    fi
  fi
else
  out=$(rollback check ""); code=$?
  [ $code -eq 0 ] && ok "after reapplying, a new check run passes again" || bad "check after reapply (exit $code): $(tail -2 <<<"$out" | tr '\n' ' ')"
fi

# Everything is reapplied, so the launch gate is closed again: reopen it (recorded) for the suites that follow.
DB_URL="$DB_URL" scripts/db/local-open-launch-gate.sh >/dev/null || bad "could not reopen the launch gate for the next suites"
echo "Rollback tests: $pass passed, $failed failed"
[ $failed -eq 0 ]
