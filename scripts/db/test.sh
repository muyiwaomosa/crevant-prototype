#!/usr/bin/env bash
# Apply all migrations to an empty PostgreSQL database and run the database tests.
# Usage: DATABASE_URL=postgres://user:pass@host:5432/db scripts/db/test.sh
set -euo pipefail
cd "$(dirname "$0")/../.."
: "${DATABASE_URL:?Set DATABASE_URL to an empty test database}"
PSQL=(psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -q -X)

echo "Bootstrapping Supabase roles (test only)"
"${PSQL[@]}" -f scripts/db/bootstrap-roles.sql

for f in supabase/migrations/*.sql; do
  echo "Applying $f"
  "${PSQL[@]}" -f "$f"
done

for f in supabase/tests/*.sql; do
  echo "Running $f"
  "${PSQL[@]}" -f "$f"
done
echo "Database checks passed"
