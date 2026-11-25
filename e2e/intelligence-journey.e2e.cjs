// Intelligence (20261210000000) for all four stakeholders, in a real browser
// against a LOCAL Supabase with the production security headers:
//
//  1. a fan follows a creator from search, opens a post and leaves a thoughtful
//     comment; My Split tells them what happened, what it means and what next;
//  2. the creator's Profile has four faces (Profile, Attention, Retention,
//     Money): availability versus reach, where followers came from, this
//     week's connections, simulated money apart from actual income;
//  3. the founder's Control Center shows the North Star with these test
//     accounts excluded and counted apart, labels every figure, exports, and
//     lists hypotheses as hypotheses.
// Figures are checked against the database. WCAG 2.2 AA, 320 and 390 px, no CSP violations.
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
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const vercel = JSON.parse(readFileSync(path.join(__dirname, '..', 'vercel.json'), 'utf8'))
const SECURITY_HEADERS = Object.fromEntries(
  vercel.headers.find((h) => h.source === '/(.*)').headers.map((h) => [h.key.toLowerCase(), h.value.replace(/https:\/\/[a-z0-9]+\.supabase\.co/g, API)]),
)
const RUN = String(Date.now()).slice(-7)
const PASSWORD = 'Insight-Journey-42-pass'
let failures = 0
const check = (name, ok, detail = '') => {
  if (!ok) failures++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`)
}
const sql = (q) => execFileSync('psql', [DB, '-v', 'ON_ERROR_STOP=1', '-qAt', '-c', q]).toString().trim()
const adminHeaders = { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, 'Content-Type': 'application/json' }

const AXE = readFileSync(path.join(__dirname, '..', 'node_modules', 'axe-core', 'axe.min.js'), 'utf8')
async function axe(page) {
  await page.evaluate(() => Promise.all(document.getAnimations().map((a) => a.finished.catch(() => null))))
  await page.evaluate(AXE)
  return page.evaluate(async () => (await window.axe.run(document, { runOnly: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] })).violations.map((v) => `${v.id} x${v.nodes.length} [${v.nodes.map((n) => n.target.join(' ')).join('; ').slice(0, 160)}]`))
}
async function noSidewaysScroll(page, label) {
  const desktop = page.viewportSize()
  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 760 })
    const sideways = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
    check(`at ${width}px, ${label} has no sideways scrolling`, sideways <= 0, `${sideways}px`)
  }
  if (desktop) await page.setViewportSize(desktop)
}
async function screenChecks(page, label) {
  const v = await axe(page)
  check(`${label} has no WCAG 2.2 AA violations`, v.length === 0, v.join(', '))
  await noSidewaysScroll(page, label)
}

// A member with a finished profile: created, granted, named, and set up.
async function createMember(email, username, displayName) {
  const r = await fetch(`${API}/auth/v1/admin/users`, { method: 'POST', headers: adminHeaders, body: JSON.stringify({ email, password: PASSWORD, email_confirm: true }) })
  const body = await r.json()
  if (!r.ok) throw new Error(`could not create ${email}: ${JSON.stringify(body)}`)
  sql(`select ops.grant_member_access('${body.id}', 'tester', 'intelligence-journey')`)
  sql(`update public.profiles set username = '${username}', display_name = '${displayName}' where id = '${body.id}'`)
  return body.id
}
async function tokenFor(email) {
  const r = await fetch(`${API}/auth/v1/token?grant_type=password`, { method: 'POST', headers: { apikey: PUB, 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password: PASSWORD }) })
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

const csp = []
const consoleErrors = []
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
    if (/Content Security Policy/i.test(m.text())) csp.push(m.text())
    if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) consoleErrors.push(m.text())
  })
  return ctx
}


async function emailLink(email, type) {
  for (let i = 0; i < 80; i++) {
    const r = await fetch(`${MAIL}/api/v1/search?query=${encodeURIComponent(`to:"${email}"`)}`).then((x) => x.json())
    for (const m of r.messages || []) {
      const full = await fetch(`${MAIL}/api/v1/message/${m.ID}`).then((x) => x.json())
      const href = ((full.HTML || full.Text).match(/href="([^"]+)"/) || [])[1]
      if (href && href.replace(/&amp;/g, '&').includes(`type=${type}`)) return href.replace(/&amp;/g, '&')
    }
    await sleep(250)
  }
  throw new Error(`No ${type} email for ${email}`)
}
// The founder: the launch founder if one is already pinned in this database
// (an earlier journey may have done it), otherwise a new account pinned now.
async function founderAccount() {
  let id = sql('select coalesce(founder_user_id::text, \'\') from ops.member_launch_settings')
  let email
  if (!id) {
    email = `in-f-${RUN}@example.test`
    id = await createMember(email, `inf${RUN}`, 'Fay Founder')
    sql(`select ops.set_launch_founder('intelligence-journey', '${id}', 'SET THE LAUNCH FOUNDER')`)
    sql(`select ops.grant_member_access('${id}', 'founder', 'intelligence-journey')`)
  } else {
    email = sql(`select email from auth.users where id = '${id}'`)
    // Local test database only: give the existing founder this journey's password.
    const r = await fetch(`${API}/auth/v1/admin/users/${id}`, { method: 'PUT', headers: adminHeaders, body: JSON.stringify({ password: PASSWORD }) })
    if (!r.ok) throw new Error('could not set the founder password')
    sql(`select ops.grant_member_access('${id}', 'founder', 'intelligence-journey')`)
  }
  sql(`insert into social.profile_details (user_id, onboarded_at) values ('${id}', now()) on conflict (user_id) do nothing`)
  return { id, email }
}
const points = async (page) => (await page.getByTestId('split-points').innerText()).replace(/\s+/g, ' ')

async function signIn(page, email) {
  await page.goto(`${APP}/sign-in?next=%2Fapp`)
  await page.getByLabel('Email address', { exact: true }).fill(email)
  await page.getByLabel('Password', { exact: true }).fill(PASSWORD)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await page.waitForURL(`${APP}/app`)
  // Profile details are not set for these accounts: skip the optional steps once.
  const skip = page.getByRole('button', { name: 'Skip the rest' })
  const home = page.getByRole('heading', { name: 'Home' })
  await Promise.race([skip.waitFor(), home.waitFor()])
  if (await skip.isVisible().catch(() => false)) {
    await skip.click()
    await page.getByRole('button', { name: 'Go to my feed' }).click()
  }
  await home.waitFor()
}





;(async () => {
  const browser = await chromium.launch({
    args: ['--disable-features=LocalNetworkAccessChecks,BlockInsecurePrivateNetworkRequests,PrivateNetworkAccessSendPreflights'],
  })
  try {
    const email = (k) => `in-${k}-${RUN}@example.test`
    const c = await createMember(email('c'), `inc${RUN}`, 'Ines Creator')
    const a = await createMember(email('a'), `ina${RUN}`, 'Ari Fan')
    const f = await founderAccount()
    const tC = await tokenFor(email('c'))
    const tA = await tokenFor(email('a'))
    const post = (await rpc(tC, 'app_create_post', { p_body: `How I plan meals for a week ${RUN}` })).body
    await rpc(tC, 'app_set_post_topic', { p_post: post, p_topic: 'food' })
    await rpc(tA, 'app_follow', { p_creator: c, p_source: 'search' })

    // 1. Ari opens the post and comments; My Split explains the week.
    {
      const ctx = await newContext(browser)
      const page = await ctx.newPage()
      await signIn(page, email('a'))
      await page.goto(`${APP}/app/post/${post}`)
      await page.getByLabel('Write a comment').fill('This plan saves me hours every Sunday, thank you for sharing it.')
      await page.getByRole('button', { name: 'Comment' }).click()
      await page.getByTestId('comment').filter({ hasText: 'saves me hours' }).waitFor()
      for (let i = 0; i < 20 && sql(`select count(*) from social.post_opens where viewer_id = '${a}' and post_id = '${post}'`) !== '1'; i++) await sleep(250)
      check('opening the post is recorded once', sql(`select count(*) from social.post_opens where viewer_id = '${a}'`) === '1')
      await page.goto(`${APP}/app/split`)
      const panel = page.getByTestId('contribution-insight')
      await panel.waitFor()
      const t = (await panel.innerText()).replace(/\s+/g, ' ')
      check('My Split says what happened, what it means and what to do next', /What happened.*What it means.*What to do next/i.test(t), t)
      check('the fan sees their own connection this week', t.includes('You connected with 1 creator this week'), t)
      await screenChecks(page, 'My Split with the contribution panel')
      await ctx.close()
    }

    // 2. Ines's four faces.
    {
      const ctx = await newContext(browser)
      const page = await ctx.newPage()
      await signIn(page, email('c'))
      await page.goto(`${APP}/app/profile`)
      await page.getByRole('tab', { name: 'Money' }).waitFor()
      const tabs = await page.getByRole('tab').allInnerTexts()
      check('the Profile has the four approved faces', JSON.stringify(tabs) === JSON.stringify(['Profile', 'Attention', 'Retention', 'Money']), JSON.stringify(tabs))
      await page.getByRole('tab', { name: 'Attention' }).click()
      const att = page.getByTestId('attention-face')
      await att.waitFor()
      const ta = (await att.innerText()).replace(/\s+/g, ' ')
      check('Attention: available to every follower, and how many saw a post', ta.includes('Every post was available to your follower. They saw at least one.'), ta)
      check('Attention: where new followers came from (search)', /Where your new follower came from Search 1/.test(ta), ta)
      await screenChecks(page, 'the Attention face')
      await page.getByRole('tab', { name: 'Retention' }).click()
      const ret = page.getByTestId('retention-face')
      await ret.waitFor()
      const tr = (await ret.innerText()).replace(/\s+/g, ' ')
      const expected = sql(`select count(*) from ops.connections(ops.week_start(now()), now()) where creator = '${c}'`)
      check('Retention: this week\'s connections match the database', tr.includes(`${expected} follower connected`) && expected === '1', `${expected}: ${tr.slice(0, 120)}`)
      await page.getByRole('tab', { name: 'Money' }).click()
      const money = page.getByTestId('money-face')
      await money.waitFor()
      const tm = (await money.innerText()).replace(/\s+/g, ' ')
      check('Money: simulated and actual income apart, nothing paid', /Simulated/.test(tm) && /Actual income Actual \$0\.00/.test(tm), tm.slice(0, 200))
      check('Money: no allocation percentages before legal review', !/\b(40|20)\s*%/.test(tm))
      await screenChecks(page, 'the Money face')
      await ctx.close()
    }

    // 3. The founder's Control Center.
    {
      const ctx = await newContext(browser)
      const page = await ctx.newPage()
      await signIn(page, f.email)
      await page.goto(`${APP}/app/profile`)
      await page.getByRole('link', { name: 'Control Center' }).click()
      const cc = page.getByTestId('control-center')
      await cc.waitFor()
      const ns = Number(await page.getByTestId('north-star').innerText())
      const db = sql(`select count(*) filter (where not test) || ',' || count(*) filter (where test) from ops.connections(ops.week_start(now()), now())`).split(',').map(Number)
      check('the North Star matches the database, with test accounts excluded', ns === db[0], `${ns} vs ${db}`)
      check('test-data connections are counted apart', (await cc.innerText()).includes(`${db[1]} test-data connections excluded`) && db[1] >= 1)
      const all = (await page.locator('main').innerText()).replace(/\s+/g, ' ')
      check('simulated money is labelled, and hypotheses are labelled as hypotheses', /Fan pool Simulated/.test(all) && /Business hypotheses Hypothesis Not validated/.test(all))
      check('the Control Center names no member', !all.includes('Ari Fan') && !all.includes(`ina${RUN}`))
      const dl = page.waitForEvent('download')
      await page.getByRole('button', { name: 'Export CSV' }).click()
      const file = await dl
      const csv = readFileSync(await file.path(), 'utf8')
      check('the export labels every row actual, simulated, test or hypothesis', csv.split('\n')[0] === 'section,metric,value,kind' && csv.split('\n').slice(1).every((l) => /,(actual|simulated|test|hypothesis)$/.test(l)))
      await screenChecks(page, 'the Control Center')
      await ctx.close()
    }
    check('no Content Security Policy violations', csp.length === 0, csp.slice(0, 2).join(' | '))
  } catch (e) {
    failures++
    console.log(`FAIL  intelligence journey stopped: ${e && e.message}`)
  } finally {
    await browser.close()
  }
  console.log(`Intelligence journey: ${failures === 0 ? 'all passed' : `${failures} failed`}`)
  process.exit(failures === 0 ? 0 : 1)
})()
