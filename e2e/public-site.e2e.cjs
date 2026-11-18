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
const AXE = require('node:fs').readFileSync(require('node:path').join(__dirname, '..', 'node_modules', 'axe-core', 'axe.min.js'), 'utf8')

const BASE = (process.argv[2] || 'http://localhost:4176').replace(/\/$/, '')
// Fonts are self-hosted: no third party is allowed on the public pages.
const ALLOWED_THIRD_PARTY = []
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
    // A request can outlive its page (the test moves on while a font is still
    // downloading). Then there's nothing left to answer, so it's ignored
    // rather than crashing the run.
    // Only pages need the headers; scripts, styles, images and fonts pass
    // straight through, so they're never fetched twice.
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
      // The typefaces come from this site, and the headline really uses them.
      const fonts = await page.evaluate(async () => {
        await document.fonts.ready
        const loaded = [...document.fonts].filter((f) => f.status === 'loaded').map((f) => f.family.replace(/"/g, ''))
        const h1 = getComputedStyle(document.querySelector('h1')).fontFamily
        return { loaded: [...new Set(loaded)], h1, archivo: document.fonts.check('900 40px "Archivo Variable"'), inter: document.fonts.check('400 16px "Inter Variable"') }
      })
      check(`${label}: the self-hosted Archivo and Inter load, and the headline uses Archivo`, fonts.archivo && fonts.inter && fonts.loaded.includes('Archivo Variable') && fonts.loaded.includes('Inter Variable') && /Archivo Variable/.test(fonts.h1), JSON.stringify(fonts))
      check(`${label}: the page names the commit it was built from`, /^([0-9a-f]{7}|local)$/.test((await page.locator('meta[name="splitpost-commit"]').getAttribute('content')) || ''))
      check(`${label}: the landing page renders`, await shows(page.getByRole('heading', { level: 1 })))
      // While registration is closed the buttons say so (they switch to "Join the Waitlist" when it opens).
      check(`${label}: the waitlist button says it opens soon while registration is closed`, await shows(page.getByRole('link', { name: 'Waitlist Opens Soon' })))
      check(`${label}: no button invites a signup that isn't possible yet`, (await page.getByRole('link', { name: 'Join the Waitlist' }).count()) === 0)

      // 2. No member links anywhere on the landing page.
      const memberHrefs = await page.$$eval('a[href]', (as) => as.map((a) => a.getAttribute('href')).filter((h) => /sign-in|forgot-password|\/auth\/|^\/app(\/|$)/.test(h)))
      check(`${label}: no links to sign in or member pages`, memberHrefs.length === 0, memberHrefs.join(', '))
      check(`${label}: no "Sign in" text`, (await page.getByText(/Sign in|Already invited/).count()) === 0)

      // 3. /join is the closed waitlist page: nothing to type into.
      await page.goto(`${BASE}/join`)
      check(`${label}: /join says plainly that you can't sign up yet`, await shows(page.getByText("You can't sign up just yet.")))
      check(`${label}: /join has no form while the waitlist is off`, (await page.locator('form, input, select, textarea').count()) === 0)

      // 4. Every member path is the public "not found" page.
      for (const p of MEMBER_PATHS) {
        await page.goto(`${BASE}${p}`)
        const notFound = await shows(page.getByRole('heading', { name: 'Page not found' }))
        const inputs = await page.locator('form, input, select, textarea').count()
        check(`${label}: ${p} is not found, with nothing to type into`, notFound && inputs === 0, `inputs=${inputs}`)
      }

      // 4b. /privacy shows the approved notice; nothing to type into, not indexable.
      await page.goto(`${BASE}/privacy`)
      check(
        `${label}: /privacy shows the approved notice, version 1.0`,
        (await shows(page.getByTestId('privacy-notice'))) &&
          (await page.getByTestId('privacy-notice').textContent()).includes('Version 1.0, effective'),
      )
      check(`${label}: /privacy has nothing to type into`, (await page.locator('form, input, select, textarea').count()) === 0)
      check(`${label}: /privacy is noindex`, (await page.locator('meta[name="robots"]').getAttribute('content')) === 'noindex')

      // 4c. Sign In: the header links to /pilot-access, which explains that member
      //     sign-in is coming and is invitation only. No form, never indexed.
      await page.goto(`${BASE}/`)
      const signIn = page.locator('header [data-testid="header-sign-in"]')
      check(`${label}: the header offers Sign In, to /pilot-access`,
        (await shows(signIn)) && (await signIn.getAttribute('href')) === '/pilot-access' && (await signIn.getAttribute('aria-label')) === 'Sign In')
      let reached = false
      let ring = ''
      for (let i = 0; i < 10 && !reached; i++) {
        await page.keyboard.press('Tab')
        reached = await page.evaluate(() => document.activeElement?.getAttribute('data-testid') === 'header-sign-in')
        if (reached) ring = await page.evaluate(() => getComputedStyle(document.activeElement).outlineStyle)
      }
      check(`${label}: the keyboard reaches Sign In, with a visible focus ring`, reached && ring !== 'none' && ring !== '', `outline ${ring}`)
      await page.keyboard.press('Enter')
      await page.waitForURL(/\/pilot-access$/)
      check(`${label}: Sign In opens the pilot access page`, await shows(page.getByRole('heading', { level: 1, name: 'Member Sign In' })))
      check(`${label}: /pilot-access says sign-in is coming soon and is invitation only`,
        /Member sign-in is coming soon\./.test(await page.getByTestId('pilot-access').innerText()) && /invitation only/.test(await page.getByTestId('pilot-access').innerText()))
      check(`${label}: /pilot-access has nothing to type into`, (await page.locator('form, input, select, textarea').count()) === 0)
      check(`${label}: /pilot-access is noindex`, (await page.locator('meta[name="robots"]').getAttribute('content')) === 'noindex')
      await page.evaluate(AXE)
      const axeViolations = await page.evaluate(async () => (await window.axe.run(document, { runOnly: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] })).violations.map((v) => `${v.id} x${v.nodes.length}`))
      check(`${label}: /pilot-access has no WCAG 2.2 AA violations`, axeViolations.length === 0, axeViolations.join(', '))

      // 5. The sample tour still works, and old prototype links still redirect.
      await page.goto(`${BASE}/tour`)
      check(`${label}: /tour shows the sample tour`, await shows(page.getByText(/sample/i)))
      // Creator invitation links open the tour's welcome screen: the banner
      // there says the points and rewards are an early concept.
      await page.goto(`${BASE}/tour/welcome?invite=7c1e94a2b05d3f68e1a9`)
      check(`${label}: an invitation link's welcome screen says the tour's points and rewards aren't the pilot's`,
        await shows(page.getByRole('complementary', { name: 'Sample tour' }).getByText("The points and rewards shown aren't how the Splitpost pilot works.")))
      await page.goto(`${BASE}/discover`)
      await page.waitForURL(/\/tour\/discover$/, { timeout: 5000 }).catch(() => {})
      check(`${label}: /discover redirects into the tour`, page.url().endsWith('/tour/discover'), page.url())

      await ctx.close()
    }

    // 5b. The Splitpost homepage, from the smallest phone to a wide desktop:
    //     the seven sections in order, no sideways scrolling, the headline on
    //     two lines, every pilot disclosure visible beside its claim, no
    //     photographs, every illustration on screen, and one logo file.
    for (const width of [320, 375, 390, 414, 420, 430, 440, 768, 1024, 1440]) {
      const label = `${width}px`
      const ctx = await newContext(browser, { viewport: { width, height: 900 } })
      const page = await ctx.newPage()
      page.on('request', (r) => requests.push(r.url()))
      page.on('console', (m) => m.type() === 'error' && problems.push(`${label}: ${m.text()}`))
      page.on('pageerror', (e) => problems.push(`${label}: ${e.message}`))
      await page.goto(`${BASE}/`)

      const ids = await page.locator('main section[id]').evaluateAll((els) => els.map((e) => e.id).join(','))
      check(`${label}: the six sections in order`, ids === 'hero,problem,how-it-works,people,future,invitation', ids)
      const extra = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
      check(`${label}: no sideways scrolling on the landing page`, extra <= 0, `${extra}px`)
      {
        const box = await page.locator('header [data-testid="header-sign-in"]').boundingBox()
        const big = width >= 420 || (box && box.width >= 44 && box.height >= 44)
        check(`${label}: Sign In is in the header${width < 420 ? ', as an icon at least 44px square' : ''}`, !!box && big, box ? `${Math.round(box.width)}x${Math.round(box.height)}` : 'missing')
      }
      {
        // The header's waitlist button always shows a label (it was empty between 390 and 419px).
        const t = await page.evaluate(() => [...document.querySelectorAll('header a[href="/join"]')].map((a) => a.innerText.trim()).filter(Boolean).length)
        check(`${label}: the header waitlist button shows its label`, t >= 1, String(t))
      }
      check(`${label}: no Crevant left on the landing page`, !/Crevant/i.test(await page.locator('body').innerText()))

      // The hero headline is exactly two lines, one sentence each, and fits the screen.
      {
        const r = await page.evaluate(() => {
          const h1 = document.querySelector('h1')
          const lh = parseFloat(getComputedStyle(h1).lineHeight)
          const spans = [...h1.querySelectorAll('[data-testid^="headline-"]')]
          return {
            lines: spans.map((s) => Math.round(s.getBoundingClientRect().height / lh)).join(),
            fits: spans.every((s) => s.scrollWidth <= s.clientWidth + 1 && s.getBoundingClientRect().right <= document.documentElement.clientWidth),
          }
        })
        check(`${label}: the hero headline is exactly two lines and fits`, r.lines === '1,1' && r.fits, JSON.stringify(r))
      }

      // Load every lazy image, then check each one decoded: the licensed photos, the sample avatar and the founder.
      await page.evaluate(async () => {
        for (let y = 0; y < document.body.scrollHeight; y += 500) {
          window.scrollTo(0, y)
          await new Promise((r) => setTimeout(r, 30))
        }
      })
      const imgs = await page.$$eval('main img:not([data-testid="splitpost-logo"])', (els) =>
        Promise.all(els.map((img) => (img.complete ? img.naturalWidth : new Promise((ok) => img.addEventListener('load', () => ok(img.naturalWidth), { once: true }))))),
      )
      check(`${label}: every photo loads (seven stand-in photos, the sample avatar twice, the founder)`, imgs.length === 10 && imgs.every((w) => w > 0), imgs.join(','))
      const svgs = await page.$$eval('main svg', (els) => els.filter((e) => e.getAttribute('aria-hidden') !== 'true' && !e.closest('[aria-hidden="true"]')).length)
      check(`${label}: every illustration is decorative (hidden from screen readers)`, svgs === 0, String(svgs))

      const disclosures = await Promise.all(['hero-disclosure', 'step04-disclosure', 'invitation-disclosure', 'footer-disclosure'].map((t) => page.getByTestId(t).isVisible()))
      check(`${label}: each pilot disclosure is visible beside its claim`, disclosures.every(Boolean), disclosures.join())

      const ills = await page.$$eval('[data-testid="hero-scene"], [data-testid="value-capture"], [data-testid="steps"], [data-testid="challenges"], [data-testid="people-after"], [data-testid="people-fans"], [data-testid="future-mosaic"], [data-testid="founder-signoff"], [data-testid="invitation-disclosure"]', (els) =>
        els.map((e) => {
          const r = e.getBoundingClientRect()
          return { id: e.getAttribute('data-testid'), fits: r.width > 0 && r.left >= -0.5 && r.right <= document.documentElement.clientWidth + 0.5 }
        }),
      )
      check(`${label}: the hero post, the illustrations and the photo blocks are on the page and fit the screen`, ills.length === 9 && ills.every((i) => i.fits), JSON.stringify(ills))
      const steps = await page.$$eval('[data-testid="step"] svg', (els) => els.filter((e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.right <= document.documentElement.clientWidth + 0.5 }).length)
      check(`${label}: each of the four steps has its picture, on screen`, steps >= 4, String(steps))

      // The official logo, the same file everywhere: header, footer and the five seams.
      const logos = await page.$$eval('img[data-testid="splitpost-logo"]', (els) => els.map((e) => ({ src: e.getAttribute('src'), w: e.naturalWidth, ratio: e.getBoundingClientRect().width / e.getBoundingClientRect().height })))
      check(`${label}: one logo file, used in the header, footer and every seam`, logos.length >= 7 && new Set(logos.map((l) => l.src)).size === 1 && logos.every((l) => l.w > 0), `${logos.length} logos, ${new Set(logos.map((l) => l.src)).size} sources`)
      check(`${label}: the logo keeps its proportions everywhere`, logos.every((l) => Math.abs(l.ratio - 1) < 0.02), logos.map((l) => l.ratio.toFixed(2)).join())
      await ctx.close()
    }

    // 5b1. The hero's split post on phones: both pieces upright, fully on screen with a margin on each
    //      side, a clear gap between them, and the apricot line kept within the pieces.
    for (const width of [320, 360, 390, 430]) {
      const ctx = await newContext(browser, { viewport: { width, height: 900 } })
      const page = await ctx.newPage()
      await page.goto(`${BASE}/`)
      // Let the one-time entrance finish: every piece must then rest exactly in place.
      await page.evaluate(() => Promise.all(document.getAnimations().map((a) => a.finished)))
      const r = await page.evaluate(() => {
        const vw = document.documentElement.clientWidth
        const scene = document.querySelector('[data-testid="hero-scene"]')
        const box = (el) => el.getBoundingClientRect()
        const creator = box(scene.querySelector('[data-testid="split-creator-piece"]'))
        const community = box(scene.querySelector('[data-testid="split-community-piece"]'))
        const line = [...scene.querySelectorAll('[data-testid="gold-seam"] line')].find((l) => getComputedStyle(l).display !== 'none')
        const lb = box(line)
        const tilted = [...scene.querySelectorAll('*')].some((el) => { const t = getComputedStyle(el).transform; return t !== 'none' && !/^matrix\(1, 0, 0, 1,/.test(t) })
        const outside = [...scene.querySelectorAll('*')].filter((el) => { const b = box(el); return b.width > 0 && (b.left < 0 || b.right > vw) }).length
        return { vw, tilted, outside, left: Math.round(Math.min(creator.left, community.left)), right: Math.round(vw - Math.max(creator.right, community.right)), line: [Math.round(lb.left), Math.round(lb.right)], pieces: [Math.round(Math.min(creator.left, community.left)), Math.round(Math.max(creator.right, community.right))] }
      })
      check(`${width}px: the hero's two post pieces stay upright`, !r.tilted, JSON.stringify(r))
      check(`${width}px: the hero's pieces fit on screen with a margin on both sides`, r.outside === 0 && r.left >= 16 && r.right >= 16, JSON.stringify(r))
      check(`${width}px: the apricot line stays within the pieces`, r.line[0] >= r.pieces[0] && r.line[1] <= r.pieces[1], JSON.stringify(r))
      await ctx.close()
    }

    // 5b1b. With reduced motion the split post doesn't animate at all.
    {
      const ctx = await newContext(browser, { viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' })
      const page = await ctx.newPage()
      await page.goto(`${BASE}/`)
      const running = await page.evaluate(() => document.getAnimations().length)
      check('reduced motion: the hero entrance does not run', running === 0, String(running))
      await ctx.close()
    }
    {
      const ctx = await newContext(browser, { viewport: { width: 390, height: 844 } })
      const page = await ctx.newPage()
      await page.goto(`${BASE}/`)
      const iters = await page.evaluate(() => document.getAnimations().map((a) => a.effect.getTiming().iterations))
      check('the hero entrance runs once and never loops', iters.length === 3 && iters.every((n) => n === 1), JSON.stringify(iters))
      await ctx.close()
    }

    // 5b2. The logo's derivatives are served as real files (not the app shell), with image types.
    {
      const ctx = await newContext(browser, { viewport: { width: 390, height: 844 } })
      const page = await ctx.newPage()
      for (const [path, type] of [
        ['/favicon.svg', 'image/svg+xml'],
        ['/favicon.ico', 'image/'],
        ['/media/brand/apple-touch-icon.png', 'image/png'],
        ['/media/brand/icon-192.png', 'image/png'],
        ['/media/brand/icon-512.png', 'image/png'],
        ['/media/brand/icon-maskable-512.png', 'image/png'],
        ['/media/brand/og-image.png', 'image/png'],
      ]) {
        const res = await page.request.get(`${BASE}${path}`)
        const ct = res.headers()['content-type'] || ''
        check(`logo file ${path} is served as an image`, res.ok() && ct.startsWith(type), `${res.status()} ${ct}`)
      }
      const manifest = await page.request.get(`${BASE}/media/brand/site.webmanifest`)
      check('the web manifest is served and names Splitpost', manifest.ok() && (await manifest.text()).includes('"Splitpost"'), String(manifest.status()))
      await ctx.close()
    }

    // 5c. Link audit, as a first-time visitor on desktop and on a phone: follow
    //     every link on the public pages and every tour screen. Each one must
    //     land somewhere that works, show Splitpost (never Crevant) in its text
    //     and title, and every #anchor must exist on the page it points to.
    for (const [label, options] of [
      ['desktop', { viewport: { width: 1280, height: 900 } }],
      ['phone', { ...devices['iPhone 13'] }],
    ]) {
      const ctx = await newContext(browser, options)
      const page = await ctx.newPage()
      page.on('pageerror', (e) => problems.push(`${label} audit: ${e.message}`))
      const TOUR = ['/tour', '/tour/welcome', '/tour/discover', '/tour/create', '/tour/rewards', '/tour/profile', '/tour/profile/tools', '/tour/creator/amara', '/tour/post/p_amara_1']
      const queue = ['/', '/join', '/request-invite', '/privacy', ...TOUR]
      const seen = new Set()
      const hashes = []
      const external = new Set()
      const bad = []
      while (queue.length && seen.size < 80) {
        const p = queue.shift()
        if (seen.has(p)) continue
        seen.add(p)
        const res = await page.goto(BASE + p, { waitUntil: 'networkidle' }).catch(() => null)
        const info = await page.evaluate(() => ({
          title: document.title,
          text: document.body.innerText,
          links: [...document.querySelectorAll('a[href]')].map((a) => a.getAttribute('href')),
        }))
        if (!res || res.status() >= 400) bad.push(`${p}: HTTP ${res ? res.status() : 'error'}`)
        if (/Page not found/.test(info.text)) bad.push(`${p}: not found`)
        if (/crevant/i.test(info.text) || /crevant/i.test(info.title)) bad.push(`${p}: shows Crevant`)
        if (!/Splitpost/.test(info.title)) bad.push(`${p}: title "${info.title}"`)
        for (const href of info.links) {
          if (/^https?:/.test(href)) {
            external.add(href)
            continue
          }
          const u = new URL(href, BASE + p)
          if (u.origin !== new URL(BASE).origin) continue
          if (u.hash) hashes.push([u.pathname, u.hash.slice(1)])
          const next = u.pathname + u.search
          if (!seen.has(next) && !/^\/tour\/(creator|post)\//.test(next)) queue.push(next)
        }
      }
      for (const [path, id] of [...new Map(hashes.map((h) => [h.join('#'), h])).values()]) {
        await page.goto(BASE + path, { waitUntil: 'networkidle' })
        if (!(await page.locator(`[id="${id}"]`).count())) bad.push(`${path}#${id}: no such anchor`)
      }
      check(`${label}: link audit of ${seen.size} pages: every link works and shows Splitpost`, bad.length === 0, bad.slice(0, 5).join(' | '))
      check(`${label}: no links to outside sites from the public pages`, external.size === 0, [...external].join(', '))
      await ctx.close()
    }

    // 5c2. Every "Join the Waitlist" button, on desktop and on a phone
    //      (including the phone's sticky bar), opens /join on this same site,
    //      so a Preview never sends visitors to another deployment.
    for (const [label, options] of [
      ['desktop', { viewport: { width: 1280, height: 900 } }],
      ['phone', { ...devices['iPhone 13'] }],
    ]) {
      const ctx = await newContext(browser, options)
      const page = await ctx.newPage()
      await page.goto(`${BASE}/`, { waitUntil: 'networkidle' })
      const ctas = page.getByRole('link', { name: /waitlist opens soon/i, includeHidden: true })
      const total = await ctas.count()
      const hrefs = await ctas.evaluateAll((as) => as.map((a) => a.href))
      const wrong = hrefs.filter((h) => h !== `${new URL(BASE).origin}/join`)
      check(`${label}: all ${total} waitlist buttons point to /join on this site`, total >= 4 && wrong.length === 0, wrong.join(', '))
      const failed = []
      let clicked = 0
      for (let i = 0; i < total; i++) {
        await page.goto(`${BASE}/`, { waitUntil: 'networkidle' })
        const link = page.getByRole('link', { name: /waitlist opens soon/i, includeHidden: true }).nth(i)
        // The phone's sticky bar slides in (and becomes focusable) only once
        // the hero has scrolled away; until then it is off screen.
        if ((await link.getAttribute('tabindex')) === '-1') {
          if (label !== 'phone') continue
          await page.mouse.wheel(0, 1400)
          await page.waitForFunction((el) => el.getAttribute('tabindex') === '0', await link.elementHandle(), { timeout: 3000 }).catch(() => {})
          if ((await link.getAttribute('tabindex')) !== '0') { failed.push(`link ${i + 1} (sticky bar) never appeared`); continue }
          await page.waitForTimeout(400)
        } else {
          await link.scrollIntoViewIfNeeded({ timeout: 1500 }).catch(() => {})
        }
        if (!(await link.isVisible())) continue
        clicked++
        await link.click()
        await page.waitForURL(`${BASE}/join`, { timeout: 5000 }).catch(() => {})
        const here = page.url()
        const heading = await shows(page.getByRole('heading', { level: 1, name: 'The Waitlist Opens Soon' }), 3000)
        if (here !== `${BASE}/join` || !heading) failed.push(`link ${i + 1} went to ${here}`)
      }
      check(`${label}: clicking each of the ${clicked} visible waitlist buttons opens this site's /join page`, clicked >= 4 && failed.length === 0, failed.join(' | '))
      await ctx.close()
    }

    // 5c3. Every "Discover Splitpost" button, on desktop and on a phone, from
    //      the homepage and from /join, opens How Splitpost Works (Section 4)
    //      on this site, never the old sample tour.
    for (const [label, options] of [
      ['desktop', { viewport: { width: 1280, height: 900 } }],
      ['phone', { ...devices['iPhone 13'] }],
    ]) {
      const ctx = await newContext(browser, options)
      const page = await ctx.newPage()
      const failed = []
      let clicked = 0
      for (const start of ['/', '/join']) {
        await page.goto(`${BASE}${start}`, { waitUntil: 'networkidle' })
        const total = await page.getByRole('link', { name: 'Discover Splitpost', exact: true, includeHidden: true }).count()
        for (let i = 0; i < total; i++) {
          await page.goto(`${BASE}${start}`, { waitUntil: 'networkidle' })
          const link = page.getByRole('link', { name: 'Discover Splitpost', exact: true, includeHidden: true }).nth(i)
          const href = await link.evaluate((a) => a.href)
          if (href !== `${new URL(BASE).origin}/#how-it-works`) failed.push(`${start} link ${i + 1} points to ${href}`)
          await link.scrollIntoViewIfNeeded({ timeout: 1500 }).catch(() => {})
          if (!(await link.isVisible())) continue
          clicked++
          await link.click()
          await page.waitForURL(`${BASE}/#how-it-works`, { timeout: 5000 }).catch(() => {})
          const heading = page.locator('#how-title')
          await page.waitForTimeout(800)
          const box = await heading.boundingBox()
          const vh = page.viewportSize().height
          const inView = !!box && box.y < vh && box.y + box.height > 0
          const tour = await page.getByText('Sample tour.').count()
          if (page.url() !== `${BASE}/#how-it-works` || !inView || tour) failed.push(`${start} link ${i + 1}: ${page.url()}${inView ? '' : ', introduction not on screen'}${tour ? ', showed the sample tour' : ''}`)
        }
      }
      check(`${label}: each of the ${clicked} visible Discover Splitpost buttons (homepage and /join) opens How It Works on this site`, clicked >= (label === 'phone' ? 1 : 2) && failed.length === 0, failed.join(' | '))
      await ctx.close()
    }

    // 5c4. Repeated clicks, as people really use the page (no reload between
    //      them): Discover Splitpost, then back to the top, then Discover
    //      again, then the footer's How It Works. Each one must scroll to
    //      Section 4. (A second click to the same #section used to do
    //      nothing.)
    for (const [label, options] of [
      ['desktop', { viewport: { width: 1280, height: 900 } }],
      ['phone', { ...devices['iPhone 13'] }],
    ]) {
      const ctx = await newContext(browser, options)
      const page = await ctx.newPage()
      await page.goto(`${BASE}/`, { waitUntil: 'networkidle' })
      const onScreen = async () => {
        await page.waitForTimeout(700)
        const box = await page.locator('#how-title').boundingBox()
        return !!box && box.y >= -5 && box.y < page.viewportSize().height
      }
      // Phones have no header Discover button, so they use the footer link twice.
      const hero = label === 'phone' ? page.getByRole('contentinfo').getByRole('link', { name: 'How It Works' }) : page.getByRole('banner').getByRole('link', { name: 'Discover Splitpost' })
      const results = []
      await hero.click()
      results.push(['first Discover click', await onScreen()])
      await page.evaluate(() => window.scrollTo(0, 0))
      await hero.click()
      results.push(['second Discover click', await onScreen()])
      await page.evaluate(() => window.scrollTo(0, 0))
      await page.getByRole('contentinfo').getByRole('link', { name: 'How It Works' }).click()
      results.push(['footer How It Works', await onScreen()])
      const missed = results.filter(([, ok]) => !ok).map(([n]) => n)
      check(`${label}: Discover Splitpost and How It Works scroll to How It Works on every click, not just the first`, missed.length === 0, missed.join(', '))
      await ctx.close()
    }

    // 5d. Image quality on high-density screens: every image on the homepage
    //     and tour loads, and none is shown more than 1.25x larger than its
    //     real pixels (which is when photos start to look soft or blurry).
    for (const [label, viewport] of [
      ['desktop', { width: 1440, height: 900 }],
      ['phone', { width: 390, height: 844 }],
    ]) {
      const ctx = await newContext(browser, { viewport, deviceScaleFactor: 2 })
      const page = await ctx.newPage()
      const issues = []
      for (const path of ['/', '/join', '/tour/discover', '/tour/creator/amara', '/tour/profile']) {
        // 'load', not 'networkidle': a slow third-party font request must not
        // stall the check. Whether each image finished loading is checked below.
        await page.goto(`${BASE}${path}`, { waitUntil: 'load' })
        // Bounded: at most 200 steps, and 30 seconds, so a page that keeps
        // growing or a stalled browser fails clearly instead of hanging the job.
        const scrolled = await Promise.race([
          page.evaluate(async () => {
            for (let y = 0, n = 0; y < document.body.scrollHeight && n < 200; y += 400, n++) {
              window.scrollTo(0, y)
              await new Promise((r) => setTimeout(r, 30))
            }
            return true
          }),
          new Promise((r) => setTimeout(() => r(false), 30000)),
        ])
        if (!scrolled) {
          issues.push(`${path}: scrolling through the page did not finish within 30 seconds`)
          continue
        }
        await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {})
        // Lazy images below the fold: give each one up to 10 seconds to finish.
        await page.waitForFunction(() => [...document.images].every((i) => i.complete), null, { timeout: 10000 }).catch(() => {})
        const rows = await page.$$eval('img', (imgs) =>
          imgs.map((i) => {
            const r = i.getBoundingClientRect()
            const fit = getComputedStyle(i).objectFit
            // With a srcset, naturalWidth is density-adjusted; use the chosen file's real pixel width instead.
            const chosen = (i.getAttribute('srcset') || '').split(',').map((c) => c.trim().split(/\s+/)).find(([u]) => i.currentSrc.endsWith(u))
            if (chosen && /^\d+w$/.test(chosen[1] || '')) {
              const fileW = parseInt(chosen[1], 10)
              const fileH = (fileW * i.naturalHeight) / i.naturalWidth
              const s = fit === 'cover' ? Math.max(r.width / fileW, r.height / fileH) : r.width / fileW
              return { src: i.currentSrc, ok: i.complete && i.naturalWidth > 0, upscale: s * 2, shown: r.width > 0 }
            }
            const scale =
              fit === 'cover' ? Math.max(r.width / i.naturalWidth, r.height / i.naturalHeight) : fit === 'contain' ? Math.min(r.width / i.naturalWidth, r.height / i.naturalHeight) : r.width / i.naturalWidth
            return { src: i.getAttribute('src'), ok: i.complete && i.naturalWidth > 0, upscale: scale * 2, shown: r.width > 0 }
          }),
        )
        for (const r of rows) {
          if (!r.ok) issues.push(`${path}: ${r.src} did not load`)
          // Vector images (the SVG logo) stay sharp at any size, so only raster images are checked for upscaling.
          else if (r.shown && !/^data:image\/svg|\.svg(\?|$)/.test(r.src || '') && r.upscale > 1.25) issues.push(`${path}: ${r.src} upscaled ${r.upscale.toFixed(2)}x`)
        }
      }
      check(`${label}: every image loads and stays sharp on a high-density screen`, issues.length === 0, issues.slice(0, 5).join(' | '))
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
