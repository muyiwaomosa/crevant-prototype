#!/usr/bin/env bash
# Refuses to continue unless every signal points at the one approved staging
# project. Run before anything connects to a remote database.
#
# Inputs (environment variables):
#   EXPECTED_PROJECT_REF   hard-coded in the workflow file (changing it needs a reviewed PR)
#   SUPABASE_PROJECT_REF   GitHub "staging" environment variable
#   CONFIRM_PROJECT_REF    typed by the person running the workflow
#   STAGING_DATABASE_URL   GitHub "staging" environment secret (never printed)
#
# The connection string must:
#   - be a postgres:// or postgresql:// URL with a password
#   - point at Supabase (host ending .supabase.com or .supabase.co)
#   - name the expected project, either as the pooler user "postgres.<ref>"
#     or as the direct host "db.<ref>.supabase.co"
#   - use port 5432 (session pooler or direct), not the 6543 transaction pooler
#   - not disable or weaken TLS
set -euo pipefail

fail() { echo "::error::$1"; exit 1; }

: "${EXPECTED_PROJECT_REF:?}" 
[ -n "${SUPABASE_PROJECT_REF:-}" ] || fail "SUPABASE_PROJECT_REF is not set in the staging environment."
[ -n "${CONFIRM_PROJECT_REF:-}" ] || fail "No project reference was typed to confirm the run."
[ -n "${STAGING_DATABASE_URL:-}" ] || fail "STAGING_DATABASE_URL is not set in the staging environment."

[[ "$EXPECTED_PROJECT_REF" =~ ^[a-z0-9]{20}$ ]] || fail "The expected project reference in the workflow is malformed."
[ "$SUPABASE_PROJECT_REF" = "$EXPECTED_PROJECT_REF" ] || fail "SUPABASE_PROJECT_REF does not match the approved staging project."
[ "$CONFIRM_PROJECT_REF" = "$EXPECTED_PROJECT_REF" ] || fail "The typed confirmation does not match the approved staging project."

# Parse the URL without ever printing it. On GitHub Actions, mask the password
# first, in case any later tool echoes part of the URL.
python3 - <<'PY'
import os, sys
from urllib.parse import urlsplit, parse_qs, unquote

def fail(msg):
    print(f"::error::{msg}")
    sys.exit(1)

raw = os.environ["STAGING_DATABASE_URL"]
expected = os.environ["EXPECTED_PROJECT_REF"]
try:
    u = urlsplit(raw)
    port = u.port
except ValueError:
    fail("STAGING_DATABASE_URL is not a valid URL (check that special characters in the password are URL-encoded).")

if u.password and os.environ.get("GITHUB_ACTIONS") == "true":
    print(f"::add-mask::{u.password}")
    print(f"::add-mask::{unquote(u.password)}")

if u.scheme not in ("postgres", "postgresql"):
    fail("STAGING_DATABASE_URL must start with postgresql://")
if not u.password:
    fail("STAGING_DATABASE_URL has no password.")
host = (u.hostname or "").lower()
if not (host.endswith(".supabase.com") or host.endswith(".supabase.co")):
    fail("STAGING_DATABASE_URL does not point at a Supabase host.")

user = unquote(u.username or "")
if user.startswith("postgres."):
    ref = user.split(".", 1)[1]
    kind = "session pooler"
elif host.startswith("db.") and host.endswith(".supabase.co"):
    ref = host[len("db."):-len(".supabase.co")]
    kind = "direct connection"
else:
    fail("Could not find a Supabase project reference in STAGING_DATABASE_URL.")

if ref != expected:
    fail("STAGING_DATABASE_URL belongs to a different Supabase project than the approved staging project.")
if port != 5432:
    fail("STAGING_DATABASE_URL must use port 5432 (session pooler or direct), not the transaction pooler.")
sslmode = parse_qs(u.query).get("sslmode", [""])[0].lower()
if sslmode in ("disable", "allow", "prefer"):
    fail("STAGING_DATABASE_URL must not disable or weaken TLS (remove the sslmode setting).")

print(f"Target verified: Supabase project {ref} via {kind} on port 5432.")
PY
