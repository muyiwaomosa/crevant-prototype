#!/usr/bin/env bash
# Refuses to continue unless every signal points at the one approved staging
# project. Run before anything connects to a remote database.
#
# Inputs (environment variables):
#   EXPECTED_PROJECT_REF   hard-coded in the workflow file (changing it needs a reviewed PR)
#   SUPABASE_PROJECT_REF   GitHub "staging" environment variable
#   CONFIRM_PROJECT_REF    typed by the person running the workflow
#   STAGING_DATABASE_URL   GitHub "staging" environment secret (never printed)
#   EXPECTED_DB_USER       optional: the login the URL must use (default:
#                          postgres). The waitlist admin workflow sets
#                          waitlist_admin, so only the restricted login passes.
#
# The connection string must:
#   - be a postgres:// or postgresql:// URL with a password
#   - point at Supabase (host ending .supabase.com or .supabase.co)
#   - name the expected project, either as the pooler user "<login>.<ref>"
#     or as the direct host "db.<ref>.supabase.co" with the user "<login>"
#     (<login> is EXPECTED_DB_USER, default postgres)
#   - use port 5432 (session pooler or direct), not the 6543 transaction pooler
#   - not disable or weaken TLS
#   - with REQUIRE_VERIFY_FULL=1 (the rollback workflow): carry no connection
#     settings at all except sslmode=verify-full, so full certificate and
#     hostname verification can't be overridden from the URL
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
    for secret in {u.password, unquote(u.password)}:
        print(f"::add-mask::{secret}")

if u.scheme not in ("postgres", "postgresql"):
    fail("STAGING_DATABASE_URL must start with postgresql://")
if not u.password:
    fail("STAGING_DATABASE_URL has no password.")
host = (u.hostname or "").lower()
if not (host.endswith(".supabase.com") or host.endswith(".supabase.co")):
    fail("STAGING_DATABASE_URL does not point at a Supabase host.")

user = unquote(u.username or "")
login = os.environ.get("EXPECTED_DB_USER") or "postgres"
if user.startswith(login + "."):
    ref = user.split(".", 1)[1]
    kind = "session pooler"
elif host.startswith("db.") and host.endswith(".supabase.co"):
    ref = host[len("db."):-len(".supabase.co")]
    kind = "direct connection"
    if login != "postgres" and user != login:
        fail(f"STAGING_DATABASE_URL must log in as {login}.")
else:
    fail(f"STAGING_DATABASE_URL must log in as {login} on the approved project (pooler user {login}.<project ref>).")

if ref != expected:
    fail("STAGING_DATABASE_URL belongs to a different Supabase project than the approved staging project.")
if port != 5432:
    fail("STAGING_DATABASE_URL must use port 5432 (session pooler or direct), not the transaction pooler.")
sslmode = parse_qs(u.query).get("sslmode", [""])[0].lower()
if sslmode in ("disable", "allow", "prefer"):
    fail("STAGING_DATABASE_URL must not disable or weaken TLS (remove the sslmode setting).")
if os.environ.get("REQUIRE_VERIFY_FULL") == "1":
    params = parse_qs(u.query, keep_blank_values=True)
    if any(k != "sslmode" for k in params) or params.get("sslmode", ["verify-full"]) != ["verify-full"]:
        fail("STAGING_DATABASE_URL must not carry connection settings here, except sslmode=verify-full (full certificate verification).")

print(f"Target verified: Supabase project {ref} via {kind} on port 5432.")
PY
