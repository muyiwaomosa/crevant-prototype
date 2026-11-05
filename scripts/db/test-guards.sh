#!/usr/bin/env bash
# Tests for the staging deployment guards. No network access or real
# credentials: every connection string here is fake.
set -uo pipefail
cd "$(dirname "$0")/../.."
REF=kpudeppgokpjhvaqrprn
PW='Sup3rSecretPw'
pass=0; failed=0

expect() { # expect <ok|fail> <description> <url> [project_ref] [confirm]
  local want=$1 desc=$2 url=$3 pref=${4-$REF} conf=${5-$REF} out code
  out=$(EXPECTED_PROJECT_REF=$REF SUPABASE_PROJECT_REF=$pref CONFIRM_PROJECT_REF=$conf \
        STAGING_DATABASE_URL=$url scripts/db/verify-staging-target.sh 2>&1); code=$?
  if [[ "$out" == *"$PW"* ]]; then echo "FAIL  $desc (password appeared in output)"; failed=$((failed+1)); return; fi
  if { [ "$want" = ok ] && [ $code -eq 0 ]; } || { [ "$want" = fail ] && [ $code -ne 0 ]; }; then
    echo "PASS  $desc"; pass=$((pass+1))
  else
    echo "FAIL  $desc (exit $code): $out"; failed=$((failed+1))
  fi
}

POOL="aws-0-us-west-2.pooler.supabase.com"
expect ok   "session pooler URL for the staging project"     "postgresql://postgres.$REF:$PW@$POOL:5432/postgres"
expect ok   "direct URL for the staging project"              "postgresql://postgres:$PW@db.$REF.supabase.co:5432/postgres"
expect ok   "URL-encoded special characters in password"      "postgresql://postgres.$REF:a%40b%3Ac$PW@$POOL:5432/postgres"
expect ok   "sslmode=require is allowed"                      "postgresql://postgres.$REF:$PW@$POOL:5432/postgres?sslmode=require"
expect fail "a different Supabase project (pooler)"           "postgresql://postgres.abcdefghijabcdefghij:$PW@$POOL:5432/postgres"
expect fail "a different Supabase project (direct)"           "postgresql://postgres:$PW@db.abcdefghijabcdefghij.supabase.co:5432/postgres"
expect fail "transaction pooler port 6543"                    "postgresql://postgres.$REF:$PW@$POOL:6543/postgres"
expect fail "TLS disabled"                                    "postgresql://postgres.$REF:$PW@$POOL:5432/postgres?sslmode=disable"
expect fail "TLS weakened to prefer"                          "postgresql://postgres.$REF:$PW@$POOL:5432/postgres?sslmode=prefer"
expect fail "non-Supabase host"                               "postgresql://postgres.$REF:$PW@db.example.com:5432/postgres"
expect fail "lookalike host"                                  "postgresql://postgres.$REF:$PW@evil-supabase.com.example.net:5432/postgres"
expect fail "missing password"                                "postgresql://postgres.$REF@$POOL:5432/postgres"
expect fail "wrong scheme"                                    "mysql://postgres.$REF:$PW@$POOL:5432/postgres"
expect fail "empty connection string"                         ""
expect fail "malformed URL"                                   "postgresql://postgres.$REF:$PW@$POOL:notaport/postgres"
expect fail "environment variable names another project"      "postgresql://postgres.$REF:$PW@$POOL:5432/postgres" "abcdefghijabcdefghij"
expect fail "typed confirmation does not match"               "postgresql://postgres.$REF:$PW@$POOL:5432/postgres" "$REF" "kpudeppgokpjhvaqrprm"
expect fail "typed confirmation empty"                        "postgresql://postgres.$REF:$PW@$POOL:5432/postgres" "$REF" ""

# Approved migrations check, run on a scratch copy of the repository files.
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
check_copy() { # check_copy <ok|fail> <description> <setup command>
  local want=$1 desc=$2 setup=$3 code
  rm -rf "$tmp/r"; mkdir -p "$tmp/r/scripts/db"
  cp -r supabase "$tmp/r/"; cp scripts/db/check-approved-migrations.sh "$tmp/r/scripts/db/"
  (cd "$tmp/r" && eval "$setup")
  "$tmp/r/scripts/db/check-approved-migrations.sh" >/dev/null 2>&1; code=$?
  if { [ "$want" = ok ] && [ $code -eq 0 ]; } || { [ "$want" = fail ] && [ $code -ne 0 ]; }; then
    echo "PASS  $desc"; pass=$((pass+1))
  else
    echo "FAIL  $desc (exit $code)"; failed=$((failed+1))
  fi
}
check_copy ok   "approved migrations unchanged"          "true"
check_copy fail "an unapproved migration file is added"  "echo 'select 1;' > supabase/migrations/20990101000000_unapproved.sql"
check_copy fail "an approved migration is edited"        "echo '-- edit' >> supabase/migrations/20261106000000_foundations.sql"
check_copy fail "an approved migration is deleted"       "rm supabase/migrations/20261106000000_foundations.sql"
check_copy fail "the approved list is missing"           "rm supabase/approved-migrations.sha256"

echo "Guard tests: $pass passed, $failed failed"
[ $failed -eq 0 ]
