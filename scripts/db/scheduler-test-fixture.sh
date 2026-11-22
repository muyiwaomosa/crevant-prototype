# The shared fixture of the three photo cleanup schedule suites (sourced,
# never run): scripts/db/schedule-media-drain-test.sh,
# scripts/db/staging-schedule-check-test.sh and
# scripts/db/staging-photo-cleanup-test.sh. Local only.
#   * Refuses anything but a local database.
#   * staging_like_state: staging today: pg_cron and pg_net, the old pg_net
#     cleanup job, the drain key in Vault, http not installed.
#   * start_keyed_drain: a copy of post-media with the drain key, sharing the
#     database container's network, so a schedule reaches it at 127.0.0.1
#     (as staging's reaches its own function).
# Every fixture step is checked afterwards, and one that didn't take effect
# stops the suite with "FIXTURE FAIL" (a fixture that silently failed to
# insert has hidden a test before). Nothing is ever signalled inside the
# database container: helpers run in their own containers beside it.

DB_URL="${DB_URL:-postgresql://postgres:postgres@127.0.0.1:54322/postgres}"
case "$DB_URL" in
  *@127.0.0.1:*|*@localhost:*) ;;
  *) echo "Refusing: this test only runs against a local database." >&2; exit 1 ;;
esac
DB_CONTAINER="${DB_CONTAINER:-supabase_db_crevant-prototype}"
STORAGE_CONTAINER="${STORAGE_CONTAINER:-supabase_storage_crevant-prototype}"
EDGE_IMAGE="${EDGE_IMAGE:-supabase/edge-runtime:v1.78.1}"
GATEWAY='http://kong:8000/functions/v1/post-media/drain'      # the gateway's copy: no drain key, so 401
KEYED='http://127.0.0.1:54397/functions/v1/post-media/drain'  # the keyed copy, beside the database
KEYED_CONTAINER=crevant-drain-beside-db
PSQL=(psql "$DB_URL" -X -q -At -v ON_ERROR_STOP=1)

# Stops the suite (its EXIT trap still cleans up).
fixture_fail() { echo "FIXTURE FAIL  $1" >&2; exit 1; }
new_key() { node -e 'process.stdout.write(require("crypto").randomBytes(24).toString("hex"))'; }
cleanup_job_method() {
  "${PSQL[@]}" -c "select case when command ~ 'extensions\.http\(' then 'http' when command ~ 'net\.http_post' then 'pg_net' else 'other' end
                   from cron.job where jobname = 'post-media-drain'"
}

# store_key <key>: the drain key in Vault, as on staging (replacing any other).
store_key() {
  "${PSQL[@]}" -c "delete from vault.secrets where name = 'media_drain_key'" -c "select vault.create_secret('$1', 'media_drain_key', 'local test')" >/dev/null \
    || fixture_fail "could not store the drain key in Vault"
  [ "$("${PSQL[@]}" -c "select count(*) from vault.decrypted_secrets where name = 'media_drain_key' and decrypted_secret = '$1'")" = 1 ] \
    || fixture_fail "the drain key is not in Vault after storing it"
}

# legacy_job: staging today's pg_net cleanup job (pointed at the local
# gateway), replacing any job of that name. Needs pg_net installed.
legacy_job() {
  "${PSQL[@]}" -c "select cron.unschedule('post-media-drain') where exists (select 1 from cron.job where jobname = 'post-media-drain')" >/dev/null \
    || fixture_fail "could not clear the cleanup job"
  "${PSQL[@]}" -c "select cron.schedule('post-media-drain', '*/15 * * * *', \$job\$
      select net.http_post(
        url := '$GATEWAY',
        headers := pg_catalog.jsonb_build_object(
          'Content-Type', 'application/json',
          'x-media-drain-key', (select s.decrypted_secret from vault.decrypted_secrets s where s.name = 'media_drain_key')),
        body := '{}'::jsonb,
        timeout_milliseconds := 20000)
    \$job\$)" >/dev/null || fixture_fail "could not schedule the old pg_net cleanup job"
  [ "$("${PSQL[@]}" -c "select count(*) from cron.job where jobname = 'post-media-drain' and schedule = '*/15 * * * *' and active")" = 1 ] \
    && [ "$(cleanup_job_method)" = pg_net ] || fixture_fail "the old pg_net cleanup job is not in place after scheduling it"
}

# staging_like_state <key>: staging today.
staging_like_state() {
  "${PSQL[@]}" -c "drop extension if exists http" -c "create extension if not exists pg_cron" -c "create extension if not exists pg_net with schema extensions" >/dev/null 2>&1 \
    || fixture_fail "could not set up pg_cron and pg_net without http"
  store_key "$1"
  legacy_job
  [ "$("${PSQL[@]}" -c "select string_agg(extname, ',' order by extname) from pg_extension where extname in ('pg_cron', 'pg_net', 'http')")" = pg_cron,pg_net ] \
    || fixture_fail "the extensions are not as on staging (pg_cron and pg_net, no http)"
}

# start_keyed_drain <key>: the keyed copy of post-media, beside the database.
# One of the local stack's own settings (its local development keys).
stack_env() { docker inspect "$STORAGE_CONTAINER" --format '{{range .Config.Env}}{{println .}}{{end}}' | sed -n "s/^$1=//p"; }
start_keyed_drain() {
  docker rm -f "$KEYED_CONTAINER" >/dev/null 2>&1 || true
  docker run -d --name "$KEYED_CONTAINER" --network "container:$DB_CONTAINER" \
    -e SUPABASE_URL=http://kong:8000 -e SUPABASE_ANON_KEY="$(stack_env ANON_KEY)" -e SUPABASE_SERVICE_ROLE_KEY="$(stack_env SERVICE_KEY)" -e MEDIA_DRAIN_KEY="$1" \
    -v "$PWD/supabase/functions/post-media:/home/deno/functions/post-media:ro" -v "$PWD/supabase/functions/_shared:/home/deno/functions/_shared:ro" \
    "$EDGE_IMAGE" start --main-service /home/deno/functions/post-media --ip 127.0.0.1 --port 54397 >/dev/null \
    || fixture_fail "could not start the keyed copy of post-media"
  for _ in $(seq 1 60); do docker exec "$DB_CONTAINER" nc -z 127.0.0.1 54397 2>/dev/null && return 0; sleep 1; done
  fixture_fail "the keyed copy of post-media is not listening beside the database after 60 seconds"
}
stop_keyed_drain() { docker rm -f "$KEYED_CONTAINER" >/dev/null 2>&1 || true; }

# wait_listening <port> <what>: a helper container's listener is up (checked
# without connecting, since some answer one connection only).
wait_listening() {
  for _ in $(seq 1 30); do docker exec "$DB_CONTAINER" netstat -ltn 2>/dev/null | grep -q ":$1 " && return 0; sleep 1; done
  fixture_fail "$2 is not listening on port $1 after 30 seconds"
}
