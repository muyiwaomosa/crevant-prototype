#!/usr/bin/env bash
# Every migration must be listed, with its exact checksum, in
# supabase/approved-migrations.sha256. That file only changes through a
# reviewed pull request, so a migration cannot reach staging unless it was
# approved, and an approved migration cannot be altered afterwards.
#
# To approve a new migration in a pull request:
#   sha256sum supabase/migrations/*.sql > supabase/approved-migrations.sha256
set -euo pipefail
cd "$(dirname "$0")/../.."
MANIFEST=supabase/approved-migrations.sha256

[ -f "$MANIFEST" ] || { echo "::error::$MANIFEST is missing."; exit 1; }

listed="$(awk '{print $2}' "$MANIFEST" | sort)"
present="$(ls supabase/migrations/*.sql 2>/dev/null | sort)"

if [ "$listed" != "$present" ]; then
  echo "::error::Migration files and the approved list differ."
  echo "Not approved (present but not listed):"
  comm -13 <(echo "$listed") <(echo "$present") | sed 's/^/  /'
  echo "Approved but missing:"
  comm -23 <(echo "$listed") <(echo "$present") | sed 's/^/  /'
  exit 1
fi

if ! sha256sum --check --quiet "$MANIFEST"; then
  echo "::error::An approved migration has been changed since it was approved."
  exit 1
fi

echo "All $(echo "$present" | grep -c .) migration(s) are approved and unchanged:"
echo "$present" | sed 's/^/  /'
