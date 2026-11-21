// Guards for the Production waitlist admin and health workflows.
// Run with: node --test scripts/*.test.mjs
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const admin = readFileSync(new URL('../.github/workflows/waitlist-admin-production.yml', import.meta.url), 'utf8')
const health = readFileSync(new URL('../.github/workflows/waitlist-health-production.yml', import.meta.url), 'utf8')
const staging = readFileSync(new URL('../.github/workflows/waitlist-admin.yml', import.meta.url), 'utf8')

test('the Production admin workflow offers exactly the minimum actions, and refuses anything else', () => {
  const block = admin.split('options:')[1].split('default:')[0]
  const options = [...block.matchAll(/^\s+- ([a-z-]+)$/gm)].map((m) => m[1])
  assert.deepEqual(options, ['status', 'summary', 'open', 'close', 'delete', 'purge', 'purge-acquisition-events', 'set-notice-version'])
  assert.match(admin, /status\|summary\|open\|close\|delete\|purge\|purge-acquisition-events\|set-notice-version\) echo "Action: \$ACTION"/)
  for (const no of ['wave-', 'creator', 'issue-link', 'revoke-link', 'acquisition']) assert.equal(admin.includes(`- ${no}`), false, no)
})

test('started by hand on main by the owner only, approved through the production environment every run', () => {
  assert.match(admin, /^on:\n {2}workflow_dispatch:/m)
  assert.equal(/^ {2}(push|pull_request|schedule|workflow_run|workflow_call):/m.test(admin), false)
  assert.match(admin, /if: github\.ref == 'refs\/heads\/main' && github\.actor == github\.repository_owner && github\.triggering_actor == github\.repository_owner/)
  assert.match(admin, /^ {4}environment: production$/m)
  assert.match(admin, /group: waitlist-admin-production/)
  assert.match(staging, /group: waitlist-admin-staging/)
})

test('only the restricted waitlist_admin login, verified on the Production project before anything runs', () => {
  assert.deepEqual([...new Set(admin.match(/secrets\.[A-Z_]+/g))], ['secrets.WAITLIST_ADMIN_DATABASE_URL'])
  assert.match(admin, /EXPECTED_DB_USER: waitlist_admin/)
  assert.match(admin, /REQUIRE_ADMIN_ROLE: '1'/)
  assert.match(admin, /EXPECTED_PROJECT_REF: hmrliwoychnqrbbydorg/)
  const verify = admin.indexOf('run: scripts/db/verify-production-target.sh')
  const run = admin.indexOf('run: scripts/db/waitlist-admin.sh')
  assert.ok(verify > 0 && run > verify, 'the target is verified before the action runs')
  assert.equal(admin.includes('verify-staging-target'), false)
  assert.equal(admin.includes('kpudeppgokpjhvaqrprn'), false)
})

test('inputs reach commands only through environment variables (no injection)', () => {
  for (const line of admin.split('\n').filter((l) => /\$\{\{\s*(inputs|secrets|vars)\./.test(l))) {
    assert.match(line, /^\s+([A-Z_]+|name): /, line)
  }
})

test('the Production health check uses no secrets, its own variables, the Production function only, and is off by default', () => {
  assert.equal(/secrets\./.test(health), false)
  for (const v of ['PRODUCTION_WAITLIST_FUNCTION_URL', 'PRODUCTION_WAITLIST_SITE_ORIGIN', 'PRODUCTION_WAITLIST_EXPECTED_STATE']) assert.match(health, new RegExp(`vars\\.${v}`))
  assert.equal(/vars\.WAITLIST_FUNCTION_URL/.test(health), false, 'never the staging variables')
  assert.match(health, /vars\.PRODUCTION_WAITLIST_HEALTH_ENABLED == 'true'/)
  assert.match(health, /"https:\/\/hmrliwoychnqrbbydorg\.supabase\.co\/functions\/v1\/join-waitlist"/)
  assert.equal(health.includes('kpudeppgokpjhvaqrprn'), false)
})
