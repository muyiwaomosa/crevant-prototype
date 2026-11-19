#!/usr/bin/env bash
# Prints the repository's migration versions that are NOT yet recorded in the
# database at STAGING_DATABASE_URL, space separated (empty when none).
# READ ONLY: one query in a read-only transaction, in a read-only session.
# Fails (non-zero, prints nothing on stdout) if the history can't be read, so
# callers fail closed.
#
# Used by .github/workflows/deploy-db-staging.yml (through
# scripts/db/staging-membership-gate.sh) and
# .github/workflows/staging-activate-member-access.yml.
set -euo pipefail
cd "$(dirname "$0")/../.."
: "${STAGING_DATABASE_URL:?STAGING_DATABASE_URL is not set}"
recorded="$(PGOPTIONS='-c default_transaction_read_only=on' psql "$STAGING_DATABASE_URL" -X -q -At -v ON_ERROR_STOP=1 \
  -c "begin transaction read only" \
  -c "select version from supabase_migrations.schema_migrations order by version" \
  -c "rollback")" || { echo "Could not read the staging migration history." >&2; exit 1; }
pending=()
for f in supabase/migrations/*.sql; do
  v="$(basename "$f" | cut -d_ -f1)"
  [[ "$v" =~ ^[0-9]{14}$ ]] || { echo "Unexpected migration file name: $f" >&2; exit 1; }
  grep -qx "$v" <<<"$recorded" || pending+=("$v")
done
echo "${pending[*]:-}"
