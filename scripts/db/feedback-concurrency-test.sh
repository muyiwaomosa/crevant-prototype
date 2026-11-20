#!/usr/bin/env bash
# TEST ONLY (throwaway databases). Two simultaneous feedback sends from one
# member store one entry, using two real database sessions: the first holds
# its transaction open, so the second waits on the member's lock and then
# returns the first one's entry. Covers the same request id (a retried send)
# and the same text with a new request id (a double tap after a lost reply).
# Run by scripts/db/test.sh after supabase/tests-local/105_feedback.sql, which
# creates member ...0f01.
set -euo pipefail
: "${DATABASE_URL:?Set DATABASE_URL to the throwaway test database}"
case "$DATABASE_URL" in
  *supabase.co*|*supabase.com*) echo "Refusing to run against a Supabase project." >&2; exit 1 ;;
esac

as_member() { # sql -> runs as member ...0f01 in one transaction, prints the result
  psql "$DATABASE_URL" -X -q -At -v ON_ERROR_STOP=1 <<SQL
begin;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-000000000f01","role":"authenticated"}', true) \\gset ignored_
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
    echo "PASS: two simultaneous feedback sends ($label) store one entry and both return its id"
  else
    echo "FAIL: two simultaneous feedback sends ($label): ids '$a' and '$b', entries $n" >&2
    exit 1
  fi
}

RQ=55555555-5555-4555-8555-555555555555
race "same request id" \
  "select public.app_feedback_submit('problem', 'home', 'Two taps on Submit feedback', '$RQ'); select pg_sleep(2);" \
  "select public.app_feedback_submit('problem', 'home', 'Two taps on Submit feedback', '$RQ');" \
  "select count(*) from ops.feedback where submitter_id = '00000000-0000-4000-8000-000000000f01' and body = 'Two taps on Submit feedback'"

race "same text, new request id" \
  "select public.app_feedback_submit('praise', 'discover', 'Sent twice from two tabs', gen_random_uuid()); select pg_sleep(2);" \
  "select public.app_feedback_submit('praise', 'discover', 'Sent twice from two tabs', gen_random_uuid());" \
  "select count(*) from ops.feedback where submitter_id = '00000000-0000-4000-8000-000000000f01' and body = 'Sent twice from two tabs'"
