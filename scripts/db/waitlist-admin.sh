#!/usr/bin/env bash
# Waitlist administration against the database in $DATABASE_URL.
# Run by .github/workflows/waitlist-admin.yml (staging only, with approval),
# or against a throwaway local database for testing.
#
# Uses only the waitlist_api.admin_* entry points, so it works with the
# restricted waitlist_admin login, which can do nothing else. Set
# REQUIRE_ADMIN_ROLE=1 (the workflow does) to refuse any other login.
#
#   ACTION=summary                     counts: totals, verified, groups, recent
#                                      signups, status, waves, switch
#   ACTION=status                      the switch and notice version only
#   ACTION=delete  WAITLIST_ID=<uuid>  delete one person on request (by id from
#                                      the Supabase dashboard, never an email)
#   ACTION=purge   RETENTION_MONTHS=12 the retention purge
#   ACTION=set-notice-version NOTICE_VERSION=<version>
#   ACTION=open                        refused until a notice version is set
#   ACTION=close                       always allowed, immediate
#   ACTION=wave-preview  GROUP=<group>
#   ACTION=wave-select   WAVE=<name> GROUP=<group> REASONS=<reasons> COUNT=<1-100>
#                        Waves take verified entries only (enforced by the database).
#   ACTION=wave-summary  WAVE=<name>
#   ACTION=wave-clear    WAVE=<name>
#
#   GROUP:   any, active_creator, aspiring_creator or supporter
#   REASONS: group_balance, targeted_feedback or both
#
# Prints counts only. Never prints or selects an email address or id list.
set -euo pipefail
: "${DATABASE_URL:?Set DATABASE_URL}"
: "${ACTION:?Set ACTION}"

fail() { echo "::error::$1" >&2; exit 1; }

if [ "${REQUIRE_ADMIN_ROLE:-}" = "1" ]; then
  user="$(python3 -c 'import os,sys; from urllib.parse import urlsplit, unquote; print(unquote(urlsplit(os.environ["DATABASE_URL"]).username or ""))')"
  [[ "$user" =~ ^waitlist_admin(\.[a-z0-9]{20})?$ ]] || fail "The admin workflow must log in as waitlist_admin, the restricted admin role."
fi

PSQL=(psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -q -X -At)
# psql only substitutes :'var' in scripts read from stdin, not with -c.
run() { "${PSQL[@]}" "$@"; }
# Prints "<label>: <result>". The result is captured first, so a database
# refusal stops the script with an error instead of printing an empty result.
say() { local label=$1 out; shift; out="$("$@")"; echo "$label: $out"; }

group() {
  case "${GROUP:-}" in any|active_creator|aspiring_creator|supporter) echo "$GROUP" ;; *) fail "GROUP must be any, active_creator, aspiring_creator or supporter." ;; esac
}
wave() {
  [[ "${WAVE:-}" =~ ^[a-z0-9_-]{1,40}$ ]] || fail "WAVE must be 1 to 40 lowercase letters, digits, _ or -."
  echo "$WAVE"
}

case "$ACTION" in
  summary)
    echo "Waitlist summary (counts only):"
    run -c "select jsonb_pretty(waitlist_api.admin_summary())"
    ;;
  status)
    say "Waitlist status" run -c "select waitlist_api.admin_status()"
    ;;
  delete)
    id="${WAITLIST_ID:-}"
    [[ "$id" =~ ^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$ ]] || fail "WAITLIST_ID must be a waitlist id (a UUID), not an email address."
    say "Deleted" run -v id="$id" <<<"select waitlist_api.admin_delete(:'id'::uuid);"
    ;;
  purge)
    months="${RETENTION_MONTHS:-}"
    if ! [[ "$months" =~ ^[0-9]{1,3}$ ]] || [ "$months" -lt 1 ] || [ "$months" -gt 120 ]; then
      fail "RETENTION_MONTHS must be a whole number from 1 to 120."
    fi
    say "Purged entries older than $months months" run -v m="$months" <<<"select waitlist_api.admin_purge(:'m'::integer);"
    ;;
  set-notice-version)
    [[ "${NOTICE_VERSION:-}" =~ ^[a-z0-9._-]{1,40}$ ]] || fail "NOTICE_VERSION must be 1 to 40 lowercase letters, digits, dots, _ or -."
    say "Notice version recorded" run -v v="$NOTICE_VERSION" <<<"select waitlist_api.admin_set_notice_version(:'v');"
    ;;
  open)
    say "Opened" run -c "select waitlist_api.admin_open()"
    ;;
  close)
    say "Closed" run -c "select waitlist_api.admin_close()"
    ;;
  wave-preview)
    g="$(group)"
    say "Wave preview (verified entries only can be picked)" run -v g="$g" <<<"select waitlist_api.admin_wave_preview(:'g');"
    ;;
  wave-select)
    w="$(wave)"; g="$(group)"
    case "${REASONS:-}" in
      group_balance) r='{group_balance}' ;;
      targeted_feedback) r='{targeted_feedback}' ;;
      both) r='{group_balance,targeted_feedback}' ;;
      *) fail "REASONS must be group_balance, targeted_feedback or both." ;;
    esac
    count="${COUNT:-}"
    if ! [[ "$count" =~ ^[0-9]{1,3}$ ]] || [ "$count" -lt 1 ] || [ "$count" -gt 100 ]; then
      fail "COUNT must be a whole number from 1 to 100."
    fi
    say "Wave selection (verified only; no invitations sent)" run -v w="$w" -v g="$g" -v r="$r" -v c="$count" <<<"select waitlist_api.admin_wave_select(:'w', :'g', :'r'::text[], :'c'::integer);"
    ;;
  wave-summary)
    w="$(wave)"
    say "Wave summary" run -v w="$w" <<<"select waitlist_api.admin_wave_summary(:'w');"
    ;;
  wave-clear)
    w="$(wave)"
    say "Wave cleared" run -v w="$w" <<<"select waitlist_api.admin_wave_clear(:'w');"
    ;;
  *)
    fail "ACTION must be summary, status, delete, purge, set-notice-version, open, close, wave-preview, wave-select, wave-summary or wave-clear."
    ;;
esac
