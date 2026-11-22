// Tests for the build entry point's choice of build. Run with: node --test scripts/*.test.mjs
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { planBuild } from './build.mjs'

const commands = (plan) => plan.steps.map((s) => s.join(' '))

test('Vercel Production always builds the public site, with every check', () => {
  const plan = planBuild({ VERCEL_ENV: 'production' })
  assert.equal(plan.mode, 'site')
  assert.deepEqual(commands(plan), [
    'node scripts/guard-build-target.mjs',
    'node scripts/check-supabase-target.mjs',
    'node scripts/check-waitlist-launch.mjs',
    'node scripts/check-photo-approvals.mjs',
    'npx tsc -b',
    'npx vite build --mode site',
    'node scripts/check-site-bundle.mjs dist',
    'scripts/check-bundle-secrets.sh',
  ])
  // Even if someone asks for the full app.
  assert.equal(planBuild({ VERCEL_ENV: 'production', CREVANT_BUILD: 'app' }).mode, 'site')
})

test('Previews and local builds keep the full app unless the site is asked for', () => {
  for (const env of [{ VERCEL_ENV: 'preview' }, {}, { VERCEL_ENV: 'development' }]) {
    const plan = planBuild(env)
    assert.equal(plan.mode, 'app', JSON.stringify(env))
    assert.deepEqual(commands(plan), ['node scripts/guard-build-target.mjs', 'node scripts/check-supabase-target.mjs', 'npx tsc -b', 'npx vite build'])
  }
  assert.equal(planBuild({ VERCEL_ENV: 'preview', CREVANT_BUILD: 'site' }).mode, 'site')
  assert.equal(planBuild({}, ['--site']).mode, 'site')
})

test('npm run build and build:site both go through this one entry point', () => {
  const scripts = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).scripts
  assert.equal(scripts.build, 'node scripts/build.mjs')
  assert.equal(scripts['build:site'], 'node scripts/build.mjs --site')
  assert.equal(scripts['vercel-build'], undefined)
})

test('the splitpost project builds only the public site, Previews included; the demo project and unknown projects are unchanged', async () => {
  const { VERCEL_PROJECTS } = await import('./vercel-project.mjs')
  const demo = VERCEL_PROJECTS.demo.projectId
  // The demo project's Previews keep building the full app, as today.
  assert.equal(planBuild({ VERCEL_ENV: 'preview', VERCEL_PROJECT_ID: demo }).mode, 'app')
  assert.equal(planBuild({ VERCEL_ENV: 'preview', VERCEL_PROJECT_ID: 'prj_SomeOtherProject00000000' }).mode, 'app')
  // Production is the public site in every project (the guard then decides whether it may build at all).
  assert.equal(planBuild({ VERCEL_ENV: 'production', VERCEL_PROJECT_ID: demo }).mode, 'site')
  // With the splitpost ID recorded (a stand-in here), its Previews build the public site with every site check.
  const site = 'prj_SplitpostTestOnly0000000001'
  const projects = { ...VERCEL_PROJECTS, publicSite: { name: 'splitpost', projectId: site } }
  const plan = planBuild({ VERCEL_ENV: 'preview', VERCEL_PROJECT_ID: site }, [], projects)
  assert.equal(plan.mode, 'site')
  assert.ok(commands(plan).includes('node scripts/check-site-bundle.mjs dist'))
  assert.equal(planBuild({ VERCEL_ENV: 'preview', VERCEL_PROJECT_ID: demo }, [], projects).mode, 'app')
})
