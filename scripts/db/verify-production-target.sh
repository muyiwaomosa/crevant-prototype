#!/usr/bin/env bash
# PRODUCTION counterpart of verify-staging-target.sh, kept as a separate file
# so neither can ever be pointed at the other. Refuses to continue unless every
# signal points at the one approved Production project. Run before anything
# connects to the Production database.
#
# Inputs (environment variables):
#   EXPECTED_PROJECT_REF      hard-coded in the workflow file (reviewed PR)
#   SUPABASE_PROJECT_REF      GitHub "production" environment variable
#   CONFIRM_PROJECT_REF       typed by the person running the workflow
#   PRODUCTION_DATABASE_URL   GitHub "production" environment secret (never printed)
#
# On top of the staging checks (Supabase host, the project named in the
# login or host, port 5432, TLS not weakened, password masked), it refuses:
#   - an expected reference that isn't production.ref in
#     config/supabase-projects.json
#   - the staging project's reference, anywhere
set -euo pipefail

fail() { echo "::error::$1"; exit 1; }

: "${EXPECTED_PROJECT_REF:?}" 
[ -n "${SUPABASE_PROJECT_REF:-}" ] || fail "SUPABASE_PROJECT_REF is not set in the production environment."
[ -n "${CONFIRM_PROJECT_REF:-}" ] || fail "No project reference was typed to confirm the run."
[ -n "${PRODUCTION_DATABASE_URL:-}" ] || fail "PRODUCTION_DATABASE_URL is not set in the production environment."

[[ "$EXPECTED_PROJECT_REF" =~ ^[a-z0-9]{20}$ ]] || fail "The expected project reference in the workflow is malformed."
[ "$SUPABASE_PROJECT_REF" = "$EXPECTED_PROJECT_REF" ] || fail "SUPABASE_PROJECT_REF does not match the approved Production project."
[ "$CONFIRM_PROJECT_REF" = "$EXPECTED_PROJECT_REF" ] || fail "The typed confirmation does not match the approved Production project."

CONFIG_PRODUCTION=$(python3 -c "import json;print(json.load(open('config/supabase-projects.json'))['production']['ref'] or '')")
CONFIG_STAGING=$(python3 -c "import json;print(json.load(open('config/supabase-projects.json'))['staging']['ref'] or '')")
[ -n "$CONFIG_PRODUCTION" ] || fail "The Production project reference is not set in config/supabase-projects.json."
[ "$EXPECTED_PROJECT_REF" = "$CONFIG_PRODUCTION" ] || fail "The workflow's Production project reference does not match config/supabase-projects.json."
[ "$EXPECTED_PROJECT_REF" != "$CONFIG_STAGING" ] || fail "The Production workflow must never target the staging project."

# Parse the URL without ever printing it. On GitHub Actions, mask the password
# first, in case any later tool echoes part of the URL.
CONFIG_STAGING=$CONFIG_STAGING python3 - <<'PY'
import os, sys
from urllib.parse import urlsplit, parse_qs, unquote

def fail(msg):
    print(f"::error::{msg}")
    sys.exit(1)

raw = os.environ["PRODUCTION_DATABASE_URL"]
expected = os.environ["EXPECTED_PROJECT_REF"]
try:
    u = urlsplit(raw)
    port = u.port
except ValueError:
    fail("PRODUCTION_DATABASE_URL is not a valid URL (check that special characters in the password are URL-encoded).")

if u.password and os.environ.get("GITHUB_ACTIONS") == "true":
    for secret in {u.password, unquote(u.password)}:
        print(f"::add-mask::{secret}")

if u.scheme not in ("postgres", "postgresql"):
    fail("PRODUCTION_DATABASE_URL must start with postgresql://")
if not u.password:
    fail("PRODUCTION_DATABASE_URL has no password.")
host = (u.hostname or "").lower()
if not (host.endswith(".supabase.com") or host.endswith(".supabase.co")):
    fail("PRODUCTION_DATABASE_URL does not point at a Supabase host.")

user = unquote(u.username or "")
login = os.environ.get("EXPECTED_DB_USER") or "postgres"
if user.startswith(login + "."):
    ref = user.split(".", 1)[1]
    kind = "session pooler"
elif host.startswith("db.") and host.endswith(".supabase.co"):
    ref = host[len("db."):-len(".supabase.co")]
    kind = "direct connection"
    if login != "postgres" and user != login:
        fail(f"PRODUCTION_DATABASE_URL must log in as {login}.")
else:
    fail(f"PRODUCTION_DATABASE_URL must log in as {login} on the approved project (pooler user {login}.<project ref>).")

if ref == os.environ.get("CONFIG_STAGING", ""):
    fail("PRODUCTION_DATABASE_URL points at the staging project. Production and staging must never share a connection.")
if ref != expected:
    fail("PRODUCTION_DATABASE_URL belongs to a different Supabase project than the approved Production project.")
if port != 5432:
    fail("PRODUCTION_DATABASE_URL must use port 5432 (session pooler or direct), not the transaction pooler.")
sslmode = parse_qs(u.query).get("sslmode", [""])[0].lower()
if sslmode in ("disable", "allow", "prefer"):
    fail("PRODUCTION_DATABASE_URL must not disable or weaken TLS (remove the sslmode setting).")
if os.environ.get("REQUIRE_VERIFY_FULL") == "1":
    params = parse_qs(u.query, keep_blank_values=True)
    if any(k != "sslmode" for k in params) or params.get("sslmode", ["verify-full"]) != ["verify-full"]:
        fail("PRODUCTION_DATABASE_URL must not carry connection settings here, except sslmode=verify-full (full certificate verification).")

print(f"Production target verified: Supabase project {ref} via {kind} on port 5432.")
PY
