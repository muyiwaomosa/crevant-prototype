// Structure tests for the member Production database workflows
// (deploy-db-members-production.yml and members-activate-member-access.yml).
// Each rule is a function over the workflow text, so every rule is also shown
// to catch a deliberate break of the real file.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'

const DEPLOY = '.github/workflows/deploy-db-members-production.yml'
const ACTIVATE = '.github/workflows/members-activate-member-access.yml'
const OWNER_IF = "    if: github.ref == 'refs/heads/main' && github.actor == github.repository_owner && github.triggering_actor == github.repository_owner"
const read = (p) => readFileSync(p, 'utf8')
const noComments = (t) => t.replace(/^\s*#.*$/gm, '')

function jobsOf(text) {
  const body = text.slice(text.search(/^jobs:$/m))
  const starts = [...body.matchAll(/^ {2}([A-Za-z0-9_-]+):$/gm)]
  return starts.map((m, i) => ({ name: m[1], text: body.slice(m.index, i + 1 < starts.length ? starts[i + 1].index : undefined) }))
}
function stepsOf(jobText) {
  const starts = [...jobText.matchAll(/^ {6}- (?:name|uses): ?(.*)$/gm)]
  return starts.map((m, i) => ({ title: m[1], text: jobText.slice(m.index, i + 1 < starts.length ? starts[i + 1].index : undefined) }))
}

// Every rule, as [name, check(text, file) -> problem string or null].
const RULES = [
  ['started by hand only', (t) => (/^on:\n {2}workflow_dispatch:$/m.test(t) && !/^ {2}(push|pull_request|pull_request_target|schedule|workflow_run|repository_dispatch|workflow_call):/m.test(t) ? null : 'not workflow_dispatch only')],
  ['every job: main only, started and re-run by the owner only', (t) => {
    const jobs = jobsOf(t)
    return jobs.length === 3 && jobs.every((j) => j.text.split('\n').includes(OWNER_IF)) ? null : 'a job lacks the owner-only condition'
  }],
  ['only read permission', (t) => (/^permissions:\n {2}contents: read\n\n/m.test(t) && (t.match(/permissions:/g) ?? []).length === 1 ? null : 'permissions widened')],
  ['its own queue, never cancelled', (t) => (/^concurrency:\n {2}group: deploy-database-members-production\n {2}cancel-in-progress: false$/m.test(t) ? null : 'wrong concurrency group')],
  ['the reviewed commit is required and must equal the run commit', (t) => (
    /expected_commit:\n(?: {8}.*\n)*? {8}required: true/.test(t)
    && t.includes('EXPECTED_COMMIT: ${{ inputs.expected_commit }}') && t.includes('RUN_COMMIT: ${{ github.sha }}')
    && t.includes('[ "$EXPECTED_COMMIT" = "$RUN_COMMIT" ] ||') && t.includes('^[0-9a-f]{40}$') ? null : 'commit pin missing')],
  ['only the members-production environment, on exactly one job', (t) => {
    const envs = [...t.matchAll(/^ {4}environment: (.+)$/gm)].map((m) => m[1])
    return envs.length === 1 && envs[0] === 'members-production' ? null : `environments: ${envs.join(', ')}`
  }],
  ['only member Production secrets and variable', (t) => {
    const secrets = new Set([...t.matchAll(/secrets\.([A-Z0-9_]+)/g)].map((m) => m[1]))
    const vars = new Set([...t.matchAll(/vars\.([A-Z0-9_]+)/g)].map((m) => m[1]))
    const allowed = new Set(['MEMBERS_PRODUCTION_DATABASE_URL', 'MEMBERS_DB_IDENTITY_MARKER', 'MEMBERS_FOUNDER_ACCOUNT_ID'])
    const bad = [...secrets].filter((s) => !allowed.has(s)).concat([...vars].filter((v) => v !== 'MEMBERS_PROJECT_REF'))
    return bad.length ? `other secrets or variables: ${bad.join(', ')}` : null
  }],
  ['never names staging, the waitlist project, or their checks', (t) => (
    /kpudeppgokpjhvaqrprn|hmrliwoychnqrbbydorg|STAGING_|(^|[^A-Z_])PRODUCTION_DATABASE_URL|WAITLIST_ADMIN|verify-(staging|production)-target|staging-(activate|verify)|deploy-database-(staging|production)\b/m.test(noComments(t)) ? 'names staging or the waitlist project' : null)],
  ['the first job has no environment and refuses member secrets stored outside it', (t) => {
    const first = jobsOf(t)[0]
    return first.name === 'secret-scope' && !/environment:/.test(first.text)
      && first.text.includes('OUTSIDE_URL: ${{ secrets.MEMBERS_PRODUCTION_DATABASE_URL }}')
      && first.text.includes('OUTSIDE_MARKER: ${{ secrets.MEMBERS_DB_IDENTITY_MARKER }}')
      && first.text.includes('OUTSIDE_FOUNDER: ${{ secrets.MEMBERS_FOUNDER_ACCOUNT_ID }}')
      && first.text.includes('if [ -n "$OUTSIDE_URL$OUTSIDE_MARKER$OUTSIDE_FOUNDER" ]; then') ? null : 'secret scope check missing'
  }],
  ['the database job needs the throwaway verification, which runs the member sequence test', (t) => {
    const [, verify, db] = jobsOf(t)
    return /needs: secret-scope/.test(verify.text) && verify.text.includes('run: scripts/db/members-workflow-test.sh')
      && verify.text.includes('run: scripts/db/test.sh') && new RegExp(`needs: ${verify.name}\\b`).test(db.text) ? null : 'verification chain broken'
  }],
  ['verify-full TLS on the database job', (t) => {
    const db = jobsOf(t)[2]
    return db.text.includes("      PGSSLMODE: verify-full\n      PGSSLROOTCERT: ${{ github.workspace }}/config/certs/supabase-root-2021-ca.crt\n      REQUIRE_VERIFY_FULL: '1'") ? null : 'verify-full missing'
  }],
  ['target check, then the identity marker, before anything else touches the database', (t) => {
    const steps = stepsOf(jobsOf(t)[2].text)
    const target = steps.findIndex((s) => s.text.includes('run: scripts/db/verify-members-target.sh'))
    const identity = steps.findIndex((s) => s.text.includes('run: scripts/db/verify-members-identity.sh'))
    if (target !== 1 || identity !== 2) return `target at ${target}, identity at ${identity} (expected 1 and 2, after checkout)`
    if (!/^ {6}- uses: actions\/checkout@v4/.test(steps[0].text)) return 'checkout is not first'
    for (const s of steps.slice(0, 3)) if (/^ {8}if:/m.test(s.text) || /continue-on-error/.test(s.text)) return 'a verification step is conditional'
    const id = steps[identity].text
    if (!id.includes('MEMBERS_DB_IDENTITY_MARKER: ${{ secrets.MEMBERS_DB_IDENTITY_MARKER }}')) return 'identity step lacks the marker secret'
    for (const s of steps.slice(0, identity)) if (/\bpsql\b|supabase |members-(pending|run|lock|activate)/.test(s.text.replace(/^\s*#.*$/gm, ''))) return 'something connects before the identity check'
    const marker = steps.filter((s) => s.text.includes('MEMBERS_DB_IDENTITY_MARKER'))
    if (marker.length !== 1) return 'the marker secret reaches more than the identity step'
    return null
  }],
  ['no step continues on error', (t) => (/continue-on-error/.test(noComments(t)) ? 'continue-on-error present' : null)],
]
const DEPLOY_RULES = [
  ['check is the default mode', (t) => (/mode:\n(?: {8}.*\n)*? {8}default: check\n/.test(t) ? null : 'check is not the default')],
  ['each apply mode needs its phrase and the backup confirmation', (t) => (
    t.includes('[ "$PHRASE" = "APPLY MEMBER PRODUCTION FOUNDATION" ]') && t.includes('[ "$PHRASE" = "APPLY TO MEMBER PRODUCTION" ]')
    && t.includes('[ "$BACKUP" = "true" ]') ? null : 'phrase or backup check missing')],
  ['db push runs only in the plan and apply modes, from the prepared member folder', (t) => {
    const pushes = [...t.matchAll(/^ {6}- name: (.*)\n((?: {8}.*\n)*?) {8}run: supabase --workdir "\$RUNNER_TEMP\/members" db push --db-url "\$MEMBERS_PRODUCTION_DATABASE_URL" (--dry-run|--yes)$/gm)]
    const all = (noComments(t).match(/db push/g) ?? []).length
    const wet = pushes.filter((m) => m[3] === '--yes')
    if (pushes.length !== 3 || all !== 3) return `db push count ${all}`
    if (!wet.every((m) => /if: inputs\.mode == 'apply(-foundation)?'\n/.test(m[2]))) return 'a real push is not limited to an apply mode'
    if (!/if: \(inputs\.mode == 'plan' \|\| inputs\.mode == 'apply-foundation' \|\| inputs\.mode == 'apply'\)/.test(pushes.find((m) => m[3] === '--dry-run')[2])) return 'dry run not limited'
    return null
  }],
  ['the foundation set only for a new project; apply only after activation', (t) => (
    t.includes('members-subset.sh prepare "$RUNNER_TEMP/members" foundation') && t.includes('apply-foundation) [ "$state" = empty ]')
    && t.includes('apply) [ "$state" = activated ]') ? null : 'state gating missing')],
  ['the waitlist logins are locked in apply-foundation, after the push', (t) => {
    const push = t.indexOf('- name: Apply the foundation migrations')
    const lock = t.indexOf('-f scripts/db/members-lock-waitlist-roles.sql')
    return push > 0 && lock > push && /Lock the waitlist logins[^\n]*\n {8}if: inputs\.mode == 'apply-foundation'\n/.test(t) ? null : 'lock missing or misplaced'
  }],
  ['the checks always run, and apply requires all of them', (t) => (
    t.includes('if [ "$MODE" = apply ]; then scripts/db/members-run-checks.sh --require-all; else scripts/db/members-run-checks.sh; fi')
    && !/- name: Member Production checks[^\n]*\n {8}if:/.test(t) ? null : 'checks conditional or incomplete')],
]
const ACTIVATE_RULES = [
  ['rehearse is the default mode', (t) => (/mode:\n(?: {8}.*\n)*? {8}default: rehearse\n/.test(t) ? null : 'rehearse is not the default')],
  ['activate needs its own phrase', (t) => (t.includes('activate) [ "$PHRASE" = "ACTIVATE MEMBER PRODUCTION ACCESS" ]') ? null : 'phrase missing')],
  ['never pushes migrations; runs the member activation SQL once', (t) => (
    !/db push/.test(noComments(t)) && (t.match(/-f scripts\/db\/members-activate-member-access\.sql/g) ?? []).length === 1 ? null : 'push or activation count wrong')],
  ['the founder id only through the environment, never on a command line', (t) => (
    !/-v [a-z_]+="?\$MEMBERS_FOUNDER_ACCOUNT_ID/.test(t) && !/echo[^\n]*\$MEMBERS_FOUNDER_ACCOUNT_ID/.test(t) ? null : 'founder id exposed')],
  ['after the commit, only read-only sessions', (t) => {
    const after = t.slice(t.indexOf('# Read only from here on.'))
    const steps = [...after.matchAll(/^ {6}- name:/gm)].length
    return steps === 3 && (after.match(/PGOPTIONS: '-c default_transaction_read_only=on'/g) ?? []).length === 3 ? null : 'a later step is not read only'
  }],
]

for (const [file, extra] of [[DEPLOY, DEPLOY_RULES], [ACTIVATE, ACTIVATE_RULES]]) {
  for (const [name, rule] of [...RULES, ...extra]) {
    test(`${file}: ${name}`, () => assert.equal(rule(read(file), file), null))
  }
}

// Deliberate breaks of the real files: each must be caught by its rule.
const BREAKS = [
  [DEPLOY, 'every job: main only, started and re-run by the owner only', (t) => t.replace(` && github.triggering_actor == github.repository_owner\n    runs-on: ubuntu-latest\n    timeout-minutes: 20`, `\n    runs-on: ubuntu-latest\n    timeout-minutes: 20`)],
  [DEPLOY, 'started by hand only', (t) => t.replace('on:\n  workflow_dispatch:', 'on:\n  push:\n  workflow_dispatch:')],
  [DEPLOY, 'the reviewed commit is required and must equal the run commit', (t) => t.replace('[ "$EXPECTED_COMMIT" = "$RUN_COMMIT" ] ||', 'true ||')],
  [DEPLOY, 'only the members-production environment, on exactly one job', (t) => t.replace('environment: members-production', 'environment: production')],
  [DEPLOY, 'only member Production secrets and variable', (t) => t.replace('${{ secrets.MEMBERS_DB_IDENTITY_MARKER }}\n          PGCONNECT', '${{ secrets.STAGING_DATABASE_URL }}\n          PGCONNECT')],
  [DEPLOY, 'never names staging, the waitlist project, or their checks', (t) => t.replace('run: scripts/db/verify-members-target.sh', 'run: scripts/db/verify-production-target.sh')],
  [DEPLOY, 'target check, then the identity marker, before anything else touches the database', (t) => t.replace(/ {6}- name: Verify the database identity marker[\s\S]*?run: scripts\/db\/verify-members-identity\.sh\n\n/, '')],
  [DEPLOY, 'target check, then the identity marker, before anything else touches the database', (t) => t.replace('        run: scripts/db/verify-members-identity.sh', "        if: inputs.mode != 'check'\n        run: scripts/db/verify-members-identity.sh")],
  [DEPLOY, 'target check, then the identity marker, before anything else touches the database', (t) => t.replace('        run: scripts/db/verify-members-target.sh', '        run: scripts/db/verify-members-target.sh && psql "$MEMBERS_PRODUCTION_DATABASE_URL" -c "select 1"')],
  [DEPLOY, 'its own queue, never cancelled', (t) => t.replace('group: deploy-database-members-production', 'group: deploy-database-staging')],
  [DEPLOY, 'check is the default mode', (t) => t.replace('default: check', 'default: apply')],
  [DEPLOY, 'db push runs only in the plan and apply modes, from the prepared member folder', (t) => t.replace("        if: inputs.mode == 'apply-foundation'\n        env:\n          MEMBERS_PRODUCTION_DATABASE_URL: ${{ secrets.MEMBERS_PRODUCTION_DATABASE_URL }}\n        run: supabase", "        env:\n          MEMBERS_PRODUCTION_DATABASE_URL: ${{ secrets.MEMBERS_PRODUCTION_DATABASE_URL }}\n        run: supabase")],
  [DEPLOY, 'the waitlist logins are locked in apply-foundation, after the push', (t) => t.replace('-f scripts/db/members-lock-waitlist-roles.sql', '-c "select 1"')],
  [DEPLOY, 'the checks always run, and apply requires all of them', (t) => t.replace(' --require-all;', ';')],
  [DEPLOY, 'the first job has no environment and refuses member secrets stored outside it', (t) => t.replace('if [ -n "$OUTSIDE_URL$OUTSIDE_MARKER$OUTSIDE_FOUNDER" ]; then', 'if [ -n "$OUTSIDE_URL" ]; then')],
  [ACTIVATE, 'rehearse is the default mode', (t) => t.replace('default: rehearse', 'default: activate')],
  [ACTIVATE, 'the founder id only through the environment, never on a command line', (t) => t.replace('-v mode="$MODE"', '-v founder="$MEMBERS_FOUNDER_ACCOUNT_ID" -v mode="$MODE"')],
  [ACTIVATE, 'after the commit, only read-only sessions', (t) => t.replace("          PGOPTIONS: '-c default_transaction_read_only=on'\n          PGCONNECT_TIMEOUT: '15'\n        run: psql \"$MEMBERS_PRODUCTION_DATABASE_URL\" -X -q -v ON_ERROR_STOP=1 -v expect=activated", "          PGCONNECT_TIMEOUT: '15'\n        run: psql \"$MEMBERS_PRODUCTION_DATABASE_URL\" -X -q -v ON_ERROR_STOP=1 -v expect=activated")],
  [ACTIVATE, 'never pushes migrations; runs the member activation SQL once', (t) => t.replace('-f scripts/db/members-activate-member-access.sql', '-f scripts/db/members-activate-member-access.sql && supabase db push')],
  [ACTIVATE, 'target check, then the identity marker, before anything else touches the database', (t) => t.replace(/ {6}- name: Verify the database identity marker[\s\S]*?run: scripts\/db\/verify-members-identity\.sh\n\n/, '')],
]
for (const [file, ruleName, breakIt] of BREAKS) {
  test(`deliberate break caught: ${file.split('/').pop()}: ${ruleName}`, () => {
    const original = read(file)
    const broken = breakIt(original)
    assert.notEqual(broken, original, 'the break did not change the file (update the test)')
    const rule = [...RULES, ...DEPLOY_RULES, ...ACTIVATE_RULES].find(([n]) => n === ruleName)[1]
    assert.notEqual(rule(broken, file), null)
  })
}

test('the approvals stay false, and the member Production project reference stays null', () => {
  const approvals = JSON.parse(read('config/member-production.json'))
  assert.equal(approvals.photosApproved, false)
  assert.equal(approvals.invitationsApproved, false)
  assert.equal(approvals.postMediaFunctionApproved, false, 'post-media is not approved for member Production (Phase 1B-2)')
  assert.deepEqual(Object.keys(approvals).filter((k) => !k.startsWith('_')).sort(), ['invitationsApproved', 'photosApproved', 'postMediaFunctionApproved'])
  assert.equal(JSON.parse(read('config/supabase-projects.json')).memberProduction.ref, null)
})

test('the identity marker is provisioned by hand from a placeholder, and stored as a hash only', () => {
  const sql = read('scripts/db/members-identity-provision.sql')
  assert.equal((sql.match(/PASTE_THE_MARKER_SHA256_HERE/g) ?? []).length, 3, 'the placeholder appears in the instructions and once in code')
  assert.ok(!/[0-9a-f]{64}/.test(sql), 'no hash or marker is committed')
  assert.match(sql, /label = 'splitpost-members-production'/)
  const verify = read('scripts/db/verify-members-identity.sh')
  assert.match(verify, /echo "::add-mask::\$marker"/)
  assert.match(verify, /unset marker MEMBERS_DB_IDENTITY_MARKER/)
  assert.ok(!/psql[^\n]*\$marker/.test(verify), 'the marker never reaches psql')
})

test('the member checks list covers every shared check, each with a real migration', () => {
  const lines = read('supabase/members-checks.txt').split('\n').filter((l) => l && !l.startsWith('#'))
  const checks = lines.map((l) => l.split(' ')[0])
  const files = new Set(read('supabase/approved-migrations.sha256').split('\n').filter(Boolean).map((l) => l.split('/').pop().slice(0, 14)))
  for (const l of lines) assert.ok(files.has(l.split(' ')[1]), `${l}: no such migration`)
  assert.deepEqual(checks, readdirSync('supabase/tests').filter((f) => f.endsWith('.sql')).sort(), 'every shared check is listed once, in order')
})
