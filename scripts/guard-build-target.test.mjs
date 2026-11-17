// Tests for the production build guard. Run with: node --test scripts/*.test.mjs
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { checkBuildTarget } from './guard-build-target.mjs'

const script = fileURLToPath(new URL('./guard-build-target.mjs', import.meta.url))
const run = (VERCEL_ENV) => {
  const env = { ...process.env }
  delete env.VERCEL_ENV
  if (VERCEL_ENV !== undefined) env.VERCEL_ENV = VERCEL_ENV
  try {
    execFileSync(process.execPath, [script], { env, stdio: 'pipe' })
    return 0
  } catch (e) {
    return e.status
  }
}

test('production refuses the full app, and the public site without approval', () => {
  assert.equal(checkBuildTarget({ VERCEL_ENV: 'production' }).ok, false)
  assert.equal(checkBuildTarget({ VERCEL_ENV: ' Production ' }).ok, false)
  assert.equal(checkBuildTarget({ VERCEL_ENV: 'production', CREVANT_PRODUCTION_SITE_APPROVED: 'true' }).ok, false)
  assert.equal(checkBuildTarget({ VERCEL_ENV: 'production', CREVANT_BUILD_MODE: 'app', CREVANT_PRODUCTION_SITE_APPROVED: 'true' }).ok, false)
  assert.equal(checkBuildTarget({ VERCEL_ENV: 'production', CREVANT_BUILD_MODE: 'site' }).ok, false)
  for (const v of ['TRUE', '1', 'yes', 'false', '']) {
    assert.equal(checkBuildTarget({ VERCEL_ENV: 'production', CREVANT_BUILD_MODE: 'site', CREVANT_PRODUCTION_SITE_APPROVED: v }).ok, false, v)
  }
  assert.equal(run('production'), 1)
})

// Projects as in config/vercel-projects.json, with a stand-in splitpost ID.
const DEMO_ID = 'prj_kHLgZpZPCD5QMegqwCwISuV37hge'
const SITE_ID = 'prj_SplitpostTestOnly0000000001'
const PROJECTS = {
  repository: { owner: 'muyiwaomosa', slug: 'crevant-prototype', productionBranch: 'main' },
  demo: { name: 'crevant-prototype', projectId: DEMO_ID },
  publicSite: { name: 'splitpost', projectId: SITE_ID },
}
// Everything Vercel sets for a Git build of main in the splitpost project, plus the approval.
const APPROVED = {
  VERCEL_ENV: 'production',
  CREVANT_BUILD_MODE: 'site',
  CREVANT_PRODUCTION_SITE_APPROVED: 'true',
  VERCEL_PROJECT_ID: SITE_ID,
  VERCEL_GIT_REPO_OWNER: 'muyiwaomosa',
  VERCEL_GIT_REPO_SLUG: 'crevant-prototype',
  VERCEL_GIT_COMMIT_REF: 'main',
}
const without = (k) => Object.fromEntries(Object.entries(APPROVED).filter(([key]) => key !== k))

test('allowed: the approved public site, in the splitpost project, from a Git build of main', () => {
  const r = checkBuildTarget(APPROVED, PROJECTS)
  assert.equal(r.ok, true, r.message)
  assert.match(r.message, /project splitpost, muyiwaomosa\/crevant-prototype@main/)
})

test('blocked: the demo project, even with the approval set and main checked out', () => {
  const r = checkBuildTarget({ ...APPROVED, VERCEL_PROJECT_ID: DEMO_ID }, PROJECTS)
  assert.equal(r.ok, false)
  assert.match(r.message, /demo project/)
})

test('blocked: no project ID, an unknown or malformed one, or no splitpost ID recorded yet', () => {
  for (const id of [undefined, '', '  ']) {
    const r = checkBuildTarget({ ...without('VERCEL_PROJECT_ID'), ...(id === undefined ? {} : { VERCEL_PROJECT_ID: id }) }, PROJECTS)
    assert.equal(r.ok, false, String(id))
    assert.match(r.message, /VERCEL_PROJECT_ID is missing/)
  }
  for (const id of ['prj_SomeOtherProject00000000', 'splitpost', 'prj_', `${SITE_ID} `.repeat(2), SITE_ID.toLowerCase()]) {
    assert.equal(checkBuildTarget({ ...APPROVED, VERCEL_PROJECT_ID: id }, PROJECTS).ok, false, id)
  }
  // The real config, until the splitpost ID is recorded: every Production build fails closed.
  const unset = { ...PROJECTS, publicSite: { name: 'splitpost', projectId: null } }
  const r = checkBuildTarget(APPROVED, unset)
  assert.equal(r.ok, false)
  assert.match(r.message, /not recorded yet/)
})

test('blocked: another repository, a missing Git source (an upload), or any branch but main', () => {
  for (const k of ['VERCEL_GIT_REPO_OWNER', 'VERCEL_GIT_REPO_SLUG', 'VERCEL_GIT_COMMIT_REF']) {
    assert.equal(checkBuildTarget(without(k), PROJECTS).ok, false, k)
  }
  assert.equal(checkBuildTarget({ ...APPROVED, VERCEL_GIT_REPO_OWNER: 'someone-else' }, PROJECTS).ok, false)
  assert.equal(checkBuildTarget({ ...APPROVED, VERCEL_GIT_REPO_SLUG: 'a-fork' }, PROJECTS).ok, false)
  for (const ref of ['demo', 'claude/feature', 'Main', 'main2']) {
    const r = checkBuildTarget({ ...APPROVED, VERCEL_GIT_COMMIT_REF: ref }, PROJECTS)
    assert.equal(r.ok, false, ref)
  }
})

test('blocked: the earlier locks still hold in the right project (full app, or no approval)', () => {
  assert.equal(checkBuildTarget({ ...APPROVED, CREVANT_BUILD_MODE: 'app' }, PROJECTS).ok, false)
  assert.equal(checkBuildTarget(without('CREVANT_BUILD_MODE'), PROJECTS).ok, false)
  for (const v of ['TRUE', '1', 'false', '']) assert.equal(checkBuildTarget({ ...APPROVED, CREVANT_PRODUCTION_SITE_APPROVED: v }, PROJECTS).ok, false, v)
  assert.equal(checkBuildTarget(without('CREVANT_PRODUCTION_SITE_APPROVED'), PROJECTS).ok, false)
})

test('the committed config names the demo project, and leaves the splitpost ID to a reviewed change', async () => {
  const { VERCEL_PROJECTS } = await import('./vercel-project.mjs')
  assert.equal(VERCEL_PROJECTS.demo.projectId, DEMO_ID)
  assert.deepEqual(VERCEL_PROJECTS.repository, { owner: 'muyiwaomosa', slug: 'crevant-prototype', productionBranch: 'main' })
  assert.ok(VERCEL_PROJECTS.publicSite.projectId === null || /^prj_[A-Za-z0-9]{10,64}$/.test(VERCEL_PROJECTS.publicSite.projectId))
  assert.notEqual(VERCEL_PROJECTS.publicSite.projectId, DEMO_ID)
  // With the committed config, the demo project is always refused for Production.
  assert.equal(checkBuildTarget({ ...APPROVED, VERCEL_PROJECT_ID: DEMO_ID }).ok, false)
  // And, once recorded, only the splitpost project's own ID is allowed.
  if (VERCEL_PROJECTS.publicSite.projectId) {
    assert.equal(checkBuildTarget({ ...APPROVED, VERCEL_PROJECT_ID: VERCEL_PROJECTS.publicSite.projectId }).ok, true)
    assert.equal(checkBuildTarget({ ...APPROVED, VERCEL_PROJECT_ID: SITE_ID }).ok, false)
  }
})

test('preview, development and local builds are allowed', () => {
  for (const v of ['preview', 'development', '']) assert.equal(checkBuildTarget({ VERCEL_ENV: v }).ok, true)
  assert.equal(checkBuildTarget({}).ok, true)
  assert.equal(run('preview'), 0)
  assert.equal(run(undefined), 0)
})

test('the frozen demo cannot be affected: the demo branch never runs this guard', (t) => {
  // Vercel Production tracks the demo branch, whose package.json builds with
  // "tsc -b && vite build" and has none of these scripts. This guard (and the
  // build script that calls it) only exist on main.
  let demo
  try {
    demo = execFileSync('git', ['show', 'origin/demo:package.json'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })
  } catch {
    // CI fetches the demo branch for this test (.github/workflows/ci.yml); locally it may be missing.
    if (process.env.CI) throw new Error('origin/demo is not available; CI must fetch it for this test')
    return t.skip('origin/demo is not fetched locally')
  }
  const scripts = JSON.parse(demo).scripts
  assert.equal(scripts.build, 'tsc -b && vite build')
  assert.doesNotMatch(JSON.stringify(scripts), /guard-build-target|scripts\/build\.mjs|vercel-build/)
})
