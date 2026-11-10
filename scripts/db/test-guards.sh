#!/usr/bin/env bash
# Tests for the staging deployment guards. No network access or real
# credentials: every connection string here is fake.
set -uo pipefail
cd "$(dirname "$0")/../.."
REF=kpudeppgokpjhvaqrprn
PW='Sup3rSecretPw'
pass=0; failed=0

expect() { # expect <ok|fail> <description> <url> [project_ref] [confirm]
  local want=$1 desc=$2 url=$3 pref=${4-$REF} conf=${5-$REF} out visible code
  # Run as GitHub Actions does, so masking is exercised the same way locally and in CI.
  out=$(GITHUB_ACTIONS=true EXPECTED_PROJECT_REF=$REF SUPABASE_PROJECT_REF=$pref CONFIRM_PROJECT_REF=$conf \
        STAGING_DATABASE_URL=$url scripts/db/verify-staging-target.sh 2>&1); code=$?
  # "::add-mask::" lines are consumed by the runner and never shown in logs.
  # The password must not appear anywhere else.
  visible=$(grep -v '^::add-mask::' <<<"$out" || true)
  if [[ "$visible" == *"$PW"* ]]; then echo "FAIL  $desc (password appeared in output)"; failed=$((failed+1)); return; fi
  if [ "$want" = ok ] && ! grep -q "^::add-mask::.*$PW" <<<"$out"; then
    echo "FAIL  $desc (password was not masked)"; failed=$((failed+1)); return
  fi
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

# The waitlist admin workflow requires the restricted waitlist_admin login.
expect_admin() { EXPECTED_DB_USER=waitlist_admin expect "$@"; }
expect_admin ok   "admin workflow: waitlist_admin via the session pooler"  "postgresql://waitlist_admin.$REF:$PW@$POOL:5432/postgres"
expect_admin ok   "admin workflow: waitlist_admin via a direct connection" "postgresql://waitlist_admin:$PW@db.$REF.supabase.co:5432/postgres"
expect_admin fail "admin workflow: the broad postgres login (pooler)"      "postgresql://postgres.$REF:$PW@$POOL:5432/postgres"
expect_admin fail "admin workflow: the broad postgres login (direct)"      "postgresql://postgres:$PW@db.$REF.supabase.co:5432/postgres"
expect_admin fail "admin workflow: the waitlist_writer login"              "postgresql://waitlist_writer.$REF:$PW@$POOL:5432/postgres"
expect_admin fail "admin workflow: waitlist_admin on another project"      "postgresql://waitlist_admin.abcdefghijabcdefghij:$PW@$POOL:5432/postgres"
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

# The staging workflow: the only step that can install migrations runs in
# "apply" mode only, so "plan" and "check" can never change the database.
wf=.github/workflows/deploy-db-staging.yml
installs=$(grep -c 'supabase db push' "$wf" || true)
writes=$(grep 'supabase db push' "$wf" | grep -vc -- '--dry-run' || true)
guard=$(grep -B4 -- 'db push --db-url "$STAGING_DATABASE_URL" --yes' "$wf" | grep -c "if: inputs.mode == 'apply'$" || true)
if [ "$installs" = 2 ] && [ "$writes" = 1 ] && [ "$guard" = 1 ]; then
  echo "PASS  staging workflow installs migrations in apply mode only"; pass=$((pass+1))
else
  echo "FAIL  staging workflow: db push steps=$installs, non-dry-run=$writes, apply-only guard=$guard"; failed=$((failed+1))
fi

# CI start-up of local Supabase: both jobs go through the shared script, which
# reserves every configured port before images are pulled and never retries
# the tests themselves.
ci=.github/workflows/ci.yml
raw_starts=$(grep -c 'supabase start' "$ci" || true)
script_starts=$(grep -c 'run: scripts/ci/start-local-supabase.sh$' "$ci" || true)
if [ "$raw_starts" = 0 ] && [ "$script_starts" = 2 ]; then
  echo "PASS  CI starts local Supabase only through the port-reserving script"; pass=$((pass+1))
else
  echo "FAIL  CI start-up: raw supabase start=$raw_starts, script uses=$script_starts (expected 0 and 2)"; failed=$((failed+1))
fi
config_ports=$(grep -E '^[[:space:]]*(port|shadow_port)[[:space:]]*=' supabase/config.toml | grep -oE '[0-9]+$' | sort -un | paste -sd, -)
script_ports=$(scripts/ci/start-local-supabase.sh --ports)
if [ -n "$config_ports" ] && [ "$script_ports" = "$config_ports" ] && [[ ",$script_ports," == *",54321,"* ]] && [[ ",$script_ports," == *",54322,"* ]]; then
  echo "PASS  start-up script protects every configured Supabase port ($script_ports)"; pass=$((pass+1))
else
  echo "FAIL  start-up script ports '$script_ports' differ from config '$config_ports'"; failed=$((failed+1))
fi
if grep -q 'net.ipv4.ip_local_reserved_ports' scripts/ci/start-local-supabase.sh && [ "$(grep -c 'supabase start -x' scripts/ci/start-local-supabase.sh)" = 1 ]; then
  echo "PASS  start-up script reserves ports and starts Supabase from one place"; pass=$((pass+1))
else
  echo "FAIL  start-up script no longer reserves ports or starts Supabase in more than one place"; failed=$((failed+1))
fi

# Staging test-account workflow: main only, staging environment with approval,
# the one approved project, only the expected secrets, and never a local or
# other target.
ta=.github/workflows/staging-test-accounts.yml
ta_ok=1; ta_why=""
grep -qx "on:" "$ta" && grep -q "^  workflow_dispatch:" "$ta" && [ "$(grep -cE '^  (push|pull_request|schedule|workflow_run|repository_dispatch):' "$ta")" = 0 ] || { ta_ok=0; ta_why="$ta_why manual-trigger-only"; }
grep -q "if: github.ref == 'refs/heads/main'$" "$ta" || { ta_ok=0; ta_why="$ta_why main-only"; }
grep -q "^    environment: staging$" "$ta" || { ta_ok=0; ta_why="$ta_why staging-environment"; }
grep -q "^  EXPECTED_PROJECT_REF: kpudeppgokpjhvaqrprn$" "$ta" || { ta_ok=0; ta_why="$ta_why hard-coded-project"; }
grep -q "TEST_ACCOUNTS_LOCAL_API_URL" "$ta" && { ta_ok=0; ta_why="$ta_why no-local-target"; }
[ "$(grep -oE 'secrets\.[A-Z_]+' "$ta" | sort -u | paste -sd, -)" = "secrets.STAGING_SERVICE_ROLE_KEY,secrets.STAGING_TEST_ACCOUNT_EMAILS,secrets.STAGING_TEST_ACCOUNT_PASSWORD" ] || { ta_ok=0; ta_why="$ta_why expected-secrets-only"; }
grep -nE 'secrets\.' "$ta" | grep -vE '^[0-9]+:          STAGING_[A-Z_]+: \$\{\{ secrets\.STAGING_[A-Z_]+ \}\}$' | grep -q . && { ta_ok=0; ta_why="$ta_why secrets-only-as-step-env"; }
grep -qE '^        default: plan$' "$ta" && [ "$(grep -cE '^          - (plan|create|delete)$' "$ta")" = 3 ] || { ta_ok=0; ta_why="$ta_why modes"; }
grep -lE 'STAGING_SERVICE_ROLE_KEY|STAGING_TEST_ACCOUNT' .github/workflows/*.yml | grep -vq "staging-test-accounts.yml" && { ta_ok=0; ta_why="$ta_why key-used-elsewhere"; }
if [ $ta_ok = 1 ]; then
  echo "PASS  staging test-account workflow: manual, main only, approval-gated, one project, expected secrets only"; pass=$((pass+1))
else
  echo "FAIL  staging test-account workflow guard:$ta_why"; failed=$((failed+1))
fi
if grep -q "MODE: \${{ inputs.mode }}" "$ta" && grep -q "if (env.GITHUB_ACTIONS === 'true' && env.SUPABASE_PROJECT_REF) refuse" scripts/staging-test-accounts.mjs \
   && grep -q "if (!(await api.signupDisabled())) refuse('Public sign-up is enabled on this project" scripts/staging-test-accounts.mjs; then
  echo "PASS  test-account script refuses local targets in staging runs and refuses while sign-up is enabled"; pass=$((pass+1))
else
  echo "FAIL  test-account script lost a refusal (local target in staging, or sign-up enabled)"; failed=$((failed+1))
fi
# Deletion always needs both the server-only tag and an approved address:
# there is no option to widen it.
if ! grep -qiE 'include_unlisted|INCLUDE_UNLISTED' "$ta" scripts/staging-test-accounts.mjs \
   && grep -q "const targets = listed.filter((a) => a.user && isTagged(a.user))" scripts/staging-test-accounts.mjs \
   && grep -q "if (!isTagged(t.user) || !emails.includes(String(t.user.email || '').toLowerCase())) refuse(" scripts/staging-test-accounts.mjs; then
  echo "PASS  test-account deletion always requires the tag and an approved address"; pass=$((pass+1))
else
  echo "FAIL  test-account deletion can be widened beyond tagged accounts on the approved list"; failed=$((failed+1))
fi

echo "Guard tests: $pass passed, $failed failed"
[ $failed -eq 0 ]
