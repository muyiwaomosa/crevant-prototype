#!/usr/bin/env bash
# MEMBER PRODUCTION counterpart of verify-production-target.sh and
# verify-staging-target.sh, kept as a separate file so none can be pointed at
# another. Refuses to continue unless every signal points at the member
# Production project (splitpost-members-production). Connects to nothing.
# The database itself is then checked by scripts/db/verify-members-identity.sh.
#
# The approved reference comes ONLY from memberProduction.ref in
# config/supabase-projects.json (changed only by a reviewed PR). While it is
# null, the project isn't provisioned and this fails closed.
#
# Inputs (environment variables):
#   MEMBERS_PROJECT_REF               GitHub "members-production" environment variable
#   CONFIRM_PROJECT_REF               typed by the person running the workflow
#   MEMBERS_PRODUCTION_DATABASE_URL   GitHub "members-production" secret (never printed)
#
# Refuses: a null or malformed approved reference; an approved reference equal
# to the staging or waitlist project; an environment variable, typed
# reference or connection string naming any other project (the staging and
# waitlist projects above all); a non-Supabase host; a port other than 5432;
# weakened TLS; extra connection settings when REQUIRE_VERIFY_FULL=1; a login
# other than postgres. The password is masked before anything else.
set -euo pipefail

fail() { echo "::error::$1 Nothing was done."; exit 1; }

CFG=config/supabase-projects.json
read_ref() { python3 -c "import json,sys;v=json.load(open('$CFG')).get(sys.argv[1],{}).get('ref');print(v or '')" "$1"; }
EXPECTED="$(read_ref memberProduction)"
STAGING="$(read_ref staging)"
WAITLIST="$(read_ref production)"

[ -n "$EXPECTED" ] || fail "memberProduction.ref in $CFG is null: the member Production project is not provisioned, so member workflows can't run."
[[ "$EXPECTED" =~ ^[a-z]{20}$ ]] || fail "memberProduction.ref in $CFG is malformed."
[ -n "$STAGING" ] && [ -n "$WAITLIST" ] || fail "The staging or waitlist project reference is missing from $CFG, so separation can't be checked."
[ "$EXPECTED" != "$STAGING" ] || fail "memberProduction.ref is the staging project. Member Production must never be staging."
[ "$EXPECTED" != "$WAITLIST" ] || fail "memberProduction.ref is the waitlist project. Member Production must never be the waitlist project."

[ -n "${MEMBERS_PROJECT_REF:-}" ] || fail "MEMBERS_PROJECT_REF is not set in the members-production environment."
[ -n "${CONFIRM_PROJECT_REF:-}" ] || fail "No project reference was typed to confirm the run."
[ -n "${MEMBERS_PRODUCTION_DATABASE_URL:-}" ] || fail "MEMBERS_PRODUCTION_DATABASE_URL is not set in the members-production environment."
[ "$MEMBERS_PROJECT_REF" = "$EXPECTED" ] || fail "MEMBERS_PROJECT_REF does not match the approved member Production project."
[ "$CONFIRM_PROJECT_REF" = "$EXPECTED" ] || fail "The typed confirmation does not match the approved member Production project."

EXPECTED=$EXPECTED STAGING=$STAGING WAITLIST=$WAITLIST python3 - <<'PY'
import os, sys
from urllib.parse import urlsplit, parse_qs, unquote

def fail(msg):
    print(f"::error::{msg} Nothing was done.")
    sys.exit(1)

raw = os.environ["MEMBERS_PRODUCTION_DATABASE_URL"]
expected = os.environ["EXPECTED"]
try:
    u = urlsplit(raw)
    port = u.port
except ValueError:
    fail("MEMBERS_PRODUCTION_DATABASE_URL is not a valid URL (check that special characters in the password are URL-encoded).")

if u.password and os.environ.get("GITHUB_ACTIONS") == "true":
    for secret in {u.password, unquote(u.password)}:
        print(f"::add-mask::{secret}")

if u.scheme not in ("postgres", "postgresql"):
    fail("MEMBERS_PRODUCTION_DATABASE_URL must start with postgresql://")
if not u.password:
    fail("MEMBERS_PRODUCTION_DATABASE_URL has no password.")
host = (u.hostname or "").lower()
if not (host.endswith(".supabase.com") or host.endswith(".supabase.co")):
    fail("MEMBERS_PRODUCTION_DATABASE_URL does not point at a Supabase host.")

user = unquote(u.username or "")
if user.startswith("postgres."):
    ref = user.split(".", 1)[1]
    kind = "session pooler"
elif host.startswith("db.") and host.endswith(".supabase.co") and user == "postgres":
    ref = host[len("db."):-len(".supabase.co")]
    kind = "direct connection"
else:
    fail("MEMBERS_PRODUCTION_DATABASE_URL must log in as postgres on the approved project (pooler user postgres.<project ref>).")

if ref == os.environ["STAGING"]:
    fail("MEMBERS_PRODUCTION_DATABASE_URL points at the staging project. Member Production and staging must never share a connection.")
if ref == os.environ["WAITLIST"]:
    fail("MEMBERS_PRODUCTION_DATABASE_URL points at the waitlist project. Member Production and the waitlist must never share a connection.")
if ref != expected:
    fail("MEMBERS_PRODUCTION_DATABASE_URL belongs to a different Supabase project than the approved member Production project.")
if port != 5432:
    fail("MEMBERS_PRODUCTION_DATABASE_URL must use port 5432 (session pooler or direct), not the transaction pooler.")
params = parse_qs(u.query, keep_blank_values=True)
sslmode = params.get("sslmode", [""])[0].lower()
if sslmode in ("disable", "allow", "prefer"):
    fail("MEMBERS_PRODUCTION_DATABASE_URL must not disable or weaken TLS (remove the sslmode setting).")
if os.environ.get("REQUIRE_VERIFY_FULL") == "1":
    if any(k != "sslmode" for k in params) or params.get("sslmode", ["verify-full"]) != ["verify-full"]:
        fail("MEMBERS_PRODUCTION_DATABASE_URL must not carry connection settings here, except sslmode=verify-full (full certificate verification).")

print(f"Member Production target verified: Supabase project {ref} via {kind} on port 5432.")
PY
