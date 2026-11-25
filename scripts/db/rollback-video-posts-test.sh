#!/usr/bin/env bash
# Tests the staging rollback of 20261213000000 (video posts),
# scripts/db/staging-rollback-video-posts.sql, against a LOCAL Supabase database.
# Local only. Called first by scripts/db/rollback-test.sh, because
# 20261213000000 is the newest migration.
set -uo pipefail
cd "$(dirname "$0")/../.."
DB_URL="${DB_URL:-postgresql://postgres:postgres@127.0.0.1:54322/postgres}"
case "$DB_URL" in
  *@127.0.0.1:*|*@localhost:*) ;;
  *) echo "Refusing: this test only runs against a local database." >&2; exit 1 ;;
esac
SQL=scripts/db/staging-rollback-video-posts.sql
PHRASE='REMOVE THE STAGING VIDEO POSTS'
PSQL=(psql "$DB_URL" -X -q -At -v ON_ERROR_STOP=1)
pass=0; failed=0
ok()  { echo "PASS  video posts rollback: $1"; pass=$((pass + 1)); }
bad() { echo "FAIL  video posts rollback: $1"; failed=$((failed + 1)); }
rollback() { psql "$DB_URL" -X -q -v ON_ERROR_STOP=1 -v mode="$1" -v confirm="$2" -f "$SQL" 2>&1; }
q() { "${PSQL[@]}" -c "$1"; }
replica() { psql "$DB_URL" -X -q -v ON_ERROR_STOP=1 -c "begin" -c "set local session_replication_role = replica" -c "$1" -c "commit" >/dev/null 2>&1; }
present() { q "select to_regclass('ops.video_device_tests') is not null and exists (select 1 from supabase_migrations.schema_migrations where version = '20261213000000')"; }
refuses() {
  local out code
  out=$(rollback "$2" "$3"); code=$?
  if [ $code -ne 0 ] && grep -q "$4" <<<"$out" && [ "$(present)" = t ]; then ok "refuses $1, changing nothing"; else bad "did not refuse $1 (exit $code): $(tail -2 <<<"$out" | tr '\n' ' ')"; fi
}

[ "$(present)" = t ] || { bad "20261213000000 is not applied here"; echo "Video posts rollback tests: $pass passed, $failed failed"; exit 1; }
# Start clean: no video data, video posts off (journeys may have left some).
replica "delete from social.post_media where kind = 'video'; delete from social.posts where media_kind = 'video'; delete from social.media_uploads where kind = 'video';
  delete from ops.video_device_tests; delete from ops.media_deletions where bucket = 'post-videos'; delete from ops.media_admin_events where action = 'video_cap_changed';
  update ops.media_settings set video_storage_cap_bytes = null; update ops.feature_switches set enabled = false where feature = 'video_posts'"
q "select count(*) from storage.objects where bucket_id = 'post-videos'" | grep -qx 0 || echo "note: stored video files exist; the rollback will refuse until they are removed"

refuses "a bad mode" "drop" "" "mode must be check or apply"
refuses "apply without the phrase" "apply" "" "needs the confirmation phrase"
refuses "apply with a wrong phrase" "apply" "remove it" "needs the confirmation phrase"
U=00000000-0000-4000-8000-fdfdfd00b01b
UP=00000000-0000-4000-8000-fdfdfd00b01c
q "insert into auth.users (id, email, email_confirmed_at) values ('$U', 'vid-rollback@example.test', now()) on conflict do nothing" >/dev/null
for case in "video upload|insert into social.media_uploads (id, user_id, kind, purpose, declared_bytes, full_path, feed_path) values ('$UP', '$U', 'video', 'device_test', 1000, '$U/$UP.mp4', '$U/$UP-poster.jpg')|delete from social.media_uploads where id = '$UP'" \
            "device test|insert into ops.video_device_tests (device, passed, recorded_by) values ('iphone_safari', true, 'probe')|delete from ops.video_device_tests" \
            "queued video file|insert into ops.media_deletions (bucket, path, reason) values ('post-videos', '$U/$UP.mp4', 'probe')|delete from ops.media_deletions where bucket = 'post-videos'" \
            "video cap|update ops.media_settings set video_storage_cap_bytes = 1073741824|update ops.media_settings set video_storage_cap_bytes = null"; do
  name=${case%%|*}; rest=${case#*|}; add=${rest%%|*}; remove=${rest#*|}
  replica "$add"
  refuses "while a $name exists" "check" "" "rows of data depend on video posts"
  replica "$remove"
done
replica "update ops.feature_switches set enabled = true where feature = 'video_posts'"
refuses "while video posts are switched on" "check" "" "video posts are switched on"
replica "update ops.feature_switches set enabled = false where feature = 'video_posts'"
q "delete from auth.users where id = '$U'" >/dev/null
q "insert into supabase_migrations.schema_migrations (version, name) values ('20261231000000', 'later')" >/dev/null
refuses "while a later migration is recorded" "check" "" "later migration"
q "delete from supabase_migrations.schema_migrations where version = '20261231000000'" >/dev/null

out=$(rollback check ""); code=$?
[ $code -eq 0 ] && grep -q 'Check only' <<<"$out" && [ "$(present)" = t ] && ok "check passes and changes nothing" || bad "check (exit $code): $(tail -2 <<<"$out" | tr '\n' ' ')"
out=$(rollback apply "$PHRASE"); code=$?
if [ $code -eq 0 ] && grep -q 'Applied' <<<"$out"; then ok "apply succeeds"; else bad "apply (exit $code): $(tail -3 <<<"$out" | tr '\n' ' ')"; fi
left=$(q "select count(*) from pg_class where oid = coalesce(to_regclass('ops.video_device_tests'), 0)")
fns=$(q "select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace where (n.nspname = 'public' and p.proname in ('app_video_status', 'app_video_upload_begin', 'app_video_upload_paths', 'app_post_videos', 'app_founder_record_device_test', 'app_founder_set_video_cap', 'app_founder_video_status', 'svc_video_upload_stored', 'svc_video_poster_stored', 'svc_video_links_issued', 'app_founder_video_emergency_stop')) or (n.nspname = 'ops' and p.proname in ('media_bucket', 'video_ready', 'videos_open', 'video_tester', 'video_storage_used', 'video_member_bytes', 'video_device_passed'))")
cols=$(q "select count(*) from information_schema.columns where (table_schema = 'social' and table_name = 'media_uploads' and column_name in ('purpose', 'duration_ms', 'codec', 'declared_bytes')) or (table_schema = 'ops' and table_name = 'media_settings' and column_name = 'video_storage_cap_bytes')")
rec=$(q "select count(*) from supabase_migrations.schema_migrations where version = '20261213000000'")
bucket=$(q "select count(*) from storage.buckets where id = 'post-videos'")
old=$(q "select position('video_not_ready' in (select prosrc from pg_proc where oid = 'public.app_founder_set_switch(text, boolean, text)'::regprocedure)) > 0 and position('video_ready' in (select prosrc from pg_proc where oid = 'public.app_founder_set_switch(text, boolean, text)'::regprocedure)) = 0 and position('post-videos' in (select prosrc from pg_proc where oid = 'public.svc_media_drain_claim(integer)'::regprocedure)) = 0 and has_function_privilege('authenticated', 'public.app_create_post(text, uuid, uuid, text)', 'EXECUTE') and not has_function_privilege('anon', 'public.app_create_post(text, uuid, uuid, text)', 'EXECUTE') and (select pg_get_constraintdef(oid) from pg_constraint where conname = 'posts_media_kind_check') !~ 'video'")
[ "$left$fns$cols$rec$bucket$old" = 00000t ] && ok "apply removed the video objects, columns, bucket and record, and put back the photo-only functions and constraints" || bad "left behind: tables $left, functions $fns, columns $cols, record $rec, bucket $bucket, earlier functions $old"
out=$(rollback check ""); code=$?
[ $code -ne 0 ] && grep -q 'expected objects are missing' <<<"$out" && ok "a second run refuses" || bad "a second run did not refuse (exit $code)"

echo "Video posts rollback tests: $pass passed, $failed failed"
[ $failed -eq 0 ]
