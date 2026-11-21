// Tests for scripts/functions/deploy.mjs (Phase 1B-2), on a throwaway git
// repository with its own "origin", and fake `supabase` and `gh` commands
// that record every call. Nothing here reaches a real project or GitHub.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync, spawnSync } from 'node:child_process'
import { chmodSync, cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { checkDbRun, checkProjectIdentity, checkVerifyRun, phraseFor, targetProject } from './functions/deploy.mjs'
import { ledgerProblems } from './functions/ledger.mjs'

const SRC = new URL('..', import.meta.url).pathname
const MEMBER = 'membersprodtestrefab'
const STAGING = 'kpudeppgokpjhvaqrprn'
const WAITLIST = 'hmrliwoychnqrbbydorg'
const sh = (cwd, cmd, args) => execFileSync(cmd, args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim()

const FAKE_SUPABASE = `#!/usr/bin/env node
const fs = require('fs'), path = require('path')
const st = JSON.parse(fs.readFileSync(process.env.FAKE_STATE, 'utf8'))
const a = process.argv.slice(2)
fs.appendFileSync(process.env.FAKE_LOG, JSON.stringify(['supabase', ...a]) + '\\n')
const save = () => fs.writeFileSync(process.env.FAKE_STATE, JSON.stringify(st))
const opt = (k) => { const i = a.indexOf(k); return i < 0 ? null : a[i + 1] }
if (a[0] === '--version') { console.log(st.version); process.exit(0) }
if (a[0] === 'projects' && a[1] === 'list') { console.log(JSON.stringify(st.projects)); process.exit(0) }
const ref = opt('--project-ref')
const fns = (st.functions[ref] = st.functions[ref] || [])
if (a[0] === 'functions' && a[1] === 'list') { console.log(JSON.stringify(fns)); process.exit(0) }
if (a[0] === 'functions' && a[1] === 'deploy') {
  if (st.deploy === 'fail') { console.error('deploy failed'); process.exit(1) }
  const name = a[2], wd = opt('--workdir')
  st.lastBuild = fs.readFileSync(path.join(wd, 'supabase/functions/_shared/build-info.ts'), 'utf8')
  fs.cpSync(path.join(wd, 'supabase/functions'), path.join(process.env.FAKE_DIR, 'deployed', ref, 'functions'), { recursive: true })
  let f = fns.find((x) => x.slug === name)
  if (!f) { f = { slug: name, name, version: 0, status: 'ACTIVE', verify_jwt: false }; fns.push(f) }
  if (st.deploy !== 'no-bump') f.version += 1
  f.ezbr_sha256 = 'b'.repeat(64)
  if (st.deploy === 'jwt-on') f.verify_jwt = true
  if (st.deploy === 'extra') fns.push({ slug: 'join-waitlist', name: 'join-waitlist', version: 1, status: 'ACTIVE', verify_jwt: false })
  save(); process.exit(0)
}
if (a[0] === 'functions' && a[1] === 'download') {
  if (st.download === 'unsupported') { console.error('not supported'); process.exit(1) }
  const wd = opt('--workdir'), name = a[2]
  const from = path.join(process.env.FAKE_DIR, 'deployed', ref, 'functions')
  for (const d of [name, '_shared']) fs.cpSync(path.join(from, d), path.join(wd, 'supabase/functions', d), { recursive: true })
  if (st.download === 'differs') fs.appendFileSync(path.join(wd, 'supabase/functions', name, 'index.ts'), '\\n// changed\\n')
  process.exit(0)
}
if (a[0] === 'functions' && a[1] === 'delete') {
  if (st.delete !== 'stuck') st.functions[ref] = fns.filter((x) => x.slug !== a[2])
  save(); process.exit(0)
}
console.error('unexpected call'); process.exit(2)
`
const FAKE_GH = `#!/usr/bin/env node
const fs = require('fs')
const st = JSON.parse(fs.readFileSync(process.env.FAKE_STATE, 'utf8'))
const a = process.argv.slice(2)
fs.appendFileSync(process.env.FAKE_LOG, JSON.stringify(['gh', ...a]) + '\\n')
if (a[0] === 'api' && st.gh[a[1]] !== undefined) { console.log(JSON.stringify(st.gh[a[1]])); process.exit(0) }
console.error('HTTP 404'); process.exit(1)
`

/** A throwaway repository: main has (optionally) a member Production config; returns helpers. */
function setup({ member = true, postMediaApproved = false } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'fn-deploy-test-'))
  const repo = join(dir, 'repo')
  for (const p of ['scripts/functions', 'scripts/supabase-projects.mjs', 'config', 'supabase/functions', 'supabase/config.toml', '.github/workflows/deploy-db-staging.yml', 'docs/function-evidence-log.md']) {
    cpSync(join(SRC, p), join(repo, p), { recursive: true })
  }
  rmSync(join(repo, 'supabase/functions/_shared/policy.test.ts'), { force: true })
  const g = (...a) => sh(repo, 'git', a)
  g('init', '-q', '-b', 'main')
  g('config', 'user.email', 'test@example.test'); g('config', 'user.name', 'test')
  g('add', '-A'); g('commit', '-q', '-m', 'base')
  if (member || postMediaApproved) {
    const p = JSON.parse(readFileSync(join(repo, 'config/supabase-projects.json'), 'utf8'))
    if (member) p.memberProduction = { ref: MEMBER, name: 'splitpost-members-production', region: 'ca-central-1' }
    writeFileSync(join(repo, 'config/supabase-projects.json'), JSON.stringify(p, null, 2) + '\n')
    const m = JSON.parse(readFileSync(join(repo, 'config/member-production.json'), 'utf8'))
    m.postMediaFunctionApproved = postMediaApproved
    writeFileSync(join(repo, 'config/member-production.json'), JSON.stringify(m, null, 2) + '\n')
    sh(repo, 'node', ['scripts/functions/projects-sync.mjs', '--write'])
    g('add', '-A'); g('commit', '-q', '-m', 'member config')
  }
  sh(dir, 'git', ['clone', '-q', '--bare', repo, join(dir, 'origin.git')])
  g('remote', 'add', 'origin', join(dir, 'origin.git'))
  g('fetch', '-q', 'origin')
  const bin = join(dir, 'bin')
  mkdirSync(bin)
  writeFileSync(join(bin, 'supabase'), FAKE_SUPABASE); chmodSync(join(bin, 'supabase'), 0o755)
  writeFileSync(join(bin, 'gh'), FAKE_GH); chmodSync(join(bin, 'gh'), 0o755)
  const head = () => g('rev-parse', 'HEAD')
  const state = (patch = {}) => {
    const commit = head()
    const s = {
      version: '2.122.1',
      projects: [
        { id: STAGING, ref: STAGING, name: 'staging-project', region: 'us-west-2' },
        { id: MEMBER, ref: MEMBER, name: 'splitpost-members-production', region: 'ca-central-1' },
        { id: WAITLIST, ref: WAITLIST, name: 'splitpost-production', region: 'us-west-2' },
      ],
      functions: { [MEMBER]: [], [STAGING]: [{ slug: 'avatar', name: 'avatar', version: 4, status: 'ACTIVE', verify_jwt: false }] },
      deploy: 'ok', download: 'match', delete: 'ok',
      gh: {
        'repos/test/repo': { owner: { login: 'founder' } },
        'repos/test/repo/actions/runs/500': dbRun(commit),
        'repos/test/repo/actions/runs/500/jobs': dbJobs('success'),
      },
      ...patch,
    }
    if (patch.gh) s.gh = { 'repos/test/repo': { owner: { login: 'founder' } }, ...patch.gh }
    writeFileSync(join(dir, 'state.json'), JSON.stringify(s))
  }
  const run = (args) => {
    writeFileSync(join(dir, 'log'), '')
    const r = spawnSync('node', [join(repo, 'scripts/functions/deploy.mjs'), ...args], {
      cwd: repo, encoding: 'utf8',
      env: { ...process.env, PATH: `${bin}:${process.env.PATH}`, FAKE_STATE: join(dir, 'state.json'), FAKE_LOG: join(dir, 'log'), FAKE_DIR: dir, FUNCTIONS_TEST_GITHUB_REPO: 'test/repo' },
    })
    const calls = readFileSync(join(dir, 'log'), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l))
    return { code: r.status, out: r.stdout + r.stderr, calls, deploys: calls.filter((c) => c[0] === 'supabase' && c[1] === 'functions' && c[2] === 'deploy') }
  }
  const st = () => JSON.parse(readFileSync(join(dir, 'state.json'), 'utf8'))
  const evidence = () => readFileSync(join(repo, 'docs/function-evidence-log.md'), 'utf8')
  return { dir, repo, g, head, state, run, st, evidence, cleanup: () => rmSync(dir, { recursive: true, force: true }) }
}
function dbRun(commit, over = {}) {
  return { id: 500, path: '.github/workflows/deploy-db-members-production.yml', event: 'workflow_dispatch', head_branch: 'main', display_title: `member database check at ${commit}`, head_sha: commit, actor: { login: 'founder' }, triggering_actor: { login: 'founder' }, status: 'completed', conclusion: 'success', updated_at: new Date().toISOString(), ...over }
}
function dbJobs(conclusion) {
  return { jobs: [{ name: 'Read-only checks on member Production', steps: [{ name: 'Verify the database identity marker (the first connection; read only)', conclusion }] }] }
}
const deployArgs = (fn, ref, commit, extra = []) => ['deploy', '--target', ref === MEMBER ? 'member-production' : 'staging', '--function', fn, '--commit', commit, '--confirm', phraseFor('deploy', fn, ref, commit), '--operator', 'founder', ...(ref === MEMBER ? ['--db-check-run', '500'] : []), ...extra]
const noPrune = (calls) => calls.every((c) => !c.includes('--prune'))

test('unit: the confirmation phrases name the action, function, project and commit', () => {
  assert.equal(phraseFor('deploy', 'avatar', MEMBER), `DEPLOY avatar TO ${MEMBER}`)
  assert.equal(phraseFor('rollback', 'avatar', MEMBER, 'a'.repeat(40)), `ROLL BACK avatar ON ${MEMBER} TO ${'a'.repeat(12)}`)
  assert.equal(phraseFor('delete', 'join-waitlist', MEMBER), `DELETE join-waitlist FROM ${MEMBER}`)
})

test('unit: member Production needs ref, name and region, valid and consistent', () => {
  const base = { staging: { ref: STAGING }, production: { ref: WAITLIST } }
  assert.throws(() => targetProject('member-production', { ...base, memberProduction: { ref: null, name: null, region: null } }), /not provisioned/)
  assert.throws(() => targetProject('member-production', { ...base, memberProduction: { ref: MEMBER, name: null, region: null } }), /must all be valid/)
  assert.throws(() => targetProject('member-production', { ...base, memberProduction: { ref: MEMBER, name: 'Bad Name', region: 'ca-central-1' } }), /must all be valid/)
  assert.throws(() => targetProject('member-production', { ...base, memberProduction: { ref: WAITLIST, name: 'x', region: 'ca-central-1' } }), /waitlist project/)
  assert.throws(() => targetProject('member-production', { ...base, memberProduction: { ref: STAGING, name: 'x', region: 'ca-central-1' } }), /staging project/)
  assert.throws(() => targetProject('production', base), /staging or member-production/)
  assert.deepEqual(targetProject('member-production', { ...base, memberProduction: { ref: MEMBER, name: 'splitpost-members-production', region: 'ca-central-1' } }), { ref: MEMBER, name: 'splitpost-members-production', region: 'ca-central-1' })
})

test('unit: project identity, database identity evidence and verification runs', () => {
  const p = { ref: MEMBER, name: 'splitpost-members-production', region: 'ca-central-1' }
  const ok = { ref: MEMBER, name: p.name, region: p.region }
  assert.doesNotThrow(() => checkProjectIdentity([ok], p))
  assert.throws(() => checkProjectIdentity([], p), /0 project/)
  assert.throws(() => checkProjectIdentity([ok, ok], p), /2 project/)
  assert.throws(() => checkProjectIdentity([{ ...ok, name: 'other' }], p), /named/)
  assert.throws(() => checkProjectIdentity([{ ...ok, region: 'us-east-1' }], p), /is in/)
  const c = 'c'.repeat(40)
  const opts = { owner: 'founder', commit: c }
  assert.doesNotThrow(() => checkDbRun(dbRun(c), dbJobs('success'), opts))
  for (const [over, re] of [
    [{ path: '.github/workflows/deploy-db-staging.yml' }, /not a run of the member/],
    [{ display_title: `member database plan at ${c}` }, /check-mode run/],
    [{ head_sha: 'd'.repeat(40) }, /another commit/],
    [{ actor: { login: 'someone' } }, /repository owner/],
    [{ triggering_actor: { login: 'someone' } }, /repository owner/],
    [{ conclusion: 'failure' }, /did not succeed/],
    [{ updated_at: new Date(Date.now() - 25 * 3600e3).toISOString() }, /older than 24 hours/],
    [{ event: 'push' }, /by hand/],
  ]) assert.throws(() => checkDbRun(dbRun(c, over), dbJobs('success'), opts), re)
  assert.throws(() => checkDbRun(dbRun(c), dbJobs('skipped'), opts), /identity marker step/)
  assert.throws(() => checkDbRun(dbRun(c), { jobs: [] }, opts), /identity marker step/)
  const entry = { function: 'avatar', commit: c, version: 3, verifyRunId: 77 }
  const vrun = { id: 77, path: '.github/workflows/verify-functions.yml', event: 'workflow_dispatch', head_branch: 'main', actor: { login: 'founder' }, triggering_actor: { login: 'founder' }, status: 'completed', conclusion: 'success', display_title: `verify member-production avatar deployed ${c} v3` }
  assert.doesNotThrow(() => checkVerifyRun(vrun, entry, 'member-production', { owner: 'founder' }))
  for (const over of [{ conclusion: 'failure' }, { display_title: `verify member-production avatar deployed ${c} v2` }, { display_title: `verify staging avatar deployed ${c} v3` }, { actor: { login: 'x' } }, { path: '.github/workflows/ci.yml' }, { id: 78 }]) {
    assert.throws(() => checkVerifyRun({ ...vrun, ...over }, entry, 'member-production', { owner: 'founder' }))
  }
})

test('unit: the ledger is strict, and empty in this PR', () => {
  assert.deepEqual(ledgerProblems(JSON.parse(readFileSync(join(SRC, 'config/function-deployments.json'), 'utf8'))), [])
  assert.equal(JSON.parse(readFileSync(join(SRC, 'config/function-deployments.json'), 'utf8')).deployments.length, 0)
  const c = 'c'.repeat(40)
  const good = { target: 'member-production', ref: MEMBER, function: 'avatar', commit: c, version: 2, build: `${c}.${'d'.repeat(64)}`, approvedBy: 'founder', approvedAt: '2026-12-01', verifyRunId: 9 }
  assert.deepEqual(ledgerProblems({ deployments: [good] }), [])
  for (const bad of [{ approvedBy: 'me@example.com' }, { build: `${'e'.repeat(40)}.${'d'.repeat(64)}` }, { version: 0 }, { function: 'join-waitlist' }, { target: 'production' }, { extra: 1 }, { verifyRunId: null }]) {
    assert.notDeepEqual(ledgerProblems({ deployments: [{ ...good, ...bad }] }), [], JSON.stringify(bad))
  }
  assert.notDeepEqual(ledgerProblems({ deployments: [good, good] }), [], 'duplicates')
})

test('while memberProduction.ref is null, nothing can be deployed to member Production (nothing is called)', () => {
  const t = setup({ member: false })
  try {
    t.state()
    const r = t.run(['deploy', '--target', 'member-production', '--function', 'avatar', '--commit', t.head(), '--confirm', 'DEPLOY avatar TO x', '--operator', 'founder', '--db-check-run', '500'])
    assert.equal(r.code, 1); assert.match(r.out, /memberProduction.ref is null/); assert.equal(r.deploys.length, 0)
  } finally { t.cleanup() }
})

test('staging: deploys exactly the HEAD commit export, stamped, with the exact CLI arguments, and records evidence', () => {
  const t = setup()
  try {
    t.state()
    const c = t.head()
    const r = t.run(deployArgs('avatar', STAGING, c))
    assert.equal(r.code, 0, r.out)
    assert.equal(r.deploys.length, 1)
    const d = r.deploys[0]
    assert.deepEqual(d.slice(0, 10), ['supabase', 'functions', 'deploy', 'avatar', '--project-ref', STAGING, '--no-verify-jwt', '--use-api', '--workdir', d[9]])
    assert.equal(d.length, 10)
    assert.ok(noPrune(r.calls))
    const digest = sh(t.repo, 'node', ['scripts/functions/source-digest.mjs', '.', 'avatar'])
    assert.match(t.st().lastBuild, new RegExp(`BUILD = '${c}\\.${digest}'`))
    const out = JSON.parse(r.out.slice(r.out.indexOf('{')))
    assert.equal(out.state, 'deployed, unverified'); assert.equal(out.version, 5); assert.equal(out.sourceDownload, 'match')
    assert.match(out.next, /verify-functions\.yml/)
    assert.match(t.evidence(), /deploy started \| staging/); assert.match(t.evidence(), /deployed, unverified \| staging/)
    assert.equal(sh(t.repo, 'git', ['show', 'HEAD:supabase/functions/_shared/build-info.ts']).includes("'unstamped'"), true, 'the repository copy is never stamped')
  } finally { t.cleanup() }
})

test('member Production: avatar deploys with valid identity evidence; post-media is refused while unapproved, even with its phrase', () => {
  const t = setup()
  try {
    t.state()
    const c = t.head()
    let r = t.run(deployArgs('avatar', MEMBER, c))
    assert.equal(r.code, 0, r.out)
    assert.equal(r.deploys.length, 1)
    r = t.run(deployArgs('post-media', MEMBER, c))
    assert.equal(r.code, 1); assert.match(r.out, /postMediaFunctionApproved is false/); assert.equal(r.deploys.length, 0)
  } finally { t.cleanup() }
  const a = setup({ postMediaApproved: true })
  try {
    a.state()
    const r = a.run(deployArgs('post-media', MEMBER, a.head()))
    assert.equal(r.code, 0, r.out)
  } finally { a.cleanup() }
})

test('refusals before anything is deployed', () => {
  const t = setup()
  try {
    const c = t.head()
    const cases = [
      ['--prune', [...deployArgs('avatar', STAGING, c), '--prune', 'true'], /unknown option --prune/],
      ['an extra CLI flag', [...deployArgs('avatar', STAGING, c), '--import-map', 'x'], /unknown option/],
      ['join-waitlist', ['deploy', '--target', 'member-production', '--function', 'join-waitlist', '--commit', c, '--confirm', `DEPLOY join-waitlist TO ${MEMBER}`, '--operator', 'founder', '--db-check-run', '500'], /never deployed/],
      ['the waitlist project as a target', ['deploy', '--target', 'production', '--function', 'avatar', '--commit', c, '--confirm', `DEPLOY avatar TO ${WAITLIST}`, '--operator', 'founder'], /staging or member-production/],
      ['a phrase for another function', ['deploy', '--target', 'staging', '--function', 'avatar', '--commit', c, '--confirm', `DEPLOY post-media TO ${STAGING}`, '--operator', 'founder'], /phrase must be exactly/],
      ['a phrase for another project', ['deploy', '--target', 'member-production', '--function', 'avatar', '--commit', c, '--confirm', `DEPLOY avatar TO ${STAGING}`, '--operator', 'founder', '--db-check-run', '500'], /phrase must be exactly/],
      ['a lowercase phrase', ['deploy', '--target', 'staging', '--function', 'avatar', '--commit', c, '--confirm', `deploy avatar to ${STAGING}`, '--operator', 'founder'], /phrase must be exactly/],
      ['an email as operator', [...deployArgs('avatar', STAGING, c).slice(0, -2), '--operator', 'me@example.com'], /not an email/],
      ['a short commit', ['deploy', '--target', 'staging', '--function', 'avatar', '--commit', c.slice(0, 12), '--confirm', `DEPLOY avatar TO ${STAGING}`, '--operator', 'founder'], /40 character/],
      ['no database identity run', deployArgs('avatar', MEMBER, c).slice(0, -2), /--db-check-run .* is required/],
    ]
    for (const [what, args, re] of cases) {
      t.state()
      const r = t.run(args)
      assert.equal(r.code, 1, `${what}: ${r.out}`); assert.match(r.out, re, what); assert.equal(r.deploys.length, 0, what)
      assert.ok(noPrune(r.calls))
    }
    // Missing or mismatched identity evidence.
    for (const [what, gh, re] of [
      ['a database run that does not exist', { 'repos/test/repo/actions/runs/500/jobs': dbJobs('success') }, /gh api failed/],
      ['a plan-mode database run', { 'repos/test/repo/actions/runs/500': dbRun(c, { display_title: `member database plan at ${c}` }), 'repos/test/repo/actions/runs/500/jobs': dbJobs('success') }, /check-mode run/],
      ['a database run at another commit', { 'repos/test/repo/actions/runs/500': dbRun('e'.repeat(40)), 'repos/test/repo/actions/runs/500/jobs': dbJobs('success') }, /check-mode run|another commit/],
      ['a failed identity step', { 'repos/test/repo/actions/runs/500': dbRun(c), 'repos/test/repo/actions/runs/500/jobs': dbJobs('failure') }, /identity marker step/],
      ['a stale database run', { 'repos/test/repo/actions/runs/500': dbRun(c, { updated_at: '2026-01-01T00:00:00Z' }), 'repos/test/repo/actions/runs/500/jobs': dbJobs('success') }, /older than 24 hours/],
      ['someone else\'s database run', { 'repos/test/repo/actions/runs/500': dbRun(c, { actor: { login: 'mallory' } }), 'repos/test/repo/actions/runs/500/jobs': dbJobs('success') }, /repository owner/],
    ]) {
      t.state({ gh })
      const r = t.run(deployArgs('avatar', MEMBER, c))
      assert.equal(r.code, 1, what); assert.match(r.out, re, what); assert.equal(r.deploys.length, 0, what)
    }
    // Project identity.
    for (const [what, projects, re] of [
      ['a renamed project', [{ ref: MEMBER, name: 'something-else', region: 'ca-central-1' }], /named/],
      ['another region', [{ ref: MEMBER, name: 'splitpost-members-production', region: 'us-east-1' }], /is in/],
      ['a missing project', [], /0 project/],
    ]) {
      t.state({ projects })
      const r = t.run(deployArgs('avatar', MEMBER, c))
      assert.equal(r.code, 1, what); assert.match(r.out, re, what); assert.equal(r.deploys.length, 0, what)
    }
    t.state({ version: '2.100.0' })
    let r = t.run(deployArgs('avatar', STAGING, c))
    assert.match(r.out, /expected Supabase CLI 2\.122\.1/); assert.equal(r.deploys.length, 0)
    // An unexpected function already on member Production.
    t.state({ functions: { [MEMBER]: [{ slug: 'join-waitlist', version: 1, status: 'ACTIVE', verify_jwt: false }] } })
    r = t.run(deployArgs('avatar', MEMBER, c))
    assert.match(r.out, /unexpected function\(s\): join-waitlist/); assert.equal(r.deploys.length, 0)
    // The commit: not HEAD, a dirty tree, not on main.
    t.state()
    const base = t.g('rev-parse', 'HEAD~1')
    r = t.run(deployArgs('avatar', STAGING, base))
    assert.match(r.out, /not HEAD/); assert.equal(r.deploys.length, 0)
    writeFileSync(join(t.repo, 'supabase/functions/avatar/index.ts'), '// edited\n', { flag: 'a' })
    r = t.run(deployArgs('avatar', STAGING, c))
    assert.match(r.out, /not clean/); assert.equal(r.deploys.length, 0)
    t.g('commit', '-q', '-am', 'local only')
    r = t.run(deployArgs('avatar', STAGING, t.head()))
    assert.match(r.out, /not on origin\/main/); assert.equal(r.deploys.length, 0)
  } finally { t.cleanup() }
})

test('after the deploy: JWT on, an unexpected function, an unchanged version or different source fail verification', () => {
  const t = setup()
  try {
    const c = t.head()
    for (const [patch, re] of [
      [{ deploy: 'jwt-on' }, /JWT check on/],
      [{ deploy: 'extra' }, /unexpected function\(s\) on .*join-waitlist/],
      [{ deploy: 'no-bump' }, /version did not change/],
      [{ download: 'differs' }, /downloaded source differs/],
      [{ deploy: 'fail' }, /supabase functions failed/],
    ]) {
      t.state({ ...patch, functions: { [MEMBER]: [{ slug: 'avatar', name: 'avatar', version: 2, status: 'ACTIVE', verify_jwt: false }] } })
      const r = t.run(deployArgs('avatar', MEMBER, c))
      assert.equal(r.code, 1, JSON.stringify(patch)); assert.match(r.out, re, JSON.stringify(patch))
    }
    assert.match(t.evidence(), /FAILED VERIFICATION/)
    t.state({ download: 'unsupported' })
    const r = t.run(deployArgs('avatar', MEMBER, c))
    assert.equal(r.code, 0, r.out)
    assert.equal(JSON.parse(r.out.slice(r.out.indexOf('{'))).sourceDownload, 'unavailable', 'an unsupported download is reported, never a pass')
  } finally { t.cleanup() }
})

test('rollback: only to a recorded, founder-approved deployment whose verification passed and matches it', () => {
  const t = setup()
  try {
    const old = t.head()
    // A later main commit, so the rollback target is older than HEAD.
    writeFileSync(join(t.repo, 'docs/later.md'), 'later\n'); t.g('add', '-A'); t.g('commit', '-q', '-m', 'later'); t.g('push', '-q', 'origin', 'main')
    const main = t.head()
    const digest = sh(t.repo, 'node', ['scripts/functions/source-digest.mjs', '.', 'avatar'])
    const entry = { target: 'member-production', ref: MEMBER, function: 'avatar', commit: old, version: 3, build: `${old}.${digest}`, approvedBy: 'founder', approvedAt: '2026-12-01', verifyRunId: 77 }
    const vrun = (over = {}) => ({ id: 77, path: '.github/workflows/verify-functions.yml', event: 'workflow_dispatch', head_branch: 'main', actor: { login: 'founder' }, triggering_actor: { login: 'founder' }, status: 'completed', conclusion: 'success', display_title: `verify member-production avatar deployed ${old} v3`, ...over })
    const args = (commit = old) => ['rollback', '--target', 'member-production', '--function', 'avatar', '--commit', commit, '--confirm', phraseFor('rollback', 'avatar', MEMBER, commit), '--operator', 'founder', '--reason', 'avatar upload regression', '--db-check-run', '500']
    const gh = (v) => ({ 'repos/test/repo/actions/runs/500': dbRun(main), 'repos/test/repo/actions/runs/500/jobs': dbJobs('success'), ...(v ? { 'repos/test/repo/actions/runs/77': v } : {}) })
    const withLedger = (deployments) => {
      writeFileSync(join(t.repo, 'config/function-deployments.json'), JSON.stringify({ deployments }, null, 2))
      t.g('add', '-A'); t.g('commit', '-q', '-m', 'ledger'); t.g('push', '-q', 'origin', 'main')
      return t.head()
    }
    // No ledger entry, even though a verification passed: refused.
    t.state({ gh: gh(vrun()) })
    let r = t.run(args())
    assert.equal(r.code, 1); assert.match(r.out, /no founder-approved avatar deployment/); assert.equal(r.deploys.length, 0)
    // A ledger entry, but its verification failed, does not match, is someone else's, or is missing.
    const m2 = withLedger([entry])
    for (const [what, v, re] of [
      ['failed verification', vrun({ conclusion: 'failure' }), /did not succeed/],
      ['another version', vrun({ display_title: `verify member-production avatar deployed ${old} v2` }), /does not match the deployment/],
      ['another target', vrun({ display_title: `verify staging avatar deployed ${old} v3` }), /does not match the deployment/],
      ['someone else', vrun({ actor: { login: 'mallory' } }), /repository owner/],
      ['missing run', null, /gh api failed/],
    ]) {
      t.state({ gh: { ...gh(v), 'repos/test/repo/actions/runs/500': dbRun(m2) } })
      r = t.run(args())
      assert.equal(r.code, 1, what); assert.match(r.out, re, what); assert.equal(r.deploys.length, 0, what)
    }
    // A commit that is not on main.
    t.state({ gh: { ...gh(vrun()), 'repos/test/repo/actions/runs/500': dbRun(m2) } })
    r = t.run(args('f'.repeat(40)))
    assert.equal(r.code, 1); assert.equal(r.deploys.length, 0)
    // A wrong phrase (another commit).
    r = t.run([...args().slice(0, 7), '--confirm', phraseFor('rollback', 'avatar', MEMBER, m2), ...args().slice(9)])
    assert.match(r.out, /phrase must be exactly/); assert.equal(r.deploys.length, 0)
    // A malformed ledger refuses every rollback.
    const m3 = withLedger([entry, { ...entry, approvedBy: 'me@example.com', version: 4 }])
    t.state({ gh: { ...gh(vrun()), 'repos/test/repo/actions/runs/500': dbRun(m3) } })
    r = t.run(args())
    assert.match(r.out, /ledger on main is invalid/); assert.equal(r.deploys.length, 0)
    // The valid case: deploys the OLD commit's export, stamped with the old commit; state unverified.
    const m4 = withLedger([entry])
    t.state({ gh: { ...gh(vrun()), 'repos/test/repo/actions/runs/500': dbRun(m4) }, functions: { [MEMBER]: [{ slug: 'avatar', name: 'avatar', version: 5, status: 'ACTIVE', verify_jwt: false }] } })
    r = t.run(args())
    assert.equal(r.code, 0, r.out)
    assert.match(t.st().lastBuild, new RegExp(`'${old}\\.${digest}'`))
    const out = JSON.parse(r.out.slice(r.out.indexOf('{')))
    assert.equal(out.state, 'deployed, unverified'); assert.equal(out.version, 6)
    assert.match(t.evidence(), /rollback started .*avatar upload regression/)
    assert.ok(noPrune(r.calls))
  } finally { t.cleanup() }
})

test('emergency deletion: exact target, function and phrase, operator and reason recorded first, absence confirmed', () => {
  const t = setup()
  try {
    const fns = () => ({ [MEMBER]: [{ slug: 'avatar', version: 3, status: 'ACTIVE', verify_jwt: false }, { slug: 'join-waitlist', version: 1, status: 'ACTIVE', verify_jwt: false }] })
    const del = (fn, extra = {}) => ['delete', '--target', 'member-production', '--function', fn, '--confirm', extra.confirm ?? phraseFor('delete', fn, MEMBER), '--operator', extra.operator ?? 'founder', ...(extra.reason === null ? [] : ['--reason', extra.reason ?? 'accidental deployment'])]
    for (const [what, args, re] of [
      ['a phrase for another function', del('avatar', { confirm: phraseFor('delete', 'join-waitlist', MEMBER) }), /phrase must be exactly/],
      ['a phrase for another project', del('avatar', { confirm: phraseFor('delete', 'avatar', STAGING) }), /phrase must be exactly/],
      ['no reason', del('avatar', { reason: null }), /--reason/],
      ['an email operator', del('avatar', { operator: 'me@example.com' }), /not an email/],
      ['join-waitlist from staging', ['delete', '--target', 'staging', '--function', 'join-waitlist', '--confirm', phraseFor('delete', 'join-waitlist', STAGING), '--operator', 'founder', '--reason', 'test reason'], /only be deleted from member Production/],
    ]) {
      t.state({ functions: fns() })
      const r = t.run(args)
      assert.equal(r.code, 1, what); assert.match(r.out, re, what)
      assert.ok(!r.calls.some((c) => c[2] === 'delete'), what)
    }
    t.state({ functions: fns() })
    let r = t.run(del('join-waitlist'))
    assert.equal(r.code, 0, r.out)
    assert.ok(!t.st().functions[MEMBER].some((f) => f.slug === 'join-waitlist'))
    const ev = t.evidence()
    assert.ok(ev.indexOf('delete requested') < ev.indexOf('| deleted |'), 'recorded before deleting')
    assert.match(ev, /delete requested \| member-production \| membersprodtestrefab \| join-waitlist \|  \|  \| founder \| accidental deployment/)
    assert.ok(!r.calls.some((c) => c[0] === 'gh' && /actions\/runs/.test(c[2] ?? '')), 'no database or verification run needed')
    assert.ok(r.calls.some((c) => c[1] === 'projects'), 'the exact project is still checked')
    assert.match(r.out, /Redeploying needs a normal, approved deploy/)
    t.state({ functions: fns(), delete: 'stuck' })
    r = t.run(del('avatar'))
    assert.equal(r.code, 1); assert.match(r.out, /still listed/); assert.match(t.evidence(), /delete FAILED/)
  } finally { t.cleanup() }
})

test('the deploy script never passes --prune, never deploys without a name, and only deploys from an export', () => {
  const s = readFileSync(join(SRC, 'scripts/functions/deploy.mjs'), 'utf8')
  const code = s.replace(/^\s*\/\/.*$/gm, '')
  assert.equal((code.match(/'functions', 'deploy'/g) ?? []).length, 1, 'one deploy call')
  assert.match(code, /run\('supabase', \['functions', 'deploy', fn, '--project-ref', p\.ref, '--no-verify-jwt', '--use-api', '--workdir', out\]\)/)
  assert.ok(!/['"]--prune['"]/.test(code.replace(/--prune least of all/g, '')), 'no --prune anywhere in the calls')
  assert.ok(existsSync(join(SRC, 'docs/function-evidence-log.md')))
})
