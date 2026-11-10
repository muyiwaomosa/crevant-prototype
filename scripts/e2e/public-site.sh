#!/usr/bin/env bash
# Builds the public site and runs its browser checks (e2e/public-site.e2e.cjs)
# with the vercel.json security headers applied.
#
# The build runs with made-up Supabase settings in its environment on
# purpose: the site build must leave them out, and the bundle check fails if
# any of them reach the output.
set -euo pipefail
cd "$(dirname "$0")/../.."
APP_PORT="${APP_PORT:-4176}"

VITE_SUPABASE_URL=https://kpudeppgokpjhvaqrprn.supabase.co \
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_ci_must_not_appear \
  npm run build:site

node_modules/.bin/vite preview --host 127.0.0.1 --port "$APP_PORT" --strictPort >/dev/null 2>&1 &
preview_pid=$!
trap 'kill "$preview_pid" 2>/dev/null || true' EXIT
for _ in $(seq 1 60); do
  curl -fs "http://127.0.0.1:$APP_PORT/" >/dev/null 2>&1 && break
  sleep 0.5
done

node e2e/public-site.e2e.cjs "http://127.0.0.1:$APP_PORT"
