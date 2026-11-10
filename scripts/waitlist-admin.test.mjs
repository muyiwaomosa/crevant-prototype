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
  assert.equal(sqlLines.length, 11)
  for (const line of sqlLines) {
    assert.doesNotMatch(line, /email/i, line)
    assert.match(line, /waitlist_api\.admin_(summary|status|delete|purge|set_notice_version|open|close|wave_preview|wave_select|wave_summary|wave_clear)\(/, line)
    assert.doesNotMatch(line, /\bops\./, line)
  }
  assert.match(script, /WAITLIST_ID must be a waitlist id \(a UUID\)/)
  assert.match(script, /RETENTION_MONTHS must be a whole number from 1 to 120/)
  assert.match(script, /\^waitlist_admin\(\\\.\[a-z0-9\]\{20\}\)\?\$/)
})
