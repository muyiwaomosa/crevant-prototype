#!/usr/bin/env bash
# Tests scripts/db/staging-schedule-check.sh (the "Photo cleanup schedule
# check on staging" workflow's only database step) against a LOCAL Supabase
# set up like staging today: pg_cron and pg_net installed, the old pg_net
# cleanup job, the drain key in Vault, http not installed. Local only: every
# hosted connection string here is fake, and each is refused before any
# connection is made.
#   1. Refusals before connecting: another branch, any argument, no
#      connection string, another project, Production, weakened TLS, the
#      local test mode with a hosted address, a changed scheduler script.
#   2. The check itself: it passes, shows the http job, and leaves the cron
#      job and extensions exactly as they were; it never prints the cron
#      command, the connection string or the Vault secret.
#   3. Attempts to make it do more than check: environment variables and a
#      psqlrc that set mode=apply change nothing.
#   4. A script that did persist something is caught by the fingerprints.
#   5. A refused check (no drain key) fails and changes nothing.
#   6. Timing: it waits outside the 15 minute boundary and for a run in progress.
set -uo pipefail
cd "$(dirname "$0")/../.."
DB_URL="${DB_URL:-postgresql://postgres:postgres@127.0.0.1:54322/postgres}"
case "$DB_URL" in
  *@127.0.0.1:*|*@localhost:*) ;;
  *) echo "Refusing: this test only runs against a local database." >&2; exit 1 ;;
esac
REF=kpudeppgokpjhvaqrprn
PW='Fake-Pw-For-Tests-91'
POOL=aws-0-us-west-2.pooler.supabase.com
PSQL=(psql "$DB_URL" -X -q -At -v ON_ERROR_STOP=1)
WRAPPER=scripts/db/staging-schedule-check.sh
pass=0; failed=0
ok()  { echo "PASS  schedule check workflow: $1"; pass=$((pass + 1)); }
bad() { echo "FAIL  schedule check workflow: $1"; failed=$((failed + 1)); }
tmp=$(mktemp -d)
KEY="$(node -e 'process.stdout.write(require("crypto").randomBytes(24).toString("hex"))')"
printf '#!/usr/bin/env bash\necho "slept $1" >> "%s/slept"\n' "$tmp" > "$tmp/fake-sleep"; chmod +x "$tmp/fake-sleep"
SAFE_EPOCH=$(( 1700000000 - 1700000000 % 900 + 420 ))   # 7 minutes past a quarter hour

cleanup() {
  "${PSQL[@]}" -c "select cron.unschedule(jobname) from cron.job where jobname = 'post-media-drain'" >/dev/null 2>&1 || true
  "${PSQL[@]}" -c "delete from cron.job_run_details where command = 'crevant schedule check test'" >/dev/null 2>&1 || true
  "${PSQL[@]}" -c "delete from vault.secrets where name = 'media_drain_key'" >/dev/null 2>&1 || true
  "${PSQL[@]}" -c "drop extension if exists pg_net" -c "drop extension if exists http" >/dev/null 2>&1 || true
  rm -rf "$tmp"
}
trap cleanup EXIT

# Staging today.
"${PSQL[@]}" -c "drop extension if exists http" -c "create extension if not exists pg_cron" -c "create extension if not exists pg_net with schema extensions" >/dev/null 2>&1
"${PSQL[@]}" -c "select cron.unschedule(jobname) from cron.job where jobname = 'post-media-drain'" >/dev/null 2>&1
"${PSQL[@]}" -c "delete from vault.secrets where name = 'media_drain_key'" -c "select vault.create_secret('$KEY', 'media_drain_key', 'local test')" >/dev/null
"${PSQL[@]}" -c "select cron.schedule('post-media-drain', '*/15 * * * *', \$job\$
      select net.http_post(
        url := 'https://kpudeppgokpjhvaqrprn.supabase.co/functions/v1/post-media/drain',
        headers := pg_catalog.jsonb_build_object(
          'Content-Type', 'application/json',
          'x-media-drain-key', (select s.decrypted_secret from vault.decrypted_secrets s where s.name = 'media_drain_key')),
        body := '{}'::jsonb,
        timeout_milliseconds := 20000)
    \$job\$)" >/dev/null
state() {
  "${PSQL[@]}" -c "select jobid || '|' || md5(command) || '|' || schedule || '|' || active from cron.job order by jobid" \
    -c "select string_agg(extname || ' ' || extversion, ',' order by extname) from pg_extension"
}
STATE=$(state)

# Runs the wrapper as the workflow does (GitHub Actions masking on, main),
# against the local database in local test mode unless overridden.
wrap() { # wrap [VAR=value ...] -- [args...]
  local envs=()
  while [ $# -gt 0 ] && [ "$1" != -- ]; do envs+=("$1"); shift; done
  [ "${1:-}" = -- ] && shift
  env GITHUB_ACTIONS=true GITHUB_REF=refs/heads/main STAGING_DATABASE_URL="$DB_URL" SCHEDULE_CHECK_LOCAL_TEST=1 \
      SCHEDULE_CHECK_EPOCH="$SAFE_EPOCH" SCHEDULE_CHECK_SLEEP="$tmp/fake-sleep" \
      EXPECTED_PROJECT_REF=$REF SUPABASE_PROJECT_REF=$REF CONFIRM_PROJECT_REF=$REF "${envs[@]}" "${WRAP:-$WRAPPER}" "$@" 2>&1
}
hosted() { # a fake hosted run: TLS settings as in the workflow, no local test mode
  wrap SCHEDULE_CHECK_LOCAL_TEST= PGSSLMODE=verify-full PGSSLROOTCERT="$PWD/config/certs/supabase-root-2021-ca.crt" REQUIRE_VERIFY_FULL=1 "$@"
}
visible() { grep -v '^::add-mask::' <<<"$1"; }
unchanged() { [ "$(state)" = "$STATE" ]; }

# --- 1. Refusals before connecting ----------------------------------------
out=$(wrap GITHUB_REF=refs/heads/claude/some-branch); code=$?
[ $code -ne 0 ] && grep -q 'only from the main branch' <<<"$out" && ! grep -q 'Before the check' <<<"$out" && unchanged \
  && ok "refuses outside main, before connecting" || bad "wrong branch (exit $code): $out"
for args in "apply" "--mode=apply" "-v mode=apply"; do
  # shellcheck disable=SC2086
  out=$(wrap -- $args); code=$?
  [ $code -ne 0 ] && grep -q 'takes no arguments' <<<"$out" && unchanged && ok "refuses an argument ($args)" || bad "argument $args (exit $code): $out"
done
out=$(wrap STAGING_DATABASE_URL=); code=$?
[ $code -ne 0 ] && grep -q 'STAGING_DATABASE_URL is not set' <<<"$out" && ok "refuses without a connection string" || bad "missing credentials (exit $code): $out"
out=$(hosted STAGING_DATABASE_URL="postgresql://postgres.abcdefghijabcdefghij:$PW@$POOL:5432/postgres"); code=$?
[ $code -ne 0 ] && grep -q 'not the approved staging project' <<<"$out" && ! grep -q "$PW" <<<"$(visible "$out")" \
  && ok "refuses another project's connection string (password never shown)" || bad "wrong project (exit $code): $(visible "$out")"
out=$(hosted STAGING_DATABASE_URL="postgresql://postgres.hmrliwoychnqrbbydorg:$PW@$POOL:5432/postgres"); code=$?
[ $code -ne 0 ] && grep -q 'not the approved staging project' <<<"$out" && ! grep -q "$PW" <<<"$(visible "$out")" \
  && ok "refuses Production's connection string" || bad "Production (exit $code): $(visible "$out")"
out=$(hosted CONFIRM_PROJECT_REF=hmrliwoychnqrbbydorg STAGING_DATABASE_URL="postgresql://postgres.$REF:$PW@$POOL:5432/postgres"); code=$?
[ $code -ne 0 ] && grep -q 'not the approved staging project' <<<"$out" && ok "refuses when the typed project reference is wrong" || bad "typed ref (exit $code): $(visible "$out")"
out=$(hosted PGSSLMODE=require STAGING_DATABASE_URL="postgresql://postgres.$REF:$PW@$POOL:5432/postgres"); code=$?
[ $code -ne 0 ] && grep -q 'full TLS verification' <<<"$out" && ok "refuses without full TLS verification" || bad "weakened TLS (exit $code): $(visible "$out")"
out=$(wrap STAGING_DATABASE_URL="postgresql://postgres.$REF:$PW@$POOL:5432/postgres"); code=$?
[ $code -ne 0 ] && grep -q 'only accepts a local database' <<<"$out" && ! grep -q "$PW" <<<"$(visible "$out")" \
  && ok "the local test mode can't be used to skip the checks for a hosted database" || bad "local mode bypass (exit $code): $(visible "$out")"
mkdir -p "$tmp/repo/scripts/db" "$tmp/repo/config"
cp scripts/db/staging-schedule-check.sh scripts/db/staging-schedule-media-drain.sql scripts/db/verify-staging-target.sh "$tmp/repo/scripts/db/"
echo "-- an unreviewed change" >> "$tmp/repo/scripts/db/staging-schedule-media-drain.sql"
out=$(WRAP="$tmp/repo/scripts/db/staging-schedule-check.sh" wrap); code=$?
[ $code -ne 0 ] && grep -q 'does not match the reviewed checksum' <<<"$out" && ! grep -q 'Before the check' <<<"$out" && unchanged \
  && ok "refuses a changed scheduler script, before connecting" || bad "changed script (exit $code): $out"
[ "$(sha256sum scripts/db/staging-schedule-media-drain.sql | cut -d' ' -f1)" = "$(sed -n 's/^SCRIPT_SHA256=//p' "$WRAPPER")" ] \
  && ok "the pinned checksum is the reviewed scheduler script's" || bad "the pinned checksum doesn't match the scheduler script"

# --- 2. The check itself --------------------------------------------------
rm -f "$tmp/slept"
out=$(wrap); code=$?
[ $code -eq 0 ] && grep -q 'No persistent change' <<<"$out" && grep -q 'Check passed' <<<"$out" && grep -q 'http (synchronous)' <<<"$out" \
  && grep -q '^  job|.*|post-media-drain|\*/15 \* \* \* \*|true|postgres|[0-9a-f]\{32\}|pg_net$' <<<"$out" && unchanged \
  && [ "$("${PSQL[@]}" -c "select count(*) from pg_extension where extname = 'http'")" = 0 ] && [ ! -e "$tmp/slept" ] \
  && ok "check passes, shows the http job, and the old pg_net job and extensions are untouched (http not installed)" || bad "check (exit $code): $out"
! grep -q "$KEY" <<<"$out" && ! grep -q 'jsonb_build_object\|decrypted_secret' <<<"$out" && ! grep -q 'postgres:postgres@' <<<"$out" \
  && ok "the output holds no Vault secret, cron command or connection string" || bad "something sensitive was printed"

# --- 3. Attempts to make it apply -----------------------------------------
printf '\\set mode apply\n\\set confirm '"'"'SCHEDULE THE STAGING PHOTO CLEANUP'"'"'\n' > "$tmp/psqlrc"
mkdir -p "$tmp/home"; cp "$tmp/psqlrc" "$tmp/home/.psqlrc"
out=$(wrap mode=apply MODE=apply confirm='SCHEDULE THE STAGING PHOTO CLEANUP' CONFIRM='SCHEDULE THE STAGING PHOTO CLEANUP' PSQLRC="$tmp/psqlrc" HOME="$tmp/home"); code=$?
[ $code -eq 0 ] && grep -q 'Check only:' <<<"$out" && ! grep -q '^  Done:' <<<"$out" && unchanged \
  && ok "variables and a psqlrc asking for apply change nothing: still check mode, nothing persisted" || bad "bypass attempt (exit $code): $out"

# --- 4. A script that persisted something is caught ------------------------
cp scripts/db/staging-schedule-media-drain.sql "$tmp/repo/scripts/db/staging-schedule-media-drain.sql"
python3 - "$tmp/repo/scripts/db/staging-schedule-media-drain.sql" <<'PY'
import sys
p = sys.argv[1]; s = open(p).read()
old = "\\else\n  rollback;\n  \\echo 'Check only:"
assert old in s
open(p, 'w').write(s.replace(old, "\\else\n  commit;\n  \\echo 'Check only:"))
PY
sum=$(sha256sum "$tmp/repo/scripts/db/staging-schedule-media-drain.sql" | cut -d' ' -f1)
sed -i "s/^SCRIPT_SHA256=.*/SCRIPT_SHA256=$sum/" "$tmp/repo/scripts/db/staging-schedule-check.sh"
out=$(WRAP="$tmp/repo/scripts/db/staging-schedule-check.sh" wrap); code=$?
[ $code -ne 0 ] && grep -q 'changed: check mode must leave nothing behind' <<<"$out" && grep -q 'Differences' <<<"$out" \
  && ok "a script that commits is caught: the fingerprints differ and the run fails" || bad "persistence not detected (exit $code): $out"
# Put staging's state back for the remaining tests.
"${PSQL[@]}" -c "select cron.unschedule('post-media-drain')" -c "drop extension if exists http" >/dev/null
"${PSQL[@]}" -c "select cron.schedule('post-media-drain', '*/15 * * * *', \$job\$
      select net.http_post(
        url := 'https://kpudeppgokpjhvaqrprn.supabase.co/functions/v1/post-media/drain',
        headers := pg_catalog.jsonb_build_object(
          'Content-Type', 'application/json',
          'x-media-drain-key', (select s.decrypted_secret from vault.decrypted_secrets s where s.name = 'media_drain_key')),
        body := '{}'::jsonb,
        timeout_milliseconds := 20000)
    \$job\$)" >/dev/null
STATE=$(state)

# --- 5. A refused check fails and changes nothing --------------------------
"${PSQL[@]}" -c "delete from vault.secrets where name = 'media_drain_key'" >/dev/null
out=$(wrap); code=$?
"${PSQL[@]}" -c "select vault.create_secret('$KEY', 'media_drain_key', 'local test')" >/dev/null
[ $code -ne 0 ] && grep -q 'drain key' <<<"$out" && grep -q 'No persistent change' <<<"$out" && grep -q 'did not complete' <<<"$out" && unchanged \
  && ok "when check mode refuses (no drain key), the run fails and nothing changed" || bad "refused check (exit $code): $out"

# --- 6. Timing --------------------------------------------------------------
q=$(( SAFE_EPOCH - 420 ))
for case in "$((q - 30))|120|30 seconds before a quarter hour" "$((q + 30))|60|30 seconds after a quarter hour" "$((q + 300))||5 minutes after"; do
  IFS='|' read -r at want what <<<"$case"
  rm -f "$tmp/slept"
  out=$(wrap SCHEDULE_CHECK_EPOCH="$at"); code=$?
  got=$(cat "$tmp/slept" 2>/dev/null | head -1)
  if [ -n "$want" ]; then
    [ $code -eq 0 ] && [ "$got" = "slept $want" ] && grep -q "waiting $want seconds" <<<"$out" && ok "$what: waits $want seconds first" || bad "$what (exit $code, '$got')"
  else
    [ $code -eq 0 ] && [ -z "$got" ] && ok "$what: starts at once" || bad "$what (exit $code, '$got')"
  fi
done
"${PSQL[@]}" -c "insert into cron.job_run_details (jobid, runid, job_pid, database, username, command, status, start_time)
                 values ((select jobid from cron.job where jobname = 'post-media-drain'), 999999, 0, 'postgres', 'postgres', 'crevant schedule check test', 'running', now())" >/dev/null
rm -f "$tmp/slept"
out=$(wrap); code=$?
"${PSQL[@]}" -c "delete from cron.job_run_details where command = 'crevant schedule check test'" >/dev/null
[ $code -ne 0 ] && grep -q 'still in progress' <<<"$out" && [ "$(grep -c 'slept 10' "$tmp/slept" 2>/dev/null)" = 6 ] && ! grep -q 'Before the check' <<<"$out" && unchanged \
  && ok "waits for a cleanup run in progress, and gives up after a minute without running the check" || bad "run in progress (exit $code): $out"

echo "Schedule check workflow tests: $pass passed, $failed failed"
[ $failed -eq 0 ]
