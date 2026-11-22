# Sourced, not run. Checks what the member Edge Function copies started by
# scripts/e2e/avatar-edge.sh and scripts/e2e/post-media-edge.sh logged about
# their API keys (supabase/functions/_shared/keys.ts): which kind each copy
# holds, and that no key value, nor anything shaped like a key or JWT, ever
# appears in a copy's output. Prints PASS or FAIL lines, never a log line.
#
# key_logs_check <fn> <new> <legacy> <nokeys> <partial> <guard> <secrets>
#   fn        the function's name as logged ("avatar", "post-media")
#   new...    the container names of the copies with only the new keys, only
#             the legacy keys, no key, malformed keys, and the Production address
#   secrets   space-separated key values that must never be logged
key_logs_check() {
  local fn=$1 new=$2 legacy=$3 nokeys=$4 partial=$5 guard=$6 secrets=$7 failed=0 logs c v
  logs_of() { docker logs "$1" 2>&1; }
  has() { grep -qF -- "$2" <<<"$(logs_of "$1")"; }
  result() { if [ "$1" -eq 0 ]; then echo "PASS  $2"; else echo "FAIL  $2"; failed=1; fi; }
  has "$new" "{\"fn\":\"$fn\",\"event\":\"keys\",\"publishable\":\"new\",\"secret\":\"new\"}"; result $? "$fn: the copy with only the new keys says it runs on the new keys"
  has "$legacy" "{\"fn\":\"$fn\",\"event\":\"keys\",\"publishable\":\"legacy\",\"secret\":\"legacy\"}"; result $? "$fn: the copy with only the legacy keys says it runs on the legacy fallback"
  for c in "$nokeys" "$partial"; do
    has "$c" "{\"fn\":\"$fn\",\"event\":\"refusing_to_run\",\"reason\":\"missing keys\"}"; result $? "$fn: $c refuses to run for missing keys"
  done
  ! has "$guard" '"reason":"missing keys"' && has "$guard" "{\"fn\":\"$fn\",\"event\":\"refusing_to_run\""; result $? "$fn: the Production-address copy refuses for its project, not its keys"
  for c in "$new" "$legacy" "$nokeys" "$partial" "$guard"; do
    logs=$(logs_of "$c"); v=0
    for s in $secrets; do grep -qF -- "$s" <<<"$logs" && v=1; done
    grep -qE 'sb_(secret|publishable)_|eyJ[A-Za-z0-9_-]{10,}\.' <<<"$logs" && v=1
    result $v "$fn: $c logged no key (nothing key or JWT shaped)"
  done
  return $failed
}
