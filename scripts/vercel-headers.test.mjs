// Tests for the security headers in vercel.json (apply to `main` Preview builds;
// the demo branch keeps its own vercel.json). Run with: node --test scripts/*.test.mjs
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const config = JSON.parse(readFileSync(new URL('../vercel.json', import.meta.url), 'utf8'))
const headers = Object.fromEntries(config.headers.find((h) => h.source === '/(.*)').headers.map((h) => [h.key, h.value]))
const csp = Object.fromEntries(headers['Content-Security-Policy'].split(';').map((d) => d.trim().split(/\s+/)).map(([k, ...v]) => [k, v]))

test('the page may only talk to this site and the staging Supabase project', () => {
  assert.deepEqual(csp['connect-src'], ["'self'", 'https://kpudeppgokpjhvaqrprn.supabase.co'])
})

test('scripts only from this site; no inline or eval; no framing; no plugins', () => {
  assert.deepEqual(csp['script-src'], ["'self'"])
  assert.equal(headers['Content-Security-Policy'].includes('unsafe-inline'), false)
  assert.equal(headers['Content-Security-Policy'].includes('unsafe-eval'), false)
  assert.deepEqual(csp['frame-ancestors'], ["'none'"])
  assert.deepEqual(csp['object-src'], ["'none'"])
  assert.deepEqual(csp['base-uri'], ["'self'"])
  assert.deepEqual(csp['form-action'], ["'self'"])
})

test('the earlier security headers are still present', () => {
  assert.equal(headers['X-Content-Type-Options'], 'nosniff')
  assert.equal(headers['X-Frame-Options'], 'DENY')
  assert.equal(headers['Referrer-Policy'], 'strict-origin-when-cross-origin')
  assert.match(headers['X-Robots-Tag'], /noindex/)
})
