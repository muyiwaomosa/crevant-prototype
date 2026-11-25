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
# At the production address, a build without Production approval must still
# show the demo, and be noindex with robots.txt disallowing everything.
node e2e/public-site-launch.e2e.cjs "$APP_PORT" unapproved
kill "$preview_pid" 2>/dev/null || true

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
# A splitpost Preview build with unrelated VITE_ settings in its environment
# (another project's address, a database connection string): the site reads
# its settings one by one, so none of them reaches the bundle, and the bundle
# check passes. (The splitpost Previews of PRs #41 and #43 failed this way.)
SPLITPOST="$(node -p "require('./config/vercel-projects.json').publicSite.projectId")"
env -u VITE_SUPABASE_URL -u VITE_SUPABASE_PUBLISHABLE_KEY VERCEL_ENV=preview VERCEL_PROJECT_ID="$SPLITPOST" \
  VITE_STRAY_ADDRESS=https://hmrliwoychnqrbbydorg.supabase.co \
  VITE_STRAY_DATABASE=postgresql://postgres.hmrliwoychnqrbbydorg:x@aws-0-us-west-2.pooler.supabase.com:5432/postgres \
  npm run build >/dev/null
if grep -qE "hmrliwoychnqrbbydorg|VITE_STRAY|pooler\.supabase" dist/assets/*.js; then
  echo "FAIL  an unrelated VITE_ setting reached the site bundle" >&2
  exit 1
fi
echo "PASS  a splitpost Preview build keeps unrelated VITE_ settings out of the bundle"

# Leave dist/ as the default (form off) build.
npm run build:site >/dev/null

# An APPROVED Production build with indexing approved (simulated: nothing is
# deployed). It must build only the public site, pass the bundle check with
# the staging project forbidden, show the public site at the production
# address, and index only / and /join. Without approval it must not build.
# What Vercel sets for a Git build of main in the splitpost project
# (config/vercel-projects.json). The guard needs all of it for Production.
SITE_PROJECT="$(node -p "require('./config/vercel-projects.json').publicSite.projectId")"
DEMO_PROJECT="$(node -p "require('./config/vercel-projects.json').demo.projectId")"
VERCEL_GIT=(VERCEL_GIT_REPO_OWNER=muyiwaomosa VERCEL_GIT_REPO_SLUG=crevant-prototype VERCEL_GIT_COMMIT_REF=main)
if env -u VITE_SUPABASE_URL -u VITE_SUPABASE_PUBLISHABLE_KEY VERCEL_ENV=production VERCEL_PROJECT_ID="$SITE_PROJECT" "${VERCEL_GIT[@]}" npm run build >/dev/null 2>&1; then
  echo "FAIL  a Production build ran without approval" >&2
  exit 1
fi
echo "PASS  a Production build without approval is refused"
if env -u VITE_SUPABASE_URL -u VITE_SUPABASE_PUBLISHABLE_KEY VERCEL_ENV=production CREVANT_PRODUCTION_SITE_APPROVED=true \
  VERCEL_PROJECT_ID="$DEMO_PROJECT" "${VERCEL_GIT[@]}" npm run build >/dev/null 2>&1; then
  echo "FAIL  the public site built for Production in the demo project" >&2
  exit 1
fi
echo "PASS  an approved Production build in the demo project (crevant-prototype) is refused"
env -u VITE_SUPABASE_URL -u VITE_SUPABASE_PUBLISHABLE_KEY \
  VERCEL_ENV=production CREVANT_PRODUCTION_SITE_APPROVED=true CREVANT_ALLOW_INDEXING=true \
  VERCEL_PROJECT_ID="$SITE_PROJECT" "${VERCEL_GIT[@]}" \
  npm run build >/dev/null
node_modules/.bin/vite preview --host 127.0.0.1 --port "$APP_PORT" --strictPort >/dev/null 2>&1 &
preview_pid=$!
for _ in $(seq 1 60); do
  curl -fs "http://127.0.0.1:$APP_PORT/" >/dev/null 2>&1 && break
  sleep 0.5
done
node e2e/public-site-launch.e2e.cjs "$APP_PORT" approved
kill "$preview_pid" 2>/dev/null || true

# Leave dist/ as the default (form off, not approved) public site build.
npm run build:site >/dev/null
