#!/usr/bin/env bash
# TEST ONLY (throwaway databases). Checks the real query plans and timings of
# the viewed-state functions at a realistic pilot scale, using auto_explain to
# capture the plans of the statements inside the functions as a member runs
# them. Run by scripts/db/test.sh after the other tests.
#
# Data: a fan following 1,000 creators, 50 posts each (50,000 posts) spread
# over the last 30 days, the fan having viewed about 60% of them (~30,000
# rows), plus 100,000 views by other members.
#
# Fails if a plan reads social.posts or social.post_views with a sequential
# scan, or if the strip or a catch-up batch is slow.
set -euo pipefail
: "${DATABASE_URL:?Set DATABASE_URL to the throwaway test database}"
case "$DATABASE_URL" in
  *supabase.co*|*supabase.com*) echo "Refusing to run against a Supabase project." >&2; exit 1 ;;
esac
PSQL=(psql "$DATABASE_URL" -X -q -At -v ON_ERROR_STOP=1)
FAN=00000000-0000-4000-8000-00000000a000

"${PSQL[@]}" <<'SQL'
set role supabase_auth_admin;
insert into auth.users (id, email, email_confirmed_at)
select ('00000000-0000-4000-8000-0000' || lpad(to_hex(40960 + n), 8, '0'))::uuid, 'plan' || n || '@example.test', now()
from generate_series(0, 1100) as n;
reset role;
update public.profiles set username = 'plan_' || right(replace(id::text, '-', ''), 6), display_name = 'Plan ' || right(id::text, 4)
where id::text like '00000000-0000-4000-8000-0000000%' and username is null and id::text >= '00000000-0000-4000-8000-00000000a000';
-- The fan (…a000) follows creators …a001 to …a3e8 (1,000), from 31 days ago.
insert into social.follows (follower_id, creator_id, followed_at)
select '00000000-0000-4000-8000-00000000a000', ('00000000-0000-4000-8000-0000' || lpad(to_hex(40960 + n), 8, '0'))::uuid, now() - interval '31 days'
from generate_series(1, 1000) as n;
-- 50 posts per creator over the last 30 days.
insert into social.posts (author_id, body, created_at)
select ('00000000-0000-4000-8000-0000' || lpad(to_hex(40960 + c), 8, '0'))::uuid, 'Plan post ' || c || '-' || i,
       now() - (random() * interval '30 days')
from generate_series(1, 1000) as c, generate_series(1, 50) as i;
-- The fan has viewed about 60%.
insert into social.post_views (viewer_id, post_id, basis, viewed_at)
select '00000000-0000-4000-8000-00000000a000', id, 'visible', now() - interval '2 days'
from social.posts where body like 'Plan post %' and random() < 0.6;
-- 100,000 views by 100 other members.
insert into social.post_views (viewer_id, post_id, basis, viewed_at)
select distinct on (v, p.id) ('00000000-0000-4000-8000-0000' || lpad(to_hex(40960 + 1000 + v), 8, '0'))::uuid, p.id, 'visible', now() - interval '3 days'
from (select id, row_number() over () as rn from social.posts where body like 'Plan post %') p
join generate_series(1, 100) as v on (p.rn + v) % 50 < 100 and p.rn % 50 = v % 50
on conflict do nothing;
analyze social.posts; analyze social.post_views; analyze social.follows; analyze social.clique_members; analyze public.profiles;
SQL

counts=$("${PSQL[@]}" -c "select (select count(*) from social.posts where body like 'Plan post %') || ' posts, ' || (select count(*) from social.post_views where viewer_id = '$FAN') || ' fan views, ' || (select count(*) from social.post_views) || ' views in all'")
echo "Plan test data: $counts"

run() { # label sql -> prints the inner plans (auto_explain) and the time, as the fan
  psql "$DATABASE_URL" -X -q -At -v ON_ERROR_STOP=1 2>&1 <<SQL
load 'auto_explain';
set auto_explain.log_min_duration = 0;
set auto_explain.log_nested_statements = on;
set auto_explain.log_analyze = on;
set auto_explain.log_buffers = on;
set auto_explain.log_level = notice;
set client_min_messages = notice;
begin;
select set_config('request.jwt.claims', '{"sub":"$FAN","role":"authenticated"}', true) \\gset ignored_
set local role authenticated;
select 'warm', count(*) from ($2) w;
select 'timed', extract(milliseconds from clock_timestamp() - t0)::int from (select clock_timestamp() as t0) s, lateral (select count(*) from ($2) x) c;
commit;
SQL
}

check() { # label sql max-ms
  local out ms
  out=$(run "$1" "$2")
  ms=$(grep -E '^timed\|' <<<"$out" | tail -1 | cut -d'|' -f2)
  plan=$(sed -n '/Query Text:.*from social\./,/^psql/p' <<<"$out")
  echo "--- $1: ${ms} ms"
  grep -E 'Index (Only )?Scan|Seq Scan|Bitmap|Execution Time|Limit|Sort|Nested Loop|Anti' <<<"$out" | grep -v 'Query Text' | sed 's/^psql:[^ ]* NOTICE:  //' | sed 's/^/    /' | head -40
  if grep -qE 'Seq Scan on (posts|post_views)' <<<"$out"; then
    echo "FAIL: $1 reads posts or post_views with a sequential scan" >&2; exit 1
  fi
  if [ -z "$ms" ] || [ "$ms" -gt "$3" ]; then
    echo "FAIL: $1 took ${ms:-?} ms (limit $3 ms)" >&2; exit 1
  fi
  echo "PASS: $1 uses indexes only on posts and post_views, in ${ms} ms (limit $3 ms)"
}

check "the Unseen-first strip (1,000 followed creators)" "select * from public.app_unseen_creators()" 500
CREATOR=00000000-0000-4000-8000-00000000a001
check "a catch-up batch" "select * from public.app_catch_up('$CREATOR')" 100
CUR=$("${PSQL[@]}" -c "select created_at || '|' || id from social.posts where author_id = '$CREATOR' and deleted_at is null order by created_at desc, id desc offset 5 limit 1")
check "the next catch-up batch (keyset)" "select * from public.app_catch_up('$CREATOR', '${CUR%%|*}', '${CUR##*|}')" 100
IDS=$("${PSQL[@]}" -c "select array_agg(id)::text from (select id from social.posts where body like 'Plan post 7-%' limit 50) x")
check "recording a batch of 50 views" "select public.app_mark_viewed('$IDS'::uuid[])" 200
