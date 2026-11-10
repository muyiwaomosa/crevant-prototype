// Captures the landing page's interface previews from the sample-data tour,
// so the screenshots always show the real interface, never a mock-up.
//
// Usage (from the repository root):
//   npm run build && npx vite preview --port 4175 --strictPort &
//   node scripts/landing/capture-tour-screens.cjs [base-url]
//
// Writes JPEG files to public/media/landing/. Every screen comes from the
// tour, which uses sample data; the landing page labels them as such.

const { chromium, devices } = require('playwright')
const { execFileSync } = require('child_process')
const fs = require('fs')
const path = require('path')

const BASE = (process.argv[2] || 'http://localhost:4175').replace(/\/$/, '') + '/tour'
const OUT = path.join(__dirname, '..', '..', 'public', 'media', 'landing')

const SCREENS = [
  // The hero: the first followed post, framed so its image is in view.
  { name: 'tour-hero', path: '', scrollTo: 'article', offset: 112 },
  { name: 'tour-following-feed', path: '' },
  // Scrolled so the Connection Points card sits near the top.
  { name: 'tour-creator-page', path: '/creator/amara', scrollTo: '#connection-title' },
  // Scrolled to the first creator's rewards.
  { name: 'tour-rewards', path: '/rewards', scrollTo: 'h2[id^="rw-"]' },
  // The feed further down: several followed creators' posts, newest first
  // (the hero already shows the first one).
  { name: 'tour-feed-posts', path: '', scrollTo: 'article >> nth=1', offset: 112 },
  // Finding creators to follow.
  { name: 'tour-discover', path: '/discover' },
  // A fan's Connection Points, kept separately with each creator.
  { name: 'tour-my-cp', path: '/rewards?tab=cp', scrollTo: '#balances-title' },
  // A member profile.
  { name: 'tour-profile', path: '/profile' },
  // A post with its comments.
  { name: 'tour-post', path: '/post/p_amara_1', scrollTo: '#comments-title', offset: 420 },
]

;(async () => {
  fs.mkdirSync(OUT, { recursive: true })
  const browser = await chromium.launch()
  // A real phone screen is 390 x 844 points. The landing page draws the
  // 47-point status bar and the 34-point home indicator area itself, so the
  // app gets the 763 points in between, as a full-screen web app would.
  const ctx = await browser.newContext({ ...devices['iPhone 13'], viewport: { width: 390, height: 763 }, reducedMotion: 'reduce', colorScheme: 'light' })
  const page = await ctx.newPage()
  await page.goto(BASE + '/')
  await page.evaluate(() => localStorage.clear())
  await page.goto(BASE + '/')
  await page.waitForURL(/\/welcome/)
  await page.getByRole('button', { name: 'Get started' }).click()
  for (const name of [/Amara Okafor/, /Marcus Bell/, /Hana Sato/]) await page.getByRole('button', { name }).click()
  await page.getByRole('button', { name: 'Follow 3 and continue' }).click()
  await page.getByRole('button', { name: 'Go to my feed' }).click()
  for (const s of SCREENS) {
    await page.goto(BASE + s.path)
    await page.waitForLoadState('networkidle')
    await page.evaluate(() => document.fonts.ready)
    if (s.scrollTo) {
      await page.locator(s.scrollTo).first().evaluate((el, offset) => {
        const top = el.getBoundingClientRect().top + window.scrollY - offset
        window.scrollTo(0, top)
      }, s.offset || 104)
    }
    await page.waitForTimeout(400)
    const png = path.join(OUT, `${s.name}.png`)
    await page.screenshot({ path: png })
    // Smaller files for the landing page: 600 px wide JPEG at quality 82.
    const jpg = path.join(OUT, `${s.name}.jpg`)
    execFileSync('convert', [png, '-resize', '600x', '-strip', '-quality', '82', jpg])
    fs.unlinkSync(png)
    console.log('saved', path.relative(process.cwd(), jpg))
  }

  // The fan journey on the landing page: four crops of real tour elements.
  const crop = async (pg, locator, name, maxHeight) => {
    const png = path.join(OUT, `${name}.png`)
    // Hide the tab bar and sticky header so they don't cover the element.
    await pg.evaluate(() => {
      for (const el of document.querySelectorAll('body *')) {
        const pos = getComputedStyle(el).position
        if (pos === 'fixed' || pos === 'sticky') el.style.visibility = 'hidden'
      }
      document.activeElement?.blur?.()
    })
    await pg.locator(locator).first().scrollIntoViewIfNeeded()
    await pg.waitForTimeout(300)
    await pg.locator(locator).first().screenshot({ path: png })
    const jpg = path.join(OUT, `${name}.jpg`)
    const trim = maxHeight ? ['-gravity', 'north', '-crop', `600x${maxHeight}+0+0`, '+repage'] : []
    execFileSync('convert', [png, '-resize', '600x', ...trim, '-strip', '-quality', '84', jpg])
    fs.unlinkSync(png)
    console.log('saved', path.relative(process.cwd(), jpg))
  }
  // 1. Follow: Amara's page for someone who doesn't follow her yet.
  {
    const ctx2 = await browser.newContext({ ...devices['iPhone 13'], viewport: { width: 390, height: 763 }, reducedMotion: 'reduce', colorScheme: 'light' })
    const p2 = await ctx2.newPage()
    await p2.goto(BASE + '/')
    await p2.waitForURL(/\/welcome/)
    await p2.getByRole('button', { name: 'Get started' }).click()
    for (const name of [/Marcus Bell/, /Hana Sato/, /Theo Lindqvist/]) await p2.getByRole('button', { name }).click()
    await p2.getByRole('button', { name: 'Follow 3 and continue' }).click()
    await p2.getByRole('button', { name: 'Go to my feed' }).click()
    await p2.goto(BASE + '/creator/amara')
    await p2.waitForLoadState('networkidle')
    await crop(p2, 'main section:has(h1)', 'tour-journey-follow', 520)
    await ctx2.close()
  }
  // 2. Comment: a thoughtful comment being written (not posted).
  await page.goto(BASE + '/post/p_amara_1')
  await page.waitForLoadState('networkidle')
  await page.fill('#comment-box', 'Saving this for payday. The 60/25/15 tweak is really helpful.')
  await crop(page, 'form:has(#comment-box)', 'tour-journey-comment')
  // 3. Points with that creator.
  await page.goto(BASE + '/creator/amara')
  await page.waitForLoadState('networkidle')
  await crop(page, 'section[aria-labelledby="connection-title"]', 'tour-journey-points')
  // 4. That creator's reward.
  await page.goto(BASE + '/rewards')
  await page.waitForLoadState('networkidle')
  await crop(page, 'article[aria-label^="Payday budget template"]', 'tour-journey-reward')

  await browser.close()
})().catch((e) => {
  console.error(e)
  process.exit(1)
})
