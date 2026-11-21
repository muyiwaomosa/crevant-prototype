#!/usr/bin/env bash
# Tests the "Photo cleanup schedule on staging" and "Remove pg_net from
# staging" wrappers (scripts/db/staging-photo-cleanup.sh and
# scripts/db/staging-pgnet-removal.sh) against a LOCAL Supabase set up like
# staging today: pg_cron and pg_net, the old pg_net cleanup job, the drain key
# in Vault, http not installed. Real pg_cron runs (every 5 seconds here) call
# real endpoints beside the database:
#   * a copy of post-media with the key (a real drain pass, recorded by the
#     function in ops.media_drain_runs);
#   * the gateway's copy, which has no key (HTTP 401);
#   * a fake endpoint that answers 200 but is not the drain (no pass recorded).
# Every hosted connection string here is fake and refused before connecting.
set -uo pipefail
cd "$(dirname "$0")/../.."
DB_URL="${DB_URL:-postgresql://postgres:postgres@127.0.0.1:54322/postgres}"
case "$DB_URL" in
  *@127.0.0.1:*|*@localhost:*) ;;
  *) echo "Refusing: this test only runs against a local database." >&2; exit 1 ;;
esac
DB_CONTAINER="${DB_CONTAINER:-supabase_db_crevant-prototype}"
STORAGE_CONTAINER="${STORAGE_CONTAINER:-supabase_storage_crevant-prototype}"
EDGE_IMAGE="${EDGE_IMAGE:-supabase/edge-runtime:v1.78.1}"
REF=kpudeppgokpjhvaqrprn
PW='Fake-Pw-For-Tests-73'
POOL=aws-0-us-west-2.pooler.supabase.com
GATEWAY='http://kong:8000/functions/v1/post-media/drain'
KEYED='http://127.0.0.1:54397/functions/v1/post-media/drain'
FAKE200='http://127.0.0.1:54992/functions/v1/post-media/drain'
APPLY='SCHEDULE THE STAGING PHOTO CLEANUP'
PAUSE='UNSCHEDULE THE STAGING PHOTO CLEANUP'
REMOVE='REMOVE PG_NET FROM STAGING'
PSQL=(psql "$DB_URL" -X -q -At -v ON_ERROR_STOP=1)
pass=0; failed=0
ok()  { echo "PASS  cleanup workflows: $1"; pass=$((pass + 1)); }
bad() { echo "FAIL  cleanup workflows: $1"; failed=$((failed + 1)); }
tmp=$(mktemp -d)
KEY="$(node -e 'process.stdout.write(require("crypto").randomBytes(24).toString("hex"))')"
WRONG="$(node -e 'process.stdout.write(require("crypto").randomBytes(24).toString("hex"))')"
printf '#!/usr/bin/env bash\necho "slept $1" >> "%s/slept"\n' "$tmp" > "$tmp/fake-sleep"; chmod +x "$tmp/fake-sleep"
SAFE_EPOCH=$(( 1700000000 - 1700000000 % 900 + 420 ))

cleanup() {
  "${PSQL[@]}" -c "select cron.unschedule(jobname) from cron.job where jobname in ('post-media-drain', 'crevant-test-other', 'crevant-test-caller')" >/dev/null 2>&1 || true
  "${PSQL[@]}" -c "delete from vault.secrets where name = 'media_drain_key'" >/dev/null 2>&1 || true
  docker rm -f crevant-drain-beside-db crevant-fake-200 >/dev/null 2>&1 || true
  rm -rf "$tmp"
}
trap cleanup EXIT
cleanup >/dev/null 2>&1; tmp=$(mktemp -d); printf '#!/usr/bin/env bash\necho "slept $1" >> "%s/slept"\n' "$tmp" > "$tmp/fake-sleep"; chmod +x "$tmp/fake-sleep"

store_key() { "${PSQL[@]}" -c "delete from vault.secrets where name = 'media_drain_key'" -c "select vault.create_secret('$1', 'media_drain_key', 'local test')" >/dev/null; }
legacy_job() { # staging today: the old pg_net cleanup job (pointed at the local gateway here)
  "${PSQL[@]}" -c "select cron.unschedule('post-media-drain') where exists (select 1 from cron.job where jobname = 'post-media-drain')" >/dev/null
  "${PSQL[@]}" -c "select cron.schedule('post-media-drain', '*/15 * * * *', \$job\$
      select net.http_post(
        url := '$GATEWAY',
        headers := pg_catalog.jsonb_build_object(
          'Content-Type', 'application/json',
          'x-media-drain-key', (select s.decrypted_secret from vault.decrypted_secrets s where s.name = 'media_drain_key')),
        body := '{}'::jsonb,
        timeout_milliseconds := 20000)
    \$job\$)" >/dev/null
}
jobid() { "${PSQL[@]}" -c "select coalesce(max(jobid), 0) from cron.job where jobname = 'post-media-drain'"; }
jobcount() { "${PSQL[@]}" -c "select count(*) from cron.job where jobname = 'post-media-drain'"; }
method() { "${PSQL[@]}" -c "select case when command ~ 'extensions\.http\(' then 'http' when command ~ 'net\.http_post' then 'pg_net' else 'other' end from cron.job where jobname = 'post-media-drain'"; }
has_ext() { "${PSQL[@]}" -c "select count(*) from pg_extension where extname = '$1'"; }
every() { "${PSQL[@]}" -c "select cron.alter_job((select jobid from cron.job where jobname = 'post-media-drain'), schedule := '$1')" >/dev/null; }
finished() { "${PSQL[@]}" -c "select count(*) from cron.job_run_details where jobid = $(jobid) and status in ('succeeded', 'failed') and end_time is not null"; }
wait_finished() { # wait_finished <at least n> (the job runs every 5 seconds meanwhile)
  every '5 seconds'
  for _ in $(seq 1 60); do [ "$(finished)" -ge "$1" ] && break; sleep 1; done
  every '*/15 * * * *'
  # Let a run that started just before the change finish.
  for _ in $(seq 1 25); do [ "$("${PSQL[@]}" -c "select count(*) from cron.job_run_details where jobid = $(jobid) and status not in ('succeeded', 'failed')")" = 0 ] && break; sleep 1; done
}
others_fp() { "${PSQL[@]}" -c "select jobid || '|' || jobname || '|' || md5(command) || '|' || schedule from cron.job where jobname <> 'post-media-drain' order by jobid"; }

base_env=(GITHUB_ACTIONS=true GITHUB_REF=refs/heads/main STAGING_DATABASE_URL="$DB_URL" SCHEDULE_CHECK_LOCAL_TEST=1
          SCHEDULE_CHECK_EPOCH="$SAFE_EPOCH" SCHEDULE_CHECK_SLEEP="$tmp/fake-sleep" SCHEDULE_TEST_INTERVAL='5 seconds' SCHEDULE_TEST_WAIT_MAX=60
          EXPECTED_PROJECT_REF=$REF SUPABASE_PROJECT_REF=$REF CONFIRM_PROJECT_REF=$REF)
A() { # A <mode> <phrase> [VAR=value ...] -- [args]
  local mode=$1 phrase=$2; shift 2
  local envs=(); while [ $# -gt 0 ] && [ "$1" != -- ]; do envs+=("$1"); shift; done; [ "${1:-}" = -- ] && shift
  env "${base_env[@]}" SCHEDULE_TEST_DRAIN_URL="${DRAIN:-$KEYED}" MODE="$mode" CONFIRM_PHRASE="$phrase" "${envs[@]}" "${WRAP_A:-scripts/db/staging-photo-cleanup.sh}" "$@" 2>&1
}
B() {
  local mode=$1 phrase=$2; shift 2
  local envs=(); while [ $# -gt 0 ] && [ "$1" != -- ]; do envs+=("$1"); shift; done; [ "${1:-}" = -- ] && shift
  env "${base_env[@]}" MODE="$mode" CONFIRM_PHRASE="$phrase" "${envs[@]}" "${WRAP_B:-scripts/db/staging-pgnet-removal.sh}" "$@" 2>&1
}
hosted() { echo SCHEDULE_CHECK_LOCAL_TEST= PGSSLMODE=verify-full PGSSLROOTCERT="$PWD/config/certs/supabase-root-2021-ca.crt" REQUIRE_VERIFY_FULL=1; }
visible() { grep -v '^::add-mask::' <<<"$1"; }
clean_out() { ! grep -q "$KEY" <<<"$1" && ! grep -q "$WRONG" <<<"$1" && ! grep -q 'jsonb_build_object\|decrypted_secret\|postgres:postgres@' <<<"$1"; }

# --- Set up: staging today, and the endpoints beside the database ----------------
"${PSQL[@]}" -c "drop extension if exists http" -c "create extension if not exists pg_cron" -c "create extension if not exists pg_net with schema extensions" >/dev/null 2>&1
store_key "$KEY"
legacy_job
"${PSQL[@]}" -c "select cron.schedule('crevant-test-other', '0 3 * * *', 'select 1')" >/dev/null
ev() { docker inspect "$STORAGE_CONTAINER" --format '{{range .Config.Env}}{{println .}}{{end}}' | sed -n "s/^$1=//p"; }
docker run -d --name crevant-drain-beside-db --network "container:$DB_CONTAINER" \
  -e SUPABASE_URL=http://kong:8000 -e SUPABASE_ANON_KEY="$(ev ANON_KEY)" -e SUPABASE_SERVICE_ROLE_KEY="$(ev SERVICE_KEY)" -e MEDIA_DRAIN_KEY="$KEY" \
  -v "$PWD/supabase/functions/post-media:/home/deno/functions/post-media:ro" -v "$PWD/supabase/functions/_shared:/home/deno/functions/_shared:ro" \
  "$EDGE_IMAGE" start --main-service /home/deno/functions/post-media --ip 127.0.0.1 --port 54397 >/dev/null
docker run -d --name crevant-fake-200 --network "container:$DB_CONTAINER" --entrypoint sh "$(docker inspect -f '{{.Config.Image}}' "$DB_CONTAINER")" \
  -c "while true; do printf 'HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: 2\r\nConnection: close\r\n\r\n{}' | nc -l -p 54992; done" >/dev/null
for _ in $(seq 1 60); do docker exec "$DB_CONTAINER" nc -z 127.0.0.1 54397 2>/dev/null && break; sleep 1; done
for _ in $(seq 1 30); do docker exec "$DB_CONTAINER" netstat -ltn 2>/dev/null | grep -q ':54992 ' && break; sleep 1; done
OTHERS=$(others_fp)

# --- 1. Refusals before connecting --------------------------------------------------
out=$(A verify '' GITHUB_REF=refs/heads/claude/x); code=$?
[ $code -ne 0 ] && grep -q 'only from the main branch' <<<"$out" && ok "refuses outside main" || bad "branch (exit $code): $out"
out=$(A apply "$APPLY" -- --force); code=$?
[ $code -ne 0 ] && grep -q 'takes no arguments' <<<"$out" && [ "$(method)" = pg_net ] && ok "refuses arguments" || bad "arguments (exit $code): $out"
out=$(A restore-previous ''); code=$?
[ $code -ne 0 ] && grep -q 'mode must be verify, apply or remove' <<<"$out" && ok "has no restore-previous (or any other) mode" || bad "unknown mode (exit $code): $out"
out=$(A apply ''); code=$?
out2=$(A apply 'schedule the staging photo cleanup'); code2=$?
[ $code -ne 0 ] && [ $code2 -ne 0 ] && grep -q 'needs the confirmation phrase' <<<"$out$out2" && [ "$(method)" = pg_net ] \
  && ok "apply refuses without the exact phrase, changing nothing" || bad "apply phrase (exit $code/$code2)"
out=$(A remove "$APPLY"); code=$?
[ $code -ne 0 ] && grep -q 'pause) needs the confirmation phrase' <<<"$out" && [ "$(jobcount)" = 1 ] && ok "pause refuses without its own phrase" || bad "pause phrase (exit $code)"
out=$(B apply 'remove pg_net from staging'); code=$?
[ $code -ne 0 ] && grep -q 'needs the confirmation phrase' <<<"$out" && [ "$(has_ext pg_net)" = 1 ] && ok "pg_net removal refuses without the exact phrase" || bad "removal phrase (exit $code)"
out=$(A verify '' STAGING_DATABASE_URL=); code=$?
out2=$(B check '' STAGING_DATABASE_URL=); code2=$?
[ $code -ne 0 ] && [ $code2 -ne 0 ] && grep -q 'STAGING_DATABASE_URL is not set' <<<"$out" && grep -q 'STAGING_DATABASE_URL is not set' <<<"$out2" \
  && ok "both refuse without a connection string" || bad "missing credentials (exit $code/$code2)"
# shellcheck disable=SC2046
out=$(A apply "$APPLY" $(hosted) STAGING_DATABASE_URL="postgresql://postgres.hmrliwoychnqrbbydorg:$PW@$POOL:5432/postgres"); code=$?
# shellcheck disable=SC2046
out2=$(B apply "$REMOVE" $(hosted) STAGING_DATABASE_URL="postgresql://postgres.abcdefghijabcdefghij:$PW@$POOL:5432/postgres"); code2=$?
[ $code -ne 0 ] && [ $code2 -ne 0 ] && grep -q 'not the approved staging project' <<<"$out" && grep -q 'not the approved staging project' <<<"$out2" \
  && ! grep -q "$PW" <<<"$(visible "$out$out2")" && ok "both refuse Production's and another project's connection strings (password never shown)" || bad "wrong project (exit $code/$code2)"
# shellcheck disable=SC2046
out=$(A apply "$APPLY" $(hosted) PGSSLMODE=require STAGING_DATABASE_URL="postgresql://postgres.$REF:$PW@$POOL:5432/postgres"); code=$?
[ $code -ne 0 ] && grep -q 'full TLS verification' <<<"$out" && ok "refuses without full TLS verification" || bad "TLS (exit $code)"
out=$(A apply "$APPLY" STAGING_DATABASE_URL="postgresql://postgres.$REF:$PW@$POOL:5432/postgres"); code=$?
[ $code -ne 0 ] && grep -q 'only accepts a local database' <<<"$out" && ok "the local test mode can't skip the checks for a hosted database" || bad "local mode bypass (exit $code)"
mkdir -p "$tmp/repo/scripts/db"
cp scripts/db/staging-photo-cleanup.sh scripts/db/staging-pgnet-removal.sh scripts/db/staging-photo-cleanup-lib.sh scripts/db/verify-staging-target.sh \
   scripts/db/staging-schedule-media-drain.sql scripts/db/staging-remove-pg-net.sql "$tmp/repo/scripts/db/"
echo "-- unreviewed" >> "$tmp/repo/scripts/db/staging-schedule-media-drain.sql"
echo "-- unreviewed" >> "$tmp/repo/scripts/db/staging-remove-pg-net.sql"
out=$(WRAP_A="$tmp/repo/scripts/db/staging-photo-cleanup.sh" A apply "$APPLY"); code=$?
out2=$(WRAP_B="$tmp/repo/scripts/db/staging-pgnet-removal.sh" B apply "$REMOVE"); code2=$?
[ $code -ne 0 ] && [ $code2 -ne 0 ] && grep -q 'does not match the reviewed checksum' <<<"$out" && grep -q 'does not match the reviewed checksum' <<<"$out2" \
  && [ "$(method)" = pg_net ] && [ "$(has_ext pg_net)" = 1 ] && ok "both refuse a changed SQL script, changing nothing" || bad "changed script (exit $code/$code2)"
for pair in "scripts/db/staging-photo-cleanup.sh scripts/db/staging-schedule-media-drain.sql" "scripts/db/staging-pgnet-removal.sh scripts/db/staging-remove-pg-net.sql"; do
  set -- $pair
  [ "$(sed -n 's/^SCRIPT_SHA256=//p' "$1")" = "$(sha256sum "$2" | cut -d' ' -f1)" ] && ok "$1 pins the reviewed $2" || bad "$1's pin doesn't match $2"
done

# --- 2. verify on staging today, and runs that can't be attributed -----------------
out=$(A verify ''); code=$?
[ $code -eq 0 ] && grep -q 'old pg_net job is still in place' <<<"$out" && [ "$(method)" = pg_net ] && clean_out "$out" \
  && ok "verify (read only) reports the old pg_net job as not yet replaced" || bad "baseline verify (exit $code): $out"
out=$(B check ''); code=$?
[ $code -ne 0 ] && grep -q 'gate is not met' <<<"$out" && [ "$(has_ext pg_net)" = 1 ] && ok "pg_net removal refuses while the old pg_net job is in place" || bad "removal before apply (exit $code): $out"
"${PSQL[@]}" -c "select cron.schedule('crevant-test-caller', '0 4 * * *', \$q\$select '/functions/v1/post-media/drain'\$q\$)" >/dev/null
out=$(A apply "$APPLY"); code=$?
out2=$(A verify ''); code2=$?
"${PSQL[@]}" -c "select cron.unschedule('crevant-test-caller')" >/dev/null
[ $code -ne 0 ] && [ $code2 -ne 0 ] && grep -q 'another cron job calls the drain' <<<"$out" && [ "$(method)" = pg_net ] \
  && ok "apply and verify fail closed when another cron job calls the drain (nothing changed)" || bad "second caller (exit $code/$code2): $out"

# --- 3. apply: committed but unverified is reported as such ------------------------
old=$(jobid)
out=$(DRAIN=$FAKE200 A apply "$APPLY"); code=$?
[ $code -ne 0 ] && grep -q 'INSTALLED BUT UNVERIFIED' <<<"$out" && grep -q 'COMMITTED' <<<"$out" && grep -q 'not rolled back' <<<"$out" \
  && grep -q 'without exactly one matching drain pass' <<<"$out" && [ "$(method)" = http ] && [ "$(jobcount)" = 1 ] && [ "$(jobid)" != "$old" ] \
  && ok "a first run that answers 200 without a drain pass: INSTALLED BUT UNVERIFIED (committed, not rolled back, run fails)" || bad "200 without a pass (exit $code): $out"
out=$(A verify ''); code=$?
[ $code -ne 0 ] && grep -q 'UNVERIFIED' <<<"$out" && ok "verify keeps failing closed for that job" || bad "verify after unmatched (exit $code)"
# --- 4. pause: only the cleanup job --------------------------------------------------
out=$(A remove "$PAUSE"); code=$?
[ $code -eq 0 ] && grep -q 'Paused' <<<"$out" && [ "$(jobcount)" = 0 ] && [ "$(others_fp)" = "$OTHERS" ] && [ "$(has_ext pg_net)" = 1 ] \
  && ok "pause unschedules only the cleanup job: the unrelated cron job and extensions are untouched" || bad "pause (exit $code): $out"
out=$(A verify ''); code=$?
[ $code -ne 0 ] && grep -q 'no cleanup job is scheduled' <<<"$out" && ok "verify reports a paused cleanup as unverified" || bad "verify while paused (exit $code)"
out=$(A remove "$PAUSE"); code=$?
[ $code -eq 0 ] && [ "$(others_fp)" = "$OTHERS" ] && ok "pausing again is harmless" || bad "second pause (exit $code)"
"${PSQL[@]}" -c "select cron.schedule('post-media-drain', '0 3 * * *', 'select 42')" >/dev/null
out=$(A remove "$PAUSE"); code=$?
[ $code -ne 0 ] && grep -q 'not the photo cleanup' <<<"$out" && [ "$("${PSQL[@]}" -c "select command from cron.job where jobname = 'post-media-drain'")" = 'select 42' ] && [ "$(others_fp)" = "$OTHERS" ] \
  && ok "pause refuses to remove an unrelated job that happens to be named post-media-drain" || bad "unrelated same-name job (exit $code): $out"
"${PSQL[@]}" -c "select cron.unschedule('post-media-drain')" >/dev/null

# --- 5. apply: a first run that fails (HTTP 401) ------------------------------------
legacy_job
out=$(DRAIN=$GATEWAY A apply "$APPLY"); code=$?
[ $code -ne 0 ] && grep -q 'INSTALLED BUT UNVERIFIED' <<<"$out" && grep -q 'its first run failed' <<<"$out" && grep -q 'FAILED: HTTP 401' <<<"$out" \
  && [ "$(method)" = http ] && clean_out "$out" && ok "a first run refused with 401: INSTALLED BUT UNVERIFIED, reported as HTTP 401 only" || bad "401 first run (exit $code): $out"
A remove "$PAUSE" >/dev/null

# --- 6. apply: replaced, not duplicated, and verified end to end ---------------------
legacy_job; old=$(jobid)
out=$(A apply "$APPLY"); code=$?
[ $code -eq 0 ] && grep -q 'APPLIED AND VERIFIED' <<<"$out" && grep -q 'Replaced, not duplicated' <<<"$out" && grep -q 'verified (drain pass' <<<"$out" \
  && [ "$(jobcount)" = 1 ] && [ "$(jobid)" != "$old" ] && [ "$(method)" = http ] && [ "$(has_ext pg_net)" = 1 ] && [ "$(has_ext http)" = 1 ] \
  && [ "$("${PSQL[@]}" -c "select schedule from cron.job where jobname = 'post-media-drain'")" = '*/15 * * * *' ] && [ "$(others_fp)" = "$OTHERS" ] && clean_out "$out" \
  && ok "apply replaces the pg_net job (one job, new id), keeps pg_net, and verifies the first real run against a drain pass" || bad "apply (exit $code): $out"
out=$(A apply "$APPLY"); code=$?
[ $code -eq 0 ] && grep -q 'Already applied' <<<"$out" && [ "$(jobcount)" = 1 ] && ok "applying again changes nothing" || bad "second apply (exit $code)"

# --- 7. The removal gate ---------------------------------------------------------------
out=$(B check ''); code=$?
[ $code -ne 0 ] && grep -q '1 in a row so far' <<<"$out" && [ "$(has_ext pg_net)" = 1 ] && ok "removal refuses after only one verified run" || bad "gate with one run (exit $code): $out"
wait_finished 3
out=$(A verify ''); code=$?
[ $code -eq 0 ] && grep -q 'VERIFIED\. [3-9] consecutive' <<<"$out" && ok "verify: several consecutive verified runs" || bad "verify (exit $code): $out"
# A failed run since the replacement blocks removal, even after good runs.
store_key "$WRONG"; n=$(finished); wait_finished $((n + 1)); store_key "$KEY"; n=$(finished); wait_finished $((n + 2))
out=$(B check ''); code=$?
out2=$(A verify ''); code2=$?
[ $code -ne 0 ] && grep -q 'run(s) failed since the replacement' <<<"$out" && [ $code2 -ne 0 ] && clean_out "$out$out2" && [ "$(has_ext pg_net)" = 1 ] \
  && ok "a failed run since the replacement blocks removal, even with the newest runs verified" || bad "failed run gate (exit $code/$code2): $out"
# A fresh replacement; then a pass that matches no run, and a run with two passes.
A remove "$PAUSE" >/dev/null; legacy_job; A apply "$APPLY" >/dev/null; wait_finished 2
"${PSQL[@]}" -c "insert into ops.media_drain_runs (source, claimed, deleted, failed, finished_at) values ('scheduled', 0, 0, 0, now())" >/dev/null
out=$(B check ''); code=$?
out2=$(A verify ''); code2=$?
[ $code -ne 0 ] && grep -q "can't be attributed" <<<"$out" && [ $code2 -ne 0 ] && grep -q 'reliably attributed' <<<"$out2" \
  && ok "a drain pass that matches no run fails both closed" || bad "unattributed (exit $code/$code2): $out"
A remove "$PAUSE" >/dev/null; legacy_job; A apply "$APPLY" >/dev/null; wait_finished 2
"${PSQL[@]}" -c "insert into ops.media_drain_runs (source, claimed, deleted, failed, finished_at)
                 select 'scheduled', 0, 0, 0, start_time + (end_time - start_time) / 2 from cron.job_run_details
                 where jobid = (select jobid from cron.job where jobname = 'post-media-drain') and status = 'succeeded' order by runid desc limit 1" >/dev/null
out=$(B check ''); code=$?
[ $code -ne 0 ] && grep -q '2 matching drain passes' <<<"$out" && ok "a run with two matching drain passes is not verified, and blocks removal" || bad "double match (exit $code): $out"

# --- 8. Removal, once the gate is met ---------------------------------------------------
A remove "$PAUSE" >/dev/null; legacy_job; A apply "$APPLY" >/dev/null; wait_finished 2
before_job=$("${PSQL[@]}" -c "select jobid || md5(command) || schedule || active from cron.job where jobname = 'post-media-drain'")
out=$(B check ''); code=$?
[ $code -eq 0 ] && grep -q 'Gate met: [2-9] consecutive verified runs' <<<"$out" && grep -q 'Check passed' <<<"$out" && [ "$(has_ext pg_net)" = 1 ] && clean_out "$out" \
  && ok "removal check: gate met, a rolled-back drop, nothing changed" || bad "removal check (exit $code): $out"
out=$(B apply "$REMOVE"); code=$?
[ $code -eq 0 ] && grep -q 'Removed: pg_net' <<<"$out" && [ "$(has_ext pg_net)" = 0 ] && [ "$("${PSQL[@]}" -c "select to_regnamespace('net') is null")" = t ] \
  && [ "$("${PSQL[@]}" -c "select jobid || md5(command) || schedule || active from cron.job where jobname = 'post-media-drain'")" = "$before_job" ] && [ "$(others_fp)" = "$OTHERS" ] \
  && ok "removal apply drops pg_net and its schema; the cleanup job and the other cron job are unchanged" || bad "removal apply (exit $code): $out"
out=$(B apply "$REMOVE"); code=$?
[ $code -eq 0 ] && grep -q 'not installed here' <<<"$out" && ok "running the removal again is harmless" || bad "second removal (exit $code)"
n=$(finished); wait_finished $((n + 1))
out=$(A verify ''); code=$?
[ $code -eq 0 ] && grep -q 'VERIFIED' <<<"$out" && ok "after removal, the cleanup still runs and verifies" || bad "verify after removal (exit $code): $out"
all=0
for f in supabase/tests/*.sql; do
  if ! o=$(psql "$DB_URL" -X -q -v ON_ERROR_STOP=1 -f "$f" 2>&1); then all=1; echo "  $f failed: $(grep -m1 ERROR <<<"$o")"; fi
done
[ $all -eq 0 ] && ok "staging security checks 001 to 013 all pass afterwards (003 unchanged)" || bad "a staging security check failed"
out=$(A remove "$PAUSE"); code=$?
[ $code -eq 0 ] && [ "$(jobcount)" = 0 ] && [ "$(others_fp)" = "$OTHERS" ] && ok "pause still works after pg_net is gone" || bad "final pause (exit $code)"

echo "Cleanup workflow tests: $pass passed, $failed failed"
[ $failed -eq 0 ]
