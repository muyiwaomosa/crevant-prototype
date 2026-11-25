// Shared helpers for the four stakeholder journeys (e2e/stakeholder-*.e2e.cjs):
// the same helpers the other browser journeys copy (checks, psql, axe for
// WCAG 2.2 AA, sideways scrolling at 390 and 320 px, the production security
// headers with Content Security Policy reporting, Mailpit, test members and
// the pinned founder), kept in one place so each journey reads as a story.
//
// Local Supabase only. Details printed on a failure are figures and page text
// of synthetic test accounts; no email address or token is ever printed.
'use strict'
const { chromium } = require('playwright')
const { execFileSync } = require('node:child_process')
const { readFileSync } = require('node:fs')
const path = require('node:path')

const env = (k) => {
  const v = process.env[k]
  if (!v) throw new Error(`Missing ${k}; run through scripts/e2e/auth-journey.sh`)
  return v
}
const APP = env('APP_URL')
const API = env('API_URL')
const DB = env('DB_URL')
const MAIL = env('MAILPIT_URL')
const SERVICE = env('SERVICE_ROLE_KEY')
const PUB = env('PUBLISHABLE_KEY')
if (!/^http:\/\/(127\.0\.0\.1|localhost):/.test(API)) throw new Error('Refusing: not a local Supabase')

const vercel = JSON.parse(readFileSync(path.join(__dirname, '..', '..', 'vercel.json'), 'utf8'))
const SECURITY_HEADERS = Object.fromEntries(
  vercel.headers.find((h) => h.source === '/(.*)').headers.map((h) => [h.key.toLowerCase(), h.value.replace(/https:\/\/[a-z0-9]+\.supabase\.co/g, API)]),
)
const AXE = readFileSync(path.join(__dirname, '..', '..', 'node_modules', 'axe-core', 'axe.min.js'), 'utf8')
const adminHeaders = { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, 'Content-Type': 'application/json' }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const flat = (s) => String(s).replace(/\s+/g, ' ').trim()

function journey(name, password) {
  const RUN = String(Date.now()).slice(-7)
  const slug = name.toLowerCase().replace(/[^a-z]+/g, '-')
  let failures = 0
  let section = ''
  const csp = []
  const consoleErrors = []

  const check = (what, ok, detail = '') => {
    if (!ok) failures++
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${what}${!ok && detail ? `  (${String(detail).slice(0, 400)})` : ''}`)
  }
  const step = (title) => {
    section = title
    console.log(`\n${title}`)
  }
  const sql = (q) => execFileSync('psql', [DB, '-v', 'ON_ERROR_STOP=1', '-qAt', '-c', q]).toString().trim()
  // Poll the database until a query gives the expected value (writes from the page land a moment later).
  const sqlEventually = async (q, expected, tries = 40) => {
    let v
    for (let i = 0; i < tries; i++) {
      v = sql(q)
      if (v === expected) return v
      await sleep(250)
    }
    return v
  }

  async function axe(page) {
    // Measure the settled page: a face sliding in is briefly translucent.
    await page.evaluate(() => Promise.all(document.getAnimations().map((a) => a.finished.catch(() => null))))
    await page.evaluate(AXE)
    return page.evaluate(async () =>
      (await window.axe.run(document, { runOnly: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] })).violations.map(
        (v) => `${v.id} x${v.nodes.length} [${v.nodes.map((n) => n.target.join(' ')).join('; ').slice(0, 160)}]`,
      ),
    )
  }
  // WCAG 2.2 AA at 390 and 320 px, and no sideways scrolling at either width.
  async function screenChecks(page, label) {
    const desktop = page.viewportSize()
    for (const width of [390, 320]) {
      await page.setViewportSize({ width, height: 760 })
      // Measure from the top of the page: what sits under the fixed bottom
      // navigation depends only on how far the test happened to scroll.
      await page.evaluate(() => window.scrollTo(0, 0))
      await sleep(150)
      const v = await axe(page)
      check(`at ${width}px, ${label} has no WCAG 2.2 AA violations`, v.length === 0, v.join(', '))
      const sideways = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
      check(`at ${width}px, ${label} has no sideways scrolling`, sideways <= 0, `${sideways}px`)
    }
    if (desktop) await page.setViewportSize(desktop)
  }

  async function newContext(browser) {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } })
    await ctx.route(`${APP}/**`, async (route) => {
      if (route.request().resourceType() !== 'document') return route.continue()
      try {
        const res = await route.fetch()
        const headers = { ...res.headers() }
        if ((headers['content-type'] || '').includes('text/html')) Object.assign(headers, SECURITY_HEADERS)
        await route.fulfill({ response: res, headers })
      } catch (e) {
        if (!/disposed|closed|Target page|Route is already handled/i.test(String(e && e.message))) throw e
      }
    })
    ctx.on('console', (m) => {
      if (/Content Security Policy/i.test(m.text())) csp.push(`${section}: ${m.text()}`)
      if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) consoleErrors.push(`${section}: ${m.text()}`)
    })
    return ctx
  }
  // One browser context per person, kept for the whole story.
  async function person(browser) {
    const ctx = await newContext(browser)
    const page = await ctx.newPage()
    return { ctx, page }
  }

  async function emailLink(email, type) {
    for (let i = 0; i < 80; i++) {
      const r = await fetch(`${MAIL}/api/v1/search?query=${encodeURIComponent(`to:"${email}"`)}`).then((x) => x.json())
      for (const m of r.messages || []) {
        const full = await fetch(`${MAIL}/api/v1/message/${m.ID}`).then((x) => x.json())
        const href = ((full.HTML || full.Text).match(/href="([^"]+)"/) || [])[1]
        if (href && href.replace(/&amp;/g, '&').includes(`type=${type}`)) return { href: href.replace(/&amp;/g, '&'), subject: full.Subject }
      }
      await sleep(250)
    }
    throw new Error(`No ${type} email arrived`)
  }

  // A member with a finished profile: created, granted, named. Test cohort, so
  // excluded from the founder's actual figures like every journey's helpers.
  async function createMember(email, username, displayName, cohort = 'tester') {
    const r = await fetch(`${API}/auth/v1/admin/users`, { method: 'POST', headers: adminHeaders, body: JSON.stringify({ email, password, email_confirm: true }) })
    const body = await r.json()
    if (!r.ok) throw new Error(`could not create a test member (${r.status})`)
    sql(`select ops.grant_member_access('${body.id}', '${cohort}', '${slug}')`)
    sql(`update public.profiles set username = '${username}', display_name = '${displayName}' where id = '${body.id}'`)
    return body.id
  }
  async function tokenFor(email) {
    const r = await fetch(`${API}/auth/v1/token?grant_type=password`, { method: 'POST', headers: { apikey: PUB, 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }) })
    return (await r.json()).access_token
  }
  async function rpc(token, fn, args = {}) {
    const r = await fetch(`${API}/rest/v1/rpc/${fn}`, {
      method: 'POST',
      headers: { apikey: PUB, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(args),
    })
    const text = await r.text()
    return { status: r.status, body: text ? JSON.parse(text) : null }
  }
  // The founder: the launch founder if one is already pinned in this database
  // (an earlier journey may have done it), otherwise a new account pinned now.
  async function founderAccount() {
    let id = sql("select coalesce(founder_user_id::text, '') from ops.member_launch_settings")
    let email
    if (!id) {
      email = `${slug}f-${RUN}@example.test`
      id = await createMember(email, `f${RUN}`, 'Fay Founder')
      sql(`select ops.set_launch_founder('${slug}', '${id}', 'SET THE LAUNCH FOUNDER')`)
    } else {
      email = sql(`select email from auth.users where id = '${id}'`)
      // Local test database only: give the existing founder this journey's password.
      const r = await fetch(`${API}/auth/v1/admin/users/${id}`, { method: 'PUT', headers: adminHeaders, body: JSON.stringify({ password }) })
      if (!r.ok) throw new Error('could not set the founder password')
    }
    sql(`select ops.grant_member_access('${id}', 'founder', '${slug}')`)
    sql(`insert into social.profile_details (user_id, onboarded_at) values ('${id}', now()) on conflict (user_id) do nothing`)
    return { id, email, username: sql(`select username from public.profiles where id = '${id}'`) }
  }

  async function signIn(page, email) {
    await page.goto(`${APP}/sign-in?next=%2Fapp`)
    await page.getByLabel('Email address', { exact: true }).fill(email)
    await page.getByLabel('Password', { exact: true }).fill(password)
    await page.getByRole('button', { name: 'Sign in' }).click()
    await page.waitForURL(`${APP}/app`)
    // Profile details are not set for accounts made by createMember: skip the optional steps once.
    const skip = page.getByRole('button', { name: 'Skip the rest' })
    const home = page.getByRole('heading', { name: 'Home' })
    await Promise.race([skip.waitFor(), home.waitFor()])
    if (await skip.isVisible().catch(() => false)) {
      await skip.click()
      await page.getByRole('button', { name: 'Continue' }).click()
      await page.getByRole('button', { name: 'Go to my feed' }).click()
    }
    await home.waitFor()
  }

  // Register through a link, confirm the email from Mailpit, and arrive at step 1 of setup.
  async function registerThrough(page, url, email) {
    await page.goto(url)
    await page.getByTestId('register-form').waitFor()
    await page.getByLabel('Email address', { exact: true }).fill(email)
    await page.getByLabel('Password', { exact: true }).fill(password)
    await page.getByLabel('Confirm password').fill(password)
    await page.getByLabel('I confirm that I am 18 or older.').check()
    await page.getByRole('button', { name: 'Create account' }).click()
    await page.getByTestId('register-sent').waitFor()
    const { href, subject } = await emailLink(email, 'email')
    await page.goto(href)
    await page.getByRole('heading', { name: 'Confirm your email' }).waitFor()
    await page.getByRole('button', { name: 'Continue' }).click()
    await page.waitForURL(`${APP}/app`)
    await page.getByText('Step 1 of 6: Your name').waitFor({ timeout: 15000 })
    return { subject, confirmLink: href }
  }
  async function nameStep(page, username, displayName) {
    await page.getByLabel('Username').fill(username)
    await page.getByLabel('Display name').fill(displayName)
    await page.getByRole('button', { name: 'Continue' }).click()
    await page.getByRole('heading', { name: 'What brings you to Splitpost?' }).waitFor()
  }
  // Interest buttons in a topic picker.
  const topicButton = (scope, label) => scope.getByRole('button', { name: label, exact: true })

  const idOf = (email) => sql(`select id from auth.users where email = '${email}'`)
  const nav = (page) => page.getByRole('navigation', { name: 'Main' }).first()

  async function run(body) {
    const browser = await chromium.launch({
      args: ['--disable-features=LocalNetworkAccessChecks,BlockInsecurePrivateNetworkRequests,PrivateNetworkAccessSendPreflights'],
    })
    try {
      await body(browser)
      step('Throughout')
      check('no Content Security Policy violations on any screen', csp.length === 0, csp.slice(0, 2).join(' | '))
      check('no console errors on any screen', consoleErrors.length === 0, consoleErrors.slice(0, 3).join(' | '))
    } catch (e) {
      failures++
      console.log(`FAIL  ${name} stopped in "${section}": ${String(e && e.message).split('\n')[0].slice(0, 300)}`)
    } finally {
      await browser.close()
    }
    console.log(`\n${name}: ${failures === 0 ? 'all passed' : `${failures} failed`}`)
    process.exit(failures === 0 ? 0 : 1)
  }

  return {
    APP, API, RUN, PASSWORD: password, flat, sleep, check, step, sql, sqlEventually, axe, screenChecks, newContext, person, emailLink,
    createMember, tokenFor, rpc, founderAccount, signIn, registerThrough, nameStep, topicButton, idOf, nav, run,
  }
}

module.exports = { journey }
