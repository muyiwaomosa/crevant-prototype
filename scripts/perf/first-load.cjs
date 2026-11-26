#!/usr/bin/env node
// First-load experience on emulated phones over slow networks, LOCAL only.
//
// Serves a built app (dist/) gzip-compressed with the SPA fallback, as Vercel
// does, and opens three first visits with an empty cache in Chromium, with the
// network and CPU throttled the way Lighthouse emulates mobile:
//
//   landing   /            ready when the main heading is visible
//   sign in   /sign-in     ready when the email field is visible
//   home      /app         signed in (a stored session, empty cache), ready
//                          when Home shows a post
//
// For each it reports the median of RUNS visits: first contentful paint,
// largest contentful paint, "ready" (the person can read and act), and the
// JavaScript downloaded (compressed). Emulation is not a real phone; it
// stands in for one consistently, so builds can be compared. Real-device
// checks are part of acceptance (docs/PERFORMANCE.md).
//
//   node scripts/perf/first-load.cjs <dist dir> [label]
//   env: API_URL, DB_URL, SERVICE_ROLE_KEY (local Supabase, for the signed-in visit), RUNS (default 3),
//        TARGETS (optional: landing,sign,home)
'use strict'
const http = require('node:http')
const fs = require('node:fs')
const path = require('node:path')
const zlib = require('node:zlib')
const { execFileSync } = require('node:child_process')
const { chromium } = require('playwright')

const DIST = path.resolve(process.argv[2] || 'dist')
const LABEL = process.argv[3] || path.basename(DIST)
const RUNS = Number(process.env.RUNS || 3)
const API = process.env.API_URL
const DB = process.env.DB_URL
const SERVICE = process.env.SERVICE_ROLE_KEY
if (API && !/^http:\/\/(127\.0\.0\.1|localhost):/.test(API)) throw new Error('Refusing: not a local Supabase')

// Lighthouse's mobile emulation (Slow 4G, mid-range phone) and a slower case.
const PROFILES = [
  { name: 'Slow 4G, mid-range phone', latency: 150, down: 1.6e6, up: 750e3, cpu: 4 },
  { name: '3G, low-end phone', latency: 300, down: 750e3, up: 250e3, cpu: 6 },
]

const TYPES = { '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2', '.json': 'application/json', '.webp': 'image/webp', '.ico': 'image/x-icon' }
function serve() {
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://x')
    let file = path.join(DIST, decodeURIComponent(url.pathname))
    if (!file.startsWith(DIST) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(DIST, 'index.html')
    const ext = path.extname(file)
    let body = fs.readFileSync(file)
    const headers = { 'Content-Type': TYPES[ext] || 'application/octet-stream', 'Cache-Control': ext === '.html' ? 'no-cache' : 'public, max-age=31536000, immutable' }
    if (/\.(js|css|html|svg|json)$/.test(file) && /gzip/.test(req.headers['accept-encoding'] || '')) {
      body = zlib.gzipSync(body, { level: 9 })
      headers['Content-Encoding'] = 'gzip'
    }
    res.writeHead(200, headers)
    res.end(body)
  })
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server)))
}

const sql = (q) => execFileSync('psql', [DB, '-v', 'ON_ERROR_STOP=1', '-qAt', '-c', q]).toString().trim()

// A member with an onboarded profile who follows a creator with posts, so Home has something to show.
async function member() {
  const email = `perf-${Date.now()}@example.test`
  const password = `Perf-${Date.now()}-pass!`
  const h = { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, 'Content-Type': 'application/json' }
  const r = await fetch(`${API}/auth/v1/admin/users`, { method: 'POST', headers: h, body: JSON.stringify({ email, password, email_confirm: true }) })
  const { id } = await r.json()
  sql(`select ops.grant_member_access('${id}', 'tester', 'perf')`)
  sql(`update public.profiles set username = 'perf_${String(Date.now()).slice(-8)}', display_name = 'Perf Member' where id = '${id}'`)
  sql(`insert into social.profile_details (user_id, onboarded_at) values ('${id}', now()) on conflict (user_id) do update set onboarded_at = now()`)
  const creator = sql(`select author_id from social.posts where deleted_at is null and author_id <> '${id}' group by 1 order by count(*) desc limit 1`)
  if (creator) sql(`insert into social.follows (follower_id, creator_id) values ('${id}', '${creator}') on conflict do nothing`)
  return { email, password }
}

async function visit(browser, base, profile, target, storageState) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true, storageState })
  const page = await ctx.newPage()
  const cdp = await ctx.newCDPSession(page)
  await cdp.send('Network.enable')
  await cdp.send('Network.setCacheDisabled', { cacheDisabled: true })
  await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: profile.latency, downloadThroughput: profile.down / 8, uploadThroughput: profile.up / 8 })
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: profile.cpu })
  let js = 0
  const jsIds = new Set()
  cdp.on('Network.responseReceived', (e) => e.type === 'Script' && jsIds.add(e.requestId))
  cdp.on('Network.loadingFinished', (e) => jsIds.has(e.requestId) && (js += e.encodedDataLength))
  await page.addInitScript(() => {
    window.__lcp = 0
    new PerformanceObserver((l) => l.getEntries().forEach((e) => (window.__lcp = e.startTime))).observe({ type: 'largest-contentful-paint', buffered: true })
  })
  const t0 = Date.now()
  await page.goto(base + target.path, { waitUntil: 'commit' })
  await target.ready(page)
  const ready = Date.now() - t0
  const m = await page.evaluate(() => ({
    fcp: performance.getEntriesByName('first-contentful-paint')[0]?.startTime ?? null,
    lcp: window.__lcp || null,
  }))
  await ctx.close()
  return { ready, fcp: m.fcp, lcp: m.lcp, js }
}

const median = (xs) => {
  const s = xs.filter((x) => x != null).sort((a, b) => a - b)
  return s.length ? s[Math.floor(s.length / 2)] : null
}
const sec = (ms) => (ms == null ? '-' : `${(ms / 1000).toFixed(1)} s`)

;(async () => {
  const server = await serve()
  const base = `http://127.0.0.1:${server.address().port}`
  const browser = await chromium.launch()
  try {
    const targets = [
      { name: 'Landing page', path: '/', ready: (p) => p.getByRole('heading', { level: 1 }).first().waitFor({ timeout: 120000 }) },
      { name: 'Sign in', path: '/sign-in', ready: (p) => p.getByLabel('Email address', { exact: true }).waitFor({ timeout: 120000 }) },
    ]
    let state
    if (API && DB && SERVICE) {
      const who = await member()
      const ctx = await browser.newContext()
      const page = await ctx.newPage()
      await page.goto(`${base}/sign-in?next=%2Fapp`)
      await page.getByLabel('Email address', { exact: true }).fill(who.email)
      await page.getByLabel('Password', { exact: true }).fill(who.password)
      await page.getByRole('button', { name: 'Sign in' }).click()
      await page.getByRole('heading', { name: 'Home' }).waitFor({ timeout: 60000 })
      state = await ctx.storageState()
      await ctx.close()
      targets.push({ name: 'Home, signed in', path: '/app', ready: (p) => p.getByTestId('post').first().waitFor({ timeout: 120000 }), signedIn: true })
    }
    const only = (process.env.TARGETS || '').split(',').filter(Boolean)
    if (only.length) targets.splice(0, targets.length, ...targets.filter((t) => only.some((o) => t.name.toLowerCase().startsWith(o))))
    console.log(`First load, ${LABEL} (median of ${RUNS}, empty cache, 390 px phone viewport)`)
    for (const profile of PROFILES) {
      console.log(`\n${profile.name} (${profile.latency} ms, ${profile.down / 1e6} Mbps down, CPU ${profile.cpu}x slower)`)
      for (const t of targets) {
        const runs = []
        for (let i = 0; i < RUNS; i++) runs.push(await visit(browser, base, profile, t, t.signedIn ? state : undefined))
        console.log(`  ${t.name.padEnd(16)} ready ${sec(median(runs.map((r) => r.ready))).padStart(7)}   FCP ${sec(median(runs.map((r) => r.fcp))).padStart(7)}   LCP ${sec(median(runs.map((r) => r.lcp))).padStart(7)}   JS ${Math.round(median(runs.map((r) => r.js)) / 1024)} KB`)
      }
    }
  } finally {
    await browser.close()
    server.close()
  }
})().catch((e) => {
  console.error(e)
  process.exit(1)
})
