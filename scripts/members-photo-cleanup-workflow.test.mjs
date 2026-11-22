// Guards for the "Photo cleanup schedule on member Production" workflow
// (node --test, run by npm test). They read the workflow, wrapper and SQL
// script themselves. Behaviour against a database is tested by
// scripts/db/members-photo-cleanup-test.sh.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8')
const code = (t) => t.split('\n').filter((l) => !/^\s*(#|--)/.test(l)).join('\n')
const WF_PATH = '.github/workflows/members-photo-cleanup.yml'
const WRAPPER_PATH = 'scripts/db/members-photo-cleanup.sh'
const SQL_PATH = 'scripts/db/members-schedule-media-drain.sql'
const wf = read(WF_PATH)
const wrapper = read(WRAPPER_PATH)
const sql = read(SQL_PATH)
const MEMBER_REF = JSON.parse(read('config/supabase-projects.json')).memberProduction.ref
const STAGING_REF = JSON.parse(read('config/supabase-projects.json')).staging.ref

function evaluate(expr, github) {
  return expr.split('&&').every((clause) => {
    const m = /^\s*(github\.[a-z_]+|'[^']*')\s*==\s*(github\.[a-z_]+|'[^']*')\s*$/.exec(clause)
    if (!m) throw new Error(`unsupported condition: ${clause}`)
    const val = (t) => (t.startsWith("'") ? t.slice(1, -1) : github[t.slice('github.'.length)])
    return val(m[1]) === val(m[2])
  })
}

test('manual dispatch only: mode, reviewed commit, project reference and phrase; four modes, verify by default', () => {
  const on = wf.slice(wf.indexOf('\non:'), wf.indexOf('\npermissions:'))
  assert.match(on, /^\non:\n {2}workflow_dispatch:\n {4}inputs:\n/)
  assert.deepEqual([...on.matchAll(/^ {6}([a-z_]+):$/gm)].map((m) => m[1]), ['mode', 'expected_commit', 'confirm_project_ref', 'confirm_phrase'])
  assert.deepEqual([...on.matchAll(/^ {10}- ([a-z-]+)$/gm)].map((m) => m[1]), ['verify', 'check', 'apply', 'remove'])
  assert.match(on, /default: verify\n/)
  assert.ok(code(wrapper).includes('case "$MODE" in verify|check|apply|remove) ;;'))
})

test('owner only, main only; read-only token; the member database queue; verify-full in every job', () => {
  const OWNER = 'muyiwaomosa'
  const conds = [...wf.matchAll(/^ {4}if: (.*)$/gm)].map((m) => m[1])
  assert.equal(conds.length, 2, 'both jobs are guarded')
  const run = (over) => ({ ref: 'refs/heads/main', repository_owner: OWNER, actor: OWNER, triggering_actor: OWNER, ...over })
  for (const cond of conds) {
    for (const [what, ctx, want] of [
      ['the owner from main', run({}), true],
      ['the owner from another branch', run({ ref: 'refs/heads/claude/x' }), false],
      ['a collaborator', run({ actor: 'c', triggering_actor: 'c' }), false],
      ["a collaborator re-running the owner's run", run({ triggering_actor: 'c' }), false],
    ]) assert.equal(evaluate(cond, ctx), want, what)
  }
  assert.match(wf, /^permissions:\n {2}contents: read\n\n/m)
  assert.equal((wf.match(/^\s*permissions:/gm) ?? []).length, 1)
  assert.match(wf, /^concurrency:\n {2}group: deploy-database-members-production\n {2}cancel-in-progress: false$/m)
  assert.equal((wf.match(/^ {6}PGSSLMODE: verify-full$/gm) ?? []).length, 2)
  assert.equal((wf.match(/^ {6}REQUIRE_VERIFY_FULL: '1'$/gm) ?? []).length, 2)
})

test('the environment holds the credentials; target, then identity marker, then the wrapper; inputs only through env', () => {
  assert.equal((wf.match(/^ {4}environment: members-production$/gm) ?? []).length, 1)
  assert.match(wf, /^ {2}schedule:\n(?:.*\n)*? {4}needs: secret-scope$/m)
  const runs = [...wf.matchAll(/^ {8}run: (scripts\/\S+)$/gm)].map((m) => m[1])
  assert.deepEqual(runs, ['scripts/db/verify-members-target.sh', 'scripts/db/verify-members-identity.sh', WRAPPER_PATH])
  assert.ok(!/run: [^\n]*\$\{\{/.test(wf), 'no input is expanded inside a shell script')
  assert.ok(!/^ {8}(if|continue-on-error):/m.test(wf), 'no step is conditional or allowed to fail')
  assert.deepEqual([...new Set([...wf.matchAll(/secrets\.([A-Za-z_]+)/g)].map((m) => m[1]))].sort(), ['MEMBERS_DB_IDENTITY_MARKER', 'MEMBERS_PRODUCTION_DATABASE_URL'])
  assert.deepEqual([...new Set([...wf.matchAll(/vars\.([A-Za-z_]+)/g)].map((m) => m[1]))], ['MEMBERS_PROJECT_REF'])
  assert.ok(!/SCHEDULE_(CHECK|TEST)_/.test(wf), 'the workflow never sets the local test settings')
  assert.match(wf, /\[ "\$EXPECTED_COMMIT" = "\$RUN_COMMIT" \]/, 'runs only at the reviewed commit')
})

test('the wrapper pins the reviewed SQL script and checks the phrases before connecting', () => {
  assert.equal(/^SCRIPT_SHA256=([0-9a-f]{64})$/m.exec(wrapper)?.[1], createHash('sha256').update(readFileSync(new URL(`../${SQL_PATH}`, import.meta.url))).digest('hex'))
  assert.match(code(wrapper), /^SCRIPT=scripts\/db\/members-schedule-media-drain\.sql$/m)
  const guardAt = wrapper.search(/^members_guard \$#$/m)
  assert.ok(guardAt > 0)
  for (const [mode, phrase] of [['apply', 'SCHEDULE THE MEMBER PRODUCTION PHOTO CLEANUP'], ['remove', 'UNSCHEDULE THE MEMBER PRODUCTION PHOTO CLEANUP']]) {
    assert.ok(wrapper.includes(`='${phrase}'`))
    const at = wrapper.search(new RegExp(`\\[ "\\$MODE" != ${mode} \\] \\|\\| \\[ "\\$\\{CONFIRM_PHRASE:-\\}" = `))
    assert.ok(at > 0 && at < guardAt, `${mode} needs its phrase, checked before connecting`)
    assert.ok(sql.includes(`'${phrase}'`), `the SQL script requires the same ${mode} phrase`)
  }
  assert.match(wrapper, /scripts\/db\/verify-members-target\.sh \|\| fail/, 'the wrapper re-checks the member target itself')
})

test('the SQL script targets only the member project, never staging, and refuses pg_net', () => {
  assert.equal(MEMBER_REF, 'brfdqkondnnzsguailcc')
  const c = code(sql)
  assert.ok(c.includes(`\\set drain_url 'https://${MEMBER_REF}.supabase.co/functions/v1/post-media/drain'`))
  assert.ok(c.includes(`'^(https://${MEMBER_REF}\\.supabase\\.co|http://(kong|127\\.0\\.0\\.1|localhost|host\\.docker\\.internal)(:\\d+)?)/functions/v1/post-media/drain$'`))
  assert.ok(!c.includes(STAGING_REF) && !/STAGING/.test(c), 'nothing for staging')
  assert.match(c, /refused: pg_net is installed here/)
  assert.ok(!/create extension[^\n]*pg_net|net\.http_post\(/i.test(c), 'never installs or uses pg_net')
  assert.match(c, /version = '20261127000000'/)
  assert.match(c, /version = '20261129000000'/)
})

test('never turns photos on, never prints a secret, nothing for the waitlist, Vercel or the app', () => {
  const all = code(wf) + '\n' + code(wrapper) + '\n' + code(sql)
  for (const bad of [/photos_enabled|set_media_settings|set_photo_audience/, /hmrliwoychnqrbbydorg/, /vercel/i, /\bsupabase (db|functions|link|migration)\b/, /npm (ci|install|run)/, /git push/, /contents: write/]) {
    assert.ok(!bad.test(all), `must not contain ${bad}`)
  }
  const w = code(wrapper)
  assert.ok(!/decrypted_secret|vault\.|media_drain_key/i.test(w), 'the wrapper never reads Vault')
  assert.ok(!/(echo|printf)[^\n]*MEMBERS_PRODUCTION_DATABASE_URL/.test(w))
  assert.ok(!/set -x|xtrace/.test(w))
})

test('only this workflow runs the member wrapper, and nothing else runs the member SQL script', () => {
  const files = execFileSync('git', ['ls-files', '.github/workflows', 'scripts'], { encoding: 'utf8' }).split('\n').filter(Boolean)
  const users = (re) => files.filter((f) => !/\.test\.mjs$|-test\.sh$/.test(f) && re.test(code(readFileSync(f, 'utf8'))))
  assert.deepEqual(users(/members-photo-cleanup\.sh/), [WF_PATH])
  assert.deepEqual(users(/members-schedule-media-drain\.sql/), [WRAPPER_PATH])
})
