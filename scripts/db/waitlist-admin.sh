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
set -euo pipefail
: "${DATABASE_URL:?Set DATABASE_URL}"
: "${ACTION:?Set ACTION to summary, delete or purge}"

PSQL=(psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -q -X -At)

case "$ACTION" in
  summary)
    echo "Waitlist summary (counts only):"
    "${PSQL[@]}" -F ' | ' -c "select 'total', count(*) from ops.waitlist"
    "${PSQL[@]}" -F ' | ' -c "select 'marketing opt-in', count(*) from ops.waitlist where marketing_consent"
    "${PSQL[@]}" -F ' | ' -c "select source, sum(people) from ops.waitlist_summary group by source order by 2 desc"
    "${PSQL[@]}" -F ' | ' -c "select 'shares content: ' || shares_content, sum(people) from ops.waitlist_summary group by shares_content order by 2 desc"
    "${PSQL[@]}" -F ' | ' -c "select 'switch', case when enabled then 'ON' else 'OFF' end from ops.settings where key = 'waitlist_submissions'"
    ;;
  delete)
    id="${WAITLIST_ID:-}"
    if ! [[ "$id" =~ ^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$ ]]; then
      echo "::error::WAITLIST_ID must be a waitlist id (a UUID), not an email address." >&2
      exit 1
    fi
    # psql only substitutes :'var' in scripts read from stdin, not with -c.
    result="$("${PSQL[@]}" -v id="$id" <<<"select ops.waitlist_delete(:'id'::uuid);")"
    echo "Deleted: $result"
    ;;
  purge)
    months="${RETENTION_MONTHS:-}"
    if ! [[ "$months" =~ ^[0-9]{1,3}$ ]] || [ "$months" -lt 1 ] || [ "$months" -gt 120 ]; then
      echo "::error::RETENTION_MONTHS must be a whole number from 1 to 120." >&2
      exit 1
    fi
    result="$("${PSQL[@]}" -v m="$months" <<<"select ops.waitlist_purge_expired(:'m'::integer);")"
    echo "Purged entries older than $months months: $result"
    ;;
  *)
    echo "::error::ACTION must be summary, delete or purge." >&2
    exit 1
    ;;
esac
