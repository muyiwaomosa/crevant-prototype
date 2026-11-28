#!/usr/bin/env bash
# MEMBER PRODUCTION migration sets.
#
#   foundation  20261106000000 to 20261121000000: everything before pilot
#               membership. Applied to the new, empty project by
#               deploy-db-members-production.yml (apply-foundation).
#   activation  20261122000000 to 20261129000000: pilot membership, the
#               founder's grant, then the later migrations with the launch
#               gate last, all in ONE transaction by
#               members-activate-member-access.yml, never by db push. So
#               membership never exists without the founder-only gate.
#   later       after 20261129000000 (20261130000000 foundation v2): applied by
#               deploy-db-members-production.yml (apply), only once the
#               activation set is recorded.
#
#   members-subset.sh verify              every migration is approved with its
#                                         checksum; the sets are as above; the
#                                         activation SQL applies and records
#                                         exactly the activation set, in order,
#                                         the gate last
#   members-subset.sh prepare <dir> <foundation|all>
#                                         a Supabase project folder in <dir>
#                                         with config.toml and only those
#                                         migrations, for `supabase --workdir`
#                                         ("all" leaves out the held migrations
#                                         and names them)
#   members-subset.sh held                the held versions, one per line
#   members-subset.sh unheld              every other version, one per line
#
# Held migrations (supabase/members-held-migrations.txt) are applied to staging
# as usual but never pushed to member Production until a reviewed change
# removes them from that file. The file is validated every time: a malformed
# line, a duplicate, an unknown or unapproved version, a version not after the
# launch gate, or a held migration older than one that would be pushed fails.
set -euo pipefail
cd "$(dirname "$0")/../.."
fail() { echo "::error::$1" >&2; exit 1; }
FIRST=20261106000000
LAST_FOUNDATION=20261121000000
ACTIVATION=20261122000000
GATE=20261129000000

all() { local f; for f in supabase/migrations/*.sql; do basename "$f"; done; }
HELD_FILE=supabase/members-held-migrations.txt
words_or_none() { if [ -n "$1" ]; then tr '\n' ' ' <<<"$1" | sed 's/ $//'; else echo none; fi; }

# The held versions, validated (see the header).
held() {
  [ -f "$HELD_FILE" ] || fail "$HELD_FILE is missing (it may list no migrations, but it must exist)."
  local line v reason seen="" m newest_unheld oldest_held
  while IFS= read -r line; do
    [[ "$line" =~ ^[[:space:]]*(#|$) ]] && continue
    [[ "$line" =~ ^([0-9]{14})[[:space:]]+(.+)$ ]] || fail "Malformed line in $HELD_FILE (expected: <version> <reason>): $line"
    v="${BASH_REMATCH[1]}"; reason="${BASH_REMATCH[2]}"
    [ -n "${reason// /}" ] || fail "$HELD_FILE: $v has no reason."
    grep -qx "$v" <<<"$seen" && fail "$HELD_FILE lists $v twice."
    [ "$(all | grep -c "^${v}_")" = 1 ] || fail "$HELD_FILE holds $v, which is not exactly one migration in supabase/migrations."
    [[ "$v" > "$GATE" ]] || fail "$HELD_FILE holds $v, but only migrations after the launch gate ($GATE) may be held."
    seen="$seen$v"$'\n'
  done < "$HELD_FILE"
  seen="$(sed '/^$/d' <<<"$seen" | sort)"
  if [ -n "$seen" ]; then
    oldest_held="$(head -1 <<<"$seen")"
    newest_unheld="$(all | cut -c1-14 | grep -vxF "$seen" | tail -1)"
    [[ "$newest_unheld" < "$oldest_held" ]] || fail "$HELD_FILE holds $oldest_held, but $newest_unheld is newer and would be pushed: held migrations must be the newest (a later one may depend on them)."
  fi
  [ -z "$seen" ] || echo "$seen"
}
unheld() { local h; h="$(held)"; all | cut -c1-14 | { if [ -n "$h" ]; then grep -vxF "$h"; else cat; fi; } }
foundation() { all | awk -v a="$FIRST" -v b="$LAST_FOUNDATION" '{v=substr($0,1,14)} v>=a && v<=b'; }

verify() {
  local m sum
  for m in $(all); do
    [[ "$m" =~ ^[0-9]{14}_[a-z0-9_]+\.sql$ ]] || fail "Malformed migration name: $m"
    sum="$(sha256sum "supabase/migrations/$m" | cut -d' ' -f1)"
    grep -qxF "$sum  supabase/migrations/$m" supabase/approved-migrations.sha256 || fail "Migration not approved with this checksum: $m"
  done
  local f_list; f_list="$(foundation)"
  [ "$(head -1 <<<"$f_list" | cut -c1-14)" = "$FIRST" ] || fail "The foundation set must start at $FIRST."
  [ "$(tail -1 <<<"$f_list" | cut -c1-14)" = "$LAST_FOUNDATION" ] || fail "The foundation set must end at $LAST_FOUNDATION."
  if grep -q "^$ACTIVATION" <<<"$f_list"; then fail "The foundation set must not include $ACTIVATION."; fi
  [ -f "supabase/migrations/${ACTIVATION}_member_access.sql" ] || fail "$ACTIVATION (pilot membership) is missing."
  [ -f "supabase/migrations/${GATE}_member_launch_gate.sql" ] || fail "$GATE (the member launch gate) is missing."
  # The activation SQL applies exactly the activation set, in order, each recorded, nothing else.
  local act_sql=scripts/db/members-activate-member-access.sql want got rec
  want="$(all | awk -v a="$ACTIVATION" -v b="$GATE" '{v=substr($0,1,14)} v>=a && v<=b')"
  got="$(grep -E '^\\ir \.\./\.\./supabase/migrations/' "$act_sql" | sed 's#.*/##')"
  [ "$got" = "$want" ] || fail "$act_sql must apply exactly $ACTIVATION to $GATE, in order (it applies: $(tr '\n' ' ' <<<"$got"))."
  [ "$(tail -1 <<<"$got" | cut -c1-14)" = "$GATE" ] || fail "The launch gate must be the last migration the activation applies."
  rec="$(grep -oE "^insert into supabase_migrations\.schema_migrations \(version, name\) values \('[0-9]{14}', '[a-z0-9_]+'\);" "$act_sql" | sed -E "s/.*'([0-9]{14})', '([a-z0-9_]+)'.*/\1_\2.sql/")"
  [ "$rec" = "$want" ] || fail "$act_sql must record exactly the migrations it applies, with their names."
  local h; h="$(held)"
  echo "Member Production sets: foundation $(foundation | wc -l | tr -d ' ') migrations ($FIRST to $LAST_FOUNDATION); activation $ACTIVATION to $GATE in one transaction, the gate last ($(wc -l <<<"$want" | tr -d ' ') migrations); $(all | awk -v b="$GATE" 'substr($0,1,14)>b' | wc -l | tr -d ' ') later; held for member Production: $(words_or_none "$h")."
}

case "${1:-}" in
  verify) verify ;;
  held) verify >/dev/null; held ;;
  unheld) verify >/dev/null; unheld ;;
  prepare)
    verify >/dev/null
    dir="${2:?usage: members-subset.sh prepare <dir> <foundation|all>}"
    set_name="${3:?usage: members-subset.sh prepare <dir> <foundation|all>}"
    rm -rf "$dir"; mkdir -p "$dir/supabase/migrations"
    cp supabase/config.toml "$dir/supabase/config.toml"
    if [ -d supabase/templates ]; then cp -r supabase/templates "$dir/supabase/templates"; fi
    case "$set_name" in
      foundation) for m in $(foundation); do cp "supabase/migrations/$m" "$dir/supabase/migrations/$m"; done ;;
      all)
        h="$(held)"
        for m in $(all); do
          if [ -n "$h" ] && grep -qx "${m:0:14}" <<<"$h"; then continue; fi
          cp "supabase/migrations/$m" "$dir/supabase/migrations/$m"
        done
        echo "Held for member Production, not in the folder ($HELD_FILE): $(words_or_none "$h")"
        ;;
      *) fail "Unknown set: $set_name (foundation or all)" ;;
    esac
    echo "Prepared $dir ($set_name): $(ls "$dir/supabase/migrations" | cut -c1-14 | tr '\n' ' ')"
    ;;
  *) echo "usage: members-subset.sh verify | prepare <dir> <foundation|all> | held | unheld" >&2; exit 2 ;;
esac
