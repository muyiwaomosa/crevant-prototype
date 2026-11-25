// Contributions and rewards (20261205000000), all SIMULATED, in a real browser
// against a LOCAL Supabase with the production security headers:
//
//  1. a member earns Connection Points for thoughtful comments, saves and
//     reposts (likes and their own content earn nothing), sees them in My
//     Split and its History, and a deleted comment shows as a reversal;
//  2. a second person joins through a member's referral link, confirms their
//     email and makes their own first follow: a qualified referral, waiting
//     for the founder's review;
//  3. the founder approves it, records simulated revenue (content and feed
//     advertising) and sees the 40/20/40 reconciliation add up;
//  4. the referrer sees the simulated value of their redeemable points, the
//     creator sees their simulated share;
//  5. the founder closes the month: it reconciles to the cent, only once.
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
const MAIL = env('MAILPIT_URL')
const SERVICE = env('SERVICE_ROLE_KEY')
const PUB = env('PUBLISHABLE_KEY')
if (!/^http:\/\/(127\.0\.0\.1|localhost):/.test(API)) throw new Error('Refusing: not a local Supabase')
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const vercel = JSON.parse(readFileSync(path.join(__dirname, '..', 'vercel.json'), 'utf8'))
const SECURITY_HEADERS = Object.fromEntries(
  vercel.headers.find((h) => h.source === '/(.*)').headers.map((h) => [h.key.toLowerCase(), h.value.replace(/https:\/\/[a-z0-9]+\.supabase\.co/g, API)]),
)
const RUN = String(Date.now()).slice(-7)
const PASSWORD = 'Rewards-Journey-42-pass'
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
  sql(`select ops.grant_member_access('${body.id}', 'tester', 'rewards-journey')`)
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


async function emailLink(email, type) {
  for (let i = 0; i < 80; i++) {
    const r = await fetch(`${MAIL}/api/v1/search?query=${encodeURIComponent(`to:"${email}"`)}`).then((x) => x.json())
    for (const m of r.messages || []) {
      const full = await fetch(`${MAIL}/api/v1/message/${m.ID}`).then((x) => x.json())
      const href = ((full.HTML || full.Text).match(/href="([^"]+)"/) || [])[1]
      if (href && href.replace(/&amp;/g, '&').includes(`type=${type}`)) return href.replace(/&amp;/g, '&')
    }
    await sleep(250)
  }
  throw new Error(`No ${type} email for ${email}`)
}
// The founder: the launch founder if one is already pinned in this database
// (an earlier journey may have done it), otherwise a new account pinned now.
async function founderAccount() {
  let id = sql('select coalesce(founder_user_id::text, \'\') from ops.member_launch_settings')
  let email
  if (!id) {
    email = `rw-f-${RUN}@example.test`
    id = await createMember(email, `rwf${RUN}`, 'Fay Founder')
    sql(`select ops.set_launch_founder('rewards-journey', '${id}', 'SET THE LAUNCH FOUNDER')`)
    sql(`select ops.grant_member_access('${id}', 'founder', 'rewards-journey')`)
  } else {
    email = sql(`select email from auth.users where id = '${id}'`)
    // Local test database only: give the existing founder this journey's password.
    const r = await fetch(`${API}/auth/v1/admin/users/${id}`, { method: 'PUT', headers: adminHeaders, body: JSON.stringify({ password: PASSWORD }) })
    if (!r.ok) throw new Error('could not set the founder password')
    sql(`select ops.grant_member_access('${id}', 'founder', 'rewards-journey')`)
  }
  sql(`insert into social.profile_details (user_id, onboarded_at) values ('${id}', now()) on conflict (user_id) do nothing`)
  return { id, email }
}
const points = async (page) => (await page.getByTestId('split-points').innerText()).replace(/\s+/g, ' ')

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
    const email = (k) => `rw-${k}-${RUN}@example.test`
    const c = await createMember(email('c'), `rwc${RUN}`, 'Cleo Creator')
    const m = await createMember(email('m'), `rwm${RUN}`, 'Milo Member')
    const r = await createMember(email('r'), `rwr${RUN}`, 'Remi Referrer')
    const f = await founderAccount()
    const tC = await tokenFor(email('c'))
    const tM = await tokenFor(email('m'))
    const post = (await rpc(tC, 'app_create_post', { p_body: `How I plan a monthly budget ${RUN}` })).body
    const post2 = (await rpc(tC, 'app_create_post', { p_body: `Three savings habits ${RUN}` })).body
    const own = (await rpc(tM, 'app_create_post', { p_body: `Milo's own note ${RUN}` })).body
    await rpc(tM, 'app_follow', { p_creator: c })
    const pts = (who) => Number(sql(`select coalesce(sum(points), 0) from sim.points_ledger where member_id = '${who}'`))

    // 1. Milo earns points for real contributions, and sees them.
    {
      const ctx = await newContext(browser)
      const page = await ctx.newPage()
      await signIn(page, email('m'))
      await page.goto(`${APP}/app/post/${post}`)
      await page.getByLabel('Write a comment').fill('This really helped me set up my own monthly plan, thank you.')
      await page.getByRole('button', { name: 'Comment' }).click()
      await page.getByTestId('comment').filter({ hasText: 'This really helped me' }).waitFor()
      await page.getByRole('button', { name: 'Save', exact: true }).first().click()
      await page.getByRole('button', { name: 'Saved (tap to remove)' }).first().waitFor()
      await rpc(tM, 'app_repost', { p_post: post2 })
      await rpc(tM, 'app_like', { p_post: post2 })
      await rpc(tM, 'app_save', { p_post: own })
      check('thoughtful comment 2, save 2 and repost 5 earn 9; a like and your own content earn nothing', pts(m) === 9, String(pts(m)))
      await rpc(tM, 'app_unsave', { p_post: post })
      await rpc(tM, 'app_save', { p_post: post })
      check('saving the same post again earns nothing more', pts(m) === 9, String(pts(m)))
      await page.goto(`${APP}/app/split`)
      await page.getByTestId('split-points').waitFor()
      check('My Split shows the recognized points, and nothing redeemable yet', /Recognized 9 .*Redeemable 0/.test(await points(page)), await points(page))
      check('the simulated disclosure is shown', (await page.getByTestId('split-disclosure').innerText()).includes('simulated'))
      await screenChecks(page, 'My Split')
      await page.getByRole('tab', { name: 'History' }).click()
      const hist = page.getByTestId('points-history')
      await hist.waitFor()
      const h = await hist.innerText()
      check('History lists each contribution with the creator', /Thoughtful comment/.test(h) && /Saved a post/.test(h) && /Reposted/.test(h) && h.includes('Cleo Creator'), h.replace(/\s+/g, ' '))
      // Deleting the comment reverses its points, as a new entry.
      await page.goto(`${APP}/app/post/${post}`)
      await page.getByRole('button', { name: 'Delete comment' }).click()
      await page.getByText('No comments yet.').waitFor()
      check('a deleted comment reverses its points', pts(m) === 7, String(pts(m)))
      await page.goto(`${APP}/app/split`)
      await page.getByRole('tab', { name: 'History' }).click()
      await page.getByTestId('points-history').getByText('Reversed').first().waitFor()
      check('History shows the reversal as its own entry', (await page.getByTestId('points-history').innerText()).includes('-2'))
      await ctx.close()
    }

    // 2. Nia joins through Remi's referral link and makes her own first follow.
    sql("select ops.set_registration_settings('rewards-journey', 'journey: open', false, 200, 25, 5)")
    let refCode
    {
      const ctx = await newContext(browser)
      const page = await ctx.newPage()
      await signIn(page, email('r'))
      await page.goto(`${APP}/app/split`)
      await page.getByRole('tab', { name: 'Opportunities' }).click()
      const link = await page.getByTestId('referral-link').innerText()
      refCode = link.split('/register/')[1]
      check('Remi has a personal referral link', /^[0-9a-f]{16}$/.test(String(refCode)), link)
      await ctx.close()
    }
    const emailN = email('n')
    {
      const ctx = await newContext(browser)
      const page = await ctx.newPage()
      await page.goto(`${APP}/register/${refCode}`)
      await page.getByTestId('register-form').waitFor()
      await page.getByLabel('Email address', { exact: true }).fill(emailN)
      await page.getByLabel('Password', { exact: true }).fill(PASSWORD)
      await page.getByLabel('Confirm password').fill(PASSWORD)
      await page.getByLabel('I confirm that I am 18 or older.').check()
      await page.getByRole('button', { name: 'Create account' }).click()
      await page.getByTestId('register-sent').waitFor()
      await page.goto(await emailLink(emailN, 'email'))
      await page.getByRole('button', { name: 'Continue' }).click()
      await page.waitForURL(`${APP}/app`)
      await page.getByText('Step 1 of 5: Your name').waitFor({ timeout: 15000 })
      await page.getByLabel('Username').fill(`rwn${RUN}`)
      await page.getByLabel('Display name').fill('Nia New')
      await page.getByRole('button', { name: 'Continue' }).click()
      await page.getByRole('button', { name: 'Skip the rest' }).click()
      await page.getByRole('button', { name: 'Go to my feed' }).click()
      await page.getByRole('heading', { name: 'Home' }).waitFor()
      const n = sql(`select id from auth.users where email = '${emailN}'`)
      check('Nia is attributed to Remi', sql(`select kind || '|' || referrer_id from ops.registrations where user_id = '${n}'`) === `referral|${r}`)
      check('joining alone earns Remi nothing yet', pts(r) === 0, String(pts(r)))
      await page.goto(`${APP}/app/u/rwc${RUN}`)
      await page.getByRole('button', { name: /^Follow/ }).first().click()
      await page.waitForFunction(() => /Following/.test(document.body.innerText))
      await ctx.close()
    }
    check('her own first follow makes it a qualified referral, waiting for review (100)',
      sql(`select string_agg(points || ':' || status, ',') from sim.points_ledger where member_id = '${r}'`) === '100:pending_review')
    {
      const ctx = await newContext(browser)
      const page = await ctx.newPage()
      await signIn(page, email('r'))
      await page.goto(`${APP}/app/split`)
      await page.getByTestId('split-points').waitFor()
      check('Remi sees 100 waiting for review, none redeemable yet', /Redeemable 0 From qualified referrals\. 100 waiting for review/.test(await points(page)), await points(page))
      await ctx.close()
    }

    // 3. The founder approves the referral and records simulated revenue.
    const month = sql("select to_char(date_trunc('month', now()) - interval '1 month', 'YYYY-MM')")
    {
      const ctx = await newContext(browser)
      const page = await ctx.newPage()
      await signIn(page, f.email)
      await page.goto(`${APP}/app/split`)
      await page.getByRole('link', { name: 'Founder: review referrals and rewards' }).click()
      const queue = page.getByTestId('referral-queue')
      await queue.waitFor()
      check('the referral waits in the founder queue', (await queue.innerText()).includes(`@rwr${RUN} referred @rwn${RUN}`), await queue.innerText())
      await screenChecks(page, 'the founder rewards page')
      await queue.getByRole('button', { name: `Approve referral by rwr${RUN}` }).click()
      await page.getByText('Nothing waiting.').waitFor()
      check('approved: Remi has 100 redeemable points', sql(`select sim.award_state(id) from sim.points_ledger where member_id = '${r}' and reverses is null`) === 'approved')
      await page.getByLabel('Month').fill(month)
      await page.getByLabel('Creator username').fill(`rwc${RUN}`)
      await page.getByLabel('Net amount ($)').fill('100')
      await page.getByLabel('Note').fill('Journey: content campaign')
      await page.getByRole('button', { name: 'Record simulated revenue' }).click()
      await page.getByText(`Recorded $100.00 of simulated content advertising for ${month}.`).waitFor()
      await page.getByLabel('Kind').selectOption('feed_ad')
      await page.getByLabel('Net amount ($)').fill('50')
      await page.getByLabel('Note').fill('Journey: feed campaign')
      await page.getByRole('button', { name: 'Record simulated revenue' }).click()
      await page.getByText(`Recorded $50.00 of simulated feed advertising for ${month}.`).waitFor()
      const o = (await page.getByTestId('rewards-overview').innerText()).replace(/\s+/g, ' ')
      check('content ads split 40/20/40 and feed ads go to Splitpost; the parts add up to the revenue',
        /Revenue \(net\) \$150\.00 .*Creators \(content ads\) \$40\.00 .*Fan rewards pool \$20\.00 .*Splitpost \(incl\. feed ads\) \$90\.00/.test(o), o)
      await ctx.close()
    }

    // 4. Remi sees the simulated value; Cleo sees her simulated share.
    {
      const ctx = await newContext(browser)
      const page = await ctx.newPage()
      await signIn(page, email('r'))
      await page.goto(`${APP}/app/split`)
      await page.getByTestId('split-points').waitFor()
      check('Remi\'s 100 redeemable points are valued from the simulated pool ($20.00)', /Redeemable 100 .*Simulated \$20\.00/.test(await points(page)), await points(page))
      await ctx.close()
    }
    {
      const ctx = await newContext(browser)
      const page = await ctx.newPage()
      await signIn(page, email('c'))
      await page.goto(`${APP}/app/profile?face=money`)
      const e = page.getByTestId('simulated-earnings')
      await e.waitFor()
      const t = await e.innerText()
      check('Cleo sees her simulated creator share ($40.00), marked Simulated, nothing paid', /Simulated/.test(t) && /\$40\.00/.test(t) && /Nothing is paid during the pilot/.test(t), t.replace(/\s+/g, ' '))
      check('no allocation percentage is shown to members (legal review pending)', !/40\s*%|20\s*%/.test(t))
      await ctx.close()
    }

    // 5. The founder closes the month: it reconciles, once.
    {
      const ctx = await newContext(browser)
      const page = await ctx.newPage()
      await signIn(page, f.email)
      await page.goto(`${APP}/app/split/review`)
      await page.getByLabel('Month').fill(month)
      await page.getByRole('button', { name: 'Close the month (simulated)' }).click()
      await page.getByText(new RegExp(`Closed ${month}: \\$20\\.00 of a \\$20\\.00 pool to 1 members \\(100 points\\)\\. It reconciles to the cent\\.`)).waitFor()
      check('the settlement lines equal the pool to the cent',
        sql(`select (select sum(value_cents) from sim.settlement_lines l join sim.settlements s on s.id = l.settlement_id where s.month = '${month}-01') = (select pool_cents from sim.settlements where month = '${month}-01')`) === 't')
      await page.getByRole('button', { name: 'Close the month (simulated)' }).click()
      await page.getByText('That month is already closed.').waitFor()
      check('a month closes only once', sql(`select count(*) from sim.settlements where month = '${month}-01'`) === '1')
      await ctx.close()
    }
    {
      const ctx = await newContext(browser)
      const page = await ctx.newPage()
      await signIn(page, email('r'))
      await page.goto(`${APP}/app/split`)
      await page.getByTestId('split-points').waitFor()
      check('Remi sees his points allocated in the simulated close', /100 points already allocated in simulated month closes/.test(await points(page)), await points(page))
      await ctx.close()
    }
    check('no money moves: everything lives in the simulated schema', sql("select count(*) from pg_namespace where nspname = 'finance'") === '0')
    check('no Content Security Policy violations', csp.length === 0, csp.slice(0, 2).join(' | '))
  } catch (e) {
    failures++
    console.log(`FAIL  rewards journey stopped: ${e && e.message}`)
  } finally {
    try { sql("select ops.set_registration_settings('rewards-journey', 'journey: done', true)") } catch {}
    await browser.close()
  }
  console.log(`Rewards journey: ${failures === 0 ? 'all passed' : `${failures} failed`}`)
  process.exit(failures === 0 ? 0 : 1)
})()
