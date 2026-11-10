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

# The site build with the waitlist form fully configured (test values only):
# the bundle check must still pass, the function address must be the only
# Supabase address in it, and no Supabase key may appear.
VITE_SUPABASE_URL=https://kpudeppgokpjhvaqrprn.supabase.co \
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_ci_must_not_appear \
VITE_WAITLIST_FORM_ENABLED=true \
VITE_WAITLIST_ENDPOINT=https://kpudeppgokpjhvaqrprn.supabase.co/functions/v1/join-waitlist \
VITE_TURNSTILE_SITE_KEY=1x00000000000000000000AA \
VITE_PRIVACY_NOTICE_URL=/privacy \
VITE_PRIVACY_NOTICE_VERSION=test-only \
  npm run build:site >/dev/null
if grep -q "kpudeppgokpjhvaqrprn.supabase.co/functions/v1/join-waitlist" dist/assets/*.js && ! grep -q "sb_publishable_\|sb_secret_[A-Za-z0-9]" dist/assets/*.js; then
  echo "PASS  with the form configured, the site build holds the function address and no Supabase key"
else
  echo "FAIL  the configured site build is missing the function address or holds a Supabase key" >&2
  exit 1
fi
# Leave dist/ as the default (form off) build.
npm run build:site >/dev/null
