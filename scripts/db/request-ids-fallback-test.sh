#!/usr/bin/env bash
# Runs src/app/api.local-supabase.test.ts against the LOCAL Supabase: the app's
# real API code posting against the old schema (request id versions removed
# with their staging rollback) and the new one (reapplied). Local only.
# Requires the local stack running with every migration applied, the
# Supabase CLI on PATH, psql, and npm dependencies. Used by CI's Integration job.
set -euo pipefail
cd "$(dirname "$0")/../.."
status="$(supabase status -o env)"
get() { grep -E "^$1=" <<<"$status" | head -1 | cut -d= -f2- | tr -d '"'; }
export LOCAL_SUPABASE_API_URL="$(get API_URL)"
export LOCAL_SUPABASE_ANON_KEY="$(get ANON_KEY)"
export LOCAL_SUPABASE_SERVICE_ROLE_KEY="$(get SERVICE_ROLE_KEY)"
export LOCAL_SUPABASE_DB_URL="$(get DB_URL)"
case "$LOCAL_SUPABASE_DB_URL" in
  *@127.0.0.1:*|*@localhost:*) ;;
  *) echo "Refusing: this test only runs against a local database." >&2; exit 1 ;;
esac
out="$(npx vitest run src/app/api.local-supabase.test.ts 2>&1)" || { echo "$out"; exit 1; }
echo "$out" | tail -6
# It must actually have run (not skipped).
grep -qE "Tests +3 passed" <<<"$out" || { echo "FAIL: the local Supabase compatibility tests did not all run" >&2; exit 1; }
echo "PASS: posting works once against the old schema (fallback) and the new one (request id)"
