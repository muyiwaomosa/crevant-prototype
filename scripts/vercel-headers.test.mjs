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

// The public website's Production address (config/public-site.json), the only
// host where / and /join can ever go without the noindex header.
const PRODUCTION_HOST = 'www.splitpost.ca'
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
  for (const host of [
    'crevant-prototype-git-claude-public-launch-prep-crevant.vercel.app',
    'crevant-prototype-abc123-crevant.vercel.app',
    'splitpost-git-claude-website-redesign-crevant.vercel.app',
    'localhost',
    // The member app, its Previews and the project's own address: never indexed.
    'app.splitpost.ca',
    'splitpost-app.vercel.app',
    'splitpost-app-git-claude-pilot-m1-environment-crevant.vercel.app',
    // The frozen demo's address and the bare domain (which redirects to www).
    'crevant-prototype.vercel.app',
    'splitpost.ca',
  ]) {
    for (const p of ['/', '/join', '/tour', '/privacy', '/xyz']) assert.equal(headerNoindex(host, p), true, `${host}${p}`)
  }
})

test('the robots rules use the same host as config/public-site.json (one source of truth)', () => {
  const site = JSON.parse(readFileSync(new URL('../config/public-site.json', import.meta.url), 'utf8'))
  assert.equal(site.productionHost, PRODUCTION_HOST)
  assert.equal(JSON.stringify(robotsRules).includes('crevant-prototype.vercel.app'), false)
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

// The security headers come as exactly two rules, split by one host:
// www.splitpost.ca (the public site in the splitpost project) may only talk to
// the Production Supabase project; every other address (Previews, the demo
// project, local tests) only to staging. Never both, and never crossed.
const SITE_HOST = 'www.splitpost.ca'
const STAGING = 'https://kpudeppgokpjhvaqrprn.supabase.co'
const PRODUCTION = 'https://hmrliwoychnqrbbydorg.supabase.co'
const securityRules = config.headers.filter((h) => h.headers.some((x) => x.key === 'Content-Security-Policy'))
const cspOf = (rule) => Object.fromEntries(rule.headers.find((x) => x.key === 'Content-Security-Policy').value.split(';').map((d) => d.trim().split(/\s+/)).map(([k, ...v]) => [k, v]))

test('two security rules, for www.splitpost.ca and for everything else, so exactly one applies to any request', () => {
  assert.deepEqual(securityRules.map((h) => [h.source, h.has ?? null, h.missing ?? null]), [
    ['/(.*)', null, [{ type: 'host', value: SITE_HOST }]],
    ['/(.*)', [{ type: 'host', value: SITE_HOST }], null],
  ])
})

test('www.splitpost.ca may talk only to the Production project; everywhere else only to staging', () => {
  const [elsewhere, site] = securityRules
  assert.deepEqual(cspOf(elsewhere)['connect-src'], ["'self'", STAGING])
  assert.deepEqual(cspOf(site)['connect-src'], ["'self'", PRODUCTION])
  for (const rule of securityRules) {
    const value = rule.headers.find((x) => x.key === 'Content-Security-Policy').value
    assert.equal(value.includes(STAGING) && value.includes(PRODUCTION), false, 'a policy must never allow both projects')
  }
})

test('the two rules are otherwise identical: the same policy apart from connect-src, the same other headers', () => {
  const [elsewhere, site] = securityRules
  const without = (rule) => ({ ...cspOf(rule), 'connect-src': null })
  assert.deepEqual(without(site), without(elsewhere))
  const others = (rule) => rule.headers.filter((x) => x.key !== 'Content-Security-Policy')
  assert.deepEqual(others(site), others(elsewhere))
})

test('the Production project in the policy is the one in config/supabase-projects.json, once recorded', () => {
  const projects = JSON.parse(readFileSync(new URL('../config/supabase-projects.json', import.meta.url), 'utf8'))
  if (projects.production?.ref) assert.equal(PRODUCTION, `https://${projects.production.ref}.supabase.co`)
  assert.equal(STAGING, `https://${projects.staging.ref}.supabase.co`)
})
