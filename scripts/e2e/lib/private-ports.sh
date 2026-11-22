# Sourced, not run. Helpers for the throwaway containers the e2e scripts
# start on fixed host ports (private Edge runtime copies, test Postgres).
#
# Why: those ports (54390, 54397 to 54406, 55433, 55434) sit inside Linux's
# range for temporary outgoing connections (32768 to 60999 on GitHub's Ubuntu
# runners; printed below). Pulling an image, or any other traffic, can briefly
# give one of them to an outgoing connection, and the container then can't
# bind it. Before, a readiness loop gave up silently after a minute and the
# test failed later with "connection refused" (seen on 54398). This applies
# the fix already used for the Supabase ports (scripts/ci/start-local-supabase.sh)
# and the waitlist journey's 54410 (scripts/e2e/waitlist-journey.sh):
#   1. on CI runners, reserve the ports from temporary connections;
#   2. pull the image before anything binds;
#   3. wait until no live socket holds the ports, and fail clearly if one does;
#   4. after starting, wait until each container answers, and fail clearly
#      (with its state and recent logs, redacted) if it stops or never answers.
#
# Output never includes secret values: container logs pass through
# private_ports_redact, which masks URL credentials and every value listed in
# PRIVATE_PORTS_REDACT (space separated; set it to the script's test secrets).

# The kernel's range for temporary outgoing connections, for the log.
private_ports_range() { tr -s '[:space:]' ' ' </proc/sys/net/ipv4/ip_local_port_range | sed 's/ $//; s/ / to /'; }

# Sockets on a port, other than ones merely waiting to close (TIME_WAIT, 06).
# Prints "state local remote" per socket (addresses in the kernel's hex form);
# exit status 0 when there is at least one.
private_ports_holders() { # port
  local hex t tables=()
  hex=$(printf '%04X' "$1")
  for t in /proc/net/tcp /proc/net/tcp6; do [ -r "$t" ] && tables+=("$t"); done
  awk -v h=":$hex" 'FNR > 1 && substr($2, length($2) - 4) == h && $4 != "06" { print "state=" $4 " local=" $2 " remote=" $3; found = 1 } END { exit !found }' "${tables[@]}"
}

# Reserve (CI only), pull, then wait until every port is free.
# Fails with the holding sockets if a port is still taken after 30 seconds.
private_ports_prepare() { # image port...
  local image=$1; shift
  local p busy sudo_cmd="" current
  echo "Temporary connection range: $(private_ports_range). Private ports: $*"
  if [ "${GITHUB_ACTIONS:-}" = true ]; then
    [ "$(id -u)" -eq 0 ] || sudo_cmd=sudo
    current=$(sysctl -n net.ipv4.ip_local_reserved_ports)
    $sudo_cmd sysctl -q -w net.ipv4.ip_local_reserved_ports="${current:+$current,}$(IFS=,; echo "$*")"
    echo "Reserved from temporary connections: $(sysctl -n net.ipv4.ip_local_reserved_ports)"
  fi
  docker image inspect "$image" >/dev/null 2>&1 || docker pull -q "$image" >/dev/null
  for _ in $(seq 1 "${PRIVATE_PORTS_WAIT:-30}"); do
    busy=""
    for p in "$@"; do private_ports_holders "$p" >/dev/null && busy="$busy $p"; done
    [ -z "$busy" ] && return 0
    sleep 1
  done
  echo "::error::Private test ports still in use after ${PRIVATE_PORTS_WAIT:-30} seconds:$busy" >&2
  for p in $busy; do echo "Port $p is held by:" >&2; private_ports_holders "$p" >&2 || true; done
  return 1
}

# Masks URL credentials and each value in PRIVATE_PORTS_REDACT.
private_ports_redact() {
  local v script='s#(://[^:/@[:space:]]+):[^@/[:space:]]+@#\1:***@#g'
  for v in ${PRIVATE_PORTS_REDACT:-}; do
    [ -n "$v" ] && script="$script;s#$(printf '%s' "$v" | sed 's/[][\\.^$*+?(){}|#/]/\\&/g')#***#g"
  done
  sed -E "$script"
}

# A container's state and its last lines of output, redacted, on stderr.
private_ports_explain() { # container port
  echo "Container $1: $(docker inspect -f 'status={{.State.Status}} exit={{.State.ExitCode}} oom={{.State.OOMKilled}} error={{.State.Error}}' "$1" 2>&1 | private_ports_redact)" >&2
  if [ -n "${2-}" ]; then
    echo "Sockets on port $2:" >&2
    private_ports_holders "$2" >&2 || echo "  none" >&2
  fi
  echo "Last 40 lines of $1's output (redacted):" >&2
  docker logs --tail 40 "$1" 2>&1 | private_ports_redact >&2 || true
}

# Waits until a container answers on its port (any HTTP reply), failing early
# if it stops and with an explanation if it never answers.
private_ports_wait_http() { # container port url [seconds]
  local name=$1 port=$2 url=$3 secs=${4:-60} code state
  for _ in $(seq 1 "$secs"); do
    code=$(curl -s -o /dev/null -m 5 -w '%{http_code}' -X OPTIONS "$url" || true)
    [ "$code" != "000" ] && [ -n "$code" ] && return 0
    state=$(docker inspect -f '{{.State.Status}}' "$name" 2>/dev/null || echo missing)
    if [ "$state" != running ] && [ "$state" != created ]; then
      echo "::error::$name stopped before answering on port $port" >&2
      private_ports_explain "$name" "$port"
      return 1
    fi
    sleep 1
  done
  echo "::error::$name did not answer on port $port within ${secs} seconds" >&2
  private_ports_explain "$name" "$port"
  return 1
}

# Waits until the local Supabase gateway serves a function (OPTIONS with an
# origin answers 204); explains with the Edge runtime's output if it never does.
private_ports_wait_gateway() { # url [seconds]
  local url=$1 secs=${2:-60} code=""
  for _ in $(seq 1 "$secs"); do
    code=$(curl -s -o /dev/null -m 5 -w '%{http_code}' -X OPTIONS -H 'Origin: http://127.0.0.1:4176' "$url" || true)
    [ "$code" = 204 ] && return 0
    sleep 1
  done
  echo "::error::The local gateway did not serve $url within ${secs} seconds (last status: ${code:-none})" >&2
  private_ports_explain supabase_edge_runtime_crevant-prototype
  return 1
}
