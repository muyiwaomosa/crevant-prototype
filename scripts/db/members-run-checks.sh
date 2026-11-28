#!/usr/bin/env bash
# MEMBER PRODUCTION: runs the checks for what is applied.
#   1. supabase/tests-members/001_member_production.sql (read-only session),
#      with the approvals from config/member-production.json;
#   2. each shared check in supabase/members-checks.txt whose migration is
#      recorded (the same staging-safe checks staging runs; a check whose
#      migration isn't recorded yet is named and skipped).
# With --require-all, every listed check must run: the end of an apply.
#
# Input: MEMBERS_PRODUCTION_DATABASE_URL. Run only after the target and the
# identity marker are verified.
set -euo pipefail
cd "$(dirname "$0")/../.."
: "${MEMBERS_PRODUCTION_DATABASE_URL:?MEMBERS_PRODUCTION_DATABASE_URL is not set}"
fail() { echo "::error::$1"; exit 1; }
require_all=false
[ "${1:-}" = --require-all ] && require_all=true

read -r photos invites < <(python3 -c "
import json; c = json.load(open('config/member-production.json'))
p, i = c.get('photosApproved'), c.get('invitationsApproved')
assert isinstance(p, bool) and isinstance(i, bool), 'approvals must be true or false'
print(str(p).lower(), str(i).lower())") || fail "config/member-production.json must set photosApproved and invitationsApproved to true or false."

echo "Running supabase/tests-members/001_member_production.sql (photos approved: $photos; invitations approved: $invites)"
PGOPTIONS='-c default_transaction_read_only=on' psql "$MEMBERS_PRODUCTION_DATABASE_URL" -X -q -v ON_ERROR_STOP=1 \
  -v photos_approved="$photos" -v invitations_approved="$invites" -f supabase/tests-members/001_member_production.sql

# Versions recorded so far (none on a new project without a history table).
recorded="$(PGOPTIONS='-c default_transaction_read_only=on' psql "$MEMBERS_PRODUCTION_DATABASE_URL" -X -q -At -v ON_ERROR_STOP=1 \
  -c "select coalesce((xpath('/row/v/text()', query_to_xml('select string_agg(version::text, '' '' order by version) as v from supabase_migrations.schema_migrations', false, true, '')))[1]::text, '') where to_regclass('supabase_migrations.schema_migrations') is not null")" \
  || fail "Could not read the migration history."
recorded="$(tr ' ' '\n' <<<"$recorded")"
# Held migrations (supabase/members-held-migrations.txt) are not applied here
# on purpose: their checks are reported as held, not skipped, so --require-all
# still demands every other check.
held="$(scripts/db/members-subset.sh held)" || fail "The member Production hold list is invalid."
skipped=0
held_checks=0
while read -r check version; do
  [ -f "supabase/tests/$check" ] || fail "Listed check not found: $check"
  if [ -n "$held" ] && grep -qx "$version" <<<"$held" && ! grep -qx "$version" <<<"$recorded"; then
    echo "Held supabase/tests/$check: $version is held for member Production (supabase/members-held-migrations.txt)"
    held_checks=$((held_checks + 1))
  elif grep -qx "$version" <<<"$recorded"; then
    echo "Running supabase/tests/$check"
    psql "$MEMBERS_PRODUCTION_DATABASE_URL" -X -q -v ON_ERROR_STOP=1 -f "supabase/tests/$check"
  else
    echo "Skipped supabase/tests/$check: $version is not applied yet"
    skipped=$((skipped + 1))
  fi
done < <(grep -vE '^\s*(#|$)' supabase/members-checks.txt)
if $require_all && [ "$skipped" -gt 0 ]; then fail "$skipped check(s) were skipped although every migration should now be applied."; fi
echo "Member Production checks passed ($skipped skipped, $held_checks held)."

