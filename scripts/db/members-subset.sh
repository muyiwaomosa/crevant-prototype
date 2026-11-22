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
#   later       after 20261129000000 (20261130000000 open registration): applied by
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
set -euo pipefail
cd "$(dirname "$0")/../.."
fail() { echo "::error::$1" >&2; exit 1; }
FIRST=20261106000000
LAST_FOUNDATION=20261121000000
ACTIVATION=20261122000000
GATE=20261129000000

all() { local f; for f in supabase/migrations/*.sql; do basename "$f"; done; }
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
  echo "Member Production sets: foundation $(foundation | wc -l | tr -d ' ') migrations ($FIRST to $LAST_FOUNDATION); activation $ACTIVATION to $GATE in one transaction, the gate last ($(wc -l <<<"$want" | tr -d ' ') migrations); $(all | awk -v b="$GATE" 'substr($0,1,14)>b' | wc -l | tr -d ' ') later."
}

case "${1:-}" in
  verify) verify ;;
  prepare)
    verify >/dev/null
    dir="${2:?usage: members-subset.sh prepare <dir> <foundation|all>}"
    set_name="${3:?usage: members-subset.sh prepare <dir> <foundation|all>}"
    rm -rf "$dir"; mkdir -p "$dir/supabase/migrations"
    cp supabase/config.toml "$dir/supabase/config.toml"
    if [ -d supabase/templates ]; then cp -r supabase/templates "$dir/supabase/templates"; fi
    case "$set_name" in
      foundation) for m in $(foundation); do cp "supabase/migrations/$m" "$dir/supabase/migrations/$m"; done ;;
      all) for m in $(all); do cp "supabase/migrations/$m" "$dir/supabase/migrations/$m"; done ;;
      *) fail "Unknown set: $set_name (foundation or all)" ;;
    esac
    echo "Prepared $dir ($set_name): $(ls "$dir/supabase/migrations" | cut -c1-14 | tr '\n' ' ')"
    ;;
  *) echo "usage: members-subset.sh verify | prepare <dir> <foundation|all>" >&2; exit 2 ;;
esac
