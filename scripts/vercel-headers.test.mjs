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

// The security headers come as exactly three rules, split by host:
// www.splitpost.ca (the public site in the splitpost project) may only talk to
// the Production (waitlist) Supabase project; app.splitpost.ca (the member
// app's Production address) only to the member Production project, and to no
// Supabase project at all until that is configured; every other address
// (Previews, the demo project, local tests) only to staging. Never two
// projects, and never crossed. This is defence in depth: the build checks
// (check-supabase-target, the bundle checks) are the boundary on their own.
const SITE_HOST = 'www.splitpost.ca'
const APP_HOST = 'app.splitpost.ca'
const STAGING = 'https://kpudeppgokpjhvaqrprn.supabase.co'
const PRODUCTION = 'https://hmrliwoychnqrbbydorg.supabase.co'
const PROJECT_REFS = JSON.parse(readFileSync(new URL('../config/supabase-projects.json', import.meta.url), 'utf8'))
const MEMBER = PROJECT_REFS.memberProduction?.ref ? [`https://${PROJECT_REFS.memberProduction.ref}.supabase.co`] : []
const securityRules = config.headers.filter((h) => h.headers.some((x) => x.key === 'Content-Security-Policy'))
const cspOf = (rule) => Object.fromEntries(rule.headers.find((x) => x.key === 'Content-Security-Policy').value.split(';').map((d) => d.trim().split(/\s+/)).map(([k, ...v]) => [k, v]))
// Vercel's documented matching: every "has" condition must match, and no "missing" one may.
const rulesFor = (host) => securityRules.filter((r) => (!r.has || r.has.every((c) => c.type === 'host' && c.value === host)) && (!r.missing || !r.missing.some((c) => c.type === 'host' && c.value === host)))

test('three security rules: www.splitpost.ca, app.splitpost.ca, and everything else', () => {
  assert.deepEqual(securityRules.map((h) => [h.source, h.has ?? null, h.missing ?? null]), [
    ['/(.*)', null, [{ type: 'host', value: SITE_HOST }, { type: 'host', value: APP_HOST }]],
    ['/(.*)', [{ type: 'host', value: SITE_HOST }], null],
    ['/(.*)', [{ type: 'host', value: APP_HOST }], null],
  ])
})

test('exactly one security rule applies to each address, and the app.splitpost.ca rule applies to no other', () => {
  const [elsewhere, site, app] = securityRules
  assert.deepEqual(rulesFor(SITE_HOST), [site])
  assert.deepEqual(rulesFor(APP_HOST), [app])
  for (const host of [
    'splitpost-app-git-claude-pilot-membership-integration-crevant.vercel.app', 'splitpost-app-abc123-crevant.vercel.app',
    'splitpost-git-main-crevant.vercel.app', 'crevant-prototype.vercel.app', 'crevant-prototype-git-x-crevant.vercel.app',
    'localhost', 'splitpost.ca', 'app.splitpost.ca.evil.example', 'staging-app.splitpost.ca',
  ]) {
    assert.deepEqual(rulesFor(host), [elsewhere], host)
  }
})

test('www.splitpost.ca may talk only to the Production (waitlist) project and Previews only to staging (unchanged); app.splitpost.ca only to the member project, once configured', () => {
  const [elsewhere, site, app] = securityRules
  assert.deepEqual(cspOf(elsewhere)['connect-src'], ["'self'", STAGING])
  assert.deepEqual(cspOf(site)['connect-src'], ["'self'", PRODUCTION])
  assert.deepEqual(cspOf(app)['connect-src'], ["'self'", ...MEMBER])
  if (!MEMBER.length) assert.equal(cspOf(app)['connect-src'].some((x) => x.includes('supabase')), false, 'no Supabase host until the member project is configured')
  for (const rule of securityRules) {
    const value = rule.headers.find((x) => x.key === 'Content-Security-Policy').value
    const projects = [STAGING, PRODUCTION, ...MEMBER].filter((p) => value.includes(p))
    assert.ok(projects.length <= 1, 'a policy must never allow two projects')
  }
  const appValue = app.headers.find((x) => x.key === 'Content-Security-Policy').value
  assert.equal(appValue.includes(STAGING) || appValue.includes(PRODUCTION), false, 'app.splitpost.ca never reaches staging or the waitlist project')
})

test('the three rules are otherwise identical: the same policy apart from connect-src and img-src, the same other headers', () => {
  const [elsewhere, site, app] = securityRules
  // Profile pictures and photos (Builds 5.2b, 5.3): the member app loads
  // images from its own project. Previews: staging; app.splitpost.ca: the
  // member project (none until configured). www.splitpost.ca is unchanged.
  assert.deepEqual(cspOf(elsewhere)['img-src'], ["'self'", 'data:', 'blob:', STAGING])
  assert.deepEqual(cspOf(site)['img-src'], ["'self'", 'data:', 'blob:'])
  assert.deepEqual(cspOf(app)['img-src'], ["'self'", 'data:', 'blob:', ...MEMBER])
  const without = (rule) => ({ ...cspOf(rule), 'connect-src': null, 'img-src': null })
  assert.deepEqual(without(site), without(elsewhere))
  assert.deepEqual(without(app), without(elsewhere))
  const others = (rule) => rule.headers.filter((x) => x.key !== 'Content-Security-Policy')
  assert.deepEqual(others(site), others(elsewhere))
  assert.deepEqual(others(app), others(elsewhere))
})

test('the projects in the policy are the ones in config/supabase-projects.json, once recorded', () => {
  if (PROJECT_REFS.production?.ref) assert.equal(PRODUCTION, `https://${PROJECT_REFS.production.ref}.supabase.co`)
  assert.equal(STAGING, `https://${PROJECT_REFS.staging.ref}.supabase.co`)
  // The member Production project stays unset until it is provisioned and reviewed.
  assert.equal(PROJECT_REFS.memberProduction?.ref ?? null, null)
})
