#!/usr/bin/env bash
# The Production subset of migrations and checks (supabase/production-*.txt).
#
#   production-subset.sh verify             every listed migration exists, is on
#                                           the approved list with its checksum,
#                                           in order, and the social core is not
#                                           listed; every listed check exists
#   production-subset.sh prepare <dir>      a Supabase project folder in <dir>
#                                           with config.toml and ONLY the listed
#                                           migrations, for `supabase --workdir`
#   production-subset.sh test               on an EMPTY throwaway database
#                                           (DATABASE_URL): bootstrap, apply only
#                                           the listed migrations, run only the
#                                           listed checks
set -euo pipefail
cd "$(dirname "$0")/../.."

list() { grep -vE '^\s*(#|$)' "$1"; }
MIGRATIONS=supabase/production-migrations.txt
CHECKS=supabase/production-checks.txt
fail() { echo "::error::$1" >&2; exit 1; }

verify() {
  local prev="" m sum
  [ -s "$MIGRATIONS" ] || fail "$MIGRATIONS is missing or empty."
  while read -r m; do
    [[ "$m" =~ ^[0-9]{14}_[a-z0-9_]+\.sql$ ]] || fail "Malformed migration name in $MIGRATIONS: $m"
    [ -f "supabase/migrations/$m" ] || fail "Listed migration not found: $m"
    sum="$(sha256sum "supabase/migrations/$m" | cut -d' ' -f1)"
    grep -qxF "$sum  supabase/migrations/$m" supabase/approved-migrations.sha256 || fail "Listed migration is not approved with this checksum: $m"
    [ -z "$prev" ] || [[ "$m" > "$prev" ]] || fail "Listed migrations are not in order: $prev then $m"
    prev="$m"
  done < <(list "$MIGRATIONS")
  if list "$MIGRATIONS" | grep -q '^20261117000000_social_core\.sql$'; then fail "The social core must not be listed for Production yet."; fi
  while read -r c; do
    [ -f "supabase/tests/$c" ] || fail "Listed check not found: $c"
  done < <(list "$CHECKS")
  if list "$CHECKS" | grep -q '^005_social_core\.sql$'; then fail "The social core check must not run before the social core is deployed."; fi
  echo "Production subset: $(list "$MIGRATIONS" | wc -l | tr -d ' ') approved migrations, $(list "$CHECKS" | wc -l | tr -d ' ') checks; the social core is not included."
}

case "${1:-}" in
  verify) verify ;;
  prepare)
    verify >/dev/null
    dir="${2:?usage: production-subset.sh prepare <dir>}"
    rm -rf "$dir"; mkdir -p "$dir/supabase/migrations"
    # The project config, and the email templates it names (nothing else).
    cp supabase/config.toml "$dir/supabase/config.toml"
    if [ -d supabase/templates ]; then cp -r supabase/templates "$dir/supabase/templates"; fi
    while read -r m; do cp "supabase/migrations/$m" "$dir/supabase/migrations/$m"; done < <(list "$MIGRATIONS")
    echo "Prepared $dir with: $(ls "$dir/supabase/migrations" | tr '\n' ' ')"
    ;;
  test)
    verify
    : "${DATABASE_URL:?Set DATABASE_URL to an empty test database}"
    case "$DATABASE_URL" in *supabase.co*|*supabase.com*) fail "Refusing: this runs on throwaway databases only." ;; esac
    PSQL=(psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -q -X)
    [ "$("${PSQL[@]}" -At -c "select count(*) from pg_namespace where nspname = 'auth'")" = 0 ] || fail "Refusing: the database is not empty."
    "${PSQL[@]}" -f scripts/db/bootstrap-roles.sql
    "${PSQL[@]}" -f scripts/db/bootstrap-supabase-stub.sql
    while read -r m; do echo "Applying $m"; "${PSQL[@]}" -f "supabase/migrations/$m"; done < <(list "$MIGRATIONS")
    [ "$("${PSQL[@]}" -At -c "select to_regnamespace('social') is null")" = t ] || fail "The social schema exists after the Production subset."
    while read -r c; do echo "Running $c"; "${PSQL[@]}" -f "supabase/tests/$c"; done < <(list "$CHECKS")
    echo "Production subset checks passed (no social core)."
    ;;
  *) echo "usage: production-subset.sh verify | prepare <dir> | test" >&2; exit 2 ;;
esac
