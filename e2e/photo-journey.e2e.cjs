// Build 5.3: photo posts in a real browser, against a real LOCAL Supabase
// (Storage, the Edge runtime) with the vercel.json security headers applied.
// P posts a photo from a phone (no caption, with a description) and one with
// a caption; Q sees them, opens the full photo and reports one; P deletes
// both; the moderator still sees the reported one; text posting is
// unchanged. Run through scripts/e2e/auth-journey.sh.
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
const PASSWORD = 'Photo-Journey-42-pass'
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
  sql(`select ops.grant_member_access('${id}', 'tester', 'photo-journey')`)
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
// A loaded post photo from Storage.
const photoShown = (scope) =>
  scope.locator('img[src*="/storage/v1/object/sign/post-photos/"]').first().evaluate((img) => img.complete && img.naturalWidth > 0).catch(() => false)
const sideways = (page) => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
// A phone-sized photo made by the browser itself.
const makePhoto = (page, w, h) =>
  page.evaluate(async ([w, h]) => {
    const c = document.createElement('canvas')
    c.width = w
    c.height = h
    const g = c.getContext('2d')
    const grad = g.createLinearGradient(0, 0, w, h)
    grad.addColorStop(0, '#2447a6')
    grad.addColorStop(1, '#f6b888')
    g.fillStyle = grad
    g.fillRect(0, 0, w, h)
    g.fillStyle = '#ffffff'
    g.fillRect(w / 3, h / 3, w / 3, h / 3)
    const b = await new Promise((r) => c.toBlob(r, 'image/jpeg', 0.92))
    return [...new Uint8Array(await b.arrayBuffer())]
  }, [w, h]).then((a) => Buffer.from(a))


;(async () => {
  const browser = await chromium.launch({ args: ['--disable-features=LocalNetworkAccessChecks,BlockInsecurePrivateNetworkRequests,PrivateNetworkAccessSendPreflights'] })
  const P = await member('php', 'Pat Photo')
  const Q = await member('phq', 'Quin Viewer')
  sql(`select ops.grant_moderator('${Q.id}', 'photo-journey', 'moderates in this journey')`)
  sql(`insert into social.follows (follower_id, creator_id) values ('${Q.id}', '${P.id}')`)
  // The founder's gate, as on staging: six passing processing checks, a cap and both thresholds.
  sql("select public.svc_photo_check_record('founder', 600, true, 'journey') from generate_series(1, 6)")
  sql("select ops.set_media_settings('founder', true, 2000000000, 10, 20)")
  const cspViolations = []

  // 1. P, on a phone, posts a photo with no caption and a description.
  const ctxP = await newContext(browser, { viewport: { width: 390, height: 844 } })
  const pageP = await ctxP.newPage()
  pageP.on('console', (m) => /Content Security Policy/i.test(m.text()) && cspViolations.push(m.text()))
  await signIn(pageP, P.email)
  const addPhoto = pageP.getByRole('button', { name: 'Add photo' })
  await addPhoto.waitFor()
  check('with photos on, Home offers Add photo', true)
  const tall = await makePhoto(pageP, 3024, 4032)
  await pageP.getByTestId('photo-input').setInputFiles({ name: 'IMG_0420.jpg', mimeType: 'image/jpeg', buffer: tall })
  await pageP.getByRole('img', { name: "The photo you're adding" }).waitFor()
  check('choosing a photo shows a preview, with Remove photo and a description field', await pageP.getByRole('button', { name: 'Remove photo' }).isVisible()
    && await pageP.getByRole('textbox', { name: 'Photo description (optional)' }).isVisible())
  {
    const v = await axe(pageP, 'main')
    check('the composer with a photo has no WCAG 2.2 AA violations', v.length === 0, v.join(', '))
    await pageP.setViewportSize({ width: 320, height: 700 })
    check('at 320px, the composer has no sideways scrolling', (await sideways(pageP)) <= 0)
    await pageP.setViewportSize({ width: 390, height: 844 })
  }
  await pageP.getByRole('textbox', { name: 'Photo description (optional)' }).fill('A white square on a sunset gradient')
  const uploadReq = pageP.waitForResponse((r) => r.url().includes('/functions/v1/post-media/photo'))
  await pageP.getByRole('button', { name: 'Post', exact: true }).click()
  const uploadRes = await uploadReq
  const sent = Buffer.from((await uploadRes.request().postDataBuffer()) ?? [])
  const sentFrame = (() => {
    for (let i = 2; i + 9 < sent.length; ) {
      if (sent[i] !== 0xff) return null
      const m = sent[i + 1]
      if (m >= 0xc0 && m <= 0xc2) return { h: sent.readUInt16BE(i + 5), w: sent.readUInt16BE(i + 7) }
      i += 2 + sent.readUInt16BE(i + 2)
    }
    return null
  })()
  check('the browser sends a JPEG resized to 1600 px on the long edge (1200 x 1600)', uploadRes.status() === 200 && sentFrame?.w === 1200 && sentFrame?.h === 1600, `${uploadRes.status()} ${JSON.stringify(sentFrame)}`)
  const mine = pageP.getByTestId('post').filter({ has: pageP.getByRole('img', { name: 'A white square on a sunset gradient' }) })
  await mine.waitFor()
  for (let i = 0; i < 20 && !(await photoShown(mine)); i++) await pageP.waitForTimeout(250)
  check('the photo post appears on Home, loaded from Storage, with its description as alt text', await photoShown(mine))
  const firstPost = sql(`select id from social.posts where author_id = '${P.id}' and media_kind = 'photo' order by created_at limit 1`)
  check('it was stored with no caption, and two files exist', sql(`select body from social.posts where id = '${firstPost}'`) === ''
    && sql(`select count(*) from storage.objects o join social.media_uploads u on o.name in (u.full_path, u.feed_path) join social.post_media m on m.upload_id = u.id where m.post_id = '${firstPost}'`) === '2')

  // 2. A second photo with a caption, from Create.
  await pageP.goto(`${APP}/app/new`)
  await pageP.getByRole('button', { name: 'Add photo' }).waitFor()
  await pageP.getByTestId('photo-input').setInputFiles({ name: 'wide.jpg', mimeType: 'image/jpeg', buffer: await makePhoto(pageP, 2400, 1600) })
  await pageP.getByRole('img', { name: "The photo you're adding" }).waitFor()
  await pageP.getByRole('textbox', { name: 'Write a post' }).fill(`Wide one (${RUN})`)
  await pageP.getByRole('button', { name: 'Post', exact: true }).click()
  await pageP.waitForURL(/\/app\/post\//)
  await pageP.getByText(`Wide one (${RUN})`).waitFor()
  check('a photo with a caption posts from Create and opens its post page', true)
  // Text posting is unchanged.
  await pageP.goto(`${APP}/app`)
  await pageP.getByRole('textbox', { name: 'Write a post' }).fill(`Just text (${RUN})`)
  await pageP.getByRole('button', { name: 'Post', exact: true }).click()
  await pageP.getByText(`Just text (${RUN})`).waitFor()
  check('text-only posting still works', sql(`select media_kind is null from social.posts where body = 'Just text (${RUN})'`) === 't')

  // 3. Q sees both photos, opens the full photo, and reports one.
  const ctxQ = await newContext(browser, { viewport: { width: 1280, height: 900 } })
  const pageQ = await ctxQ.newPage()
  pageQ.on('console', (m) => /Content Security Policy/i.test(m.text()) && cspViolations.push(m.text()))
  await signIn(pageQ, Q.email)
  const qPost = pageQ.getByTestId('post').filter({ has: pageQ.getByRole('img', { name: 'A white square on a sunset gradient' }) })
  await qPost.waitFor()
  for (let i = 0; i < 20 && !(await photoShown(qPost)); i++) await pageQ.waitForTimeout(250)
  check('Q sees P\'s photo in the feed (the 800 px copy)', await photoShown(qPost)
    && /-feed\.jpg/.test(await qPost.locator('img[src*="post-photos"]').first().getAttribute('src')))
  {
    const v = await axe(pageQ, 'main')
    check('Home with photo posts has no WCAG 2.2 AA violations', v.length === 0, v.join(', '))
  }
  await qPost.getByRole('button', { name: 'Open the photo: A white square on a sunset gradient' }).click()
  const dialog = pageQ.getByRole('dialog', { name: 'Photo' })
  await dialog.waitFor()
  for (let i = 0; i < 20 && !(await photoShown(dialog)); i++) await pageQ.waitForTimeout(250)
  check('tapping opens the full 1600 px photo in a dialog', await photoShown(dialog) && !/-feed\.jpg/.test(await dialog.locator('img').first().getAttribute('src')))
  {
    const v = await axe(pageQ, '[role="dialog"]')
    check('the photo dialog has no WCAG 2.2 AA violations', v.length === 0, v.join(', '))
  }
  await pageQ.keyboard.press('Escape')
  await dialog.waitFor({ state: 'detached' })
  check('Escape closes it', true)
  await qPost.getByRole('button', { name: /Report this post/ }).click()
  const reportDialog = pageQ.getByRole('dialog')
  await reportDialog.getByRole('radio', { name: /Harassment/ }).check()
  await reportDialog.getByRole('button', { name: /Send report/ }).click()
  await pageQ.getByText("Thanks for letting us know. We'll review this.").waitFor()
  await pageQ.keyboard.press('Escape')
  check('Q reports the photo post', sql(`select count(*) from ops.content_reports where target_id = '${firstPost}'`) === '1')

  // 4. P deletes both photo posts; the reported one is kept as evidence, the other is deleted.
  await pageP.goto(`${APP}/app/u/${P.username}`)
  for (const name of ['A white square on a sunset gradient']) {
    const card = pageP.getByTestId('post').filter({ has: pageP.getByRole('img', { name }) })
    await card.getByRole('button', { name: 'Delete post' }).click()
    await card.getByRole('button', { name: 'Delete', exact: true }).click()
  }
  const wide = pageP.getByTestId('post').filter({ hasText: `Wide one (${RUN})` })
  await wide.getByRole('button', { name: 'Delete post' }).click()
  await wide.getByRole('button', { name: 'Delete', exact: true }).click()
  await pageP.waitForTimeout(1500)
  const widePost = sql(`select id from social.posts where body = 'Wide one (${RUN})'`)
  check('the unreported photo\'s files are deleted by the server after the delete',
    sql(`select count(*) from storage.objects o join social.media_uploads u on o.name in (u.full_path, u.feed_path) join social.post_media m on m.upload_id = u.id where m.post_id = '${widePost}'`) === '0')
  check('the reported photo\'s files are kept as evidence',
    sql(`select count(*) from storage.objects o join social.media_uploads u on o.name in (u.full_path, u.feed_path) join social.post_media m on m.upload_id = u.id where m.post_id = '${firstPost}'`) === '2')
  // 5. The moderator still sees the reported photo, and photo storage.
  const reportId = sql(`select id from ops.content_reports where target_id = '${firstPost}'`)
  await pageQ.goto(`${APP}/app/moderation/${reportId}`)
  const evidence = pageQ.getByRole('img', { name: 'A white square on a sunset gradient' })
  await evidence.waitFor()
  check('the moderator sees the reported photo after the author deleted it', await evidence.evaluate((i) => i.complete && i.naturalWidth > 0).catch(() => false) || (await pageQ.waitForTimeout(800), await evidence.evaluate((i) => i.naturalWidth > 0)))
  await pageQ.goto(`${APP}/app/moderation`)
  await pageQ.getByRole('heading', { name: 'Photo storage' }).waitFor()
  check('the moderator sees photo storage, with the evidence held', /Kept as evidence for reports\s*[1-9]/.test(await pageQ.getByText('Kept as evidence for reports').locator('..').textContent()))
  {
    const v = await axe(pageQ, 'main')
    check('the moderation page with photo storage has no WCAG 2.2 AA violations', v.length === 0, v.join(', '))
  }
  check('no Content Security Policy violation while showing photos', cspViolations.length === 0, cspViolations.join(' | ').slice(0, 200))

  sql("select ops.set_media_settings('founder', false, 2000000000, 10, 20)")
  await browser.close()
  console.log(failures === 0 ? 'ALL CHECKS PASSED' : `${failures} CHECK(S) FAILED`)
  process.exit(failures === 0 ? 0 : 1)
})().catch((e) => {
  console.error(e)
  process.exit(1)
})
