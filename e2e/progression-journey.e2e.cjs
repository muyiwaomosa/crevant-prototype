// Progression (20261217000000), all SIMULATED, in a real browser against a
// LOCAL Supabase with the production security headers:
//
//  1. off by default: My Split shows no goals;
//  2. the founder switches it on and sets the creator goal values in the
//     Control Center, each with a reason, recorded as a version;
//  3. a creator sees her progress and her simulated share locked; once she
//     meets every goal she is Under review, still locked;
//  4. the founder approves her after review and settles (a simulated
//     statement); she sees Qualified and Settled; the switch goes off again.
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
const PASSWORD = 'Progress-Journey-42-pass'
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
  sql(`select ops.grant_member_access('${body.id}', 'tester', 'progression-journey')`)
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
    email = `pg-f-${RUN}@example.test`
    id = await createMember(email, `pgf${RUN}`, 'Fay Founder')
    sql(`select ops.set_launch_founder('progression-journey', '${id}', 'SET THE LAUNCH FOUNDER')`)
    sql(`select ops.grant_member_access('${id}', 'founder', 'progression-journey')`)
  } else {
    email = sql(`select email from auth.users where id = '${id}'`)
    // Local test database only: give the existing founder this journey's password.
    const r = await fetch(`${API}/auth/v1/admin/users/${id}`, { method: 'PUT', headers: adminHeaders, body: JSON.stringify({ password: PASSWORD }) })
    if (!r.ok) throw new Error('could not set the founder password')
    sql(`select ops.grant_member_access('${id}', 'founder', 'progression-journey')`)
  }
  sql(`insert into social.profile_details (user_id, onboarded_at) values ('${id}', now()) on conflict (user_id) do nothing`)
  return { id, email }
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
    await page.getByRole('button', { name: 'Continue' }).click()
    await page.getByRole('button', { name: 'Go to my feed' }).click()
  }
  await home.waitFor()
}

/** The My Split face with its breakdown opened ("What do these mean?"). */
async function splitBreakdown(page, APP) {
  await page.goto(`${APP}/app/split`)
  await page.getByTestId('split-explain').locator('summary').click()
  return (await page.getByTestId('earnings-creator').innerText()).replace(/\s+/g, ' ')
}

;(async () => {
  const browser = await chromium.launch({
    args: ['--disable-features=LocalNetworkAccessChecks,BlockInsecurePrivateNetworkRequests,PrivateNetworkAccessSendPreflights'],
  })
  const email = (k) => `pg-${k}-${RUN}@example.test`
  // Used to switch progression off again at the end, even on failure.
  let founderToken = null
  try {
    const f = await founderAccount()
    founderToken = await tokenFor(f.email)
    // Cleo creates; Fern and Gus keep her in their Cliques; Fern comments meaningfully.
    const c = await createMember(email('c'), `pgc${RUN}`, 'Cleo Creator')
    const fern = await createMember(email('n'), `pgfern${RUN}`, 'Fern Fan')
    const gus = await createMember(email('g'), `pggus${RUN}`, 'Gus Fan')
    for (const id of [c, fern, gus]) sql(`insert into social.profile_details (user_id, onboarded_at) values ('${id}', now()) on conflict (user_id) do nothing`)
    const post = sql(`insert into social.posts (author_id, body) values ('${c}', 'Morning light over the harbour, journey ${RUN}') returning id`)
    sql(`insert into social.follows (follower_id, creator_id) values ('${fern}', '${c}'), ('${gus}', '${c}')`)
    sql(`insert into social.clique_members (fan_id, creator_id) values ('${fern}', '${c}')`)
    sql(`insert into social.comments (post_id, author_id, body) values ('${post}', '${fern}', 'This picture made my whole morning better, thank you.')`)
    // An earlier post, saved by Fern the week it went up: Fern returns in two weeks.
    const older = sql(`insert into social.posts (author_id, body, created_at) values ('${c}', 'Harbour at dusk, journey ${RUN}', now() - interval '9 days') returning id`)
    sql(`insert into social.saves (member_id, post_id, saved_at) values ('${fern}', '${older}', now() - interval '9 days')`)
    // Simulated content advertising revenue attributed to Cleo, in a month long past.
    const rev = await rpc(founderToken, 'app_founder_record_sim_revenue', { p_month: '2004-02-01', p_kind: 'content_ad', p_creator: c, p_post: post, p_net_cents: 10000, p_note: 'progression journey' })
    check('the founder records simulated revenue for Cleo', rev.status === 200, JSON.stringify(rev.body))

    // 1. Off by default: Cleo's My Split has no goals.
    {
      const ctx = await newContext(browser)
      const page = await ctx.newPage()
      await signIn(page, email('c'))
      await page.goto(`${APP}/app/split`)
      await page.getByRole('heading', { name: 'How My Split works' }).waitFor()
      check('with the switch off, My Split shows no goals', (await page.getByTestId('split-progression').count()) === 0)
      await ctx.close()
    }

    // 2. The founder switches progression on and sets the creator goals, with reasons.
    {
      const ctx = await newContext(browser)
      const page = await ctx.newPage()
      await signIn(page, f.email)
      await page.goto(`${APP}/app/control`)
      const sw = page.getByTestId('switches-panel')
      await sw.getByLabel('Reason').fill('progression journey: try the goals')
      await sw.getByRole('button', { name: 'Turn progression on' }).click()
      await sw.getByText('Progression: On').waitFor()
      check('the switch change is recorded with its reason',
        sql("select reason from ops.feature_switch_events where feature = 'progression' order by id desc limit 1") === 'progression journey: try the goals')
      const form = page.getByTestId('goal-form-creator')
      // The approved SP-PRG-001 benchmarks are in force (20 posts, 100 followers, ...);
      // this local journey records a test version Cleo can reach, as the founder could.
      await form.getByText(/In force since .*: SP-PRG-001 v1\.0 approved creator benchmarks/).waitFor()
      for (const [label, v] of [['Publish original posts', '1'], ['Post in different weeks (last 28 days)', '1'], ['Reach genuine followers', '2'], ['Be in members’ Cliques', '2'], ['Have supporters who come back (last 28 days)', '1']]) {
        await form.getByLabel(label).fill(v)
      }
      await form.getByLabel('Reason').fill('progression journey goals')
      await form.getByRole('button', { name: 'Save creator goals' }).click()
      await page.getByText('Saved as a new version. Members already qualified stay qualified.').waitFor()
      await page.getByTestId('goal-form-creator').getByText(/In force since .*: progression journey goals\./).waitFor()
      check('the goal values are saved as a version by the founder', sql("select count(*) from sim.goal_versions where reason = 'progression journey goals' and set_by like 'founder:%'") === '1')
      await screenChecks(page, 'the Control Center with the goals panel')
      await ctx.close()
    }

    // 3. Cleo: 4 of 5 goals, her share locked; then a second Clique member, and it unlocks.
    {
      const ctx = await newContext(browser)
      const page = await ctx.newPage()
      await signIn(page, email('c'))
      const e = await splitBreakdown(page, APP)
      const hero = (await page.getByTestId('split-hero').innerText()).replace(/\s+/g, ' ')
      check('My Split opens on her split: $40.00 as a creator, locked, Simulated', /Simulated/.test(hero) && /\$40\.00/.test(hero) && /Locked \$40\.00/.test(hero), hero)
      check('Next for you names her nearest goal and one action', /Be in members’ Cliques: 1 of 2/.test(await page.getByTestId('next-for-you').innerText()) && (await page.getByTestId('next-for-you').getByRole('link', { name: 'Post something your supporters will value' }).count()) === 1)
      check('no allocation percentage is shown', !/\d+\s*%/.test(await page.getByTestId('split-progression').innerText()))
      await page.goto(`${APP}/app/split?face=goals`)
      const card = page.getByTestId('goals-creator')
      await card.waitFor()
      const t = (await card.innerText()).replace(/\s+/g, ' ')
      check('Cleo sees 4 of 5 creator goals and the next step', /4 of 5/.test(t) && /Next: be in members’ cliques\./.test(t), t)
      check('her simulated share is accumulated and locked, marked Simulated', /Simulated/i.test(e) && /Accumulated \$40\.00 Locked \$40\.00 Unlocked \$0\.00/.test(e), e)
      // Optional, for a person to look at (SHOTS=<directory>); never in CI.
      if (process.env.SHOTS) {
        await page.setViewportSize({ width: 390, height: 1400 })
        await page.screenshot({ path: path.join(process.env.SHOTS, 'my-split-goals.png'), fullPage: true })
        await page.setViewportSize({ width: 1280, height: 900 })
      }
      await screenChecks(page, 'My Split with goals')
      sql(`insert into social.clique_members (fan_id, creator_id) values ('${gus}', '${c}')`)
      await page.reload()
      await page.getByTestId('goals-creator-badge').getByText('Under review').waitFor()
      const e2 = await splitBreakdown(page, APP)
      check('meeting every goal puts her Under review, her share still locked', /Locked \$40\.00 Unlocked \$0\.00/.test(e2), e2)
      check('the goals-met record has its date and goal version', sql(`select count(*) from sim.qualifications where member_id = '${c}' and version_id = (select max(id) from sim.goal_versions where audience = 'creator')`) === '1')
      await ctx.close()
    }

    // 4. The founder approves after review, settles (simulated), and Cleo sees it.
    {
      const ctx = await newContext(browser)
      const page = await ctx.newPage()
      await signIn(page, f.email)
      await page.goto(`${APP}/app/control`)
      const review = page.getByTestId('progression-review')
      const row = review.getByTestId('review-row').filter({ hasText: `@pgc${RUN}` })
      await row.waitFor()
      // A targeted hold through the form (review step, then confirm), then released.
      const gov = page.getByTestId('governance-form')
      await gov.getByLabel('Member username').fill(`pgc${RUN}`)
      await gov.getByLabel('Revenue entry number').fill(String(rev.body))
      await gov.getByLabel('Reason (internal)').fill('journey: checking one entry')
      await gov.getByLabel('Message the member will see').fill('One advertising entry is being checked.')
      await gov.getByRole('button', { name: 'Review' }).click()
      await gov.getByTestId('governance-confirm').getByRole('button', { name: 'Confirm and record' }).click()
      await page.getByText('Hold recorded.').waitFor()
      check('the hold is recorded with its reason and member message',
        sql(`select count(*) from sim.financial_holds where member_id = '${c}' and scope = 'creator_entry' and member_message = 'One advertising entry is being checked.'`) === '1')
      await screenChecks(page, 'the Control Center with the holds form')
      await review.getByLabel('Decision reason').fill('journey: entry checked')
      await review.getByTestId('hold-row').filter({ hasText: `@pgc${RUN}` }).getByRole('button', { name: 'Release' }).click()
      await page.getByText('Hold released.').waitFor()
      await review.getByLabel('Decision reason').fill('integrity review passed (journey)')
      await row.getByRole('button', { name: 'Approve' }).click()
      await page.getByText(`Approved @pgc${RUN}.`).waitFor()
      check('the approval is recorded with its reason', sql(`select reason from sim.qualification_decisions where member_id = '${c}' order by id desc limit 1`) === 'integrity review passed (journey)')
      const panel = page.getByTestId('goals-panel')
      await panel.getByLabel('Reason').last().fill('progression journey statement')
      await panel.getByRole('button', { name: 'Settle (simulated)' }).click()
      await panel.getByText(/Settled \(simulated\): \d+ creator share\(s\)/).waitFor()
      check('Cleo’s share is settled once, as a simulated statement',
        sql(`select count(*) from sim.creator_share_states s join sim.revenue_entries r on r.id = s.revenue_entry_id where r.creator_id = '${c}' and s.state = 'settled'`) === '1')
      await screenChecks(page, 'the Control Center with the review')
      await ctx.close()
    }
    {
      const ctx = await newContext(browser)
      const page = await ctx.newPage()
      await signIn(page, email('c'))
      await page.goto(`${APP}/app/split?face=goals`)
      await page.getByTestId('goals-creator-badge').getByText('Qualified').waitFor()
      check('optional growth guidance is shown once qualified', /Keep growing \(optional\)/.test(await page.getByTestId('growth-creator').innerText()))
      const e3 = await splitBreakdown(page, APP)
      check('Cleo sees Qualified and her share Settled (simulated)', /Locked \$0\.00 Unlocked \$0\.00 Settled \$40\.00/.test(e3), e3)
      await screenChecks(page, 'My Split when qualified')
      await ctx.close()
    }
    // Switch off again: progress hidden, records kept.
    const off = await rpc(founderToken, 'app_founder_set_switch', { p_feature: 'progression', p_enabled: false, p_reason: 'progression journey: done' })
    check('the founder switches progression off again; every record is kept', off.status === 204 || off.status === 200,
      String(off.status))
    check('records kept after switching off', sql(`select count(*) from sim.qualification_decisions where member_id = '${c}'`) === '1')
    check('nothing in the feed or discovery reads progression', sql("select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname ~ '^app_(feed|discover|home)' and p.prosrc ~ 'sim\\.(goal_|qualifications|creator_share_states|allocation_states)'") === '0')
    check('no Content Security Policy violations', csp.length === 0, csp.slice(0, 2).join(' | '))
  } catch (e) {
    failures++
    console.log(`FAIL  progression journey stopped: ${e && e.message}`)
  } finally {
    // Leave the switch off for the journeys that follow.
    try { if (founderToken) await rpc(founderToken, 'app_founder_set_switch', { p_feature: 'progression', p_enabled: false, p_reason: 'progression journey: cleanup' }) } catch {}
    await browser.close()
  }
  console.log(`Progression journey: ${failures === 0 ? 'all passed' : `${failures} failed`}`)
  process.exit(failures === 0 ? 0 : 1)
})()
