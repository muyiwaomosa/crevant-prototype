#!/usr/bin/env bash
# MEMBER PRODUCTION: the first step of every member workflow that connects to
# the database. Proves the database behind MEMBERS_PRODUCTION_DATABASE_URL is
# the member Production project, independently of the URL: that database must
# hold exactly one env_identity.marker row, labelled
# splitpost-members-production, whose SHA-256 matches the
# MEMBERS_DB_IDENTITY_MARKER secret (scripts/db/members-identity-provision.sql
# records it once, by hand).
#
# Fails closed (exit 1, nothing else runs) if the secret is missing or
# malformed, the schema or table is missing, there are zero or several rows,
# the label differs, the hash differs, or the database can't be read.
#
# Read only: one query in a read-only transaction and session. The marker is
# never printed, never passed on a command line (only its hash is compared,
# in this shell), and is masked first on GitHub Actions.
#
# Inputs: MEMBERS_PRODUCTION_DATABASE_URL, MEMBERS_DB_IDENTITY_MARKER.
#
# When psql fails, the error text is kept in a private
# temporary file (never printed) and reduced to one fixed category word by
# scripts/db/pg-error-category.sh, so the log says why without showing the
# host, user, URL or anything else from the error.
set -euo pipefail
. "$(dirname "$0")/pg-error-category.sh"
errf="$(mktemp)"; trap 'rm -f "$errf"' EXIT
fail() { echo "::error::$1 Nothing was done."; exit 1; }
LABEL=splitpost-members-production

[ -n "${MEMBERS_PRODUCTION_DATABASE_URL:-}" ] || fail "MEMBERS_PRODUCTION_DATABASE_URL is not set in the members-production environment."
marker="${MEMBERS_DB_IDENTITY_MARKER:-}"
if [ "${GITHUB_ACTIONS:-}" = true ] && [ -n "$marker" ]; then echo "::add-mask::$marker"; fi
[ -n "$marker" ] || fail "MEMBERS_DB_IDENTITY_MARKER is not set in the members-production environment."
[[ "$marker" =~ ^[0-9a-f]{64}$ ]] || fail "MEMBERS_DB_IDENTITY_MARKER is not 64 lowercase hex characters (openssl rand -hex 32)."
want="$(printf '%s' "$marker" | sha256sum | cut -d' ' -f1)"
unset marker MEMBERS_DB_IDENTITY_MARKER

# label|hash per row, then a final count line. No row means no output rows.
out="$(PGOPTIONS='-c default_transaction_read_only=on' psql "$MEMBERS_PRODUCTION_DATABASE_URL" -X -q -At -v ON_ERROR_STOP=1 \
  -c "begin transaction read only" \
  -c "select case when to_regclass('env_identity.marker') is null then 'missing' else 'present' end" \
  -c "rollback" 2>"$errf")" || fail "Could not read the database to check its identity (cause: $(pg_error_category <"$errf"))."
[ "$out" = present ] || fail "This database has no identity marker (env_identity.marker), so it is not the member Production project."

rows="$(PGOPTIONS='-c default_transaction_read_only=on' psql "$MEMBERS_PRODUCTION_DATABASE_URL" -X -q -At -F '|' -v ON_ERROR_STOP=1 \
  -c "begin transaction read only" \
  -c "select label, marker_sha256 from env_identity.marker" \
  -c "rollback" 2>"$errf")" || fail "Could not read the identity marker (cause: $(pg_error_category <"$errf"))."
n="$(grep -c . <<<"$rows" || true)"
[ "$n" = 1 ] || fail "The identity marker table holds $n rows; exactly one is required."
label="${rows%%|*}"; got="${rows#*|}"
[ "$label" = "$LABEL" ] || fail "The identity marker has the wrong label, so this is not the member Production project."
[ "$got" = "$want" ] || fail "The identity marker does not match MEMBERS_DB_IDENTITY_MARKER, so this is not the member Production project (or the secret is wrong)."
echo "Database identity verified: the identity marker matches (splitpost-members-production)."
