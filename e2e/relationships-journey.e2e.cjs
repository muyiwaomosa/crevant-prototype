// Relationships and Home (IP-2, 20261201000000), in a real browser against a
// LOCAL Supabase with real Auth, with the production security headers.
//
//  1. A member follows a creator from the creator's profile (the follow records
//     its source), joins their Clique, and the profile shows Followers, Clique and
//     Active Supporters with a labelled Support button.
//  2. The Support sheet records a non-binding Support Intent and says so.
//  3. Home, Clique first: a new post from the Clique leads, then everything else
//     newest first, each post once.
//  4. A meaningful comment makes the member an Active Supporter.
//  5. Mute: the creator leaves Home and the follow stays; unmute brings them back.
//  6. The creator's own audience insight counts it all (aggregates only).
// Every screen: WCAG 2.2 AA, 320 and 390 px, no CSP violations, no console errors.
// Run by scripts/e2e/auth-journey.sh.
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
const PASSWORD = 'Relationship-Journey-42'
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
  sql(`select ops.grant_member_access('${body.id}', 'tester', 'relationships-journey')`)
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
  const emailM = `rel-m-${RUN}@example.test`
  const emailA = `rel-a-${RUN}@example.test`
  const emailB = `rel-b-${RUN}@example.test`
  const userA = `rela${RUN}`
  const userB = `relb${RUN}`
  try {
    const m = await createMember(emailM, `relm${RUN}`, 'Rel Member')
    const a = await createMember(emailA, userA, 'Amara Rel')
    const b = await createMember(emailB, userB, 'Bo Rel')
    const tokenA = await tokenFor(emailA)
    const tokenB = await tokenFor(emailB)
    await rpc(tokenB, 'app_create_post', { p_body: `An older post from Bo ${RUN}` })

    const ctx = await newContext(browser)
    const page = await ctx.newPage()
    await signIn(page, emailM)

    // 1. Follow from the profile, join the Clique.
    await page.goto(`${APP}/app/u/${userA}`)
    await page.getByRole('button', { name: 'Follow Amara Rel' }).click()
    await page.getByRole('button', { name: 'Following (Amara Rel, tap to unfollow)' }).waitFor()
    check('a follow from a profile records its source', sql(`select source from social.follow_events where follower_id = '${m}' and creator_id = '${a}' and action = 'followed'`) === 'profile')
    await page.getByRole('button', { name: 'Join Clique (Amara Rel)' }).first().click()
    await page.getByRole('button', { name: 'In your Clique (Amara Rel, tap to remove)' }).waitFor()
    await page.reload()
    await page.getByTestId('profile-counts').waitFor()
    const counts = await page.getByTestId('profile-counts').innerText()
    check('the profile shows Followers, Clique and Active Supporters', /Followers\s*1/.test(counts) && /Clique\s*1/.test(counts) && /Active Supporters\s*0/.test(counts), counts.replace(/\s+/g, ' '))
    await page.getByTestId('support-button').waitFor()
    check('the Support button is labelled', /Support/.test(await page.getByTestId('support-button').innerText()))
    await screenChecks(page, 'a creator profile')

    // 2. Support Intent.
    await page.getByTestId('support-button').click()
    const sheet = page.getByRole('dialog', { name: "Show Amara you'd support their work" })
    await sheet.waitFor()
    check('the Support sheet says it is non-binding and nothing is charged', /Non-binding\. Nothing is charged, now or later\./.test(await sheet.getByTestId('support-disclosure').innerText()))
    await screenChecks(page, 'the Support sheet')
    await sheet.getByRole('radio', { name: '$5 a month' }).check()
    await sheet.getByRole('button', { name: 'Record my support intent' }).click()
    await sheet.getByText('Recorded: $5 a month.', { exact: false }).waitFor()
    check('the Support Intent is recorded once, as usd_5', sql(`select string_agg(choice, ',') from intent.support_intents where member_id = '${m}' and creator_id = '${a}'`) === 'usd_5')
    check('the Support Intent is in the event stream', sql(`select count(*) from analytics.events where name = 'support_intent_recorded' and actor_id = '${m}'`) === '1')
    await sheet.getByRole('button', { name: 'Done' }).click()

    // Follow Bo too (from his profile), so Home has someone outside the Clique.
    await page.goto(`${APP}/app/u/${userB}`)
    await page.getByRole('button', { name: 'Follow Bo Rel' }).click()
    await page.getByRole('button', { name: 'Following (Bo Rel, tap to unfollow)' }).waitFor()
    // Posts after the follow: Bo first, then Amara (the newest).
    await rpc(tokenB, 'app_create_post', { p_body: `A new post from Bo ${RUN}` })
    await rpc(tokenA, 'app_create_post', { p_body: `A new post from Amara ${RUN}` })

    // 3. Home, Clique first.
    await page.goto(`${APP}/app`)
    const group = page.getByTestId('clique-first-group')
    await group.waitFor()
    check('Clique first leads with the new Clique post', /A new post from Amara/.test(await group.innerText()))
    const bodies = await page.getByTestId('post').allInnerTexts()
    const amara = bodies.filter((t) => t.includes(`A new post from Amara ${RUN}`)).length
    const bo = bodies.filter((t) => t.includes(`from Bo ${RUN}`)).length
    check('every eligible post appears exactly once on Clique first', amara === 1 && bo === 2, `Amara ${amara}, Bo ${bo}`)
    await screenChecks(page, 'Home, Clique first')

    // 4. A meaningful comment makes M an Active Supporter.
    const postA = sql(`select id from social.posts where author_id = '${a}' and body like 'A new post from Amara%'`)
    await page.goto(`${APP}/app/post/${postA}`)
    await page.getByLabel('Write a comment').fill('This was really helpful for planning my month, thank you.')
    await page.getByRole('button', { name: 'Comment', exact: true }).click()
    await page.getByText('This was really helpful for planning my month').waitFor()
    await page.goto(`${APP}/app/u/${userA}`)
    await page.getByTestId('profile-counts').waitFor()
    check('a meaningful comment makes the member an Active Supporter', /Active Supporters\s*1/.test(await page.getByTestId('profile-counts').innerText()))

    // 5. Mute Bo, then unmute.
    await page.goto(`${APP}/app/clique`)
    await page.getByRole('region', { name: 'Following' }).waitFor()
    await screenChecks(page, 'the Clique and Following page')
    await page.getByRole('button', { name: 'Mute Bo Rel on your Home (you keep following them)' }).click()
    await page.getByText('Muted on Home').waitFor()
    check('muting keeps the follow', sql(`select count(*) from social.follows where follower_id = '${m}' and creator_id = '${b}'`) === '1')
    await page.goto(`${APP}/app?face=following`)
    await page.getByText(`A new post from Amara ${RUN}`).first().waitFor()
    check('a muted creator leaves Home', (await page.getByText(`from Bo ${RUN}`).count()) === 0)
    await page.goto(`${APP}/app/clique`)
    await page.getByRole('button', { name: 'Unmute Bo Rel' }).click()
    await page.getByRole('button', { name: 'Mute Bo Rel on your Home (you keep following them)' }).waitFor()
    await page.goto(`${APP}/app?face=following`)
    await page.getByText(`A new post from Bo ${RUN}`).waitFor()
    check('unmuting brings the creator back to Home', true)
    check('mute and unmute are in the event stream', sql(`select string_agg(name, ',' order by id) from analytics.events where actor_id = '${m}' and name in ('muted', 'unmuted')`) === 'muted,unmuted')
    await ctx.close()

    // 6. Amara's own audience insight.
    const audience = await rpc(tokenA, 'app_my_audience')
    const row = (audience.body || [])[0] || {}
    check(
      'the creator sees followers, Clique, Active Supporters and Support Intent (aggregates only)',
      row.follower_count === 1 && row.clique_count === 1 && row.active_supporter_count === 1 && row.support_intent_count === 1 && row.support_by_choice?.usd_5 === 1,
      JSON.stringify(row),
    )
    const ctxA = await newContext(browser)
    const pageA = await ctxA.newPage()
    await signIn(pageA, emailA)
    await pageA.goto(`${APP}/app/profile`)
    const insight = pageA.getByTestId('audience-insight')
    await insight.waitFor()
    const text = await insight.innerText()
    check('the audience insight tells What happened, What it means and What to do next', /What happened/i.test(text) && /What it means/i.test(text) && /What to do next/i.test(text))
    check('the audience insight marks Support Intent as non-binding', /Non-binding/.test(text) && /Nothing is charged/.test(text))
    await screenChecks(pageA, 'your profile with the audience insight')
    await ctxA.close()

    check('no Content Security Policy violations', csp.length === 0, csp.slice(0, 2).join(' | '))
    check('no console errors', consoleErrors.length === 0, consoleErrors.slice(0, 2).join(' | '))
  } catch (e) {
    failures++
    console.log(`FAIL  relationships journey stopped: ${e && e.message}`)
  } finally {
    await browser.close()
  }
  console.log(`Relationships journey: ${failures === 0 ? 'all passed' : `${failures} failed`}`)
  process.exit(failures === 0 ? 0 : 1)
})()
