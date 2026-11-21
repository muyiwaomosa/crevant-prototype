#!/usr/bin/env bash
# Tests scripts/db/staging-rollback-photo-audience.sql against a LOCAL Supabase
# database. Local only: it refuses any other database. Called by
# scripts/db/rollback-test.sh first, because 20261128000000 is the newest
# migration and every earlier rollback refuses while it is recorded.
#
#   1. Every refusal: a later migration, a missing record, photos switched
#      on (the restored switch would open posting to every member), a recorded
#      audience change, a bad or missing mode, a missing or wrong
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
SQL=scripts/db/staging-rollback-photo-audience.sql
PHRASE='REMOVE THE STAGING PHOTO AUDIENCE'
PSQL=(psql "$DB_URL" -X -q -At -v ON_ERROR_STOP=1)
pass=0; failed=0
ok()  { echo "PASS  photo audience rollback: $1"; pass=$((pass + 1)); }
bad() { echo "FAIL  photo audience rollback: $1"; failed=$((failed + 1)); }
rollback() { psql "$DB_URL" -X -q -v ON_ERROR_STOP=1 -v mode="$1" -v confirm="$2" -f "$SQL" 2>&1; }
state() {
  "${PSQL[@]}" -c "select concat_ws('|', (select string_agg(version, ',' order by version) from supabase_migrations.schema_migrations),
    to_regprocedure('ops.set_photo_audience(text, text, text)') is not null,
    (select photos_enabled::text from ops.media_settings),
    (select count(*) from information_schema.columns where table_schema = 'ops' and table_name = 'media_settings' and column_name = 'photos_audience'),
    (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname like 'app\_%'),
    (select count(*) from ops.media_admin_events),
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
if [ "$("${PSQL[@]}" -c "select (select count(*) from ops.media_admin_events where action = 'audience_changed')::text || (select photos_enabled::text from ops.media_settings)")" != 0false ]; then
  echo "FAIL  photo audience rollback: this test needs photos off and no recorded audience change (see the CI job order)" >&2
  exit 1
fi

# 1. Refusals.
refuses "a later migration is recorded" "later migration" \
  "insert into supabase_migrations.schema_migrations (version, name) values ('20991231000000', 'later')" "delete from supabase_migrations.schema_migrations where version = '20991231000000'"
refuses "the migration record is missing" "missing" \
  "delete from supabase_migrations.schema_migrations where version = '20261128000000'" "insert into supabase_migrations.schema_migrations (version, name) values ('20261128000000', 'photo_audience')"
# Turning photos on needs the processing checks: recorded here (TEST ONLY), and lifted afterwards.
refuses "photos are switched on (the restored switch would open posting to every member)" "Turn photos off first" \
  "select public.svc_photo_check_record('rollback-test', 100, true, null) from generate_series(1, 6); select ops.set_media_settings('rollback-test', true, 1000000000, 10, 20)" \
  "select ops.set_media_settings('rollback-test', false, 1000000000, 10, 20); alter table ops.media_admin_events disable trigger media_admin_events_no_update; delete from ops.media_admin_events; alter table ops.media_admin_events enable trigger media_admin_events_no_update; update ops.media_settings set photo_storage_cap_bytes = null, egress_review_gb = null, egress_pause_gb = null"
refuses "an audience change was recorded (an audit record: fix forward)" "audience change is recorded" \
  "select ops.set_photo_audience('rollback-test', 'members', 'OPEN PHOTO POSTING TO ALL MEMBERS')" \
  "update ops.media_settings set photos_audience = 'founder'; alter table ops.media_admin_events disable trigger media_admin_events_no_update; delete from ops.media_admin_events; alter table ops.media_admin_events enable trigger media_admin_events_no_update"
refuses "the mode is neither check nor apply" "mode must be check or apply" "select 1" "select 1" wipe "$PHRASE"
refuses "apply without the confirmation phrase" "confirmation phrase" "select 1" "select 1" apply ""
refuses "apply with a different phrase" "confirmation phrase" "select 1" "select 1" apply "remove the staging photo audience"
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
  not exists (select 1 from supabase_migrations.schema_migrations where version = '20261128000000'),
  exists (select 1 from supabase_migrations.schema_migrations where version = '20261127000000'),
  to_regprocedure('ops.set_photo_audience(text, text, text)') is null,
  not exists (select 1 from information_schema.columns where table_schema = 'ops' and table_name = 'media_settings' and column_name = 'photos_audience'),
  position('photos_audience' in (select prosrc from pg_proc where oid = 'ops.photos_open()'::regprocedure)) = 0,
  (select photos_enabled from ops.media_settings) is false,
  to_regclass('social.post_media') is not null, to_regclass('ops.feedback') is not null)")
counts_after=$("${PSQL[@]}" -c "select (select count(*) from social.posts) || '|' || (select count(*) from public.profiles) || '|' || (select count(*) from auth.users) || '|' || ((select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname like 'app\_%') + 0)")
[ $code -eq 0 ] && grep -q 'Applied' <<<"$out" && [ "$after" = "t|t|t|t|t|t|t|t" ] && [ "$counts_after" = "$counts_before" ] \
  && ok "apply restores the photo switch, removes exactly the audience objects and record, leaves photos off, and keeps every account, post, photo and earlier function" \
  || bad "apply (exit $code, state $after, counts $counts_before -> $counts_after)"

# 4. A second run refuses.
out=$(rollback check ""); code=$?
[ $code -ne 0 ] && grep -q 'missing' <<<"$out" && ok "a second run refuses (nothing left to remove)" || bad "a second run did not refuse (exit $code)"

echo "Photo audience rollback tests: $pass passed, $failed failed"
[ $failed -eq 0 ]
