#!/usr/bin/env bash
# Tests scripts/db/staging-schedule-media-drain.sql (pg_cron and the
# synchronous http extension, with the key in Vault, as on staging) and
# scripts/db/staging-remove-pg-net.sql against a LOCAL Supabase. Local only.
#   1. Refusals: no photo migration, no drain key in Vault, a non-staging
#      address, a missing or wrong confirmation. Each changes nothing.
#   2. check creates the schedule inside a transaction and rolls it back;
#      apply schedules exactly one job every 15 minutes; the key is read
#      from Vault at run time and never appears in the job.
#   3. The job's own command: HTTP 401 (non-200), a network failure and a
#      20 second timeout each fail with a short message and never the key.
#   4. Real scheduled runs (pg_cron) against a copy of post-media that has
#      the key: succeeded; with a wrong or missing key: failed, recorded
#      without the key; runs never overlap, even when each one times out.
#   5. remove, and the guard for an unrelated job of the same name.
#   6. The staged move off pg_net: from the old pg_net job, the removal
#      refuses (old job, no successful http run, other cron jobs using
#      net., database webhooks, waiting requests); the http job replaces the
#      old one in one step; once it has run successfully, pg_net is removed;
#      the job keeps running; and security checks 001 to 013 all pass.
#
# Waiting for real scheduled runs uses a 1 second schedule. The 20 second
# timeout and the no-overlap test keep their real timings (a 5 second
# schedule against an endpoint that never answers).
set -uo pipefail
cd "$(dirname "$0")/../.."
# The local-only guard, the keyed copy of post-media and the old pg_net job.
# shellcheck source=scripts/db/scheduler-test-fixture.sh
. scripts/db/scheduler-test-fixture.sh
SQL=scripts/db/staging-schedule-media-drain.sql
REMOVE_SQL=scripts/db/staging-remove-pg-net.sql
RUN_EVERY='1 seconds'     # while waiting for a real scheduled run
OVERLAP_EVERY='5 seconds' # the no-overlap test: much shorter than the 20 second timeout
SILENT='http://127.0.0.1:54990/functions/v1/post-media/drain' # accepts, never answers
NOBODY='http://127.0.0.1:54991/functions/v1/post-media/drain' # nothing listening
GUARD_DB=crevant_pgnet_guard
pass=0; failed=0
ok()  { echo "PASS  photo cleanup schedule: $1"; pass=$((pass + 1)); }
bad() { echo "FAIL  photo cleanup schedule: $1"; failed=$((failed + 1)); }
run() { psql "$DB_URL" -X -q -v ON_ERROR_STOP=1 -v mode="$1" -v confirm="$2" -v drain_url="${3:-$GATEWAY}" -f "$SQL" 2>&1; }
removal() { psql "${2:-$DB_URL}" -X -q -v ON_ERROR_STOP=1 -v mode="$1" -v confirm="${3:-}" -f "$REMOVE_SQL" 2>&1; }
jobs() { "${PSQL[@]}" -c "select count(*) from cron.job where jobname = 'post-media-drain'" 2>/dev/null || echo 0; }
job_cmd() { "${PSQL[@]}" -c "select command from cron.job where jobname = 'post-media-drain'"; }
run_job_now() { psql "$DB_URL" -X -q -c "$(job_cmd)" 2>&1; }
has_pg_net() { "${PSQL[@]}" -c "select count(*) from pg_extension where extname = 'pg_net'"; }
last_run() { "${PSQL[@]}" -c "select coalesce(max(runid), 0) from cron.job_run_details"; }
every() { "${PSQL[@]}" -c "select cron.alter_job((select jobid from cron.job where jobname = 'post-media-drain'), schedule := '$1')" >/dev/null; }
# Waits for the next finished run of the job after run id $1; prints "status|message".
wait_run() {
  local r=''
  for _ in $(seq 1 45); do
    r=$("${PSQL[@]}" -c "select d.status || '|' || coalesce(d.return_message, '') from cron.job_run_details d join cron.job j on j.jobid = d.jobid
                         where j.jobname = 'post-media-drain' and d.runid > $1 and d.status in ('succeeded', 'failed') order by d.runid limit 1")
    [ -n "$r" ] && break
    sleep 1
  done
  printf '%s' "$r"
}
# An endpoint that accepts and never answers: its own small container (the
# database image, for its nc) sharing the database container's network.
# Nothing is ever signalled inside the database container itself.
stop_listener() { docker rm -f crevant-silent-endpoint >/dev/null 2>&1 || true; }
silent_listener() {
  stop_listener
  docker run -d --name crevant-silent-endpoint --network "container:$DB_CONTAINER" --entrypoint sh \
    "$(docker inspect -f '{{.Config.Image}}' "$DB_CONTAINER")" -c 'while true; do sleep 300 | nc -l -p 54990; done' >/dev/null
  wait_listening 54990 "the endpoint that never answers"
}
KEY="$(new_key)"
WRONG="$(new_key)"
cleanup() {
  "${PSQL[@]}" -c "delete from vault.secrets where name = 'media_drain_key'" >/dev/null 2>&1 || true
  "${PSQL[@]}" -c "select cron.unschedule(jobname) from cron.job where jobname in ('post-media-drain', 'crevant-test-net-job')" >/dev/null 2>&1 || true
  "${PSQL[@]}" -c "drop table if exists public.crevant_test_hooked" >/dev/null 2>&1 || true
  "${PSQL[@]}" -c "drop database if exists $GUARD_DB" >/dev/null 2>&1 || true
  stop_keyed_drain
  stop_listener
}
trap cleanup EXIT
cleanup
# Start from a database with none of the three extensions (as CI does).
"${PSQL[@]}" -c "drop extension if exists pg_net" -c "drop extension if exists http" >/dev/null 2>&1

# --- 1 and 2: refusals, check, apply --------------------------------------
out=$(run apply 'SCHEDULE THE STAGING PHOTO CLEANUP'); code=$?
[ $code -ne 0 ] && grep -q 'drain key' <<<"$out" && [ "$(jobs)" = 0 ] && ok "refuses without the drain key in Vault, changing nothing" || bad "ran without a drain key (exit $code): $(tail -2 <<<"$out" | tr '\n' ' ')"
store_key "$KEY"
out=$(run apply 'SCHEDULE THE STAGING PHOTO CLEANUP' 'https://hmrliwoychnqrbbydorg.supabase.co/functions/v1/post-media/drain'); code=$?
[ $code -ne 0 ] && grep -q 'must be staging' <<<"$out" && [ "$(jobs)" = 0 ] && ok "refuses any address but staging's function (here: Production's)" || bad "accepted another address (exit $code)"
out=$(run apply 'schedule the staging photo cleanup'); code=$?
[ $code -ne 0 ] && grep -q 'confirmation phrase' <<<"$out" && [ "$(jobs)" = 0 ] && ok "refuses apply with a different phrase" || bad "applied without the exact phrase (exit $code)"
"${PSQL[@]}" -c "delete from supabase_migrations.schema_migrations where version = '20261127000000'" >/dev/null
out=$(run apply 'SCHEDULE THE STAGING PHOTO CLEANUP'); code=$?
out2=$(removal check); code2=$?
"${PSQL[@]}" -c "insert into supabase_migrations.schema_migrations (version, name) values ('20261127000000', 'post_photos')" >/dev/null
[ $code -ne 0 ] && grep -q 'not applied here' <<<"$out" && [ "$(jobs)" = 0 ] && [ $code2 -ne 0 ] && grep -q 'not applied here' <<<"$out2" \
  && ok "both scripts refuse where photo posts aren't applied (as on Production)" || bad "ran without the photo migration (exit $code / $code2)"

out=$(run check ''); code=$?
[ $code -eq 0 ] && grep -q 'Check only' <<<"$out" && grep -Eq 'post-media-drain *\| *\*/15 \* \* \* \* *\| *t *\| *http \(synchronous\)' <<<"$out" && [ "$(jobs)" = 0 ] \
  && ok "check shows the http schedule it would create, then rolls back" || bad "check (exit $code): $(tail -3 <<<"$out" | tr '\n' ' ')"
out=$(run apply 'SCHEDULE THE STAGING PHOTO CLEANUP'); code=$?
cmd=$(job_cmd)
[ $code -eq 0 ] && [ "$(jobs)" = 1 ] && [ "$("${PSQL[@]}" -c "select schedule from cron.job where jobname = 'post-media-drain'")" = '*/15 * * * *' ] \
  && grep -q "$GATEWAY" <<<"$cmd" && grep -q 'extensions.http(' <<<"$cmd" && grep -q "vault.decrypted_secrets" <<<"$cmd" && grep -q "'http.timeout_msec', '20000'" <<<"$cmd" \
  && ! grep -q 'net\.' <<<"$cmd" && ! grep -q "$KEY" <<<"$cmd" && [ "$(has_pg_net)" = 0 ] \
  && ok "apply schedules the drain every 15 minutes on the http extension (20 s limit, key from Vault at run time, no pg_net)" || bad "apply (exit $code)"
out=$(run apply 'SCHEDULE THE STAGING PHOTO CLEANUP'); code=$?
[ $code -eq 0 ] && [ "$(jobs)" = 1 ] && ok "applying again leaves exactly one schedule" || bad "a second apply (exit $code, jobs $(jobs))"

# --- 3: the job's own command, run now ------------------------------------
out=$(run_job_now)
grep -q 'photo cleanup failed: the drain answered HTTP 401' <<<"$out" && ! grep -q "$KEY" <<<"$out" && ! grep -qi 'x-media-drain-key' <<<"$out" \
  && ok "a non-200 answer (the gateway's copy has no key: 401) fails the run with only the status" || bad "non-200: $out"
run apply 'SCHEDULE THE STAGING PHOTO CLEANUP' "$NOBODY" >/dev/null
out=$(run_job_now)
grep -q 'photo cleanup failed: network error reaching the drain' <<<"$out" && ! grep -q '54991' <<<"$out" \
  && ok "a network failure fails the run with a fixed message (no address, no headers)" || bad "network failure: $out"
silent_listener
run apply 'SCHEDULE THE STAGING PHOTO CLEANUP' "$SILENT" >/dev/null
start=$(date +%s); out=$(run_job_now); took=$(( $(date +%s) - start ))
grep -q 'photo cleanup failed: the drain timed out after 20 seconds' <<<"$out" && [ $took -ge 19 ] && [ $took -le 26 ] \
  && ok "the 20 second limit is enforced: an endpoint that never answers fails the run after ${took}s" || bad "timeout (${took}s): $out"

# --- 4: real scheduled runs -----------------------------------------------
start_keyed_drain "$KEY"
run apply 'SCHEDULE THE STAGING PHOTO CLEANUP' "$KEYED" >/dev/null
drains=$("${PSQL[@]}" -c "select count(*) from ops.media_drain_runs where source = 'scheduled'")
since=$(last_run); every "$RUN_EVERY"
r=$(wait_run "$since")
[ "${r%%|*}" = succeeded ] && [ "$("${PSQL[@]}" -c "select count(*) from ops.media_drain_runs where source = 'scheduled'")" -gt "$drains" ] \
  && ok "a real scheduled run with the key succeeds, and the drain records the pass" || bad "scheduled run: '$r'"
store_key "$WRONG"; since=$(last_run)
r=$(wait_run "$since")
[ "${r%%|*}" = failed ] && grep -q 'the drain answered HTTP 401' <<<"$r" && ok "with a wrong key in Vault, the run is recorded as failed (HTTP 401)" || bad "wrong key run: '$r'"
"${PSQL[@]}" -c "delete from vault.secrets where name = 'media_drain_key'" >/dev/null; since=$(last_run)
r=$(wait_run "$since")
[ "${r%%|*}" = failed ] && grep -q 'drain key is missing from Vault' <<<"$r" && ok "with no key in Vault, the run is recorded as failed (key missing)" || bad "missing key run: '$r'"
store_key "$KEY"
silent_listener
run apply 'SCHEDULE THE STAGING PHOTO CLEANUP' "$SILENT" >/dev/null; since=$(last_run); every "$OVERLAP_EVERY"
sleep 32
overlap=$("${PSQL[@]}" -c "select count(*) from cron.job_run_details a join cron.job_run_details b on a.jobid = b.jobid and a.runid < b.runid
                           join cron.job j on j.jobid = a.jobid where j.jobname = 'post-media-drain' and a.runid > $since
                           and b.start_time < coalesce(a.end_time, now())")
timed=$("${PSQL[@]}" -c "select count(*) from cron.job_run_details d join cron.job j on j.jobid = d.jobid where j.jobname = 'post-media-drain'
                         and d.runid > $since and d.status = 'failed' and d.return_message ~ 'timed out after 20 seconds'")
later=$("${PSQL[@]}" -c "select count(*) from cron.job_run_details a join cron.job_run_details b on a.jobid = b.jobid and b.runid > a.runid
                         join cron.job j on j.jobid = a.jobid where j.jobname = 'post-media-drain' and a.runid > $since
                         and a.return_message ~ 'timed out' and b.start_time >= a.end_time")
[ "$overlap" = 0 ] && [ "$timed" -ge 1 ] && [ "$later" -ge 1 ] && ok "runs never overlap: with a 5 second schedule and 20 second timeouts, each run waits for the last ($timed timed out, 0 overlapping)" \
  || bad "overlap $overlap, timed out $timed, runs after a timeout $later"
stop_listener
leaked=$("${PSQL[@]}" -c "select count(*) from cron.job_run_details where strpos(coalesce(return_message, '') || command, '$KEY') > 0 or strpos(coalesce(return_message, '') || command, '$WRONG') > 0
                          or return_message ~* 'x-media-drain-key|authorization'")
[ "$leaked" = 0 ] && ok "no run record holds the key, the wrong key or any header" || bad "$leaked run record(s) expose the key or headers"

# --- 5: remove, and an unrelated job of the same name ---------------------
"${PSQL[@]}" -c "delete from supabase_migrations.schema_migrations where version = '20261127000000'" >/dev/null
out=$(run remove 'UNSCHEDULE THE STAGING PHOTO CLEANUP'); code=$?
"${PSQL[@]}" -c "insert into supabase_migrations.schema_migrations (version, name) values ('20261127000000', 'post_photos')" >/dev/null
[ $code -eq 0 ] && [ "$(jobs)" = 0 ] && ok "remove unschedules it, even without the photo migration" || bad "remove (exit $code): $(tail -2 <<<"$out" | tr '\n' ' ')"
out=$(run remove 'UNSCHEDULE THE STAGING PHOTO CLEANUP'); code=$?
[ $code -eq 0 ] && [ "$(jobs)" = 0 ] && ok "removing again is harmless" || bad "a second remove (exit $code)"
"${PSQL[@]}" -c "select cron.schedule('post-media-drain', '0 3 * * *', 'select 42')" >/dev/null
for m in "apply|SCHEDULE THE STAGING PHOTO CLEANUP" "remove|UNSCHEDULE THE STAGING PHOTO CLEANUP"; do
  out=$(run "${m%%|*}" "${m#*|}"); code=$?
  [ $code -ne 0 ] && grep -q 'not the photo cleanup' <<<"$out" && [ "$(job_cmd)" = 'select 42' ] \
    && ok "${m%%|*} refuses to touch an unrelated job named post-media-drain" || bad "${m%%|*} touched an unrelated job (exit $code)"
done
"${PSQL[@]}" -c "select cron.unschedule('post-media-drain')" >/dev/null

# --- 6: the staged move off pg_net ----------------------------------------
# Staging today: pg_net installed and the old pg_net job.
"${PSQL[@]}" -c "create extension if not exists pg_net with schema extensions" >/dev/null || fixture_fail "could not install pg_net"
legacy_job
old_id=$("${PSQL[@]}" -c "select jobid from cron.job where jobname = 'post-media-drain'")
out=$(psql "$DB_URL" -X -q -v ON_ERROR_STOP=1 -f supabase/tests/003_waitlist.sql 2>&1); code=$?
[ $code -ne 0 ] && ok "with pg_net installed, security check 003 fails (the exposure this removes)" || bad "check 003 passed with pg_net installed"
out=$(removal check); code=$?
[ $code -ne 0 ] && grep -Eq '^ *2 *\| *REFUSED' <<<"$out" && grep -Eq '^ *3 *\| *REFUSED' <<<"$out" && grep -Eq '^ *4 *\| *REFUSED' <<<"$out" && grep -q 'nothing changed' <<<"$out" && [ "$(has_pg_net)" = 1 ] \
  && ok "removal refuses while the old pg_net job is in place (it mentions net., no http run yet)" || bad "removal with the old job (exit $code): $(grep -E '^ *[0-9] *\|' <<<"$out" | tr '\n' ' ')"
out=$(removal apply "$DB_URL" 'remove pg_net from staging'); code=$?
[ $code -ne 0 ] && grep -q 'confirmation phrase' <<<"$out" && [ "$(has_pg_net)" = 1 ] && ok "removal apply refuses a different phrase" || bad "removal without the exact phrase (exit $code)"
# The replacement: one step, one job before and after.
out=$(run apply 'SCHEDULE THE STAGING PHOTO CLEANUP' "$KEYED"); code=$?
new_id=$("${PSQL[@]}" -c "select jobid from cron.job where jobname = 'post-media-drain'")
[ $code -eq 0 ] && [ "$(jobs)" = 1 ] && [ "$new_id" != "$old_id" ] && grep -q 'http (synchronous)' <<<"$out" && ! grep -q 'net\.' <<<"$(job_cmd)" \
  && ok "apply replaces the old pg_net job with the http job in one transaction (one job before, one after)" || bad "replacement (exit $code, jobs $(jobs))"
out=$(removal check); code=$?
[ $code -ne 0 ] && grep -Eq '^ *2 *\| *ok' <<<"$out" && grep -Eq '^ *3 *\| *REFUSED' <<<"$out" && [ "$(has_pg_net)" = 1 ] \
  && ok "removal still refuses until the http job has succeeded once" || bad "removal before a successful run (exit $code): $(grep -E '^ *[0-9] *\|' <<<"$out" | tr '\n' ' ')"
since=$(last_run); every "$RUN_EVERY"; r=$(wait_run "$since"); every '*/15 * * * *'
[ "${r%%|*}" = succeeded ] && ok "the http job runs successfully on schedule" || bad "http job run before removal: '$r'"
# Other things that rely on pg_net each stop the removal.
"${PSQL[@]}" -c "select cron.schedule('crevant-test-net-job', '0 4 * * *', \$q\$select net.http_get('http://kong:8000/')\$q\$)" >/dev/null
"${PSQL[@]}" -c "create table public.crevant_test_hooked (id int)" \
  -c "create trigger crevant_test_hook after insert on public.crevant_test_hooked for each row execute function supabase_functions.http_request('http://kong:8000/', 'POST', '{}', '{}', '1000')" >/dev/null
out=$(removal check); code=$?
[ $code -ne 0 ] && grep -Eq '^ *4 *\| *REFUSED' <<<"$out" && grep -Eq '^ *6 *\| *REFUSED' <<<"$out" && [ "$(has_pg_net)" = 1 ] \
  && ok "removal refuses while another cron job uses net. or a database webhook exists" || bad "other users of pg_net (exit $code): $(grep -E '^ *[46] *\|' <<<"$out" | tr '\n' ' ')"
"${PSQL[@]}" -c "select cron.unschedule('crevant-test-net-job')" -c "drop table public.crevant_test_hooked" >/dev/null
"${PSQL[@]}" -c "create view public.crevant_test_net_view as select id from net.http_request_queue" \
  -c "create function public.crevant_test_uses_net() returns bigint language sql as \$f\$ select net.http_get('http://kong:8000/') \$f\$" >/dev/null
out=$(removal check); code=$?
"${PSQL[@]}" -c "drop view public.crevant_test_net_view" -c "drop function public.crevant_test_uses_net()" >/dev/null
[ $code -ne 0 ] && grep -Eq '^ *7 *\| *REFUSED' <<<"$out" && grep -q 'crevant_test_net_view' <<<"$out" && grep -q 'crevant_test_uses_net' <<<"$out" \
  && ok "removal refuses while a view or function outside pg_net uses it" || bad "dependent objects (exit $code): $(grep -E '^ *7 *\|' <<<"$out")"
# Waiting requests: in a throwaway database the pg_net worker doesn't serve, a request stays queued.
GUARD_URL="${DB_URL%/*}/$GUARD_DB"
"${PSQL[@]}" -c "create database $GUARD_DB" >/dev/null
psql "$GUARD_URL" -X -q -v ON_ERROR_STOP=1 -c "create schema extensions" -c "create extension pg_net with schema extensions" \
  -c "create schema supabase_migrations" -c "create table supabase_migrations.schema_migrations (version text primary key, name text)" \
  -c "insert into supabase_migrations.schema_migrations values ('20261127000000', 'post_photos')" -c "select net.http_get('http://127.0.0.1:9/')" >/dev/null
out=$(removal check "$GUARD_URL"); code=$?
[ $code -ne 0 ] && grep -Eq '^ *5 *\| *REFUSED.*1 request\(s\) waiting' <<<"$out" && [ "$(psql "$GUARD_URL" -X -At -c "select count(*) from pg_extension where extname = 'pg_net'")" = 1 ] \
  && ok "removal refuses while requests wait in pg_net's queue" || bad "waiting requests (exit $code): $(grep -E '^ *5 *\|' <<<"$out")"
"${PSQL[@]}" -c "drop database $GUARD_DB" >/dev/null
# Everything in place: check passes and changes nothing, then apply removes pg_net.
out=$(removal check); code=$?
[ $code -eq 0 ] && grep -q 'Check only: every check passed' <<<"$out" && ! grep -q 'REFUSED' <<<"$out" && [ "$(has_pg_net)" = 1 ] \
  && ok "removal check passes once the http job has run, and rolls back (pg_net still installed)" || bad "removal check (exit $code): $(grep -E '^ *[0-9] *\|' <<<"$out" | tr '\n' ' ') $(tail -2 <<<"$out")"
out=$(removal apply "$DB_URL" 'REMOVE PG_NET FROM STAGING'); code=$?
[ $code -eq 0 ] && [ "$(has_pg_net)" = 0 ] && [ "$("${PSQL[@]}" -c "select to_regnamespace('net') is null")" = t ] && [ "$(jobs)" = 1 ] \
  && ok "removal apply drops pg_net and its schema; the http job stays" || bad "removal apply (exit $code): $(tail -3 <<<"$out" | tr '\n' ' ')"
out=$(removal apply "$DB_URL" 'REMOVE PG_NET FROM STAGING'); code=$?
[ $code -eq 0 ] && grep -q 'not installed here' <<<"$out" && ok "running the removal again is harmless" || bad "a second removal (exit $code)"
since=$(last_run); every "$RUN_EVERY"; r=$(wait_run "$since"); every '*/15 * * * *'
[ "${r%%|*}" = succeeded ] && [ "$("${PSQL[@]}" -c "select schedule from cron.job where jobname = 'post-media-drain'")" = '*/15 * * * *' ] \
  && ok "after pg_net is gone, the cleanup still runs successfully on its 15 minute schedule" || bad "run after removal: '$r'"
# The staging security checks, with pg_cron and http in place and pg_net gone.
all=0
for f in supabase/tests/*.sql; do
  if ! o=$(psql "$DB_URL" -X -q -v ON_ERROR_STOP=1 -f "$f" 2>&1); then all=1; echo "  $f failed: $(grep -m1 ERROR <<<"$o")"; fi
done
[ $all -eq 0 ] && ok "staging security checks 001 to 013 all pass with the replacement schedule in place (003 unchanged)" || bad "a staging security check failed"
out=$(run remove 'UNSCHEDULE THE STAGING PHOTO CLEANUP'); code=$?
[ $code -eq 0 ] && [ "$(jobs)" = 0 ] && ok "rollback: remove takes the http schedule down" || bad "final remove (exit $code)"

echo "Photo cleanup schedule tests: $pass passed, $failed failed"
[ $failed -eq 0 ]
