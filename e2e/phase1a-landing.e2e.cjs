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
const PUBLIC_PAGES = ['/', '/join', '/request-invite', '/sign-in', '/forgot-password', '/auth/confirm', '/no-such-page']
// Must never collect anything until the privacy notice is approved. Sign-in
// and password reset are for invited members (e2e/auth-journey.e2e.cjs).
const FORM_FREE_PAGES = ['/', '/join', '/join/creator', '/join/supporter', '/request-invite', '/no-such-page']

let failures = 0
const check = (name, ok, detail = '') => {
  if (!ok) failures++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`)
}
const overflow = (page) => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)

// isVisible() answers instantly, even if the page is still rendering after a
// navigation. Wait (up to 5 s) for the element to appear, then answer. A
// missing element still fails the check.
async function shows(locator, timeout = 5000) {
  await locator.first().waitFor({ state: 'visible', timeout }).catch(() => {})
  return locator.first().isVisible()
}

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
      check('landing headline', (await page.getByRole('heading', { level: 1 }).innerText()).replace(/\s+/g, ' ') === 'You earned the follow. You deserve the reach.')
      const ids = await page.locator('main section[id]').evaluateAll((els) => els.map((e) => e.id).join(','))
      check('all nine sections in the approved order', ids === 'hero,story,problem,why,who,difference,fans,how,founding', ids)
      // The full founder story and the pilot details open and close with the keyboard.
      for (const [summaryName, expected] of [['Read the full story', 'My audience had grown by 200%. My income had fallen by 60%.'], ['Pilot details', 'An intended 60-day testing period.']]) {
        const summary = page.locator('summary', { hasText: summaryName })
        await summary.focus()
        await page.keyboard.press('Enter')
        check(`"${summaryName}" opens with the keyboard`, await shows(page.getByText(expected, { exact: false })))
        await page.keyboard.press('Enter')
      }
      // Join the Waitlist scrolls to section 9.
      await page.getByRole('main').getByRole('link', { name: 'Join the Waitlist', exact: true }).first().click()
      await page.waitForTimeout(400)
      check('Join the Waitlist moves to section 9', (await page.evaluate(() => location.hash)) === '#founding' && (await page.locator('#founding').evaluate((el) => el.getBoundingClientRect().top < window.innerHeight)))
      // Section 9's one waitlist button opens /join, and Back returns to section 9.
      await page.locator('#founding').getByRole('link', { name: 'Join the Waitlist' }).click()
      await page.waitForURL(BASE + '/join')
      check('Join the Waitlist opens /join', (await shows(page.getByRole('heading', { level: 1, name: 'Join the Waitlist' }))) && (await shows(page.getByText('This page collects nothing.'))))
      await page.getByRole('main').getByRole('link', { name: 'Back to Crevant' }).first().click()
      await page.waitForURL(BASE + '/#founding')
      await page.waitForTimeout(300)
      check('Back to Crevant from /join returns to section 9', await page.locator('#founding').evaluate((el) => { const r = el.getBoundingClientRect(); return r.top < window.innerHeight && r.bottom > 0 }))
      for (const old of ['/join/creator', '/join/supporter']) {
        await page.goto(BASE + old)
        await page.waitForURL(BASE + '/join')
        check(`${old} redirects to the one waitlist page`, await shows(page.getByRole('heading', { level: 1, name: 'Join the Waitlist' })))
      }
      // The right 1,000: animates once in view, and stays still with reduced motion.
      {
        const still = await browser.newPage({ viewport: { width: 1280, height: 900 }, reducedMotion: 'reduce' })
        await still.goto(BASE + '/')
        const fig = still.locator('[data-testid="right-thousand"]')
        await fig.scrollIntoViewIfNeeded()
        await still.waitForTimeout(400)
        check('right 1,000 has no animation with reduced motion', (await fig.locator('.rt-link').first().evaluate((el) => getComputedStyle(el).animationName)) === 'none')
        await still.close()
        const moving = await browser.newPage({ viewport: { width: 1280, height: 900 }, reducedMotion: 'no-preference' })
        await moving.goto(BASE + '/')
        const fig2 = moving.locator('[data-testid="right-thousand"]')
        await fig2.scrollIntoViewIfNeeded()
        await moving.waitForTimeout(400)
        check('right 1,000 animates once when it scrolls into view', (await fig2.getAttribute('data-live')) === 'true' && (await fig2.locator('.rt-link').first().evaluate((el) => getComputedStyle(el).animationName)) === 'rt-draw')
        await moving.close()
      }
      // The fan journey crops load.
      for (const img of await page.goto(BASE + '/').then(() => page.locator('[data-testid="fan-journey"] img').all())) {
        await img.scrollIntoViewIfNeeded()
        await img.evaluate((el) => (el.complete ? null : new Promise((r) => el.addEventListener('load', r, { once: true }))))
        check(`fan journey ${await img.getAttribute('src')} loads`, (await img.evaluate((el) => el.naturalWidth)) === 600)
      }
      // Hero: the same order on every screen. Phones: headline, product line,
      // preview, actions. Desktop: headline, product line, actions on the left,
      // the phone on the right, with the actions in the first screen.
      {
        const phone = await browser.newPage({ viewport: { width: 390, height: 844 } })
        await phone.goto(BASE + '/')
        const top = (sel) => phone.locator(sel).first().evaluate((el) => el.getBoundingClientRect().top + window.scrollY)
        const [h1, product, preview, actions] = await Promise.all(['#hero h1', '[data-hero="product"]', '[data-hero="preview"]', '[data-hero="actions"]'].map(top))
        check('mobile hero order: headline, product, preview, actions', h1 < product && product < preview && preview < actions, [h1, product, preview, actions].map(Math.round).join(' < '))
        check('mobile hero shows the product preview within the first two screens', preview < 2 * 844, String(Math.round(preview)))
        // The hero screenshot shows the budgeting post with its illustration.
        check('hero shows the budgeting post screenshot', (await phone.locator('#hero figure[data-screenshot="hero"] img').getAttribute('src')) === '/media/landing/tour-hero.jpg')
        // Sticky waitlist bar: hidden in the hero, shown mid-page, hidden at section 9.
        const bar = phone.locator('[data-testid="mobile-waitlist-bar"]')
        const barShown = async () => (await bar.getAttribute('aria-hidden')) === 'false' && (await bar.evaluate((el) => el.getBoundingClientRect().top < window.innerHeight - 10))
        check('mobile waitlist bar is hidden over the hero', !(await barShown()))
        await phone.locator('#problem').scrollIntoViewIfNeeded()
        await phone.waitForTimeout(500)
        check('mobile waitlist bar appears once the hero has scrolled away', await barShown())
        await phone.locator('#founding').evaluate((el) => el.scrollIntoView())
        await phone.waitForTimeout(500)
        check('mobile waitlist bar hides at section 9', !(await barShown()))
        await phone.close()
        const desk = await browser.newPage({ viewport: { width: 1280, height: 900 } })
        await desk.goto(BASE + '/')
        const box = (sel) => desk.locator(sel).first().evaluate((el) => { const r = el.getBoundingClientRect(); return { x: r.left, y: r.top + window.scrollY, bottom: r.bottom + window.scrollY } })
        const [dh1, dprod, dact, dprev] = await Promise.all(['#hero h1', '[data-hero="product"]', '[data-hero="actions"]', '[data-hero="preview"]'].map(box))
        check('desktop hero: headline, product, actions on the left, phone on the right', dh1.y < dprod.y && dprod.y < dact.y && dprev.x > dprod.x + 300, JSON.stringify({ dh1, dprod, dact, dprev }))
        check('desktop hero shows the waitlist button in the first screen', (await desk.locator('#hero').getByRole('link', { name: 'Join the Waitlist' }).evaluate((el) => el.getBoundingClientRect().bottom)) < 900)
        check('desktop has no sticky waitlist bar', !(await desk.locator('[data-testid="mobile-waitlist-bar"]').isVisible()))
        await desk.close()
        // The header always offers Join the Waitlist, down to 320px.
        for (const width of [320, 360, 390, 768]) {
          const p = await browser.newPage({ viewport: { width, height: 700 } })
          await p.goto(BASE + '/')
          const join = p.locator('header').getByRole('link', { name: 'Join the Waitlist' })
          check(`header shows Join the Waitlist at ${width}px`, (await join.isVisible()) && (await join.evaluate((el) => el.getBoundingClientRect().right <= window.innerWidth)))
          await p.close()
        }
      }
      await page.goto(BASE + '/')
      const founderImg = page.locator('#story img')
      await founderImg.scrollIntoViewIfNeeded()
      await founderImg.evaluate((el) => (el.complete ? null : new Promise((r) => el.addEventListener('load', r, { once: true }))))
      check('founder photo loads', (await founderImg.evaluate((el) => el.naturalWidth)) === 640)
      // Every tour screenshot loads (lazy images included) and is labelled as sample data.
      for (const fig of await page.locator('figure[data-screenshot]').all()) {
        await fig.scrollIntoViewIfNeeded()
        const img = fig.locator('img')
        await img.evaluate((el) => (el.complete ? null : new Promise((r) => el.addEventListener('load', r, { once: true }))))
        const w = await img.evaluate((el) => el.naturalWidth)
        const name = await fig.getAttribute('data-screenshot')
        check(`screenshot ${name} loads`, w === 600, String(w))
      }
      check('hero phone carries the sample data note', await shows(page.locator('#hero [data-testid="demo-note"]')))
      check('footer discloses that product images are the demo with fictional people', await shows(page.locator('footer [data-testid="product-images-note"]')))
      await page.evaluate(() => window.scrollTo(0, 0))
      await page.getByRole('main').getByRole('link', { name: 'Explore Crevant' }).first().click()
      await page.waitForURL(/\/tour\//)
      check('Explore Crevant opens the sample tour', new URL(page.url()).pathname.startsWith('/tour/'), page.url())
      check('tour shows the sample data banner', await shows(page.getByRole('note', { name: 'Sample tour' })))
      await page.getByRole('note', { name: 'Sample tour' }).getByRole('link', { name: 'Back to Crevant' }).click()
      await page.waitForURL(BASE + '/')
      check('banner link returns to the public site', (await page.getByRole('heading', { level: 1 }).innerText()).startsWith('You earned the follow.'))

      for (const [from, to] of [['/discover', '/tour/discover'], ['/rewards?tab=cp', '/tour/rewards?tab=cp'], ['/creator/amara', '/tour/creator/amara']]) {
        await page.goto(BASE + from)
        await page.waitForTimeout(150)
        const u = new URL(page.url())
        check(`old link ${from} lands on ${to}`, u.pathname + u.search === to, u.pathname + u.search)
      }
      await page.goto(BASE + '/request-invite')
      check('request page explains the waitlist is not open yet', await shows(page.getByText('The waitlist opens soon.')))
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
