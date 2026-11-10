// Launch safeguards, checked in Chromium at the real production address
// (crevant-prototype.vercel.app, mapped to this machine for the test).
//
// Usage (scripts/e2e/public-site.sh runs both):
//   node e2e/public-site-launch.e2e.cjs <port> unapproved   a public site build
//                                                           without Production approval
//   node e2e/public-site-launch.e2e.cjs <port> approved     an approved Production build
//                                                           with indexing approved
//
// Every check prints PASS or FAIL; the process exits non zero on any failure.

const { chromium } = require('playwright')

const PORT = process.argv[2] || '4177'
const MODE = process.argv[3] || 'unapproved'
const HOST = 'crevant-prototype.vercel.app'
const BASE = `http://${HOST}:${PORT}`

let failures = 0
const check = (name, ok, detail = '') => {
  if (!ok) failures++
  console.log(`${ok ? 'PASS' : 'FAIL'}  [${MODE}] ${name}${detail ? `  (${detail})` : ''}`)
}
const robots = (page) => page.locator('meta[name="robots"]').getAttribute('content')
const landing = (page) => page.getByRole('heading', { level: 1, name: /You earned the follow/ })

;(async () => {
  const browser = await chromium.launch({ args: [`--host-resolver-rules=MAP ${HOST} 127.0.0.1`] })
  try {
    const page = await (await browser.newContext()).newPage()

    await page.goto(`${BASE}/`)
    await page.waitForTimeout(800)
    if (MODE === 'unapproved') {
      check('at the production address, an unapproved build still shows the demo, not the public site', (await landing(page).count()) === 0)
      check('the demo is noindex', (await robots(page)) === 'noindex')
    } else {
      check('at the production address, the approved build shows the public site', (await landing(page).count()) === 1)
      check('the landing page may be indexed', (await robots(page)) === 'index, follow', await robots(page))
      await page.goto(`${BASE}/join`)
      await page.waitForTimeout(300)
      check('/join may be indexed', (await robots(page)) === 'index, follow', await robots(page))
      check('/join has no form (no approved privacy notice)', (await page.locator('form, input').count()) === 0)
      for (const p of ['/privacy', '/tour', '/sign-in', '/no-such-page']) {
        await page.goto(`${BASE}${p}`)
        await page.waitForTimeout(300)
        check(`${p} is noindex`, (await robots(page)) === 'noindex', await robots(page))
      }
      await page.goto(`${BASE}/privacy`)
      check('/privacy says the notice is not yet published', (await page.getByTestId('privacy-not-published').count()) === 1)
    }

    // Fetched through the browser, which resolves the mapped production address.
    const robotsTxt = await (await page.goto(`${BASE}/robots.txt`)).text()
    const sitemapText = await (await page.goto(`${BASE}/sitemap.xml`)).text()
    if (MODE === 'unapproved') {
      check('robots.txt disallows everything', robotsTxt === 'User-agent: *\nDisallow: /\n', JSON.stringify(robotsTxt))
      check('there is no sitemap', !sitemapText.includes('<urlset'))
    } else {
      check('robots.txt allows only / and /join', /Allow: \/\$\nAllow: \/join\$\nDisallow: \//.test(robotsTxt), JSON.stringify(robotsTxt))
      check('the sitemap lists only / and /join', (sitemapText.match(/<loc>/g) || []).length === 2 && sitemapText.includes(`https://${HOST}/join`))
    }
  } finally {
    await browser.close()
  }
  console.log(failures ? `\n${failures} CHECK(S) FAILED` : '\nALL CHECKS PASSED')
  process.exit(failures ? 1 : 0)
})().catch((e) => {
  console.error(e)
  process.exit(1)
})
