#!/usr/bin/env bash
# Runs the member authorization surface audit (scripts/db/audit/member-surface.sql)
# READ ONLY against one database, and prints only PASS / FAIL lines.
#
#   Local throwaway database (what CI does through scripts/db/test.sh):
#     AUDIT_TARGET=local DATABASE_URL=postgresql://... scripts/db/audit-member-surface.sh
#
#   Hosted staging (the pilot database): ONLY with the founder's explicit
#   approval for that run. It reuses the staging target verifier, so the
#   connection must name the approved staging project, over TLS, and the
#   person running it must type the project reference to confirm:
#     AUDIT_TARGET=staging EXPECTED_PROJECT_REF=kpudeppgokpjhvaqrprn \
#     SUPABASE_PROJECT_REF=... CONFIRM_PROJECT_REF=... STAGING_DATABASE_URL=... \
#     scripts/db/audit-member-surface.sh
#
# It never runs against Production: any connection naming the Production
# project is refused before connecting. The session is read only
# (default_transaction_read_only), and the audit itself runs in a READ ONLY
# transaction that is rolled back. It reads the system catalogs only: no
# table rows and no personal data. The connection string is never printed.
set -euo pipefail
cd "$(dirname "$0")/../.."

fail() { echo "FAIL: $1" >&2; exit 1; }

PRODUCTION_REF="$(node -p "require('./config/supabase-projects.json').production.ref || ''")"
STAGING_REF="$(node -p "require('./config/supabase-projects.json').staging.ref || ''")"

case "${AUDIT_TARGET:-}" in
  local)
    URL="${DATABASE_URL:-}"
    [ -n "$URL" ] || fail "Set DATABASE_URL to the local throwaway database."
    case "$URL" in
      *supabase.co*|*supabase.com*) fail "AUDIT_TARGET=local is for local throwaway databases, not Supabase projects." ;;
    esac
    ;;
  staging)
    [ "${EXPECTED_PROJECT_REF:-}" = "$STAGING_REF" ] || fail "EXPECTED_PROJECT_REF must be the staging project recorded in config/supabase-projects.json."
    URL="${STAGING_DATABASE_URL:-}"
    [ -n "$URL" ] || fail "Set STAGING_DATABASE_URL (never printed)."
    scripts/db/verify-staging-target.sh >/dev/null || fail "The staging target checks did not pass; nothing was run."
    ;;
  *)
    fail "Set AUDIT_TARGET to local or staging. There is no Production target."
    ;;
esac

if [ -n "$PRODUCTION_REF" ] && [[ "$URL" == *"$PRODUCTION_REF"* ]]; then
  fail "This connection names the Production project. The member surface audit never runs against Production."
fi

PGOPTIONS="-c default_transaction_read_only=on" psql "$URL" -v ON_ERROR_STOP=1 -q -X -f scripts/db/audit/member-surface.sql 2>&1 \
  | sed -n 's/.*\(PASS: .*\)/\1/p; s/.*\(FAIL: .*\)/\1/p'
status=${PIPESTATUS[0]}
[ "$status" -eq 0 ] || fail "the member surface audit found a problem (see above)."
echo "Member surface audit passed (${AUDIT_TARGET})."
