// Build 5.2b: profile pictures in a real browser, against a real LOCAL
// Supabase (Storage and the Edge runtime) with the vercel.json security
// headers applied. P chooses a photo, crops and zooms it, saves; Q sees it
// on the feed; P removes it. Run through scripts/e2e/auth-journey.sh.
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
const DB = env('DB_URL')
const SERVICE = env('SERVICE_ROLE_KEY')
if (!/^http:\/\/(127\.0\.0\.1|localhost):/.test(API)) throw new Error('Refusing: not a local Supabase')
const vercel = JSON.parse(readFileSync(path.join(__dirname, '..', 'vercel.json'), 'utf8'))
const SECURITY_HEADERS = Object.fromEntries(
  vercel.headers.find((h) => h.source === '/(.*)').headers.map((h) => [h.key.toLowerCase(), h.value.replaceAll('https://kpudeppgokpjhvaqrprn.supabase.co', API)]),
)
const AXE = readFileSync(path.join(__dirname, '..', 'node_modules', 'axe-core', 'axe.min.js'), 'utf8')
const RUN = String(Date.now()).slice(-7)
const PASSWORD = 'Avatar-Journey-42-pass'
let failures = 0
const check = (name, ok, detail = '') => {
  if (!ok) failures++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`)
}
const sql = (q) => execFileSync('psql', [DB, '-v', 'ON_ERROR_STOP=1', '-qAt', '-c', q]).toString().trim()
const admin = { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, 'Content-Type': 'application/json' }

async function member(tag, name) {
  const email = `${tag}-${RUN}@example.test`
  const r = await fetch(`${API}/auth/v1/admin/users`, { method: 'POST', headers: admin, body: JSON.stringify({ email, password: PASSWORD, email_confirm: true }) })
  const { id } = await r.json()
  sql(`update public.profiles set username = '${tag}_${RUN}', display_name = '${name}' where id = '${id}'`)
  sql(`select ops.grant_member_access('${id}', 'tester', 'avatar-journey')`)
  sql(`insert into social.profile_details (user_id, onboarded_at) values ('${id}', now())`)
  return { id, email, name, username: `${tag}_${RUN}` }
}
async function axe(page, scope) {
  await page.evaluate(AXE)
  return page.evaluate(
    async (sel) =>
      (await window.axe.run(sel ? document.querySelector(sel) : document, { runOnly: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] })).violations.map(
        (v) => `${v.id} x${v.nodes.length} [${v.nodes.map((n) => n.target.join(' ')).join('; ').slice(0, 140)}]`,
      ),
    scope || null,
  )
}
async function newContext(browser, opts = {}) {
  const ctx = await browser.newContext(opts)
  await ctx.route(`${APP}/**`, async (route) => {
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
async function signIn(page, email) {
  await page.goto(`${APP}/sign-in?next=%2Fapp`)
  await page.getByLabel('Email address', { exact: true }).fill(email)
  await page.getByLabel('Password', { exact: true }).fill(PASSWORD)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await page.getByRole('heading', { name: 'Home' }).waitFor()
}
// A loaded picture from Storage (not initials).
const pictureShown = (page, scope = page) =>
  scope.locator('img[src*="/storage/v1/object/sign/avatars/"]').first().evaluate((img) => img.complete && img.naturalWidth > 0).catch(() => false)

;(async () => {
  const browser = await chromium.launch({ args: ['--disable-features=LocalNetworkAccessChecks,BlockInsecurePrivateNetworkRequests,PrivateNetworkAccessSendPreflights'] })
  const P = await member('avp', 'Pia Picture')
  const Q = await member('avq', 'Quinn Viewer')
  sql(`insert into social.follows (follower_id, creator_id) values ('${Q.id}', '${P.id}')`)
  sql(`insert into social.posts (author_id, body) values ('${P.id}', 'A post with my new picture (${RUN})')`)
  const cspViolations = []

  // 1. P adds a picture from a non-square photo: choose, drag, zoom, save.
  const ctxP = await newContext(browser, { viewport: { width: 390, height: 844 } })
  const pageP = await ctxP.newPage()
  pageP.on('console', (m) => /Content Security Policy/i.test(m.text()) && cspViolations.push(m.text()))
  await signIn(pageP, P.email)
  // A 900 x 600 JPEG made by the browser itself (a phone photo is rarely square).
  const photo = Buffer.from(
    await pageP.evaluate(async () => {
      const c = document.createElement('canvas')
      c.width = 900
      c.height = 600
      const g = c.getContext('2d')
      g.fillStyle = '#2447a6'
      g.fillRect(0, 0, 900, 600)
      g.fillStyle = '#f6b888'
      g.fillRect(300, 100, 300, 400)
      const b = await new Promise((r) => c.toBlob(r, 'image/jpeg', 0.9))
      return [...new Uint8Array(await b.arrayBuffer())]
    }),
  )
  await pageP.goto(`${APP}/app/profile?edit=1`)
  await pageP.getByRole('button', { name: 'Add a photo' }).click()
  const dialog = pageP.getByRole('dialog', { name: 'Profile picture' })
  await dialog.waitFor()
  await dialog.locator('input[type="file"]').setInputFiles({ name: 'phone-photo.jpg', mimeType: 'image/jpeg', buffer: photo })
  const cropper = dialog.getByTestId('avatar-cropper')
  await cropper.waitFor()
  check('choosing a photo opens the cropper', true)
  {
    await pageP.waitForTimeout(300)
    const v = await axe(pageP, '[role="dialog"]')
    check('the picture editor has no WCAG 2.2 AA violations', v.length === 0, v.join(', '))
    const sideways = await pageP.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
    check('at 390px, the editor has no sideways scrolling', sideways <= 0, `${sideways}px`)
  }
  const box = await cropper.boundingBox()
  await pageP.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await pageP.mouse.down()
  await pageP.mouse.move(box.x + box.width / 2 + 60, box.y + box.height / 2, { steps: 5 })
  await pageP.mouse.up()
  await dialog.getByRole('slider').fill('2')
  await cropper.focus()
  await pageP.keyboard.press('ArrowLeft')
  const upload = pageP.waitForResponse((r) => r.url().includes('/functions/v1/avatar/upload'))
  await dialog.getByRole('button', { name: 'Save picture' }).click()
  const uploaded = await upload
  check('saving sends the picture to the avatar function, which accepts it', uploaded.status() === 200, String(uploaded.status()))
  await pageP.getByText('Profile picture saved.').waitFor()
  check('P is told the picture was saved', true)
  for (let i = 0; i < 20 && !(await pictureShown(pageP, pageP.getByTestId('profile-picture-field'))); i++) await pageP.waitForTimeout(250)
  check('P\'s profile shows the new picture (loaded from Storage through a signed link)', await pictureShown(pageP, pageP.getByTestId('profile-picture-field')))
  const stored = sql(`select path from social.avatars where user_id = '${P.id}'`)
  const file = Buffer.from(await (await fetch(`${API}/storage/v1/object/avatars/${stored}`, { headers: admin })).arrayBuffer())
  check('the stored file is a JPEG in P\'s own folder, under 200 KB', stored.startsWith(`${P.id}/`) && file[0] === 0xff && file[1] === 0xd8 && file.length <= 200 * 1024, `${file.length} bytes`)

  // 2. Q sees it on the feed and on P's page.
  const ctxQ = await newContext(browser)
  const pageQ = await ctxQ.newPage()
  pageQ.on('console', (m) => /Content Security Policy/i.test(m.text()) && cspViolations.push(m.text()))
  await signIn(pageQ, Q.email)
  const post = pageQ.getByTestId('post').filter({ hasText: `A post with my new picture (${RUN})` })
  await post.waitFor()
  for (let i = 0; i < 20 && !(await pictureShown(pageQ, post)); i++) await pageQ.waitForTimeout(250)
  check('Q sees P\'s picture on P\'s post in the feed', await pictureShown(pageQ, post))
  await pageQ.goto(`${APP}/app/u/${P.username}`)
  await pageQ.getByRole('heading', { name: P.name }).waitFor()
  for (let i = 0; i < 20 && !(await pictureShown(pageQ)); i++) await pageQ.waitForTimeout(250)
  check('and on P\'s profile page', await pictureShown(pageQ))
  check('no Content Security Policy violation while showing pictures', cspViolations.length === 0, cspViolations.join(' | ').slice(0, 200))

  // 3. P removes it: initials again, and the file is gone.
  await pageP.getByRole('button', { name: 'Change picture' }).click()
  await dialog.getByRole('button', { name: 'Remove picture' }).click()
  await dialog.getByRole('button', { name: 'Remove', exact: true }).click()
  await pageP.getByText('Profile picture removed. Your initials show instead.').waitFor()
  check('removing tells P their initials show instead', true)
  check('the picture and its file are gone', sql(`select count(*) from social.avatars where user_id = '${P.id}'`) === '0'
    && sql(`select count(*) from storage.objects where bucket_id = 'avatars' and name like '${P.id}/%'`) === '0')
  await pageQ.reload()
  await pageQ.getByRole('heading', { name: P.name }).waitFor()
  await pageQ.waitForTimeout(800)
  check('Q now sees P\'s initials, not a picture', !(await pictureShown(pageQ)))

  // 4. Setup's About you step offers the photo (optional), on a phone.
  {
    const R = await member('avr', 'Rae New')
    sql(`delete from social.profile_details where user_id = '${R.id}'`)
    const ctxR = await newContext(browser, { viewport: { width: 320, height: 700 } })
    const pageR = await ctxR.newPage()
    await pageR.goto(`${APP}/sign-in?next=%2Fapp`)
    await pageR.getByLabel('Email address', { exact: true }).fill(R.email)
    await pageR.getByLabel('Password', { exact: true }).fill(PASSWORD)
    await pageR.getByRole('button', { name: 'Sign in' }).click()
    await pageR.getByRole('heading', { name: 'What brings you to Splitpost?' }).waitFor()
    await pageR.getByRole('button', { name: 'Skip for now: what brings you here' }).click()
    await pageR.getByRole('button', { name: 'Continue' }).click()
    await pageR.getByRole('heading', { name: 'Tell people about you' }).waitFor()
    check('the About you step offers "Add a photo" (optional)', await pageR.getByText('Profile picture (optional)').isVisible() && await pageR.getByRole('button', { name: 'Add a photo' }).isVisible())
    const v = await axe(pageR)
    check('the About you step, with the photo, has no WCAG 2.2 AA violations', v.length === 0, v.join(', '))
    const sideways = await pageR.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
    check('at 320px, the About you step has no sideways scrolling', sideways <= 0, `${sideways}px`)
    await ctxR.close()
  }

  await browser.close()
  console.log(failures === 0 ? 'ALL CHECKS PASSED' : `${failures} CHECK(S) FAILED`)
  process.exit(failures === 0 ? 0 : 1)
})().catch((e) => {
  console.error(e)
  process.exit(1)
})
