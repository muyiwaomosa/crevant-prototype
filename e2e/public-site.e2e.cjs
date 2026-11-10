// Public site build: browser checks against a running site build, with the
// real security headers from vercel.json applied.
//
// Usage (scripts/e2e/public-site.sh does all of this):
//   npm run build:site && npx vite preview --port 4176 --strictPort &
//   node e2e/public-site.e2e.cjs [base-url]
//
// Requires Playwright with Chromium available (not a project dependency).
// Every check prints PASS or FAIL; the process exits non zero on any failure.

const { readFileSync } = require('node:fs')
const path = require('node:path')
const { chromium, devices } = require('playwright')

const BASE = (process.argv[2] || 'http://localhost:4176').replace(/\/$/, '')
const ALLOWED_THIRD_PARTY = ['fonts.googleapis.com', 'fonts.gstatic.com']
const vercel = JSON.parse(readFileSync(path.join(__dirname, '..', 'vercel.json'), 'utf8'))
const SECURITY_HEADERS = Object.fromEntries(vercel.headers.find((h) => h.source === '/(.*)').headers.map((h) => [h.key.toLowerCase(), h.value]))

// Member pages that exist in the full app. In the site build every one of
// them must be the public "not found" page, with nothing to type into.
const MEMBER_PATHS = ['/sign-in', '/sign-in?next=%2Fapp', '/forgot-password', '/auth/confirm', '/auth/confirm#token_hash=abc&type=invite', '/auth/set-password', '/app', '/app/account', '/app/anything']

let failures = 0
const check = (name, ok, detail = '') => {
  if (!ok) failures++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`)
}
async function shows(locator, timeout = 5000) {
  await locator.first().waitFor({ state: 'visible', timeout }).catch(() => {})
  return locator.first().isVisible()
}

async function newContext(browser, options = {}) {
  const ctx = await browser.newContext(options)
  // Apply the production security headers to every page, so a CSP problem
  // shows up here exactly as it would on Vercel.
  await ctx.route(`${BASE}/**`, async (route) => {
    const res = await route.fetch()
    const headers = { ...res.headers() }
    if ((headers['content-type'] || '').includes('text/html')) Object.assign(headers, SECURITY_HEADERS)
    await route.fulfill({ response: res, headers })
  })
  return ctx
}

;(async () => {
  const browser = await chromium.launch()
  const requests = []
  const problems = []
  try {
    for (const [label, options] of [
      ['desktop', { viewport: { width: 1280, height: 900 } }],
      ['phone', { ...devices['iPhone 13'] }],
    ]) {
      const ctx = await newContext(browser, options)
      const page = await ctx.newPage()
      page.on('request', (r) => requests.push(r.url()))
      page.on('console', (m) => {
        // The inline script control below is meant to be blocked; anything else is a problem.
        if (m.type() === 'error' && !/inline script/i.test(m.text())) problems.push(`${label}: ${m.text()}`)
      })
      page.on('pageerror', (e) => problems.push(`${label}: ${e.message}`))

      // 1. It is the public site build.
      await page.goto(`${BASE}/`)
      // Control: the injected Content Security Policy is really in force. An
      // inline script added to the page must be blocked (and not run).
      const inlineRan = await page.evaluate(() => {
        const el = document.createElement('script')
        el.textContent = 'window.__cspControl = 1'
        document.head.appendChild(el)
        return window.__cspControl === 1
      })
      check(`${label}: the security headers are applied (an inline script is blocked)`, inlineRan === false)
      check(`${label}: the page is the public site build`, (await page.locator('meta[name="crevant-build"]').getAttribute('content')) === 'public-site')
      check(`${label}: the landing page renders`, await shows(page.getByRole('heading', { level: 1 })))
      check(`${label}: Join the Waitlist is offered`, await shows(page.getByRole('link', { name: 'Join the Waitlist' })))

      // 2. No member links anywhere on the landing page.
      const memberHrefs = await page.$$eval('a[href]', (as) => as.map((a) => a.getAttribute('href')).filter((h) => /sign-in|forgot-password|\/auth\/|^\/app(\/|$)/.test(h)))
      check(`${label}: no links to sign in or member pages`, memberHrefs.length === 0, memberHrefs.join(', '))
      check(`${label}: no "Sign in" text`, (await page.getByText(/Sign in|Already invited/).count()) === 0)

      // 3. /join is the closed waitlist page: nothing to type into.
      await page.goto(`${BASE}/join`)
      check(`${label}: /join shows the waitlist page`, await shows(page.getByText('The waitlist opens once our privacy notice is published.')))
      check(`${label}: /join has no form while the waitlist is off`, (await page.locator('form, input, select, textarea').count()) === 0)

      // 4. Every member path is the public "not found" page.
      for (const p of MEMBER_PATHS) {
        await page.goto(`${BASE}${p}`)
        const notFound = await shows(page.getByRole('heading', { name: 'Page not found' }))
        const inputs = await page.locator('form, input, select, textarea').count()
        check(`${label}: ${p} is not found, with nothing to type into`, notFound && inputs === 0, `inputs=${inputs}`)
      }

      // 4b. /privacy says plainly that no notice is published; nothing is indexable.
      await page.goto(`${BASE}/privacy`)
      check(
        `${label}: /privacy shows the approved wording`,
        (await shows(page.getByTestId('privacy-not-published'))) &&
          (await page.getByTestId('privacy-not-published').textContent()).includes("We're not collecting waitlist registrations yet."),
      )
      check(`${label}: /privacy has nothing to type into`, (await page.locator('form, input, select, textarea').count()) === 0)
      check(`${label}: /privacy is noindex`, (await page.locator('meta[name="robots"]').getAttribute('content')) === 'noindex')

      // 5. The sample tour still works, and old prototype links still redirect.
      await page.goto(`${BASE}/tour`)
      check(`${label}: /tour shows the sample tour`, await shows(page.getByText(/sample/i)))
      await page.goto(`${BASE}/discover`)
      await page.waitForURL(/\/tour\/discover$/, { timeout: 5000 }).catch(() => {})
      check(`${label}: /discover redirects into the tour`, page.url().endsWith('/tour/discover'), page.url())

      await ctx.close()
    }

    // 6. Nothing reached Supabase or any other outside service.
    const outside = [...new Set(requests.map((u) => new URL(u).hostname))].filter((h) => h !== new URL(BASE).hostname && !ALLOWED_THIRD_PARTY.includes(h))
    check('no request left this site (fonts aside)', outside.length === 0, outside.join(', '))
    check('no request to Supabase', !requests.some((u) => /supabase\.(co|com)/.test(u)))

    // 7. The security headers caused no errors (CSP violations are console errors).
    check('no console errors, including Content Security Policy violations', problems.length === 0, problems.slice(0, 3).join(' | '))
  } finally {
    await browser.close()
  }
  console.log(failures ? `\n${failures} CHECK(S) FAILED` : '\nALL CHECKS PASSED')
  process.exit(failures ? 1 : 0)
})().catch((e) => {
  console.error(e)
  process.exit(1)
})
