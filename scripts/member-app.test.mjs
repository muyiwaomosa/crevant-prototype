// Tests for the member app (splitpost-app, app.splitpost.ca) build rules:
// which build it gets, when Vercel Production may build it, which Supabase
// project it may use, and the check on the finished bundle. Every refusal
// must fail closed. Run with: node --test scripts/*.test.mjs
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { planBuild, stepEnv } from './build.mjs'
import { checkBuildTarget } from './guard-build-target.mjs'
import { checkSupabaseTarget, PROJECTS as REFS, STAGING_SUPABASE_URL } from './check-supabase-target.mjs'
import { MEMBER_APP_MARKER, checkMemberAppBundle } from './check-member-app-bundle.mjs'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, readdirSync, rmSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, relative } from 'node:path'
import { VERCEL_PROJECTS, hasDuplicateProjectIds, identifyProject } from './vercel-project.mjs'

// Stand-in IDs for the tests only. The real member app ID is recorded only
// once the founder has created the project (a reviewed change).
const DEMO_ID = 'prj_kHLgZpZPCD5QMegqwCwISuV37hge'
const SITE_ID = 'prj_SplitpostTestOnly0000000001'
const APP_ID = 'prj_MemberAppTestOnly000000001'
const PROJECTS = {
  repository: { owner: 'muyiwaomosa', slug: 'crevant-prototype', productionBranch: 'main' },
  demo: { name: 'crevant-prototype', projectId: DEMO_ID },
  publicSite: { name: 'splitpost', projectId: SITE_ID },
  memberApp: { name: 'splitpost-app', projectId: APP_ID, host: 'app.splitpost.ca' },
}
const PUB = 'sb_publishable_f_Rjmc-I3QYgSiqYd5bIUw_P-vQxvUz'
const PRODUCTION_URL = `https://${REFS.production}.supabase.co`
const jwt = (role) => `eyJhbGciOiJIUzI1NiJ9.${Buffer.from(JSON.stringify({ role })).toString('base64url')}.sig`
const commands = (plan) => plan.steps.map((s) => s.join(' '))

// Everything Vercel sets for an approved Git build of main in the member app project.
const APPROVED = {
  VERCEL_ENV: 'production',
  CREVANT_BUILD_MODE: 'app',
  CREVANT_MEMBER_APP_APPROVED: 'true',
  VERCEL_PROJECT_ID: APP_ID,
  VERCEL_GIT_REPO_OWNER: 'muyiwaomosa',
  VERCEL_GIT_REPO_SLUG: 'crevant-prototype',
  VERCEL_GIT_COMMIT_REF: 'main',
}
const without = (k) => Object.fromEntries(Object.entries(APPROVED).filter(([key]) => key !== k))

// --- The committed configuration -------------------------------------------------

// The splitpost-app project's ID, as the founder confirmed it in Vercel (Settings, General, Project ID).
const REAL_APP_ID = 'prj_FWOmj8cCOMBpQZFA36e1mKId557n'

test('the committed config records the member app project with its exact, unique ID', () => {
  assert.equal(VERCEL_PROJECTS.memberApp.name, 'splitpost-app')
  assert.equal(VERCEL_PROJECTS.memberApp.host, 'app.splitpost.ca')
  assert.equal(VERCEL_PROJECTS.memberApp.projectId, REAL_APP_ID)
  assert.match(VERCEL_PROJECTS.memberApp.projectId, /^prj_[A-Za-z0-9]{10,64}$/)
  assert.notEqual(VERCEL_PROJECTS.memberApp.projectId, VERCEL_PROJECTS.demo.projectId)
  assert.notEqual(VERCEL_PROJECTS.memberApp.projectId, VERCEL_PROJECTS.publicSite.projectId)
  assert.equal(hasDuplicateProjectIds(), false)
})

test('with the committed config, only the real splitpost-app project is the member app, and only it builds the member app', () => {
  assert.equal(identifyProject({ VERCEL_PROJECT_ID: REAL_APP_ID }), 'memberApp')
  assert.equal(identifyProject({ VERCEL_PROJECT_ID: VERCEL_PROJECTS.publicSite.projectId }), 'publicSite')
  assert.equal(identifyProject({ VERCEL_PROJECT_ID: VERCEL_PROJECTS.demo.projectId }), 'demo')
  for (const id of [REAL_APP_ID.toLowerCase(), `${REAL_APP_ID}x`, REAL_APP_ID.slice(0, -1), 'splitpost-app', '']) {
    assert.notEqual(identifyProject({ VERCEL_PROJECT_ID: id }), 'memberApp', id)
  }
  const preview = planBuild({ VERCEL_ENV: 'preview', VERCEL_PROJECT_ID: REAL_APP_ID })
  assert.equal(preview.memberApp, true)
  assert.equal(stepEnv(preview, {}).CREVANT_MEMBER_APP_BUILD, 'true')
  assert.ok(commands(preview).includes('node scripts/check-member-app-bundle.mjs dist'))
})

test('with the committed config, a Preview in splitpost-app passes the guard; Production stays refused without approval, from a branch, or with the site approval', () => {
  const git = { VERCEL_PROJECT_ID: REAL_APP_ID, VERCEL_GIT_REPO_OWNER: 'muyiwaomosa', VERCEL_GIT_REPO_SLUG: 'crevant-prototype' }
  assert.equal(checkBuildTarget({ ...git, VERCEL_ENV: 'preview', CREVANT_BUILD_MODE: 'app', VERCEL_GIT_COMMIT_REF: 'claude/pilot-m1-environment' }).ok, true)
  // Today: no approval switch in the project, so every Production build is refused.
  assert.equal(checkBuildTarget({ ...git, VERCEL_ENV: 'production', CREVANT_BUILD_MODE: 'app', VERCEL_GIT_COMMIT_REF: 'main' }).ok, false)
  // Even with approval: only main, never a branch, never with the public site approval, never a site build.
  const approved = { ...git, VERCEL_ENV: 'production', CREVANT_BUILD_MODE: 'app', CREVANT_MEMBER_APP_APPROVED: 'true' }
  assert.equal(checkBuildTarget({ ...approved, VERCEL_GIT_COMMIT_REF: 'claude/pilot-m1-environment' }).ok, false)
  assert.equal(checkBuildTarget({ ...approved, VERCEL_GIT_COMMIT_REF: 'main', CREVANT_PRODUCTION_SITE_APPROVED: 'true' }).ok, false)
  assert.equal(checkBuildTarget({ ...approved, VERCEL_GIT_COMMIT_REF: 'main', CREVANT_BUILD_MODE: 'site' }).ok, false)
  // The approval switch set in another project never makes it the member app.
  assert.equal(checkBuildTarget({ ...approved, VERCEL_GIT_COMMIT_REF: 'main', VERCEL_PROJECT_ID: 'prj_SomeOtherProject00000000' }).ok, false)
})

test('with the committed config, a splitpost-app Preview may use only the staging project and its publishable key', () => {
  const ok = checkSupabaseTarget({ VERCEL_ENV: 'preview', VERCEL_PROJECT_ID: REAL_APP_ID, VITE_SUPABASE_URL: STAGING_SUPABASE_URL, VITE_SUPABASE_PUBLISHABLE_KEY: PUB }, { project: 'memberApp' })
  assert.equal(ok.ok, true, ok.message)
  for (const bad of [{ VITE_SUPABASE_URL: PRODUCTION_URL }, { VITE_SUPABASE_URL: '' }, { VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_secret_abcdefgh12345' }]) {
    const r = checkSupabaseTarget({ VERCEL_ENV: 'preview', VITE_SUPABASE_URL: STAGING_SUPABASE_URL, VITE_SUPABASE_PUBLISHABLE_KEY: PUB, ...bad }, { project: 'memberApp' })
    assert.equal(r.ok, false, JSON.stringify(bad))
  }
})

test('if the real member app ID were ever copied onto another project entry, nothing is recognised (fail closed)', () => {
  for (const k of ['publicSite', 'demo']) {
    const projects = { ...VERCEL_PROJECTS, [k]: { ...VERCEL_PROJECTS[k], projectId: REAL_APP_ID } }
    assert.equal(hasDuplicateProjectIds(projects), true)
    assert.equal(identifyProject({ VERCEL_PROJECT_ID: REAL_APP_ID }, projects), 'unknown')
    assert.equal(planBuild({ VERCEL_ENV: 'preview', VERCEL_PROJECT_ID: REAL_APP_ID }, [], projects).memberApp, undefined)
  }
})

test('the member app host in the config matches the host the app recognises', () => {
  const entry = readFileSync(new URL('../src/entry.ts', import.meta.url), 'utf8')
  assert.match(entry, new RegExp(`MEMBER_APP_HOSTS = \\['${VERCEL_PROJECTS.memberApp.host.replace(/\./g, '\\.')}'\\]`))
})

// --- Project identification ------------------------------------------------------

test('identifies each project only by its own exact ID', () => {
  assert.equal(identifyProject({ VERCEL_PROJECT_ID: APP_ID }, PROJECTS), 'memberApp')
  assert.equal(identifyProject({ VERCEL_PROJECT_ID: SITE_ID }, PROJECTS), 'publicSite')
  assert.equal(identifyProject({ VERCEL_PROJECT_ID: DEMO_ID }, PROJECTS), 'demo')
  for (const id of ['prj_SomeOtherProject00000000', APP_ID.toLowerCase(), `${APP_ID}x`, 'splitpost-app']) {
    assert.notEqual(identifyProject({ VERCEL_PROJECT_ID: id }, PROJECTS), 'memberApp', id)
  }
})

test('if two projects are ever given the same ID, nothing is recognised (fail closed)', () => {
  for (const clash of [SITE_ID, DEMO_ID]) {
    const projects = { ...PROJECTS, memberApp: { ...PROJECTS.memberApp, projectId: clash } }
    assert.equal(hasDuplicateProjectIds(projects), true)
    assert.equal(identifyProject({ VERCEL_PROJECT_ID: clash }, projects), 'unknown')
    assert.equal(checkBuildTarget({ ...APPROVED, VERCEL_PROJECT_ID: clash }, projects).ok, false)
  }
})

// --- Which build ------------------------------------------------------------------

test('the member app project always builds the member app, with the bundle and secret checks', () => {
  for (const env of [{ VERCEL_ENV: 'production' }, { VERCEL_ENV: 'preview' }, { VERCEL_ENV: 'preview', CREVANT_BUILD: 'site' }, { VERCEL_ENV: 'production', CREVANT_BUILD: 'site' }]) {
    const plan = planBuild({ ...env, VERCEL_PROJECT_ID: APP_ID }, [], PROJECTS)
    assert.equal(plan.mode, 'app', JSON.stringify(env))
    assert.equal(plan.memberApp, true)
    assert.deepEqual(commands(plan), [
      'node scripts/guard-build-target.mjs',
      'node scripts/check-supabase-target.mjs',
      'npx tsc -b',
      'npx vite build',
      'node scripts/check-member-app-bundle.mjs dist',
      'scripts/check-bundle-secrets.sh',
    ])
  }
})

test('the member bundle check runs in every member app build and receives the build environment (so Production is checked against the member project)', () => {
  for (const target of ['production', 'preview']) {
    const env = { VERCEL_ENV: target, VERCEL_PROJECT_ID: APP_ID }
    const plan = planBuild(env, [], PROJECTS)
    assert.ok(commands(plan).includes('node scripts/check-member-app-bundle.mjs dist'), target)
    assert.ok(commands(plan).indexOf('node scripts/check-member-app-bundle.mjs dist') > commands(plan).indexOf('npx vite build'), 'after the build')
    assert.equal(stepEnv(plan, env).VERCEL_ENV, target)
  }
})

test('member-only routing is compiled in for the member app build only, and never taken from project settings', () => {
  const member = planBuild({ VERCEL_ENV: 'preview', VERCEL_PROJECT_ID: APP_ID }, [], PROJECTS)
  assert.equal(stepEnv(member, {}).CREVANT_MEMBER_APP_BUILD, 'true')
  // A value set in a project's settings is overwritten: off everywhere else, on in the member app project.
  assert.equal(stepEnv(member, { CREVANT_MEMBER_APP_BUILD: 'false' }).CREVANT_MEMBER_APP_BUILD, 'true')
  for (const env of [{ VERCEL_ENV: 'preview', VERCEL_PROJECT_ID: SITE_ID }, { VERCEL_ENV: 'preview', VERCEL_PROJECT_ID: DEMO_ID }, { VERCEL_ENV: 'preview' }, { VERCEL_ENV: 'production', VERCEL_PROJECT_ID: SITE_ID }]) {
    const plan = planBuild(env, [], PROJECTS)
    assert.equal(stepEnv(plan, { CREVANT_MEMBER_APP_BUILD: 'true' }).CREVANT_MEMBER_APP_BUILD, '', JSON.stringify(env))
  }
  assert.equal(stepEnv(member, {}).CREVANT_BUILD_MODE, 'app')
})

test('a real member app build carries the marker and passes the bundle check; a full app build without the flag does not', () => {
  const build = (flag) => {
    const out = mkdtempSync(join(tmpdir(), 'member-build-'))
    const r = spawnSync('npx', ['vite', 'build', '--outDir', out, '--emptyOutDir', '--logLevel', 'error'], {
      cwd: new URL('..', import.meta.url).pathname,
      env: { ...process.env, CREVANT_MEMBER_APP_BUILD: flag, VITE_SUPABASE_URL: STAGING_SUPABASE_URL, VITE_SUPABASE_PUBLISHABLE_KEY: PUB, VERCEL_ENV: '' },
      encoding: 'utf8',
    })
    assert.equal(r.status, 0, r.stderr)
    const walk = (d) => readdirSync(d).flatMap((n) => (statSync(join(d, n)).isDirectory() ? walk(join(d, n)) : [join(d, n)]))
    const texts = Object.fromEntries(walk(out).filter((p) => /\.(js|css|html|txt)$/.test(p)).map((p) => [relative(out, p), readFileSync(p, 'utf8')]))
    rmSync(out, { recursive: true, force: true })
    return texts
  }
  const member = build('true')
  assert.ok(member['index.html'].includes(MEMBER_APP_MARKER))
  assert.deepEqual(checkMemberAppBundle(member), [])
  const full = build('')
  assert.equal(full['index.html'].includes(MEMBER_APP_MARKER), false)
  assert.ok(checkMemberAppBundle(full).some((p) => /marker is missing/.test(p)))
})

test('the public site and demo projects keep their existing builds', () => {
  assert.equal(planBuild({ VERCEL_ENV: 'production', VERCEL_PROJECT_ID: SITE_ID }, [], PROJECTS).mode, 'site')
  assert.equal(planBuild({ VERCEL_ENV: 'preview', VERCEL_PROJECT_ID: SITE_ID }, [], PROJECTS).mode, 'site')
  assert.equal(planBuild({ VERCEL_ENV: 'preview', VERCEL_PROJECT_ID: DEMO_ID }, [], PROJECTS).mode, 'app')
  assert.equal(planBuild({ VERCEL_ENV: 'production', VERCEL_PROJECT_ID: DEMO_ID }, [], PROJECTS).mode, 'site')
  for (const id of [SITE_ID, DEMO_ID]) assert.equal(planBuild({ VERCEL_ENV: 'preview', VERCEL_PROJECT_ID: id }, [], PROJECTS).memberApp, undefined)
})

// --- Vercel Production guard -------------------------------------------------------

test('allowed: the approved member app, in its own project, from a Git build of main', () => {
  const r = checkBuildTarget(APPROVED, PROJECTS)
  assert.equal(r.ok, true, r.message)
  assert.match(r.message, /member app \(approved\), project splitpost-app, muyiwaomosa\/crevant-prototype@main/)
})

test('refused: no approval, or anything but exactly "true"', () => {
  assert.equal(checkBuildTarget(without('CREVANT_MEMBER_APP_APPROVED'), PROJECTS).ok, false)
  for (const v of ['TRUE', '1', 'yes', 'false', '', ' ']) assert.equal(checkBuildTarget({ ...APPROVED, CREVANT_MEMBER_APP_APPROVED: v }, PROJECTS).ok, false, JSON.stringify(v))
})

test('refused: the public site build in the member app project, or no build mode at all', () => {
  assert.equal(checkBuildTarget({ ...APPROVED, CREVANT_BUILD_MODE: 'site' }, PROJECTS).ok, false)
  assert.equal(checkBuildTarget(without('CREVANT_BUILD_MODE'), PROJECTS).ok, false)
})

test('refused: the public site approval set in the member app project (a project mix up)', () => {
  for (const v of ['true', 'false', 'TRUE']) {
    const r = checkBuildTarget({ ...APPROVED, CREVANT_PRODUCTION_SITE_APPROVED: v }, PROJECTS)
    assert.equal(r.ok, false, v)
    assert.match(r.message, /belongs only to the splitpost project/)
  }
})

test('refused: another repository, an upload, or any branch but main', () => {
  for (const k of ['VERCEL_GIT_REPO_OWNER', 'VERCEL_GIT_REPO_SLUG', 'VERCEL_GIT_COMMIT_REF']) assert.equal(checkBuildTarget(without(k), PROJECTS).ok, false, k)
  assert.equal(checkBuildTarget({ ...APPROVED, VERCEL_GIT_REPO_OWNER: 'someone-else' }, PROJECTS).ok, false)
  assert.equal(checkBuildTarget({ ...APPROVED, VERCEL_GIT_REPO_SLUG: 'a-fork' }, PROJECTS).ok, false)
  for (const ref of ['demo', 'claude/pilot-m1-environment', 'Main', 'main2', 'develop']) {
    const r = checkBuildTarget({ ...APPROVED, VERCEL_GIT_COMMIT_REF: ref }, PROJECTS)
    assert.equal(r.ok, false, ref)
    assert.match(r.message, /Production builds only `main`/)
  }
})

test('refused: the member app approval in any other project never builds the member app for Production', () => {
  for (const id of [SITE_ID, DEMO_ID, 'prj_SomeOtherProject00000000', '']) {
    const r = checkBuildTarget({ ...APPROVED, VERCEL_PROJECT_ID: id }, PROJECTS)
    assert.equal(r.ok, false, id)
  }
  // The public site's own rule is unchanged: with its approval, in its project, it still builds.
  const site = { ...APPROVED, CREVANT_BUILD_MODE: 'site', CREVANT_PRODUCTION_SITE_APPROVED: 'true', VERCEL_PROJECT_ID: SITE_ID }
  delete site.CREVANT_MEMBER_APP_APPROVED
  assert.equal(checkBuildTarget(site, PROJECTS).ok, true)
})

test('Previews in the member app project are not blocked by the Production guard', () => {
  assert.equal(checkBuildTarget({ VERCEL_ENV: 'preview', VERCEL_PROJECT_ID: APP_ID, CREVANT_BUILD_MODE: 'app' }, PROJECTS).ok, true)
})

// --- Supabase target ------------------------------------------------------------------

const memberEnv = (target, extra = {}) => ({ VERCEL_ENV: target, VERCEL_PROJECT_ID: APP_ID, VITE_SUPABASE_URL: STAGING_SUPABASE_URL, VITE_SUPABASE_PUBLISHABLE_KEY: PUB, ...extra })
const supa = (env) => checkSupabaseTarget(env, { project: 'memberApp' })

test('allowed: Preview, development and local builds use the staging (pilot) project with a publishable key (unchanged)', () => {
  for (const target of ['preview', 'development', '']) {
    const r = supa(memberEnv(target))
    assert.equal(r.ok, true, r.message)
    assert.match(r.message, /staging \(pilot\) project/)
  }
  assert.equal(supa(memberEnv('preview', { VITE_SUPABASE_URL: `${STAGING_SUPABASE_URL}/` })).ok, true)
})

// The committed config records the member Production project. The matrix
// below uses this stand-in (never a real project) so it does not depend on it.
const MEMBER_REF = 'memberprodtestonly01'
const MEMBER_URL = `https://${MEMBER_REF}.supabase.co`
const WITH_MEMBER = { staging: REFS.staging, production: REFS.production, memberProduction: MEMBER_REF }
const supaWith = (env, refs = WITH_MEMBER) => checkSupabaseTarget(env, { project: 'memberApp', refs })

test('committed config: member Production builds only against the recorded member project, never staging or another project', () => {
  assert.match(REFS.memberProduction, /^[a-z]{20}$/)
  const url = `https://${REFS.memberProduction}.supabase.co`
  const r = supa(memberEnv('production', { VITE_SUPABASE_URL: url }))
  assert.equal(r.ok, true, r.message)
  assert.match(r.message, new RegExp(`member Production project \\(${REFS.memberProduction}\\)`))
  for (const extra of [{}, { VITE_SUPABASE_URL: '', VITE_SUPABASE_PUBLISHABLE_KEY: '' }, { VITE_SUPABASE_URL: 'https://abcdefghijabcdefghij.supabase.co' }, { VITE_SUPABASE_URL: MEMBER_URL }, { VITE_SUPABASE_URL: url, VITE_SUPABASE_PUBLISHABLE_KEY: '' }]) {
    assert.equal(supa(memberEnv('production', extra)).ok, false, JSON.stringify(extra))
  }
})

test('matrix, once the member project is configured: Production allows only it; Preview only staging; swapped values refused', () => {
  const cases = [
    // [target, extra env, ok, message]
    ['production', { VITE_SUPABASE_URL: MEMBER_URL }, true, /member Production project \(memberprodtestonly01\)/],
    ['production', { VITE_SUPABASE_URL: `${MEMBER_URL}/` }, true, /member Production project/],
    ['production', {}, false, /never use the staging \(pilot\) project/], // Preview values swapped into Production
    ['production', { VITE_SUPABASE_URL: PRODUCTION_URL }, false, /never use the Production waitlist project/],
    ['production', { VITE_SUPABASE_URL: '' }, false, /exactly the member Production project/],
    ['production', { VITE_SUPABASE_URL: MEMBER_URL, VITE_SUPABASE_PUBLISHABLE_KEY: '' }, false, /member Production publishable key/],
    ['production', { VITE_SUPABASE_URL: MEMBER_URL, VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_secret_abc12345678' }, false, /secret or service key/],
    ['production', { VITE_SUPABASE_URL: MEMBER_URL, VITE_SUPABASE_PUBLISHABLE_KEY: jwt('service_role') }, false, /secret or service key/],
    ['production', { VITE_SUPABASE_URL: MEMBER_URL, VITE_WAITLIST_ENDPOINT: `${PRODUCTION_URL}/functions/v1/join-waitlist` }, false, /must not be set/],
    ['production', { VITE_SUPABASE_URL: 'https://abcdefghijabcdefghij.supabase.co' }, false, /exactly the member Production project/],
    ['preview', {}, true, /staging \(pilot\) project/],
    ['preview', { VITE_SUPABASE_URL: MEMBER_URL }, false, /never use the member Production project/], // Production values swapped into a Preview
    ['preview', { VITE_SUPABASE_URL: PRODUCTION_URL }, false, /never use the Production waitlist project/],
    ['preview', { VITE_SUPABASE_URL: '' }, false, /exactly the staging \(pilot\) project/],
    ['preview', { VITE_SUPABASE_PUBLISHABLE_KEY: '' }, false, /staging publishable key/],
    ['preview', { VITE_WAITLIST_ENDPOINT: `${STAGING_SUPABASE_URL}/functions/v1/join-waitlist` }, false, /must not be set/],
    ['', { VITE_SUPABASE_URL: MEMBER_URL }, false, /never use the member Production project/],
    ['development', { VITE_SUPABASE_URL: MEMBER_URL }, false, /never use the member Production project/],
    ['staging', {}, false, /unknown build environment "staging"/],
    ['prod', { VITE_SUPABASE_URL: MEMBER_URL }, false, /unknown build environment "prod"/],
  ]
  for (const [target, extra, ok, message] of cases) {
    const r = supaWith(memberEnv(target, extra))
    assert.equal(r.ok, ok, `${target} ${JSON.stringify(extra)}: ${r.message}`)
    assert.match(r.message, message, `${target} ${JSON.stringify(extra)}`)
  }
})

test('matrix: a broken project list fails every member build (missing, malformed or duplicate references)', () => {
  const broken = [
    { staging: null, production: REFS.production, memberProduction: MEMBER_REF },
    { staging: 'Not-A-Ref', production: REFS.production, memberProduction: MEMBER_REF },
    { staging: REFS.staging, production: REFS.production, memberProduction: 'too-short' },
    { staging: REFS.staging, production: REFS.production, memberProduction: 'MEMBERPRODTESTONLY01' },
    { staging: REFS.staging, production: REFS.production, memberProduction: REFS.staging },
    { staging: REFS.staging, production: REFS.production, memberProduction: REFS.production },
    { staging: REFS.staging, production: REFS.staging, memberProduction: MEMBER_REF },
  ]
  for (const refs of broken) {
    for (const [target, url] of [['production', MEMBER_URL], ['preview', STAGING_SUPABASE_URL]]) {
      const r = supaWith(memberEnv(target, { VITE_SUPABASE_URL: url }), refs)
      assert.equal(r.ok, false, `${target} ${JSON.stringify(refs)}`)
      assert.match(r.message, /Supabase project list/, JSON.stringify(refs))
    }
  }
})

test('refused: the Production waitlist project, in any form, in any environment', () => {
  for (const target of ['production', 'preview', '']) {
    for (const url of [PRODUCTION_URL, `${PRODUCTION_URL}/`, `https://${REFS.production}.supabase.com`]) {
      const r = supa(memberEnv(target, { VITE_SUPABASE_URL: url }))
      assert.equal(r.ok, false, `${target} ${url}`)
      assert.match(r.message, /never use the Production waitlist project/)
    }
  }
})

test('refused: no Supabase values, another project, a local stack, or a missing key', () => {
  for (const extra of [
    { VITE_SUPABASE_URL: '', VITE_SUPABASE_PUBLISHABLE_KEY: '' },
    { VITE_SUPABASE_URL: 'https://abcdefghijabcdefghij.supabase.co' },
    { VITE_SUPABASE_URL: 'http://127.0.0.1:54321' },
    { VITE_SUPABASE_URL: 'https://evil.example' },
    { VITE_SUPABASE_PUBLISHABLE_KEY: '' },
    { VITE_SUPABASE_PUBLISHABLE_KEY: jwt('anon') },
  ]) {
    for (const target of ['production', 'preview']) assert.equal(supa(memberEnv(target, extra)).ok, false, `${target} ${JSON.stringify(extra)}`)
  }
})

test('refused: secret or service keys', () => {
  for (const key of ['sb_secret_abc12345678', jwt('service_role'), 'not.a.jwt']) assert.equal(supa(memberEnv('production', { VITE_SUPABASE_PUBLISHABLE_KEY: key })).ok, false, key)
})

test('refused: any waitlist address (members never use the waitlist form), staging or Production', () => {
  for (const ep of [`${STAGING_SUPABASE_URL}/functions/v1/join-waitlist`, `${PRODUCTION_URL}/functions/v1/join-waitlist`]) {
    const r = supa(memberEnv('production', { VITE_WAITLIST_ENDPOINT: ep }))
    assert.equal(r.ok, false, ep)
  }
})

test('refused: a broken project list (missing staging, or staging the same as Production)', () => {
  const env = memberEnv('preview')
  assert.equal(checkSupabaseTarget(env, { project: 'memberApp', refs: { staging: null, production: REFS.production } }).ok, false)
  assert.equal(checkSupabaseTarget(env, { project: 'memberApp', refs: { staging: REFS.staging, production: REFS.staging } }).ok, false)
})

test('other projects never use the member Production project, in any environment', () => {
  for (const project of ['publicSite', 'demo', 'unknown', 'none']) {
    for (const target of ['production', 'preview', '']) {
      for (const extra of [{ VITE_SUPABASE_URL: MEMBER_URL, VITE_SUPABASE_PUBLISHABLE_KEY: PUB }, { VITE_WAITLIST_ENDPOINT: `${MEMBER_URL}/functions/v1/join-waitlist` }]) {
        const r = checkSupabaseTarget({ VERCEL_ENV: target, ...extra }, { project, refs: WITH_MEMBER })
        assert.equal(r.ok, false, `${project} ${target} ${JSON.stringify(extra)}`)
        // Refused by the dedicated rule, not only by other rules that happen to overlap today.
        assert.match(r.message, /points at the member Production project/, `${project} ${target} ${JSON.stringify(extra)}`)
      }
    }
  }
})

test('the existing rules for other projects are unchanged', () => {
  // Outside the member app project, Production still must have no Supabase values.
  assert.equal(checkSupabaseTarget({ VERCEL_ENV: 'production', VITE_SUPABASE_URL: STAGING_SUPABASE_URL, VITE_SUPABASE_PUBLISHABLE_KEY: PUB }, { project: 'publicSite' }).ok, false)
  assert.equal(checkSupabaseTarget({ VERCEL_ENV: 'production' }, { project: 'publicSite' }).ok, true)
  assert.equal(checkSupabaseTarget({ VERCEL_ENV: 'preview', VITE_SUPABASE_URL: STAGING_SUPABASE_URL, VITE_SUPABASE_PUBLISHABLE_KEY: PUB }, { project: 'demo' }).ok, true)
})

// --- The finished bundle --------------------------------------------------------------

const stagingHost = `${REFS.staging}.supabase.co`

const HTML = `<!doctype html><html><head>${MEMBER_APP_MARKER}</head></html>`

test('bundle: passes when it points only at the staging (pilot) project, with member-only routing compiled in', () => {
  assert.deepEqual(checkMemberAppBundle({ 'index.html': HTML, 'assets/index.js': `const u="https://${stagingHost}";const k="${PUB}";` }), [])
})

test('bundle: refused when member-only routing was not compiled in (its Previews would show public pages)', () => {
  const js = { 'assets/index.js': `const u="https://${stagingHost}";` }
  assert.ok(checkMemberAppBundle({ 'index.html': '<!doctype html><html><head></head></html>', ...js }).some((p) => /member app build marker is missing/.test(p)))
  assert.ok(checkMemberAppBundle(js).some((p) => /index\.html is missing/.test(p)))
})

test('bundle: refused when the Production project reference appears anywhere', () => {
  for (const text of [`"https://${REFS.production}.supabase.co"`, `ref:"${REFS.production}"`, `https://${stagingHost} ${REFS.production}`]) {
    const problems = checkMemberAppBundle({ 'assets/index.js': `"https://${stagingHost}" ${text}` })
    assert.ok(problems.some((p) => /Production project reference/.test(p)), text)
  }
})

test('bundle: refused when it does not point at staging, or points at any other project', () => {
  assert.ok(checkMemberAppBundle({ 'assets/index.js': 'no supabase here' }).some((p) => /does not point at the staging/.test(p)))
  assert.ok(checkMemberAppBundle({ 'assets/index.js': `"https://${stagingHost}" "https://abcdefghijabcdefghij.supabase.co"` }).some((p) => /other than staging/.test(p)))
})

test('bundle: refused when it carries a waitlist address or anything secret', () => {
  for (const leak of ['/functions/v1/join-waitlist', 'sb_secret_abcdefgh12345', 'service_role', 'postgresql://u:p@db.example:5432/x', '-----BEGIN PRIVATE KEY-----']) {
    assert.ok(checkMemberAppBundle({ 'a.js': `"https://${stagingHost}" ${leak}` }).length > 0, leak)
  }
})

test('bundle, Production: fails closed with no member project recorded, and with the committed one accepts only it', () => {
  const problems = checkMemberAppBundle({ 'index.html': HTML, 'a.js': `"https://${stagingHost}"` }, { ...REFS, memberProduction: null }, 'production')
  assert.equal(problems.length, 1)
  assert.match(problems[0], /member Production project is not configured/)
  assert.deepEqual(checkMemberAppBundle({ 'index.html': HTML, 'a.js': `"https://${REFS.memberProduction}.supabase.co" "${PUB}"` }, REFS, 'production'), [])
  assert.ok(checkMemberAppBundle({ 'index.html': HTML, 'a.js': `"https://${stagingHost}"` }, REFS, 'production').length > 0, 'staging is refused in a Production build')
})

test('bundle matrix, once the member project is configured', () => {
  const memberHost = `${MEMBER_REF}.supabase.co`
  const js = (body) => ({ 'index.html': HTML, 'assets/index.js': body })
  // Production: only the member project.
  assert.deepEqual(checkMemberAppBundle(js(`"https://${memberHost}" "${PUB}"`), WITH_MEMBER, 'production'), [])
  assert.ok(checkMemberAppBundle(js(`"https://${stagingHost}"`), WITH_MEMBER, 'production').some((p) => /staging \(pilot\) project reference, in a Production build/.test(p)))
  assert.ok(checkMemberAppBundle(js(`"https://${memberHost}" "https://${stagingHost}"`), WITH_MEMBER, 'production').some((p) => /staging/.test(p)))
  assert.ok(checkMemberAppBundle(js('no supabase here'), WITH_MEMBER, 'production').some((p) => /does not point at the member Production project/.test(p)))
  assert.ok(checkMemberAppBundle(js(`"https://${memberHost}" ${REFS.production}`), WITH_MEMBER, 'production').some((p) => /Production waitlist database/.test(p)))
  assert.ok(checkMemberAppBundle(js(`"https://${memberHost}" "https://abcdefghijabcdefghij.supabase.co"`), WITH_MEMBER, 'production').some((p) => /other than the member Production project/.test(p)))
  // Previews: only staging, never the member project.
  assert.deepEqual(checkMemberAppBundle(js(`"https://${stagingHost}"`), WITH_MEMBER, 'preview'), [])
  assert.ok(checkMemberAppBundle(js(`"https://${stagingHost}" ${MEMBER_REF}`), WITH_MEMBER, 'preview').some((p) => /member Production project reference, in a non-Production build/.test(p)))
  assert.ok(checkMemberAppBundle(js(`"https://${memberHost}"`), WITH_MEMBER, '').some((p) => /does not point at the staging/.test(p)))
  // A broken list fails both.
  for (const target of ['production', 'preview']) {
    assert.ok(checkMemberAppBundle(js(`"https://${memberHost}"`), { ...WITH_MEMBER, memberProduction: REFS.staging }, target).some((p) => /are the same/.test(p)), target)
    assert.ok(checkMemberAppBundle(js(`"https://${memberHost}"`), { ...WITH_MEMBER, memberProduction: 'bad' }, target).some((p) => /malformed/.test(p)), target)
  }
})

test('bundle: refused when the project list itself is broken', () => {
  assert.ok(checkMemberAppBundle({ 'a.js': stagingHost }, { staging: null, production: REFS.production }).length > 0)
  assert.ok(checkMemberAppBundle({ 'a.js': stagingHost }, { staging: REFS.staging, production: REFS.staging }).length > 0)
})

// --- Headers on app.splitpost.ca (vercel.json) -----------------------------------------

test('app.splitpost.ca gets its own host-specific policy: no Supabase host until the member project is configured, and never staging or the waitlist', async () => {
  // Defence in depth only: the build checks above are the boundary, and work without this.
  const { VERCEL } = await import('./vercel-robots.mjs')
  const host = VERCEL_PROJECTS.memberApp.host
  const applies = (rule) => (!rule.has || rule.has.every((c) => c.type === 'host' && c.value === host)) && (!rule.missing || !rule.missing.some((c) => c.type === 'host' && c.value === host))
  const headers = VERCEL.headers.filter(applies).flatMap((r) => r.headers)
  const csps = headers.filter((h) => h.key === 'Content-Security-Policy').map((h) => h.value)
  assert.equal(csps.length, 1, 'exactly one security policy applies')
  const directive = (name) => csps[0].split(';').map((d) => d.trim()).find((d) => d.startsWith(name)).split(/\s+/).slice(1)
  const expected = REFS.memberProduction ? [`https://${REFS.memberProduction}.supabase.co`] : []
  assert.deepEqual(directive('connect-src'), ["'self'", ...expected])
  assert.deepEqual(directive('img-src'), ["'self'", 'data:', 'blob:', ...expected])
  assert.ok(!csps[0].includes(REFS.staging), 'the staging project is never reachable from the member Production address')
  assert.ok(!csps[0].includes(REFS.production), 'the Production waitlist project is never reachable from the member app address')
  for (const [k, v] of [['X-Frame-Options', 'DENY'], ['X-Content-Type-Options', 'nosniff'], ['Referrer-Policy', 'strict-origin-when-cross-origin']]) {
    assert.ok(headers.some((h) => h.key === k && h.value === v), k)
  }
})

test('app.splitpost.ca is never indexed, on any path', async () => {
  const { headerNoindex } = await import('./vercel-robots.mjs')
  for (const p of ['/', '/app', '/app/discover', '/sign-in', '/auth/confirm', '/join', '/privacy']) assert.equal(headerNoindex(VERCEL_PROJECTS.memberApp.host, p), true, p)
})

// --- The build command is pinned (vercel.json) ----------------------------------------

test('vercel.json pins the build command to npm run build, so the guards always run on Vercel', () => {
  const vercel = JSON.parse(readFileSync(new URL('../vercel.json', import.meta.url), 'utf8'))
  const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'))
  // Vercel documents that vercel.json's buildCommand overrides the dashboard's Build Command.
  assert.equal(vercel.buildCommand, 'npm run build')
  assert.equal(pkg.scripts.build, 'node scripts/build.mjs')
  // Nothing else about the build is overridden here (install, output, framework stay as detected).
  for (const k of ['installCommand', 'outputDirectory', 'framework', 'devCommand', 'ignoreCommand']) assert.equal(vercel[k], undefined, k)
})
