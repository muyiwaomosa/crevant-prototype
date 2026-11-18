#!/usr/bin/env bash
# TEST ONLY (throwaway databases). Simultaneous Inner Clique changes, using two
# real database sessions: the first holds its transaction open, so the second
# has to wait on the per-member lock and then see the first one's result.
# Run by scripts/db/test.sh after supabase/tests-local/066_inner_clique.sql,
# which leaves member ...801 following 28 creators with 24 in the Inner Clique.
set -euo pipefail
: "${DATABASE_URL:?Set DATABASE_URL to the throwaway test database}"
case "$DATABASE_URL" in
  *supabase.co*|*supabase.com*) echo "Refusing to run against a Supabase project." >&2; exit 1 ;;
esac

FAN=00000000-0000-4000-8000-000000000801
c() { echo "00000000-0000-4000-8000-000000000$1"; }

as_fan() { # sql -> runs as the fan in one transaction; prints the result or the error
  psql "$DATABASE_URL" -X -q -At -v ON_ERROR_STOP=1 2>&1 <<SQL || true
begin;
select set_config('request.jwt.claims', '{"sub":"$FAN","role":"authenticated"}', true) \\gset ignored_
set local role authenticated;
$1;
commit;
SQL
}
db() { psql "$DATABASE_URL" -X -q -At -v ON_ERROR_STOP=1 -c "$1"; }

open_count() { db "select count(*) from social.clique_members where fan_id = '$FAN' and removed_at is null"; }
is_open() { db "select count(*) from social.clique_members where fan_id = '$FAN' and creator_id = '$(c "$1")' and removed_at is null"; }
check_invariants() { # label
  local dup orphan n
  n=$(open_count)
  dup=$(db "select count(*) from (select creator_id from social.clique_members where fan_id = '$FAN' and removed_at is null group by 1 having count(*) > 1) d")
  orphan=$(db "select count(*) from social.clique_members m where m.removed_at is null and not exists (select 1 from social.follows f where f.follower_id = m.fan_id and f.creator_id = m.creator_id)")
  if [ "$n" -gt 25 ] || [ "$dup" != 0 ] || [ "$orphan" != 0 ]; then
    echo "FAIL: $1: $n open, $dup duplicated, $orphan without a follow" >&2
    exit 1
  fi
}

race() { # first sql (holds its transaction), second sql; sets FIRST and SECOND
  local tmp pid
  tmp=$(mktemp)
  as_fan "$1; select pg_sleep(2)" > "$tmp" &
  pid=$!
  sleep 0.5
  SECOND=$(as_fan "$2")
  wait "$pid"
  FIRST=$(cat "$tmp"); rm -f "$tmp"
}

# Fill to 25.
as_fan "select public.app_clique_add('$(c 828)');" > /dev/null
[ "$(open_count)" = 25 ] || { echo "FAIL: setup expected 25 in the Inner Clique, found $(open_count)" >&2; exit 1; }

# 1. Two replacements of the same creator at once: one wins, the other is refused cleanly.
race "select public.app_clique_replace('$(c 804)', '$(c 829)')" "select public.app_clique_replace('$(c 804)', '$(c 830)')"
check_invariants "two replacements of one creator"
if grep -q ERROR <<<"$FIRST" || ! grep -q not_in_clique <<<"$SECOND" || [ "$(open_count)" != 25 ] \
   || [ "$(is_open 829)" != 1 ] || [ "$(is_open 830)" != 0 ] || [ "$(is_open 804)" != 0 ]; then
  echo "FAIL: two replacements of one creator: first '$FIRST', second '$SECOND', $(open_count) open" >&2; exit 1
fi
echo "PASS: two simultaneous replacements of the same creator: one applies, the other is refused (not_in_clique), still 25"

# 2. Two replacements of different creators at once: both apply, still 25.
race "select public.app_clique_replace('$(c 805)', '$(c 830)')" "select public.app_clique_replace('$(c 806)', '$(c 802)')"
check_invariants "two different replacements"
if grep -q ERROR <<<"$FIRST$SECOND" || [ "$(open_count)" != 25 ] || [ "$(is_open 830)" != 1 ] || [ "$(is_open 802)" != 1 ]; then
  echo "FAIL: two different replacements: first '$FIRST', second '$SECOND', $(open_count) open" >&2; exit 1
fi
echo "PASS: two simultaneous replacements of different creators both apply, still 25"

# 3. Two replacements bringing in the same creator: one applies, the other is refused.
race "select public.app_clique_replace('$(c 807)', '$(c 805)')" "select public.app_clique_replace('$(c 808)', '$(c 805)')"
check_invariants "two replacements bringing in one creator"
if grep -q ERROR <<<"$FIRST" || ! grep -q already_in_clique <<<"$SECOND" || [ "$(open_count)" != 25 ] || [ "$(is_open 808)" != 1 ]; then
  echo "FAIL: two replacements bringing in one creator: first '$FIRST', second '$SECOND'" >&2; exit 1
fi
echo "PASS: two simultaneous replacements bringing in the same creator: one applies, the other is refused (already_in_clique)"

# 4. An add racing a replacement at full capacity: the add is refused, still 25.
race "select public.app_clique_replace('$(c 809)', '$(c 807)')" "select public.app_clique_add('$(c 806)')"
check_invariants "an add racing a replacement"
if grep -q ERROR <<<"$FIRST" || ! grep -q clique_full <<<"$SECOND" || [ "$(open_count)" != 25 ]; then
  echo "FAIL: an add racing a replacement: first '$FIRST', second '$SECOND', $(open_count) open" >&2; exit 1
fi
echo "PASS: an add racing a replacement at 25 is refused (clique_full), still 25"

# 5. An unfollow racing a replacement that brings that creator in: no membership is left without a follow.
race "select public.app_clique_replace('$(c 810)', '$(c 809)')" "select public.app_unfollow('$(c 809)')"
check_invariants "an unfollow racing a replacement"
if grep -q ERROR <<<"$FIRST$SECOND" || [ "$(is_open 809)" != 0 ] || [ "$(open_count)" != 24 ]; then
  echo "FAIL: an unfollow after a replacement: first '$FIRST', second '$SECOND', $(open_count) open" >&2; exit 1
fi
race "select public.app_unfollow('$(c 810)')" "select public.app_clique_replace('$(c 811)', '$(c 810)')"
check_invariants "a replacement racing an unfollow"
if grep -q ERROR <<<"$FIRST" || ! grep -q not_following <<<"$SECOND" || [ "$(is_open 811)" != 1 ] || [ "$(open_count)" != 24 ]; then
  echo "FAIL: a replacement after an unfollow: first '$FIRST', second '$SECOND', $(open_count) open" >&2; exit 1
fi
echo "PASS: an unfollow and a replacement racing each other never leave a membership without a follow"
