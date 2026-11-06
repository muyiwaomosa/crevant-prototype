// Tests for the build-time Supabase target check. Run with: node --test scripts/*.test.mjs
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { checkSupabaseTarget, STAGING_SUPABASE_URL } from './check-supabase-target.mjs'

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
