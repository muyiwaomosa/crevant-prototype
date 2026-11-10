// Guards for the waitlist admin workflow and script. Run with: node --test scripts/*.test.mjs
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const workflow = readFileSync(new URL('../.github/workflows/waitlist-admin.yml', import.meta.url), 'utf8')
const script = readFileSync(new URL('./db/waitlist-admin.sh', import.meta.url), 'utf8')
const sqlLines = script.split('\n').filter((l) => /"\$\{PSQL\[@\]\}"/.test(l))

test('the admin workflow only runs by hand, from main, with staging approval', () => {
  assert.match(workflow, /^on:\n  workflow_dispatch:/m)
  assert.doesNotMatch(workflow, /^\s+(push|pull_request|schedule|workflow_run|repository_dispatch):/m)
  assert.match(workflow, /if: github\.ref == 'refs\/heads\/main'/)
  assert.match(workflow, /environment: staging/)
  assert.match(workflow, /permissions:\n  contents: read/)
  assert.match(workflow, /run: scripts\/db\/verify-staging-target\.sh[\s\S]*run: scripts\/db\/waitlist-admin\.sh/)
})

test('the admin workflow takes no email address and uses only the staging database secret', () => {
  assert.doesNotMatch(workflow, /^\s+email\w*:/im)
  const secrets = [...workflow.matchAll(/secrets\.(\w+)/g)].map((m) => m[1])
  assert.deepEqual([...new Set(secrets)], ['STAGING_DATABASE_URL'])
})

test('the admin script never selects or prints an email address', () => {
  assert.ok(sqlLines.length >= 5)
  for (const line of sqlLines) assert.doesNotMatch(line, /email/i, line)
  assert.match(script, /WAITLIST_ID must be a waitlist id \(a UUID\)/)
  assert.match(script, /RETENTION_MONTHS must be a whole number from 1 to 120/)
})
