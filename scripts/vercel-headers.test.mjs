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

test('scripts only from this site and Cloudflare Turnstile; no inline or eval; no framing; no plugins', () => {
  // Turnstile (the waitlist's bot check) loads one script and one frame from
  // challenges.cloudflare.com. Nothing else outside the site may run or frame.
  assert.deepEqual(csp['script-src'], ["'self'", 'https://challenges.cloudflare.com'])
  assert.deepEqual(csp['frame-src'], ['https://challenges.cloudflare.com'])
  assert.deepEqual(csp['default-src'], ["'self'"])
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
})

const PRODUCTION_HOST = 'crevant-prototype.vercel.app'
const robotsRules = config.headers.filter((h) => h.headers.some((x) => x.key === 'X-Robots-Tag'))

test('every address except the production one is noindex (Previews, deployment addresses, anything else)', () => {
  const everywhereElse = robotsRules.find((h) => h.source === '/(.*)')
  assert.ok(everywhereElse, 'missing the catch-all noindex rule')
  assert.deepEqual(everywhereElse.missing, [{ type: 'host', value: PRODUCTION_HOST }])
  assert.equal(everywhereElse.has, undefined)
  assert.deepEqual(everywhereElse.headers, [{ key: 'X-Robots-Tag', value: 'noindex' }])
  // The security headers no longer carry X-Robots-Tag; robots is handled above.
  assert.equal(headers['X-Robots-Tag'], undefined)
})

test('on the production address, the tour, /privacy, member paths and any deeper path are noindex', () => {
  const onProduction = robotsRules.filter((h) => JSON.stringify(h.has) === JSON.stringify([{ type: 'host', value: PRODUCTION_HOST }]))
  assert.deepEqual(onProduction.map((h) => h.source).sort(), [
    '/:first/:rest+', '/app', '/app/:path*', '/auth/:path*', '/forgot-password', '/privacy', '/request-invite', '/sign-in', '/tour', '/tour/:path*',
  ].sort())
  for (const h of onProduction) assert.deepEqual(h.headers, [{ key: 'X-Robots-Tag', value: 'noindex' }])
  // Nothing ever sets an "index" robots header: indexing of / and /join is
  // decided at build time (robots meta and robots.txt), only once approved.
  assert.equal(config.headers.some((h) => h.headers.some((x) => x.key === 'X-Robots-Tag' && x.value !== 'noindex')), false)
})
