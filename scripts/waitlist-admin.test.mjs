// Guards for the waitlist admin and health workflows and the admin script.
// Run with: node --test scripts/*.test.mjs
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const workflow = readFileSync(new URL('../.github/workflows/waitlist-admin.yml', import.meta.url), 'utf8')
const health = readFileSync(new URL('../.github/workflows/waitlist-health.yml', import.meta.url), 'utf8')
const script = readFileSync(new URL('./db/waitlist-admin.sh', import.meta.url), 'utf8')
const sqlLines = script.split('\n').filter((l) => /\brun (-c|-v)/.test(l))

test('the admin workflow only runs by hand, from main, with staging approval: no scheduled deletion', () => {
  assert.match(workflow, /^on:\n  workflow_dispatch:/m)
  assert.doesNotMatch(workflow, /^\s+(push|pull_request|pull_request_target|schedule|workflow_run|repository_dispatch):/m)
  assert.doesNotMatch(workflow, /cron:/)
  assert.match(workflow, /if: github\.ref == 'refs\/heads\/main'/)
  assert.doesNotMatch(workflow, /verified_only|VERIFIED_ONLY/)
  assert.match(workflow, /environment: staging/)
  assert.match(workflow, /permissions:\n  contents: read/)
  assert.match(workflow, /run: scripts\/db\/verify-staging-target\.sh[\s\S]*run: scripts\/db\/waitlist-admin\.sh/)
})

test('the admin workflow uses only the restricted admin login, takes no email, and checks the login', () => {
  assert.doesNotMatch(workflow, /^\s+email\w*:/im)
  const secrets = [...workflow.matchAll(/secrets\.(\w+)/g)].map((m) => m[1])
  assert.deepEqual([...new Set(secrets)], ['WAITLIST_ADMIN_DATABASE_URL'])
  assert.match(workflow, /EXPECTED_DB_USER: waitlist_admin/)
  assert.match(workflow, /REQUIRE_ADMIN_ROLE: '1'/)
})

test('the health workflow uses no secrets and no environment, and runs daily only once enabled', () => {
  assert.doesNotMatch(health, /secrets\./)
  assert.doesNotMatch(health, /environment:/)
  assert.match(health, /permissions:\n  contents: read/)
  assert.match(health, /vars\.WAITLIST_HEALTH_ENABLED == 'true'/)
  assert.match(health, /run: node scripts\/waitlist-health\.mjs/)
  assert.doesNotMatch(health, /^\s+(push|pull_request|pull_request_target):/m)
})

test('the admin script uses only the admin entry points and never selects an email address', () => {
  assert.equal(sqlLines.length, 17)
  for (const line of sqlLines) {
    assert.doesNotMatch(line, /email/i, line)
    assert.match(line, /waitlist_api\.admin_(summary|status|delete|purge|set_notice_version|open|close|wave_preview|wave_select|wave_summary|wave_clear|accept_creator|set_creator_status|set_creator_public_name|issue_creator_link|revoke_creator_link|acquisition_summary)\(/, line)
    assert.doesNotMatch(line, /\bops\./, line)
  }
  assert.match(script, /WAITLIST_ID must be a waitlist id \(a UUID\)/)
  assert.match(script, /RETENTION_MONTHS must be a whole number from 1 to 120/)
  assert.match(script, /\^waitlist_admin\(\\\.\[a-z0-9\]\{20\}\)\?\$/)
})

test('creator actions take an account id, never an email, and inputs reach the script only through env', () => {
  assert.match(script, /CREATOR_USER_ID must be the creator's account id \(a UUID\), not an email address/)
  assert.match(script, /LINK_DAYS must be a whole number from 1 to 365 \(default 90\)/)
  assert.match(script, /LINK_CODE must be the 20 character link code/)
  for (const input of ['creator_user_id', 'categories', 'creator_status', 'public_name', 'link_days', 'campaign', 'link_code']) {
    // Every use of the input is an env assignment in the run step, never inline in a command.
    for (const m of workflow.matchAll(new RegExp(`\\$\\{\\{ inputs\\.${input} \\}\\}`, 'g'))) {
      const line = workflow.slice(workflow.lastIndexOf('\n', m.index) + 1, workflow.indexOf('\n', m.index))
      assert.match(line, /^\s+[A-Z_]+: \$\{\{ inputs\.\w+ \}\}$/, line)
    }
  }
  assert.match(workflow, /default: '90'/)
})
