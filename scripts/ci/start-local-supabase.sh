#!/usr/bin/env bash
# Starts the throwaway local Supabase used by the CI jobs (Integration and
# Browser). Never touches a hosted project.
#
# Why this exists: the local stack binds host ports 54320 to 54329, which sit
# inside Linux's default range for temporary outgoing connections (32768 to
# 60999). While Docker pulls images it opens many outgoing connections, and
# one of them can briefly take a port Supabase needs, so start-up fails with
# "address already in use". This script:
#   1. on CI runners, reserves those ports so temporary connections never use
#      them (net.ipv4.ip_local_reserved_ports), before any image is pulled;
#   2. waits until no live connection holds them;
#   3. starts Supabase, with one retry for start-up problems only. On failure
#      it prints which ports were busy. Tests themselves are never retried.
#
# Usage: scripts/ci/start-local-supabase.sh            start the stack
#        scripts/ci/start-local-supabase.sh --ports    print the ports and exit
set -euo pipefail
cd "$(dirname "$0")/../.."

EXCLUDE=realtime,storage-api,imgproxy,postgres-meta,studio,edge-runtime,logflare,vector,supavisor

# Every host port the local stack is configured to bind.
PORTS=$(grep -E '^[[:space:]]*(port|shadow_port)[[:space:]]*=[[:space:]]*[0-9]+' supabase/config.toml | grep -oE '[0-9]+$' | sort -un | paste -sd, -)
if [ -z "$PORTS" ]; then
  echo "No ports found in supabase/config.toml" >&2
  exit 1
fi
if [ "${1-}" = "--ports" ]; then
  echo "$PORTS"
  exit 0
fi

# Ports held by any socket that is not merely waiting to close (TIME_WAIT,
# state 06, never blocks the listener Docker opens).
busy_ports() {
  local p hex tables=()
  # Read whichever socket tables exist (some machines have no IPv6 table).
  for t in /proc/net/tcp /proc/net/tcp6; do [ -r "$t" ] && tables+=("$t"); done
  for p in ${PORTS//,/ }; do
    hex=$(printf '%04X' "$p")
    if awk -v h=":$hex" 'FNR > 1 && substr($2, length($2) - 4) == h && $4 != "06" { found = 1 } END { exit !found }' "${tables[@]}"; then
      echo "$p"
    fi
  done
}

wait_for_free_ports() {
  local busy
  for _ in $(seq 1 30); do
    busy=$(busy_ports | paste -sd, -)
    [ -z "$busy" ] && return 0
    sleep 1
  done
  echo "::warning::Ports still in use after 30 seconds: $busy"
}

reserve_ports() {
  # Only on CI runners: a developer's machine is left alone.
  [ "${GITHUB_ACTIONS:-}" = true ] || return 0
  local current sudo=""
  [ "$(id -u)" -eq 0 ] || sudo=sudo
  current=$(sysctl -n net.ipv4.ip_local_reserved_ports)
  $sudo sysctl -q -w net.ipv4.ip_local_reserved_ports="${current:+$current,}$PORTS"
  echo "Reserved from temporary connections: $(sysctl -n net.ipv4.ip_local_reserved_ports)"
}

start() {
  wait_for_free_ports
  supabase start -x "$EXCLUDE"
}

reserve_ports
if ! start; then
  echo "::warning::supabase start failed; retrying once (start-up only, tests are never retried). Busy ports: $(busy_ports | paste -sd, -)"
  supabase stop --no-backup || true
  start
fi
