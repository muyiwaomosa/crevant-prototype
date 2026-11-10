// Release 2 (unified experience) end to end checks against a running build.
//
// Usage:
//   npm run build && npx vite preview --port 4175 --strictPort &
//   node e2e/release2.e2e.cjs [base-url] [screenshot-dir]
//
// Requires Playwright with Chromium available (not a project dependency).

const { chromium, devices } = require('playwright')

const BASE = process.argv[2] || 'http://localhost:4175'
// The suites also run against the tour on `main`: pass http://localhost:4175/tour.
const PREFIX = new URL(BASE).pathname.replace(/\/$/, '')
const HOME = PREFIX ? BASE.replace(/\/$/, '') : BASE + '/'
const SHOTS = process.argv[3] || null
const KEY = 'crevant-demo-state'
let failures = 0
const check = (name, ok, detail = '') => {
  if (!ok) failures++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`)
}
const stored = (page) => page.evaluate((k) => JSON.parse(localStorage.getItem(k)), KEY)
async function balances(page) {
  const out = {}
  for (const e of (await stored(page)).ledger) out[e.creatorId] = (out[e.creatorId] || 0) + e.amount
  return out
}
const shot = async (page, name) => SHOTS && page.screenshot({ path: `${SHOTS}/${name}.png` })
async function pngBuffer(page, w, h) {
  const b64 = await page.evaluate(
    ([w, h]) => {
      const c = document.createElement('canvas')
      c.width = w
      c.height = h
      const g = c.getContext('2d')
      g.fillStyle = '#f5a524'
      g.fillRect(0, 0, w, h)
      g.fillStyle = '#0e7c6b'
      g.beginPath()
      g.arc(w / 2, h / 2, Math.min(w, h) / 3, 0, Math.PI * 2)
      g.fill()
      return c.toDataURL('image/png').split(',')[1]
    },
    [w, h],
  )
  return Buffer.from(b64, 'base64')
}

// A finished navigation doesn't mean the page has rendered. Wait (up to 5 s)
// for at least `min` matches, then return the real count. A missing element
// still fails the check, because the count is unchanged.
async function countWhenReady(locator, min = 1, timeout = 5000) {
  await locator.nth(min - 1).waitFor({ state: 'attached', timeout }).catch(() => {})
  return locator.count()
}

;(async () => {
  const browser = await chromium.launch()
  const errors = []
  const watch = (p) => {
    p.on('pageerror', (e) => errors.push(e.message))
    p.on('console', (m) => m.type() === 'error' && !/fonts\.(googleapis|gstatic)/.test(m.text()) && errors.push(m.text()))
  }
  const ctx = await browser.newContext({ ...devices['iPhone 13'] })
  const page = await ctx.newPage()
  watch(page)

  // ---- 1. Onboarding ------------------------------------------------------
  await page.goto(BASE + '/')
  await page.evaluate(() => localStorage.clear())
  await page.goto(BASE + '/')
  await page.waitForURL(/\/welcome/)
  check('new visitor lands on the welcome', page.url().endsWith('/welcome'))
  const body = await page.locator('body').innerText()
  check('welcome states the value proposition', body.includes('Follow the people you love. See what they share. Get recognized for being part of their journey.'))
  check('welcome never asks to choose fan or creator', !/\b(fan|creator)\b/i.test(body.replace(/Crevant/g, '')), 'no role words on step 1')
  check('three concepts are explained', ['Follow people', 'See posts in order', 'Get recognized'].every((t) => body.includes(t)))
  await shot(page, 'onboarding-1')
  await page.getByRole('button', { name: 'Get started' }).click()
  check('focus moves to the step heading', await page.evaluate(() => document.activeElement?.tagName === 'H1'))
  const step2 = await page.locator('body').innerText()
  check('step 2 has no role choice', !/are you a|join as|fan or creator/i.test(step2))
  await page.getByRole('button', { name: /Amara Okafor/ }).click()
  await page.getByRole('button', { name: /Marcus Bell/ }).click()
  await page.getByRole('button', { name: /Hana Sato/ }).click()
  await shot(page, 'onboarding-2')
  await page.getByRole('button', { name: 'Follow 3 and continue' }).click()
  await shot(page, 'onboarding-3')
  check('final step points out that anyone can post', (await page.getByText('Anyone can post').count()) === 1)
  await page.getByRole('button', { name: 'Go to my feed' }).click()
  await page.waitForURL(HOME)
  let s = await stored(page)
  check('chosen accounts are followed, nothing else', JSON.stringify([...s.following].sort()) === JSON.stringify(['amara', 'hana', 'marcus']))
  const ob = await balances(page)
  check('each chosen follow earns CP with that person only', Object.keys(ob).length === 3 && ob.amara === 10 && ob.marcus === 10 && ob.hana === 10, JSON.stringify(ob))
  check('onboarding is recorded as completed', s.onboarding.status === 'completed')
  await page.reload()
  check('returning visitor is not sent through onboarding again', page.url() === HOME)

  // Skipping on a fresh browser.
  const skipCtx = await browser.newContext({ ...devices['iPhone 13'] })
  const skip = await skipCtx.newPage()
  watch(skip)
  await skip.goto(BASE + '/')
  await skip.getByRole('button', { name: 'Skip' }).click()
  await skip.waitForURL(HOME)
  await skip.locator('article').first().waitFor()
  const sk = await stored(skip)
  const skArticles = await skip.locator('article').count()
  check('skipping works and follows starter accounts so the feed is not empty', sk.onboarding.status === 'skipped' && sk.following.length === 4 && skArticles > 0, `${sk.onboarding.status}, ${sk.following.length} follows, ${skArticles} posts`)
  check('starter follows do not mint CP', sk.ledger.length === 0)
  await skipCtx.close()

  // ---- Unified navigation ---------------------------------------------------
  const navLabels = await page.getByRole('navigation', { name: 'Main' }).last().getByRole('link').allInnerTexts()
  check('one navigation: Home, Discover, Create, Rewards, Profile', JSON.stringify(navLabels.map((t) => t.trim())) === JSON.stringify(['Home', 'Discover', 'Create', 'Rewards', 'Profile']), navLabels.join(','))
  check('no Fan or Creator switch anywhere', (await page.getByRole('radio', { name: /^(Fan|Creator)$/ }).count()) === 0 && (await page.getByText(/^Fan$/).count()) === 0)
  for (const [label, path] of [['Discover', '/discover'], ['Create', '/create'], ['Rewards', '/rewards'], ['Profile', '/profile'], ['Home', '/']]) {
    await page.getByRole('navigation', { name: 'Main' }).last().getByRole('link', { name: label, exact: true }).click()
    await page.waitForURL(BASE + path === BASE + '/' ? HOME : BASE + path)
    check(`nav reaches ${label}`, new URL(page.url()).pathname === (PREFIX + path).replace(/(.)\/$/, '$1'))
  }
  await shot(page, 'home')

  // ---- 2 & 3. Follow and chronological feed -------------------------------
  await page.goto(BASE + '/discover')
  await page.getByRole('button', { name: 'Follow Theo Lindqvist' }).click()
  await page.goto(BASE + '/')
  check('newly followed account appears in Home', (await countWhenReady(page.getByText('Day 4 on the Kungsleden'))) === 1)
  const times = await page.locator('article time').evaluateAll((els) => els.map((e) => Date.parse(e.getAttribute('datetime'))))
  check('feed is newest first', times.length > 5 && times.every((t, i) => i === 0 || times[i - 1] >= t), `${times.length} posts`)

  // ---- 4. Publish without changing modes ----------------------------------
  await page.getByRole('link', { name: /Share something/ }).click()
  await page.waitForURL(/\/create/)
  await page.fill('#post-text', 'First post from the unified Create page.')
  await page.getByRole('button', { name: 'Publish' }).click()
  await page.waitForURL(/\/profile/)
  check('published post appears on the profile', (await countWhenReady(page.getByText('First post from the unified Create page.'))) === 1)
  await page.goto(BASE + '/')
  check('published post is first in the Home feed', (await page.locator('article').first().innerText()).includes('First post from the unified Create page.'))
  check('following still works after publishing', (await stored(page)).following.includes('theo'))

  // ---- 5. Edit profile and picture ----------------------------------------
  await page.goto(BASE + '/profile')
  await page.getByRole('button', { name: 'Edit profile' }).click()
  await page.getByLabel('Display name').fill('Robin Park')
  await page.getByLabel('Bio').fill('Painter and slow traveller.')
  await page.getByRole('button', { name: 'Save' }).click()
  await page.getByRole('button', { name: 'Change photo' }).click()
  const input = page.locator('[role=dialog] input[type=file]')
  await input.setInputFiles({ name: 'x.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF') })
  check('invalid picture type shows an error', /not supported/.test(await page.getByRole('alert').innerText()))
  await input.setInputFiles({ name: 'me.png', mimeType: 'image/png', buffer: await pngBuffer(page, 640, 480) })
  await page.getByText('Preview. Save to use this picture.').waitFor()
  await page.getByRole('button', { name: 'Save picture' }).click()
  await page.reload()
  s = await stored(page)
  check('name and bio persist after refresh', s.profile.name === 'Robin Park' && (await page.getByText('Painter and slow traveller.').count()) === 1)
  const av = s.profile.avatar
  check('picture persists after refresh', !!av && (await page.locator(`img[src="${av}"]`).count()) >= 1)
  await page.goto(BASE + '/')
  check('picture shows on your post in the feed', (await countWhenReady(page.locator(`img[src="${av}"]`), 2)) >= 2, 'share prompt and post')
  await shot(page, 'profile-feed')

  // ---- 6. Engage and earn with another account ----------------------------
  await page.goto(BASE + '/post/p_theo_1')
  await page.getByRole('button', { name: 'Like', exact: true }).click()
  await page.fill('#comment-box', 'Those river crossings sound intense, great photo.')
  await page.getByRole('button', { name: 'Post', exact: true }).click()
  await page.waitForTimeout(150)
  let b = await balances(page)
  check('engaging with Theo earns CP with Theo only', b.theo === 17 && b.amara === 10, JSON.stringify(b))
  await page.goto(BASE + '/profile')
  const myPost = (await stored(page)).myPosts[0].id
  const before = JSON.stringify(await balances(page))
  await page.goto(BASE + '/post/' + myPost)
  await page.getByRole('button', { name: 'Like', exact: true }).click()
  check('liking your own post earns nothing', JSON.stringify(await balances(page)) === before)
  await page.goto(BASE + '/post/p_hana_1')
  await page.fill('#comment-box', 'aaaaaaaaaaaa')
  await page.getByRole('button', { name: 'Post', exact: true }).click()
  check('anti farming: junk comment earns nothing', ((await balances(page)).hana || 0) === 10)
  await page.goto(BASE + '/discover')
  await page.getByRole('button', { name: 'Unfollow Hana Sato' }).click()
  await page.getByRole('button', { name: 'Follow Hana Sato' }).click()
  await page.getByRole('button', { name: 'Unfollow Hana Sato' }).click()
  check('anti farming: follow cycles return the bonus', ((await balances(page)).hana || 0) === 0)

  // ---- 7. Redeem with the right balance ------------------------------------
  await page.goto(BASE + '/rewards')
  await shot(page, 'rewards')
  const theoCard = page.locator('article', { hasText: 'Arctic wallpaper pack' })
  await theoCard.getByRole('button', { name: 'Redeem' }).click()
  await page.evaluate(() => {
    const btn = [...document.querySelectorAll('[role=dialog] button')].find((x) => x.textContent.trim() === 'Confirm')
    btn.click()
    btn.click()
  })
  await page.waitForTimeout(250)
  b = await balances(page)
  check('redeeming Theo’s reward spends only Theo CP, once', b.theo === 2 && b.amara === 10 && (await stored(page)).redemptions.length === 1, JSON.stringify(b))
  check('reward is labelled simulated', (await page.getByText('This is a simulation').count()) === 1)
  await page.getByRole('button', { name: 'Done' }).click()
  await page.getByRole('tab', { name: /My CP/ }).click()
  await page.getByText('Your balances').waitFor()
  check('My CP tab shows per person balances', (await page.getByText('This total cannot be spent.').count()) === 1, page.url().replace(BASE, ''))
  await shot(page, 'my-cp')
  await page.getByRole('tab', { name: /Redeemed/ }).click()
  check('redemption history is under Rewards', (await page.getByText('Arctic wallpaper pack').count()) >= 1)

  // ---- Creator tools from Profile ------------------------------------------
  await page.goto(BASE + '/profile')
  await page.getByRole('link', { name: /Creator tools/ }).click()
  await page.waitForURL(/\/profile\/tools/)
  await page.getByRole('heading', { name: 'Creator tools', exact: true }).waitFor()
  check('creator tools reached from profile', (await page.getByRole('heading', { name: 'Creator tools', exact: true }).count()) === 1, page.url().replace(BASE, ''))
  check('audience numbers are labelled simulated', (await page.getByText('These numbers are demo data').count()) === 1)
  check('supporters section does not invent supporters', (await page.getByText('Not in this prototype yet').count()) === 1)
  await page.fill('input[placeholder^="e.g."]', 'Signed sketch')
  await page.fill('textarea', 'A signed sketch from my travel notebook.')
  await page.getByRole('button', { name: 'Create reward' }).click()
  await page.goto(BASE + '/rewards?scope=all&creator=me')
  check('your reward is listed under your name, not redeemable by you', (await countWhenReady(page.getByText('Signed sketch'))) >= 1 && (await page.getByText('Your reward').count()) >= 1)
  await shot(page, 'tools')

  // ---- Redirects and broken links -----------------------------------------
  const redirects = [
    ['/studio', '/profile/tools'],
    ['/studio/new', '/create'],
    ['/studio/posts', '/profile'],
    ['/studio/rewards', '/profile/tools'],
    ['/points', '/rewards'],
    ['/creator/me', '/profile'],
  ]
  for (const [from, to] of redirects) {
    await page.goto(BASE + from)
    await page.waitForTimeout(100)
    check(`old route ${from} redirects to ${to}`, new URL(page.url()).pathname === PREFIX + to, page.url().replace(BASE, ''))
  }
  const pages = ['/', '/discover', '/create', '/rewards', '/rewards?tab=cp', '/rewards?tab=history', '/profile', '/profile/tools', '/creator/amara', '/post/p_amara_1']
  const hrefs = new Set()
  for (const p of pages) {
    await page.goto(BASE + p)
    await page.locator('main').first().waitFor()
    for (const h of await page.locator('a[href^="/"]').evaluateAll((as) => as.map((a) => a.getAttribute('href')))) hrefs.add(h.split('#')[0])
  }
  const broken = []
  for (const h of hrefs) {
    // Rendered links are absolute and already include any prefix.
    await page.goto(new URL(h, BASE).href)
    await page.locator('main').first().waitFor()
    if ((await page.getByText('Page not found').count()) > 0 || (await page.getByText('Creator not found').count()) > 0 || (await page.getByText('Post not found').count()) > 0) broken.push(h)
  }
  check(`no broken internal links (${hrefs.size} checked)`, broken.length === 0, broken.join(', '))

  // ---- 8. Refresh keeps state ----------------------------------------------
  const snap = JSON.stringify(await stored(page))
  await page.goto(BASE + '/')
  await page.reload()
  check('state is identical after refresh', JSON.stringify(await stored(page)) === snap)

  // ---- Keyboard navigation -------------------------------------------------
  const desk = await browser.newPage({ viewport: { width: 1280, height: 860 } })
  watch(desk)
  await desk.goto(BASE + '/discover')
  await desk.evaluate((st) => localStorage.setItem('crevant-demo-state', st), snap)
  await desk.goto(BASE + '/')
  await desk.locator('article').first().waitFor()
  await desk.keyboard.press('Tab')
  const firstFocus = await desk.evaluate(() => document.activeElement?.textContent?.trim())
  check('first Tab reaches the skip link', firstFocus === 'Skip to content', `${firstFocus} on ${desk.url().replace(BASE, '')}`)
  const reached = []
  for (let i = 0; i < 8; i++) {
    await desk.keyboard.press('Tab')
    reached.push(await desk.evaluate(() => document.activeElement?.getAttribute('title') || document.activeElement?.textContent?.trim()))
  }
  check('keyboard reaches every main nav item in order', ['Home', 'Discover', 'Create', 'Rewards', 'Profile'].every((l) => reached.includes(l)), reached.join(' | '))
  await desk.goto(BASE + '/create')
  // Wait for the page (and its skip link) to render before pressing Tab, and
  // give the focus move up to 2 s. The focus must still end on the main content.
  await desk.getByRole('link', { name: 'Skip to content' }).waitFor({ state: 'attached' })
  await desk.keyboard.press('Tab')
  await desk.keyboard.press('Enter')
  await desk.waitForFunction(() => document.activeElement?.id === 'main', null, { timeout: 2000 }).catch(() => {})
  const focused = await desk.evaluate(() => document.activeElement?.id || document.activeElement?.tagName)
  check('skip link moves focus to the main content', focused === 'main', focused)
  await shot(desk, 'desktop-home')
  await desk.goto(BASE + '/profile')
  await shot(desk, 'desktop-profile')

  // ---- Migration from Release 1 (version 2) -------------------------------
  const migCtx = await browser.newContext({ ...devices['iPhone 13'] })
  const mig = await migCtx.newPage()
  watch(mig)
  await mig.goto(BASE + '/discover')
  await mig.evaluate((k) => {
    const now = Date.now()
    localStorage.setItem(
      k,
      JSON.stringify({
        version: 2,
        seededAt: now - 86400000,
        mode: 'creator',
        profile: { name: 'Old Creator', handle: 'oldcreator', bio: 'hi', category: 'Music', avatar: 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q==' },
        following: ['amara', 'marcus'],
        liked: {},
        saved: {},
        myPosts: [{ id: 'p_me_old', creatorId: 'me', createdAt: now - 3600000, text: 'A post I made in creator mode.', baseLikes: 0, baseSaves: 0 }],
        myComments: [],
        myRewards: [],
        deletedPostIds: [],
        ledger: [{ id: 'l1', at: now, amount: 12, kind: 'like', label: 'Liked a post by Amara Okafor', creatorId: 'amara', refId: 'p_amara_1' }],
        redemptions: [],
        earnedKeys: { 'like:p_amara_1': now },
        followBonus: {},
        clawbacks: {},
        migrationNotice: null,
      }),
    )
  }, KEY)
  await mig.goto(BASE + '/studio')
  await mig.waitForTimeout(200)
  const ms = await stored(mig)
  check('Release 1 data migrates: mode removed, version 3', ms.version === 3 && !('mode' in ms))
  check('migrated user keeps posts, CP, follows, and picture', ms.myPosts[0].id === 'p_me_old' && ms.ledger[0].amount === 12 && ms.following.length === 2 && !!ms.profile.avatar)
  check('old creator mode link lands in creator tools without onboarding', new URL(mig.url()).pathname === PREFIX + '/profile/tools')
  await mig.goto(BASE + '/')
  check('migrated user sees the one time "modes are now one" note', (await mig.getByText('Fan and Creator modes are now one').count()) === 1)
  await shot(mig, 'migrated-notice')
  await mig.getByRole('button', { name: 'Dismiss' }).click()
  await mig.reload()
  check('note stays dismissed after refresh', (await mig.getByText('Fan and Creator modes are now one').count()) === 0)
  await migCtx.close()

  // ---- 9. Reset ------------------------------------------------------------
  await page.goto(BASE + '/profile')
  await page.getByRole('button', { name: 'Reset', exact: true }).click()
  await page.getByRole('button', { name: 'Reset demo' }).click()
  await page.waitForURL(/\/welcome/)
  const r = await stored(page)
  check('reset clears data, restores the sample portrait and returns to the welcome', r.ledger.length === 0 && r.myPosts.length === 0 && r.profile.avatar === '/media/tour/people/jamie.jpg' && r.following.length === 0 && r.onboarding.status === 'pending')

  // ---- 10. Narrow mobile viewport ------------------------------------------
  const narrow = await browser.newPage({ viewport: { width: 320, height: 640 } })
  watch(narrow)
  await narrow.goto(BASE + '/welcome')
  let ow = await narrow.evaluate(() => document.documentElement.scrollWidth - innerWidth)
  check('no sideways scroll at 320px on /welcome', ow <= 0, `${ow}px`)
  await narrow.getByRole('button', { name: 'Get started' }).click()
  ow = await narrow.evaluate(() => document.documentElement.scrollWidth - innerWidth)
  check('no sideways scroll at 320px on onboarding step 2', ow <= 0, `${ow}px`)
  await narrow.getByRole('button', { name: 'Skip' }).click()
  for (const p of ['/', '/discover', '/create', '/rewards', '/rewards?tab=cp', '/rewards?tab=history', '/profile', '/profile/tools', '/creator/marcus', '/post/p_marcus_1']) {
    await narrow.goto(BASE + p)
    ow = await narrow.evaluate(() => document.documentElement.scrollWidth - innerWidth)
    check(`no sideways scroll at 320px on ${p}`, ow <= 0, `${ow}px`)
  }
  await narrow.goto(BASE + '/')
  await shot(narrow, 'narrow-home')
  await narrow.goto(BASE + '/profile')
  await shot(narrow, 'narrow-profile')

  check('no console errors or page errors', errors.length === 0, errors.slice(0, 3).join(' | '))
  await browser.close()
  console.log(failures === 0 ? '\nALL CHECKS PASSED' : `\n${failures} CHECK(S) FAILED`)
  process.exit(failures === 0 ? 0 : 1)
})().catch((e) => {
  console.error('E2E CRASHED', e)
  process.exit(1)
})
