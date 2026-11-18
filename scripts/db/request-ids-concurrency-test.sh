#!/usr/bin/env bash
# TEST ONLY (throwaway databases). Two simultaneous requests with the same
# request id store one post (and one comment), using two real database
# sessions: the first holds its transaction open, so the second has to wait
# on the unique index and then return the first one's row. Run by
# scripts/db/test.sh after supabase/tests-local/065_publishing_request_ids.sql,
# which creates member ...701.
set -euo pipefail
: "${DATABASE_URL:?Set DATABASE_URL to the throwaway test database}"
case "$DATABASE_URL" in
  *supabase.co*|*supabase.com*) echo "Refusing to run against a Supabase project." >&2; exit 1 ;;
esac

as_member() { # sql -> runs as member ...701 in one transaction, prints the result
  psql "$DATABASE_URL" -X -q -At -v ON_ERROR_STOP=1 <<SQL
begin;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-000000000701","role":"authenticated"}', true) \\gset ignored_
set local role authenticated;
$1
commit;
SQL
}

race() { # label, first sql (holds its transaction), second sql, count sql
  local label=$1 first=$2 second=$3 count=$4 a b n
  tmp=$(mktemp)
  as_member "$first" > "$tmp" &
  local pid=$!
  sleep 0.5
  b=$(as_member "$second")
  wait "$pid"
  a=$(grep -E '^[0-9a-f-]{36}$' "$tmp" | head -1); rm -f "$tmp"
  b=$(grep -E '^[0-9a-f-]{36}$' <<<"$b" | head -1)
  n=$(psql "$DATABASE_URL" -X -q -At -c "$count")
  if [ -n "$a" ] && [ "$a" = "$b" ] && [ "$n" = 1 ]; then
    echo "PASS: two simultaneous $label requests with one id store one row and both return its id"
  else
    echo "FAIL: two simultaneous $label requests: ids '$a' and '$b', rows $n" >&2
    exit 1
  fi
}

RQ=33333333-3333-4333-8333-333333333333
race post \
  "select public.app_create_post('Two taps at once', '$RQ'); select pg_sleep(2);" \
  "select public.app_create_post('Two taps at once', '$RQ');" \
  "select count(*) from social.posts where client_request_id = '$RQ'"

POST=$(psql "$DATABASE_URL" -X -q -At -c "select id from social.posts where client_request_id = '$RQ'")
RQC=44444444-4444-4444-8444-444444444444
race comment \
  "select public.app_add_comment('$POST', 'Two taps on a comment', '$RQC'); select pg_sleep(2);" \
  "select public.app_add_comment('$POST', 'Two taps on a comment', '$RQC');" \
  "select count(*) from social.comments where client_request_id = '$RQC'"
