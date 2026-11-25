// Governance (20261206000000), in a real browser against a LOCAL Supabase with
// the production security headers:
//
//  1. a member reports someone's comment, and blocks another member (who then
//     can't see them, and isn't told);
//  2. a moderator hides the comment from the report and gives a warning from
//     the account panel (the ladder's first step);
//  3. the author sees both notices (never who reported), and appeals;
//  4. the moderator who hid it can't decide the appeal; a second moderator
//     reverses it, and the comment is visible again;
//  5. a restriction stops posting, and Home says so.
// WCAG 2.2 AA, 320 and 390 px, no CSP violations. Run by scripts/e2e/auth-journey.sh.
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

const vercel = JSON.parse(readFileSync(path.join(__dirname, '..', 'vercel.json'), 'utf8'))
const SECURITY_HEADERS = Object.fromEntries(
  vercel.headers.find((h) => h.source === '/(.*)').headers.map((h) => [h.key.toLowerCase(), h.value.replace(/https:\/\/[a-z0-9]+\.supabase\.co/g, API)]),
)
const RUN = String(Date.now()).slice(-7)
const PASSWORD = 'Governance-Journey-42-pass'
let failures = 0
const check = (name, ok, detail = '') => {
  if (!ok) failures++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`)
}
const sql = (q) => execFileSync('psql', [DB, '-v', 'ON_ERROR_STOP=1', '-qAt', '-c', q]).toString().trim()
const adminHeaders = { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, 'Content-Type': 'application/json' }

const AXE = readFileSync(path.join(__dirname, '..', 'node_modules', 'axe-core', 'axe.min.js'), 'utf8')
async function axe(page) {
  await page.evaluate(() => Promise.all(document.getAnimations().map((a) => a.finished.catch(() => null))))
  await page.evaluate(AXE)
  return page.evaluate(async () => (await window.axe.run(document, { runOnly: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] })).violations.map((v) => `${v.id} x${v.nodes.length} [${v.nodes.map((n) => n.target.join(' ')).join('; ').slice(0, 160)}]`))
}
async function noSidewaysScroll(page, label) {
  const desktop = page.viewportSize()
  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 760 })
    const sideways = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
    check(`at ${width}px, ${label} has no sideways scrolling`, sideways <= 0, `${sideways}px`)
  }
  if (desktop) await page.setViewportSize(desktop)
}
async function screenChecks(page, label) {
  const v = await axe(page)
  check(`${label} has no WCAG 2.2 AA violations`, v.length === 0, v.join(', '))
  await noSidewaysScroll(page, label)
}

// A member with a finished profile: created, granted, named, and set up.
async function createMember(email, username, displayName) {
  const r = await fetch(`${API}/auth/v1/admin/users`, { method: 'POST', headers: adminHeaders, body: JSON.stringify({ email, password: PASSWORD, email_confirm: true }) })
  const body = await r.json()
  if (!r.ok) throw new Error(`could not create ${email}: ${JSON.stringify(body)}`)
  sql(`select ops.grant_member_access('${body.id}', 'tester', 'governance-journey')`)
  sql(`update public.profiles set username = '${username}', display_name = '${displayName}' where id = '${body.id}'`)
  return body.id
}
async function tokenFor(email) {
  const r = await fetch(`${API}/auth/v1/token?grant_type=password`, { method: 'POST', headers: { apikey: PUB, 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password: PASSWORD }) })
  return (await r.json()).access_token
}
async function rpc(token, fn, args = {}) {
  const r = await fetch(`${API}/rest/v1/rpc/${fn}`, {
    method: 'POST',
    headers: { apikey: PUB, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(args),
  })
  const text = await r.text()
  return { status: r.status, body: text ? JSON.parse(text) : null }
}

const csp = []
const consoleErrors = []
async function newContext(browser) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } })
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
  ctx.on('console', (m) => {
    if (/Content Security Policy/i.test(m.text())) csp.push(m.text())
    if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) consoleErrors.push(m.text())
  })
  return ctx
}

async function signIn(page, email) {
  await page.goto(`${APP}/sign-in?next=%2Fapp`)
  await page.getByLabel('Email address', { exact: true }).fill(email)
  await page.getByLabel('Password', { exact: true }).fill(PASSWORD)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await page.waitForURL(`${APP}/app`)
  // Profile details are not set for these accounts: skip the optional steps once.
  const skip = page.getByRole('button', { name: 'Skip the rest' })
  const home = page.getByRole('heading', { name: 'Home' })
  await Promise.race([skip.waitFor(), home.waitFor()])
  if (await skip.isVisible().catch(() => false)) {
    await skip.click()
    await page.getByRole('button', { name: 'Go to my feed' }).click()
  }
  await home.waitFor()
}




;(async () => {
  const browser = await chromium.launch({
    args: ['--disable-features=LocalNetworkAccessChecks,BlockInsecurePrivateNetworkRequests,PrivateNetworkAccessSendPreflights'],
  })
  try {
    const email = (k) => `gv-${k}-${RUN}@example.test`
    const ana = await createMember(email('a'), `gva${RUN}`, 'Ana Member')
    const rex = await createMember(email('r'), `gvr${RUN}`, 'Rex Rules')
    const bo = await createMember(email('b'), `gvb${RUN}`, 'Bo Blocked')
    const mo = await createMember(email('m'), `gvm${RUN}`, 'Mo Moderator')
    const eve = await createMember(email('e'), `gve${RUN}`, 'Eve Reviewer')
    sql(`select ops.grant_moderator('${mo}', 'governance-journey', 'journey')`)
    sql(`select ops.grant_moderator('${eve}', 'governance-journey', 'journey')`)
    const tA = await tokenFor(email('a'))
    const tR = await tokenFor(email('r'))
    const tB = await tokenFor(email('b'))
    const tM = await tokenFor(email('m'))
    const post = (await rpc(tA, 'app_create_post', { p_body: `Ana asks a question ${RUN}` })).body
    const comment = (await rpc(tR, 'app_add_comment', { p_post: post, p_body: `What a stupid question, honestly ${RUN}` })).body
    await rpc(tB, 'app_follow', { p_creator: ana })
    await rpc(tA, 'app_follow', { p_creator: bo })

    // 1. Ana reports the comment and blocks Bo.
    {
      const ctx = await newContext(browser)
      const page = await ctx.newPage()
      await signIn(page, email('a'))
      await page.goto(`${APP}/app/post/${post}`)
      await page.getByRole('button', { name: 'Report this comment by Rex Rules' }).click()
      const dialog = page.getByRole('dialog', { name: 'Report this comment' })
      await dialog.waitFor()
      await dialog.getByRole('radio', { name: 'Harassment or bullying' }).check()
      await dialog.getByRole('button', { name: 'Send report' }).click()
      await dialog.getByTestId('report-sent').waitFor()
      check('a comment can be reported', sql(`select count(*) from ops.content_reports where target_type = 'comment' and target_id = '${comment}' and status = 'open'`) === '1')
      await dialog.getByRole('button', { name: 'Done' }).click()

      await page.goto(`${APP}/app/u/gvb${RUN}`)
      await page.getByRole('button', { name: 'Block Bo Blocked' }).click()
      const confirm = page.getByRole('dialog', { name: 'Block Bo Blocked?' })
      await confirm.waitFor()
      await screenChecks(page, 'the block confirmation')
      await confirm.getByRole('button', { name: 'Block' }).click()
      await page.getByTestId('blocked-profile').waitFor()
      check('the profile then says you blocked them, with Unblock', (await page.getByTestId('blocked-profile').innerText()).includes('You blocked Bo Blocked'))
      check('the follows between them ended', sql(`select count(*) from social.follows where (follower_id = '${ana}' and creator_id = '${bo}') or (follower_id = '${bo}' and creator_id = '${ana}')`) === '0')
      await ctx.close()
    }
    const boSees = await rpc(tB, 'app_member', { p_username: `gva${RUN}` })
    check('the blocked member can no longer see Ana', Array.isArray(boSees.body) && boSees.body.length === 0, JSON.stringify(boSees.body))
    const boBlocks = await rpc(tB, 'app_my_blocks')
    check('the blocked member is not told', Array.isArray(boBlocks.body) && boBlocks.body.length === 0)

    // 2. Mo hides the comment and gives a warning.
    const reportId = sql(`select id from ops.content_reports where target_type = 'comment' and target_id = '${comment}'`)
    {
      const ctx = await newContext(browser)
      const page = await ctx.newPage()
      await signIn(page, email('m'))
      await page.goto(`${APP}/app/moderation/${reportId}`)
      await page.getByRole('heading', { name: 'Harassment or bullying: comment' }).waitFor()
      await page.getByRole('button', { name: 'Hide', exact: true }).click()
      await page.getByText('Hidden. Members can no longer see it.').waitFor()
      await page.getByTestId('member-record').waitFor()
      await screenChecks(page, 'the report page with the account panel')
      await page.getByRole('button', { name: 'Give a warning' }).click()
      await page.getByText(`Warning recorded. @gvr${RUN} has been notified.`).waitFor()
      check('the warning is recorded', sql(`select count(*) from ops.enforcements where member_id = '${rex}' and level = 'warning'`) === '1')
      await ctx.close()
    }
    check('the hidden comment is gone for members', sql(`select hidden_at is not null from social.comments where id = '${comment}'`) === 't')

    // 3. Rex sees the notices and appeals.
    {
      const ctx = await newContext(browser)
      const page = await ctx.newPage()
      await signIn(page, email('r'))
      const banner = page.getByTestId('governance-banner')
      await banner.waitFor()
      check('Home says there are new notices', /2 new notices/.test(await banner.innerText()), await banner.innerText())
      await banner.getByRole('link', { name: 'See your notices' }).click()
      const hidden = page.getByTestId('notice').filter({ hasText: 'We hid your comment' })
      await hidden.waitFor()
      const all = await page.locator('main').innerText()
      check('the notices never name the reporter', !all.includes('Ana Member') && !all.includes(`gva${RUN}`))
      check('the notice says why', (await hidden.innerText()).includes('harassment or bullying'))
      await screenChecks(page, 'the notices page')
      await hidden.getByRole('button', { name: 'Appeal' }).click()
      await hidden.getByLabel('Why should we look again?').fill('I was frustrated, but I did not mean it as an insult.')
      await hidden.getByRole('button', { name: 'Send appeal' }).click()
      await page.getByTestId('notice').filter({ hasText: 'Appeal sent' }).waitFor()
      check('the appeal is recorded once', sql(`select count(*) from ops.appeals where member_id = '${rex}'`) === '1')
      await ctx.close()
    }

    // 4. Mo took the original action, so Mo can't decide the appeal; Eve reverses it.
    {
      const ctx = await newContext(browser)
      const page = await ctx.newPage()
      await signIn(page, email('m'))
      await page.goto(`${APP}/app/moderation/appeals`)
      const list = page.getByRole('list', { name: 'Open appeals' })
      await list.waitFor()
      const mine = list.getByRole('listitem').filter({ hasText: `@gvr${RUN}` })
      check('the moderator is told another moderator should decide', (await mine.innerText()).includes('Another moderator should decide this one'))
      await screenChecks(page, 'the appeals page')
      check('the moderator who acted cannot decide the appeal', await mine.getByRole('button', { name: 'Reverse' }).isDisabled())
      const direct = await rpc(tM, 'app_mod_decide_appeal', { p_appeal: sql(`select id from ops.appeals where member_id = '${rex}'`), p_reverse: true, p_note: 'trying anyway' })
      check('the database refuses it too', direct.status >= 400 && /needs_another_moderator/.test(JSON.stringify(direct.body)), JSON.stringify(direct.body))
      await ctx.close()
    }
    {
      const ctx = await newContext(browser)
      const page = await ctx.newPage()
      await signIn(page, email('e'))
      await page.goto(`${APP}/app/moderation/appeals`)
      const list = page.getByRole('list', { name: 'Open appeals' })
      await list.waitFor()
      const item = list.getByRole('listitem').filter({ hasText: `@gvr${RUN}` })
      check('another moderator is not warned', !(await item.innerText()).includes('You took the original action'))
      await item.getByRole('button', { name: 'Reverse' }).click()
      await page.waitForFunction((u) => !document.body.innerText.includes(u) || document.body.innerText.includes('No open appeals'), `@gvr${RUN}`)
      check('a different moderator reverses the appeal', sql(`select status from ops.appeals where member_id = '${rex}'`) === 'reversed')
      await ctx.close()
    }
    check('reversing restores the comment', sql(`select hidden_at is null and deleted_at is null from social.comments where id = '${comment}'`) === 't')
    const shown = await rpc(tA, 'app_comments', { p_post: post })
    check('members see the restored comment again', Array.isArray(shown.body) && shown.body.some((c) => c.id === comment))

    // 5. A restriction (after the warning) stops posting, and Home says so.
    const restricted = await rpc(tM, 'app_mod_enforce', { p_member: rex, p_level: 'restriction', p_reason: 'harassment', p_days: 3 })
    check('a restriction follows the warning', restricted.status === 200, JSON.stringify(restricted.body))
    const attempt = await rpc(tR, 'app_create_post', { p_body: 'Trying to post anyway' })
    check('a restricted member cannot post', attempt.status >= 400 && /restricted/.test(JSON.stringify(attempt.body)), JSON.stringify(attempt.body))
    {
      const ctx = await newContext(browser)
      const page = await ctx.newPage()
      await signIn(page, email('r'))
      const banner = page.getByTestId('governance-banner')
      await banner.waitFor()
      check('Home says the account is restricted and until when', /restricted until .*can't post, comment or repost/.test(await banner.innerText()), await banner.innerText())
      await ctx.close()
    }

    check('no Content Security Policy violations', csp.length === 0, csp.slice(0, 2).join(' | '))
  } catch (e) {
    failures++
    console.log(`FAIL  governance journey stopped: ${e && e.message}`)
  } finally {
    await browser.close()
  }
  console.log(`Governance journey: ${failures === 0 ? 'all passed' : `${failures} failed`}`)
  process.exit(failures === 0 ? 0 : 1)
})()
