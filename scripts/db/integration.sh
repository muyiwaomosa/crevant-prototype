#!/usr/bin/env bash
# Integration test against a REAL local Supabase (Docker), never a hosted project.
#
#   1. Start local Supabase from supabase/config.toml (login settings mirror
#      staging: public sign-up off, email login on, confirmation required).
#   2. Reset the local database to Phase 0 only (before the PR 2 migration).
#   3. Create identities that exist before the migration through the real
#      Auth admin API: one confirmed, one invited and unconfirmed.
#   4. Record the Auth settings, apply the remaining migrations locally, then
#      run scripts/db/integration-test.mjs.
#
# Uses only the standard local development keys printed by `supabase status`.
# Requires: Docker, psql, Node 22, and the pinned Supabase CLI on PATH.
#
# Usage: scripts/db/integration.sh            (leaves the stack running)
#        STOP_AFTER=1 scripts/db/integration.sh
set -euo pipefail
cd "$(dirname "$0")/../.."

PHASE0_VERSION=20261106000000
EXCLUDE=realtime,storage-api,imgproxy,postgres-meta,studio,edge-runtime,logflare,vector,supavisor

expected_cli="${SUPABASE_CLI_VERSION:-2.122.1}"
if [ "$(supabase --version | tr -d '[:space:]')" != "$expected_cli" ]; then
  echo "Expected Supabase CLI $expected_cli" >&2
  exit 1
fi

echo "Starting local Supabase"
supabase start -x "$EXCLUDE" >/dev/null

echo "Resetting the local database to Phase 0 ($PHASE0_VERSION)"
supabase db reset --local --no-seed --version "$PHASE0_VERSION" >/dev/null

status="$(supabase status -o json 2>/dev/null)"
val() { node -e 'const s=JSON.parse(process.argv[1]); process.stdout.write(s[process.argv[2]] || "")' "$status" "$1"; }
export API_URL="$(val API_URL)" MAILPIT_URL="$(val MAILPIT_URL)" DB_URL="$(val DB_URL)"
export PUBLISHABLE_KEY="$(val PUBLISHABLE_KEY)" SERVICE_ROLE_KEY="$(val SERVICE_ROLE_KEY)"
case "$API_URL" in http://127.0.0.1:*|http://localhost:*) ;; *) echo "Refusing: API_URL is not local ($API_URL)" >&2; exit 1 ;; esac
case "$DB_URL" in *127.0.0.1*|*localhost*) ;; *) echo "Refusing: DB_URL is not local" >&2; exit 1 ;; esac

# Wait for Auth after the reset.
for _ in $(seq 1 60); do
  curl -fs "$API_URL/auth/v1/health" -H "apikey: $PUBLISHABLE_KEY" >/dev/null 2>&1 && break
  sleep 1
done

export RUN_ID="$(date +%s)"
export AUTH_SETTINGS_BEFORE="$(curl -fsS "$API_URL/auth/v1/settings" -H "apikey: $PUBLISHABLE_KEY")"

echo "Creating identities that exist before the PR 2 migration"
admin() { curl -fsS -X POST "$API_URL/auth/v1/$1" -H "apikey: $SERVICE_ROLE_KEY" -H "Authorization: Bearer $SERVICE_ROLE_KEY" -H "Content-Type: application/json" -d "$2"; }
export PRE_CONFIRMED_ID="$(admin admin/users "{\"email\":\"pre-confirmed-$RUN_ID@example.test\",\"password\":\"Pre-Confirmed-Pass-1\",\"email_confirm\":true}" | node -e 'let d="";process.stdin.on("data",c=>d+=c).on("end",()=>process.stdout.write(JSON.parse(d).id))')"
export PRE_INVITED_EMAIL="pre-invited-$RUN_ID@example.test"
export PRE_INVITED_ID="$(admin invite "{\"email\":\"$PRE_INVITED_EMAIL\"}" | node -e 'let d="";process.stdin.on("data",c=>d+=c).on("end",()=>process.stdout.write(JSON.parse(d).id))')"
psql "$DB_URL" -v ON_ERROR_STOP=1 -qAt -c "select 'profiles table before migration: ' || (to_regclass('public.profiles') is not null)::text"

echo "Applying the remaining migrations to the local database"
supabase migration up --local >/dev/null
for _ in $(seq 1 30); do
  curl -fs "$API_URL/rest/v1/profiles?select=id&limit=1" -H "apikey: $SERVICE_ROLE_KEY" -H "Authorization: Bearer $SERVICE_ROLE_KEY" >/dev/null 2>&1 && break
  sleep 1
done

node scripts/db/integration-test.mjs

if [ "${STOP_AFTER:-0}" = "1" ]; then supabase stop --no-backup >/dev/null; fi
