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

    // 5b. The Splitpost homepage, from the smallest phone to a wide desktop:
    //     every section in order, no sideways scrolling, the problem points
    //     reflow (one per row, then two, then one beside the text), the limits
    //     sit beside the claims they qualify, the founder photo loads, and the
    //     concept screens can be scrolled on phones.
    for (const width of [320, 390, 768, 1024, 1440]) {
      const label = `${width}px`
      const ctx = await newContext(browser, { viewport: { width, height: 900 } })
      const page = await ctx.newPage()
      page.on('request', (r) => requests.push(r.url()))
      page.on('console', (m) => m.type() === 'error' && problems.push(`${label}: ${m.text()}`))
      page.on('pageerror', (e) => problems.push(`${label}: ${e.message}`))
      await page.goto(`${BASE}/`)

      const ids = await page.locator('main section[id]').evaluateAll((els) => els.map((e) => e.id).join(','))
      check(`${label}: the six sections in order`, ids === 'hero,problem,building,creators,split,vision,invitation', ids)
      const extra = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
      check(`${label}: no sideways scrolling on the landing page`, extra <= 0, `${extra}px`)
      check(`${label}: no Crevant left on the landing page`, !/Crevant/i.test(await page.locator('body').innerText()))

      const rows = await page.$$eval('[data-testid="creator-groups"] > li', (lis) => new Set(lis.map((li) => Math.round(li.getBoundingClientRect().top))).size)
      const expectedRows = width < 768 ? 3 : 1
      check(`${label}: the creator groups show ${expectedRows} row(s)`, rows === expectedRows, `rows=${rows}`)

      // The hero headline is exactly two lines, one sentence each, below 1024px.
      if (width < 1024) {
        const lines = await page.evaluate(() => {
          const h1 = document.querySelector('h1')
          const lh = parseFloat(getComputedStyle(h1).lineHeight)
          return [...h1.querySelectorAll('span.block')].map((s) => Math.round(s.getBoundingClientRect().height / lh))
        })
        check(`${label}: the hero headline is exactly two lines`, lines.join() === '1,1', lines.join())
      }

      // Load every lazy image, then check each one decoded.
      await page.evaluate(async () => {
        for (let y = 0; y < document.body.scrollHeight; y += 500) {
          window.scrollTo(0, y)
          await new Promise((r) => setTimeout(r, 30))
        }
      })
      const imgs = await page.$$eval('main img', (els) =>
        Promise.all(els.map((img) => (img.complete ? img.naturalWidth : new Promise((ok) => img.addEventListener('load', () => ok(img.naturalWidth), { once: true }))))),
      )
      check(`${label}: every image loads (the founder photo; no stock photos until approved)`, imgs.length >= 1 && imgs.every((w) => w > 0), imgs.join(','))

      const disclosures = await Promise.all(['hero-small-print', 'building-note', 'split-disclosures', 'vision-disclosure', 'pilot-details'].map((t) => page.getByTestId(t).isVisible()))
      check(`${label}: each limitation is visible beside its claim, and the full pilot details near signup`, disclosures.every(Boolean))

      // The three product illustrations: each fits the screen, its tag and headline show,
      // and every numbered marker on the picture sits inside the visible phone screen.
      const ills = await page.$$eval('[data-testid^="illustration-"]', (figs) =>
        figs.map((f) => {
          const r = f.getBoundingClientRect()
          const screen = f.querySelector('.aspect-\\[9\\/18\\.5\\]')
          const sr = screen && screen.getBoundingClientRect()
          const markers = [...f.querySelectorAll('span[aria-hidden="true"].bg-sp-accent.absolute')].map((m) => m.getBoundingClientRect())
          return {
            id: f.getAttribute('data-testid'),
            fits: r.left >= 0 && r.right <= document.documentElement.clientWidth + 0.5,
            tagged: !!f.querySelector('[data-testid="concept-tag"]') && !!f.querySelector('h3'),
            markers: markers.length,
            markersInside: !sr || markers.every((m) => m.left >= sr.left - 1 && m.right <= sr.right + 1 && m.top >= sr.top - 1 && m.bottom <= sr.bottom + 1),
          }
        }),
      )
      check(`${label}: the three product illustrations are on the page`, ills.map((i) => i.id).join() === 'illustration-following,illustration-community,illustration-referral', ills.map((i) => i.id).join())
      check(`${label}: each illustration fits the screen and carries its concept tag and headline`, ills.every((i) => i.fits && i.tagged), JSON.stringify(ills))
      check(`${label}: every numbered marker sits inside its phone screen`, ills.filter((i) => i.id !== 'illustration-referral').every((i) => i.markers === 3 && i.markersInside), JSON.stringify(ills))

      // The official logo, the same file everywhere: header, footer and the six seams.
      const logos = await page.$$eval('img[data-testid="splitpost-logo"]', (els) => els.map((e) => ({ src: e.getAttribute('src'), w: e.naturalWidth, box: Math.round(e.getBoundingClientRect().width), ratio: e.getBoundingClientRect().width / e.getBoundingClientRect().height })))
      check(`${label}: one logo file, used in the header, footer and every seam`, logos.length >= 8 && new Set(logos.map((l) => l.src)).size === 1 && logos.every((l) => l.w > 0), `${logos.length} logos, ${new Set(logos.map((l) => l.src)).size} sources`)
      check(`${label}: the logo keeps its proportions everywhere`, logos.every((l) => Math.abs(l.ratio - 1) < 0.02), logos.map((l) => l.ratio.toFixed(2)).join())
      await ctx.close()
    }

    // 5b1. The hero's split post on phones: both pieces upright, fully on screen with a margin on each
    //      side, a clear gap between them, and the apricot line kept within the pieces.
    for (const width of [320, 360, 390, 430]) {
      const ctx = await newContext(browser, { viewport: { width, height: 900 } })
      const page = await ctx.newPage()
      await page.goto(`${BASE}/`)
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
        await page.goto(`${BASE}${path}`, { waitUntil: 'networkidle' })
        await page.evaluate(async () => {
          for (let y = 0; y < document.body.scrollHeight; y += 400) {
            window.scrollTo(0, y)
            await new Promise((r) => setTimeout(r, 30))
          }
        })
        await page.waitForLoadState('networkidle')
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
