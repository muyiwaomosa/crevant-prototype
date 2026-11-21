// Structure tests for Phase 1B-2 (Edge Function deployment safeguards):
// the independent verify workflow, the committed references and approvals,
// and the agreements between the deploy script, the verifier, the policy and
// the member database workflow. Each workflow rule is also shown to catch a
// deliberate break of the real file.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { ledgerProblems } from './functions/ledger.mjs'
import { evidenceAnnotation, originsFor, ROUTES } from './functions/verify.mjs'
import { checkVerifyEvidence } from './functions/deploy.mjs'

const root = new URL('..', import.meta.url).pathname
const read = (p) => readFileSync(join(root, p), 'utf8')
const noComments = (t) => t.replace(/^\s*#.*$/gm, '')
const VERIFY = '.github/workflows/verify-functions.yml'
const OWNER_IF = "    if: github.ref == 'refs/heads/main' && github.actor == github.repository_owner && github.triggering_actor == github.repository_owner"
const walk = (dir) => readdirSync(join(root, dir)).flatMap((n) => (statSync(join(root, dir, n)).isDirectory() ? walk(join(dir, n)) : [join(dir, n)]))

const RULES = [
  ['started by hand only', (t) => (/^on:\n {2}workflow_dispatch:$/m.test(t) && !/^ {2}(push|pull_request|pull_request_target|schedule|workflow_run|repository_dispatch|workflow_call):/m.test(t) ? null : 'not workflow_dispatch only')],
  ['main only, started and re-run by the owner only', (t) => (t.split('\n').filter((l) => l === OWNER_IF).length === 1 && (t.match(/^ {4}if:/gm) ?? []).length === 1 ? null : 'owner condition missing')],
  ['read-only permission, no secret, no variable, no environment', (t) => {
    const c = noComments(t)
    if (!/^permissions:\n {2}contents: read\n\n/m.test(c) || (c.match(/permissions:/g) ?? []).length !== 1) return 'permissions widened'
    if (/secrets\.|vars\.|environment:/.test(c)) return 'a secret, variable or environment is named'
    return null
  }],
  ['its own queue, separate from every database workflow', (t) => (/^concurrency:\n {2}group: verify-functions-\$\{\{ inputs\.target \}\}\n {2}cancel-in-progress: false$/m.test(t) ? null : 'wrong queue')],
  ['never deploys, deletes or uses the Supabase CLI', (t) => (/supabase |functions (deploy|delete)|deploy\.mjs/.test(noComments(t)) ? 'deploys something' : null)],
  ['the run title records exactly what was verified', (t) => (t.includes('run-name: verify ${{ inputs.target }} ${{ inputs.function }} ${{ inputs.mode }} ${{ inputs.expected_commit }} v${{ inputs.deployed_version }}\n') ? null : 'run-name changed')],
  ['inputs reach commands only through env (no injection)', (t) => {
    const runs = [...t.matchAll(/^ {8}run: (\|\n(?: {10}.*\n)+|.*\n)/gm)].map((m) => m[1])
    return runs.some((r) => /\$\{\{/.test(r)) ? 'an expression inside run' : null
  }],
  ['the commit must be on main, and the source is exported from it', (t) => (t.includes('git merge-base --is-ancestor "$EXPECTED_COMMIT" HEAD') && t.includes('git archive --format=tar "$EXPECTED_COMMIT" supabase/functions') && /fetch-depth: 0/.test(t) ? null : 'commit checks missing')],
  ['the verifier runs with the real targets only (no test options)', (t) => (t.includes('run: node scripts/functions/verify.mjs --target "$TARGET" --function "$FUNCTION" --mode "$MODE" --commit "$EXPECTED_COMMIT" --source-root "$RUNNER_TEMP/src"') && !/--base-url|--config-root|--skip-absence/.test(noComments(t)) ? null : 'verifier call changed')],
]
for (const [name, rule] of RULES) test(`${VERIFY}: ${name}`, () => assert.equal(rule(read(VERIFY)), null))

const BREAKS = [
  ['started by hand only', (t) => t.replace('on:\n  workflow_dispatch:', 'on:\n  push:\n  workflow_dispatch:')],
  ['main only, started and re-run by the owner only', (t) => t.replace(' && github.triggering_actor == github.repository_owner', '')],
  ['read-only permission, no secret, no variable, no environment', (t) => t.replace('    runs-on: ubuntu-latest', '    environment: members-production\n    runs-on: ubuntu-latest')],
  ['read-only permission, no secret, no variable, no environment', (t) => t.replace('          MODE: ${{ inputs.mode }}\n          EXPECTED_COMMIT', '          MODE: ${{ inputs.mode }}\n          TOKEN: ${{ secrets.SUPABASE_ACCESS_TOKEN }}\n          EXPECTED_COMMIT')],
  ['read-only permission, no secret, no variable, no environment', (t) => t.replace('  contents: read', '  contents: write')],
  ['its own queue, separate from every database workflow', (t) => t.replace('group: verify-functions-${{ inputs.target }}', 'group: deploy-database-members-production')],
  ['never deploys, deletes or uses the Supabase CLI', (t) => t.replace('run: node scripts/functions/verify.mjs', 'run: supabase functions deploy avatar && node scripts/functions/verify.mjs')],
  ['the run title records exactly what was verified', (t) => t.replace(' v${{ inputs.deployed_version }}\n', '\n')],
  ['inputs reach commands only through env (no injection)', (t) => t.replace('--target "$TARGET"', '--target "${{ inputs.target }}"')],
  ['the commit must be on main, and the source is exported from it', (t) => t.replace('git merge-base --is-ancestor "$EXPECTED_COMMIT" HEAD ||', 'true ||')],
  ['the verifier runs with the real targets only (no test options)', (t) => t.replace('--source-root "$RUNNER_TEMP/src"', '--source-root "$RUNNER_TEMP/src" --skip-absence')],
]
for (const [name, breakIt] of BREAKS) {
  test(`deliberate break caught: ${name}`, () => {
    const original = read(VERIFY)
    const broken = breakIt(original)
    assert.notEqual(broken, original, 'the break did not change the file (update the test)')
    assert.notEqual(RULES.find(([n]) => n === name)[1](broken), null)
  })
}

test('no workflow deploys or deletes an Edge Function; only the founder\'s script does', () => {
  for (const f of walk('.github/workflows')) {
    assert.ok(!/functions (deploy|delete)|scripts\/functions\/deploy\.mjs/.test(noComments(read(f))), f)
  }
})

test('the committed references match config, and functions read references only from them', () => {
  execFileSync('node', ['scripts/functions/projects-sync.mjs', '--check'], { cwd: root, stdio: 'pipe' })
  for (const f of walk('supabase/functions').filter((p) => p.endsWith('.ts') && !p.endsWith('.test.ts') && !p.endsWith('_shared/projects.ts'))) {
    assert.ok(!/'[a-z0-9]{20}'|https:\/\/[a-z0-9]{20}\.supabase/.test(read(f)), `${f} names a project itself`)
  }
  for (const fn of ['avatar', 'post-media']) assert.match(read(`supabase/functions/${fn}/index.ts`), /from '\.\.\/_shared\/policy\.ts'/)
  assert.match(read('supabase/functions/join-waitlist/index.ts'), /const projectAllowed = waitlistProjectAllowed\(Deno\.env\.get\('SUPABASE_URL'\) \?\? ''\)\nconst env = \(k: string\) => \(projectAllowed \? \(Deno\.env\.get\(k\) \?\? ''\) : ''\)\.trim\(\)/, 'join-waitlist reads no secret unless the project is allowed')
  assert.equal(read('supabase/functions/_shared/build-info.ts').match(/export const BUILD = '([^']*)'/)[1], 'unstamped', 'the repository copy is never stamped')
})

test('member Production stays unprovisioned, avatar only, with an empty ledger', () => {
  const p = JSON.parse(read('config/supabase-projects.json'))
  assert.deepEqual(p.memberProduction, { ref: null, name: null, region: null })
  const a = JSON.parse(read('config/member-production.json'))
  assert.equal(a.postMediaFunctionApproved, false)
  assert.equal(a.photosApproved, false)
  assert.equal(a.invitationsApproved, false)
  const ledger = JSON.parse(read('config/function-deployments.json'))
  assert.deepEqual(ledgerProblems(ledger), [])
  assert.equal(ledger.deployments.length, 0)
  assert.match(read('docs/function-evidence-log.md'), /\| Time \(UTC\) \| Action \| Target \| Project \| Function \| Commit \| Version \| Operator \| Reason \| Result \|/)
})

test('the deploy script, the verifier, the policy and the database workflow agree', () => {
  const deploy = read('scripts/functions/deploy.mjs')
  const db = read('.github/workflows/deploy-db-members-production.yml')
  assert.ok(db.includes('run-name: member database ${{ inputs.mode }} at ${{ inputs.expected_commit }}\n'), 'the database run title the deploy script matches')
  assert.ok(deploy.includes('`member database check at ${commit}`'))
  const step = /const DB_STEP = '([^']+)'/.exec(deploy)[1]
  assert.ok(db.includes(`- name: ${step}\n`), 'the identity step name the deploy script requires exists in the database workflow')
  assert.ok(deploy.includes('`verify ${target} ${entry.function} deployed ${entry.commit} v${entry.version}`'), 'the verification title the rollback check matches')
  const policy = read('supabase/functions/_shared/policy.ts')
  assert.equal(/MEMBER_APP_ORIGIN = '([^']+)'/.exec(policy)[1], originsFor('member-production').approved)
  assert.match(originsFor('staging').approved, new RegExp(/PREVIEW_ORIGIN = \/(.+)\/$/m.exec(policy)[1]))
  for (const t of ['staging', 'member-production']) {
    const { approved, disallowed } = originsFor(t)
    for (const o of ['https://splitpost.ca', 'https://www.splitpost.ca', 'https://crevant-prototype.vercel.app', 'null', 'https://evil.example']) assert.ok(disallowed.includes(o), `${t} checks ${o}`)
    assert.ok(!disallowed.includes(approved))
    assert.ok(disallowed.includes(originsFor(t === 'staging' ? 'member-production' : 'staging').approved), `${t} refuses the other environment's origin`)
  }
  for (const fn of ['avatar', 'post-media']) {
    const handler = read(`supabase/functions/${fn}/handler.ts`)
    for (const r of ROUTES[fn]) assert.ok(handler.includes(`action === '${r}'`), `${fn} has route ${r}`)
  }
})

test('the verifier\'s evidence line is exactly what the rollback check reads (round trip)', () => {
  const commit = 'a'.repeat(40)
  const build = `${commit}.${'b'.repeat(64)}`
  const line = evidenceAnnotation({ target: 'member-production', function: 'avatar', mode: 'deployed', commit }, { ref: 'membersprodtestrefab', observedBuild: build })
  const m = /^::notice title=Verified deployment::(.*)$/.exec(line)
  assert.ok(m, line)
  const entry = { ref: 'membersprodtestrefab', function: 'avatar', commit, build }
  assert.doesNotThrow(() => checkVerifyEvidence([{ title: 'Verified deployment', annotation_level: 'notice', message: m[1] }], entry, 'member-production'))
  const other = evidenceAnnotation({ target: 'member-production', function: 'avatar', mode: 'deployed', commit }, { ref: 'membersprodtestrefab', observedBuild: `${commit}.${'c'.repeat(64)}` })
  assert.throws(() => checkVerifyEvidence([{ title: 'Verified deployment', annotation_level: 'notice', message: other.split('::').pop() }], entry, 'member-production'), /observed_build/)
})
