// Tests for the public site bundle check. Run with: node --test scripts/*.test.mjs
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { checkSiteBundle } from './check-site-bundle.mjs'

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

test('build:site keeps the Production block, then checks the bundle and scans for secrets', async () => {
  const { readFileSync } = await import('node:fs')
  const { checkBuildTarget } = await import('./guard-build-target.mjs')
  const scripts = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).scripts
  assert.equal(
    scripts['build:site'],
    'node scripts/guard-build-target.mjs && tsc -b && vite build --mode site && node scripts/check-site-bundle.mjs dist && scripts/check-bundle-secrets.sh',
  )
  // Production stays on the demo: the site build is refused for Production
  // until a reviewed, approved change moves Production to it.
  assert.equal(checkBuildTarget({ VERCEL_ENV: 'production' }).ok, false)
  assert.equal(checkBuildTarget({ VERCEL_ENV: 'preview' }).ok, true)
})
