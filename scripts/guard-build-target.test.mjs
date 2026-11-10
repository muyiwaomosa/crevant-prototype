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

test('production builds only the approved public site', () => {
  assert.equal(checkBuildTarget({ VERCEL_ENV: 'production', CREVANT_BUILD_MODE: 'site', CREVANT_PRODUCTION_SITE_APPROVED: 'true' }).ok, true)
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
