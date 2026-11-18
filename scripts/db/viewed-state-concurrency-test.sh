#!/usr/bin/env bash
# TEST ONLY (throwaway databases). Simultaneous view reports, using two real
# database sessions: the first holds its transaction open, so the second has
# to wait on the per-member lock and then see the first one's result.
# Run by scripts/db/test.sh after supabase/tests-local/067_viewed_state.sql,
# which leaves member ...901 with 24 views in the last hour, creator ...908
# with 3,010 posts, and member ...902 with no views.
set -euo pipefail
: "${DATABASE_URL:?Set DATABASE_URL to the throwaway test database}"
case "$DATABASE_URL" in
  *supabase.co*|*supabase.com*) echo "Refusing to run against a Supabase project." >&2; exit 1 ;;
esac

m() { echo "00000000-0000-4000-8000-000000000$1"; }
db() { psql "$DATABASE_URL" -X -q -At -v ON_ERROR_STOP=1 -c "$1"; }
as_member() { # member-number sql -> runs as that member in one transaction; prints the result or the error
  psql "$DATABASE_URL" -X -q -At -v ON_ERROR_STOP=1 2>&1 <<SQL || true
begin;
select set_config('request.jwt.claims', '{"sub":"$(m "$1")","role":"authenticated"}', true) \\gset ignored_
set local role authenticated;
$2;
commit;
SQL
}
race() { # member first-sql second-sql; sets FIRST and SECOND
  local tmp pid
  tmp=$(mktemp)
  as_member "$1" "$2; select pg_sleep(2)" > "$tmp" &
  pid=$!
  sleep 0.5
  SECOND=$(as_member "$1" "$3")
  wait "$pid"
  FIRST=$(head -1 "$tmp"); rm -f "$tmp"
}
h_posts() { # offset count -> a uuid[] literal of creator ...908's posts, oldest first
  db "select array_agg(id order by created_at, id)::text from (select id, created_at from social.posts where author_id = '$(m 908)' order by created_at, id offset $1 limit $2) x"
}
views() { db "select count(*) from social.post_views where viewer_id = '$(m "$1")'"; }

# 1. The same post, marked by two sessions at once: one row.
P=$(h_posts 0 1)
race 902 "select public.app_mark_viewed('$P'::uuid[])" "select public.app_mark_viewed('$P'::uuid[])"
if [ "$FIRST" != 1 ] || [ "$SECOND" != 0 ] || [ "$(views 902)" != 1 ]; then
  echo "FAIL: two simultaneous marks of one post: first '$FIRST', second '$SECOND', rows $(views 902)" >&2; exit 1
fi
echo "PASS: two simultaneous marks of the same post record one row"

# 2. Overlapping batches at once: no duplicates, each post once.
B1=$(h_posts 10 5)   # posts 10..14
B2=$(h_posts 12 6)   # posts 12..17 (12..14 overlap)
race 902 "select public.app_mark_viewed('$B1'::uuid[])" "select public.app_mark_viewed('$B2'::uuid[])"
dups=$(db "select count(*) from (select post_id from social.post_views where viewer_id = '$(m 902)' group by 1 having count(*) > 1) d")
if [ "$FIRST" != 5 ] || [ "$SECOND" != 3 ] || [ "$(views 902)" != 9 ] || [ "$dups" != 0 ]; then
  echo "FAIL: overlapping batches: first '$FIRST', second '$SECOND', rows $(views 902), duplicates $dups" >&2; exit 1
fi
echo "PASS: two simultaneous overlapping batches record each post once (5 + 3 new)"

# 3. Near the hourly cap: member ...901 at 2,996 views, two batches of 3 at once.
#    Without the lock both would see 2,996 and insert (3,002). With it, the
#    second sees 2,999 and is refused, writing nothing.
have=$(views 901)
db "insert into social.post_views (viewer_id, post_id, basis)
    select '$(m 901)', id, 'visible' from social.posts where author_id = '$(m 908)' order by created_at, id offset 20 limit $((2996 - have))" >/dev/null
[ "$(views 901)" = 2996 ] || { echo "FAIL: setup expected 2,996 views, found $(views 901)" >&2; exit 1; }
C1=$(h_posts 3000 3)
C2=$(h_posts 3005 3)
race 901 "select public.app_mark_viewed('$C1'::uuid[])" "select public.app_mark_viewed('$C2'::uuid[])"
if [ "$FIRST" != 3 ] || ! grep -q rate_limited <<<"$SECOND" || [ "$(views 901)" != 2999 ]; then
  echo "FAIL: two batches at the cap: first '$FIRST', second '$SECOND', rows $(views 901)" >&2; exit 1
fi
c2_written=$(db "select count(*) from social.post_views where viewer_id = '$(m 901)' and post_id = any ('$C2'::uuid[])")
[ "$c2_written" = 0 ] || { echo "FAIL: the refused batch wrote $c2_written rows" >&2; exit 1; }
echo "PASS: two simultaneous batches at the hourly cap: one applies (2,999), the other is refused and writes nothing"

# 4. A batch that fits exactly still works afterwards (2,999 + 1 = 3,000).
LAST=$(h_posts 3005 1)
[ "$(as_member 901 "select public.app_mark_viewed('$LAST'::uuid[])")" = 1 ] && [ "$(views 901)" = 3000 ] \
  || { echo "FAIL: the batch reaching exactly 3,000 was not accepted" >&2; exit 1; }
echo "PASS: after the race, a batch reaching exactly 3,000 is accepted"
