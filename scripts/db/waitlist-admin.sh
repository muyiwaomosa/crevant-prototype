#!/usr/bin/env bash
# Waitlist administration against the database in $DATABASE_URL.
# Run by .github/workflows/waitlist-admin.yml (staging only, with approval),
# or against a throwaway local database for testing.
#
#   ACTION=summary                  counts by day, source and answers; no addresses
#   ACTION=delete  WAITLIST_ID=...  delete one person on request (by waitlist id,
#                                   found in the Supabase dashboard, so no email
#                                   address is ever typed into GitHub)
#   ACTION=purge   RETENTION_MONTHS=12   delete entries with no confirmed
#                                   interest for that many months
#
# Prints counts only. Never prints or selects an email address.
#
# Uses only the waitlist_api.admin_* entry points, so it works with the
# restricted waitlist_admin login (which can do nothing else) as well as
# with the staging database login.
set -euo pipefail
: "${DATABASE_URL:?Set DATABASE_URL}"
: "${ACTION:?Set ACTION to summary, delete or purge}"

PSQL=(psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -q -X -At)

case "$ACTION" in
  summary)
    echo "Waitlist summary (counts only):"
    "${PSQL[@]}" -c "select jsonb_pretty(waitlist_api.admin_summary())"
    ;;
  delete)
    id="${WAITLIST_ID:-}"
    if ! [[ "$id" =~ ^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$ ]]; then
      echo "::error::WAITLIST_ID must be a waitlist id (a UUID), not an email address." >&2
      exit 1
    fi
    # psql only substitutes :'var' in scripts read from stdin, not with -c.
    result="$("${PSQL[@]}" -v id="$id" <<<"select waitlist_api.admin_delete(:'id'::uuid);")"
    echo "Deleted: $result"
    ;;
  purge)
    months="${RETENTION_MONTHS:-}"
    if ! [[ "$months" =~ ^[0-9]{1,3}$ ]] || [ "$months" -lt 1 ] || [ "$months" -gt 120 ]; then
      echo "::error::RETENTION_MONTHS must be a whole number from 1 to 120." >&2
      exit 1
    fi
    result="$("${PSQL[@]}" -v m="$months" <<<"select waitlist_api.admin_purge(:'m'::integer);")"
    echo "Purged entries older than $months months: $result"
    ;;
  *)
    echo "::error::ACTION must be summary, delete or purge." >&2
    exit 1
    ;;
esac
