#!/usr/bin/env bash
# Checks that the live production site is still the frozen demo build.
# Run after every merge to `main`. It only reads the public page.
#
# The fingerprint is the demo build at commit 421a0a1 on the `demo` branch.
# Update it only when the demo itself is deliberately changed, in a reviewed PR.
set -euo pipefail
URL="${1:-https://crevant-prototype.vercel.app/}"
EXPECTED=$'/assets/index-B7VqJe87.css\n/assets/index-DGNpDakc.js'

html="$(curl -fsS --max-time 20 "$URL")" || { echo "Could not fetch $URL"; exit 1; }
actual="$(grep -oE '/assets/[A-Za-z0-9_.-]+\.(js|css)' <<<"$html" | sort -u)"

if [ "$actual" = "$EXPECTED" ]; then
  echo "Production is the demo build: $(tr '\n' ' ' <<<"$actual")"
else
  echo "Production does NOT match the demo fingerprint."
  echo "Expected:"; sed 's/^/  /' <<<"$EXPECTED"
  echo "Found:";    sed 's/^/  /' <<<"$actual"
  exit 1
fi
