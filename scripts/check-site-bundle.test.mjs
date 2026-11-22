// Tests for the public site bundle check. Run with: node --test scripts/*.test.mjs
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { ALLOWED_MEMBER_LINK, checkSiteBundle, forbiddenProjectRefs } from './check-site-bundle.mjs'

const INDEX = '<!doctype html><html><head><meta charset="UTF-8" />\n<meta name="crevant-build" content="public-site" /></head><body><script type="module" src="/assets/index-abc.js"></script></body></html>'
const CLEAN_JS = 'const a=`/join`,b=`/tour`;function ul(e){if(/^sb_secret_/i.test(e))return!0}'

function bundle({ index = INDEX, js = CLEAN_JS, extra = {} } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'site-bundle-'))
  mkdirSync(join(dir, 'assets'))
  writeFileSync(join(dir, 'index.html'), index)
  writeFileSync(join(dir, 'assets', 'index-abc.js'), js)
  for (const [name, text] of Object.entries(extra)) writeFileSync(join(dir, name), text)
  return dir
}

test('a clean public site build passes, including the bare key prefix used by safety checks', () => {
  assert.deepEqual(checkSiteBundle(bundle()), [])
})

test('the build must be marked as the public site and must not point at source files', () => {
  assert.match(checkSiteBundle(bundle({ index: INDEX.replace(' content="public-site"', '') })).join('\n'), /crevant-build marker/)
  assert.match(checkSiteBundle(bundle({ index: INDEX.replace('/assets/index-abc.js', '/src/main.tsx') })).join('\n'), /source files/)
  assert.match(checkSiteBundle('/no/such/dir').join('\n'), /not found/)
})

test('every kind of member code, route, address, key or secret is caught', () => {
  const planted = {
    'Supabase client library': 'x="supabase-js/2.0"',
    'Supabase Auth API': 'fetch(u+"/auth/v1/token")',
    'Supabase Data API': 'fetch(u+"/rest/v1/profiles")',
    'Supabase Storage or Realtime': 'u+"/realtime/v1/websocket"',
    'sign in or password code': 'c.auth.signInWithPassword(x)',
    'a member route': '{path:`/sign-in`}',
    'the members area route': 'to:"/app"',
    'member page text': '"Your profile is ready"',
    'a Supabase project address': '"https://kpudeppgokpjhvaqrprn.supabase.co"',
    'a Supabase key': '"sb_publishable_abcdefgh12345"',
    'a JSON Web Token': '"eyJhbGciOiJIUzI1NiJ9.eyJyb2xlIjoiYW5vbiJ9.sig"',
    'a secret': '"service_role"',
  }
  for (const [label, js] of Object.entries(planted)) {
    const problems = checkSiteBundle(bundle({ js: `${CLEAN_JS};${js}` }))
    assert.ok(problems.some((p) => p.includes(label)), `${label} was not caught: ${problems.join(' | ')}`)
  }
})

test('the waitlist function address is the only Supabase address allowed', () => {
  assert.deepEqual(checkSiteBundle(bundle({ js: `${CLEAN_JS};fetch("https://kpudeppgokpjhvaqrprn.supabase.co/functions/v1/join-waitlist")` })), [])
  for (const js of [
    'fetch("https://kpudeppgokpjhvaqrprn.supabase.co/functions/v1/join-waitlist-admin")',
    'fetch("https://kpudeppgokpjhvaqrprn.supabase.co/functions/v1/other")',
    'x="https://kpudeppgokpjhvaqrprn.supabase.co"',
  ]) {
    assert.match(checkSiteBundle(bundle({ js: `${CLEAN_JS};${js}` })).join('\n'), /a Supabase project address/, js)
  }
})

test('member content is caught in any text file, and source maps are refused', () => {
  assert.match(checkSiteBundle(bundle({ extra: { 'extra.html': '<a href="/forgot-password">' } })).join('\n'), /extra\.html: a member route/)
  assert.match(checkSiteBundle(bundle({ extra: { 'index-abc.js.map': '{}' } })).join('\n'), /source maps/)
})

test('build:site goes through the build entry point, which keeps the Production block', async () => {
  const { readFileSync } = await import('node:fs')
  const { checkBuildTarget } = await import('./guard-build-target.mjs')
  const scripts = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).scripts
  assert.equal(
    scripts['build:site'],
    'node scripts/build.mjs --site',
  )
  // Production stays on the demo: the site build is refused for Production
  // until the switch is approved (CREVANT_PRODUCTION_SITE_APPROVED).
  assert.equal(checkBuildTarget({ VERCEL_ENV: 'production' }).ok, false)
  assert.equal(checkBuildTarget({ VERCEL_ENV: 'production', CREVANT_BUILD_MODE: 'site' }).ok, false)
  assert.equal(checkBuildTarget({ VERCEL_ENV: 'preview' }).ok, true)
})

test('a Production build may not contain the staging project, and no other build the Production project', () => {
  const projects = { staging: { ref: 'kpudeppgokpjhvaqrprn' }, production: { ref: 'abcdefghijabcdefghij' } }
  assert.deepEqual(forbiddenProjectRefs({ VERCEL_ENV: 'production' }, projects), ['kpudeppgokpjhvaqrprn'])
  assert.deepEqual(forbiddenProjectRefs({ VERCEL_ENV: 'preview' }, projects), ['abcdefghijabcdefghij'])
  assert.deepEqual(forbiddenProjectRefs({ VERCEL_ENV: 'preview' }, { ...projects, production: { ref: null } }), [])
  // The member Production project, once recorded, is forbidden in every public site build.
  const withMember = { ...projects, memberProduction: { ref: 'memberprodtestonly01' } }
  assert.deepEqual(forbiddenProjectRefs({ VERCEL_ENV: 'production' }, withMember), ['kpudeppgokpjhvaqrprn', 'memberprodtestonly01'])
  assert.deepEqual(forbiddenProjectRefs({ VERCEL_ENV: 'preview' }, withMember), ['abcdefghijabcdefghij', 'memberprodtestonly01'])
  assert.deepEqual(forbiddenProjectRefs({ VERCEL_ENV: 'preview' }, { ...projects, memberProduction: { ref: null } }), ['abcdefghijabcdefghij'])
  const stagingFn = 'fetch("https://kpudeppgokpjhvaqrprn.supabase.co/functions/v1/join-waitlist")'
  assert.deepEqual(checkSiteBundle(bundle({ js: `${CLEAN_JS};${stagingFn}` })), [])
  assert.match(checkSiteBundle(bundle({ js: `${CLEAN_JS};${stagingFn}` }), { forbiddenRefs: ['kpudeppgokpjhvaqrprn'] }).join('\n'), /must never use/)
})

test('test-only code is refused', () => {
  for (const js of ['import("../e2e/edge/waitlist-e2e/index.ts")', 'x="waitlist-e2e"']) {
    assert.match(checkSiteBundle(bundle({ js: `${CLEAN_JS};${js}` })).join('\n'), /test-only code/, js)
  }
})

// The failure seen on the splitpost Preview builds of PRs #41 and #43: the
// browser code passed the whole import.meta.env object, so Vite copied every
// VITE_ variable of the build environment into the bundle, including one
// holding the Production project's address. The check must keep refusing it.
test('a copied environment object carrying a project address, a database URL or a key is refused', () => {
  const leaked = [
    'const e={BASE_URL:`/`,MODE:`site`,VITE_SOME_SETTING:`https://hmrliwoychnqrbbydorg.supabase.co`}',
    'const e={VITE_OTHER:`https://kpudeppgokpjhvaqrprn.supabase.co`}',
    'const e={VITE_DB:`postgresql://postgres.hmrliwoychnqrbbydorg:pw@aws-0-us-west-2.pooler.supabase.com:5432/postgres`}',
    'const e={VITE_KEY:`sb_publishable_abcdefghijklmnop`}',
  ]
  for (const js of leaked) assert.notDeepEqual(checkSiteBundle(bundle({ js: `${CLEAN_JS};${js}` })), [], js)
})

test('only the waitlist function itself is allowed, and only for the right build', () => {
  const projects = { staging: { ref: 'kpudeppgokpjhvaqrprn' }, production: { ref: 'hmrliwoychnqrbbydorg' } }
  const prodFn = 'fetch(`https://hmrliwoychnqrbbydorg.supabase.co/functions/v1/join-waitlist`)'
  const stagingFn = 'fetch(`https://kpudeppgokpjhvaqrprn.supabase.co/functions/v1/join-waitlist`)'
  // Production: its own function only.
  assert.deepEqual(checkSiteBundle(bundle({ js: `${CLEAN_JS};${prodFn}` }), { forbiddenRefs: forbiddenProjectRefs({ VERCEL_ENV: 'production' }, projects) }), [])
  assert.notDeepEqual(checkSiteBundle(bundle({ js: `${CLEAN_JS};${stagingFn}` }), { forbiddenRefs: forbiddenProjectRefs({ VERCEL_ENV: 'production' }, projects) }), [])
  // A Preview: never the Production project, not even its function.
  assert.notDeepEqual(checkSiteBundle(bundle({ js: `${CLEAN_JS};${prodFn}` }), { forbiddenRefs: forbiddenProjectRefs({ VERCEL_ENV: 'preview' }, projects) }), [])
  // Any other path on a project, even with the function name later on the line, is refused.
  assert.notDeepEqual(checkSiteBundle(bundle({ js: `${CLEAN_JS};fetch("https://hmrliwoychnqrbbydorg.supabase.co/rest/v1/x")` })), [])
  assert.notDeepEqual(checkSiteBundle(bundle({ js: `${CLEAN_JS};fetch("https://hmrliwoychnqrbbydorg.supabase.co/functions/v1/join-waitlist-admin")` })), [])
})

test('the member app address code (app.splitpost.ca routes and layout) never reaches the public site', () => {
  for (const js of ['const h=["app.splitpost.ca"]', '"data-testid":"member-host-header"', '"data-testid":"member-host-footer"', '"data-testid":"public-site-link"', '<meta name="crevant-build" content="member-app" />']) {
    const problems = checkSiteBundle(bundle({ js: `${CLEAN_JS};${js}` }))
    assert.ok(problems.some((p) => /member app address code/.test(p)), js)
  }
})

test('the member sign-in link is allowed only as the exact, complete address', () => {
  assert.equal(ALLOWED_MEMBER_LINK, 'https://app.splitpost.ca/sign-in')
  for (const q of ['"', "'", '`']) {
    const js = `${CLEAN_JS};const s=${q}https://app.splitpost.ca/sign-in${q},t=${q}https://app.splitpost.ca/sign-in${q};`
    assert.deepEqual(checkSiteBundle(bundle({ js })), [], `quoted with ${q}`)
  }
  // In the HTML too (an <a href>).
  assert.deepEqual(checkSiteBundle(bundle({ extra: { 'pilot-access.html': '<a href="https://app.splitpost.ca/sign-in">Sign In</a>' } })), [])
  const refused = [
    'https://app.splitpost.ca/sign-in?next=/app',
    'https://app.splitpost.ca/sign-in/',
    'https://app.splitpost.ca/sign-in#x',
    'https://app.splitpost.ca/sign-inx',
    'https://app.splitpost.ca/sign-in/../app',
    'https://app.splitpost.ca/app',
    'https://app.splitpost.ca/',
    'https://app.splitpost.ca',
    'http://app.splitpost.ca/sign-in',
    '//app.splitpost.ca/sign-in',
    'https://APP.SPLITPOST.CA/sign-in',
    'https://App.Splitpost.ca/sign-in',
    'https://app.splitpost.ca:443/sign-in',
    'https://evil.app.splitpost.ca/sign-in',
    'https://app.splitpost.ca.evil.example/sign-in',
    'x https://app.splitpost.ca/sign-in',
    'https://app.splitpost.ca/sign-in https://app.splitpost.ca/app',
  ]
  for (const url of refused) {
    const problems = checkSiteBundle(bundle({ js: `${CLEAN_JS};const u="${url}";` }))
    assert.ok(problems.some((p) => /member app address code/.test(p)), url)
  }
  // Unquoted, or the allowed link next to other member app code: the rest is still caught.
  assert.ok(checkSiteBundle(bundle({ js: `${CLEAN_JS};u=https://app.splitpost.ca/sign-in;` })).some((p) => /member app address code/.test(p)))
  assert.ok(checkSiteBundle(bundle({ js: `${CLEAN_JS};a="https://app.splitpost.ca/sign-in";b="member-host-header";` })).some((p) => /member app address code/.test(p)))
  // The allowance never lets in sign-in code, a member route or the Supabase client.
  for (const [js, label] of [
    ['a="https://app.splitpost.ca/sign-in";x.auth.signInWithPassword(e)', /sign in or password code/],
    ['a="https://app.splitpost.ca/sign-in";r="/sign-in"', /a member route/],
    ['a="https://app.splitpost.ca/sign-in";import("@supabase/supabase-js")', /Supabase client library/],
  ]) {
    assert.ok(checkSiteBundle(bundle({ js: `${CLEAN_JS};${js}` })).some((p) => label.test(p)), js)
  }
})
