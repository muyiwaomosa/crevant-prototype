#!/usr/bin/env bash
# Fails if a secret-looking value appears in the built frontend (dist/).
# Publishable keys (sb_publishable_, pk_live_, pk_test_) are allowed.
set -euo pipefail
cd "$(dirname "$0")/.."
[ -d dist ] || { echo "dist/ not found; run npm run build first"; exit 1; }
PATTERN='sb_secret_|service_role|sk_(live|test)_[A-Za-z0-9]|rk_(live|test)_[A-Za-z0-9]|whsec_[A-Za-z0-9]|MUX_TOKEN_SECRET|MUX_SIGNING_KEY|re_[A-Za-z0-9]{20,}|-----BEGIN [A-Z ]*PRIVATE KEY-----'
HITS="$(mktemp)"
trap 'rm -f "$HITS"' EXIT
if grep -REn "$PATTERN" dist/ > "$HITS" 2>/dev/null; then
  echo "Possible secret found in the frontend bundle:"
  cut -c1-200 "$HITS"
  exit 1
fi
echo "No secrets found in dist/"
