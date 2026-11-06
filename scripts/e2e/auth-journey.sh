#!/usr/bin/env bash
# Full sign-in journey in a real browser against a REAL local Supabase (Docker).
# Never touches a hosted project.
#
#   1. Start local Supabase from supabase/config.toml (sign-up off, email
#      confirmation on, token-hash email templates) and reset it so every
#      migration is applied to an empty database.
#   2. Build the app pointed at the local stack, serve it at
#      http://127.0.0.1:4176 (the local Site URL), and run
#      e2e/auth-journey.e2e.cjs with the vercel.json security headers applied.
#
# Requires: Docker, psql, Node 22, Playwright with Chromium, and the pinned
# Supabase CLI on PATH. Usage: scripts/e2e/auth-journey.sh
set -euo pipefail
cd "$(dirname "$0")/../.."

EXCLUDE=realtime,storage-api,imgproxy,postgres-meta,studio,edge-runtime,logflare,vector,supavisor
APP_PORT=4176

expected_cli="${SUPABASE_CLI_VERSION:-2.122.1}"
if [ "$(supabase --version | tr -d '[:space:]')" != "$expected_cli" ]; then
  echo "Expected Supabase CLI $expected_cli" >&2
  exit 1
fi

echo "Starting local Supabase and applying every migration to an empty database"
supabase start -x "$EXCLUDE" >/dev/null
supabase db reset --local --no-seed >/dev/null

status="$(supabase status -o json 2>/dev/null)"
val() { node -e 'const s=JSON.parse(process.argv[1]); process.stdout.write(s[process.argv[2]] || "")' "$status" "$1"; }
export API_URL="$(val API_URL)" MAILPIT_URL="$(val MAILPIT_URL)" DB_URL="$(val DB_URL)"
export PUBLISHABLE_KEY="$(val PUBLISHABLE_KEY)" SERVICE_ROLE_KEY="$(val SERVICE_ROLE_KEY)"
case "$API_URL" in http://127.0.0.1:*|http://localhost:*) ;; *) echo "Refusing: API_URL is not local ($API_URL)" >&2; exit 1 ;; esac
for _ in $(seq 1 60); do
  curl -fs "$API_URL/auth/v1/health" -H "apikey: $PUBLISHABLE_KEY" >/dev/null 2>&1 && break
  sleep 1
done

echo "Building the app against the local stack"
VITE_SUPABASE_URL="$API_URL" VITE_SUPABASE_PUBLISHABLE_KEY="$PUBLISHABLE_KEY" npm run build >/dev/null

echo "Serving the build at http://127.0.0.1:$APP_PORT"
npx vite preview --host 127.0.0.1 --port "$APP_PORT" --strictPort >/dev/null 2>&1 &
preview_pid=$!
trap 'kill "$preview_pid" 2>/dev/null || true' EXIT
for _ in $(seq 1 60); do
  curl -fs "http://127.0.0.1:$APP_PORT/" >/dev/null 2>&1 && break
  sleep 0.5
done

APP_URL="http://127.0.0.1:$APP_PORT" node e2e/auth-journey.e2e.cjs
