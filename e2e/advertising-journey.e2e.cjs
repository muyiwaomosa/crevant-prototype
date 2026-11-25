// Advertising (20261208000000), the advertiser-to-rewards stakeholder journey,
// in a real browser against a LOCAL Supabase with the production security headers:
//
//  1. the founder onboards an advertiser (what they sell, the problem, the
//     outcome, customer needs, objective, conversion action), approves it,
//     creates a campaign and activates it;
//  2. a member chooses a commercial preference and sees a Sponsored ad under a
//     creator's post that says why; their click counts once, after a view;
//  3. a member without preferences sees a contextual ad that says it is not
//     about them, and marks it not relevant; faith content never carries an ad;
//  4. the founder reads the aggregate report (small groups withheld),
//     records verified conversions and attributes simulated revenue: the
//     content share reaches the creator through 40/20/40; ads earn no points.
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
const PASSWORD = 'Advertising-Journey-42-pass'
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
  sql(`select ops.grant_member_access('${body.id}', 'tester', 'ads-journey')`)
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
    email = `ad-f-${RUN}@example.test`
    id = await createMember(email, `adf${RUN}`, 'Fay Founder')
    sql(`select ops.set_launch_founder('ads-journey', '${id}', 'SET THE LAUNCH FOUNDER')`)
    sql(`select ops.grant_member_access('${id}', 'founder', 'ads-journey')`)
  } else {
    email = sql(`select email from auth.users where id = '${id}'`)
    // Local test database only: give the existing founder this journey's password.
    const r = await fetch(`${API}/auth/v1/admin/users/${id}`, { method: 'PUT', headers: adminHeaders, body: JSON.stringify({ password: PASSWORD }) })
    if (!r.ok) throw new Error('could not set the founder password')
    sql(`select ops.grant_member_access('${id}', 'founder', 'ads-journey')`)
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
    await page.getByRole('button', { name: 'Continue' }).click()
    await page.getByRole('button', { name: 'Go to my feed' }).click()
  }
  await home.waitFor()
}





;(async () => {
  const browser = await chromium.launch({
    args: ['--disable-features=LocalNetworkAccessChecks,BlockInsecurePrivateNetworkRequests,PrivateNetworkAccessSendPreflights'],
  })
  try {
    const email = (k) => `ad-${k}-${RUN}@example.test`
    const c = await createMember(email('c'), `adc${RUN}`, 'Cara Creator')
    const m = await createMember(email('m'), `adm${RUN}`, 'Max Member')
    const n = await createMember(email('n'), `adn${RUN}`, 'Noor Nopref')
    const f = await founderAccount()
    const tC = await tokenFor(email('c'))
    const moneyPost = (await rpc(tC, 'app_create_post', { p_body: `My budgeting routine ${RUN}` })).body
    await rpc(tC, 'app_set_post_topic', { p_post: moneyPost, p_topic: 'money' })
    const faithPost = (await rpc(tC, 'app_create_post', { p_body: `A reflection ${RUN}` })).body
    await rpc(tC, 'app_set_post_topic', { p_post: faithPost, p_topic: 'faith' })

    // The founder's managed creative: an image uploaded to the ad-creatives bucket
    // (in Supabase Storage; here through the Storage API with the local service key).
    const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAFklEQVR42mNk+M9Qz0AEYBxVSF+FAP5FDvcfRYWgAAAAAElFTkSuQmCC', 'base64')
    const imgPath = `journey-${RUN}.png`
    const up = await fetch(`${API}/storage/v1/object/ad-creatives/${imgPath}`, { method: 'POST', headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, 'Content-Type': 'image/png' }, body: PNG })
    check('the creative is uploaded to the ad-creatives bucket', up.ok, String(up.status))

    // 1. The founder onboards, approves and launches.
    {
      const ctx = await newContext(browser)
      const page = await ctx.newPage()
      await signIn(page, f.email)
      await page.goto(`${APP}/app/profile`)
      await page.getByRole('link', { name: 'Advertising' }).click()
      await page.getByRole('heading', { name: 'Advertising' }).waitFor()
      await page.getByLabel('Advertiser name').fill(`Budgetly ${RUN}`)
      await page.getByLabel('Website').fill('https://budgetly.example')
      await page.getByLabel('What they sell').fill('A budgeting app')
      await page.getByLabel('Problem it solves').fill('Hard to see where money goes each month')
      await page.getByLabel('Desired customer outcome').fill('A clear monthly plan')
      await page.getByLabel('Customer needs it meets').fill('People planning their monthly spending')
      await page.getByLabel('Campaign objective').selectOption('sign_ups')
      await page.getByLabel('Conversion action').fill('Free account sign-up')
      await page.getByRole('group', { name: 'Commercial categories', exact: true }).getByLabel('Software & apps').check()
      await page.getByRole('button', { name: 'Save advertiser' }).click()
      await page.getByRole('button', { name: `Approve Budgetly ${RUN}` }).click()
      await page.getByRole('list', { name: 'Advertisers' }).getByText('approved').first().waitFor()
      check('the onboarding is recorded with every field, and approved', sql(`select status || '|' || objective || '|' || array_to_string(categories, ',') from ads.advertisers where name = 'Budgetly ${RUN}'`) === 'approved|sign_ups|software_apps')
      await page.getByLabel('Advertiser (approved)').selectOption({ label: `Budgetly ${RUN}` })
      await page.getByLabel('Campaign name').fill(`Spring ${RUN}`)
      await page.getByLabel('Headline').fill('Plan your month in minutes')
      await page.getByLabel('Text').fill('Budgetly shows where your money goes.')
      await page.getByLabel('Button label').fill('Try it free')
      await page.getByLabel('Landing page').fill('https://budgetly.example/start')
      await page.getByLabel('Simulated price ($)').fill('100')
      await page.getByLabel('Creative', { exact: true }).selectOption('image')
      await page.getByLabel('File (uploaded to the ad-creatives bucket)').selectOption(imgPath)
      await page.getByLabel('Text alternative (what the image or video shows)').fill('A phone showing a monthly budget.')
      await page.getByRole('group', { name: 'Commercial categories (from onboarding)' }).getByLabel('Software & apps').check()
      const topics = page.getByRole('group', { name: 'Content topics for contextual ads (never faith or health)' })
      check('faith and health topics cannot be chosen for contextual ads', (await topics.getByLabel('Faith & Spirituality').count()) === 0 && (await topics.getByLabel('Health & wellness').count()) === 0)
      await topics.getByLabel('Money & business').check()
      await page.getByRole('button', { name: 'Save campaign (as draft)' }).click()
      await page.getByRole('button', { name: `Activate Spring ${RUN}` }).click()
      await page.getByRole('button', { name: `Pause Spring ${RUN}` }).waitFor()
      await screenChecks(page, 'the founder advertising page')
      await ctx.close()
    }

    // 2. Max chooses Software & apps; sees the ad under Cara's post and clicks it.
    let impM
    {
      const ctx = await newContext(browser)
      const page = await ctx.newPage()
      await signIn(page, email('m'))
      await page.goto(`${APP}/app/profile`)
      const prefs = page.getByTestId('ad-preferences')
      await prefs.waitFor()
      await prefs.getByLabel('Software & apps').selectOption('chosen')
      await page.waitForFunction(() => true)
      await sleep(300)
      check('the preference is saved, apart from content interests', sql(`select count(*) from ads.preferences where member_id = '${m}' and category = 'software_apps'`) === '1')
      await screenChecks(page, 'the ad preferences')
      await page.goto(`${APP}/app/post/${moneyPost}`)
      const card = page.getByTestId('ad')
      await card.waitFor()
      check('the ad is labelled Sponsored, shown with the creator\'s post', (await card.innerText()).toLowerCase().includes("sponsored · shown with cara creator's post"), await card.innerText())
      const img = card.getByRole('img', { name: 'A phone showing a monthly budget.' })
      await img.waitFor()
      check('the image creative loads from Splitpost storage', await img.evaluate((el) => el.complete && el.naturalWidth > 0) && (await img.getAttribute('src')).includes('/storage/v1/object/public/ad-creatives/'))
      await card.getByRole('button', { name: 'Why this ad' }).click()
      check('Why this ad names the preference Max chose', (await card.getByTestId('why-this-ad').innerText()).includes('You chose "Software & apps"'))
      await screenChecks(page, 'a post with its ad')
      impM = sql(`select id from ads.impressions where member_id = '${m}' order by served_at desc limit 1`)
      await page.waitForFunction((id) => true, impM)
      for (let i = 0; i < 20 && sql(`select viewed_at is not null from ads.impressions where id = '${impM}'`) !== 't'; i++) await sleep(250)
      check('a visible ad counts as one valid impression', sql(`select viewed_at is not null from ads.impressions where id = '${impM}'`) === 't')
      const popup = page.waitForEvent('popup')
      await card.getByRole('link', { name: /Try it free/ }).click()
      const p = await popup
      await p.close().catch(() => {})
      for (let i = 0; i < 20 && sql(`select clicked_at is not null from ads.impressions where id = '${impM}'`) !== 't'; i++) await sleep(250)
      check('the outbound click counts once, after the view', sql(`select (clicked_at >= viewed_at)::text from ads.impressions where id = '${impM}'`) === 'true')
      await ctx.close()
    }

    // 3. Noor has no preferences: a contextual ad that says so; no ad on faith content.
    {
      const ctx = await newContext(browser)
      const page = await ctx.newPage()
      await signIn(page, email('n'))
      await page.goto(`${APP}/app/post/${moneyPost}`)
      const card = page.getByTestId('ad')
      await card.waitFor()
      await card.getByRole('button', { name: 'Why this ad' }).click()
      check('a contextual ad says it is not about the member', (await card.getByTestId('why-this-ad').innerText()).includes('Shown with Money & business posts. Not based on anything about you.'))
      await card.getByRole('button', { name: 'Not relevant' }).click()
      await card.getByText('Thanks. This helps keep ads relevant.').waitFor()
      await page.goto(`${APP}/app/post/${faithPost}`)
      await page.getByText(`A reflection ${RUN}`).waitFor()
      await sleep(800)
      check('faith content never carries an ad', (await page.getByTestId('ad').count()) === 0)
      await ctx.close()
    }
    check('seeing and clicking ads earns no Connection Points', sql(`select count(*) from sim.points_ledger where member_id in ('${m}', '${n}')`) === '0')

    // 4. The founder reports, reconciles conversions and attributes simulated revenue.
    // The two views are moved to two months ago (a finished month the rewards journey did not close).
    const month = sql("select to_char(date_trunc('month', now()) - interval '2 months', 'YYYY-MM')")
    sql(`begin; set local session_replication_role = replica; update ads.impressions set served_at = served_at - interval '62 days', viewed_at = viewed_at - interval '62 days', clicked_at = clicked_at - interval '62 days' where member_id in ('${m}', '${n}'); commit;`)
    const shareBefore = Number(sql(`select coalesce(sum(net_cents), 0) from sim.revenue_entries where creator_id = '${c}'`))
    {
      const ctx = await newContext(browser)
      const page = await ctx.newPage()
      await signIn(page, f.email)
      await page.goto(`${APP}/app/ads`)
      await page.getByRole('button', { name: `Report for Spring ${RUN}` }).click()
      const rep = page.getByTestId('campaign-report')
      await rep.waitFor()
      const t = (await rep.innerText()).replace(/\s+/g, ' ')
      check('the report is aggregate: 2 impressions, 1 click, small groups withheld',
        /Valid impressions 2 /.test(t) && /Outbound clicks 1 /.test(t) && /Eligible audience \(chose a matching category\) fewer than 10/.test(t) && /Reach fewer than 10/.test(t), t)
      check('the report separates preference and contextual delivery', /By preference \(impressions, clicks\) 1, 1/.test(t) && /By context \(impressions, clicks\) 1, 0/.test(t), t)
      check('the report names no member', !t.includes('Max Member') && !t.includes(`adm${RUN}`) && !t.includes(m))
      await rep.getByLabel('Month', { exact: true }).fill(month)
      await rep.getByLabel('Verified conversions').fill('1')
      await rep.getByLabel('How they were verified').fill('Advertiser sign-up report, matched to the landing page')
      await rep.getByRole('button', { name: 'Record verified conversions' }).click()
      await rep.getByText('Conversions recorded.').waitFor()
      await rep.getByLabel('Simulated net revenue for the month ($)').fill('100')
      await rep.getByRole('button', { name: 'Attribute simulated revenue' }).click()
      await rep.getByText(/Attributed: \$100\.00 to creators' content \(shared\), \$0\.00 to the feed \(Splitpost\)\. Simulated\./).waitFor()
      await rep.getByRole('button', { name: 'Attribute simulated revenue' }).click()
      await rep.getByText('That campaign month already has its revenue recorded.').waitFor()
      check('revenue is attributed once per campaign and month', sql(`select count(*) from ads.revenue_attributions where month = '${month}-01'`) === '1')
      await ctx.close()
    }
    check('the content share reaches Cara through the 40/20/40 model',
      Number(sql(`select coalesce(sum(net_cents), 0) from sim.revenue_entries where creator_id = '${c}'`)) - shareBefore === 10000 &&
      sql(`select (sim.split('content_ad', 10000)).creator_cents`) === '4000')
    {
      const ctx = await newContext(browser)
      const page = await ctx.newPage()
      await signIn(page, email('c'))
      await page.goto(`${APP}/app/profile?face=money`)
      const e = page.getByTestId('simulated-earnings')
      await e.waitFor()
      check('Cara sees her simulated creator share for the campaign month ($40.00)', (await e.innerText()).includes('$40.00'), await e.innerText())
      await ctx.close()
    }
    check('no Content Security Policy violations', csp.length === 0, csp.slice(0, 2).join(' | '))
  } catch (e) {
    failures++
    console.log(`FAIL  advertising journey stopped: ${e && e.message}`)
  } finally {
    await browser.close()
  }
  console.log(`Advertising journey: ${failures === 0 ? 'all passed' : `${failures} failed`}`)
  process.exit(failures === 0 ? 0 : 1)
})()
