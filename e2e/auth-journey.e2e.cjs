// Phase 1A, PR 3: the complete sign-in journey in a real browser, against a
// real LOCAL Supabase. Run through scripts/e2e/auth-journey.sh.
// Every check prints PASS or FAIL; the process exits non zero on any failure.

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
const PUB = env('PUBLISHABLE_KEY')
if (!/^http:\/\/(127\.0\.0\.1|localhost):/.test(API)) throw new Error('Refusing: not a local Supabase')

// The real security headers from vercel.json, with the staging project
// swapped for the local stack so the same policy applies here.
const vercel = JSON.parse(readFileSync(path.join(__dirname, '..', 'vercel.json'), 'utf8'))
const SECURITY_HEADERS = Object.fromEntries(
  vercel.headers.find((h) => h.source === '/(.*)').headers.map((h) => [h.key.toLowerCase(), h.value.replace('https://kpudeppgokpjhvaqrprn.supabase.co', API)]),
)

const RUN = Date.now()
const PASSWORD = 'Correct-Horse-42-battery'
const NEW_PASSWORD = 'Another-Strong-Pass-77'
let failures = 0
const check = (name, ok, detail = '') => {
  if (!ok) failures++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`)
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const sql = (q) => execFileSync('psql', [DB, '-v', 'ON_ERROR_STOP=1', '-qAt', '-c', q]).toString().trim()
const userBy = (email) => sql(`select id || '|' || coalesce(email_confirmed_at::text, '') from auth.users where email = '${email}'`)
const profileCount = (email) => Number(sql(`select count(*) from public.profiles p join auth.users u on u.id = p.id where u.email = '${email}'`))
const admin = (p, body) =>
  fetch(`${API}${p}`, { method: 'POST', headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then((r) => r.json())

async function emailLink(email, type) {
  for (let i = 0; i < 60; i++) {
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

const cspViolations = []
const verifyCalls = []
// Every request Chromium actually puts on the wire (from its own network
// layer), every console message, and every page's storage, so we can prove the
// one-time codes go nowhere except the single verification request.
const wire = []
const consoleLines = []
async function watchWire(page) {
  const cdp = await page.context().newCDPSession(page)
  await cdp.send('Network.enable')
  cdp.on('Network.requestWillBeSent', ({ request }) => {
    const referer = Object.entries(request.headers || {}).find(([k]) => k.toLowerCase() === 'referer')?.[1] || ''
    wire.push({ method: request.method, url: request.url, referer, body: request.postData || '' })
  })
}
async function newContext(browser) {
  const ctx = await browser.newContext()
  const openPage = ctx.newPage.bind(ctx)
  ctx.newPage = async () => {
    const page = await openPage()
    await watchWire(page)
    return page
  }
  await ctx.route(`${APP}/**`, async (route) => {
    const res = await route.fetch()
    const headers = { ...res.headers() }
    if ((headers['content-type'] || '').includes('text/html')) Object.assign(headers, SECURITY_HEADERS)
    await route.fulfill({ response: res, headers })
  })
  await ctx.addInitScript(() => {
    document.addEventListener('securitypolicyviolation', (e) => {
      window.__csp = (window.__csp || []).concat(`${e.violatedDirective} ${e.blockedURI}`)
    })
  })
  ctx.on('request', (r) => {
    if (r.url().startsWith(`${API}/auth/v1/verify`)) verifyCalls.push(r.method())
  })
  ctx.on('console', (m) => {
    consoleLines.push(m.text())
    if (/Content Security Policy/i.test(m.text())) cspViolations.push(m.text())
  })
  return ctx
}
async function collectCsp(page) {
  const v = await page.evaluate(() => window.__csp || []).catch(() => [])
  cspViolations.push(...v)
}
async function signIn(page, email, password, next = '') {
  await page.goto(`${APP}/sign-in${next}`)
  await page.getByLabel('Email address', { exact: true }).fill(email)
  await page.getByLabel('Password', { exact: true }).fill(password)
  await page.getByRole('button', { name: 'Sign in' }).click()
}
const storedText = (page) => page.evaluate(() => JSON.stringify([{ ...localStorage }, { ...sessionStorage }, document.cookie]))
const codeOf = (link) => new URLSearchParams(new URL(link).hash.slice(1)).get('token_hash') || ''
const storedSessionKeys = (page) => page.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith('sb-')))

;(async () => {
  // The security headers are injected by intercepting page responses. Chromium
  // then treats those pages as "public" and blocks their requests to the
  // local Supabase on 127.0.0.1 (Local Network Access). That only affects this
  // local test setup; the hosted staging project is a public address.
  const browser = await chromium.launch({
    args: ['--disable-features=LocalNetworkAccessChecks,BlockInsecurePrivateNetworkRequests,PrivateNetworkAccessSendPreflights'],
  })
  try {
    const emailA = `founder-${RUN}@example.test`
    let resetCode = ''

    // 1. Signed-out visitors are sent to sign in; there is no sign-up.
    {
      const ctx = await newContext(browser)
      const page = await ctx.newPage()
      await page.goto(`${APP}/app`)
      await page.waitForURL(/\/sign-in\?next=%2Fapp$/)
      check('signed-out visitors to /app are sent to sign in, with a way back', true)
      const text = await page.locator('main').innerText()
      check('sign-in page has no sign-up option', !/sign up|create (an )?account|register/i.test(text) && text.includes("no public sign-up"))
      for (const p of ['/sign-up', '/register']) {
        await page.goto(`${APP}${p}`)
        check(`${p} does not exist`, await page.getByText('Page not found').isVisible())
      }
      const r = await fetch(`${API}/auth/v1/signup`, { method: 'POST', headers: { apikey: PUB, 'Content-Type': 'application/json' }, body: JSON.stringify({ email: `walk-in-${RUN}@example.test`, password: PASSWORD }) }).then((x) => x.json())
      check('Supabase refuses direct sign-up', r.error_code === 'signup_disabled', r.error_code)
      await collectCsp(page)
      await ctx.close()
    }

    // 2. Invitation email points at our Continue page.
    await admin('/auth/v1/invite', { email: emailA })
    const inviteLink = await emailLink(emailA, 'invite')
    check('invitation link carries the one-time code after # (never sent to the web server)', inviteLink.startsWith(`${APP}/auth/confirm#token_hash=`) && inviteLink.includes('type=invite') && !inviteLink.includes('?'), inviteLink.replace(/token_hash=[^&]+/, 'token_hash=…'))
    const inviteCode = codeOf(inviteLink)

    // 3. Email scanners: fetching the link, or opening it without pressing Continue, uses nothing.
    {
      const r = await fetch(inviteLink)
      check('a scanner fetching the link gets the page and nothing else', r.status === 200)
      const ctx = await newContext(browser)
      const page = await ctx.newPage()
      // An old-style link with the code in the query string is ignored.
      await page.goto(`${APP}/auth/confirm?token_hash=query-string-code-0123456789&type=invite`)
      await page.getByText('Open the link from your email').waitFor()
      check('a code in the query string (?) is ignored and removed', page.url() === `${APP}/auth/confirm` && !(await page.getByRole('button', { name: 'Continue' }).isVisible()))
      await page.goto(`${APP}/sign-in`)
      await page.goto(inviteLink)
      await page.getByRole('button', { name: 'Continue' }).waitFor()
      await sleep(2500)
      check('opening the link without pressing Continue sends nothing to Supabase', verifyCalls.length === 0, `${verifyCalls.length} verify calls`)
      check('the one-time code is removed from the address bar', page.url() === `${APP}/auth/confirm`, page.url())
      check('the one-time code is not kept in browser storage or cookies', !(await storedText(page)).includes(inviteCode))
      await page.goBack()
      const back = page.url()
      await page.goForward()
      await page.getByText('Open the link from your email').waitFor()
      check('Back and Forward never bring the code back', back === `${APP}/sign-in` && page.url() === `${APP}/auth/confirm`, `${back} then ${page.url()}`)
      check('the invitation is still unused afterwards', userBy(emailA).split('|')[1] === '' && profileCount(emailA) === 0)
      await collectCsp(page)
      await ctx.close()
    }

    // 4. A person accepts: Continue, choose a password, profile ready.
    const ctxA = await newContext(browser)
    const pageA = await ctxA.newPage()
    {
      await pageA.goto(inviteLink)
      await pageA.getByRole('button', { name: 'Continue' }).click()
      await pageA.waitForURL(`${APP}/auth/set-password`)
      check('Continue confirms the invitation and asks for a password', await pageA.getByRole('heading', { name: 'Choose your password' }).isVisible())
      check('exactly one verification request, sent on Continue', verifyCalls.length === 1 && verifyCalls[0] === 'POST', verifyCalls.join(','))
      check('email confirmed and profile created automatically', userBy(emailA).split('|')[1] !== '' && profileCount(emailA) === 1)

      await pageA.getByLabel('New password', { exact: true }).fill('too-short')
      await pageA.getByLabel('Type it again', { exact: true }).fill('too-short')
      await pageA.getByRole('button', { name: 'Save password' }).click()
      check('a password under 10 characters is refused', (await pageA.getByRole('alert').innerText()).includes('at least 10'))
      await pageA.getByLabel('New password', { exact: true }).fill(PASSWORD)
      await pageA.getByLabel('Type it again', { exact: true }).fill(PASSWORD + 'x')
      await pageA.getByRole('button', { name: 'Save password' }).click()
      check('mismatched passwords are refused', (await pageA.getByRole('alert').innerText()).includes("don't match"))
      await pageA.getByLabel('Type it again', { exact: true }).fill(PASSWORD)
      await pageA.getByRole('button', { name: 'Save password' }).click()
      await pageA.waitForURL(`${APP}/app`)
      await pageA.getByText('Your profile is ready').waitFor()
      check('home shows "Your profile is ready"', true)
      check('home shows the signed-in email', (await pageA.locator('main').innerText()).includes(emailA))
      await pageA.goto(`${APP}/`)
      check('header offers "Your account" when signed in', await pageA.getByRole('banner').getByRole('link', { name: 'Your account' }).isVisible())
      await collectCsp(pageA)
    }

    // 5. A used link cannot be used again.
    {
      const ctx = await newContext(browser)
      const page = await ctx.newPage()
      await page.goto(inviteLink)
      await page.getByRole('button', { name: 'Continue' }).click()
      await page.getByText(/This link has expired or was already used/).waitFor()
      check('a used invitation link is refused with a clear message', true)
      check('still exactly one profile', profileCount(emailA) === 1)
      await ctx.close()
    }

    // 6. Sign out, then signed-in pages are closed again.
    {
      await pageA.goto(`${APP}/app/account`)
      await pageA.getByRole('button', { name: 'Sign out', exact: true }).click()
      await pageA.waitForURL(`${APP}/sign-in`)
      check('sign out returns to sign in', true)
      check('sign out removes the session from the browser', (await storedSessionKeys(pageA)).length === 0)
      await pageA.goto(`${APP}/app/account`)
      await pageA.waitForURL(/\/sign-in\?next=%2Fapp%2Faccount$/)
      check('after sign out, account pages need sign in again', true)
    }

    // 7. Sign in: same message for wrong password and unknown email; returns to the requested page.
    {
      await signIn(pageA, emailA, 'Wrong-password-000')
      const wrong = await pageA.getByRole('alert').innerText()
      await signIn(pageA, `nobody-${RUN}@example.test`, PASSWORD)
      const unknown = await pageA.getByRole('alert').innerText()
      check('wrong password and unknown email get the same message', wrong === unknown, wrong)
      await signIn(pageA, emailA, PASSWORD, '?next=%2Fapp%2Faccount')
      await pageA.waitForURL(`${APP}/app/account`)
      check('sign in returns to the page that was requested', true)
      await collectCsp(pageA)
    }

    // 8. A crafted link cannot send people to another website after sign-in.
    for (const next of ['https%3A%2F%2Fevil.example', '%2F%2Fevil.example']) {
      const ctx = await newContext(browser)
      const page = await ctx.newPage()
      await signIn(page, emailA, PASSWORD, `?next=${next}`)
      await page.waitForURL(`${APP}/app`)
      check(`next=${decodeURIComponent(next)} stays on Crevant`, page.url() === `${APP}/app`)
      await ctx.close()
    }

    // 9. Password reset: same message for everyone; the link works once; the old password stops working.
    {
      const ctx = await newContext(browser)
      const page = await ctx.newPage()
      const messages = []
      for (const email of [`nobody-${RUN}@example.test`, emailA]) {
        await page.goto(`${APP}/forgot-password`)
        await page.getByLabel('Email address', { exact: true }).fill(email)
        await page.getByRole('button', { name: 'Send reset link' }).click()
        messages.push(await page.getByRole('status').innerText())
      }
      check('reset gives the same message for unknown and real emails', messages[0] === messages[1], messages[0].slice(0, 50))
      const resetLink = await emailLink(emailA, 'recovery')
      check('reset link carries the one-time code after # (never sent to the web server)', resetLink.startsWith(`${APP}/auth/confirm#token_hash=`) && !resetLink.includes('?'))
      resetCode = codeOf(resetLink)
      const before = verifyCalls.length
      await page.goto(resetLink)
      await page.getByRole('button', { name: 'Continue' }).waitFor()
      await sleep(1000)
      check('opening the reset link sends nothing until Continue', verifyCalls.length === before)
      check('the reset code is not kept in browser storage or cookies', !(await storedText(page)).includes(resetCode))
      await page.getByRole('button', { name: 'Continue' }).click()
      await page.waitForURL(`${APP}/auth/set-password`)
      check('reset asks for a new password', await page.getByRole('heading', { name: 'Choose a new password' }).isVisible())
      await page.getByLabel('New password', { exact: true }).fill(NEW_PASSWORD)
      await page.getByLabel('Type it again', { exact: true }).fill(NEW_PASSWORD)
      await page.getByRole('button', { name: 'Save password' }).click()
      await page.waitForURL(`${APP}/app`)
      check('new password saved', await page.getByText('Your password is saved.').isVisible())
      await page.goto(resetLink)
      await page.getByRole('button', { name: 'Continue' }).click()
      await page.getByText(/This link has expired or was already used/).waitFor()
      check('a used reset link is refused', true)
      await collectCsp(page)
      await ctx.close()

      const fresh = await newContext(browser)
      const p2 = await fresh.newPage()
      await signIn(p2, emailA, PASSWORD)
      check('the old password no longer works', (await p2.getByRole('alert').innerText()).includes("don't match"))
      await signIn(p2, emailA, NEW_PASSWORD)
      await p2.waitForURL(`${APP}/app`)
      check('the new password works', true)
      await fresh.close()
    }

    // 10. An expired invitation link is refused and creates no profile.
    {
      const emailC = `expired-${RUN}@example.test`
      await admin('/auth/v1/invite', { email: emailC })
      const link = await emailLink(emailC, 'invite')
      sql(`update auth.users set confirmation_sent_at = now() - interval '2 hours', invited_at = now() - interval '2 hours' where email = '${emailC}'`)
      const ctx = await newContext(browser)
      const page = await ctx.newPage()
      await page.goto(link)
      await page.getByRole('button', { name: 'Continue' }).click()
      await page.getByText(/This link has expired or was already used/).waitFor()
      check('an expired invitation link is refused', true)
      check('the expired invitee has no profile', profileCount(emailC) === 0)
      await ctx.close()
    }

    // 11. Sign out of all devices ends sessions elsewhere.
    {
      const other = await newContext(browser)
      const pageB = await other.newPage()
      await signIn(pageB, emailA, NEW_PASSWORD)
      await pageB.waitForURL(`${APP}/app`)
      const key = (await storedSessionKeys(pageB))[0]
      const refresh = JSON.parse(await pageB.evaluate((k) => localStorage.getItem(k), key)).refresh_token
      const mine = await newContext(browser)
      const pageM = await mine.newPage()
      await signIn(pageM, emailA, NEW_PASSWORD, '?next=%2Fapp%2Faccount')
      await pageM.waitForURL(`${APP}/app/account`)
      await pageM.getByRole('button', { name: 'Sign out of all devices' }).click()
      await pageM.waitForURL(`${APP}/sign-in`)
      const r = await fetch(`${API}/auth/v1/token?grant_type=refresh_token`, { method: 'POST', headers: { apikey: PUB, 'Content-Type': 'application/json' }, body: JSON.stringify({ refresh_token: refresh }) })
      check('"Sign out of all devices" ends the session on the other device', r.status >= 400, String(r.status))
      await collectCsp(pageM)
      await other.close()
      await mine.close()
    }

    // 12. The sample tour and landing page still work under the security policy.
    {
      const ctx = await newContext(browser)
      const page = await ctx.newPage()
      await page.goto(`${APP}/`)
      check('landing page loads', (await page.getByRole('heading', { level: 1 }).innerText()).includes('You need the right 1,000'))
      await page.goto(`${APP}/tour/discover`)
      check('sample tour loads', await page.getByRole('note', { name: 'Sample tour' }).isVisible())
      await collectCsp(page)
      await ctx.close()
    }

    check('no security policy violations on any page', cspViolations.length === 0, cspViolations.slice(0, 3).join(' | '))

    // 13. Where did the one-time codes go? Only into the body of the single
    // verification request to Supabase each time Continue was pressed: never
    // into an address sent to the web server, a Referer header, a request to
    // any other site, the console, or storage (checked above).
    {
      const codes = [inviteCode, resetCode]
      check('both one-time codes were captured for the leak checks', codes.every((c) => c.length >= 16))
      const has = (text) => codes.some((c) => text.includes(c))
      const toSite = wire.filter((w) => w.url.startsWith(APP))
      const toSupabase = wire.filter((w) => w.url.startsWith(API))
      const elsewhere = wire.filter((w) => !w.url.startsWith(APP) && !w.url.startsWith(API) && !w.url.startsWith('data:'))
      check('control: the recorder does see a code placed in an address (the old ? style)', toSite.some((w) => w.url.includes('query-string-code-0123456789')))
      check('requests to the web server never contain a code', toSite.length > 20 && !toSite.some((w) => has(w.url) || has(w.body)), `${toSite.length} requests`)
      check('no Referer header ever contains a code', !wire.some((w) => has(w.referer)), `${wire.length} requests`)
      check('requests to other sites (fonts) never contain a code', !elsewhere.some((w) => has(w.url) || has(w.body) || has(w.referer)), `${elsewhere.length} requests`)
      const carrying = toSupabase.filter((w) => has(w.body) || has(w.url))
      check(
        'Supabase receives a code only in the body of a POST to /auth/v1/verify',
        carrying.length >= 2 && carrying.every((w) => w.method === 'POST' && new URL(w.url).pathname === '/auth/v1/verify' && !has(w.url)),
        carrying.map((w) => `${w.method} ${new URL(w.url).pathname}`).join(', '),
      )
      check('no console message contains a code', !consoleLines.some(has), `${consoleLines.length} messages`)
    }
    await ctxA.close()
  } catch (e) {
    failures++
    console.error('E2E CRASHED', e)
  } finally {
    await browser.close()
  }
  console.log(failures ? `${failures} CHECK(S) FAILED` : 'ALL CHECKS PASSED')
  process.exit(failures ? 1 : 0)
})()
