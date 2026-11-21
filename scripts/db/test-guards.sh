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

# The creator acquisition rollback (removed before the waitlist rollback).
acqsql=scripts/db/staging-rollback-acquisition.sql
guard "acquisition rollback SQL: never cascades, never drops owned objects in bulk" \
  "! grep -viE '^ *--' $acqsql | grep -qiE 'cascade|drop owned|reassign owned'"
guard "acquisition rollback SQL: its own confirmation phrase for apply, and rolls back in check mode" \
  "grep -q \"'DELETE THE STAGING CREATOR ACQUISITION'\" $acqsql && grep -qE '^  rollback;' $acqsql"
# Run on staging only through the same rollback workflow (target
# creator_acquisition), and locally by its tests.
guard "only the rollback workflow and the local tests run the acquisition rollback SQL" \
  "[ \"\$(grep -rlF 'staging-rollback-acquisition.sql' .github scripts | grep -v -e '^scripts/db/staging-rollback-acquisition.sql$' | sort | paste -sd,)\" = '.github/workflows/waitlist-rollback-staging.yml,scripts/db/rollback-acquisition-test.sh,scripts/db/rollback-test.sh,scripts/db/test-guards.sh,scripts/waitlist-isolation.test.mjs' ]"
guard "rollback workflow: each target has its own phrase, checked before connecting, and picks its own SQL file" \
  "grep -q 'waitlist) expected=\"DELETE THE STAGING WAITLIST\" ;;' $rb && grep -q 'creator_acquisition) expected=\"DELETE THE STAGING CREATOR ACQUISITION\" ;;' $rb \
   && grep -q 'waitlist) sql=scripts/db/staging-rollback-waitlist.sql ;;' $rb && grep -q 'creator_acquisition) sql=scripts/db/staging-rollback-acquisition.sql ;;' $rb \
   && [ \"\$(grep -c 'Unknown target. Nothing was done.' $rb)\" = 2 ] && grep -A8 '      target:' $rb | grep -q 'default: waitlist'"

# ---------------------------------------------------------------------------
# Production: a separate target check, workflow, environment and secret.
PREF=hmrliwoychnqrbbydorg
expect_prod() { # expect_prod <ok|fail> <description> <url> [env_ref] [confirm] [expected]
  local want=$1 desc=$2 url=$3 pref=${4-$PREF} conf=${5-$PREF} exp=${6-$PREF} out visible code
  out=$(GITHUB_ACTIONS=true EXPECTED_PROJECT_REF=$exp SUPABASE_PROJECT_REF=$pref CONFIRM_PROJECT_REF=$conf \
        PRODUCTION_DATABASE_URL=$url scripts/db/verify-production-target.sh 2>&1); code=$?
  visible=$(grep -v '^::add-mask::' <<<"$out" || true)
  if [[ "$visible" == *"$PW"* ]]; then echo "FAIL  production: $desc (password appeared in output)"; failed=$((failed+1)); return; fi
  if { [ "$want" = ok ] && [ $code -eq 0 ]; } || { [ "$want" = fail ] && [ $code -ne 0 ]; }; then
    echo "PASS  production: $desc"; pass=$((pass+1))
  else
    echo "FAIL  production: $desc (exit $code): $out"; failed=$((failed+1))
  fi
}
expect_prod ok   "session pooler URL for the Production project"            "postgresql://postgres.$PREF:$PW@$POOL:5432/postgres"
expect_prod ok   "direct URL for the Production project"                    "postgresql://postgres:$PW@db.$PREF.supabase.co:5432/postgres"
expect_prod fail "a staging connection string is refused"                   "postgresql://postgres.$REF:$PW@$POOL:5432/postgres"
expect_prod fail "a staging direct connection is refused"                   "postgresql://postgres:$PW@db.$REF.supabase.co:5432/postgres"
expect_prod fail "the workflow pointed at staging is refused"               "postgresql://postgres.$REF:$PW@$POOL:5432/postgres" "$REF" "$REF" "$REF"
expect_prod fail "a reference that isn't the one in config is refused"      "postgresql://postgres.abcdefghijabcdefghij:$PW@$POOL:5432/postgres" "abcdefghijabcdefghij" "abcdefghijabcdefghij" "abcdefghijabcdefghij"
expect_prod fail "another Supabase project in the URL"                      "postgresql://postgres.abcdefghijabcdefghij:$PW@$POOL:5432/postgres"
expect_prod fail "the environment variable names another project"           "postgresql://postgres.$PREF:$PW@$POOL:5432/postgres" "$REF"
expect_prod fail "typed confirmation does not match"                        "postgresql://postgres.$PREF:$PW@$POOL:5432/postgres" "$PREF" "$REF"
expect_prod fail "typed confirmation empty"                                 "postgresql://postgres.$PREF:$PW@$POOL:5432/postgres" "$PREF" ""
expect_prod fail "transaction pooler port 6543"                             "postgresql://postgres.$PREF:$PW@$POOL:6543/postgres"
expect_prod fail "TLS disabled"                                             "postgresql://postgres.$PREF:$PW@$POOL:5432/postgres?sslmode=disable"
expect_prod fail "non-Supabase host"                                        "postgresql://postgres.$PREF:$PW@db.example.com:5432/postgres"
expect_prod fail "missing password"                                         "postgresql://postgres.$PREF@$POOL:5432/postgres"
expect_prod fail "empty connection string"                                  ""

pw=.github/workflows/deploy-db-production.yml
sw=.github/workflows/deploy-db-staging.yml
guard "production workflow: started by hand only (workflow_dispatch, no other trigger)" \
  "grep -A1 '^on:' $pw | grep -q '^  workflow_dispatch:' && ! grep -qE '^  (push|pull_request|pull_request_target|schedule|workflow_run|repository_dispatch|workflow_call):' $pw"
guard "production workflow: main only, started and re-run by the repository owner only (both jobs), production environment" \
  "[ \"\$(grep -c \"^    if: github.ref == 'refs/heads/main' && github.actor == github.repository_owner && github.triggering_actor == github.repository_owner\$\" $pw)\" = 2 ] && [ \"\$(grep -c '^    environment:' $pw)\" = 1 ] && grep -q '^    environment: production$' $pw"
guard "production workflow: uses only the PRODUCTION_DATABASE_URL secret, and the staging workflow never does" \
  "[ \"\$(grep -oE 'secrets\.[A-Z_]+' $pw | sort -u)\" = 'secrets.PRODUCTION_DATABASE_URL' ] && ! grep -q 'PRODUCTION_DATABASE_URL' $sw"
guard "production workflow: never names the staging project, and staging never names Production" \
  "! grep -q 'kpudeppgokpjhvaqrprn' $pw && ! grep -q 'hmrliwoychnqrbbydorg' $sw && grep -q '^  EXPECTED_PROJECT_REF: hmrliwoychnqrbbydorg$' $pw"
guard "production workflow: its own concurrency group, separate from staging" \
  "grep -A1 '^concurrency:' $pw | grep -q 'group: deploy-database-production$'"
guard "production workflow: verifies the Production target before anything connects" \
  "awk '/run: scripts\/db\/verify-production-target.sh\$/{v=NR} /--db-url \"\\\$PRODUCTION_DATABASE_URL\"|psql \"\\\$PRODUCTION_DATABASE_URL\"/{if(!c)c=NR} END{exit !(v && c && v<c)}' $pw && ! grep -q 'verify-staging-target' $pw"
pinstalls=$(grep -c 'db push --db-url' "$pw" || true)
pwrites=$(grep 'db push --db-url' "$pw" | grep -vc -- '--dry-run' || true)
pguard=$(grep -B4 -- 'db push --db-url "$PRODUCTION_DATABASE_URL" --yes' "$pw" | grep -c "if: inputs.mode == 'apply'$" || true)
guard "production workflow: installs migrations in apply mode only (plan and check never change it)" \
  "[ '$pinstalls' = 2 ] && [ '$pwrites' = 1 ] && [ '$pguard' = 1 ]"
guard "production workflow: apply needs the typed phrase and the backup confirmation, checked before any job connects" \
  "grep -q '\[ \"\$PHRASE\" = \"APPLY TO PRODUCTION\" \]' $pw && grep -q '\[ \"\$BACKUP\" = \"true\" \]' $pw && grep -A4 '      backup_confirmed:' $pw | grep -q 'default: false'"
guard "production workflow: inputs and secrets reach commands only through env (no injection)" \
  "! grep -E '\\\$\{\{ *(inputs|secrets|vars)\.' $pw | grep -vqE '^ +([A-Z_]+|name): '"
guard "production workflow: defaults to plan" \
  "grep -A9 '      mode:' $pw | grep -q 'default: plan'"
guard "production workflow: every push and migration list uses the prepared subset folder, never the full migrations folder" \
  "[ \"\$(grep -cE 'db push --db-url|migration list --db-url' $pw)\" = 3 ] && [ \"\$(grep -cE 'supabase --workdir \"\\\$RUNNER_TEMP/production\" (db push|migration list) --db-url' $pw)\" = 3 ] && awk '/production-subset.sh prepare/{p=NR} /--workdir .*db push/{if(!d)d=NR} END{exit !(p && d && p<d)}' $pw"
guard "production workflow: the subset is tested on its own, and Production checks come from production-checks.txt" \
  "grep -q 'run: |' $pw && grep -q 'scripts/db/production-subset.sh test' $pw && grep -q 'supabase/production-checks.txt' $pw && ! grep -q 'for f in supabase/tests/\*.sql' $pw"
guard "the Production subset verifies: approved, in order, and without the social core or its check" \
  "scripts/db/production-subset.sh verify >/dev/null 2>&1 && ! grep -qE '^20261117000000' supabase/production-migrations.txt && ! grep -qE '^005_' supabase/production-checks.txt"
guard "only the three Production workflows name Production; no staging, rollback or CI workflow does" \
  "[ \"\$(grep -lE '(^|[^A-Z_])PRODUCTION_DATABASE_URL|hmrliwoychnqrbbydorg' .github/workflows/*.yml | sort | paste -sd,)\" = '.github/workflows/deploy-db-production.yml,.github/workflows/waitlist-admin-production.yml,.github/workflows/waitlist-health-production.yml' ]"
guard "the Production admin and health workflows never name the staging project" \
  "! grep -q 'kpudeppgokpjhvaqrprn' .github/workflows/waitlist-admin-production.yml .github/workflows/waitlist-health-production.yml"

# Member authorization surface audit runner (pilot milestone M1): it refuses
# every wrong target before connecting (no network here), and the audit is
# never placed where the staging deploy workflow would run it automatically.
audit_refuses() { # audit_refuses <description> <env assignments...>
  local desc=$1; shift
  if env -u DATABASE_URL -u STAGING_DATABASE_URL "$@" scripts/db/audit-member-surface.sh >/dev/null 2>&1; then
    echo "FAIL  $desc (the audit runner did not refuse)"; failed=$((failed+1))
  else
    echo "PASS  $desc"; pass=$((pass+1))
  fi
}
PROD=hmrliwoychnqrbbydorg
audit_refuses "member surface audit: no target given"                  AUDIT_TARGET=
audit_refuses "member surface audit: there is no Production target"    AUDIT_TARGET=production DATABASE_URL="postgresql://postgres:$PW@db.$PROD.supabase.co:5432/postgres"
audit_refuses "member surface audit: a local run may not point at Supabase" AUDIT_TARGET=local DATABASE_URL="postgresql://postgres:$PW@db.$REF.supabase.co:5432/postgres"
audit_refuses "member surface audit: a staging run naming the Production project" AUDIT_TARGET=staging EXPECTED_PROJECT_REF=$REF SUPABASE_PROJECT_REF=$REF CONFIRM_PROJECT_REF=$REF STAGING_DATABASE_URL="postgresql://postgres.$PROD:$PW@$POOL:5432/postgres"
audit_refuses "member surface audit: a staging run without the typed confirmation" AUDIT_TARGET=staging EXPECTED_PROJECT_REF=$REF SUPABASE_PROJECT_REF=$REF CONFIRM_PROJECT_REF=wrong STAGING_DATABASE_URL="postgresql://postgres.$REF:$PW@$POOL:5432/postgres"
audit_refuses "member surface audit: a staging run expecting another project" AUDIT_TARGET=staging EXPECTED_PROJECT_REF=abcdefghijabcdefghij SUPABASE_PROJECT_REF=$REF CONFIRM_PROJECT_REF=$REF STAGING_DATABASE_URL="postgresql://postgres.$REF:$PW@$POOL:5432/postgres"
guard "member surface audit: not in supabase/tests (the staging deploy workflow runs every file there)" \
  "! grep -rlq 'member authorization surface' supabase/tests"
guard "member surface audit: runs in a read only transaction that is rolled back, in a read only session" \
  "grep -q '^begin transaction read only;' scripts/db/audit/member-surface.sql && grep -q '^rollback;' scripts/db/audit/member-surface.sql && grep -q 'default_transaction_read_only=on' scripts/db/audit-member-surface.sh"
guard "member surface audit: no workflow runs it against a hosted project yet" \
  "! grep -lq 'audit-member-surface' .github/workflows/*.yml"

# The staging activation workflow (pilot membership, 20261122000000) and its SQL.
aw=.github/workflows/staging-activate-member-access.yml
asql=scripts/db/staging-activate-member-access.sql
guard "activation workflow: started by hand only (workflow_dispatch, no other trigger)" \
  "grep -A1 '^on:' $aw | grep -q '^  workflow_dispatch:' && ! grep -qE '^  (push|pull_request|pull_request_target|schedule|workflow_run|repository_dispatch|workflow_call):' $aw"
guard "activation workflow: main only, started and re-run by the repository owner only (all three jobs), one job in the staging environment" \
  "[ \"\$(grep -c \"^    if: github.ref == 'refs/heads/main' && github.actor == github.repository_owner && github.triggering_actor == github.repository_owner\$\" $aw)\" = 3 ] && [ \"\$(grep -c '^    if:' $aw)\" = 3 ] && [ \"\$(grep -c '^    environment:' $aw)\" = 1 ] && grep -q '^    environment: staging$' $aw"
guard "activation workflow: a founder id stored outside the staging environment is refused by a job with no environment, first" \
  "grep -q '^    needs: secret-scope$' $aw && grep -q 'OUTSIDE_ENVIRONMENT: \${{ secrets.STAGING_FOUNDER_ACCOUNT_ID }}' $aw && grep -q '\[ -n \"\$OUTSIDE_ENVIRONMENT\" \]' $aw && awk '/^  secret-scope:\$/{s=1} /^  [a-z-]+:\$/ && !/secret-scope/{s=0} s && /environment:/{e=1} END{exit e}' $aw"
guard "activation workflow: defaults to the rehearsal, and activate needs the exact phrase" \
  "grep -A10 '      mode:' $aw | grep -m1 'default:' | grep -q 'default: rehearse' && grep -q '\[ \"\$PHRASE\" = \"ACTIVATE STAGING MEMBER ACCESS\" \]' $aw"
guard "activation workflow: verifies the staging target, with verify-full, before any database connection" \
  "awk '/^        run: scripts\/db\/verify-staging-target.sh\$/{v=NR} /psql \"\\\$STAGING_DATABASE_URL\"/ && !p{p=NR} END{exit !(v && p && v<p)}' $aw && grep -q \"REQUIRE_VERIFY_FULL: '1'\" $aw && grep -q 'PGSSLMODE: verify-full' $aw"
guard "activation workflow: uses only the STAGING_DATABASE_URL and STAGING_FOUNDER_ACCOUNT_ID secrets" \
  "[ \"\$(grep -oE 'secrets\.[A-Z_]+' $aw | sort -u | paste -sd,)\" = 'secrets.STAGING_DATABASE_URL,secrets.STAGING_FOUNDER_ACCOUNT_ID' ]"
guard "activation workflow: inputs and secrets reach commands only through env (no injection)" \
  "! grep -E '\\\$\{\{ *(inputs|secrets|vars)\.' $aw | grep -vqE '^ +([A-Z_]+|name): '"
guard "activation workflow: the founder id never reaches a command line (no psql -v founder, no echo of it)" \
  "! grep -qE -- '-v +founder|echo .*STAGING_FOUNDER_ACCOUNT_ID\"?\$|\\\$STAGING_FOUNDER_ACCOUNT_ID\"? *\$' $aw && ! grep -qE 'echo \"\\\$STAGING_FOUNDER' $aw"
guard "activation workflow: shares the database deploy queue, and never names Production" \
  "grep -A1 '^concurrency:' $aw | grep -q 'group: deploy-database-staging' && ! grep -qiE 'hmrliwoychnqrbbydorg|production_database|environment: production' $aw"
guard "activation workflow: checks only 20261122000000 is pending, and runs the activation tests on a throwaway database first" \
  "grep -q '\"\$pending\" != \"20261122000000\"' $aw && grep -q 'run: scripts/db/activation-test.sh' $aw"
guard "activation SQL: one transaction; rehearse rolls back; activate commits only with the phrase; no other transaction control" \
  "[ \"\$(grep -cE '^begin;\$' $asql)\" = 1 ] && [ \"\$(grep -cE '^  commit;\$' $asql)\" = 1 ] && [ \"\$(grep -cE '^  rollback;\$' $asql)\" = 1 ] && [ \"\$(grep -ciE '^ *(begin|commit|rollback|abort|savepoint|release|start transaction)( [a-z ]*)?;' $asql)\" = 3 ] && ! grep -qiE '^end *;' $asql && grep -q \"'ACTIVATE STAGING MEMBER ACCESS'\" $asql"
guard "activation SQL: reads the founder id only from the environment, never selects or prints it" \
  "grep -q '^\\\\getenv founder_raw STAGING_FOUNDER_ACCOUNT_ID\$' $asql && [ \"\$(grep -c \":'founder_raw'\" $asql)\" = 1 ] && grep -q \"lower(btrim(:'founder_raw')), true) <> '' as founder_given\" $asql && ! grep -qE 'raise (exception|notice).*activate_founder' $asql"
guard "activation SQL: applies exactly the approved migration file and records it" \
  "grep -q '^\\\\ir ../../supabase/migrations/20261122000000_member_access.sql\$' $asql && grep -q \"values ('20261122000000', 'member_access')\" $asql"
guard "activation SQL: never cascades, never drops anything" \
  "! grep -viE '^ *--' $asql | grep -qiE 'cascade|drop (table|function|owned|schema|view)|reassign owned|truncate'"
guard "only the activation workflow and its local tests run the activation SQL" \
  "[ \"\$(grep -rlF 'staging-activate-member-access.sql' .github scripts | grep -v -e '^scripts/db/staging-activate-member-access.sql\$' | sort | paste -sd,)\" = '.github/workflows/staging-activate-member-access.yml,scripts/db/activation-cli-compat-test.sh,scripts/db/activation-test.sh,scripts/db/test-guards.sh' ]"
guard "activation workflow: the schema separation checks (001) run before the activation transaction, and never after it" \
  "awk '/supabase\/tests\/001_schema_separation.sql/{c=NR} /-f scripts\/db\/staging-activate-member-access.sql/{a=NR} END{exit !(c && a && c<a)}' $aw && [ \"\$(grep -c '001_schema_separation.sql' $aw)\" = 1 ]"
guard "activation workflow: after COMMIT only read-only steps run (read-only session), verifying the committed state" \
  "awk '/-f scripts\/db\/staging-activate-member-access.sql/{a=1; next} a && /run: /{n++; if (\$0 !~ /staging-verify-activation.sql|^ *run: \\|\$/) bad=1} END{exit (bad || !n)}' $aw && [ \"\$(grep -c \"PGOPTIONS: '-c default_transaction_read_only=on'\" $aw)\" = 3 ] && grep -q -- '-v expect=activated -f scripts/db/staging-verify-activation.sql' $aw"
guard "activation verification SQL: read only, rolled back, never prints the founder id" \
  "grep -q '^begin transaction read only;\$' scripts/db/staging-verify-activation.sql && grep -q '^rollback;\$' scripts/db/staging-verify-activation.sql && ! grep -qiE '^ *(insert|update|delete|create|alter|drop|grant|revoke|truncate|commit)\\b' scripts/db/staging-verify-activation.sql && [ \"\$(grep -c \":'founder_raw'\" scripts/db/staging-verify-activation.sql)\" = 1 ] && ! grep -qE 'raise (exception|notice).*v_founder\\b' scripts/db/staging-verify-activation.sql"

# The ordinary staging deploy can't apply 20261122000000 on its own.
dw=.github/workflows/deploy-db-staging.yml
guard "staging deploy: the pilot membership protection runs unconditionally, after the target check and before any db push" \
  "awk '/^      - name: Pilot membership protection/{g=NR; inside=1; next} inside && /^      - /{inside=0} inside && /^        (if|continue-on-error):/{bad=1} /run: scripts\/db\/verify-staging-target.sh/{v=NR} /supabase db push/ && !p{p=NR} END{exit !(g && v && p && v<g && g<p && !bad)}' $dw && grep -q '^        id: gate\$' $dw && grep -q '^        run: scripts/db/staging-membership-gate.sh\$' $dw && grep -q 'MODE: \${{ inputs.mode }}' $dw"
guard "staging deploy: before activation, check mode skips only the post-gate checks (002, 005, 007), never more" \
  "grep -q 'GATE_PENDING: \${{ steps.gate.outputs.gate_pending }}' $dw && grep -q 'if \[ \"\$GATE_PENDING\" != \"false\" \]; then' $dw && grep -q '002_\*|005_\*|007_\*) echo' $dw"
guard "staging deploy protection: refuses apply while 20261122000000 is pending, and fails closed" \
  "grep -q '^GATE=20261122000000\$' scripts/db/staging-membership-gate.sh && grep -q 'if \[ \"\$MODE\" = apply \]; then' scripts/db/staging-membership-gate.sh && grep -q '^set -euo pipefail\$' scripts/db/staging-membership-gate.sh && grep -q 'Unknown or missing mode' scripts/db/staging-membership-gate.sh && grep -q 'default_transaction_read_only=on' scripts/db/staging-pending-migrations.sh"
guard "no other path pushes migrations: only the staging, waitlist Production and member Production deploy workflows run db push" \
  "[ \"\$(grep -lE 'supabase .*db push' .github/workflows/*.yml | sort | paste -sd,)\" = '.github/workflows/deploy-db-members-production.yml,.github/workflows/deploy-db-production.yml,.github/workflows/deploy-db-staging.yml' ]"
guard "Production never receives the pilot membership migration (not on the Production list)" \
  "! grep -q '^20261122000000' supabase/production-migrations.txt && grep -q 'production-migrations.txt' .github/workflows/deploy-db-production.yml"

# ---------------------------------------------------------------------------
# Member Production: its own target check (scripts/db/verify-members-target.sh).
# (MEMBERS_PRODUCTION_DATABASE_URL contains PRODUCTION_DATABASE_URL, so the
# guards match the waitlist secret as a whole name only.)
# The approved reference comes only from config/supabase-projects.json, which
# holds null today, so the real repository must fail closed; the other cases
# run on a scratch copy with a made-up reference.
MREF=membersprodfakerefab
out=$(GITHUB_ACTIONS=true MEMBERS_PROJECT_REF=$MREF CONFIRM_PROJECT_REF=$MREF \
      MEMBERS_PRODUCTION_DATABASE_URL="postgresql://postgres.$MREF:$PW@$POOL:5432/postgres" scripts/db/verify-members-target.sh 2>&1); code=$?
if [ $code -ne 0 ] && grep -q 'memberProduction.ref in config/supabase-projects.json is null' <<<"$out" && [[ "$out" != *"$PW"* ]]; then
  echo "PASS  members: with memberProduction.ref null (today), the target check fails closed"; pass=$((pass+1))
else echo "FAIL  members: null memberProduction.ref (exit $code): $out"; failed=$((failed+1)); fi
mdir=$(mktemp -d)
mkdir -p "$mdir/config" "$mdir/scripts/db"; cp scripts/db/verify-members-target.sh "$mdir/scripts/db/"
member_config() { # member_config <memberProduction ref>
  python3 -c "import json,sys;c=json.load(open('config/supabase-projects.json'));c['memberProduction']['ref']=sys.argv[1];json.dump(c,open(sys.argv[2],'w'))" "$1" "$mdir/config/supabase-projects.json"
}
expect_members() { # expect_members <ok|fail> <description> <url> [env_ref] [confirm] [message]
  local want=$1 desc=$2 url=$3 eref=${4-$MREF} conf=${5-$MREF} msg=${6-} out visible code
  out=$(cd "$mdir" && GITHUB_ACTIONS=true REQUIRE_VERIFY_FULL=${RVF:-} MEMBERS_PROJECT_REF=$eref CONFIRM_PROJECT_REF=$conf \
        MEMBERS_PRODUCTION_DATABASE_URL=$url scripts/db/verify-members-target.sh 2>&1); code=$?
  visible=$(grep -v '^::add-mask::' <<<"$out" || true)
  if [[ "$visible" == *"$PW"* ]]; then echo "FAIL  members: $desc (password appeared in output)"; failed=$((failed+1)); return; fi
  if [ "$want" = ok ] && ! grep -q "^::add-mask::.*$PW" <<<"$out"; then echo "FAIL  members: $desc (password was not masked)"; failed=$((failed+1)); return; fi
  if { [ "$want" = ok ] && [ $code -eq 0 ]; } || { [ "$want" = fail ] && [ $code -ne 0 ] && { [ -z "$msg" ] || grep -qi -- "$msg" <<<"$out"; }; }; then
    echo "PASS  members: $desc"; pass=$((pass+1))
  else
    echo "FAIL  members: $desc (exit $code): $out"; failed=$((failed+1))
  fi
}
member_config "$MREF"
expect_members ok   "session pooler URL for the member Production project"          "postgresql://postgres.$MREF:$PW@$POOL:5432/postgres"
expect_members ok   "direct URL for the member Production project"                  "postgresql://postgres:$PW@db.$MREF.supabase.co:5432/postgres"
RVF=1 expect_members ok "verify-full is allowed when required"                     "postgresql://postgres.$MREF:$PW@$POOL:5432/postgres?sslmode=verify-full"
expect_members fail "the staging project's URL is refused"                          "postgresql://postgres.$REF:$PW@$POOL:5432/postgres" "$MREF" "$MREF" "points at the staging project"
expect_members fail "the staging project's direct URL is refused"                   "postgresql://postgres:$PW@db.$REF.supabase.co:5432/postgres" "$MREF" "$MREF" "points at the staging project"
expect_members fail "the waitlist project's URL is refused"                         "postgresql://postgres.$PREF:$PW@$POOL:5432/postgres" "$MREF" "$MREF" "points at the waitlist project"
expect_members fail "the waitlist project's direct URL is refused"                  "postgresql://postgres:$PW@db.$PREF.supabase.co:5432/postgres" "$MREF" "$MREF" "points at the waitlist project"
expect_members fail "another Supabase project in the URL"                           "postgresql://postgres.abcdefghijabcdefghij:$PW@$POOL:5432/postgres" "$MREF" "$MREF" "different Supabase project"
expect_members fail "the environment variable names staging"                        "postgresql://postgres.$MREF:$PW@$POOL:5432/postgres" "$REF" "$MREF" "MEMBERS_PROJECT_REF does not match"
expect_members fail "the typed confirmation names the waitlist project"            "postgresql://postgres.$MREF:$PW@$POOL:5432/postgres" "$MREF" "$PREF" "typed confirmation"
expect_members fail "typed confirmation empty"                                      "postgresql://postgres.$MREF:$PW@$POOL:5432/postgres" "$MREF" "" "No project reference was typed"
expect_members fail "environment variable empty"                                    "postgresql://postgres.$MREF:$PW@$POOL:5432/postgres" "" "$MREF" "MEMBERS_PROJECT_REF is not set"
expect_members fail "a waitlist login, not postgres"                                "postgresql://waitlist_admin.$MREF:$PW@$POOL:5432/postgres" "$MREF" "$MREF" "must log in as postgres"
expect_members fail "transaction pooler port 6543"                                  "postgresql://postgres.$MREF:$PW@$POOL:6543/postgres" "$MREF" "$MREF" "port 5432"
expect_members fail "TLS disabled"                                                  "postgresql://postgres.$MREF:$PW@$POOL:5432/postgres?sslmode=disable" "$MREF" "$MREF" "weaken TLS"
RVF=1 expect_members fail "an extra connection setting when verify-full is required" "postgresql://postgres.$MREF:$PW@$POOL:5432/postgres?sslrootcert=x" "$MREF" "$MREF" "must not carry connection settings"
expect_members fail "non-Supabase host"                                             "postgresql://postgres.$MREF:$PW@db.example.com:5432/postgres" "$MREF" "$MREF" "Supabase host"
expect_members fail "missing password"                                              "postgresql://postgres.$MREF@$POOL:5432/postgres" "$MREF" "$MREF" "no password"
expect_members fail "empty connection string"                                       "" "$MREF" "$MREF" "is not set"
member_config "$REF"
expect_members fail "config naming staging as member Production is refused"         "postgresql://postgres.$REF:$PW@$POOL:5432/postgres" "$REF" "$REF" "is the staging project"
member_config "$PREF"
expect_members fail "config naming the waitlist project as member Production is refused" "postgresql://postgres.$PREF:$PW@$POOL:5432/postgres" "$PREF" "$PREF" "is the waitlist project"
member_config "NotARef"
expect_members fail "a malformed reference in config is refused"                    "postgresql://postgres.$MREF:$PW@$POOL:5432/postgres" "NotARef" "NotARef" "malformed"
rm -rf "$mdir"

# The member Production workflows push migrations only as the member sets allow.
mw=.github/workflows/deploy-db-members-production.yml
guard "member deploy: apply-foundation pushes only the foundation set, apply refuses until 20261122000000 is recorded" \
  "grep -q 'members-subset.sh prepare \"\$RUNNER_TEMP/members\" foundation' $mw && grep -q 'apply needs pilot membership (20261122000000) to be activated first' $mw && grep -q 'apply-foundation is only for the new, empty project' $mw"
guard "member activation: only the activation workflow runs the member activation SQL" \
  "[ \"\$(grep -l 'members-activate-member-access.sql' .github/workflows/*.yml | paste -sd,)\" = '.github/workflows/members-activate-member-access.yml' ]"
guard "member workflows: never name the staging or waitlist secrets, environments or target checks" \
  "! grep -qE 'STAGING_DATABASE_URL|(^|[^A-Z_])PRODUCTION_DATABASE_URL|WAITLIST_ADMIN_DATABASE_URL|environment: (staging|production)\$|verify-(staging|production)-target' $mw .github/workflows/members-activate-member-access.yml"
guard "staging and waitlist workflows: never name a member Production secret, environment or script" \
  "! grep -lE 'MEMBERS_|members-production|verify-members-|members-subset|members-lock' \$(ls .github/workflows/*.yml | grep -v -e deploy-db-members-production.yml -e members-activate-member-access.yml)"

echo "Guard tests: $pass passed, $failed failed"
[ $failed -eq 0 ]
