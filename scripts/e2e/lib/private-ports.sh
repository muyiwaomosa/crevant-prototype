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
# Output never includes secret values. Everything printed from a container
# (its state and its logs) passes through private_ports_redact, which masks:
#   * the value of every environment variable passed to that container whose
#     name looks secret (KEY, SECRET, TOKEN, PASSWORD, PW, SALT, JWT, AUTH,
#     CREDENTIAL, PRIVATE, COOKIE, DB_URL, DATABASE_URL, DSN) and is at least 6
#     characters (shorter ones, like "1" or "dummy", aren't secrets and would
#     mask ordinary words), read from the container itself, so no secret
#     depends on a hand-kept list;
#   * every value in PRIVATE_PORTS_REDACT (space separated; the script's own
#     test secrets, for output that isn't tied to one container);
#   * by shape, anywhere: URL passwords, JWTs, Supabase secret and publishable
#     keys, Bearer tokens, token/key/signature query values, email addresses.

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

# On CI runners only, reserve ports from temporary outgoing connections.
# Takes a comma-separated list; ranges like 58461-58520 are allowed.
private_ports_reserve() { # list
  [ "${GITHUB_ACTIONS:-}" = true ] || return 0
  local sudo_cmd="" current
  [ "$(id -u)" -eq 0 ] || sudo_cmd=sudo
  current=$(sysctl -n net.ipv4.ip_local_reserved_ports)
  $sudo_cmd sysctl -q -w net.ipv4.ip_local_reserved_ports="${current:+$current,}$1"
  echo "Reserved from temporary connections: $(sysctl -n net.ipv4.ip_local_reserved_ports)"
}

# Reserve (CI only), pull, then wait until every port is free.
# Fails with the holding sockets if a port is still taken after 30 seconds.
private_ports_prepare() { # image port...
  local image=$1; shift
  local p busy
  echo "Temporary connection range: $(private_ports_range). Private ports: $*"
  private_ports_reserve "$(IFS=,; echo "$*")"
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

# The values of a container's secret-looking environment variables, one per line.
private_ports_container_secrets() { # container
  docker inspect -f '{{range .Config.Env}}{{println .}}{{end}}' "$1" 2>/dev/null \
    | awk -F= 'toupper($1) ~ /(KEY|SECRET|TOKEN|PASSWORD|PASSWD|_PW$|^PW$|SALT|JWT|AUTH|CREDENTIAL|PRIVATE|COOKIE|DB_URL|DATABASE_URL|DSN)/ { v = substr($0, length($1) + 2); if (length(v) >= 6) print v }'
}

# Reads stdin, writes it with secrets masked (see the top of this file).
# Arguments: containers whose environment values are masked too.
private_ports_redact() { # [container...]
  local v c script=""
  # Literal values, longest first (so one containing another is fully masked).
  while IFS= read -r v; do
    [ -n "$v" ] && script="$script;s#$(printf '%s' "$v" | sed 's/[][\\.^$*+?(){}|#/]/\\&/g')#***#g"
  done < <( { for v in ${PRIVATE_PORTS_REDACT:-}; do printf '%s\n' "$v"; done
              for c in "$@"; do private_ports_container_secrets "$c"; done
            } | awk 'length($0) > 0 && !seen[$0]++ { print length($0) "\t" $0 }' | sort -t "$(printf '\t')" -k1,1nr | cut -f2- )
  # Then by shape.
  script="${script#;}${script:+;}s#(://[^:/@[:space:]]+):[^@/[:space:]]+@#\1:***@#g"
  script="$script;s#eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]*#***#g"
  script="$script;s#sb_(secret|publishable)_[A-Za-z0-9_-]+#sb_\1_***#g"
  script="$script;s#(Bearer)[[:space:]]+[A-Za-z0-9._~+/=-]+#\1 ***#g"
  script="$script;s#([?&](token|apikey|key|sig|signature)=)[^&[:space:]\"']+#\1***#Ig"
  script="$script;s#[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}#***@***#g"
  sed -E "$script"
}

# A container's state and its last lines of output, redacted, on stderr.
private_ports_explain() { # container port
  echo "Container $1: $(docker inspect -f 'status={{.State.Status}} exit={{.State.ExitCode}} oom={{.State.OOMKilled}} error={{.State.Error}}' "$1" 2>&1 | private_ports_redact "$1")" >&2
  if [ -n "${2-}" ]; then
    echo "Sockets on port $2:" >&2
    private_ports_holders "$2" >&2 || echo "  none" >&2
  fi
  echo "Last 40 lines of $1's output (redacted):" >&2
  docker logs --tail 40 "$1" 2>&1 | private_ports_redact "$1" >&2 || true
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
