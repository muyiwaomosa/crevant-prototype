// Tests for the build-time Supabase target check. Run with: node --test scripts/*.test.mjs
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { checkSupabaseTarget, PROJECTS, STAGING_SUPABASE_URL } from './check-supabase-target.mjs'

const PUB = 'sb_publishable_f_Rjmc-I3QYgSiqYd5bIUw_P-vQxvUz'
const jwt = (role) => `eyJhbGciOiJIUzI1NiJ9.${Buffer.from(JSON.stringify({ role })).toString('base64url')}.sig`

test('Preview must use the staging project with a publishable key', () => {
  assert.equal(checkSupabaseTarget({ VERCEL_ENV: 'preview', VITE_SUPABASE_URL: STAGING_SUPABASE_URL, VITE_SUPABASE_PUBLISHABLE_KEY: PUB }).ok, true)
  assert.equal(checkSupabaseTarget({ VERCEL_ENV: 'preview', VITE_SUPABASE_URL: `${STAGING_SUPABASE_URL}/`, VITE_SUPABASE_PUBLISHABLE_KEY: PUB }).ok, true)
  for (const env of [
    {},
    { VITE_SUPABASE_URL: 'https://abcdefghijabcdefghij.supabase.co', VITE_SUPABASE_PUBLISHABLE_KEY: PUB },
    { VITE_SUPABASE_URL: 'http://127.0.0.1:54321', VITE_SUPABASE_PUBLISHABLE_KEY: PUB },
    { VITE_SUPABASE_URL: STAGING_SUPABASE_URL },
    { VITE_SUPABASE_URL: STAGING_SUPABASE_URL, VITE_SUPABASE_PUBLISHABLE_KEY: jwt('anon') },
  ])
    assert.equal(checkSupabaseTarget({ VERCEL_ENV: 'preview', ...env }).ok, false, JSON.stringify(env))
})

test('Production must have no Supabase values', () => {
  assert.equal(checkSupabaseTarget({ VERCEL_ENV: 'production' }).ok, true)
  assert.equal(checkSupabaseTarget({ VERCEL_ENV: 'production', VITE_SUPABASE_URL: STAGING_SUPABASE_URL, VITE_SUPABASE_PUBLISHABLE_KEY: PUB }).ok, false)
})

test('secret and service keys are refused everywhere', () => {
  for (const target of ['', 'preview', 'production', 'development'])
    for (const key of ['sb_secret_abc', jwt('service_role'), 'not.a.jwt'])
      assert.equal(checkSupabaseTarget({ VERCEL_ENV: target, VITE_SUPABASE_URL: STAGING_SUPABASE_URL, VITE_SUPABASE_PUBLISHABLE_KEY: key }).ok, false, `${target} ${key}`)
})

test('local builds allow nothing, staging, or a local stack only', () => {
  assert.equal(checkSupabaseTarget({}).ok, true)
  assert.equal(checkSupabaseTarget({ VITE_SUPABASE_URL: 'http://127.0.0.1:54321', VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_local' }).ok, true)
  assert.equal(checkSupabaseTarget({ VITE_SUPABASE_URL: STAGING_SUPABASE_URL, VITE_SUPABASE_PUBLISHABLE_KEY: PUB }).ok, true)
  assert.equal(checkSupabaseTarget({ VITE_SUPABASE_URL: 'https://evil.example', VITE_SUPABASE_PUBLISHABLE_KEY: PUB }).ok, false)
  assert.equal(checkSupabaseTarget({ VITE_SUPABASE_URL: STAGING_SUPABASE_URL }).ok, false)
})

test('the waitlist address may only be the staging function (or a local stack), and never in Production yet', () => {
  const base = { VITE_SUPABASE_URL: STAGING_SUPABASE_URL, VITE_SUPABASE_PUBLISHABLE_KEY: PUB }
  const fn = `${STAGING_SUPABASE_URL}/functions/v1/join-waitlist`
  assert.equal(checkSupabaseTarget({ VERCEL_ENV: 'preview', ...base, VITE_WAITLIST_ENDPOINT: fn }).ok, true)
  assert.equal(checkSupabaseTarget({ VITE_WAITLIST_ENDPOINT: 'http://127.0.0.1:54321/functions/v1/join-waitlist' }).ok, true)
  for (const bad of [
    'https://abcdefghijabcdefghij.supabase.co/functions/v1/join-waitlist',
    `${STAGING_SUPABASE_URL}/functions/v1/other`,
    `${STAGING_SUPABASE_URL}/rest/v1/rpc/waitlist_submit`,
    'https://evil.example/functions/v1/join-waitlist',
  ])
    assert.equal(checkSupabaseTarget({ VERCEL_ENV: 'preview', ...base, VITE_WAITLIST_ENDPOINT: bad }).ok, false, bad)
  assert.equal(checkSupabaseTarget({ VERCEL_ENV: 'preview', ...base, VITE_WAITLIST_ENDPOINT: 'http://127.0.0.1:54321/functions/v1/join-waitlist' }).ok, false)
  assert.equal(checkSupabaseTarget({ VERCEL_ENV: 'production', VITE_WAITLIST_ENDPOINT: fn }).ok, false)
})

const STAGING_FN = `${STAGING_SUPABASE_URL}/functions/v1/join-waitlist`
const FAKE_PROD = 'abcdefghijabcdefghij'
const PROD_FN = `https://${FAKE_PROD}.supabase.co/functions/v1/join-waitlist`
const withProd = { refs: { staging: 'kpudeppgokpjhvaqrprn', production: FAKE_PROD } }

test('the Production project reference is unset in this repository, and staging is the known project', () => {
  assert.equal(PROJECTS.production, null)
  assert.equal(PROJECTS.staging, 'kpudeppgokpjhvaqrprn')
  assert.equal(STAGING_SUPABASE_URL, 'https://kpudeppgokpjhvaqrprn.supabase.co')
})

test('while the Production project is unset, a Production build with any waitlist address fails closed', () => {
  for (const endpoint of [STAGING_FN, PROD_FN, 'http://127.0.0.1:54321/functions/v1/join-waitlist']) {
    const r = checkSupabaseTarget({ VERCEL_ENV: 'production', VITE_WAITLIST_ENDPOINT: endpoint }, { mode: 'site' })
    assert.equal(r.ok, false, endpoint)
  }
  assert.match(checkSupabaseTarget({ VERCEL_ENV: 'production', VITE_WAITLIST_ENDPOINT: PROD_FN }, { mode: 'site' }).message, /not configured/)
  // No address: fine (the form simply stays off).
  assert.equal(checkSupabaseTarget({ VERCEL_ENV: 'production' }, { mode: 'site' }).ok, true)
})

test('once configured, Production may use only the Production function, and never staging', () => {
  assert.equal(checkSupabaseTarget({ VERCEL_ENV: 'production', VITE_WAITLIST_ENDPOINT: PROD_FN }, { mode: 'site', ...withProd }).ok, true)
  assert.equal(checkSupabaseTarget({ VERCEL_ENV: 'production', VITE_WAITLIST_ENDPOINT: STAGING_FN }, { mode: 'site', ...withProd }).ok, false)
  assert.equal(checkSupabaseTarget({ VERCEL_ENV: 'production', VITE_WAITLIST_ENDPOINT: 'https://zzzzzzzzzzzzzzzzzzzz.supabase.co/functions/v1/join-waitlist' }, { mode: 'site', ...withProd }).ok, false)
  // Production never carries Supabase browser values.
  assert.equal(checkSupabaseTarget({ VERCEL_ENV: 'production', VITE_SUPABASE_URL: STAGING_SUPABASE_URL, VITE_SUPABASE_PUBLISHABLE_KEY: PUB }, { mode: 'site', ...withProd }).ok, false)
})

test('Previews and local builds may never use the Production function', () => {
  const preview = { VERCEL_ENV: 'preview', VITE_SUPABASE_URL: STAGING_SUPABASE_URL, VITE_SUPABASE_PUBLISHABLE_KEY: PUB }
  assert.equal(checkSupabaseTarget({ ...preview, VITE_WAITLIST_ENDPOINT: STAGING_FN }, withProd).ok, true)
  assert.equal(checkSupabaseTarget({ ...preview, VITE_WAITLIST_ENDPOINT: PROD_FN }, withProd).ok, false)
  assert.equal(checkSupabaseTarget({ VERCEL_ENV: 'preview', VITE_WAITLIST_ENDPOINT: PROD_FN }, { mode: 'site', ...withProd }).ok, false)
  assert.equal(checkSupabaseTarget({ VITE_WAITLIST_ENDPOINT: PROD_FN }, withProd).ok, false)
})

test('the public site build on a Preview needs no Supabase values, but still refuses secret keys', () => {
  assert.equal(checkSupabaseTarget({ VERCEL_ENV: 'preview' }, { mode: 'site' }).ok, true)
  assert.equal(checkSupabaseTarget({ VERCEL_ENV: 'preview', VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_secret_abcdefghijklmnop' }, { mode: 'site' }).ok, false)
  // The full app on a Preview still needs the staging project.
  assert.equal(checkSupabaseTarget({ VERCEL_ENV: 'preview' }, { mode: 'app' }).ok, false)
})
