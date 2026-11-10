// Release 1 end to end checks against a running build.
//
// Usage:
//   npm run build && npx vite preview --port 4175 --strictPort &
//   node e2e/release1.e2e.cjs [base-url] [screenshot-dir]
//
// Requires Playwright with Chromium available (not a project dependency).
// Every check prints PASS or FAIL; the process exits non zero on any failure.

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

async function stored(page) {
  return page.evaluate((k) => JSON.parse(localStorage.getItem(k)), KEY)
}
async function balances(page) {
  const s = await stored(page)
  const out = {}
  for (const e of s.ledger) out[e.creatorId] = (out[e.creatorId] || 0) + e.amount
  return out
}
const bal = async (page, id) => (await balances(page))[id] || 0
const shot = async (page, name) => SHOTS && page.screenshot({ path: `${SHOTS}/${name}.png` })

async function makeImage(page, w, h) {
  const b64 = await page.evaluate(
    ([w, h]) => {
      const c = document.createElement('canvas')
      c.width = w
      c.height = h
      const g = c.getContext('2d')
      const grad = g.createLinearGradient(0, 0, w, h)
      grad.addColorStop(0, '#0e7c6b')
      grad.addColorStop(1, '#f5a524')
      g.fillStyle = grad
      g.fillRect(0, 0, w, h)
      g.fillStyle = '#fff'
      g.beginPath()
      g.arc(w / 2, h / 2, Math.min(w, h) / 4, 0, Math.PI * 2)
      g.fill()
      return c.toDataURL('image/png').split(',')[1]
    },
    [w, h],
  )
  return Buffer.from(b64, 'base64')
}

async function comment(page, postId, text) {
  await page.goto(`${BASE}/post/${postId}`)
  await page.fill('#comment-box', text)
  await page.getByRole('button', { name: 'Post', exact: true }).click()
  await page.waitForTimeout(150)
}

;// A finished navigation doesn't mean the page has rendered. Wait (up to 5 s)
// for at least `min` matches, then return the real count. A missing element
// still fails the check, because the count is unchanged.
async function countWhenReady(locator, min = 1, timeout = 5000) {
  await locator.nth(min - 1).waitFor({ state: 'attached', timeout }).catch(() => {})
  return locator.count()
}

(async () => {
  const browser = await chromium.launch()
  const errors = []
  const ctx = await browser.newContext({ ...devices['iPhone 13'] })
  const page = await ctx.newPage()
  page.on('pageerror', (e) => errors.push(e.message))
  page.on('console', (m) => m.type() === 'error' && !/fonts\.(googleapis|gstatic)/.test(m.text()) && errors.push(m.text()))

  // ---- Fresh start -------------------------------------------------------
  await page.goto(BASE + '/')
  await page.evaluate(() => localStorage.clear())
  await page.reload()
  // Release 2: new visitors see onboarding. Skipping follows the four starter accounts.
  await page.waitForURL(/\/welcome/)
  await page.getByRole('button', { name: 'Skip' }).click()
  await page.waitForURL(HOME)
  check('fresh demo starts with no CP', Object.keys(await balances(page)).length === 0)

  // ---- Journey 1: chronological home feed --------------------------------
  await countWhenReady(page.locator('article time'), 6)
  const times = await page.locator('article time').evaluateAll((els) => els.map((e) => Date.parse(e.getAttribute('datetime'))))
  check('home feed is newest first', times.length > 5 && times.every((t, i) => i === 0 || times[i - 1] >= t), `${times.length} posts`)
  check('no daily check in card any more', (await page.getByText('Daily check in').count()) === 0)
  await shot(page, 'home')

  // ---- Fictional portraits and post images load everywhere --------------
  // Scroll each page fully so lazy images load, then require every image to
  // have decoded and no avatar to have fallen back to initials.
  async function imagesLoaded(path) {
    await page.goto(BASE + path)
    await page.waitForLoadState('networkidle')
    await page.evaluate(async () => {
      for (let y = 0; y < document.body.scrollHeight; y += 400) {
        window.scrollTo(0, y)
        await new Promise((r) => setTimeout(r, 60))
      }
      await Promise.all([...document.images].map((i) => (i.complete ? null : new Promise((r) => (i.onload = i.onerror = r)))))
    })
    return page.evaluate(() => ({
      tour: [...document.images].filter((i) => i.src.includes('/media/tour/')).length,
      broken: [...document.images].filter((i) => !i.complete || i.naturalWidth === 0).map((i) => i.src),
      initials: document.querySelectorAll('[data-avatar="initials"]').length,
    }))
  }
  for (const [path, min] of [['/', 8], ['/post/p_amara_1', 4], ['/creator/amara', 2], ['/rewards', 1], ['/discover', 8], ['/profile', 1]]) {
    const r = await imagesLoaded(path)
    check(`${path}: tour images load, none broken`, r.tour >= min && r.broken.length === 0, `${r.tour} tour images, broken: ${r.broken.join(', ')}`)
    check(`${path}: no avatar fell back to initials`, r.initials === 0, `${r.initials} initials`)
  }

  // ---- Creator specific earning -----------------------------------------
  await page.goto(BASE + '/post/p_amara_1')
  await page.getByRole('button', { name: 'Like', exact: true }).first().click()
  await page.getByRole('button', { name: 'Save post' }).first().click()
  await comment(page, 'p_amara_1', 'Saving this for payday, the 60/25/15 tweak is really helpful.')
  await page.goto(BASE + '/post/p_amara_2')
  await page.getByRole('button', { name: 'Like', exact: true }).first().click()
  const a1 = await bal(page, 'amara')
  check('earning 10 CP with Amara increases only Amara', a1 === 10 && (await bal(page, 'theo')) === 0, `amara=${a1}`)
  const toast = await page.locator('[role=status]').last().innerText().catch(() => '')
  check('earn feedback names the creator', /with Amara Okafor/.test(toast), toast.replace(/\s+/g, ' ').slice(0, 80))

  // ---- Exploit A: comments ----------------------------------------------
  let before = await bal(page, 'priya')
  await page.goto(BASE + '/post/p_priya_1')
  await page.fill('#comment-box', 'aaaaaaaaaaaa')
  const hint = await page.locator('#comment-hint').innerText()
  check('comment hint warns before posting', /No CP yet/.test(hint), hint)
  await page.getByRole('button', { name: 'Post', exact: true }).click()
  await page.waitForTimeout(150)
  check('repeated character comment earns nothing', (await bal(page, 'priya')) === before)
  check('the comment itself is still posted', (await page.getByText('aaaaaaaaaaaa').count()) === 1)
  await comment(page, 'p_priya_2', 'Saving this for payday, the 60/25/15 tweak is really helpful.')
  check('duplicate comment on another post earns nothing', (await bal(page, 'priya')) === before)
  await comment(page, 'p_priya_3', 'great great great great')
  check('repeated word comment earns nothing', (await bal(page, 'priya')) === before)
  await comment(page, 'p_priya_2', 'Check out my page at www.example.com')
  check('spam comment earns nothing', (await bal(page, 'priya')) === before)

  // ---- Exploit B: video seeking ------------------------------------------
  await page.goto(BASE + '/post/p_marcus_1')
  await page.getByRole('button', { name: 'Follow Marcus Bell' }).click().catch(() => {})
  await page.goto(BASE + '/creator/marcus')
  await page.getByRole('button', { name: /Follow Marcus Bell/ }).click()
  await page.waitForTimeout(150)
  check('following Marcus grants 10 CP with Marcus', (await bal(page, 'marcus')) === 10)
  before = await bal(page, 'marcus')
  await page.goto(BASE + '/post/p_marcus_1')
  await page.getByRole('button', { name: 'Play video' }).click()
  await page.waitForTimeout(400)
  await page.evaluate(() => {
    const v = document.querySelector('video')
    v.currentTime = v.duration - 0.05
  })
  await page.waitForTimeout(1200)
  check('seeking to the last second earns nothing', (await bal(page, 'marcus')) === before)

  await page.goto(BASE + '/post/p_marcus_1')
  await page.getByRole('button', { name: 'Play video' }).click()
  await page.waitForFunction(() => document.querySelector('video')?.ended, null, { timeout: 15000 })
  await page.waitForTimeout(300)
  check('watching the full video earns 3 CP', (await bal(page, 'marcus')) === before + 3, `marcus=${await bal(page, 'marcus')}`)

  // ---- Exploit C: follow and unfollow ------------------------------------
  await page.goto(BASE + '/discover')
  before = await bal(page, 'jordan')
  for (let i = 0; i < 3; i++) {
    await page.getByRole('button', { name: 'Follow Jordan Hayes' }).click()
    await page.getByRole('button', { name: 'Unfollow Jordan Hayes' }).click()
  }
  check('follow and unfollow cycles do not farm CP', (await bal(page, 'jordan')) === before, `jordan=${await bal(page, 'jordan')}`)
  const s1 = await stored(page)
  check('ledger records creator, kind, amount, and time', s1.ledger.every((e) => e.creatorId && e.kind && typeof e.amount === 'number' && e.at > 0))

  // ---- Daily limit (likes: 10 per day) ----------------------------------
  await page.goto(BASE + '/')
  const likeButtons = page.getByRole('button', { name: 'Like', exact: true })
  let clicks = 0
  while ((await likeButtons.count()) > 0 && clicks < 14) {
    await likeButtons.first().click()
    clicks++
  }
  const s2 = await stored(page)
  const likesEarned = s2.ledger.filter((e) => e.kind === 'like' && e.amount > 0).length
  check('like daily limit holds at 10', likesEarned === 10, `liked ${clicks + 2} posts, ${likesEarned} earned`)

  // ---- Self engagement ---------------------------------------------------
  before = JSON.stringify(await balances(page))
  await page.goto(BASE + '/post/p_me_1')
  await page.getByRole('button', { name: 'Like', exact: true }).click().catch(() => {})
  check('liking your own post earns nothing', JSON.stringify(await balances(page)) === before)

  // ---- Rewards: cross creator, progress, redemption ---------------------
  await page.goto(BASE + '/rewards?tab=all&creator=marcus')
  const marcusCard = page.locator('article', { hasText: 'Unreleased stems pack' })
  const mBal = await bal(page, 'marcus')
  const pb = marcusCard.getByRole('progressbar')
  const now = Number(await pb.getAttribute('aria-valuenow'))
  const width = await pb.locator('div').evaluate((d) => parseFloat(d.style.width))
  check('progress bar uses only Marcus CP and is mathematically correct', now === Math.min(mBal, 20) && Math.abs(width - (Math.min(mBal, 20) / 20) * 100) < 0.01, `${mBal}/20 -> ${width}%`)
  const mText = await marcusCard.innerText()
  if (mBal < 20) check('Marcus reward shows exact CP still needed', mText.includes(`${20 - mBal} CP to go`))
  check('cross creator explanation is shown', /Points from other creators cannot be used/.test(mText))
  await shot(page, 'rewards-marcus')

  // Amara: top up to at least 15 then redeem the 15 CP card, with a rapid double click.
  await page.goto(BASE + '/post/p_amara_3')
  await page.getByRole('button', { name: 'Save post' }).first().click()
  await comment(page, 'p_amara_3', 'That suya ratio is going in my notebook today.')
  const aBefore = await bal(page, 'amara')
  const theoBefore = await bal(page, 'theo')
  await page.goto(BASE + '/rewards?creator=amara')
  await shot(page, 'rewards-amara')
  const card = page.locator('article', { hasText: 'Payday budget template' })
  await card.getByRole('button', { name: 'Redeem' }).click()
  await shot(page, 'redeem-confirm')
  await page.evaluate(() => {
    const btn = [...document.querySelectorAll('[role=dialog] button')].find((b) => b.textContent.trim() === 'Confirm')
    btn.click()
    btn.click()
    btn.click()
  })
  await page.waitForTimeout(300)
  await shot(page, 'redeem-done')
  const s3 = await stored(page)
  check(
    'rapid triple click redeems once and deducts exactly 15',
    s3.redemptions.filter((r) => r.rewardId === 'r_amara_card').length === 1 && (await bal(page, 'amara')) === aBefore - 15,
    `amara ${aBefore} -> ${await bal(page, 'amara')}`,
  )
  check('redeeming Amara’s reward leaves Theo unchanged', (await bal(page, 'theo')) === theoBefore)
  check('confirmation says it is simulated', (await page.getByText('This is a simulation').count()) === 1)
  await page.getByRole('button', { name: 'Done' }).click()
  check('a redeemed reward cannot be redeemed again', (await card.getByRole('button', { name: 'Redeem' }).count()) === 0)

  const high = page.locator('article', { hasText: 'Seat at a live budgeting Q&A' })
  check('higher value Amara reward is visible and locked', (await high.getByText(/CP to go/).count()) === 1)

  // ---- Persistence (journey 6) -------------------------------------------
  const snapshot = JSON.stringify(await balances(page))
  await page.reload()
  check('balances survive a refresh', JSON.stringify(await balances(page)) === snapshot)
  await page.goto(BASE + '/rewards?tab=history')
  check('reward history survives a refresh', (await countWhenReady(page.getByText('Payday budget template'))) >= 1)

  await page.goto(BASE + '/points')
  await page.getByText('This total cannot be spent.').waitFor()
  check('points page shows lifetime total as not spendable', (await page.getByText('This total cannot be spent.').count()) === 1)
  await shot(page, 'points')

  // ---- Journey 2 and 5: discover follow + creator publish ----------------
  await page.goto(BASE + '/discover')
  await page.getByRole('button', { name: 'Follow Hana Sato' }).click()
  await page.goto(BASE + '/')
  check('following from Discover updates the feed', (await countWhenReady(page.getByText('The Memory Police'))) === 1)
  await page.goto(BASE + '/create')
  await page.fill('#post-text', 'Release 1 test post from the studio.')
  await page.getByRole('button', { name: 'Publish' }).click()
  await page.waitForURL(/\/profile/)
  await page.goto(BASE + '/')
  check('published post is first in the chronological feed', (await page.locator('article').first().innerText()).includes('Release 1 test post'))

  // ---- Profile pictures ---------------------------------------------------
  // The demo visitor starts with Jamie's fictional sample portrait.
  const SAMPLE = '/media/tour/people/jamie.jpg'
  await page.goto(BASE + '/profile')
  check('demo visitor starts with the sample portrait', (await stored(page)).profile.avatar === SAMPLE)
  await page.getByRole('button', { name: 'Change photo' }).click()
  const input = page.locator('[role=dialog] input[type=file]')
  await input.setInputFiles({ name: 'notes.txt', mimeType: 'text/plain', buffer: Buffer.from('hello') })
  check('wrong file type shows a helpful error', /not supported/.test(await page.getByRole('alert').innerText()))
  await input.setInputFiles({ name: 'huge.jpg', mimeType: 'image/jpeg', buffer: Buffer.alloc(9 * 1024 * 1024, 1) })
  check('oversized file shows a helpful error', /larger than 8 MB/.test(await page.getByRole('alert').innerText()))
  await input.setInputFiles({ name: 'broken.png', mimeType: 'image/png', buffer: Buffer.from('not really a png') })
  check('corrupt image shows a helpful error', /could not be opened/.test(await page.getByRole('alert').innerText()))
  await input.setInputFiles({ name: 'me.png', mimeType: 'image/png', buffer: await makeImage(page, 900, 600) })
  await page.getByText('Preview. Save to use this picture.').waitFor()
  check('preview appears before saving', (await stored(page)).profile.avatar === SAMPLE)
  await shot(page, 'avatar-preview')
  await page.getByRole('button', { name: 'Save picture' }).click()
  const av = (await stored(page)).profile.avatar
  check('saved picture is a small square JPEG', av?.startsWith('data:image/jpeg') && av.length < 200000, `${av?.length} chars`)
  const imgCount = async () => countWhenReady(page.locator(`img[src="${av}"]`))
  check('picture shows on the fan profile', (await imgCount()) >= 1)
  await page.goto(BASE + '/')
  check('picture shows on your posts in the feed', (await imgCount()) >= 1)
  await page.goto(BASE + '/post/p_amara_1')
  check('picture shows on your comments', (await imgCount()) >= 1)
  await page.goto(BASE + '/creator/me')
  check('picture shows on your creator page', (await imgCount()) >= 1)
  await page.reload()
  check('picture persists after refresh', (await imgCount()) >= 1)
  await page.goto(BASE + '/profile/tools')
  check('creator tools page loads with the picture available on profile', (await countWhenReady(page.getByRole('heading', { name: 'Creator tools' }))) === 1)
  // Creator side: create a reward and see the picture on the rewards page.
  await page.goto(BASE + '/profile/tools')
  await page.fill('input[placeholder^="e.g."]', 'Signed sketchbook page')
  await page.fill('textarea', 'A scanned and signed page from my travel sketchbook.')
  await page.getByRole('button', { name: 'Create reward' }).click()
  await page.goto(BASE + '/rewards?tab=all&creator=me')
  check('picture shows with your rewards', (await imgCount()) >= 1)
  // Change the picture.
  await page.goto(BASE + '/profile')
  await page.getByRole('button', { name: 'Change profile picture' }).click()
  await page.locator('[role=dialog] input[type=file]').setInputFiles({ name: 'two.png', mimeType: 'image/png', buffer: await makeImage(page, 300, 700) })
  await page.getByRole('button', { name: 'Save picture' }).click()
  const av2 = (await stored(page)).profile.avatar
  check('picture can be changed', av2 && av2 !== av)
  // Storage full: saving must fail cleanly.
  await page.goto(BASE + '/profile')
  await page.getByRole('button', { name: 'Change photo' }).click()
  await page.locator('[role=dialog] input[type=file]').setInputFiles({ name: 'three.png', mimeType: 'image/png', buffer: await makeImage(page, 400, 400) })
  await page.evaluate(() => {
    window.__setItem = Storage.prototype.setItem
    Storage.prototype.setItem = () => {
      throw new DOMException('Quota exceeded', 'QuotaExceededError')
    }
  })
  await page.getByRole('button', { name: 'Save picture' }).click()
  check('full storage shows a clear error and keeps the old picture', /storage is full/.test(await page.getByRole('alert').innerText()))
  await page.evaluate(() => (Storage.prototype.setItem = window.__setItem))
  check('old picture still stored after failed save', (await stored(page)).profile.avatar === av2)
  await page.getByRole('button', { name: 'Cancel' }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Remove', exact: true }).click()
  check('removing the picture falls back to initials', (await stored(page)).profile.avatar === undefined && (await page.locator('img[src^="data:image/jpeg"]').count()) === 0)
  // Keyboard focus stays inside the dialog.
  await page.getByRole('button', { name: 'Add photo' }).click()
  for (let i = 0; i < 8; i++) await page.keyboard.press('Tab')
  check('keyboard focus stays inside the picture dialog', await page.evaluate(() => !!document.activeElement.closest('[role=dialog]')))
  await page.keyboard.press('Escape')

  // ---- Reset --------------------------------------------------------------
  await page.getByRole('button', { name: 'Add photo' }).click()
  await page.locator('[role=dialog] input[type=file]').setInputFiles({ name: 'me.png', mimeType: 'image/png', buffer: await makeImage(page, 500, 500) })
  await page.getByRole('button', { name: 'Save picture' }).click()
  await page.getByRole('button', { name: 'Reset', exact: true }).click()
  await page.getByRole('button', { name: 'Reset demo' }).click()
  const r = await stored(page)
  check('reset clears CP, redemptions, and the uploaded picture', r.ledger.length === 0 && r.redemptions.length === 0 && r.profile.avatar === SAMPLE)

  // ---- Migration from version 1 ------------------------------------------
  await page.evaluate((k) => {
    localStorage.setItem(
      k,
      JSON.stringify({
        version: 1,
        seededAt: Date.now() - 86400000,
        mode: 'fan',
        profile: { name: 'Old Fan', handle: 'oldfan', bio: '', category: 'Art' },
        following: ['amara', 'theo', 'marcus'],
        liked: { p_amara_1: true },
        saved: {},
        myPosts: [],
        myComments: [],
        myRewards: [],
        deletedPostIds: [],
        ledger: [
          { id: 'a', at: Date.now(), amount: 50, kind: 'welcome', label: 'Welcome' },
          { id: 'b', at: Date.now(), amount: 10, kind: 'follow', label: 'Followed', creatorId: 'marcus' },
          { id: 'c', at: Date.now(), amount: -40, kind: 'redeem', label: 'Redeemed', creatorId: 'theo' },
        ],
        redemptions: [{ id: 'x', rewardId: 'r_theo_wall', at: Date.now(), cost: 40, code: 'DEMO-OLD1-OLD2', rewardTitle: 'Arctic wallpaper pack', creatorId: 'theo' }],
        earnedKeys: {},
      }),
    )
  }, KEY)
  await page.goto(BASE + '/points')
  const m = await stored(page)
  check('version 1 data migrates to the current version', m.version === 3 && m.following.includes('marcus') && m.liked.p_amara_1 === true)
  check('old universal CP is retired, not converted', m.ledger.length === 0 && m.migrationNotice.retiredBalance === 20)
  check('migration notice explains what happened', (await page.getByText('Connection Points now belong to each creator').count()) === 1)
  await shot(page, 'migration')
  await page.goto(BASE + '/rewards?tab=history')
  check('old redemption is kept and labelled', (await page.getByText('Old universal CP').count()) === 1)

  // ---- Narrow viewport and desktop ---------------------------------------
  const narrow = await browser.newPage({ viewport: { width: 320, height: 640 } })
  narrow.on('pageerror', (e) => errors.push(e.message))
  for (const p of ['/', '/discover', '/points', '/rewards', '/rewards?tab=all', '/profile', '/creator/amara', '/post/p_marcus_1', '/profile/tools', '/create']) {
    await narrow.goto(BASE + p)
    const ow = await narrow.evaluate(() => document.documentElement.scrollWidth - innerWidth)
    check(`no sideways scroll at 320px on ${p}`, ow <= 0, `${ow}px`)
  }
  await narrow.goto(BASE + '/rewards?tab=all')
  await shot(narrow, 'narrow-rewards')
  const desk = await browser.newPage({ viewport: { width: 1440, height: 900 } })
  desk.on('pageerror', (e) => errors.push(e.message))
  await desk.goto(BASE + '/points')
  await shot(desk, 'desktop-points')
  await desk.goto(BASE + '/rewards')
  await shot(desk, 'desktop-rewards')

  check('no console errors or page errors', errors.length === 0, errors.slice(0, 3).join(' | '))
  await browser.close()
  console.log(failures === 0 ? '\nALL CHECKS PASSED' : `\n${failures} CHECK(S) FAILED`)
  process.exit(failures === 0 ? 0 : 1)
})().catch((e) => {
  console.error('E2E CRASHED', e)
  process.exit(1)
})
