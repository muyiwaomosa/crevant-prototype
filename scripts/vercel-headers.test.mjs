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

test('on the production address, every path except exactly / and /join is noindex by header', async () => {
  const { headerNoindex } = await import('./vercel-robots.mjs')
  for (const p of ['/', '/join']) assert.equal(headerNoindex(PRODUCTION_HOST, p), false, p)
  for (const p of [
    '/tour', '/tour/discover', '/privacy', '/sign-in', '/forgot-password', '/auth/confirm', '/app', '/app/account',
    '/request-invite', '/xyz', '/join/', '/join/creator', '/JOIN', '/index.html', '/robots.txt', '/a/b/c',
  ]) {
    assert.equal(headerNoindex(PRODUCTION_HOST, p), true, p)
  }
  // Every other address (Previews, deployment URLs) is noindex on every path, / and /join included.
  for (const host of ['crevant-prototype-git-claude-public-launch-prep-crevant.vercel.app', 'crevant-prototype-abc123-crevant.vercel.app', 'localhost']) {
    for (const p of ['/', '/join', '/tour', '/privacy', '/xyz']) assert.equal(headerNoindex(host, p), true, `${host}${p}`)
  }
})

test('the robots header rules are exactly two, and nothing ever sends an "index" header', () => {
  assert.deepEqual(robotsRules.map((h) => [h.source, h.has ?? null, h.missing ?? null]), [
    ['/(.*)', null, [{ type: 'host', value: PRODUCTION_HOST }]],
    ['/((?!join$).+)', [{ type: 'host', value: PRODUCTION_HOST }], null],
  ])
  assert.equal(config.headers.some((h) => h.headers.some((x) => x.key === 'X-Robots-Tag' && x.value !== 'noindex')), false)
  // The same source style as the existing rewrite, which Vercel already serves.
  assert.equal(config.rewrites[0].source, '/((?!media/|assets/|favicon).*)')
})
