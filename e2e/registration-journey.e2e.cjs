// Controlled registration through invitation and referral links (foundation v2,
// 20261130000000), in a real browser against a LOCAL Supabase with real Auth and
// real email (Mailpit), with the production security headers.
//
//  1. While registration is paused, the account creation hook refuses and no account is made.
//  2. Through a founder invitation link: register, confirm the email, sign in automatically,
//     claim membership (cohort from the link), set up a profile, reach Home with five
//     destinations and three Home faces.
//  3. My Split shows the member's personal referral link.
//  4. A second person joins through that referral link: attributed to the referrer, and no
//     follow is ever created for them.
//  5. A member granted by the founder without an 18+ confirmation sees only the confirmation
//     until they give it.
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
const MAIL = env('MAILPIT_URL')
const DB = env('DB_URL')
const SERVICE = env('SERVICE_ROLE_KEY')
if (!/^http:\/\/(127\.0\.0\.1|localhost):/.test(API)) throw new Error('Refusing: not a local Supabase')

const vercel = JSON.parse(readFileSync(path.join(__dirname, '..', 'vercel.json'), 'utf8'))
const SECURITY_HEADERS = Object.fromEntries(
  vercel.headers.find((h) => h.source === '/(.*)').headers.map((h) => [h.key.toLowerCase(), h.value.replace(/https:\/\/[a-z0-9]+\.supabase\.co/g, API)]),
)
const RUN = Date.now()
const PASSWORD = 'Correct-Horse-42-battery'
let failures = 0
const check = (name, ok, detail = '') => {
  if (!ok) failures++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`)
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const sql = (q) => execFileSync('psql', [DB, '-v', 'ON_ERROR_STOP=1', '-qAt', '-c', q]).toString().trim()
const idOf = (email) => sql(`select id from auth.users where email = '${email}'`)

const AXE = readFileSync(path.join(__dirname, '..', 'node_modules', 'axe-core', 'axe.min.js'), 'utf8')
async function axe(page) {
  // Measure the settled page: a face sliding in is briefly translucent.
  await page.evaluate(() => Promise.all(document.getAnimations().map((a) => a.finished.catch(() => null))))
  await page.evaluate(AXE)
  return page.evaluate(async () => (await window.axe.run(document, { runOnly: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] })).violations.map((v) => `${v.id} x${v.nodes.length}`))
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
  throw new Error(`No ${type} email for ${email}`)
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

async function register(page, url, email) {
  await page.goto(url)
  await page.getByTestId('register-form').waitFor()
  await page.getByLabel('Email address', { exact: true }).fill(email)
  await page.getByLabel('Password', { exact: true }).fill(PASSWORD)
  await page.getByLabel('Confirm password').fill(PASSWORD)
  await page.getByLabel('I confirm that I am 18 or older.').check()
  await page.getByRole('button', { name: 'Create account' }).click()
}

async function confirmAndSetUp(page, email, username, displayName) {
  const { href, subject } = await emailLink(email, 'email')
  check(`the confirmation email is from Splitpost (${username})`, /Splitpost/.test(subject) && !/Crevant/.test(subject), subject)
  check('the confirmation code travels in the fragment, never to the web server', href.startsWith(`${APP}/auth/confirm#token_hash=`))
  await page.goto(href)
  await page.getByRole('heading', { name: 'Confirm your email' }).waitFor()
  await page.getByRole('button', { name: 'Continue' }).click()
  await page.waitForURL(`${APP}/app`)
  await page.getByText('Step 1 of 5: Your name').waitFor({ timeout: 15000 })
  await page.getByLabel('Username').fill(username)
  await page.getByLabel('Display name').fill(displayName)
  await page.getByRole('button', { name: 'Continue' }).click()
  await page.getByRole('heading', { name: 'How will you use Splitpost?' }).waitFor()
  await page.getByRole('button', { name: 'Skip the rest' }).click()
  await page.getByRole('heading', { name: 'People you might like' }).waitFor()
  await page.getByRole('button', { name: 'Go to my feed' }).click()
  await page.getByRole('heading', { name: 'Home' }).waitFor()
}

;(async () => {
  const browser = await chromium.launch({
    args: ['--disable-features=LocalNetworkAccessChecks,BlockInsecurePrivateNetworkRequests,PrivateNetworkAccessSendPreflights'],
  })
  const emailA = `reg-a-${RUN}@example.test`
  const emailB = `reg-b-${RUN}@example.test`
  const emailPaused = `reg-paused-${RUN}@example.test`
  try {
    const invite = sql("select ops.create_invitation_link('registration-journey', 'creator', 3)")

    // 1. Paused.
    sql("select ops.set_registration_settings('registration-journey', 'journey: paused', true)")
    {
      const ctx = await newContext(browser)
      const page = await ctx.newPage()
      await register(page, `${APP}/register/${invite}`, emailPaused)
      await page.getByText('Registration is paused right now. Please try again later, or join the waitlist.').waitFor()
      check('while paused, registration is refused with a clear message', true)
      check('while paused, no account was created', sql(`select count(*) from auth.users where email = '${emailPaused}'`) === '0')
      await ctx.close()
    }

    // 2. Through a founder invitation link.
    sql("select ops.set_registration_settings('registration-journey', 'journey: open', false, 200, 25, 5)")
    let refCode = ''
    {
      const ctx = await newContext(browser)
      const page = await ctx.newPage()
      await page.goto(`${APP}/register/${invite}`)
      await page.getByTestId('register-form').waitFor()
      const v = await axe(page)
      check('the registration page has no WCAG 2.2 AA violations', v.length === 0, v.join(', '))
      await noSidewaysScroll(page, 'the registration page')
      await register(page, `${APP}/register/${invite}`, emailA)
      await page.getByTestId('register-sent').waitFor()
      check('registration through a valid link asks to confirm the email', true)
      const a = idOf(emailA)
      check('the account exists but has no membership before confirmation', a !== '' && sql(`select count(*) from ops.member_access where user_id = '${a}'`) === '0')
      await confirmAndSetUp(page, emailA, `rega${String(RUN).slice(-6)}`, 'Reg A')
      check('membership was claimed through the invitation, with the link\'s cohort', sql(`select cohort || '|' || status || '|' || updated_by from ops.member_access where user_id = '${a}'`) === 'creator|active|self-service')
      check('the 18+ confirmation was recorded from registration', sql(`select source from ops.age_attestations where user_id = '${a}'`) === 'registration')
      check('the registration is recorded (invitation, no referrer)', sql(`select kind || '|' || coalesce(referrer_id::text, 'none') from ops.registrations where user_id = '${a}'`) === 'invitation|none')
      check('the registration is in the event stream once', sql(`select count(*) from analytics.events where name = 'registered' and actor_id = '${a}'`) === '1')
      check('the invitation link counted one use', sql(`select uses from ops.registration_links where code = '${invite}'`) === '1')

      const nav = page.getByRole('navigation', { name: 'Main' }).first()
      for (const label of ['Home', 'Discover', 'Create', 'My Split', 'Profile']) check(`navigation has ${label}`, (await nav.getByTitle(label).count()) === 1)
      check('Clique is no longer a primary destination', (await nav.getByTitle('Clique').count()) === 0)
      const tabs = await page.getByRole('tab').allInnerTexts()
      check('Home has the three faces', JSON.stringify(tabs) === JSON.stringify(['Clique first', 'My Clique', 'Following']), tabs.join(','))
      await page.getByRole('tab', { name: 'My Clique' }).click()
      await page.waitForURL(/\?face=clique$/)
      check('choosing a face records it in the address', true)
      await page.getByRole('link', { name: 'Choose your Clique' }).waitFor()
      check('an empty My Clique explains itself and offers a next step', true)
      await page.keyboard.press('ArrowRight')
      await page.waitForURL(/\?face=following$/)
      check('arrow keys move between faces', true)
      const vh = await axe(page)
      check('Home with faces has no WCAG 2.2 AA violations', vh.length === 0, vh.join(', '))
      await noSidewaysScroll(page, 'Home with faces')

      // 3. My Split: the personal referral link.
      await nav.getByTitle('My Split').click()
      await page.getByRole('heading', { name: 'My Split' }).waitFor()
      check('My Split always shows the simulated disclosure', /simulated/i.test(await page.getByTestId('split-disclosure').innerText()))
      await page.getByRole('tab', { name: 'Opportunities' }).click()
      const link = await page.getByTestId('referral-link').innerText()
      refCode = (link.match(/\/register\/([0-9a-f]{16})$/) || [])[1] || ''
      check('Opportunities shows a personal referral link on this site', !!refCode && link.startsWith(`${APP}/register/`), link)
      const vs = await axe(page)
      check('My Split has no WCAG 2.2 AA violations', vs.length === 0, vs.join(', '))
      await noSidewaysScroll(page, 'My Split')
      await ctx.close()
    }

    // 4. Through the referral link.
    {
      const ctx = await newContext(browser)
      const page = await ctx.newPage()
      await register(page, `${APP}/register/${refCode}`, emailB)
      await page.getByTestId('register-sent').waitFor()
      await confirmAndSetUp(page, emailB, `regb${String(RUN).slice(-6)}`, 'Reg B')
      const a = idOf(emailA)
      const b = idOf(emailB)
      check('the referred member is attributed to the referrer', sql(`select kind || '|' || referrer_id from ops.registrations where user_id = '${b}'`) === `referral|${a}`)
      check('a referral never follows anyone on the new member\'s behalf', sql(`select count(*) from social.follows where follower_id = '${b}'`) === '0')
      check('a referral joins as a fan', sql(`select cohort from ops.member_access where user_id = '${b}'`) === 'fan')
      await ctx.close()
    }

    // 5. A founder-granted member without an 18+ confirmation.
    {
      const emailC = `reg-c-${RUN}@example.test`
      const created = await fetch(`${API}/auth/v1/admin/users`, {
        method: 'POST',
        headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: emailC, password: PASSWORD, email_confirm: true }),
      }).then((r) => r.json())
      sql(`select ops.grant_member_access('${created.id}', 'fan', 'registration-journey')`)
      // The local test setup confirms test accounts automatically; remove it for this member.
      sql(`delete from ops.age_attestations where user_id = '${created.id}'`)
      const ctx = await newContext(browser)
      const page = await ctx.newPage()
      await page.goto(`${APP}/sign-in?next=%2Fapp`)
      await page.getByLabel('Email address', { exact: true }).fill(emailC)
      await page.getByLabel('Password', { exact: true }).fill(PASSWORD)
      await page.getByRole('button', { name: 'Sign in' }).click()
      await page.getByRole('heading', { name: 'One quick check' }).waitFor()
      check('a member without an 18+ confirmation sees only the confirmation', (await page.getByRole('navigation', { name: 'Main' }).count()) === 0)
      const vc = await axe(page)
      check('the confirmation screen has no WCAG 2.2 AA violations', vc.length === 0, vc.join(', '))
      await page.getByLabel('I confirm that I am 18 or older.').check()
      await page.getByRole('button', { name: 'Continue' }).click()
      await page.getByText('Step 1 of 5: Your name').waitFor()
      check('after confirming, the member continues to setup', sql(`select source from ops.age_attestations where user_id = '${created.id}'`) === 'in_app')
      await ctx.close()
    }

    check('no Content Security Policy violations', csp.length === 0, csp.slice(0, 2).join(' | '))
    check('no console errors', consoleErrors.length === 0, consoleErrors.slice(0, 2).join(' | '))
  } catch (e) {
    failures++
    console.log(`FAIL  registration journey stopped: ${e && e.message}`)
  } finally {
    sql("select ops.set_registration_settings('registration-journey', 'journey: done', true)")
    await browser.close()
  }
  console.log(`Registration journey: ${failures === 0 ? 'all passed' : `${failures} failed`}`)
  process.exit(failures === 0 ? 0 : 1)
})()
