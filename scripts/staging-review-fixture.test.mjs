// Guard tests for the staging review fixture (SP-UX-003, check 8):
// .github/workflows/staging-review-fixture.yml and scripts/db/staging-review-fixture.sql.
// The workflow keeps its safeguards, and the fixture stays out of member
// Production: no Production workflow, script, configuration or migration
// mentions it, and no other workflow runs it.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

const root = new URL('..', import.meta.url).pathname
const read = (p) => readFileSync(join(root, p), 'utf8')
const noComments = (t) => t.replace(/^\s*#.*$/gm, '')
const walk = (dir) => readdirSync(join(root, dir)).flatMap((n) => (statSync(join(root, dir, n)).isDirectory() ? walk(join(dir, n)) : [join(dir, n)]))

const WORKFLOW = '.github/workflows/staging-review-fixture.yml'
const SQL = 'scripts/db/staging-review-fixture.sql'
const OWNER_IF = "    if: github.ref == 'refs/heads/main' && github.actor == github.repository_owner && github.triggering_actor == github.repository_owner"
const STAGING_REF = 'kpudeppgokpjhvaqrprn'
const MENTIONS = /review[-_]fixture|STAGING_FIXTURE_MEMBER_EMAIL|staging-fixture\.invalid/i

test('the fixture workflow is started by hand only, from main, by the owner only', () => {
  const t = read(WORKFLOW)
  assert.match(t, /^on:\n {2}workflow_dispatch:$/m)
  assert.doesNotMatch(t, /^ {2}(push|pull_request|pull_request_target|schedule|workflow_run|repository_dispatch|workflow_call):/m)
  const ifs = t.match(/^ {4}if:.*$/gm) ?? []
  assert.equal(ifs.length, 2, 'both jobs carry the owner condition')
  for (const l of ifs) assert.equal(l, OWNER_IF)
})

test('the fixture workflow keeps its staging safeguards', () => {
  const t = noComments(read(WORKFLOW))
  assert.match(t, /^permissions:\n {2}contents: read$/m)
  assert.equal((t.match(/permissions:/g) ?? []).length, 1)
  assert.match(t, /^concurrency:\n {2}group: deploy-database-staging\n {2}cancel-in-progress: false$/m)
  assert.match(t, new RegExp(`^ {2}EXPECTED_PROJECT_REF: ${STAGING_REF}$`, 'm'))
  assert.equal((t.match(/^ {4}environment: /gm) ?? []).length, 1)
  assert.match(t, /^ {4}environment: staging$/m)
  assert.match(t, /PGSSLMODE: verify-full/)
  assert.match(t, /REQUIRE_VERIFY_FULL: '1'/)
  assert.match(t, /CONFIRM_PROJECT_REF: \$\{\{ env\.EXPECTED_PROJECT_REF \}\}/)
  assert.match(t, /run: scripts\/db\/verify-staging-target\.sh/)
  // The target is verified before the fixture runs.
  assert.ok(t.indexOf('verify-staging-target.sh') < t.indexOf(`-f ${SQL}`))
  // Staging secrets only, never a Production one.
  for (const s of t.match(/secrets\.[A-Z_]+/g) ?? []) assert.match(s, /^secrets\.STAGING_/)
  assert.doesNotMatch(t, /MEMBERS_|PRODUCTION|members-production/)
  // The job without an environment refuses the address held anywhere else.
  assert.match(t, /secret-scope:[\s\S]*?OUTSIDE_ENVIRONMENT: \$\{\{ secrets\.STAGING_FIXTURE_MEMBER_EMAIL \}\}[\s\S]*?fixture:\n {4}name:[^\n]*\n {4}needs: secret-scope/)
  // The address is masked and never echoed.
  assert.match(t, /::add-mask::\$STAGING_FIXTURE_MEMBER_EMAIL/)
  const echoes = t.split('\n').filter((l) => /echo .*\$\{?STAGING_FIXTURE_MEMBER_EMAIL/.test(l) && !l.includes('::add-mask::'))
  assert.deepEqual(echoes, [], 'the address is never echoed')
})

test('the fixture SQL refuses member Production and any database whose founder is not the staging founder', () => {
  const t = read(SQL)
  assert.match(t, /to_regclass\('env_identity\.marker'\)/)
  assert.match(t, /member Production/)
  assert.match(t, /\\getenv fx_founder STAGING_FOUNDER_ACCOUNT_ID/)
  assert.match(t, /member_launch_settings/)
  // It never edits the approved goals or inserts a qualification directly.
  assert.doesNotMatch(t, /(insert into|update|delete from)\s+sim\.goal_(versions|values)/i)
  assert.doesNotMatch(t, /insert into\s+sim\.qualifications/i)
  assert.match(t, /sim\.check_qualification\(/)
})

test('no member Production or Production workflow, script, configuration or migration mentions the fixture', () => {
  const production = [
    ...walk('.github/workflows').filter((p) => /members-|production/.test(p)),
    ...walk('scripts/db').filter((p) => /\/(members-|production-|verify-members-|verify-production-)/.test(p)),
    ...walk('config').filter((p) => /\.(json|txt)$/.test(p)),
    ...walk('supabase'),
  ]
  assert.ok(production.some((p) => p.endsWith('deploy-db-members-production.yml')), 'the member Production workflow is checked')
  for (const p of production) assert.doesNotMatch(read(p), MENTIONS, `${p} mentions the staging review fixture`)
})

test('only the fixture workflow runs the fixture or reads its secret', () => {
  for (const p of walk('.github/workflows')) {
    if (p.endsWith('staging-review-fixture.yml')) continue
    assert.doesNotMatch(read(p), MENTIONS, `${p} mentions the staging review fixture`)
  }
})
