#!/usr/bin/env bash
# Protects the ordinary staging deploy (.github/workflows/deploy-db-staging.yml)
# from applying 20261122000000_member_access on its own. That migration turns
# on the pilot membership gate and grants nobody, so applying it without the
# founder's grant in the same transaction would lock everyone out. It may
# only be applied by .github/workflows/staging-activate-member-access.yml.
#
# Reads the staging migration history (read only, scripts/db/staging-pending-migrations.sh), then:
#   20261122000000 pending:
#     apply  REFUSED (exit 1), before anything can be pushed.
#     plan   allowed (a dry run changes nothing); says the migration is reserved.
#     check  allowed; reports gate_pending=true so only the checks that don't
#            depend on the gate run (001, 003, 004, 006). 002, 005 and 007
#            describe the state AFTER activation, and run inside the
#            activation rehearsal instead.
#   20261122000000 recorded: every mode as before (gate_pending=false).
# Fails closed: an unreadable history, an unknown mode or a missing setting
# stops the job (exit 1), whatever the mode.
#
# Inputs: MODE (plan, apply or check), STAGING_DATABASE_URL.
# Writes gate_pending=true|false to $GITHUB_OUTPUT when set.
set -euo pipefail
cd "$(dirname "$0")/../.."
GATE=20261122000000
fail() { echo "::error::$1"; exit 1; }
case "${MODE:-}" in plan|apply|check) ;; *) fail "Unknown or missing mode. Nothing was done." ;; esac
pending="$(scripts/db/staging-pending-migrations.sh)" || fail "Could not read the staging migration history, so the membership gate protection can't be checked. Nothing was done."
echo "Not yet applied on staging: ${pending:-none}"
if [[ " $pending " == *" $GATE "* ]]; then
  if [ "$MODE" = apply ]; then
    fail "$GATE (pilot membership) is pending on staging. It may only be applied by the \"Activate pilot membership on staging\" workflow, which grants the founder in the same transaction. This workflow refuses to apply it. Nothing was done."
  fi
  echo "$GATE (pilot membership) is pending and is reserved for the activation workflow; $MODE mode changes nothing."
  gate_pending=true
else
  gate_pending=false
fi
if [ -n "${GITHUB_OUTPUT:-}" ]; then echo "gate_pending=$gate_pending" >> "$GITHUB_OUTPUT"; fi
echo "gate_pending=$gate_pending"
