#!/usr/bin/env bash
# Tests scripts/db/staging-schedule-media-drain.sql against a LOCAL Supabase
# database (pg_cron, pg_net and Vault, as on staging). Local only.
#   1. Refusals: no photo migration, no drain key in Vault, a non-staging
#      address, a missing or wrong confirmation. Each changes nothing.
#   2. check creates the schedule inside a transaction and rolls it back.
#   3. apply schedules post-media-drain every 15 minutes; the key is read from
#      Vault at run time and never appears in the job.
#   4. The job's own command, run now, reaches the post-media function through
#      the gateway (which refuses it: the gateway's copy has no drain key; the
#      key path is tested by scripts/e2e/post-media-edge.sh).
#   5. remove unschedules it.
set -uo pipefail
cd "$(dirname "$0")/../.."
DB_URL="${DB_URL:-postgresql://postgres:postgres@127.0.0.1:54322/postgres}"
case "$DB_URL" in
  *@127.0.0.1:*|*@localhost:*) ;;
  *) echo "Refusing: this test only runs against a local database." >&2; exit 1 ;;
esac
SQL=scripts/db/staging-schedule-media-drain.sql
URL='http://kong:8000/functions/v1/post-media/drain'
PSQL=(psql "$DB_URL" -X -q -At -v ON_ERROR_STOP=1)
pass=0; failed=0
ok()  { echo "PASS  photo cleanup schedule: $1"; pass=$((pass + 1)); }
bad() { echo "FAIL  photo cleanup schedule: $1"; failed=$((failed + 1)); }
run() { psql "$DB_URL" -X -q -v ON_ERROR_STOP=1 -v mode="$1" -v confirm="$2" -v drain_url="${3:-$URL}" -f "$SQL" 2>&1; }
jobs() { "${PSQL[@]}" -c "select count(*) from cron.job where jobname = 'post-media-drain'" 2>/dev/null || echo 0; }
KEY="$(node -e 'process.stdout.write(require("crypto").randomBytes(24).toString("hex"))')"
cleanup() { "${PSQL[@]}" -c "delete from vault.secrets where name = 'media_drain_key'" >/dev/null 2>&1 || true; }
trap cleanup EXIT
cleanup

out=$(run apply 'SCHEDULE THE STAGING PHOTO CLEANUP'); code=$?
[ $code -ne 0 ] && grep -q 'drain key' <<<"$out" && [ "$(jobs)" = 0 ] && ok "refuses without the drain key in Vault, changing nothing" || bad "ran without a drain key (exit $code)"
"${PSQL[@]}" -c "select vault.create_secret('$KEY', 'media_drain_key', 'post-media drain key (local test)')" >/dev/null
out=$(run apply 'SCHEDULE THE STAGING PHOTO CLEANUP' 'https://hmrliwoychnqrbbydorg.supabase.co/functions/v1/post-media/drain'); code=$?
[ $code -ne 0 ] && grep -q 'must be staging' <<<"$out" && [ "$(jobs)" = 0 ] && ok "refuses any address but staging's function (here: Production's)" || bad "accepted another address (exit $code)"
out=$(run apply 'schedule the staging photo cleanup'); code=$?
[ $code -ne 0 ] && grep -q 'confirmation phrase' <<<"$out" && [ "$(jobs)" = 0 ] && ok "refuses apply with a different phrase" || bad "applied without the exact phrase (exit $code)"
"${PSQL[@]}" -c "delete from supabase_migrations.schema_migrations where version = '20261127000000'" >/dev/null
out=$(run apply 'SCHEDULE THE STAGING PHOTO CLEANUP'); code=$?
"${PSQL[@]}" -c "insert into supabase_migrations.schema_migrations (version, name) values ('20261127000000', 'post_photos')" >/dev/null
[ $code -ne 0 ] && grep -q 'not applied here' <<<"$out" && [ "$(jobs)" = 0 ] && ok "refuses where photo posts aren't applied (as on Production)" || bad "ran without the photo migration (exit $code)"

out=$(run check ''); code=$?
[ $code -eq 0 ] && grep -q 'Check only' <<<"$out" && grep -Eq 'post-media-drain *\| *\*/15 \* \* \* \* *\| *t' <<<"$out" && [ "$(jobs)" = 0 ] \
  && ok "check shows the schedule it would create, then rolls back" || bad "check (exit $code): $(tail -3 <<<"$out" | tr '\n' ' ')"

out=$(run apply 'SCHEDULE THE STAGING PHOTO CLEANUP'); code=$?
cmd=$("${PSQL[@]}" -c "select command from cron.job where jobname = 'post-media-drain'")
[ $code -eq 0 ] && [ "$(jobs)" = 1 ] && [ "$("${PSQL[@]}" -c "select schedule from cron.job where jobname = 'post-media-drain'")" = '*/15 * * * *' ] \
  && grep -q "$URL" <<<"$cmd" && grep -q "vault.decrypted_secrets" <<<"$cmd" && ! grep -q "$KEY" <<<"$cmd" \
  && ok "apply schedules the drain every 15 minutes; the key is read from Vault at run time, never stored in the job" || bad "apply (exit $code)"
out=$(run apply 'SCHEDULE THE STAGING PHOTO CLEANUP'); code=$?
[ $code -eq 0 ] && [ "$(jobs)" = 1 ] && ok "applying again leaves exactly one schedule" || bad "a second apply (exit $code, jobs $(jobs))"

# Run the job's own command now and wait for pg_net's answer.
rid=$("${PSQL[@]}" -c "select (regexp_match(command, 'select net\.http_post'))[1] is not null from cron.job where jobname = 'post-media-drain'")
id=$("${PSQL[@]}" -c "do \$\$ declare c text := (select command from cron.job where jobname = 'post-media-drain'); r bigint; begin execute c into r; perform set_config('crevant.req', r::text, false); end \$\$; select current_setting('crevant.req')" | tail -1)
status=''
for _ in $(seq 1 30); do
  status=$("${PSQL[@]}" -c "select status_code from net._http_response where id = $id" 2>/dev/null)
  [ -n "$status" ] && break
  sleep 1
done
[ "$rid" = t ] && [ "$status" = 401 ] && ok "the job's command reaches the post-media function from the database (refused there without the key, as expected)" || bad "the job's command did not reach the function (status '$status')"

out=$(run remove 'UNSCHEDULE THE STAGING PHOTO CLEANUP'); code=$?
[ $code -eq 0 ] && [ "$(jobs)" = 0 ] && ok "remove unschedules it" || bad "remove (exit $code)"

echo "Photo cleanup schedule tests: $pass passed, $failed failed"
[ $failed -eq 0 ]
