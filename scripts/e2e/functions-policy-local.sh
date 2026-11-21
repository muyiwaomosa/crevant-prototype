#!/usr/bin/env bash
# Phase 1B-2: CORS and authorization are independent (e2e/functions-policy.e2e.cjs),
# on a real LOCAL Supabase with every migration applied. Local only.
set -euo pipefail
cd "$(dirname "$0")/../.."
status="$(supabase status -o json 2>/dev/null)"
val() { node -e 'const s=JSON.parse(process.argv[1]); process.stdout.write(s[process.argv[2]] || "")' "$status" "$1"; }
export API_URL="$(val API_URL)" DB_URL="$(val DB_URL)" SERVICE_ROLE_KEY="$(val SERVICE_ROLE_KEY)" PUBLISHABLE_KEY="$(val PUBLISHABLE_KEY)"
case "$API_URL" in http://127.0.0.1:*|http://localhost:*) ;; *) echo "Refusing: API_URL is not local ($API_URL)" >&2; exit 1 ;; esac
DB_URL="$DB_URL" scripts/db/local-open-launch-gate.sh  # test databases only: the launch gate starts closed
node e2e/functions-policy.e2e.cjs
