// Tests for the waitlist launch checks. Run with: node --test scripts/*.test.mjs
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { checkWaitlistLaunch } from './check-waitlist-launch.mjs'

const NONE = { version: null, effectiveDate: null }
const APPROVED = { version: 'notice-2027-01', effectiveDate: '2027-01-15' }
const PROD = { VERCEL_ENV: 'production', CREVANT_PRODUCTION_SITE_APPROVED: 'true' }
const FORM = { VITE_WAITLIST_FORM_ENABLED: 'true', VITE_PRIVACY_NOTICE_URL: '/privacy', VITE_PRIVACY_NOTICE_VERSION: 'notice-2027-01' }

test('no privacy notice is approved in this repository yet', () => {
  const approved = JSON.parse(readFileSync(new URL('../src/public/privacy/approved-notice.json', import.meta.url), 'utf8'))
  assert.equal(approved.version, null)
  assert.equal(approved.effectiveDate, null)
})

test('a Production build with the form on needs the approved notice, its version, and /privacy', () => {
  assert.equal(checkWaitlistLaunch({ ...PROD, ...FORM }, NONE).ok, false)
  assert.equal(checkWaitlistLaunch({ ...PROD, ...FORM, VITE_PRIVACY_NOTICE_VERSION: 'notice-2026-12' }, APPROVED).ok, false)
  assert.equal(checkWaitlistLaunch({ ...PROD, ...FORM, VITE_PRIVACY_NOTICE_URL: 'https://example.com/privacy' }, APPROVED).ok, false)
  assert.equal(checkWaitlistLaunch({ ...PROD, ...FORM, VITE_PRIVACY_NOTICE_VERSION: 'test-only' }, { version: 'test-only', effectiveDate: '2026-11-11' }).ok, false)
  assert.equal(checkWaitlistLaunch({ ...PROD, ...FORM }, APPROVED).ok, true)
  // Form off: nothing to check.
  assert.equal(checkWaitlistLaunch({ ...PROD }, NONE).ok, true)
})

test('indexing can only be requested for an approved Production build', () => {
  for (const env of [{ CREVANT_ALLOW_INDEXING: 'true' }, { VERCEL_ENV: 'preview', CREVANT_ALLOW_INDEXING: 'true' }, { VERCEL_ENV: 'production', CREVANT_ALLOW_INDEXING: 'true' }]) {
    assert.equal(checkWaitlistLaunch(env, NONE).ok, false, JSON.stringify(env))
  }
  assert.equal(checkWaitlistLaunch({ ...PROD, CREVANT_ALLOW_INDEXING: 'true' }, NONE).ok, true)
})
