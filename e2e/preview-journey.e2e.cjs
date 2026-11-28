// Public previews (20261204000000), in a real browser against a LOCAL Supabase
// with the production security headers. A signed-out visitor:
//
//  1. gets nothing while previews are off;
//  2. once on, sees only the shared post (text, topic, creator), with a way to
//     join through the sharer's referral link or sign in and follow;
//  3. is counted per referral link, with no visitor identity;
//  4. never sees anything of a creator who switched previews off, a deleted post, or a
//     post whose creator withdrew;
//  5. can reach nothing else: the member pages still ask them to sign in.
// WCAG 2.2 AA, 320 and 390 px, no CSP violations. Run by scripts/e2e/auth-journey.sh.
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
const PASSWORD = 'Preview-Journey-42-pass'
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
  sql(`select ops.grant_member_access('${body.id}', 'tester', 'preview-journey')`)
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
    await page.getByRole('button', { name: 'Continue' }).click()
    await page.getByRole('button', { name: 'Go to my feed' }).click()
  }
  await home.waitFor()
}



;(async () => {
  const browser = await chromium.launch({
    args: ['--disable-features=LocalNetworkAccessChecks,BlockInsecurePrivateNetworkRequests,PrivateNetworkAccessSendPreflights'],
  })
  try {
    const c = await createMember(`pv-c-${RUN}@example.test`, `pvc${RUN}`, 'Cora Preview')
    const s = await createMember(`pv-s-${RUN}@example.test`, `pvs${RUN}`, 'Sam Sharer')
    const tokenC = await tokenFor(`pv-c-${RUN}@example.test`)
    const created = await rpc(tokenC, 'app_create_post', { p_body: `A preview worth sharing ${RUN}` })
    const postId = created.body
    await rpc(tokenC, 'app_set_post_topic', { p_post: postId, p_topic: 'money' })
    const tokenS = await tokenFor(`pv-s-${RUN}@example.test`)
    const ref = (await rpc(tokenS, 'app_my_referral_link')).body
    check('the sharer has a referral link', /^[0-9a-f]{16}$/.test(String(ref)), String(ref))

    const ctx = await newContext(browser)
    const page = await ctx.newPage()

    // 1. Off by default.
    sql("select ops.set_public_previews('preview-journey', false, 'journey: off')")
    await page.goto(`${APP}/p/${postId}?r=${ref}`)
    await page.getByRole('heading', { name: "This post isn't available" }).waitFor()
    check('while previews are off, a visitor sees nothing of the post', (await page.getByText(`A preview worth sharing ${RUN}`).count()) === 0)

    // 2. On project-wide. Previews are on by default (BL-006), but this creator
    // switches them off in Settings first: nothing is shown.
    sql("select ops.set_public_previews('preview-journey', true, 'journey: on')")
    {
      const ctxC = await newContext(browser)
      const pageC = await ctxC.newPage()
      await signIn(pageC, `pv-c-${RUN}@example.test`)
      await pageC.goto(`${APP}/app/settings/privacy`)
      const box = pageC.getByRole('checkbox', { name: 'Allow public previews of my posts' })
      await box.waitFor()
      check('previews are on by default for every creator', await box.isChecked())
      await screenChecks(pageC, 'the public preview setting')
      await box.uncheck()
      await pageC.getByText('Off: only members can open links to your posts.').waitFor()
      check('switching off is recorded at once', sql(`select count(*) from social.preview_optouts where member_id = '${c}'`) === '1')
      await page.goto(`${APP}/p/${postId}?r=${ref}`)
      await page.getByRole('heading', { name: "This post isn't available" }).waitFor()
      check('a creator who switched previews off is never previewed', true)
      // And on again, recording the wording shown.
      await box.check()
      await pageC.getByText('On: shared links to your posts show a public preview.').waitFor()
      check('switching on again records the wording shown', sql(`select wording_version from social.preview_consents where member_id = '${c}'`) === 'previews-v2')
      await ctxC.close()
    }
    await page.goto(`${APP}/p/${postId}?r=${ref}`)
    await page.getByTestId('public-post').waitFor()
    const text = await page.getByTestId('public-post').innerText()
    check('the preview shows the text, topic and creator', text.includes(`A preview worth sharing ${RUN}`) && text.includes('Cora Preview') && text.includes('Money & business'))
    check('the join link carries the sharer\'s referral link', (await page.getByRole('link', { name: 'Join with this invitation' }).getAttribute('href')) === `/register/${ref}`)
    check('members can sign in and go straight to the creator', (await page.getByRole('link', { name: /sign in and follow/ }).getAttribute('href')) === `/sign-in?next=${encodeURIComponent(`/app/u/pvc${RUN}`)}`)
    await screenChecks(page, 'the public preview')

    // 3. Counted per referral link, no visitor identity.
    check('the visit is counted under the referral link', sql(`select coalesce(sum(views), 0) from social.preview_visits where post_id = '${postId}' and ref_code = '${ref}'`) === '1')

    // 4. Removal and opt-out.
    sql(`update social.posts set deleted_at = now() where id = '${postId}'`)
    await page.goto(`${APP}/p/${postId}?r=${ref}`)
    await page.getByRole('heading', { name: "This post isn't available" }).waitFor()
    check('a deleted post is no longer previewed', true)
    sql(`update social.posts set deleted_at = null where id = '${postId}'`)
    await rpc(tokenC, 'app_set_public_previews', { p_allowed: false })
    await page.goto(`${APP}/p/${postId}`)
    await page.getByRole('heading', { name: "This post isn't available" }).waitFor()
    check('a creator who withdrew is no longer previewed, straight away', true)

    // 5. Nothing else is open to the visitor.
    const anon = await rpc(PUB, 'app_feed_page', {})
    check('a visitor still cannot call member functions', anon.status === 401 || anon.status === 403 || anon.status === 404, String(anon.status))
    await page.goto(`${APP}/app/post/${postId}`)
    await page.getByRole('heading', { name: /Sign in/ }).first().waitFor()
    check('the member post page still asks a visitor to sign in', true)
    await ctx.close()

    check('no Content Security Policy violations', csp.length === 0, csp.slice(0, 2).join(' | '))
  } catch (e) {
    failures++
    console.log(`FAIL  preview journey stopped: ${e && e.message}`)
  } finally {
    try { sql("select ops.set_public_previews('preview-journey', false, 'journey: done')") } catch {}
    await browser.close()
  }
  console.log(`Preview journey: ${failures === 0 ? 'all passed' : `${failures} failed`}`)
  process.exit(failures === 0 ? 0 : 1)
})()
