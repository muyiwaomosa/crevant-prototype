#!/usr/bin/env bash
# Tests the "Photo cleanup schedule on member Production" wrapper
# (scripts/db/members-photo-cleanup.sh) against a LOCAL Supabase set up like
# member Production today: every migration applied, no pg_net, no pg_cron and
# no cleanup job yet. Real pg_cron runs (every 5 seconds here) call:
#   * a copy of post-media with the drain key beside the database (a real
#     drain pass, recorded by the function in ops.media_drain_runs);
#   * the gateway's copy, which has no key (HTTP 401).
# Every hosted connection string here is fake and refused before connecting.
# Runs after scripts/db/staging-photo-cleanup-test.sh in CI; it leaves no
# cleanup job behind, and pg_cron and http installed (as that test does).
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
REF=brfdqkondnnzsguailcc
PW='Fake-Pw-For-Tests-91'
POOL=aws-0-ca-central-1.pooler.supabase.com
GATEWAY='http://kong:8000/functions/v1/post-media/drain'
KEYED='http://127.0.0.1:54397/functions/v1/post-media/drain'
APPLY='SCHEDULE THE MEMBER PRODUCTION PHOTO CLEANUP'
PAUSE='UNSCHEDULE THE MEMBER PRODUCTION PHOTO CLEANUP'
WRAP=scripts/db/members-photo-cleanup.sh
PSQL=(psql "$DB_URL" -X -q -At -v ON_ERROR_STOP=1)
ADMIN=(docker exec -i "$DB_CONTAINER" psql -U supabase_admin -d postgres -X -q -At -v ON_ERROR_STOP=1)
pass=0; failed=0
ok()  { echo "PASS  member cleanup workflow: $1"; pass=$((pass + 1)); }
bad() { echo "FAIL  member cleanup workflow: $1"; failed=$((failed + 1)); }
tmp=$(mktemp -d)
KEY="$(node -e 'process.stdout.write(require("crypto").randomBytes(24).toString("hex"))')"
printf '#!/usr/bin/env bash\necho "slept $1" >> "%s/slept"\n' "$tmp" > "$tmp/fake-sleep"; chmod +x "$tmp/fake-sleep"
SAFE_EPOCH=$(( 1700000000 - 1700000000 % 900 + 420 ))

unschedule_all() { "${PSQL[@]}" -c "select cron.unschedule(jobname) from cron.job where jobname in ('post-media-drain', 'crevant-test-other')" >/dev/null 2>&1 || true; }
cleanup() {
  unschedule_all
  "${PSQL[@]}" -c "delete from vault.secrets where name = 'media_drain_key'" >/dev/null 2>&1 || true
  "${ADMIN[@]}" -c "create extension if not exists pg_cron" >/dev/null 2>&1 || true
  docker rm -f crevant-member-drain >/dev/null 2>&1 || true
  rm -rf "$tmp"
}
trap cleanup EXIT

store_key() { "${PSQL[@]}" -c "delete from vault.secrets where name = 'media_drain_key'" -c "select vault.create_secret('$1', 'media_drain_key', 'local test')" >/dev/null; }
has_ext() { "${PSQL[@]}" -c "select count(*) from pg_extension where extname = '$1'"; }
jobcount() { if [ "$(has_ext pg_cron)" = 1 ]; then "${PSQL[@]}" -c "select count(*) from cron.job where jobname = 'post-media-drain'"; else echo 0; fi; }
jobid() { "${PSQL[@]}" -c "select coalesce(max(jobid), 0) from cron.job where jobname = 'post-media-drain'"; }
method() { "${PSQL[@]}" -c "select case when command ~ 'extensions\.http\(' then 'http' else 'other' end from cron.job where jobname = 'post-media-drain'"; }
every() { "${PSQL[@]}" -c "select cron.alter_job((select jobid from cron.job where jobname = 'post-media-drain'), schedule := '$1')" >/dev/null; }
finished() { "${PSQL[@]}" -c "select count(*) from cron.job_run_details where jobid = $(jobid) and status in ('succeeded', 'failed') and end_time is not null"; }
wait_finished() {
  every '5 seconds'
  for _ in $(seq 1 60); do [ "$(finished)" -ge "$1" ] && break; sleep 1; done
  every '*/15 * * * *'
  for _ in $(seq 1 25); do [ "$("${PSQL[@]}" -c "select count(*) from cron.job_run_details where jobid = $(jobid) and status not in ('succeeded', 'failed')")" = 0 ] && break; sleep 1; done
}
others_fp() { "${PSQL[@]}" -c "select jobid || '|' || jobname || '|' || md5(command) || '|' || schedule from cron.job where jobname <> 'post-media-drain' order by jobid"; }

base_env=(GITHUB_ACTIONS=true GITHUB_REF=refs/heads/main MEMBERS_PRODUCTION_DATABASE_URL="$DB_URL" SCHEDULE_CHECK_LOCAL_TEST=1
          SCHEDULE_CHECK_EPOCH="$SAFE_EPOCH" SCHEDULE_CHECK_SLEEP="$tmp/fake-sleep" SCHEDULE_TEST_INTERVAL='5 seconds' SCHEDULE_TEST_WAIT_MAX=60
          MEMBERS_PROJECT_REF=$REF CONFIRM_PROJECT_REF=$REF)
A() { # A <mode> <phrase> [VAR=value ...] -- [args]
  local mode=$1 phrase=$2; shift 2
  local envs=(); while [ $# -gt 0 ] && [ "$1" != -- ]; do envs+=("$1"); shift; done; [ "${1:-}" = -- ] && shift
  env "${base_env[@]}" SCHEDULE_TEST_DRAIN_URL="${DRAIN:-$KEYED}" MODE="$mode" CONFIRM_PHRASE="$phrase" "${envs[@]}" "${WRAP_A:-$WRAP}" "$@" 2>&1
}
hosted() { echo SCHEDULE_CHECK_LOCAL_TEST= PGSSLMODE=verify-full PGSSLROOTCERT="$PWD/config/certs/supabase-root-2021-ca.crt" REQUIRE_VERIFY_FULL=1; }
visible() { grep -v '^::add-mask::' <<<"$1"; }
clean_out() { ! grep -q "$KEY" <<<"$1" && ! grep -q 'decrypted_secret\|postgres:postgres@' <<<"$1"; }

# --- Set up: member Production today (no pg_net, no pg_cron, no job) -------------------
unschedule_all
"${PSQL[@]}" -c "delete from vault.secrets where name = 'media_drain_key'" >/dev/null 2>&1
"${ADMIN[@]}" -c "drop extension if exists pg_net cascade" -c "drop extension if exists pg_cron cascade" >/dev/null 2>&1 \
  || bad "fixture: could not remove pg_net and pg_cron"
[ "$(has_ext pg_cron)" = 0 ] && [ "$(has_ext pg_net)" = 0 ] || bad "fixture: pg_cron or pg_net is still installed"
ev() { docker inspect "$STORAGE_CONTAINER" --format '{{range .Config.Env}}{{println .}}{{end}}' | sed -n "s/^$1=//p"; }
docker rm -f crevant-member-drain >/dev/null 2>&1 || true
docker run -d --name crevant-member-drain --network "container:$DB_CONTAINER" \
  -e SUPABASE_URL=http://kong:8000 -e SUPABASE_ANON_KEY="$(ev ANON_KEY)" -e SUPABASE_SERVICE_ROLE_KEY="$(ev SERVICE_KEY)" -e MEDIA_DRAIN_KEY="$KEY" \
  -v "$PWD/supabase/functions/post-media:/home/deno/functions/post-media:ro" -v "$PWD/supabase/functions/_shared:/home/deno/functions/_shared:ro" \
  "$EDGE_IMAGE" start --main-service /home/deno/functions/post-media --ip 127.0.0.1 --port 54397 >/dev/null
for _ in $(seq 1 60); do docker exec "$DB_CONTAINER" nc -z 127.0.0.1 54397 2>/dev/null && break; sleep 1; done

# --- 1. Refusals before connecting --------------------------------------------------
out=$(A verify '' GITHUB_REF=refs/heads/claude/x); code=$?
[ $code -ne 0 ] && grep -q 'only from the main branch' <<<"$out" && ok "refuses outside main" || bad "branch (exit $code): $out"
out=$(A apply "$APPLY" -- --force); code=$?
[ $code -ne 0 ] && grep -q 'takes no arguments' <<<"$out" && ok "refuses arguments" || bad "arguments (exit $code): $out"
out=$(A restore-previous ''); code=$?
[ $code -ne 0 ] && grep -q 'mode must be verify, check, apply or remove' <<<"$out" && ok "has no other mode" || bad "unknown mode (exit $code): $out"
out=$(A apply ''); code=$?
out2=$(A apply 'SCHEDULE THE STAGING PHOTO CLEANUP'); code2=$?
[ $code -ne 0 ] && [ $code2 -ne 0 ] && grep -q 'needs the confirmation phrase' <<<"$out$out2" && [ "$(has_ext pg_cron)" = 0 ] \
  && ok "apply refuses without the exact member phrase (the staging phrase too), changing nothing" || bad "apply phrase (exit $code/$code2)"
out=$(A remove "$APPLY"); code=$?
[ $code -ne 0 ] && grep -q 'pause) needs the confirmation phrase' <<<"$out" && ok "pause refuses without its own phrase" || bad "pause phrase (exit $code)"
out=$(A verify '' MEMBERS_PRODUCTION_DATABASE_URL=); code=$?
[ $code -ne 0 ] && grep -q 'MEMBERS_PRODUCTION_DATABASE_URL is not set' <<<"$out" && ok "refuses without a connection string" || bad "missing credentials (exit $code): $out"
# shellcheck disable=SC2046
out=$(A apply "$APPLY" $(hosted) MEMBERS_PRODUCTION_DATABASE_URL="postgresql://postgres.kpudeppgokpjhvaqrprn:$PW@$POOL:5432/postgres"); code=$?
# shellcheck disable=SC2046
out2=$(A apply "$APPLY" $(hosted) MEMBERS_PRODUCTION_DATABASE_URL="postgresql://postgres.hmrliwoychnqrbbydorg:$PW@$POOL:5432/postgres"); code2=$?
[ $code -ne 0 ] && [ $code2 -ne 0 ] && grep -q 'not the approved member Production project' <<<"$out" && grep -q 'not the approved member Production project' <<<"$out2" \
  && ! grep -q "$PW" <<<"$(visible "$out$out2")" && ok "refuses staging's and the waitlist project's connection strings (password never shown)" || bad "wrong project (exit $code/$code2): $out"
# shellcheck disable=SC2046
out=$(A apply "$APPLY" $(hosted) PGSSLMODE=require MEMBERS_PRODUCTION_DATABASE_URL="postgresql://postgres.$REF:$PW@$POOL:5432/postgres"); code=$?
[ $code -ne 0 ] && grep -q 'full TLS verification' <<<"$out" && ok "refuses without full TLS verification" || bad "TLS (exit $code)"
out=$(A apply "$APPLY" MEMBERS_PRODUCTION_DATABASE_URL="postgresql://postgres.$REF:$PW@$POOL:5432/postgres"); code=$?
[ $code -ne 0 ] && grep -q 'only accepts a local database' <<<"$out" && ok "the local test mode can't skip the checks for a hosted database" || bad "local mode bypass (exit $code)"
mkdir -p "$tmp/repo/scripts/db"
cp scripts/db/members-photo-cleanup.sh scripts/db/staging-photo-cleanup-lib.sh scripts/db/verify-members-target.sh scripts/db/members-schedule-media-drain.sql "$tmp/repo/scripts/db/"
echo "-- unreviewed" >> "$tmp/repo/scripts/db/members-schedule-media-drain.sql"
out=$(WRAP_A="$tmp/repo/scripts/db/members-photo-cleanup.sh" A apply "$APPLY"); code=$?
[ $code -ne 0 ] && grep -q 'does not match the reviewed checksum' <<<"$out" && [ "$(has_ext pg_cron)" = 0 ] && ok "refuses a changed SQL script, changing nothing" || bad "changed script (exit $code): $out"
[ "$(sed -n 's/^SCRIPT_SHA256=//p' "$WRAP")" = "$(sha256sum scripts/db/members-schedule-media-drain.sql | cut -d' ' -f1)" ] && ok "the wrapper pins the reviewed SQL script" || bad "the pin doesn't match"

# --- 2. Before anything is installed -----------------------------------------------
out=$(A verify ''); code=$?
[ $code -ne 0 ] && grep -q 'no cleanup job is scheduled' <<<"$out" && [ "$(has_ext pg_cron)" = 0 ] && ok "verify without pg_cron reports no job (read only)" || bad "verify before install (exit $code): $out"
out=$(A check ''); code=$?
[ $code -ne 0 ] && grep -q 'drain key' <<<"$out" && [ "$(has_ext pg_cron)" = 0 ] && [ "$(has_ext http)" -le 1 ] && ok "check refuses without the Vault key, changing nothing" || bad "check without key (exit $code): $out"
store_key "$KEY"
http_before=$(has_ext http)
out=$(A check ''); code=$?
[ $code -eq 0 ] && grep -q 'Check passed' <<<"$out" && grep -q 'No persistent change' <<<"$out" && [ "$(has_ext pg_cron)" = 0 ] && [ "$(has_ext http)" = "$http_before" ] && clean_out "$out" \
  && ok "check without pg_cron: the job could be created, and pg_cron, http and the job were all rolled back" || bad "check (exit $code): $out"
"${ADMIN[@]}" -c "create extension pg_net" >/dev/null 2>&1
out=$(A check ''); code=$?
out2=$(A apply "$APPLY"); code2=$?
"${ADMIN[@]}" -c "drop extension pg_net cascade" >/dev/null 2>&1
[ $code -ne 0 ] && [ $code2 -ne 0 ] && grep -q 'pg_net is installed here' <<<"$out$out2" && [ "$(has_ext pg_cron)" = 0 ] \
  && ok "check and apply refuse while pg_net is installed, changing nothing" || bad "pg_net refusal (exit $code/$code2): $out2"

# --- 3. apply: installs pg_cron, http and one job, and verifies the first run -----------
out=$(A apply "$APPLY"); code=$?
[ $code -eq 0 ] && grep -q 'APPLIED AND VERIFIED' <<<"$out" && grep -q 'apply installs a fresh http job' <<<"$out" && grep -q 'verified (drain pass' <<<"$out" \
  && [ "$(has_ext pg_cron)" = 1 ] && [ "$(has_ext http)" = 1 ] && [ "$(has_ext pg_net)" = 0 ] && [ "$(jobcount)" = 1 ] && [ "$(method)" = http ] \
  && [ "$("${PSQL[@]}" -c "select schedule from cron.job where jobname = 'post-media-drain'")" = '*/15 * * * *' ] && clean_out "$out" \
  && ok "apply installs pg_cron and http, exactly one 15 minute http job, no pg_net, and verifies the first real run against a drain pass" || bad "apply (exit $code): $out"
"${PSQL[@]}" -c "select cron.schedule('crevant-test-other', '0 3 * * *', 'select 1')" >/dev/null
OTHERS=$(others_fp)
first=$(jobid)
out=$(A apply "$APPLY"); code=$?
[ $code -eq 0 ] && grep -q 'Already applied' <<<"$out" && [ "$(jobcount)" = 1 ] && [ "$(jobid)" = "$first" ] && ok "applying again changes nothing" || bad "second apply (exit $code): $out"
wait_finished 3
out=$(A verify ''); code=$?
[ $code -eq 0 ] && grep -q 'VERIFIED\. [3-9] consecutive' <<<"$out" && clean_out "$out" && ok "verify: several consecutive verified runs" || bad "verify (exit $code): $out"
out=$(A check ''); code=$?
[ $code -eq 0 ] && grep -q 'Check passed' <<<"$out" && [ "$(jobid)" = "$first" ] && [ "$(others_fp)" = "$OTHERS" ] && ok "check with the job installed rolls everything back (same job id)" || bad "check after apply (exit $code): $out"

# --- 4. pause, and a first run that fails ------------------------------------------
out=$(A remove "$PAUSE"); code=$?
[ $code -eq 0 ] && grep -q 'Paused' <<<"$out" && [ "$(jobcount)" = 0 ] && [ "$(others_fp)" = "$OTHERS" ] && ok "pause unschedules only the cleanup job" || bad "pause (exit $code): $out"
out=$(DRAIN=$GATEWAY A apply "$APPLY"); code=$?
[ $code -ne 0 ] && grep -q 'INSTALLED BUT UNVERIFIED' <<<"$out" && grep -q 'FAILED: HTTP 401' <<<"$out" && [ "$(jobcount)" = 1 ] && clean_out "$out" \
  && ok "a first run refused with 401: INSTALLED BUT UNVERIFIED (committed, not rolled back), reported as HTTP 401 only" || bad "401 first run (exit $code): $out"
out=$(A verify ''); code=$?
[ $code -ne 0 ] && grep -q 'pause (remove), then apply' <<<"$out" && ok "verify stays UNVERIFIED and says how to restart cleanly" || bad "verify when unverified (exit $code): $out"
A remove "$PAUSE" >/dev/null
out=$(A apply "$APPLY"); code=$?
[ $code -eq 0 ] && grep -q 'APPLIED AND VERIFIED' <<<"$out" && [ "$(jobcount)" = 1 ] && [ "$(others_fp)" = "$OTHERS" ] && ok "after a pause, apply installs a fresh job and verifies it" || bad "re-apply (exit $code): $out"
"${PSQL[@]}" -c "select cron.unschedule('post-media-drain')" -c "select cron.schedule('post-media-drain', '0 3 * * *', 'select 42')" >/dev/null
out=$(A apply "$APPLY"); code=$?
out2=$(A remove "$PAUSE"); code2=$?
[ $code -ne 0 ] && [ $code2 -ne 0 ] && [ "$("${PSQL[@]}" -c "select command from cron.job where jobname = 'post-media-drain'")" = 'select 42' ] \
  && ok "apply and pause refuse an unrelated job named post-media-drain, leaving it alone" || bad "unrelated job (exit $code/$code2): $out2"
"${PSQL[@]}" -c "select cron.unschedule('post-media-drain')" >/dev/null

# --- 5. Photo settings untouched; the shared checks still pass ------------------------------
[ "$("${PSQL[@]}" -c "select photos_enabled from ops.media_settings")" = f ] && ok "photo posting stays off throughout" || bad "photo posting was turned on"
all=0
for f in supabase/tests/012_post_photos.sql supabase/tests/013_photo_audience.sql; do
  if ! o=$(psql "$DB_URL" -X -q -v ON_ERROR_STOP=1 -f "$f" 2>&1); then all=1; echo "  $f failed: $(grep -m1 ERROR <<<"$o")"; fi
done
[ $all -eq 0 ] && ok "photo security checks 012 and 013 pass afterwards" || bad "a photo security check failed"

echo "Member cleanup workflow tests: $pass passed, $failed failed"
[ $failed -eq 0 ]
