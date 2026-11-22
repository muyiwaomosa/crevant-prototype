// Guards for the "Photo cleanup schedule check on staging" workflow
// (node --test, run by npm test). They read the workflow and its wrapper
// themselves, and fail if the structure can't be found, so they can't pass
// vacuously. The wrapper's behaviour against a database is tested by
// scripts/db/staging-schedule-check-test.sh.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'

const WF_PATH = '.github/workflows/staging-photo-cleanup-check.yml'
const WRAPPER_PATH = 'scripts/db/staging-schedule-check.sh'
const SCRIPT_PATH = 'scripts/db/staging-schedule-media-drain.sql'
const LIB_PATH = 'scripts/db/staging-photo-cleanup-lib.sh'
const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8')
const wf = read(WF_PATH)
const wrapper = read(WRAPPER_PATH)
// The shared guards the wrapper sources (also used by the apply and removal wrappers).
const lib = read(LIB_PATH)
const GUARD_CALL = /^guard \$# "\$SCRIPT" "\$SCRIPT_SHA256"$/m
/** The body of one shell function in the shared guards. */
function libFunction(name) {
  const m = new RegExp(`^${name}\\(\\) \\{(?:\\n([\\s\\S]*?)^\\}| (.*) \\})$`, 'm').exec(lib)
  assert.ok(m, `no ${name}() in ${LIB_PATH}`)
  return m[1] ?? m[2]
}
/** The read-only fingerprint SQL the wrapper prints before and after. */
function fingerprintSql() {
  const m = /^FINGERPRINT_SQL="([\s\S]*?)"$/m.exec(lib)
  assert.ok(m, `no FINGERPRINT_SQL in ${LIB_PATH}`)
  return m[1]
}
const lines = wf.split('\n')
const code = (t) => t.split('\n').filter((l) => !/^\s*#/.test(l)).join('\n')

/** The jobs, by name, each with its own lines (two-space job keys under `jobs:`). */
function jobs() {
  const start = lines.indexOf('jobs:')
  assert.ok(start > 0, 'no jobs: section')
  const out = {}
  let name = null
  for (const line of lines.slice(start + 1)) {
    const m = /^ {2}([a-z0-9-]+):$/.exec(line)
    if (m) out[(name = m[1])] = []
    else if (name) out[name].push(line)
  }
  return out
}
const key = (job, k) => job.map((l) => new RegExp(`^ {4}${k}: (.*)$`).exec(l)).find(Boolean)?.[1]
function steps(job) {
  const out = []
  let cur = null
  let section = null
  for (const line of job) {
    let m
    if ((m = /^ {6}- (name|uses): (.*)$/.exec(line))) out.push((cur = { [m[1]]: m[2], env: {}, run: '', keys: [m[1]] })), (section = null)
    else if (!cur) continue
    else if (/^ {8}env:$/.test(line)) (section = 'env'), cur.keys.push('env')
    else if ((m = /^ {8}([a-z-]+): ?(.*)$/.exec(line))) {
      cur.keys.push(m[1])
      if (m[1] === 'run') cur.run = m[2]
      section = null
    } else if (section === 'env' && (m = /^ {10}([A-Z_]+): (.*)$/.exec(line))) cur.env[m[1]] = m[2]
  }
  return out
}
function evaluate(expr, github) {
  return expr.split('&&').every((clause) => {
    const m = /^\s*(github\.[a-z_]+|'[^']*')\s*==\s*(github\.[a-z_]+|'[^']*')\s*$/.exec(clause)
    if (!m) throw new Error(`unsupported condition: ${clause}`)
    const val = (t) => (t.startsWith("'") ? t.slice(1, -1) : github[t.slice('github.'.length)])
    const [a, b] = [val(m[1]), val(m[2])]
    if (a === undefined || b === undefined) throw new Error(`unknown context in: ${clause}`)
    return a === b
  })
}
const J = jobs()

test('manual dispatch only, with the project reference as its only input', () => {
  const on = wf.slice(wf.indexOf('\non:'), wf.indexOf('\npermissions:'))
  assert.match(on, /^\non:\n {2}workflow_dispatch:\n {4}inputs:\n {6}confirm_project_ref:\n/)
  assert.deepEqual([...on.matchAll(/^ {6}([a-z_]+):$/gm)].map((m) => m[1]), ['confirm_project_ref'], 'no other input (no mode, no phrase)')
  assert.ok(!/^ {2}(push|pull_request|schedule|workflow_run|workflow_call|repository_dispatch):/m.test(on), 'no other trigger')
  assert.match(wf, /^ {2}EXPECTED_PROJECT_REF: kpudeppgokpjhvaqrprn$/m)
})

test('one job, in the staging environment, read-only token, sharing the database deploy queue', () => {
  assert.deepEqual(Object.keys(J), ['check'])
  assert.equal(key(J.check, 'environment'), 'staging')
  assert.match(wf, /^permissions:\n {2}contents: read\n\n/m)
  assert.equal((wf.match(/^\s*permissions:/gm) ?? []).length, 1, 'no job widens the token')
  assert.match(wf, /^concurrency:\n {2}group: deploy-database-staging\n {2}cancel-in-progress: false$/m)
  for (const env of ['PGSSLMODE: verify-full', 'PGSSLROOTCERT: ${{ github.workspace }}/config/certs/supabase-root-2021-ca.crt', "REQUIRE_VERIFY_FULL: '1'"]) {
    assert.ok(J.check.includes(`      ${env}`), `job env ${env}`)
  }
})

test('only the owner may start or re-run it, and only from main', () => {
  const OWNER = 'muyiwaomosa'
  const run = (over) => ({ ref: 'refs/heads/main', repository_owner: OWNER, actor: OWNER, triggering_actor: OWNER, ...over })
  const cond = key(J.check, 'if')
  assert.ok(cond, 'the job has no condition')
  for (const [what, ctx, want] of [
    ['the owner starts it from main', run({}), true],
    ['the owner starts it from another branch', run({ ref: 'refs/heads/claude/x' }), false],
    ['the owner starts it from a tag', run({ ref: 'refs/tags/v1' }), false],
    ['a collaborator starts it', run({ actor: 'collaborator', triggering_actor: 'collaborator' }), false],
    ["a collaborator re-runs the owner's run", run({ triggering_actor: 'collaborator' }), false],
    ['a bot re-runs it', run({ triggering_actor: 'github-actions[bot]' }), false],
  ]) assert.equal(evaluate(cond, ctx), want, what)
  // The wrapper also refuses outside main, through the shared guard it calls.
  assert.match(wrapper, /^\. scripts\/db\/staging-photo-cleanup-lib\.sh$/m, 'the wrapper sources the shared guards')
  assert.match(code(wrapper), GUARD_CALL, 'the wrapper calls the shared guard')
  assert.match(libFunction('guard'), /\[ "\$\{GITHUB_REF:-\}" = refs\/heads\/main \] \|\| fail/, 'the shared guard refuses outside main')
})

test('steps: checkout, the staging target check, then the wrapper; nothing conditional or allowed to fail', () => {
  const s = steps(J.check)
  assert.equal(s.length, 3)
  assert.equal(s[0].uses, 'actions/checkout@v4')
  assert.equal(s[1].run, 'scripts/db/verify-staging-target.sh')
  assert.equal(s[2].run, WRAPPER_PATH)
  for (const step of s) {
    assert.ok(!step.keys.includes('if') && !step.keys.includes('continue-on-error'), `${step.name ?? step.uses}: no if or continue-on-error`)
  }
  for (const step of s.slice(1)) {
    assert.equal(step.env.STAGING_DATABASE_URL, '${{ secrets.STAGING_DATABASE_URL }}')
    assert.equal(step.env.SUPABASE_PROJECT_REF, '${{ vars.SUPABASE_PROJECT_REF }}')
    assert.equal(step.env.CONFIRM_PROJECT_REF, '${{ inputs.confirm_project_ref }}')
  }
  assert.ok(!/continue-on-error/.test(wf))
})

test('only the STAGING_DATABASE_URL secret and the SUPABASE_PROJECT_REF variable', () => {
  assert.deepEqual([...new Set([...wf.matchAll(/secrets\.([A-Za-z_]+)/g)].map((m) => m[1]))], ['STAGING_DATABASE_URL'])
  assert.deepEqual([...new Set([...wf.matchAll(/vars\.([A-Za-z_]+)/g)].map((m) => m[1]))], ['SUPABASE_PROJECT_REF'])
  assert.ok(!/secrets\s*:\s*inherit|toJSON\(secrets\)/.test(wf))
})

test('check mode only: no apply, remove or pg_net removal is reachable', () => {
  const c = code(wrapper)
  const psql = c.split('\n').filter((l) => /\bpsql\b/.test(l) && /-f\b/.test(l))
  assert.equal(psql.length, 1, 'exactly one psql run of a file')
  assert.match(psql[0], /psql "\$STAGING_DATABASE_URL" -X -q -v ON_ERROR_STOP=1 -v mode=check -v confirm= -f "\$SCRIPT"/)
  assert.match(c, /^SCRIPT=scripts\/db\/staging-schedule-media-drain\.sql$/m, 'the script path is fixed')
  assert.match(c, GUARD_CALL, 'the argument count goes to the shared guard')
  assert.match(libFunction('guard'), /^ {2}\[ "\$1" -eq 0 \] \|\| fail/m, 'arguments are refused')
  // The shared guards are sourced into the wrapper, so they are held to the same rules.
  for (const [name, t] of [['workflow', code(wf)], ['wrapper', c], ['shared guards', code(lib)]]) {
    for (const bad of [/mode=(apply|remove)/, /SCHEDULE THE STAGING PHOTO CLEANUP/, /staging-remove-pg-net/, /REMOVE PG_NET/i, /drop extension/i, /cron\.(schedule|unschedule|alter_job)/, /\$\{?(MODE|CONFIRM|mode|confirm)\b/]) {
      assert.ok(!bad.test(t), `${name} must not contain ${bad}`)
    }
  }
  assert.ok(!/SCHEDULE_CHECK_(LOCAL_TEST|EPOCH|SLEEP)/.test(wf), 'the workflow never sets the local test settings')
})

test('the pinned checksum is the reviewed scheduler script, and the wrapper checks it before connecting', () => {
  const pinned = /^SCRIPT_SHA256=([0-9a-f]{64})$/m.exec(wrapper)?.[1]
  assert.ok(pinned, 'no pinned checksum')
  assert.equal(createHash('sha256').update(readFileSync(new URL(`../${SCRIPT_PATH}`, import.meta.url))).digest('hex'), pinned)
  // The wrapper calls the shared guard before anything that connects.
  const c = code(wrapper)
  const guardAt = c.search(GUARD_CALL)
  for (const [what, re] of [['the first wait', /^boundary_wait$/m], ['the first fingerprint', /\$\(fingerprint\)/], ['the check itself', /psql "\$STAGING_DATABASE_URL"/]]) {
    assert.ok(guardAt > 0 && c.search(re) > guardAt, `the guard comes before ${what}`)
  }
  assert.ok(!/^PSQL=|\bq "/m.test(c.slice(0, guardAt)), 'nothing connects before the guard')
  // Inside the guard, every check comes before the connection is set up.
  const g = libFunction('guard')
  const at = (re) => g.search(re)
  const firstConnect = at(/^ {2}PSQL=\(psql/m)
  assert.ok(firstConnect > 0, 'the guard sets up the connection last')
  for (const [what, re] of [
    ['the argument check', /\[ "\$1" -eq 0 \] \|\| fail/],
    ['the branch check', /refs\/heads\/main \] \|\| fail/],
    ['the checksum check', /\[ "\$actual" = "\$3" \] \|\| fail/],
    ['the connection string check', /\[ -n "\$\{STAGING_DATABASE_URL:-\}" \] \|\| fail/],
    ['the TLS check', /\[ "\$\{PGSSLMODE:-\}" = verify-full \]/],
    ['the target check', /scripts\/db\/verify-staging-target\.sh \|\| fail/],
  ]) {
    assert.ok(at(re) >= 0 && at(re) < firstConnect, `${what} comes before any connection`)
  }
  assert.match(g, /actual=\$\(sha256sum "\$2" \| cut -d' ' -f1\)/, 'the checksum is of the script the wrapper names')
})

test('it prints no secret: commands as md5 only, and never the connection string', () => {
  const c = code(wrapper)
  // What it prints from the database: the fingerprint (shared), the in-progress count and the script's own output.
  assert.match(c, /\$\(fingerprint\)/)
  assert.ok(!/\bcommand\b/.test(c), 'the wrapper itself never reads a cron command')
  assert.match(libFunction('fingerprint'), /q "\$FINGERPRINT_SQL"/)
  const f = fingerprintSql()
  assert.match(f, /pg_catalog\.md5\(j\.command\)/)
  const uses = (f.match(/\bcommand\b/g) ?? []).length
  assert.ok(uses > 0 && (f.match(/md5\(j\.command\)|j\.command ~/g) ?? []).length === uses, 'a cron command is only ever hashed or matched, never selected')
  assert.match(libFunction('running'), /select count\(\*\) from cron\.job_run_details/, 'the in-progress check only counts runs')
  for (const [name, t] of [['wrapper', c], ['shared guards', code(lib)]]) {
    assert.ok(!/decrypted_secret|vault\./i.test(t), `the ${name} never read Vault`)
    assert.ok(!/(echo|printf)[^\n]*STAGING_DATABASE_URL/.test(t), `the ${name} never echo the connection string`)
    assert.ok(!/set -x|xtrace/.test(t), `no command tracing in the ${name}`)
  }
  assert.match(libFunction('q'), /begin read only; \$1; rollback;/, 'every read is in a read-only transaction')
})

test('nothing for Production, the public site, the demo or the member app', () => {
  const c = code(wf) + '\n' + code(wrapper) + '\n' + code(lib)
  for (const bad of [/PRODUCTION/i, /hmrliwoychnqrbbydorg/, /vercel/i, /\bsupabase (db|functions|link|migration)\b/, /npm (ci|install|run)/, /git push/, /\bdemo\b/i, /deploy-db-production/, /contents: write/]) {
    assert.ok(!bad.test(c), `must not contain ${bad}`)
  }
})

test('no other workflow runs this check wrapper or the scheduler script directly', () => {
  // The apply workflow (staging-photo-cleanup-schedule.yml) runs the scheduler
  // script only through its own wrapper, tested in photo-cleanup-workflows.test.mjs.
  const files = execFileSync('git', ['ls-files', '.github/workflows'], { encoding: 'utf8' }).split('\n').filter(Boolean)
  const users = files.filter((f) => /staging-schedule-check\.sh|staging-schedule-media-drain\.sql/.test(readFileSync(f, 'utf8')))
  assert.deepEqual(users, [WF_PATH])
})
