#!/usr/bin/env bash
# Apply all migrations to an EMPTY PostgreSQL database and run the database tests.
# Usage: DATABASE_URL=postgres://user:pass@host:5432/db scripts/db/test.sh
#
# Order:
#   1. Test-only bootstrap: Supabase roles, a minimal auth schema, and
#      Supabase's default grants (scripts/db/bootstrap-*.sql).
#   2. supabase/tests-local/before-migrations.sql, if present: test identities
#      that exist before the migrations run (for example, to test backfills).
#   3. Every migration in supabase/migrations, in order. Just before each one,
#      supabase/tests-local/before/<version>.sql if present: test data that
#      must exist before that migration, to prove it is preserved.
#   4. supabase/tests/*.sql: staging-safe, read-only checks. These are also
#      the checks the staging deploy workflow runs against staging.
#   5. supabase/tests-local/[0-9]*.sql: tests that create fake identities.
#      Throwaway databases only; never run against staging.
set -euo pipefail
cd "$(dirname "$0")/../.."
: "${DATABASE_URL:?Set DATABASE_URL to an empty test database}"

# Never run against a hosted Supabase project.
case "$DATABASE_URL" in
  *supabase.co*|*supabase.com*)
    echo "Refusing to run: this script is for empty throwaway databases, not Supabase projects." >&2
    exit 1 ;;
esac

PSQL=(psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -q -X)

# Refuse to run against a database that already has an auth schema, which
# would mean it is a real (or already used) Supabase database.
if [ "$("${PSQL[@]}" -At -c "select count(*) from pg_namespace where nspname = 'auth'")" != "0" ]; then
  echo "Refusing to run: the database already has an auth schema. Use an empty throwaway database." >&2
  exit 1
fi

echo "Bootstrapping Supabase roles and auth stub (test only)"
"${PSQL[@]}" -f scripts/db/bootstrap-roles.sql
"${PSQL[@]}" -f scripts/db/bootstrap-supabase-stub.sql

if [ -f supabase/tests-local/before-migrations.sql ]; then
  echo "Creating identities that exist before the migrations (test only)"
  "${PSQL[@]}" -f supabase/tests-local/before-migrations.sql
fi

for f in supabase/migrations/*.sql; do
  # Test-only data that must exist just BEFORE a given migration, to prove the
  # migration preserves it (supabase/tests-local/before/<version>.sql).
  hook="supabase/tests-local/before/$(basename "$f" | cut -d_ -f1).sql"
  if [ -f "$hook" ]; then
    echo "Creating data that exists before $(basename "$f") (test only)"
    "${PSQL[@]}" -f "$hook"
  fi
  echo "Applying $f"
  "${PSQL[@]}" -f "$f"
done

for f in supabase/tests/*.sql; do
  echo "Running $f"
  "${PSQL[@]}" -f "$f"
done

for f in supabase/tests-local/[0-9]*.sql; do
  [ -e "$f" ] || continue
  echo "Running $f (local only)"
  "${PSQL[@]}" -f "$f"
done

# Two real sessions at once: a request id is stored once (issue #48).
scripts/db/request-ids-concurrency-test.sh

# Two real sessions at once: Inner Clique changes stay within 25, never duplicated.
scripts/db/inner-clique-concurrency-test.sh

# Two real sessions at once: each viewed post is recorded once, and the hourly cap holds.
scripts/db/viewed-state-concurrency-test.sh

# Real query plans and timings for viewed state at pilot scale (no sequential scans).
scripts/db/viewed-state-plan-test.sh

# Negative checks: each file applies one deliberate violation inside a
# transaction that is always rolled back. The profile, ops and waitlist checks
# must then fail with a "FAIL:" message, proving they would catch it. (Only
# those checks files are replayed here: the Phase 0 file manages its own
# transactions, which would end the wrapper's transaction early.)
CHECKS=(supabase/tests/002_profiles_and_ops.sql supabase/tests/003_waitlist.sql supabase/tests/004_acquisition.sql supabase/tests/005_social_core.sql supabase/tests/006_platform_functions.sql supabase/tests/007_member_access.sql)
for v in supabase/tests-local/violations/*.sql; do
  [ -e "$v" ] || continue
  wrapper="$(mktemp)"
  {
    echo "begin;"
    echo "\\i $v"
    for c in "${CHECKS[@]}"; do echo "\\i $c"; done
    echo "rollback;"
  } > "$wrapper"
  if out="$(psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -q -X -f "$wrapper" 2>&1)"; then
    rm -f "$wrapper"
    echo "FAIL: the checks did not catch the deliberate violation in $v" >&2
    exit 1
  fi
  rm -f "$wrapper"
  if ! grep -q "FAIL:" <<<"$out"; then
    echo "FAIL: $v errored without a check catching it:" >&2
    echo "$out" >&2
    exit 1
  fi
  echo "PASS: checks caught $(basename "$v" .sql) ($(grep -o 'FAIL: [^"]*' <<<"$out" | head -1 | cut -c1-90))"
done
# The member authorization surface audit (pilot milestone M1): read only,
# against the database the migrations built. Then each deliberate violation in
# scripts/db/audit/violations/ is applied inside a rolled-back transaction and
# the audit must catch it with a "FAIL:" message.
echo "Running the member authorization surface audit"
"${PSQL[@]}" -f scripts/db/audit/member-surface.sql
for v in scripts/db/audit/violations/*.sql; do
  [ -e "$v" ] || continue
  wrapper="$(mktemp)"
  {
    echo "begin;"
    echo "\\i $v"
    echo "\\i scripts/db/audit/member-surface-checks.sql"
    echo "rollback;"
  } > "$wrapper"
  if out="$(psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -q -X -f "$wrapper" 2>&1)"; then
    rm -f "$wrapper"
    echo "FAIL: the member surface audit did not catch the deliberate violation in $v" >&2
    exit 1
  fi
  rm -f "$wrapper"
  if ! grep -q "FAIL:" <<<"$out"; then
    echo "FAIL: $v errored without the member surface audit catching it:" >&2
    echo "$out" >&2
    exit 1
  fi
  echo "PASS: member surface audit caught $(basename "$v" .sql) ($(grep -o 'FAIL: [^"]*' <<<"$out" | head -1 | cut -c1-90))"
done
echo "Database checks passed"
