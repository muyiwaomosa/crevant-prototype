#!/usr/bin/env bash
# TEST ONLY (throwaway databases). Two simultaneous photo posts with the same
# request id and upload store one post, using two real database sessions: the
# first holds its transaction open, so the second waits on the member's lock
# and then returns the first one's post. Run by scripts/db/test.sh after
# supabase/tests-local/115_post_photos.sql, which creates member ...c501 and
# leaves photos switched on.
set -euo pipefail
: "${DATABASE_URL:?Set DATABASE_URL to the throwaway test database}"
case "$DATABASE_URL" in
  *supabase.co*|*supabase.com*) echo "Refusing to run against a Supabase project." >&2; exit 1 ;;
esac
U=00000000-0000-4000-8000-00000000c501
UP=66666666-6666-4666-8666-666666666666
RQ=77777777-7777-4777-8777-777777777777
psql "$DATABASE_URL" -X -q -v ON_ERROR_STOP=1 -c "insert into social.media_uploads (id, user_id, kind, full_path, feed_path, status, width, height, full_bytes, feed_bytes, stored_at)
  values ('$UP', '$U', 'photo', '$U/$UP.jpg', '$U/$UP-feed.jpg', 'stored', 1600, 1200, 300000, 90000, now())"

as_member() {
  psql "$DATABASE_URL" -X -q -At -v ON_ERROR_STOP=1 <<SQL
begin;
select set_config('request.jwt.claims', '{"sub":"$U","role":"authenticated"}', true) \\gset ignored_
set local role authenticated;
$1
commit;
SQL
}
tmp=$(mktemp)
as_member "select public.app_create_post('Two taps on Post', '$RQ', '$UP'); select pg_sleep(2);" > "$tmp" &
pid=$!
sleep 0.5
b=$(as_member "select public.app_create_post('Two taps on Post', '$RQ', '$UP');" | grep -E '^[0-9a-f-]{36}$' | head -1)
wait "$pid"
a=$(grep -E '^[0-9a-f-]{36}$' "$tmp" | head -1); rm -f "$tmp"
n=$(psql "$DATABASE_URL" -X -q -At -c "select count(*) from social.posts where client_request_id = '$RQ'")
m=$(psql "$DATABASE_URL" -X -q -At -c "select count(*) from social.post_media where upload_id = '$UP'")
if [ -n "$a" ] && [ "$a" = "$b" ] && [ "$n" = 1 ] && [ "$m" = 1 ]; then
  echo "PASS: two simultaneous photo posts with one request id store one post and one photo, and both return its id"
else
  echo "FAIL: two simultaneous photo posts: ids '$a' and '$b', posts $n, photos $m" >&2
  exit 1
fi
