// Release 1: the social core in a real browser, against a real LOCAL
// Supabase, with the vercel.json security headers applied. Two invited
// members choose their names, post, follow, build a Clique, like and comment,
// and everything survives a page reload. Run through scripts/e2e/auth-journey.sh
// (after the sign-in journey, on the same local stack and build).
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
const PUB = env('PUBLISHABLE_KEY')
if (!/^http:\/\/(127\.0\.0\.1|localhost):/.test(API)) throw new Error('Refusing: not a local Supabase')

const vercel = JSON.parse(readFileSync(path.join(__dirname, '..', 'vercel.json'), 'utf8'))
const SECURITY_HEADERS = Object.fromEntries(
  vercel.headers.find((h) => h.source === '/(.*)').headers.map((h) => [h.key.toLowerCase(), h.value.replaceAll('https://kpudeppgokpjhvaqrprn.supabase.co', API)]),
)

const RUN = String(Date.now()).slice(-7)
const PASSWORD = 'Social-Journey-42-pass'
let failures = 0
const check = (name, ok, detail = '') => {
  if (!ok) failures++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`)
}
const sql = (q) => execFileSync('psql', [DB, '-v', 'ON_ERROR_STOP=1', '-qAt', '-c', q]).toString().trim()
// Counts the rows matching a condition and, when there isn't exactly the
// expected number, lists them (id, created_at, body) so a failure shows
// whether it was a duplicate write, a missing one, or something else.
function rowsReport(table, where, cols = 'id, created_at, left(body, 40) as body') {
  const n = Number(sql(`select count(*) from ${table} where ${where}`))
  const rows = n > 1 ? sql(`select ${cols} from ${table} where ${where} order by created_at, 1`).split('\n').join(' ; ') : ''
  return { n, detail: rows ? `found ${n}: ${rows}` : `found ${n}` }
}
const adminHeaders = { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, 'Content-Type': 'application/json' }

// A confirmed account. Pilot membership (20261122000000) is granted separately,
// by server code, as the founder will: signing in alone is never enough.
async function createAccount(email) {
  const r = await fetch(`${API}/auth/v1/admin/users`, { method: 'POST', headers: adminHeaders, body: JSON.stringify({ email, password: PASSWORD, email_confirm: true }) })
  const body = await r.json()
  if (!r.ok) throw new Error(`could not create ${email}: ${JSON.stringify(body)}`)
  return body.id
}
async function createMember(email) {
  const id = await createAccount(email)
  sql(`select ops.grant_member_access('${id}', 'tester', 'social-journey')`)
  return id
}
async function tokenFor(email) {
  const r = await fetch(`${API}/auth/v1/token?grant_type=password`, { method: 'POST', headers: { apikey: PUB, 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password: PASSWORD }) })
  return (await r.json()).access_token
}
async function rpc(token, fn, args = {}) {
  const r = await fetch(`${API}/rest/v1/rpc/${fn}`, {
    method: 'POST',
    headers: { apikey: PUB, Authorization: `Bearer ${token || PUB}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(args),
  })
  const text = await r.text()
  return { status: r.status, body: text ? JSON.parse(text) : null }
}

// Every write the pages send (as the page sees it: a request the browser
// re-sends on its own over a fresh connection is not listed here, which tells
// the two apart). Printed with a failing storage check.
const writes = []
const WRITE_FNS = /\/rest\/v1\/rpc\/(app_create_post|app_add_comment)$/
const writesTo = (fn) => writes.filter((w) => w.fn === fn).map((w) => `${w.at} ${w.status ?? w.failure ?? 'pending'}`).join(', ') || 'none'
const cspViolations = []
// Accessibility (axe-core, WCAG 2.2 AA), injected through the DevTools
// protocol so the page's own Content Security Policy stays in force.
const AXE = readFileSync(path.join(__dirname, '..', 'node_modules', 'axe-core', 'axe.min.js'), 'utf8')
async function axe(page) {
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
const consoleErrors = []
async function newContext(browser, opts = {}) {
  const ctx = await browser.newContext(opts)
  ctx.on('request', (req) => {
    const m = req.method() === 'POST' && new URL(req.url()).pathname.match(WRITE_FNS)
    if (m) writes.push({ fn: m[1], req, at: new Date().toISOString().slice(11, 23) })
  })
  ctx.on('requestfinished', async (req) => {
    const w = writes.find((x) => x.req === req)
    if (w) w.status = (await req.response())?.status()
  })
  ctx.on('requestfailed', (req) => {
    const w = writes.find((x) => x.req === req)
    if (w) w.failure = req.failure()?.errorText
  })
  await ctx.route(`${APP}/**`, async (route) => {
    // A request can outlive its page (for example a font still downloading
    // when the test moves on); then there's nothing left to answer.
    // Only pages need the headers; scripts, styles, images and fonts pass
    // straight through, so they're never fetched twice.
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
  const openPage = ctx.newPage.bind(ctx)
  ctx.newPage = async () => {
    const page = await openPage()
    page.on('console', (m) => {
      if (m.type() === 'error') consoleErrors.push(m.text())
      if (/Content Security Policy/i.test(m.text())) cspViolations.push(m.text())
    })
    return page
  }
  return ctx
}

// Runs a UI action that writes, and waits until the server has answered that
// write. Waiting for the text to appear is not enough: the composer's own
// textarea holds the same text (React keeps its text content in step with the
// value), and a like shows before its request is answered.
async function answered(page, fn, action) {
  const [res] = await Promise.all([
    page.waitForResponse((r) => r.request().method() === 'POST' && new URL(r.url()).pathname === `/rest/v1/rpc/${fn}`),
    action(),
  ])
  return res.status()
}

// Sign in and choose a name, then the optional first-time setup
// (20261123000000): `setup` gives the answers to enter, or null to use
// "Skip the rest".
async function signInAndSetUp(page, email, username, displayName, setup = null, walkWelcome = false) {
  await page.goto(`${APP}/sign-in?next=%2Fapp`)
  await page.getByLabel('Email address', { exact: true }).fill(email)
  await page.getByLabel('Password', { exact: true }).fill(PASSWORD)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await page.waitForURL(`${APP}/app`)
  // SP-UX-002: the value-first welcome comes first for a brand-new account.
  const welcome = page.getByTestId('welcome')
  await welcome.waitFor()
  if (walkWelcome) {
    const titles = [await welcome.getByRole('heading', { level: 1 }).innerText()]
    let said = await welcome.innerText()
    {
      const v = await axe(page)
      check('the first welcome face has no WCAG 2.2 AA violations', v.length === 0, v.join(', '))
    }
    for (let i = 0; i < 4; i++) {
      await welcome.getByRole('button', { name: 'Continue' }).click()
      titles.push(await welcome.getByRole('heading', { level: 1 }).innerText())
      said += ' ' + (await welcome.innerText())
    }
    check('the welcome tells the story in five faces, benefit first',
      JSON.stringify(titles) === JSON.stringify(["Don't just post. Get your split.", 'Your people. Your feed.', 'Your support counts.', 'Grow. Qualify. Earn.', 'Make it yours.']), titles.join(' | '))
    check('every amount is said to be simulated, and nothing promises earnings', /simulated/i.test(said) && !/guarantee/i.test(said), said)
    await page.waitForTimeout(500) // let the slide-in finish before measuring contrast
    {
      const v = await axe(page)
      check('the welcome has no WCAG 2.2 AA violations', v.length === 0, v.join(', '))
    }
    await welcome.getByRole('button', { name: 'Back' }).click()
    await welcome.getByRole('button', { name: 'Continue' }).click()
    await welcome.getByRole('button', { name: 'Get started' }).click()
  } else {
    await welcome.getByRole('button', { name: 'Skip' }).click()
  }
  await page.getByText('Your profile is ready').waitFor()
  await page.getByText('Step 1 of 6: Your name').waitFor()
  await page.getByLabel('Username').fill(username)
  await page.getByLabel('Display name').fill(displayName)
  await page.getByRole('button', { name: 'Continue' }).click()
  await page.getByRole('heading', { name: 'What brings you to Splitpost?' }).waitFor()
  if (setup) {
    const v = await axe(page)
    check('setup step 2 (identity) has no WCAG 2.2 AA violations', v.length === 0, v.join(', '))
    await noSidewaysScroll(page, 'setup step 2')
    await page.getByRole('radio', { name: new RegExp(`^${setup.identity}`) }).check()
    await page.getByRole('button', { name: 'Continue' }).click()
    await page.getByRole('heading', { name: 'What are you into?' }).waitFor()
    for (const t of setup.topics) await page.getByRole('button', { name: t, exact: true }).click()
    const v3 = await axe(page)
    check('setup step 3 (interests) has no WCAG 2.2 AA violations', v3.length === 0, v3.join(', '))
    await noSidewaysScroll(page, 'setup step 3')
    await page.getByRole('button', { name: 'Continue' }).click()
    await page.getByRole('heading', { name: 'Tell people about you' }).waitFor()
    await page.getByLabel('Short bio').fill(setup.bio)
    await page.getByLabel('Why should people follow you?').fill(setup.followReason)
    const v4 = await axe(page)
    check('setup step 4 (about you) has no WCAG 2.2 AA violations', v4.length === 0, v4.join(', '))
    await noSidewaysScroll(page, 'setup step 4')
    const saved = await answered(page, 'app_set_profile_details', () => page.getByRole('button', { name: 'Save and continue' }).click())
    check('the server accepted the profile details', saved === 200 || saved === 204, String(saved))
  } else {
    const saved = await answered(page, 'app_set_profile_details', () => page.getByRole('button', { name: 'Skip the rest' }).click())
    check('"Skip the rest" saves empty details, so setup is not shown again', saved === 200 || saved === 204, String(saved))
  }
  await page.getByRole('heading', { name: 'People you might like' }).waitFor()
  await page.getByRole('button', { name: 'Continue' }).click()
  await page.getByRole('button', { name: 'Go to my feed' }).click()
  await page.getByRole('heading', { name: 'Home' }).waitFor()
}

;(async () => {
  // Same as the sign-in journey: the local stack is on a loopback address, which
  // Chromium's local-network checks would otherwise block for this test page.
  const browser = await chromium.launch({
    args: ['--disable-features=LocalNetworkAccessChecks,BlockInsecurePrivateNetworkRequests,PrivateNetworkAccessSendPreflights'],
  })
  const emailA = `aye-${RUN}@example.test`
  const emailB = `bee-${RUN}@example.test`
  const userA = `aye_${RUN}`
  const userB = `bee_${RUN}`
  const idA = await createMember(emailA)
  const idB = await createMember(emailB)
  const postText = `Fractions, the easy way (${RUN})`
  // Auth limits sign-ins per address, so B's API token is fetched once and reused.
  const tokenB = await tokenFor(emailB)

  // 1. Anonymous visitors and raw table access are refused by the API itself.
  {
    const anonFeed = await rpc(null, 'app_feed')
    check('anonymous visitors cannot call the member functions', anonFeed.status === 401 || anonFeed.status === 403 || anonFeed.status === 404, String(anonFeed.status))
    const direct = await fetch(`${API}/rest/v1/posts?select=*`, { headers: { apikey: PUB, Authorization: `Bearer ${tokenB}`, 'Accept-Profile': 'social' } })
    check('members cannot read the social tables through the Data API', !direct.ok, String(direct.status))
    // Signed in, but never granted pilot membership: refused by the database itself.
    const idN = await createAccount(`nomember-${RUN}@example.test`)
    const tokenN = await tokenFor(`nomember-${RUN}@example.test`)
    const refused = await rpc(tokenN, 'app_feed')
    check('a signed-in account without pilot membership is refused by the database (no_pilot_access)', refused.status >= 400 && JSON.stringify(refused.body).includes('no_pilot_access'), JSON.stringify(refused.body).slice(0, 80))
    const state = await rpc(tokenN, 'app_access_state')
    check("that account can learn only its own state: 'none'", state.status === 200 && state.body?.[0]?.status === 'none', JSON.stringify(state.body).slice(0, 80))
    check('nothing was granted to it', sql(`select count(*) from ops.member_access where user_id = '${idN}'`) === '0')
    const early = await rpc(tokenB, 'app_feed')
    check('a member without a username is asked to finish their profile first', early.status >= 400 && JSON.stringify(early.body).includes('profile_incomplete'), JSON.stringify(early.body).slice(0, 80))
  }

  // 2. A signs in, chooses a name and posts.
  const ctxA = await newContext(browser)
  const pageA = await ctxA.newPage()
  await signInAndSetUp(pageA, emailA, userA, 'Aye Teacher', {
    identity: 'Share my own work',
    topics: ['Learning', 'Books & writing'],
    bio: 'Maths teacher making fractions fun.',
    followReason: 'One five-minute maths trick every week',
  })
  check('A chose a username and display name, and the feed opened', sql(`select username || '|' || display_name from public.profiles where id = '${idA}'`) === `${userA}|Aye Teacher`)
  check(
    "A's details are stored as entered, with their interests",
    sql(`select identity || '|' || bio || '|' || follow_reason || '|' || (onboarded_at is not null) || '|' || (select string_agg(topic, ',' order by topic) from social.member_topics where user_id = '${idA}') from social.profile_details where user_id = '${idA}'`)
      === 'creator|Maths teacher making fractions fun.|One five-minute maths trick every week|true|books,learning',
  )
  check('choosing "Creator" changed nothing about A\'s pilot membership', sql(`select cohort || '|' || status from ops.member_access where user_id = '${idA}'`) === 'tester|active')
  await pageA.reload()
  await pageA.getByRole('heading', { name: 'Home' }).waitFor()
  check('after a reload, first-time setup is not shown again', (await pageA.getByRole('progressbar').count()) === 0)
  // Home opens on content; posting is one tap away in Create (approved design, V1).
  check('Home has no composer', (await pageA.getByLabel('Write a post').count()) === 0)
  await pageA.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Create' }).first().click()
  await pageA.getByLabel('Write a post').fill(postText)
  const postStatus = await answered(pageA, 'app_create_post', () => pageA.getByRole('button', { name: 'Post', exact: true }).click())
  check('the server accepted A\'s post', postStatus === 200, String(postStatus))
  await pageA.getByTestId('post').filter({ hasText: postText }).waitFor()
  check('A\'s post opens on its own page once published', (await pageA.getByTestId('post').filter({ hasText: postText }).count()) === 1 && /\/app\/post\//.test(pageA.url()))
  await pageA.goto(`${APP}/app`)
  await pageA.getByTestId('post').filter({ hasText: postText }).waitFor()
  check('A\'s post appears in their own feed', (await pageA.getByTestId('post').filter({ hasText: postText }).count()) === 1)
  {
    const posts = rowsReport('social.posts', `author_id = '${idA}' and body = '${postText}' and deleted_at is null`)
    const all = rowsReport('social.posts', `author_id = '${idA}'`)
    check('the post is stored once, as written', posts.n === 1, `${posts.detail}; all of A's posts: ${all.detail}; page sent app_create_post: ${writesTo('app_create_post')}`)
  }

  // 3. B finds A, follows, adds A to their Clique, likes and comments.
  const ctxB = await newContext(browser)
  const pageB = await ctxB.newPage()
  await signInAndSetUp(pageB, emailB, userB, 'Bee Fan', null, true)
  check("B skipped setup: B's details are empty, and setup is marked done", sql(`select coalesce(identity, '-') || '|' || coalesce(bio, '-') || '|' || (onboarded_at is not null) from social.profile_details where user_id = '${idB}'`) === '-|-|true')
  await pageB.getByText('Your feed is quiet').waitFor()
  check('B\'s feed is empty before following anyone', (await pageB.getByTestId('post').count()) === 0)
  check('a new member sees the three first steps on Home', await pageB.getByText('Choose your Clique').isVisible())
  await pageB.getByRole('link', { name: 'Discover people' }).click()
  await pageB.getByLabel('Search people, posts and topics').fill(userA)
  await pageB.getByRole('button', { name: 'Search', exact: true }).click()
  {
    const card = pageB.getByRole('region', { name: 'People' }).getByRole('listitem').filter({ hasText: 'Aye Teacher' })
    await card.getByText('Maths teacher making fractions fun.').waitFor()
    check("Discover shows A's bio, why to follow and interests, and never a stakeholder label", (await card.getByText('Maths teacher making fractions fun.').count()) === 1
      && (await card.getByText('One five-minute maths trick every week').count()) === 1
      && (await card.getByText(/Creator ·/).count()) === 0
      && (await card.getByRole('list', { name: 'Interests' }).getByText('Learning').count()) === 1)
    // Interest-based discovery: by topic, without searching.
    await pageB.getByRole('button', { name: 'Clear search' }).click()
    await pageB.getByRole('navigation', { name: 'Ways into Discover' }).getByRole('button', { name: /^People/ }).click()
    const interest = pageB.getByLabel('Browse by interest')
    await interest.selectOption({ label: 'Learning' })
    await pageB.getByRole('link', { name: 'Aye Teacher', exact: true }).waitFor()
    check('browsing Discover by "Learning" finds A', (await pageB.getByRole('link', { name: 'Aye Teacher', exact: true }).count()) === 1)
    await interest.selectOption({ label: 'Travel' })
    await pageB.getByText(/Nobody has chosen Travel yet|Try another interest/).first().waitFor()
    check('browsing by an interest A did not choose does not list A', (await pageB.getByRole('link', { name: 'Aye Teacher', exact: true }).count()) === 0)
    await interest.selectOption({ label: 'Learning' })
    await pageB.getByRole('link', { name: 'Aye Teacher', exact: true }).waitFor()
    const v = await axe(pageB)
    check('Discover, with interests and person cards, has no WCAG 2.2 AA violations', v.length === 0, v.join(', '))
    await noSidewaysScroll(pageB, 'Discover with interest filters')
  }
  await pageB.getByRole('button', { name: 'Follow Aye Teacher' }).click()
  const confirmation = pageB.getByTestId('follow-confirmation')
  await confirmation.waitFor()
  check(
    'after following, a confirmation offers Join Clique and See their posts',
    (await confirmation.getByRole('button', { name: 'Join Clique (Aye Teacher)' }).count()) === 1
      && (await confirmation.getByRole('link', { name: 'See their posts' }).getAttribute('href')) === `/app/u/${userA}#posts`
      && (await pageB.getByRole('button', { name: 'Join Clique (Aye Teacher)' }).count()) === 1,
  )
  await pageB.getByRole('button', { name: 'Join Clique (Aye Teacher)' }).click()
  await pageB.getByRole('button', { name: 'In your Clique (Aye Teacher, tap to remove)' }).waitFor()
  check('adding to the Clique says "Added to your Clique!"', ((await pageB.getByTestId('relationship-notice').innerText()) || '').includes('Added to your Clique!'))
  check('following and joining the Clique are separate records', sql(`select (select count(*) from social.follows where follower_id = '${idB}' and creator_id = '${idA}') || '|' || (select count(*) from social.clique_members where fan_id = '${idB}' and creator_id = '${idA}' and removed_at is null)`) === '1|1')

  await pageB.getByRole('link', { name: 'Home' }).first().click()
  await pageB.getByTestId('post').filter({ hasText: postText }).waitFor()
  check('A\'s post shows in B\'s feed after following, marked as in B\'s Clique', await pageB.getByTestId('post').filter({ hasText: postText }).getByText('Clique', { exact: true }).isVisible())
  const likeStatus = await answered(pageB, 'app_like', () => pageB.getByRole('button', { name: 'Like, 0 likes' }).click())
  check('the server accepted B\'s like', likeStatus === 204 || likeStatus === 200, String(likeStatus))
  await pageB.getByRole('button', { name: 'Unlike, 1 like' }).waitFor()
  await pageB.getByRole('link', { name: '0 comments' }).click()
  await pageB.getByLabel('Write a comment').fill('This finally made it click for my class.')
  const commentStatus = await answered(pageB, 'app_add_comment', () => pageB.getByRole('button', { name: 'Comment', exact: true }).click())
  check('the server accepted B\'s comment', commentStatus === 200, String(commentStatus))
  await pageB.getByTestId('comment').filter({ hasText: 'This finally made it click for my class.' }).waitFor()
  {
    const likes = rowsReport('social.likes', `user_id = '${idB}'`, 'post_id, created_at')
    const comments = rowsReport('social.comments', `author_id = '${idB}' and deleted_at is null`, 'id, created_at, post_id, left(body, 40) as body')
    check('B\'s like and comment are stored once each', likes.n === 1 && comments.n === 1, `likes ${likes.detail}; comments ${comments.detail}; page sent app_add_comment: ${writesTo('app_add_comment')}`)
  }

  // 4. Everything survives a reload (database-backed, not browser storage).
  await pageB.goto(`${APP}/app`)
  await pageB.reload()
  await pageB.getByTestId('post').filter({ hasText: postText }).waitFor()
  check('after a reload, B\'s like is still there', await pageB.getByRole('button', { name: 'Unlike, 1 like' }).isVisible())
  {
    const shown = await pageB.getByRole('link', { name: /^\d+ comments?$/ }).evaluateAll((els) => els.map((e) => e.textContent))
    const stored = rowsReport('social.comments', `author_id = '${idB}' and deleted_at is null`, 'id, created_at, post_id, left(body, 40) as body')
    check('after a reload, the comment count is still 1', await pageB.getByRole('link', { name: '1 comment' }).isVisible(), `page shows ${JSON.stringify(shown)}; stored ${stored.detail}`)
  }
  // Only the sign-in session and interface preferences (welcome seen, tips and first steps dismissed,
  // milestones already acknowledged; SP-UX-002); never posts, likes, comments or follows.
  const appStorage = await pageB.evaluate(() =>
    Object.keys(localStorage).filter((k) => !/^sb-/.test(k) && !/^splitpost\.(welcome|tip|first-steps|goals-met)\./.test(k)),
  )
  check('no social data is kept in browser storage', appStorage.length === 0, appStorage.join(','))

  // 4b. Unseen-first: A posts after B followed, so B sees A in the catch-up
  //     strip, opens catch-up, reads the post (2 s on screen, then the batch
  //     is sent), and the strip empties. The feed stays chronological.
  {
    const unseenText = `Something new for catch-up (${RUN})`
    sql(`insert into social.posts (author_id, body) values ('${idA}', '${unseenText}')`)
    await pageB.goto(`${APP}/app`)
    const strip = pageB.getByRole('region', { name: 'Your Clique' })
    await strip.waitFor()
    const link = strip.getByRole('link', { name: 'Aye Teacher has 1 new post' })
    await link.waitFor()
    check('a Clique member with a new post is in the Clique row at the top of Home, marked as new, with a count of 1', (await link.getAttribute('data-unseen')) === 'true')
    check('the post published before the follow is not new', (await strip.locator('[data-unseen="true"]').count()) === 1)
    check('the Home feed stays chronological: the newest post first', ((await pageB.getByTestId('post').first().textContent()) || '').includes(unseenText))
    {
      // The whole Home page: posts (Like, comments, Report) and the Clique row.
      const v = await axe(pageB)
      check('Home, with posts and the Clique row, has no WCAG 2.2 AA violations', v.length === 0, v.join(', '))
    }
    const desktop = pageB.viewportSize()
    for (const width of [390, 320]) {
      await pageB.setViewportSize({ width, height: 760 })
      const sideways = await pageB.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
      check(`at ${width}px, Home with the Clique row has no sideways scrolling`, sideways <= 0, `${sideways}px`)
      await pageB.screenshot({ path: `${process.env.SCREENSHOT_DIR || '/tmp'}/unseen-strip-${width}.png` })
    }
    if (desktop) await pageB.setViewportSize(desktop)
    await link.click()
    await pageB.getByRole('heading', { name: 'Catching up with Aye Teacher' }).waitFor()
    await pageB.getByTestId('post').filter({ hasText: unseenText }).waitFor()
    const recorded = async () => sql(`select count(*) from social.post_views v join social.posts s on s.id = v.post_id where v.viewer_id = '${idB}' and s.body = '${unseenText}'`)
    for (let i = 0; i < 40 && (await recorded()) !== '1'; i++) await pageB.waitForTimeout(500)
    check('reading a post in catch-up records it as viewed, once', (await recorded()) === '1', `rows: ${await recorded()}`)
    check('your own posts are never recorded as viewed', sql(`select count(*) from social.post_views v join social.posts s on s.id = v.post_id where v.viewer_id = s.author_id`) === '0')
    await pageB.getByRole('link', { name: 'Back to Home' }).click()
    await pageB.getByTestId('post').first().waitFor()
    await pageB.waitForTimeout(500)
    const after = pageB.getByRole('region', { name: 'Your Clique' }).getByRole('link', { name: 'Aye Teacher has nothing new' })
    for (let i = 0; i < 10 && (await after.count()) === 0; i++) await pageB.waitForTimeout(500)
    check('after reading, the Clique member is no longer marked as new', (await after.getAttribute('data-unseen')) === 'false')
  }

  // 5. Following and the Clique are both unlimited (20261201000000). The
  //    replace function stays for older pages and still needs a member.
  {
    const others = []
    for (let i = 1; i <= 26; i++) {
      const email = `clique${i}-${RUN}@example.test`
      const id = await createMember(email)
      sql(`update public.profiles set username = 'cq${i}_${RUN}', display_name = 'Maker ${i}' where id = '${id}'`)
      others.push(id)
    }
    for (const id of others) await rpc(tokenB, 'app_follow', { p_creator: id })
    check('B follows 27 creators (follows are unlimited)', sql(`select count(*) from social.follows where follower_id = '${idB}'`) === '27')
    for (const id of others.slice(0, 24)) await rpc(tokenB, 'app_clique_add', { p_creator: id })
    const extra = await rpc(tokenB, 'app_clique_add', { p_creator: others[24] })
    check('a 26th Clique creator is accepted (the Clique has no limit)', extra.status === 204 || extra.status === 200, `${extra.status} ${JSON.stringify(extra.body).slice(0, 80)}`)
    const anon = await rpc(null, 'app_clique_replace', { p_remove: others[0], p_add: others[24] })
    check('signed-out visitors cannot replace Clique creators', anon.status === 401 || anon.status === 403 || anon.status === 404, String(anon.status))

    await pageB.goto(`${APP}/app/clique`)
    await pageB.getByText('26 in your Clique').waitFor()
    check('the Clique page lists all 27 followed creators in Following', (await pageB.getByRole('region', { name: 'Following' }).getByRole('listitem').count()) === 27)
    await pageB.getByRole('button', { name: 'Join Clique (Maker 26)' }).click()
    await pageB.getByText('27 in your Clique').waitFor()
    check('a 27th joins from the page, with no replacement step', (await pageB.getByRole('dialog').count()) === 0)
    await pageB.getByRole('region', { name: 'My Clique' }).getByRole('button', { name: 'Remove from Clique (Maker 2, you keep following them)' }).click()
    await pageB.getByText('26 in your Clique').waitFor()
    check('removing from the Clique keeps the follow', sql(`select count(*) from social.follows where follower_id = '${idB}' and creator_id = '${others[1]}'`) === '1')
    const self = await rpc(tokenB, 'app_follow', { p_creator: idB })
    check('members cannot follow themselves', self.status >= 400 && JSON.stringify(self.body).includes('cannot_follow_self'))
  }

  // 6. Unfollowing closes the Clique membership and keeps the history.
  await pageB.goto(`${APP}/app/u/${userA}`)
  await pageB.getByRole('button', { name: 'Following (Aye Teacher, tap to unfollow)' }).click()
  await pageB.getByRole('button', { name: 'Follow Aye Teacher' }).waitFor()
  check(
    'unfollowing closes the Clique membership (reason "unfollowed") and records the unfollow',
    sql(`select (select count(*) from social.clique_members where fan_id = '${idB}' and creator_id = '${idA}' and removal_reason = 'unfollowed') || '|' || (select count(*) from social.follow_events where follower_id = '${idB}' and creator_id = '${idA}')`) === '1|2',
  )

  // 7. A sees B's comment on their post, and only A can delete the post.
  await pageA.goto(`${APP}/app/u/${userA}`)
  await pageA.getByTestId('post').filter({ hasText: postText }).waitFor()
  check('A sees one comment on their post', await pageA.getByRole('link', { name: '1 comment' }).isVisible())
  const postCard = pageA.getByTestId('post').filter({ hasText: postText })
  await postCard.getByRole('button', { name: 'Delete post' }).click()
  await postCard.getByRole('button', { name: 'Delete', exact: true }).click()
  await postCard.waitFor({ state: 'detached' })
  check('A deleted their post (kept as deleted, never shown)', sql(`select count(*) from social.posts where author_id = '${idA}' and deleted_at is not null`) === '1')

  // 7b. Publishing reliability (issue #48): a double click, and a retry after
  // an answer that never arrived, each store one post or comment. The page
  // sends a request id, and the database returns the first row for a repeat.
  {
    const errorsBefore = consoleErrors.length
    const countWhere = (table, where) => rowsReport(table, where)
    await pageA.goto(`${APP}/app/new`)
    await pageA.getByLabel('Write a post').waitFor()

    const twice = `Pressed twice (${RUN})`
    await pageA.getByLabel('Write a post').fill(twice)
    await answered(pageA, 'app_create_post', () => pageA.getByRole('button', { name: 'Post', exact: true }).dblclick())
    await pageA.getByTestId('post').filter({ hasText: twice }).waitFor()
    await pageA.waitForTimeout(500) // room for a second request, if one had been sent
    const dbl = countWhere('social.posts', `author_id = '${idA}' and body = '${twice}'`)
    check('a double click on Post stores the post once', dbl.n === 1, `${dbl.detail}; page sent app_create_post: ${writesTo('app_create_post')}`)

    // The first request reaches the server and is stored, but its answer is thrown away.
    const lost = `Answer lost once (${RUN})`
    let dropped = false
    await pageA.route('**/rest/v1/rpc/app_create_post', async (route) => {
      if (dropped) return route.continue()
      dropped = true
      await route.fetch()
      await route.abort('connectionreset')
    })
    await pageA.goto(`${APP}/app/new`)
    await pageA.getByLabel('Write a post').fill(lost)
    await pageA.getByRole('button', { name: 'Post', exact: true }).click()
    await pageA.getByText("We couldn't reach Splitpost. Check your connection and try again.").waitFor()
    check('when the answer is lost, the server has already stored the post', countWhere('social.posts', `author_id = '${idA}' and body = '${lost}'`).n === 1)
    const retried = await answered(pageA, 'app_create_post', () => pageA.getByRole('button', { name: 'Post', exact: true }).click())
    await pageA.getByTestId('post').filter({ hasText: lost }).waitFor()
    const once = countWhere('social.posts', `author_id = '${idA}' and body = '${lost}'`)
    check('a retry after a lost answer is accepted and the post is stored once', retried === 200 && once.n === 1, `status ${retried}; ${once.detail}; page sent app_create_post: ${writesTo('app_create_post')}`)
    await pageA.unroute('**/rest/v1/rpc/app_create_post')

    // The same for a comment, on that post.
    // Publishing opened the post's own page, where comments are.
    await pageA.waitForURL(/\/app\/post\//)
    const said = `Said once (${RUN})`
    let droppedComment = false
    await pageA.route('**/rest/v1/rpc/app_add_comment', async (route) => {
      if (droppedComment) return route.continue()
      droppedComment = true
      await route.fetch()
      await route.abort('connectionreset')
    })
    await pageA.getByLabel('Write a comment').fill(said)
    await pageA.getByRole('button', { name: 'Comment', exact: true }).click()
    await pageA.getByText("We couldn't reach Splitpost. Check your connection and try again.").waitFor()
    const commentRetry = await answered(pageA, 'app_add_comment', () => pageA.getByRole('button', { name: 'Comment', exact: true }).click())
    await pageA.getByTestId('comment').filter({ hasText: said }).waitFor()
    const c1 = countWhere('social.comments', `author_id = '${idA}' and body = '${said}'`)
    check('a comment retried after a lost answer is stored once', commentRetry === 200 && c1.n === 1, `status ${commentRetry}; ${c1.detail}; page sent app_add_comment: ${writesTo('app_add_comment')}`)
    await pageA.unroute('**/rest/v1/rpc/app_add_comment')

    // The two answers thrown away on purpose show as network errors in the
    // console. Remove only those; any other error still fails the journey.
    for (let i = consoleErrors.length - 1; i >= errorsBefore; i--) {
      if (/Failed to load resource|ERR_CONNECTION_RESET|ERR_FAILED/.test(consoleErrors[i])) consoleErrors.splice(i, 1)
    }
  }

  // 8. Phones get the tab bar and the same pages (B's session is reused: no extra sign-in).
  {
    const ctx = await newContext(browser, { viewport: { width: 390, height: 844 }, storageState: await ctxB.storageState() })
    const page = await ctx.newPage()
    await page.goto(`${APP}/app`)
    await page.getByRole('heading', { name: 'Home' }).waitFor()
    const tabs = page.getByRole('navigation', { name: 'Main' }).last()
    check('on a phone, the tab bar offers Home, Discover, Create, Clique and Profile', (await tabs.getByRole('link').count()) === 5)
    const extra = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
    check('no sideways scrolling on a phone', extra <= 0, `${extra}px`)
    for (const width of [390, 320]) {
      await page.setViewportSize({ width, height: 740 })
      await page.goto(`${APP}/app/discover?face=creators`)
      await page.getByRole('search').waitFor()
      await page.getByRole('listitem').first().waitFor()
      const discoverSideways = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
      const discoverClipped = await page.evaluate(() => [...document.querySelectorAll('main button, main a')].filter((e) => { const r = e.getBoundingClientRect(); return r.width > 0 && (r.left < 0 || r.right > document.documentElement.clientWidth) }).length)
      check(`at ${width}px, Discover has no sideways scrolling or clipped controls`, discoverSideways <= 0 && discoverClipped === 0, `${discoverSideways}px, ${discoverClipped} clipped`)
      await page.screenshot({ path: `${process.env.SCREENSHOT_DIR || '/tmp'}/discover-${width}.png`, fullPage: false })
      await page.goto(`${APP}/app/catch-up/${userA}`)
      await page.getByRole('heading', { name: 'Catching up with Aye Teacher' }).waitFor()
      const catchUpSideways = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
      check(`at ${width}px, the catch-up page has no sideways scrolling`, catchUpSideways <= 0, `${catchUpSideways}px`)
      await page.goto(`${APP}/app/clique`)
      await page.getByRole('region', { name: 'Following' }).waitFor()
      const sideways = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
      check(`at ${width}px, the Clique page has no sideways scrolling`, sideways <= 0, `${sideways}px`)
      const headings = await page.getByRole('heading', { level: 2 }).allTextContents()
      check(`at ${width}px, the Clique page shows My Clique first, then Following`, JSON.stringify(headings) === JSON.stringify(['My Clique', 'Following']), JSON.stringify(headings))
      const copy = await page.evaluate(() => [document.body.innerText, ...[...document.querySelectorAll('[aria-label],[title]')].map((e) => (e.getAttribute('aria-label') || '') + (e.getAttribute('title') || ''))].join(' '))
      check(`at ${width}px, nothing on the Clique page says "Inner Clique"`, !/inner\s*clique/i.test(copy))
      const clipped = await page.evaluate(() => [...document.querySelectorAll('main button, main a')].filter((e) => { const r = e.getBoundingClientRect(); return r.width > 0 && (r.left < 0 || r.right > document.documentElement.clientWidth) }).length)
      check(`at ${width}px, every button and link on the Clique page fits on screen`, clipped === 0, `${clipped} clipped`)
      await page.screenshot({ path: `${process.env.SCREENSHOT_DIR || '/tmp'}/clique-${width}.png`, fullPage: false })
    }
    await ctx.close()
  }

  check('no Content Security Policy violations', cspViolations.length === 0, cspViolations.slice(0, 2).join(' | '))
  check('no console errors', consoleErrors.length === 0, consoleErrors.slice(0, 2).join(' | '))

  await browser.close()
  console.log(failures ? `\n${failures} social journey check(s) failed` : '\nALL SOCIAL JOURNEY CHECKS PASSED')
  process.exit(failures ? 1 : 0)
})().catch((e) => {
  console.error(e)
  process.exit(1)
})
