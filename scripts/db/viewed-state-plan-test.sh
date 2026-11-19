#!/usr/bin/env bash
# TEST ONLY (throwaway databases). Checks the real query plans and server-side
# timings of the viewed-state functions at private-pilot scale. Run by
# scripts/db/test.sh after the other tests.
#
# Measurement: auto_explain captures each statement run inside the functions,
# as a member runs them, with its plan and PostgreSQL's own duration for that
# statement. The timing reported is that duration for the function's main
# query (median of three runs after a warm-up), not a client-side clock.
# auto_explain.log_timing is off, so per-node timing overhead does not
# inflate the result; row counts and buffers are still reported.
#
# Scenario A, a typical wide follow list: fan …a000 follows 1,000 creators,
# 50 posts each (50,000 posts) over the last 30 days, ~60% viewed, plus
# 100,000 views by other members.
#
# Scenario B, highly active creators mostly already viewed (the worst case for
# the strip, which must pass over viewed posts to find unseen ones): fan …b000
# follows 200 creators, 500 posts each (100,000 posts), 95% viewed.
#
# Fails on a sequential scan of social.posts or social.post_views, or when a
# query exceeds its time limit.
set -euo pipefail
: "${DATABASE_URL:?Set DATABASE_URL to the throwaway test database}"
case "$DATABASE_URL" in
  *supabase.co*|*supabase.com*) echo "Refusing to run against a Supabase project." >&2; exit 1 ;;
esac
PSQL=(psql "$DATABASE_URL" -X -q -At -v ON_ERROR_STOP=1)
FAN_A=00000000-0000-4000-8000-00000000a000
FAN_B=00000000-0000-4000-8000-00000000b000

"${PSQL[@]}" <<'SQL'
-- Members: …a000 to …a44c (fan A, 1,000 creators, 100 other viewers) and …b000 to …b0c8 (fan B, 200 creators).
set role supabase_auth_admin;
insert into auth.users (id, email, email_confirmed_at)
select ('00000000-0000-4000-8000-0000' || lpad(to_hex(40960 + n), 8, '0'))::uuid, 'plana' || n || '@example.test', now() from generate_series(0, 1100) as n;
insert into auth.users (id, email, email_confirmed_at)
select ('00000000-0000-4000-8000-0000' || lpad(to_hex(45056 + n), 8, '0'))::uuid, 'planb' || n || '@example.test', now() from generate_series(0, 200) as n;
reset role;
-- Pilot membership (20261122000000): every plan member has active access.
select count(ops.grant_member_access(u.id, 'tester', 'test')) from auth.users u where u.email like 'plan_%@example.test';
update public.profiles set username = 'plan_' || right(replace(id::text, '-', ''), 6), display_name = 'Plan ' || right(id::text, 4)
where username is null and id::text between '00000000-0000-4000-8000-00000000a000' and '00000000-0000-4000-8000-00000000b0c8';

-- Scenario A.
insert into social.follows (follower_id, creator_id, followed_at)
select '00000000-0000-4000-8000-00000000a000', ('00000000-0000-4000-8000-0000' || lpad(to_hex(40960 + n), 8, '0'))::uuid, now() - interval '31 days'
from generate_series(1, 1000) as n;
insert into social.posts (author_id, body, created_at)
select ('00000000-0000-4000-8000-0000' || lpad(to_hex(40960 + c), 8, '0'))::uuid, 'Plan A ' || c || '-' || i, now() - (random() * interval '30 days')
from generate_series(1, 1000) as c, generate_series(1, 50) as i;
insert into social.post_views (viewer_id, post_id, basis, viewed_at)
select '00000000-0000-4000-8000-00000000a000', id, 'visible', now() - interval '2 days'
from social.posts where body like 'Plan A %' and random() < 0.6;
insert into social.post_views (viewer_id, post_id, basis, viewed_at)
select ('00000000-0000-4000-8000-0000' || lpad(to_hex(40960 + 1000 + v), 8, '0'))::uuid, p.id, 'visible', now() - interval '3 days'
from (select id, row_number() over () as rn from social.posts where body like 'Plan A %') p
join generate_series(1, 100) as v on p.rn % 50 = v % 50
on conflict do nothing;

-- Scenario B: 200 creators x 500 posts, fan B has viewed 95%.
insert into social.follows (follower_id, creator_id, followed_at)
select '00000000-0000-4000-8000-00000000b000', ('00000000-0000-4000-8000-0000' || lpad(to_hex(45056 + n), 8, '0'))::uuid, now() - interval '31 days'
from generate_series(1, 200) as n;
insert into social.posts (author_id, body, created_at)
select ('00000000-0000-4000-8000-0000' || lpad(to_hex(45056 + c), 8, '0'))::uuid, 'Plan B ' || c || '-' || i, now() - (random() * interval '30 days')
from generate_series(1, 200) as c, generate_series(1, 500) as i;
insert into social.post_views (viewer_id, post_id, basis, viewed_at)
select '00000000-0000-4000-8000-00000000b000', id, 'visible', now() - interval '2 days'
from social.posts where body like 'Plan B %' and random() < 0.95;

analyze social.posts; analyze social.post_views; analyze social.follows; analyze social.clique_members; analyze public.profiles;
SQL

echo "Plan test data: $("${PSQL[@]}" -c "select
  (select count(*) from social.posts where body like 'Plan A %') || ' scenario A posts, ' ||
  (select count(*) from social.post_views where viewer_id = '$FAN_A') || ' fan A views; ' ||
  (select count(*) from social.posts where body like 'Plan B %') || ' scenario B posts, ' ||
  (select count(*) from social.post_views where viewer_id = '$FAN_B') || ' fan B views; ' ||
  (select count(*) from social.post_views) || ' views in all'")"

# Runs one statement as a member with auto_explain on and prints its notices.
explain_run() { # member sql
  psql "$DATABASE_URL" -X -q -At -v ON_ERROR_STOP=1 2>&1 <<SQL
load 'auto_explain';
set auto_explain.log_min_duration = 0;
set auto_explain.log_nested_statements = on;
set auto_explain.log_analyze = on;
set auto_explain.log_timing = off;
set auto_explain.log_buffers = on;
set auto_explain.log_level = notice;
set client_min_messages = notice;
begin;
select set_config('request.jwt.claims', '{"sub":"$1","role":"authenticated"}', true) \\gset ignored_
set local role authenticated;
select count(*) from ($2) x;
commit;
SQL
}

# The server-side duration (ms) auto_explain reported for the function's main
# query: the logged statement whose text matches the pattern.
inner_ms() { # output pattern
  awk -v pat="$2" '
    /NOTICE:  duration: / { match($0, /duration: [0-9.]+ ms/); d = substr($0, RSTART + 10, RLENGTH - 13); want = 1; next }
    want && /Query Text:/ { if ($0 ~ pat) found = d; want = 0 }
    END { print found }' <<<"$1"
}

check() { # label member pattern max-ms sql...
  local label=$1 member=$2 pat=$3 limit=$4; shift 4
  local out ms times=() plan=""
  explain_run "$member" "$1" > /dev/null   # warm-up
  shift
  for sql in "$@"; do
    out=$(explain_run "$member" "$sql")
    if grep -qE 'Seq Scan on (posts|post_views)' <<<"$out"; then
      echo "FAIL: $label reads posts or post_views with a sequential scan" >&2
      grep -E 'Seq Scan' <<<"$out" >&2; exit 1
    fi
    ms=$(inner_ms "$out" "$pat")
    [ -n "$ms" ] || { echo "FAIL: $label: no auto_explain duration found for the main query" >&2; exit 1; }
    times+=("$ms"); plan=$out
  done
  local median
  median=$(printf '%s\n' "${times[@]}" | sort -n | sed -n "$(( (${#times[@]} + 1) / 2 ))p")
  echo "--- $label: ${median} ms server-side (runs: ${times[*]})"
  awk '/NOTICE:  duration: /{show=0} /Query Text:/{show=($0 ~ /'"$pat"'/)} show' <<<"$plan" \
    | grep -E 'Scan|Anti|Limit|Sort |Nested Loop|rows=' | sed 's/^psql:[^ ]* NOTICE:  //; s/^/    /' | head -14
  if awk -v m="$median" -v l="$limit" 'BEGIN { exit !(m > l) }'; then
    echo "FAIL: $label took ${median} ms server-side (limit $limit ms)" >&2; exit 1
  fi
  echo "PASS: $label: indexes only on posts and post_views, ${median} ms server-side (limit $limit ms)"
}

STRIP="select * from public.app_unseen_creators()"
STRIP_PAT='u.n::integer, u.latest'
check "scenario A: the strip (1,000 creators, 50 posts each, 60% viewed)" "$FAN_A" "$STRIP_PAT" 500 "$STRIP" "$STRIP" "$STRIP" "$STRIP"
check "scenario B: the strip (200 very active creators, 500 posts each, 95% viewed)" "$FAN_B" "$STRIP_PAT" 1000 "$STRIP" "$STRIP" "$STRIP" "$STRIP"

CREATOR_A=00000000-0000-4000-8000-00000000a001
CATCH="select * from public.app_catch_up('$CREATOR_A')"
check "scenario A: a catch-up batch" "$FAN_A" 'select b.id, b.author_id' 50 "$CATCH" "$CATCH" "$CATCH" "$CATCH"
CUR=$("${PSQL[@]}" -c "select created_at || '|' || id from social.posts where author_id = '$CREATOR_A' and deleted_at is null order by created_at desc, id desc offset 5 limit 1")
NEXT="select * from public.app_catch_up('$CREATOR_A', '${CUR%%|*}', '${CUR##*|}')"
check "scenario A: the next catch-up batch (keyset)" "$FAN_A" 'select b.id, b.author_id' 50 "$NEXT" "$NEXT" "$NEXT" "$NEXT"
CREATOR_B=00000000-0000-4000-8000-00000000b001
CATCH_B="select * from public.app_catch_up('$CREATOR_B')"
check "scenario B: a catch-up batch (creator with 500 posts, 95% viewed)" "$FAN_B" 'select b.id, b.author_id' 50 "$CATCH_B" "$CATCH_B" "$CATCH_B" "$CATCH_B"

# Recording: each run uses 50 different posts not yet viewed by fan A, so every
# run times real inserts (not repeats).
ids() { # batch-number -> 50 scenario A posts fan A hasn't viewed, different for each batch
  "${PSQL[@]}" -c "select array_agg(id)::text from (select s.id from social.posts s where s.body like 'Plan A %' and not exists (select 1 from social.post_views v where v.viewer_id = '$FAN_A' and v.post_id = s.id) order by s.id offset $(( $1 * 50 )) limit 50) x"
}
B0=$(ids 0); B1=$(ids 1); B2=$(ids 2); B3=$(ids 3)
check "recording a batch of 50 new views" "$FAN_A" 'insert into social.post_views' 100 \
  "select public.app_mark_viewed('$B0'::uuid[])" \
  "select public.app_mark_viewed('$B1'::uuid[])" "select public.app_mark_viewed('$B2'::uuid[])" "select public.app_mark_viewed('$B3'::uuid[])"
recorded=$("${PSQL[@]}" -c "select count(*) from social.post_views where viewer_id = '$FAN_A' and post_id = any ('$B3'::uuid[])")
[ "$recorded" = 50 ] || { echo "FAIL: the timed batch should have recorded 50 new views, recorded $recorded" >&2; exit 1; }
echo "PASS: each timed recording batch inserted 50 new rows (real inserts, not repeats)"
