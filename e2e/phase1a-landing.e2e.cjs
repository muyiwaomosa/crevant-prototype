// Phase 1A, PR 1: public site checks against a running build.
//
// Usage:
//   npm run build && npx vite preview --port 4175 --strictPort &
//   node e2e/phase1a-landing.e2e.cjs [base-url] [screenshot-dir]
//
// Requires Playwright with Chromium available (not a project dependency).
// Every check prints PASS or FAIL; the process exits non zero on any failure.

const { chromium, devices } = require('playwright')

const BASE = (process.argv[2] || 'http://localhost:4175').replace(/\/$/, '')
const SHOTS = process.argv[3] || null
const PRODUCTION = 'https://crevant-prototype.vercel.app'
const ALLOWED_THIRD_PARTY = ['fonts.googleapis.com', 'fonts.gstatic.com']
const PUBLIC_PAGES = ['/', '/request-invite', '/sign-in', '/forgot-password', '/auth/confirm', '/no-such-page']
// Must never collect anything until the privacy notice is approved. Sign-in
// and password reset are for invited members (e2e/auth-journey.e2e.cjs).
const FORM_FREE_PAGES = ['/', '/request-invite', '/no-such-page']

let failures = 0
const check = (name, ok, detail = '') => {
  if (!ok) failures++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`)
}
const overflow = (page) => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)

;(async () => {
  const browser = await chromium.launch()
  try {
    // 1. Layout at four widths: no sideways scrolling anywhere.
    for (const width of [320, 375, 768, 1280]) {
      const page = await browser.newPage({ viewport: { width, height: 900 } })
      for (const path of [...PUBLIC_PAGES, '/tour/discover', '/tour/welcome']) {
        await page.goto(BASE + path)
        await page.waitForLoadState('networkidle')
        const extra = await overflow(page)
        check(`no horizontal scroll at ${width}px on ${path}`, extra <= 0, `${extra}px`)
      }
      await page.close()
    }

    // 2. Public pages: no forms, no storage, and no requests except our own
    //    files and the web fonts the demo already uses.
    {
      const ctx = await browser.newContext()
      const page = await ctx.newPage()
      const external = []
      page.on('request', (r) => {
        const host = new URL(r.url()).host
        if (host !== new URL(BASE).host && !ALLOWED_THIRD_PARTY.includes(host)) external.push(r.url())
      })
      for (const path of FORM_FREE_PAGES) {
        await page.goto(BASE + path)
        await page.waitForLoadState('networkidle')
        const controls = await page.locator('form, input, textarea, select, [contenteditable="true"]').count()
        check(`${path} has no form or input`, controls === 0, String(controls))
        const stored = await page.evaluate(() => localStorage.length + sessionStorage.length + document.cookie.length)
        check(`${path} stores nothing in the browser`, stored === 0, String(stored))
      }
      check('public pages call no outside service', external.length === 0, external.join(', '))
      await ctx.close()
    }

    // 3. Navigation and redirects in a real browser.
    {
      const page = await browser.newPage()
      await page.goto(BASE + '/')
      check('landing headline', (await page.getByRole('heading', { level: 1 }).innerText()).replace(/\s+/g, ' ') === "You don't need a million followers. You need the right 1,000.")
      const ids = await page.locator('main section[id]').evaluateAll((els) => els.map((e) => e.id).join(','))
      check('all sections in the approved order', ids === 'hero,why,who,what,how,cta', ids)
      // Every tour screenshot loads (lazy images included) and is labelled as sample data.
      for (const fig of await page.locator('figure[data-screenshot]').all()) {
        await fig.scrollIntoViewIfNeeded()
        const img = fig.locator('img')
        await img.evaluate((el) => (el.complete ? null : new Promise((r) => el.addEventListener('load', r, { once: true }))))
        const w = await img.evaluate((el) => el.naturalWidth)
        const name = await fig.getAttribute('data-screenshot')
        check(`screenshot ${name} loads`, w === 600, String(w))
        check(`screenshot ${name} is labelled as sample data`, (await fig.innerText()).includes('From the Crevant tour, with sample data.'))
      }
      await page.evaluate(() => window.scrollTo(0, 0))
      await page.getByRole('main').getByRole('link', { name: 'Explore Crevant' }).first().click()
      await page.waitForURL(/\/tour\//)
      check('Explore Crevant opens the sample tour', new URL(page.url()).pathname.startsWith('/tour/'), page.url())
      check('tour shows the sample data banner', await page.getByRole('note', { name: 'Sample tour' }).isVisible())
      await page.getByRole('note', { name: 'Sample tour' }).getByRole('link', { name: 'Back to Crevant' }).click()
      await page.waitForURL(BASE + '/')
      check('banner link returns to the public site', (await page.getByRole('heading', { level: 1 }).innerText()).startsWith("You don't need a million followers."))

      for (const [from, to] of [['/discover', '/tour/discover'], ['/rewards?tab=cp', '/tour/rewards?tab=cp'], ['/creator/amara', '/tour/creator/amara']]) {
        await page.goto(BASE + from)
        await page.waitForTimeout(150)
        const u = new URL(page.url())
        check(`old link ${from} lands on ${to}`, u.pathname + u.search === to, u.pathname + u.search)
      }
      await page.goto(BASE + '/request-invite')
      check('request page explains requests are closed', await page.getByText('Invitation requests open soon.').isVisible())
      await page.close()
    }

    // 4. Keyboard: skip link first, and focus is visible.
    {
      const page = await browser.newPage()
      await page.goto(BASE + '/')
      await page.keyboard.press('Tab')
      const first = await page.evaluate(() => document.activeElement?.textContent?.trim())
      check('first Tab reaches the skip link', first === 'Skip to content', first)
      await page.keyboard.press('Tab')
      const outline = await page.evaluate(() => getComputedStyle(document.activeElement).outlineStyle)
      check('focused links show a visible outline', outline !== 'none', outline)
      await page.close()
    }

    // 5. Production fallback. Requests to the production address are served
    //    from this local build; nothing reaches the real site.
    {
      const ctx = await browser.newContext()
      let leaked = 0
      await ctx.route(`${PRODUCTION}/**`, async (route) => {
        const u = new URL(route.request().url())
        const response = await route.fetch({ url: BASE + u.pathname + u.search })
        await route.fulfill({ response })
      })
      ctx.on('requestfinished', (r) => {
        if (r.url().startsWith(PRODUCTION) && !r.response) leaked++
      })
      const page = await ctx.newPage()
      for (const path of ['/', '/sign-in', '/request-invite', '/app', '/auth/confirm']) {
        await page.goto(PRODUCTION + path)
        await page.waitForLoadState('networkidle')
        const text = await page.locator('body').innerText()
        check(`production address ${path} shows only the sample prototype`, !text.includes('You need the right 1,000') && !text.includes('Request an invitation') && !text.includes('Email address') && !text.includes("Sign-in isn't available") && !text.includes('Your profile'))
        check(`production address ${path} has no tour banner`, (await page.getByRole('note', { name: 'Sample tour' }).count()) === 0)
      }
      check('no request reached the real production site', leaked === 0)
      await ctx.close()
    }

    // 6. Screenshots for review.
    if (SHOTS) {
      const desk = await browser.newPage({ viewport: { width: 1280, height: 860 }, deviceScaleFactor: 2 })
      await desk.goto(BASE + '/')
      await desk.waitForLoadState('networkidle')
      await desk.screenshot({ path: `${SHOTS}/landing-desktop-top.png` })
      await desk.screenshot({ path: `${SHOTS}/landing-desktop-full.png`, fullPage: true })
      await desk.goto(BASE + '/tour/discover')
      await desk.waitForLoadState('networkidle')
      await desk.screenshot({ path: `${SHOTS}/tour-desktop.png` })
      await desk.close()

      const phone = await browser.newPage({ ...devices['iPhone 13'] })
      await phone.goto(BASE + '/')
      await phone.waitForLoadState('networkidle')
      await phone.screenshot({ path: `${SHOTS}/landing-mobile-top.png` })
      await phone.screenshot({ path: `${SHOTS}/landing-mobile-full.png`, fullPage: true })
      await phone.goto(BASE + '/request-invite')
      await phone.waitForLoadState('networkidle')
      await phone.screenshot({ path: `${SHOTS}/request-invite-mobile.png` })
      await phone.goto(BASE + '/tour/discover')
      await phone.waitForLoadState('networkidle')
      await phone.screenshot({ path: `${SHOTS}/tour-mobile.png` })
      await phone.close()
      console.log(`Screenshots saved to ${SHOTS}`)
    }
  } catch (e) {
    failures++
    console.error('E2E CRASHED', e)
  } finally {
    await browser.close()
  }
  console.log(failures ? `${failures} CHECK(S) FAILED` : 'ALL CHECKS PASSED')
  process.exit(failures ? 1 : 0)
})()
