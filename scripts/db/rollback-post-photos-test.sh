#!/usr/bin/env bash
# Tests scripts/db/staging-rollback-post-photos.sql against a LOCAL Supabase
# database. Local only: it refuses any other database. Called by
# scripts/db/rollback-test.sh first, because 20261127000000 is the newest
# migration and every earlier rollback refuses while it is recorded.
#
#   1. Every refusal: a later migration, a missing record, any upload, any
#      photo post, any queued deletion, any settings change or processing
#      check, any file in post-photos, a bad or missing mode, a missing or
#      wrong confirmation. Each must refuse and change nothing.
#   2. mode=check succeeds and changes nothing.
#   3. mode=apply restores the post readers, app_report and the text rule
#      exactly, removes the migration's objects and record, and keeps
#      everything from the earlier migrations (avatars included).
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
SQL=scripts/db/staging-rollback-post-photos.sql
PHRASE='REMOVE THE STAGING PHOTO POSTS'
PSQL=(psql "$DB_URL" -X -q -At -v ON_ERROR_STOP=1)
pass=0; failed=0
ok()  { echo "PASS  photo posts rollback: $1"; pass=$((pass + 1)); }
bad() { echo "FAIL  photo posts rollback: $1"; failed=$((failed + 1)); }
rollback() { psql "$DB_URL" -X -q -v ON_ERROR_STOP=1 -v mode="$1" -v confirm="$2" -f "$SQL" 2>&1; }
state() {
  "${PSQL[@]}" -c "select concat_ws('|', (select string_agg(version, ',' order by version) from supabase_migrations.schema_migrations),
    to_regclass('social.post_media') is not null, to_regclass('social.media_uploads') is not null, to_regclass('ops.media_deletions') is not null,
    (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname like 'app\_%'),
    case when to_regclass('social.media_uploads') is null then -1 else (select count(*) from social.media_uploads) end,
    case when to_regclass('ops.media_admin_events') is null then -1 else (select count(*) from ops.media_admin_events) end,
    (select count(*) from storage.objects where bucket_id = 'post-photos'),
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
if [ "$("${PSQL[@]}" -c "select (select count(*) from social.media_uploads) + (select count(*) from ops.media_deletions) + (select count(*) from ops.media_admin_events) + (select count(*) from social.posts where media_kind is not null)")" != 0 ]; then
  echo "FAIL  photo posts rollback: photo records already exist in this database; this test needs none (see the CI job order)" >&2
  exit 1
fi

# 1. Refusals.
refuses "a later migration is recorded" "later migration" \
  "insert into supabase_migrations.schema_migrations (version, name) values ('20991231000000', 'later')" "delete from supabase_migrations.schema_migrations where version = '20991231000000'"
refuses "the migration record is missing" "missing" \
  "delete from supabase_migrations.schema_migrations where version = '20261127000000'" "insert into supabase_migrations.schema_migrations (version, name) values ('20261127000000', 'post_photos')"
U=00000000-0000-4000-8000-0000000009d1
UP=00000000-0000-4000-8000-0000000009d2
SETUP_USER="insert into auth.users (id, email, email_confirmed_at) values ('$U', 'rb-photos@example.test', now()) on conflict do nothing"
TEARDOWN_USER="delete from social.media_uploads where user_id = '$U'; delete from ops.media_deletions; delete from auth.users where id = '$U'"
refuses "an upload exists (fix forward)" "upload or photo record" \
  "$SETUP_USER; insert into social.media_uploads (id, user_id, kind, full_path, feed_path) values ('$UP', '$U', 'photo', '$U/$UP.jpg', '$U/$UP-feed.jpg')" "$TEARDOWN_USER"
refuses "a photo post exists" "photo post" \
  "$SETUP_USER; insert into social.posts (author_id, body, media_kind) values ('$U', '', 'photo')" "$TEARDOWN_USER"
refuses "a deletion is queued" "queued deletion" \
  "select ops.queue_media_deletion('post-photos', '$U/$UP.jpg', 'test')" "delete from ops.media_deletions"
refuses "a file is in post-photos" "file(s) in post-photos" \
  "insert into storage.objects (bucket_id, name) values ('post-photos', '$U/$UP.jpg')" "set storage.allow_delete_query = 'true'; delete from storage.objects where bucket_id = 'post-photos'"
# The settings record is append-only: the teardown (TEST ONLY, local database)
# lifts that guard to clean up after itself.
refuses "a processing check was recorded" "processing check" \
  "select public.svc_photo_check_record('rollback-test', 100, true, null)" \
  "alter table ops.media_admin_events disable trigger media_admin_events_no_update; delete from ops.media_admin_events; alter table ops.media_admin_events enable trigger media_admin_events_no_update"
refuses "the mode is neither check nor apply" "mode must be check or apply" "select 1" "select 1" wipe "$PHRASE"
refuses "apply without the confirmation phrase" "confirmation phrase" "select 1" "select 1" apply ""
refuses "apply with a different phrase" "confirmation phrase" "select 1" "select 1" apply "remove the staging photo posts"
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
  not exists (select 1 from supabase_migrations.schema_migrations where version = '20261127000000'),
  exists (select 1 from supabase_migrations.schema_migrations where version = '20261126000000'),
  to_regclass('social.post_media') is null, to_regclass('social.media_uploads') is null, to_regclass('ops.media_deletions') is null,
  to_regprocedure('public.app_create_post(text, uuid, uuid, text)') is null, to_regprocedure('public.app_create_post(text, uuid)') is not null,
  not ('media' = any ((select proargnames from pg_proc where oid = 'public.app_feed(timestamptz, integer)'::regprocedure)::text[])),
  not ('media' = any ((select proargnames from pg_proc where oid = 'public.app_catch_up(uuid, timestamptz, uuid)'::regprocedure)::text[])),
  position('media_full_path' in (select prosrc from pg_proc where oid = 'public.app_report(text, uuid, text, text)'::regprocedure)) = 0,
  not exists (select 1 from information_schema.columns where table_schema = 'social' and table_name = 'posts' and column_name = 'media_kind'),
  position('media_kind' in (select pg_get_constraintdef(oid) from pg_constraint where conname = 'posts_body_valid' and conrelid = 'social.posts'::regclass)) = 0,
  not exists (select 1 from storage.buckets where id = 'post-photos'), exists (select 1 from storage.buckets where id = 'avatars'),
  to_regclass('social.avatars') is not null, to_regclass('ops.feedback') is not null)")
counts_after=$("${PSQL[@]}" -c "select (select count(*) from social.posts) || '|' || (select count(*) from public.profiles) || '|' || (select count(*) from auth.users) || '|' || ((select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname like 'app\_%') + 6)")
[ $code -eq 0 ] && grep -q 'Applied' <<<"$out" && [ "$after" = "t|t|t|t|t|t|t|t|t|t|t|t|t|t|t|t" ] && [ "$counts_after" = "$counts_before" ] \
  && ok "apply restores the post readers, app_report and the text rule, removes exactly the photo objects and record, and keeps every account, post, avatar and earlier function" \
  || bad "apply (exit $code, state $after, counts $counts_before -> $counts_after)"

# 4. A second run refuses.
out=$(rollback check ""); code=$?
[ $code -ne 0 ] && grep -q 'missing' <<<"$out" && ok "a second run refuses (nothing left to remove)" || bad "a second run did not refuse (exit $code)"

echo "Photo posts rollback tests: $pass passed, $failed failed"
[ $failed -eq 0 ]
