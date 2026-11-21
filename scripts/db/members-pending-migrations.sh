#!/usr/bin/env bash
# MEMBER PRODUCTION: prints the repository's migration versions NOT yet
# recorded in the database at MEMBERS_PRODUCTION_DATABASE_URL, space separated
# (empty when none). A database with no migration history counts as nothing
# recorded. READ ONLY: a read-only transaction in a read-only session. Fails
# (non-zero, nothing on stdout) if the database can't be read, so callers fail closed.
set -euo pipefail
cd "$(dirname "$0")/../.."
: "${MEMBERS_PRODUCTION_DATABASE_URL:?MEMBERS_PRODUCTION_DATABASE_URL is not set}"
recorded="$(PGOPTIONS='-c default_transaction_read_only=on' psql "$MEMBERS_PRODUCTION_DATABASE_URL" -X -q -At -v ON_ERROR_STOP=1 \
  -c "begin transaction read only" \
  -c "select version from supabase_migrations.schema_migrations where to_regclass('supabase_migrations.schema_migrations') is not null order by version" \
  -c "rollback" 2>/dev/null)" || {
  # No history table at all is a fresh project; anything else is an error.
  has="$(PGOPTIONS='-c default_transaction_read_only=on' psql "$MEMBERS_PRODUCTION_DATABASE_URL" -X -q -At -v ON_ERROR_STOP=1 \
    -c "select to_regclass('supabase_migrations.schema_migrations') is not null")" || { echo "Could not read the member Production migration history." >&2; exit 1; }
  [ "$has" = f ] || { echo "Could not read the member Production migration history." >&2; exit 1; }
  recorded=""
}
pending=()
for f in supabase/migrations/*.sql; do
  v="$(basename "$f" | cut -d_ -f1)"
  [[ "$v" =~ ^[0-9]{14}$ ]] || { echo "Unexpected migration file name: $f" >&2; exit 1; }
  grep -qx "$v" <<<"$recorded" || pending+=("$v")
done
echo "${pending[*]:-}"
