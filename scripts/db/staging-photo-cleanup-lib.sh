# Shared by scripts/db/staging-photo-cleanup.sh (apply, verify, pause) and
# scripts/db/staging-pgnet-removal.sh (pg_net removal). Sourced, not run.
#
# The same protections as scripts/db/staging-schedule-check.sh:
#   * main only, no arguments;
#   * a pinned sha256 of each SQL script, checked before connecting;
#   * a connection string, verify-full TLS with the committed root CA, and
#     the approved staging project (scripts/db/verify-staging-target.sh);
#   * waits outside the cleanup's 15 minute boundary;
#   * fingerprints of the cron jobs (commands as md5 only) and extensions.
# And the attribution of scheduled runs to drain passes:
#   * a run belongs to the http cleanup job only if it has that job's id and
#     its exact current command;
#   * a succeeded run is VERIFIED only if exactly one 'scheduled' pass in
#     ops.media_drain_runs (written by the post-media function itself, after
#     its drain key check) finished inside that run's start and end;
#   * any 'scheduled' pass since the job's first run that falls in no run
#     of the job is UNATTRIBUTED, and fails everything closed.
# Never prints the connection string, a cron command, a run's raw error
# (only a fixed classification) or the Vault secret. Never reads Vault.
#
# SCHEDULE_CHECK_LOCAL_TEST=1 (tests only) is accepted only with a
# 127.0.0.1 or localhost connection string: it skips the target and TLS
# checks and allows the test clock, sleep, drain address and interval.

fail() { echo "::error::$1"; echo "Refused: $1" >&2; exit 1; }

# guard <number of arguments> <sql script> <pinned sha256>
guard() {
  [ "$1" -eq 0 ] || fail "this takes no arguments."
  [ "${GITHUB_REF:-}" = refs/heads/main ] || fail "runs only from the main branch."
  [ -f "$2" ] || fail "$2 is missing."
  local actual
  actual=$(sha256sum "$2" | cut -d' ' -f1)
  [ "$actual" = "$3" ] || fail "$2 does not match the reviewed checksum."
  echo "$2 matches the reviewed checksum ($3)."
  [ -n "${STAGING_DATABASE_URL:-}" ] || fail "STAGING_DATABASE_URL is not set."
  LOCAL_TEST=false
  if [ "${SCHEDULE_CHECK_LOCAL_TEST:-}" = 1 ]; then
    local host
    host=$(python3 -c 'import os; from urllib.parse import urlsplit; print((urlsplit(os.environ["STAGING_DATABASE_URL"]).hostname or "").lower())' 2>/dev/null || true)
    case "$host" in
      127.0.0.1|localhost) LOCAL_TEST=true ;;
      *) fail "the local test mode only accepts a local database." ;;
    esac
  fi
  if [ "$LOCAL_TEST" = true ]; then
    echo "Local test database: target and TLS checks skipped (local connection only)."
  else
    [ "${PGSSLMODE:-}" = verify-full ] && [ -f "${PGSSLROOTCERT:-/nonexistent}" ] && [ "${REQUIRE_VERIFY_FULL:-}" = 1 ] \
      || fail "full TLS verification (verify-full with the committed root certificate) is required."
    scripts/db/verify-staging-target.sh || fail "the target is not the approved staging project."
  fi
  PSQL=(psql "$STAGING_DATABASE_URL" -X -q -At -v ON_ERROR_STOP=1)
}

# Test settings, honoured only against a local database.
local_setting() { if [ "$LOCAL_TEST" = true ]; then printf '%s' "${!1:-}"; fi; }
now() { local t; t=$(local_setting SCHEDULE_CHECK_EPOCH); [ -n "$t" ] && echo "$t" || date +%s; }
pause() { local s; s=$(local_setting SCHEDULE_CHECK_SLEEP); if [ -n "$s" ]; then "$s" "$1"; else sleep "$1"; fi; }
q() { "${PSQL[@]}" -c "begin read only; $1; rollback;"; }

# Stay clear of the quarter hour: from 60 seconds before to 90 seconds after.
boundary_wait() {
  local s wait=0
  s=$(( $(now) % 900 ))
  if [ $s -ge 840 ]; then wait=$(( 900 - s + 90 )); elif [ $s -lt 90 ]; then wait=$(( 90 - s )); fi
  if [ $wait -gt 0 ]; then echo "Within the cleanup's 15 minute boundary: waiting $wait seconds."; pause "$wait"; fi
}
running_wait() {
  local busy
  busy=$(running) || fail "could not read the cleanup's run history."
  for _ in 1 2 3 4 5 6; do
    [ "$busy" = 0 ] && return 0
    echo "A cleanup run is in progress: waiting 10 seconds."
    pause 10
    busy=$(running) || fail "could not read the cleanup's run history."
  done
  fail "a cleanup run is still in progress after a minute; run this again later."
}
running() {
  q "select count(*) from cron.job_run_details d join cron.job j on j.jobid = d.jobid
     where j.jobname = 'post-media-drain' and d.status not in ('succeeded', 'failed')
     and d.start_time > pg_catalog.now() - interval '10 minutes'"
}

FINGERPRINT_SQL="select 'job|' || j.jobid || '|' || j.jobname || '|' || j.schedule || '|' || j.active || '|' || j.username || '|' || pg_catalog.md5(j.command) || '|'
       || case when j.command ~ 'extensions\.http\(' then 'http' when j.command ~ 'net\.http_post' then 'pg_net' else 'other' end
from cron.job j order by j.jobid;
select 'extension|' || e.extname || '|' || e.extversion || '|' || n.nspname
from pg_catalog.pg_extension e join pg_catalog.pg_namespace n on n.oid = e.extnamespace order by e.extname;
select 'net schema|' || (pg_catalog.to_regnamespace('net') is not null)"
fingerprint() { q "$FINGERPRINT_SQL"; }
show() { echo "$1"; sed 's/^/  /' <<<"$2"; }
# Fingerprint lines for every cron job except the cleanup job, and the extensions.
others() { grep -v '^job|[0-9]*|post-media-drain|' <<<"$1" || true; }

# The cleanup job: "<jobs named post-media-drain>|<jobid>|<method>|<schedule>|<active>|<other jobs calling the drain>"
job_state() {
  q "select (select count(*) from cron.job where jobname = 'post-media-drain') || '|' ||
            coalesce((select jobid::text from cron.job where jobname = 'post-media-drain' order by jobid limit 1), '') || '|' ||
            coalesce((select case when command ~ 'extensions\.http\(' then 'http' when command ~ 'net\.http_post' then 'pg_net' else 'other' end
                      from cron.job where jobname = 'post-media-drain' order by jobid limit 1), '') || '|' ||
            coalesce((select schedule from cron.job where jobname = 'post-media-drain' order by jobid limit 1), '') || '|' ||
            coalesce((select active::text from cron.job where jobname = 'post-media-drain' order by jobid limit 1), '') || '|' ||
            (select count(*) from cron.job where jobname <> 'post-media-drain' and command ~ '/functions/v1/post-media/drain')"
}

# Finished runs of the cleanup job (its id and exact current command), newest
# first: runid|status|seconds|matching passes|claimed/deleted/failed|outcome
runs() {
  q "with j as (select jobid, command from cron.job where jobname = 'post-media-drain'),
     r as (select d.runid, d.status, d.start_time, d.end_time, d.return_message from cron.job_run_details d
           join j on j.jobid = d.jobid and d.command = j.command
           where d.status in ('succeeded', 'failed') and d.end_time is not null)
     select r.runid || '|' || r.status || '|' || round(extract(epoch from r.end_time - r.start_time)::numeric, 1) || '|' ||
            (select count(*) from ops.media_drain_runs m where m.source = 'scheduled' and m.finished_at between r.start_time and r.end_time) || '|' ||
            coalesce((select string_agg(m.claimed || '/' || m.deleted || '/' || m.failed, ',') from ops.media_drain_runs m
                      where m.source = 'scheduled' and m.finished_at between r.start_time and r.end_time), '') || '|' ||
            case when r.status = 'succeeded' then 'HTTP 200'
                 when r.return_message ~ 'the drain answered HTTP [0-9]+' then 'HTTP ' || substring(r.return_message from 'the drain answered HTTP ([0-9]+)')
                 when r.return_message ~ 'timed out after 20 seconds' then 'timed out after 20 seconds'
                 when r.return_message ~ 'network error reaching the drain' then 'network error'
                 when r.return_message ~ 'drain key is missing from Vault' then 'drain key missing from Vault'
                 when r.return_message ~ 'server restarted' then 'database restarted during the run'
                 else 'other error (message withheld)' end
     from r order by r.runid desc"
}
# 'scheduled' passes since the job's first run that fall inside none of its runs.
unattributed() {
  q "with j as (select jobid, command from cron.job where jobname = 'post-media-drain'),
     r as (select d.start_time, d.end_time from cron.job_run_details d join j on j.jobid = d.jobid and d.command = j.command
           where d.start_time is not null)
     select count(*) from ops.media_drain_runs m
     where m.source = 'scheduled' and m.finished_at >= (select min(start_time) from r)
       and not exists (select 1 from r where m.finished_at between r.start_time and coalesce(r.end_time, pg_catalog.now()))"
}

# Prints the runs and sets: VERIFIED_IN_A_ROW, FAILED_RUNS, UNMATCHED_OK_RUNS, UNATTRIBUTED, LATEST (status of newest).
report_runs() {
  local rows line runid status secs matched counts outcome verdict
  rows=$(runs) || fail "could not read the cleanup's runs and the drain passes."
  UNATTRIBUTED=$(unattributed) || fail "could not read the drain passes."
  VERIFIED_IN_A_ROW=0; FAILED_RUNS=0; UNMATCHED_OK_RUNS=0; LATEST=none
  local streak=true
  echo "Finished runs of this job, newest first (a run is verified only with exactly one matching drain pass):"
  [ -n "$rows" ] || echo "  none yet"
  while IFS='|' read -r runid status secs matched counts outcome; do
    [ -n "$runid" ] || continue
    [ "$LATEST" = none ] && LATEST=$status
    if [ "$status" = succeeded ] && [ "$matched" = 1 ]; then
      verdict="verified (drain pass claimed/deleted/failed $counts)"
      [ "$streak" = true ] && VERIFIED_IN_A_ROW=$((VERIFIED_IN_A_ROW + 1))
    elif [ "$status" = succeeded ]; then
      verdict="NOT verified: $matched matching drain passes (exactly one needed)"
      UNMATCHED_OK_RUNS=$((UNMATCHED_OK_RUNS + 1)); streak=false
    else
      verdict="FAILED: $outcome"
      FAILED_RUNS=$((FAILED_RUNS + 1)); streak=false
    fi
    echo "  run $runid: $status after ${secs}s, $verdict"
  done <<<"$rows"
  echo "Drain passes since the first run that match no run of this job: $UNATTRIBUTED"
}
