#!/usr/bin/env bash
# Tests scripts/db/staging-rollback-avatars.sql against a LOCAL
# Supabase database. Local only: it refuses any other database. Called by
# scripts/db/rollback-test.sh first, because 20261125000000 is the newest
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
SQL=scripts/db/staging-rollback-avatars.sql
PHRASE='REMOVE THE STAGING AVATARS'
PSQL=(psql "$DB_URL" -X -q -At -v ON_ERROR_STOP=1)
pass=0; failed=0
ok()  { echo "PASS  avatars rollback: $1"; pass=$((pass + 1)); }
bad() { echo "FAIL  avatars rollback: $1"; failed=$((failed + 1)); }
rollback() { psql "$DB_URL" -X -q -v ON_ERROR_STOP=1 -v mode="$1" -v confirm="$2" -f "$SQL" 2>&1; }
state() {
  "${PSQL[@]}" -c "select concat_ws('|', (select string_agg(version, ',' order by version) from supabase_migrations.schema_migrations),
    to_regclass('social.avatars') is not null, to_regclass('social.avatar_uploads') is not null, to_regclass('ops.storage_cleanup_plans') is not null,
    (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname like 'app\_%'),
    case when to_regclass('social.avatars') is null then -1 else (select count(*) from social.avatars) end,
    (select count(*) from storage.buckets where id = 'avatars'), (select count(*) from storage.objects where bucket_id = 'avatars'),
    (select count(*) from ops.moderation_actions),
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
if [ "$("${PSQL[@]}" -c "select (select count(*) from social.avatars) + (select count(*) from social.avatar_uploads) + (select count(*) from social.avatar_events) + (select count(*) from storage.objects where bucket_id = 'avatars')")" != 0 ]; then
  echo "FAIL  avatars rollback: picture records already exist in this database; this test needs none (see the CI job order)" >&2
  exit 1
fi

# 1. Refusals.
refuses "a later migration is recorded" "later migration" \
  "insert into supabase_migrations.schema_migrations (version, name) values ('20991231000000', 'later')" "delete from supabase_migrations.schema_migrations where version = '20991231000000'"
refuses "the migration record is missing" "missing" \
  "delete from supabase_migrations.schema_migrations where version = '20261125000000'" "insert into supabase_migrations.schema_migrations (version, name) values ('20261125000000', 'avatars')"
U=00000000-0000-4000-8000-0000000009f7
SETUP_USER="insert into auth.users (id, email, email_confirmed_at) values ('$U', 'rb-avatars@example.test', now()) on conflict do nothing"
TEARDOWN_USER="delete from auth.users where id = '$U'"
refuses "an authorised upload exists" "picture record" \
  "$SETUP_USER; insert into social.avatar_uploads (path, user_id) values ('$U/00000000-0000-4000-8000-000000000001.jpg', '$U')" "$TEARDOWN_USER"
refuses "an orphan is recorded" "picture record" \
  "insert into ops.storage_orphans (path, reason) values ('$U/00000000-0000-4000-8000-000000000002.jpg', 'test')" "delete from ops.storage_orphans"
# Real Storage: a file in the bucket (inserted as the storage service would
# record it; the teardown removes it with the explicit allow-delete setting).
refuses "a file exists in the avatars bucket" "file(s) in the avatars bucket" \
  "insert into storage.objects (bucket_id, name) values ('avatars', '$U/00000000-0000-4000-8000-000000000003.jpg')" \
  "set storage.allow_delete_query = 'true'; delete from storage.objects where bucket_id = 'avatars'; reset storage.allow_delete_query"
refuses "a storage cleanup was recorded" "storage cleanup action" \
  "insert into ops.moderation_actions (actor_label, action) values ('rollback-test', 'storage_cleanup')" \
  "alter table ops.moderation_actions disable trigger moderation_actions_no_update; delete from ops.moderation_actions where action like 'storage%'; alter table ops.moderation_actions enable trigger moderation_actions_no_update"
refuses "the mode is neither check nor apply" "mode must be check or apply" "select 1" "select 1" wipe "$PHRASE"
refuses "apply without the confirmation phrase" "confirmation phrase" "select 1" "select 1" apply ""
refuses "apply with a different phrase" "confirmation phrase" "select 1" "select 1" apply "remove the staging avatars"
out=$(psql "$DB_URL" -X -q -v ON_ERROR_STOP=1 -f "$SQL" 2>&1); code=$?
[ $code -ne 0 ] && grep -q 'syntax error' <<<"$out" && ok "refuses to run with no mode given" || bad "ran with no mode (exit $code)"

# 2. A check run succeeds and changes nothing.
before=$(state)
out=$(rollback check ""); code=$?
[ $code -eq 0 ] && grep -q 'Check only' <<<"$out" && [ "$(state)" = "$before" ] \
  && ok "check mode passes and changes nothing" || bad "check mode (exit $code): $(tail -3 <<<"$out" | tr '\n' ' ')"

# 3. Apply removes exactly the migration's objects, the empty bucket and the record.
counts_before=$("${PSQL[@]}" -c "select (select count(*) from social.posts) || '|' || (select count(*) from public.profiles) || '|' || (select count(*) from auth.users) || '|' || (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname like 'app\_%')")
out=$(rollback apply "$PHRASE"); code=$?
after=$("${PSQL[@]}" -c "select concat_ws('|',
  not exists (select 1 from supabase_migrations.schema_migrations where version = '20261125000000'),
  exists (select 1 from supabase_migrations.schema_migrations where version = '20261124000000'),
  to_regclass('social.avatars') is null, to_regclass('social.avatar_uploads') is null, to_regclass('ops.storage_cleanup_plans') is null,
  to_regprocedure('public.svc_avatar_commit(text)') is null, to_regprocedure('public.app_avatars(uuid[])') is null,
  not exists (select 1 from storage.buckets where id = 'avatars'),
  pg_get_constraintdef((select oid from pg_constraint where conname = 'moderation_actions_action_check')) !~ 'storage',
  to_regclass('ops.content_reports') is not null, to_regclass('social.profile_details') is not null)")
counts_after=$("${PSQL[@]}" -c "select (select count(*) from social.posts) || '|' || (select count(*) from public.profiles) || '|' || (select count(*) from auth.users) || '|' || ((select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname like 'app\_%') + 6)")
[ $code -eq 0 ] && grep -q 'Applied' <<<"$out" && [ "$after" = "t|t|t|t|t|t|t|t|t|t|t" ] && [ "$counts_after" = "$counts_before" ] \
  && ok "apply removes exactly the picture objects, the empty bucket and the record, and keeps every account, post and earlier function" \
  || bad "apply (exit $code, state $after, counts $counts_before -> $counts_after)"

# 4. A second run refuses.
out=$(rollback check ""); code=$?
[ $code -ne 0 ] && grep -q 'missing' <<<"$out" && ok "a second run refuses (nothing left to remove)" || bad "a second run did not refuse (exit $code)"

echo "Avatars rollback tests: $pass passed, $failed failed"
[ $failed -eq 0 ]
