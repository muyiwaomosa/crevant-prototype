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

# The rollback workflow requires full TLS verification in the connection string.
expect_vf() { REQUIRE_VERIFY_FULL=1 expect "$@"; }
expect_vf ok   "rollback: a plain session pooler URL (verify-full comes from the workflow)" "postgresql://postgres.$REF:$PW@$POOL:5432/postgres"
expect_vf ok   "rollback: sslmode=verify-full in the URL"                 "postgresql://postgres.$REF:$PW@$POOL:5432/postgres?sslmode=verify-full"
expect_vf fail "rollback: sslmode=require (no verification) is refused"   "postgresql://postgres.$REF:$PW@$POOL:5432/postgres?sslmode=require"
expect_vf fail "rollback: sslmode=verify-ca (no hostname check) is refused" "postgresql://postgres.$REF:$PW@$POOL:5432/postgres?sslmode=verify-ca"
expect_vf fail "rollback: another root certificate in the URL is refused" "postgresql://postgres.$REF:$PW@$POOL:5432/postgres?sslmode=verify-full&sslrootcert=/tmp/x"
expect_vf fail "rollback: other connection options are refused"           "postgresql://postgres.$REF:$PW@$POOL:5432/postgres?options=-c%20role%3Dx"
expect_vf fail "rollback: the restricted admin login is not the rollback login" "postgresql://waitlist_admin.$REF:$PW@$POOL:5432/postgres"

# The staging rollback workflow and its SQL.
rb=.github/workflows/waitlist-rollback-staging.yml
rbsql=scripts/db/staging-rollback-waitlist.sql
guard() { # guard <description> <test command>
  if eval "$2"; then echo "PASS  $1"; pass=$((pass+1)); else echo "FAIL  $1"; failed=$((failed+1)); fi
}
guard "rollback workflow: started by hand only (workflow_dispatch, no other trigger)" \
  "grep -A1 '^on:' $rb | grep -q '^  workflow_dispatch:' && ! grep -qE '^  (push|pull_request|pull_request_target|schedule|workflow_run|repository_dispatch|workflow_call):' $rb"
guard "rollback workflow: main only, started and re-run by the repository owner only (both jobs), staging environment" \
  "[ \"\$(grep -c \"^    if: github.ref == 'refs/heads/main' && github.actor == github.repository_owner && github.triggering_actor == github.repository_owner\$\" $rb)\" = 2 ] && [ \"\$(grep -c '^    if:' $rb)\" = 2 ] && grep -q '^    environment: staging$' $rb"
guard "rollback workflow: the switch is refused at repository level by a job with no environment, before the rollback job" \
  "[ \"\$(grep -c '^    environment:' $rb)\" = 1 ] && grep -q '^    needs: switch-scope$' $rb && grep -q 'OUTSIDE_ENVIRONMENT: \${{ vars.WAITLIST_ROLLBACK_ENABLED }}' $rb && grep -q '\[ -n \"\$OUTSIDE_ENVIRONMENT\" \]' $rb"
guard "rollback workflow: defaults to the dry run" \
  "grep -A6 '      mode:' $rb | grep -q 'default: check'"
guard "rollback workflow: off unless WAITLIST_ROLLBACK_ENABLED is exactly true, checked first in the rollback job" \
  "awk '/^  rollback:\$/{r=1} r && /- name:/{n++} r && /ENABLED: \\\$\{\{ vars.WAITLIST_ROLLBACK_ENABLED/ && !f{f=n} END{exit !(f==1)}' $rb && grep -q '\"\$ENABLED\" != \"true\"' $rb"
guard "rollback workflow: verifies the staging target, with verify-full, before connecting" \
  "awk '/^        run: scripts\/db\/verify-staging-target.sh$/{v=NR} /psql \"\\\$STAGING_DATABASE_URL\"/{p=NR} END{exit !(v && p && v<p)}' $rb && grep -q \"REQUIRE_VERIFY_FULL: '1'\" $rb && grep -q 'PGSSLMODE: verify-full' $rb"
guard "rollback workflow: uses only the STAGING_DATABASE_URL secret" \
  "[ \"\$(grep -oE 'secrets\.[A-Z_]+' $rb | sort -u)\" = 'secrets.STAGING_DATABASE_URL' ]"
guard "rollback workflow: inputs and secrets reach commands only through env (no injection)" \
  "! grep -E '\\\$\{\{ *(inputs|secrets|vars)\.' $rb | grep -vqE '^ +([A-Z_]+|name): '"
guard "rollback workflow: shares the database deploy queue" \
  "grep -A1 '^concurrency:' $rb | grep -q 'group: deploy-database-staging'"
guard "rollback SQL: never cascades, never drops owned objects in bulk" \
  "! grep -viE '^ *--' $rbsql | grep -qiE 'cascade|drop owned|reassign owned'"
guard "rollback SQL: refuses without the confirmation phrase for apply, and rolls back in check mode" \
  "grep -q \"'DELETE THE STAGING WAITLIST'\" $rbsql && grep -qE '^  rollback;' $rbsql"

# No other workflow or script may run the rollback SQL.
guard "only the rollback workflow and its local test run the rollback SQL" \
  "[ \"\$(grep -rlF 'staging-rollback-waitlist.sql' .github scripts | grep -v -e '^scripts/db/staging-rollback-waitlist.sql$' | sort | paste -sd,)\" = '.github/workflows/waitlist-rollback-staging.yml,scripts/db/rollback-test.sh,scripts/db/test-guards.sh,scripts/waitlist-isolation.test.mjs' ]"

echo "Guard tests: $pass passed, $failed failed"
[ $failed -eq 0 ]
