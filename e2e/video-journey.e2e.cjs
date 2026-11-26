// Video posts (IP-5, 20261213000000) in a real browser, against a real LOCAL
// Supabase (Storage, the Edge runtime, the database) with the vercel.json
// security headers applied:
//
//  1. While video posts are off, members are offered no video and the server
//     refuses a video upload; the device test page is for the founder and
//     testers only.
//  2. The founder runs the device test on /app/video-test: a 1080p clip is
//     checked, converted in the browser to 720p H.264, uploaded privately with
//     the resumable protocol, checked by the server and played back; the
//     results can be copied. Test uploads are never published.
//  3. The founder records passing iPhone and Android tests and the cap in the
//     Control Center, then turns video posts on.
//  4. A member posts a small 720p H.264 MP4 (sent as it is), the server checks
//     it, and a follower plays it from a signed link: no autoplay, nothing
//     loaded before play, and a sideways swipe over the player never changes
//     the Home view.
//  5. The server refuses an HEVC file uploaded directly and queues it for
//     deletion; deleting the post queues both files and the cleanup removes
//     them; pausing new uploads keeps published videos playing; playback has its own switch.
// WCAG 2.2 AA at 320 and 390 px, no sideways scrolling, no CSP violations.
// Run by scripts/e2e/auth-journey.sh. Fixtures: e2e/fixtures/video (ffmpeg).
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
const PUB = env('PUBLISHABLE_KEY')
if (!/^http:\/\/(127\.0\.0\.1|localhost):/.test(API)) throw new Error('Refusing: not a local Supabase')
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const vercel = JSON.parse(readFileSync(path.join(__dirname, '..', 'vercel.json'), 'utf8'))
const SECURITY_HEADERS = Object.fromEntries(
  vercel.headers.find((h) => h.source === '/(.*)').headers.map((h) => [h.key.toLowerCase(), h.value.replace(/https:\/\/[a-z0-9]+\.supabase\.co/g, API)]),
)
const AXE = readFileSync(path.join(__dirname, '..', 'node_modules', 'axe-core', 'axe.min.js'), 'utf8')
const FIXTURES = path.join(__dirname, 'fixtures', 'video')
const RUN = String(Date.now()).slice(-7)
const PASSWORD = 'Video-Journey-42-pass'
let failures = 0
const check = (name, ok, detail = '') => {
  if (!ok) failures++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`)
}
const sql = (q) => execFileSync('psql', [DB, '-v', 'ON_ERROR_STOP=1', '-qAt', '-c', q]).toString().trim()
// Switch changes made directly by this journey are recorded like any other
// change, so the reconciliation's "matches its latest recorded change" check holds.
const setSwitch = (features, on) => {
  for (const f of features) {
    sql(`update ops.feature_switches set enabled = ${on}, updated_at = now(), updated_by = 'journey' where feature = '${f}';
         insert into ops.feature_switch_events (feature, enabled, reason, changed_by) values ('${f}', ${on}, 'Video journey test step', 'journey')`)
  }
}

const admin = { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, 'Content-Type': 'application/json' }

async function createMember(tag, name, cohort) {
  const email = `vid-${tag}-${RUN}@example.test`
  const r = await fetch(`${API}/auth/v1/admin/users`, { method: 'POST', headers: admin, body: JSON.stringify({ email, password: PASSWORD, email_confirm: true }) })
  const body = await r.json()
  if (!r.ok) throw new Error(`could not create ${tag}`)
  sql(`update public.profiles set username = 'vid${tag}${RUN}', display_name = '${name}' where id = '${body.id}'`)
  sql(`select ops.grant_member_access('${body.id}', '${cohort}', 'video-journey')`)
  sql(`insert into social.profile_details (user_id, onboarded_at) values ('${body.id}', now()) on conflict (user_id) do nothing`)
  return { id: body.id, email, name }
}
// The founder: the launch founder if one is already pinned (an earlier journey may have done it), otherwise a new one.
async function founderAccount() {
  let id = sql("select coalesce(founder_user_id::text, '') from ops.member_launch_settings")
  if (!id) {
    const f = await createMember('f', 'Fay Founder', 'tester')
    sql(`select ops.set_launch_founder('video-journey', '${f.id}', 'SET THE LAUNCH FOUNDER')`)
    sql(`select ops.grant_member_access('${f.id}', 'founder', 'video-journey')`)
    return f
  }
  const email = sql(`select email from auth.users where id = '${id}'`)
  const r = await fetch(`${API}/auth/v1/admin/users/${id}`, { method: 'PUT', headers: admin, body: JSON.stringify({ password: PASSWORD }) })
  if (!r.ok) throw new Error('could not set the founder password')
  sql(`select ops.grant_member_access('${id}', 'founder', 'video-journey')`)
  sql(`insert into social.profile_details (user_id, onboarded_at) values ('${id}', now()) on conflict (user_id) do nothing`)
  return { id, email, name: 'the founder' }
}
async function tokenFor(email) {
  const r = await fetch(`${API}/auth/v1/token?grant_type=password`, { method: 'POST', headers: { apikey: PUB, 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password: PASSWORD }) })
  return (await r.json()).access_token
}
const fn = (token, route, body) =>
  fetch(`${API}/functions/v1/post-media/${route}`, { method: 'POST', headers: { apikey: PUB, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) })

async function axe(page, scope) {
  await page.evaluate(AXE)
  return page.evaluate(
    async (sel) =>
      (await window.axe.run(sel ? document.querySelector(sel) : document, { runOnly: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] })).violations.map(
        (v) => `${v.id} x${v.nodes.length} [${v.nodes.map((n) => n.target.join(' ')).join('; ').slice(0, 160)}]`,
      ),
    scope || null,
  )
}
async function screenChecks(page, label) {
  const size = page.viewportSize()
  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 760 })
    await page.waitForTimeout(150)
    const v = await axe(page, 'main')
    check(`at ${width}px, ${label} has no WCAG 2.2 AA violations`, v.length === 0, v.join(', '))
    const sideways = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
    check(`at ${width}px, ${label} has no sideways scrolling`, sideways <= 0, `${sideways}px`)
  }
  if (size) await page.setViewportSize(size)
}
const csp = []
async function newContext(browser, opts = {}) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, ...opts })
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
  ctx.on('console', (m) => /Content Security Policy/i.test(m.text()) && csp.push(m.text()))
  return ctx
}
async function signIn(page, email) {
  await page.goto(`${APP}/sign-in?next=%2Fapp`)
  await page.getByLabel('Email address', { exact: true }).fill(email)
  await page.getByLabel('Password', { exact: true }).fill(PASSWORD)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await page.getByRole('heading', { name: 'Home' }).waitFor()
}
// Plays a video element for a moment: true once it has really advanced with a picture.
const plays = (video) =>
  video.evaluate(async (v) => {
    v.muted = true
    try {
      await v.play()
    } catch {
      return { ok: false, why: 'play() refused' }
    }
    for (let i = 0; i < 60 && v.currentTime < 0.5; i++) await new Promise((r) => setTimeout(r, 100))
    const ok = v.currentTime >= 0.5 && v.videoWidth > 0
    v.pause()
    return { ok, why: `t=${v.currentTime.toFixed(2)} ${v.videoWidth}x${v.videoHeight}` }
  })
const objects = (where) => sql(`select count(*) from storage.objects where bucket_id = 'post-videos' and ${where}`)

;(async () => {
  const browser = await chromium.launch({ args: ['--disable-features=LocalNetworkAccessChecks,BlockInsecurePrivateNetworkRequests,PrivateNetworkAccessSendPreflights'] })
  try {
    // A clean start for this journey's switch (other journeys never turn video on).
    setSwitch(['video_posts'], false)
    const F = await founderAccount()
    const V = await createMember('v', 'Vera Video', 'creator')
    const W = await createMember('w', 'Wes Watcher', 'fan')
    sql(`insert into social.follows (follower_id, creator_id) values ('${W.id}', '${V.id}') on conflict do nothing`)
    const tV = await tokenFor(V.email)

    // 1. Off: no video in the composer, and the server refuses.
    {
      const ctx = await newContext(browser)
      const page = await ctx.newPage()
      await signIn(page, V.email)
      await page.getByRole('textbox', { name: 'Write a post' }).first().waitFor()
      await page.waitForTimeout(800)
      check('while video posts are off, Home offers no Add video', (await page.getByRole('button', { name: 'Add video' }).count()) === 0)
      const r = await fn(tV, 'video-begin', { bytes: 1000, durationMs: 1000, purpose: 'post' })
      check('while video posts are off, the server refuses a video upload', r.status === 403 && (await r.json()).error === 'videos_unavailable', String(r.status))
      const t = await fn(tV, 'video-begin', { bytes: 1000, durationMs: 1000, purpose: 'device_test' })
      check('a member who is not a tester cannot make a device-test upload', t.status === 403 && (await t.json()).error === 'not_tester', String(t.status))
      await page.goto(`${APP}/app/video-test`)
      await page.getByText('The video device test is for the founder and testers.').waitFor()
      check('the device test page is for the founder and testers only', (await page.getByRole('button', { name: 'Choose a video' }).count()) === 0)
      await ctx.close()
    }

    // 2. The founder's device test: check, convert, upload, server check, play, copy.
    {
      const ctx = await newContext(browser)
      await ctx.grantPermissions(['clipboard-read', 'clipboard-write'])
      const page = await ctx.newPage()
      const tus = []
      page.on('request', (r) => r.url().includes('/storage/v1/upload/resumable/sign') && tus.push(r.method()))
      await signIn(page, F.email)
      await page.goto(`${APP}/app/video-test`)
      await page.getByRole('heading', { name: 'Video device test' }).waitFor()
      await screenChecks(page, 'the device test page')
      await page.getByTestId('video-test-input').setInputFiles(path.join(FIXTURES, 'h264-1080p-2s-moov-at-end.mp4'))
      const runs = page.getByRole('list', { name: 'Test runs' })
      await runs.waitFor({ timeout: 120_000 })
      const text = await runs.innerText()
      check('the 1080p clip is checked, converted, uploaded and passes the server check', /: Pass/.test(text) && /Convert \d+\.\d s/.test(text) && /Sent: 1280x720/.test(text), text.replace(/\s+/g, ' ').slice(0, 300))
      check('the upload used the resumable protocol with a signed token (create, then chunks)', tus[0] === 'POST' && tus.includes('PATCH'), tus.join(','))
      const up = sql(`select purpose || ' ' || status || ' ' || codec || ' ' || width || 'x' || height || ' ' || (feed_bytes is not null) from social.media_uploads where user_id = '${F.id}' and kind = 'video' order by created_at desc limit 1`)
      check('the test upload is private, stored by the server as H.264 720p, with a poster', up === 'device_test stored avc1 1280x720 true', up)
      await page.getByRole('button', { name: 'Play the uploaded clip' }).click()
      const player = page.getByTestId('video-test-player')
      await player.waitFor()
      const before = await player.evaluate((v) => ({ autoplay: v.autoplay, preload: v.preload, paused: v.paused, src: v.currentSrc || v.src }))
      check('the test clip comes from a signed private link, with no autoplay and nothing preloaded', !before.autoplay && before.preload === 'none' && before.paused && before.src.includes('/storage/v1/object/sign/post-videos/'))
      const p = await plays(player)
      check('the converted test clip plays', p.ok, p.why)
      await page.getByRole('button', { name: 'Copy results' }).click()
      await page.getByText(/Copied\./).waitFor()
      const copied = await page.evaluate(() => navigator.clipboard.readText())
      check('Copy results gives the device, the times and Pass', /WebCodecs: yes/.test(copied) && /Run 1: h264-1080p-2s-moov-at-end\.mp4 .*: Pass/.test(copied) && /Check \d/.test(copied), copied.slice(0, 160))
      await screenChecks(page, 'the device test page with results')
      const pub = await fn(await tokenFor(F.email), 'video-begin', { bytes: 1000, durationMs: 1000, purpose: 'post' })
      check('the founder cannot post a video either while video posts are off', pub.status === 403)

      // 3. Device tests and the cap, then the switch.
      await page.goto(`${APP}/app/control`)
      const panel = page.getByTestId('video-readiness-panel')
      await panel.waitFor()
      const sw = page.getByTestId('switches-panel')
      // (Device tests are append-only: on a database where an earlier run recorded them, this step is skipped.)
      if (sql('select count(*) from ops.video_device_tests') === '0') {
        check('before the device tests, video posts cannot be switched on', await sw.getByRole('button', { name: 'Turn new video uploads on' }).isDisabled())
      }
      for (const device of ['iphone_safari', 'android_chrome']) {
        await panel.getByLabel('Device', { exact: true }).selectOption(device)
        await panel.getByRole('radio', { name: 'Passed' }).check()
        await panel.getByLabel(/Notes/).fill(`${device}: 1 and 5 minute clips passed (journey ${RUN})`)
        await panel.getByRole('button', { name: 'Record result' }).click()
        await panel.getByText('Device test recorded.').waitFor()
      }
      await panel.getByLabel('Video storage cap (GB)').fill('50')
      await panel.getByRole('button', { name: 'Save cap' }).click()
      await panel.getByText('Video storage cap saved.').waitFor()
      await sw.getByLabel('Reason').fill('Both phones passed the device test')
      const on = sw.getByRole('button', { name: 'Turn new video uploads on' })
      for (let i = 0; i < 20 && (await on.isDisabled()); i++) await page.waitForTimeout(150)
      await on.click()
      await sw.getByText('New video uploads: On').waitFor()
      check('after both phone tests and the cap, the founder turns video posts on (recorded)', sql("select enabled from ops.feature_switches where feature = 'video_posts'") === 't'
        && sql("select count(*) from ops.video_device_tests where notes like '%journey " + RUN + "%'") === '2')
      const v = await axe(page, '[data-testid="video-readiness-panel"]')
      check('the video readiness panel has no WCAG 2.2 AA violations', v.length === 0, v.join(', '))
      await ctx.close()
    }

    // 4. A member posts a video; a follower plays it.
    let postId
    {
      const ctx = await newContext(browser)
      const page = await ctx.newPage()
      await signIn(page, V.email)
      const add = page.getByRole('button', { name: 'Add video' }).first()
      await add.waitFor()
      check('with video posts on, Home offers Add video', true)
      await page.getByTestId('video-input').first().setInputFiles(path.join(FIXTURES, 'h264-720p-3s.mp4'))
      await page.getByText(/Ready to post: 0:03, 1280 x 720/).waitFor({ timeout: 60_000 })
      await screenChecks(page, 'the composer with a video')
      await page.getByRole('textbox', { name: 'Write a post' }).first().fill(`A walk in the park ${RUN}`)
      await page.getByRole('button', { name: 'Post', exact: true }).first().click()
      await page.getByText(`A walk in the park ${RUN}`).first().waitFor()
      postId = sql(`select id from social.posts where author_id = '${V.id}' and media_kind = 'video' order by created_at desc limit 1`)
      const row = sql(`select u.status || ' ' || u.codec || ' ' || u.width || 'x' || u.height || ' ' || round(u.duration_ms / 1000.0) || ' ' || u.purpose from social.post_media m join social.media_uploads u on u.id = m.upload_id where m.post_id = '${postId}'`)
      check('the video post is stored: published, H.264, 1280 x 720, 3 seconds, sent as it is', row === 'published avc1 1280x720 3 post', row)
      check('the video and its poster are in the private post-videos bucket', objects(`name like '${V.id}/%'`) === '2')
      await ctx.close()
    }
    {
      const ctx = await newContext(browser, { viewport: { width: 320, height: 720 } })
      const page = await ctx.newPage()
      await signIn(page, W.email)
      const card = page.getByTestId('post').filter({ hasText: `A walk in the park ${RUN}` }).first()
      await card.waitFor()
      const player = card.getByTestId('post-video-player')
      await player.waitFor()
      await page.waitForTimeout(1000)
      const st = await player.evaluate((v) => ({ autoplay: v.autoplay, preload: v.preload, paused: v.paused, time: v.currentTime, controls: v.controls, src: v.src, poster: v.poster, label: v.getAttribute('aria-label') }))
      check('the follower sees the video with controls, a poster and an accessible name, not playing and not preloaded', !st.autoplay && st.preload === 'none' && st.paused && st.time === 0 && st.controls && st.label === 'Video by Vera Video' && st.poster.includes('/object/sign/post-videos/'), JSON.stringify({ ...st, src: undefined, poster: Boolean(st.poster) }))
      check('it plays from a short-lived signed link to the private bucket', st.src.includes('/storage/v1/object/sign/post-videos/') && /token=/.test(st.src))
      // A sideways swipe over the player never changes the Home view.
      const tab = async () => page.getByRole('tablist', { name: 'Home views' }).getByRole('tab', { selected: true }).innerText()
      const before = await tab()
      const box = await player.boundingBox()
      await page.mouse.move(box.x + box.width * 0.8, box.y + box.height / 2)
      await page.mouse.down()
      await page.mouse.move(box.x + box.width * 0.5, box.y + box.height / 2, { steps: 5 })
      await page.mouse.move(box.x + box.width * 0.1, box.y + box.height / 2, { steps: 5 })
      await page.mouse.up()
      await page.waitForTimeout(400)
      check('a sideways swipe over the player leaves the Home view where it was', (await tab()) === before, `${before} -> ${await tab()}`)
      const p = await plays(player)
      check('the follower plays the video', p.ok, p.why)
      await screenChecks(page, 'Home with a video post')
      await ctx.close()
      // Separate controls: pausing new uploads keeps this video playing; playback has its own switch.
      setSwitch(['video_posts'], false)
      const keep = await (await fn(tV, 'video-links', { ids: [postId] })).json()
      check('pausing new uploads keeps the published video playing', Object.keys(keep.videos ?? {}).length === 1, JSON.stringify(keep))
      setSwitch(['video_playback'], false)
      const none = await (await fn(tV, 'video-links', { ids: [postId] })).json()
      check('switching playback off stops new playback links', Object.keys(none.videos ?? {}).length === 0)
      setSwitch(['video_posts', 'video_playback'], true)
      check('issued playback links are counted for the founder (links and bytes, no viewers)',
        Number(sql('select coalesce(sum(links), 0) from ops.video_delivery_daily')) >= 1 && Number(sql('select coalesce(sum(video_bytes), 0) from ops.video_delivery_daily')) > 0)
    }

    // 5. The server's own check, deletion and the pause.
    {
      const t = await fn(tV, 'video-begin', { bytes: readFileSync(path.join(FIXTURES, 'hevc-720p-1s.mp4')).length, durationMs: 1000, purpose: 'post' })
      const ticket = await t.json()
      const file = readFileSync(path.join(FIXTURES, 'hevc-720p-1s.mp4'))
      const md = (o) => Object.entries(o).map(([k, v]) => `${k} ${Buffer.from(v).toString('base64')}`).join(',')
      const create = await fetch(`${API}/storage/v1/upload/resumable/sign`, {
        method: 'POST',
        headers: { 'x-signature': ticket.token, 'Tus-Resumable': '1.0.0', 'Upload-Length': String(file.length), 'Upload-Metadata': md({ bucketName: 'post-videos', objectName: ticket.path, contentType: 'video/mp4' }) },
      })
      const patch = await fetch(create.headers.get('location'), { method: 'PATCH', headers: { 'x-signature': ticket.token, 'Tus-Resumable': '1.0.0', 'Upload-Offset': '0', 'Content-Type': 'application/offset+octet-stream' }, body: file })
      const other = await fetch(`${API}/storage/v1/upload/resumable/sign`, {
        method: 'POST',
        headers: { 'x-signature': ticket.token, 'Tus-Resumable': '1.0.0', 'Upload-Length': '10', 'Upload-Metadata': md({ bucketName: 'post-videos', objectName: `${V.id}/somewhere-else.mp4`, contentType: 'video/mp4' }) },
      })
      check('the signed token uploads only the one path the database chose', create.status === 201 && patch.status === 204 && other.status >= 400, `${create.status} ${patch.status} ${other.status}`)
      const verify = await fn(tV, 'video-verify', { uploadId: ticket.uploadId })
      const vb = await verify.json()
      check('the server reads the stored HEVC file and refuses it', verify.status === 422 && vb.error === 'video_codec', `${verify.status} ${vb.error}`)
      check('the refused file is queued for deletion and can never be published',
        sql(`select status from social.media_uploads where id = '${ticket.uploadId}'`) === 'failed'
          && sql(`select count(*) from ops.media_deletions where bucket = 'post-videos' and path = '${ticket.path}'`) === '1')
      const other2 = await fn(await tokenFor(W.email), 'video-verify', { uploadId: ticket.uploadId })
      check("another member can't check, or learn about, someone else's upload", other2.status === 404)

      // The author deletes the post: both files are queued, then cleaned up by the server.
      const ctx = await newContext(browser)
      const page = await ctx.newPage()
      await signIn(page, V.email)
      await page.goto(`${APP}/app/post/${postId}`)
      await page.getByRole('button', { name: /Delete/ }).first().click()
      const confirm = page.getByRole('button', { name: /^Delete( post)?$/ })
      if (await confirm.count()) await confirm.last().click()
      for (let i = 0; i < 40 && sql(`select deleted_at is null from social.posts where id = '${postId}'`) === 't'; i++) await sleep(150)
      const paths = sql(`select u.full_path || ',' || u.feed_path from social.post_media m join social.media_uploads u on u.id = m.upload_id where m.post_id = '${postId}'`).split(',')
      check('deleting the video post queues the video and its poster in post-videos',
        sql(`select count(*) from ops.media_deletions where bucket = 'post-videos' and path in ('${paths[0]}', '${paths[1]}')`) === '2')
      for (let i = 0; i < 40 && objects(`name in ('${paths[0]}', '${paths[1]}')`) !== '0'; i++) await sleep(250)
      check('the server removes both files from Storage (the cleanup after a delete)', objects(`name in ('${paths[0]}', '${paths[1]}')`) === '0')
      await ctx.close()

      // Pausing new uploads refuses the next upload at once.
      setSwitch(['video_posts'], false)
      const begin = await fn(tV, 'video-begin', { bytes: 1000, durationMs: 1000, purpose: 'post' })
      check('pausing new video uploads refuses uploads at once', begin.status === 403)
    }

    check('no Content Security Policy violations', csp.length === 0, csp.slice(0, 2).join(' | '))
  } catch (e) {
    failures++
    console.log(`FAIL  the video journey stopped: ${String(e && e.stack ? e.stack : e).slice(0, 600)}`)
  } finally {
    await browser.close()
  }
  console.log(failures === 0 ? 'Video journey passed' : `Video journey: ${failures} failure(s)`)
  process.exit(failures === 0 ? 0 : 1)
})()
