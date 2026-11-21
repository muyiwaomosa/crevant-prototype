// Guards for the "Photo cleanup schedule on staging" and "Remove pg_net from
// staging" workflows (node --test, run by npm test). They read the workflows
// and wrappers themselves, and fail if the structure can't be found. The
// wrappers' behaviour against a database is tested by
// scripts/db/staging-photo-cleanup-test.sh.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8')
const code = (t) => t.split('\n').filter((l) => !/^\s*#/.test(l)).join('\n')
const sha = (p) => createHash('sha256').update(readFileSync(new URL(`../${p}`, import.meta.url))).digest('hex')
const LIB = read('scripts/db/staging-photo-cleanup-lib.sh')

const FLOWS = {
  schedule: {
    wf: '.github/workflows/staging-photo-cleanup-schedule.yml',
    job: 'schedule',
    wrapper: 'scripts/db/staging-photo-cleanup.sh',
    sql: 'scripts/db/staging-schedule-media-drain.sql',
    modes: ['verify', 'apply', 'remove'],
    phrases: { apply: 'SCHEDULE THE STAGING PHOTO CLEANUP', remove: 'UNSCHEDULE THE STAGING PHOTO CLEANUP' },
    timeout: '30',
  },
  removal: {
    wf: '.github/workflows/staging-remove-pg-net.yml',
    job: 'remove-pg-net',
    wrapper: 'scripts/db/staging-pgnet-removal.sh',
    sql: 'scripts/db/staging-remove-pg-net.sql',
    modes: ['check', 'apply'],
    phrases: { apply: 'REMOVE PG_NET FROM STAGING' },
    timeout: '10',
  },
}

function jobs(text) {
  const lines = text.split('\n')
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

for (const [label, f] of Object.entries(FLOWS)) {
  const wf = read(f.wf)
  const wrapper = read(f.wrapper)
  const J = jobs(wf)

  test(`${label}: manual dispatch only; inputs are the mode, the project ref and the phrase`, () => {
    const on = wf.slice(wf.indexOf('\non:'), wf.indexOf('\npermissions:'))
    assert.match(on, /^\non:\n {2}workflow_dispatch:\n {4}inputs:\n/)
    assert.deepEqual([...on.matchAll(/^ {6}([a-z_]+):$/gm)].map((m) => m[1]), ['mode', 'confirm_project_ref', 'confirm_phrase'])
    assert.deepEqual([...on.matchAll(/^ {10}- ([a-z-]+)$/gm)].map((m) => m[1]), f.modes, 'the modes, nothing else')
    assert.match(on, new RegExp(`default: ${f.modes[0]}\\n`), `defaults to ${f.modes[0]}`)
    assert.ok(!/restore[-_ ]?previous/i.test(wf + wrapper), 'no restore mode')
    assert.ok(code(wrapper).includes(`case "$MODE" in ${f.modes.join('|')}) ;;`), 'the wrapper accepts exactly these modes')
    assert.match(wf, /^ {2}EXPECTED_PROJECT_REF: kpudeppgokpjhvaqrprn$/m)
  })

  test(`${label}: one job, staging environment, read-only token, the database deploy queue, verify-full TLS`, () => {
    assert.deepEqual(Object.keys(J), [f.job])
    const job = J[f.job]
    assert.equal(key(job, 'environment'), 'staging')
    assert.equal(key(job, 'timeout-minutes'), f.timeout)
    assert.match(wf, /^permissions:\n {2}contents: read\n\n/m)
    assert.equal((wf.match(/^\s*permissions:/gm) ?? []).length, 1)
    assert.match(wf, /^concurrency:\n {2}group: deploy-database-staging\n {2}cancel-in-progress: false$/m)
    for (const env of ['PGSSLMODE: verify-full', 'PGSSLROOTCERT: ${{ github.workspace }}/config/certs/supabase-root-2021-ca.crt', "REQUIRE_VERIFY_FULL: '1'"]) {
      assert.ok(job.includes(`      ${env}`), `job env ${env}`)
    }
  })

  test(`${label}: only the owner may start or re-run it, and only from main`, () => {
    const OWNER = 'muyiwaomosa'
    const run = (over) => ({ ref: 'refs/heads/main', repository_owner: OWNER, actor: OWNER, triggering_actor: OWNER, ...over })
    const cond = key(J[f.job], 'if')
    assert.ok(cond)
    for (const [what, ctx, want] of [
      ['the owner from main', run({}), true],
      ['the owner from another branch', run({ ref: 'refs/heads/claude/x' }), false],
      ['a collaborator', run({ actor: 'c', triggering_actor: 'c' }), false],
      ["a collaborator re-running the owner's run", run({ triggering_actor: 'c' }), false],
      ['a bot re-running it', run({ triggering_actor: 'github-actions[bot]' }), false],
    ]) assert.equal(evaluate(cond, ctx), want, what)
  })

  test(`${label}: checkout, the staging target check, then the wrapper; nothing conditional; inputs only through env`, () => {
    const s = steps(J[f.job])
    assert.equal(s.length, 3)
    assert.equal(s[0].uses, 'actions/checkout@v4')
    assert.equal(s[1].run, 'scripts/db/verify-staging-target.sh')
    assert.equal(s[2].run, f.wrapper)
    for (const step of s) assert.ok(!step.keys.includes('if') && !step.keys.includes('continue-on-error'))
    assert.equal(s[2].env.MODE, '${{ inputs.mode }}')
    assert.equal(s[2].env.CONFIRM_PHRASE, '${{ inputs.confirm_phrase }}')
    for (const step of s.slice(1)) {
      assert.equal(step.env.STAGING_DATABASE_URL, '${{ secrets.STAGING_DATABASE_URL }}')
      assert.equal(step.env.CONFIRM_PROJECT_REF, '${{ inputs.confirm_project_ref }}')
    }
    // No input is ever expanded inside a shell script (only passed as env).
    assert.ok(!/run: [^\n]*\$\{\{/.test(wf))
  })

  test(`${label}: only the STAGING_DATABASE_URL secret and the SUPABASE_PROJECT_REF variable; no test settings`, () => {
    assert.deepEqual([...new Set([...wf.matchAll(/secrets\.([A-Za-z_]+)/g)].map((m) => m[1]))], ['STAGING_DATABASE_URL'])
    assert.deepEqual([...new Set([...wf.matchAll(/vars\.([A-Za-z_]+)/g)].map((m) => m[1]))], ['SUPABASE_PROJECT_REF'])
    assert.ok(!/SCHEDULE_(CHECK|TEST)_/.test(wf), 'the workflow never sets the local test settings')
  })

  test(`${label}: the wrapper pins the reviewed SQL script, checks it and the phrase before connecting`, () => {
    assert.equal(/^SCRIPT_SHA256=([0-9a-f]{64})$/m.exec(wrapper)?.[1], sha(f.sql))
    assert.match(code(wrapper), new RegExp(`^SCRIPT=${f.sql.replace(/[.]/g, '\\.')}$`, 'm'))
    const guardAt = wrapper.search(/^guard \$# "\$SCRIPT" "\$SCRIPT_SHA256"$/m)
    assert.ok(guardAt > 0, 'the wrapper runs the shared guard')
    for (const [mode, phrase] of Object.entries(f.phrases)) {
      assert.ok(wrapper.includes(`='${phrase}'`), `${mode} phrase`)
      const check = wrapper.search(new RegExp(`\\[ "\\$MODE" != ${mode} \\] \\|\\| \\[ "\\$\\{CONFIRM_PHRASE:-\\}" = `))
      assert.ok(check > 0 && check < guardAt, `${mode} needs its phrase, checked before connecting`)
    }
  })

  test(`${label}: never prints a secret`, () => {
    const c = code(wrapper) + '\n' + code(LIB)
    assert.ok(!/decrypted_secret|vault\.|media_drain_key/i.test(c), 'never reads Vault')
    assert.ok(!/(echo|printf)[^\n]*STAGING_DATABASE_URL/.test(c))
    assert.ok(!/set -x|xtrace/.test(c))
    assert.ok(!/return_message\s*(\|\||,|$)/m.test(c), 'a run error is only ever classified, never printed')
  })

  test(`${label}: nothing for Production, the public site, the demo or the member app`, () => {
    const c = code(wf) + '\n' + code(wrapper) + '\n' + code(LIB)
    for (const bad of [/PRODUCTION/i, /hmrliwoychnqrbbydorg/, /vercel/i, /\bsupabase (db|functions|link|migration)\b/, /npm (ci|install|run)/, /git push/, /\bdemo\b/i, /deploy-db-production/, /contents: write/, /photos_enabled|set_media_settings/]) {
      assert.ok(!bad.test(c), `must not contain ${bad}`)
    }
  })
}

test('the schedule workflow can never remove pg_net, and the removal workflow never schedules', () => {
  const a = code(read(FLOWS.schedule.wrapper))
  const b = code(read(FLOWS.removal.wrapper))
  assert.ok(!/staging-remove-pg-net|drop extension|REMOVE PG_NET/i.test(a), 'the schedule wrapper has no way to remove pg_net')
  assert.ok(!/staging-schedule-media-drain|cron\.(schedule|unschedule|alter_job)/.test(b), 'the removal wrapper never changes a cron job')
  // The only cron change the schedule wrapper makes itself is the local test interval.
  const alters = a.split('\n').filter((l) => /cron\.alter_job/.test(l))
  assert.equal(alters.length, 2)
  for (const l of alters) assert.match(l, /^\s*(\[ -n "\$interval" \] && )?"\$\{PSQL\[@\]\}" -c "select cron\.alter_job\(\$NEWID/)
  assert.match(a, /interval=\$\(local_setting SCHEDULE_TEST_INTERVAL\)\nif \[ -n "\$interval" \]; then/)
  assert.match(LIB, /local_setting\(\) \{ if \[ "\$LOCAL_TEST" = true \]; then/)
})

test('a committed but unverified apply says so, and never claims a rollback', () => {
  const a = read(FLOWS.schedule.wrapper)
  assert.match(a, /INSTALLED BUT UNVERIFIED: the http cleanup job is COMMITTED and scheduled \(not rolled back\)/)
  assert.match(a, /INSTALLED BUT NOT AS EXPECTED: the replacement COMMITTED \(it is not rolled back\)/)
})

test('the removal gate: two consecutive verified runs, no failed or unmatched run, every pass attributed', () => {
  const b = read(FLOWS.removal.wrapper)
  assert.match(b, /\[ "\$VERIFIED_IN_A_ROW" -ge 2 \]/)
  assert.match(b, /\[ "\$FAILED_RUNS" = 0 \]/)
  assert.match(b, /\[ "\$UNMATCHED_OK_RUNS" = 0 \]/)
  assert.match(b, /\[ "\$UNATTRIBUTED" = 0 \]/)
  // A run is verified only with exactly one matching pass from the drain function.
  assert.match(LIB, /if \[ "\$status" = succeeded \] && \[ "\$matched" = 1 \]; then/)
  assert.match(LIB, /m\.source = 'scheduled' and m\.finished_at between r\.start_time and r\.end_time/)
})

test('only these two workflows run their wrappers', () => {
  const files = execFileSync('git', ['ls-files', '.github/workflows'], { encoding: 'utf8' }).split('\n').filter(Boolean)
  for (const f of Object.values(FLOWS)) {
    const name = f.wrapper.split('/').pop().replace('.', '\\.')
    assert.deepEqual(files.filter((p) => new RegExp(name).test(readFileSync(p, 'utf8'))), [f.wf])
  }
})

test('recovery: apply on an installed http job only passes its verification, and a paused cleanup gets a fresh http job', () => {
  const raw = read(FLOWS.schedule.wrapper)
  const a = code(raw)
  const from = raw.indexOf('if [ "$METHOD" = http ]; then\n  # Never replaces')
  assert.ok(from > 0, 'the already-applied branch is where expected')
  const already = code(raw.slice(from, raw.indexOf('# Two starting points only')))
  assert.match(already, /http_verdict\n {2}exit 0\nfi/, 'already applied succeeds only through the verify verdict')
  assert.match(a, /if \[ "\$JOBS" = 0 \]; then\n {2}echo "No cleanup job is scheduled \(paused\): apply installs a fresh http job\."/)
  // apply never brings back pg_net or the old scheduler, and never removes pg_net either.
  assert.ok(!/net\.http_post|create extension[^\n]*pg_net/i.test(a), 'nothing in the schedule wrapper can recreate the old pg_net job or pg_net')
  assert.match(a, /grep -c '\^extension\|pg_net\|' <<<"\$before"\)" = "\$\(grep -c '\^extension\|pg_net\|' <<<"\$after"\)"/, 'pg_net presence must be unchanged by apply')
})

test('attribution: runs under an altered command fail closed, and the removal scan covers any net. reference', () => {
  assert.match(LIB, /d\.command is distinct from j\.command/)
  assert.match(LIB, /UNATTRIBUTED=\$\(\(UNATTRIBUTED \+ altered\)\)/)
  const sql = read(FLOWS.removal.sql)
  assert.match(sql, /where p\.prosrc ~ '\\mnet\\\.\[_a-z\]'/, 'function bodies are scanned for any net. reference, not only net.http_')
  assert.match(sql, /command ~ '\\mnet\\\.'/, 'cron jobs are scanned for any net. reference')
})
