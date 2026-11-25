// Content (IP-4a, 20261202000000), in a real browser against a LOCAL Supabase
// with real Auth, with the production security headers.
//
//  1. A creator publishes a post with a topic from the composer; the card shows it.
//  2. The creator edits the post: new text, "Edited", the earlier version kept.
//  3. A follower saves it (the private Saved list) and reposts it.
//  4. Someone who follows the reposter, but not the creator, sees it on Home
//     as "Reposted by", once.
// Every screen: WCAG 2.2 AA, 320 and 390 px, no CSP violations, no console errors.
// Run by scripts/e2e/auth-journey.sh.
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
const SERVICE = env('SERVICE_ROLE_KEY')
const PUB = env('PUBLISHABLE_KEY')
if (!/^http:\/\/(127\.0\.0\.1|localhost):/.test(API)) throw new Error('Refusing: not a local Supabase')

const vercel = JSON.parse(readFileSync(path.join(__dirname, '..', 'vercel.json'), 'utf8'))
const SECURITY_HEADERS = Object.fromEntries(
  vercel.headers.find((h) => h.source === '/(.*)').headers.map((h) => [h.key.toLowerCase(), h.value.replace(/https:\/\/[a-z0-9]+\.supabase\.co/g, API)]),
)
const RUN = String(Date.now()).slice(-7)
const PASSWORD = 'Content-Journey-42-pass'
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
  sql(`select ops.grant_member_access('${body.id}', 'tester', 'content-journey')`)
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
  const emailC = `cnt-c-${RUN}@example.test`
  const emailF = `cnt-f-${RUN}@example.test`
  const emailV = `cnt-v-${RUN}@example.test`
  const userC = `cntc${RUN}`
  const userF = `cntf${RUN}`
  const text = `A budget that finally works ${RUN}`
  try {
    const c = await createMember(emailC, userC, 'Cara Content')
    const f = await createMember(emailF, userF, 'Fola Follower')
    const v = await createMember(emailV, `cntv${RUN}`, 'Vee Viewer')
    const tokenF = await tokenFor(emailF)
    const tokenV = await tokenFor(emailV)
    await rpc(tokenF, 'app_follow', { p_creator: c })
    await rpc(tokenV, 'app_follow', { p_creator: f })

    // 1 and 2. Publish with a topic, then edit.
    const ctxC = await newContext(browser)
    const pageC = await ctxC.newPage()
    await signIn(pageC, emailC)
    await pageC.goto(`${APP}/app/new`)
    await pageC.getByLabel('Write a post').fill(text)
    await pageC.getByLabel('Topic (optional)').selectOption('money')
    await screenChecks(pageC, 'the composer with a topic')
    await pageC.getByRole('button', { name: 'Post', exact: true }).click()
    await pageC.getByTestId('post-topic').waitFor()
    check('the published post shows its topic', (await pageC.getByTestId('post-topic').innerText()) === 'Money & business')
    const postId = sql(`select id from social.posts where author_id = '${c}' and body = '${text}'`)
    check('the topic is stored once', sql(`select topic from social.posts where id = '${postId}'`) === 'money')
    await pageC.getByRole('button', { name: 'Edit post' }).click()
    await pageC.getByLabel('Edit your post').fill(`${text}, updated`)
    await screenChecks(pageC, 'the post editor')
    await pageC.getByRole('button', { name: 'Save changes' }).click()
    await pageC.getByTestId('post-edited').waitFor()
    check('the edit shows the new text and "Edited"', (await pageC.getByText(`${text}, updated`).count()) === 1)
    check('the earlier version is kept', sql(`select previous_body from social.post_edits where post_id = '${postId}'`) === text)
    await ctxC.close()

    // 3. Save and repost.
    const ctxF = await newContext(browser)
    const pageF = await ctxF.newPage()
    await signIn(pageF, emailF)
    await pageF.goto(`${APP}/app/post/${postId}`)
    await pageF.getByRole('button', { name: 'Save', exact: true }).click()
    await pageF.getByRole('button', { name: 'Saved (tap to remove)' }).waitFor()
    await pageF.getByRole('button', { name: 'Repost, 0 reposts' }).click()
    await pageF.getByRole('button', { name: 'Undo repost, 1 repost' }).waitFor()
    await screenChecks(pageF, 'a post with Save and Repost')
    await pageF.goto(`${APP}/app/saved`)
    await pageF.getByText(`${text}, updated`).waitFor()
    check('the Saved list shows the saved post', true)
    await screenChecks(pageF, 'the Saved list')
    check('save and repost are each one event', sql(`select string_agg(name, ',' order by id) from analytics.events where actor_id = '${f}' and name in ('post_saved', 'post_reposted')`) === 'post_saved,post_reposted')
    check('saving makes the follower an Active Supporter', sql(`select social.is_active_supporter('${f}', '${c}')`) === 't')
    await ctxF.close()

    // 4. The repost reaches a follower of the reposter.
    const ctxV = await newContext(browser)
    const pageV = await ctxV.newPage()
    await signIn(pageV, emailV)
    await pageV.goto(`${APP}/app?face=following`)
    await pageV.getByTestId('reposted-by').first().waitFor()
    const by = await pageV.getByTestId('reposted-by').first().innerText()
    check('the repost shows who reposted it', /Reposted by\s+Fola Follower/.test(by), by)
    check('the reposted post appears once', (await pageV.getByText(`${text}, updated`).count()) === 1)
    await screenChecks(pageV, 'Home with a repost')
    await ctxV.close()

    check('no Content Security Policy violations', csp.length === 0, csp.slice(0, 2).join(' | '))
    check('no console errors', consoleErrors.length === 0, consoleErrors.slice(0, 2).join(' | '))
  } catch (e) {
    failures++
    console.log(`FAIL  content journey stopped: ${e && e.message}`)
  } finally {
    await browser.close()
  }
  console.log(`Content journey: ${failures === 0 ? 'all passed' : `${failures} failed`}`)
  process.exit(failures === 0 ? 0 : 1)
})()
