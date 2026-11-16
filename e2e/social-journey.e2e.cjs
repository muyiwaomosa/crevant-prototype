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
  vercel.headers.find((h) => h.source === '/(.*)').headers.map((h) => [h.key.toLowerCase(), h.value.replace('https://kpudeppgokpjhvaqrprn.supabase.co', API)]),
)

const RUN = String(Date.now()).slice(-7)
const PASSWORD = 'Social-Journey-42-pass'
let failures = 0
const check = (name, ok, detail = '') => {
  if (!ok) failures++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`)
}
const sql = (q) => execFileSync('psql', [DB, '-v', 'ON_ERROR_STOP=1', '-qAt', '-c', q]).toString().trim()
const adminHeaders = { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, 'Content-Type': 'application/json' }

async function createMember(email) {
  const r = await fetch(`${API}/auth/v1/admin/users`, { method: 'POST', headers: adminHeaders, body: JSON.stringify({ email, password: PASSWORD, email_confirm: true }) })
  const body = await r.json()
  if (!r.ok) throw new Error(`could not create ${email}: ${JSON.stringify(body)}`)
  return body.id
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

const cspViolations = []
const consoleErrors = []
async function newContext(browser, opts = {}) {
  const ctx = await browser.newContext(opts)
  await ctx.route(`${APP}/**`, async (route) => {
    const res = await route.fetch()
    const headers = { ...res.headers() }
    if ((headers['content-type'] || '').includes('text/html')) Object.assign(headers, SECURITY_HEADERS)
    await route.fulfill({ response: res, headers })
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

async function signInAndSetUp(page, email, username, displayName) {
  await page.goto(`${APP}/sign-in?next=%2Fapp`)
  await page.getByLabel('Email address', { exact: true }).fill(email)
  await page.getByLabel('Password', { exact: true }).fill(PASSWORD)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await page.waitForURL(`${APP}/app`)
  await page.getByText('Your profile is ready').waitFor()
  await page.getByLabel('Username').fill(username)
  await page.getByLabel('Display name').fill(displayName)
  await page.getByRole('button', { name: 'Continue' }).click()
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
    const early = await rpc(tokenB, 'app_feed')
    check('a member without a username is asked to finish their profile first', early.status >= 400 && JSON.stringify(early.body).includes('profile_incomplete'), JSON.stringify(early.body).slice(0, 80))
  }

  // 2. A signs in, chooses a name and posts.
  const ctxA = await newContext(browser)
  const pageA = await ctxA.newPage()
  await signInAndSetUp(pageA, emailA, userA, 'Aye Teacher')
  check('A chose a username and display name, and the feed opened', sql(`select username || '|' || display_name from public.profiles where id = '${idA}'`) === `${userA}|Aye Teacher`)
  await pageA.getByLabel('Write a post').fill(postText)
  await pageA.getByRole('button', { name: 'Post', exact: true }).click()
  await pageA.getByText(postText).waitFor()
  check('A\'s post appears in their own feed', true)
  check('the post is stored once, as written', sql(`select count(*) from social.posts where author_id = '${idA}' and body = '${postText}' and deleted_at is null`) === '1')

  // 3. B finds A, follows, adds A to their Clique, likes and comments.
  const ctxB = await newContext(browser)
  const pageB = await ctxB.newPage()
  await signInAndSetUp(pageB, emailB, userB, 'Bee Fan')
  await pageB.getByText('Your feed is quiet').waitFor()
  check('B\'s feed is empty before following anyone', (await pageB.getByTestId('post').count()) === 0)
  await pageB.getByRole('link', { name: 'Discover people' }).click()
  await pageB.getByLabel('Search people by name or username').fill(userA)
  await pageB.getByRole('button', { name: 'Search' }).click()
  await pageB.getByRole('button', { name: 'Follow Aye Teacher' }).click()
  await pageB.getByRole('button', { name: 'Add Aye Teacher to your Clique' }).click()
  await pageB.getByRole('button', { name: 'Remove Aye Teacher from your Clique' }).waitFor()
  check('following and joining the Clique are separate records', sql(`select (select count(*) from social.follows where follower_id = '${idB}' and creator_id = '${idA}') || '|' || (select count(*) from social.clique_members where fan_id = '${idB}' and creator_id = '${idA}' and removed_at is null)`) === '1|1')

  await pageB.getByRole('link', { name: 'Home' }).first().click()
  await pageB.getByText(postText).waitFor()
  check('A\'s post shows in B\'s feed after following, marked as in B\'s Clique', await pageB.getByText('In your Clique').first().isVisible())
  await pageB.getByRole('button', { name: 'Like (0 likes)' }).click()
  await pageB.getByRole('button', { name: 'Unlike (1 likes)' }).waitFor()
  await pageB.getByRole('link', { name: 'Comments (0)' }).click()
  await pageB.getByLabel('Write a comment').fill('This finally made it click for my class.')
  await pageB.getByRole('button', { name: 'Comment', exact: true }).click()
  await pageB.getByText('This finally made it click for my class.').waitFor()
  check('B\'s like and comment are stored once each', sql(`select (select count(*) from social.likes where user_id = '${idB}') || '|' || (select count(*) from social.comments where author_id = '${idB}' and deleted_at is null)`) === '1|1')

  // 4. Everything survives a reload (database-backed, not browser storage).
  await pageB.goto(`${APP}/app`)
  await pageB.reload()
  await pageB.getByText(postText).waitFor()
  check('after a reload, B\'s like is still there', await pageB.getByRole('button', { name: 'Unlike (1 likes)' }).isVisible())
  check('after a reload, the comment count is still 1', await pageB.getByRole('link', { name: 'Comments (1)' }).isVisible())
  const appStorage = await pageB.evaluate(() => Object.keys(localStorage).filter((k) => !/^sb-/.test(k)))
  check('no social data is kept in browser storage', appStorage.length === 0, appStorage.join(','))

  // 5. The Clique holds at most 10; the database refuses an 11th even through the API.
  {
    const others = []
    for (let i = 1; i <= 10; i++) {
      const email = `clique${i}-${RUN}@example.test`
      const id = await createMember(email)
      sql(`update public.profiles set username = 'cq${i}_${RUN}', display_name = 'Clique ${i}' where id = '${id}'`)
      others.push(id)
    }
    for (const id of others) await rpc(tokenB, 'app_follow', { p_creator: id })
    for (const id of others.slice(0, 9)) await rpc(tokenB, 'app_clique_add', { p_creator: id })
    const eleventh = await rpc(tokenB, 'app_clique_add', { p_creator: others[9] })
    check('an 11th Clique member is refused by the database', eleventh.status >= 400 && JSON.stringify(eleventh.body).includes('clique_full'), JSON.stringify(eleventh.body).slice(0, 80))
    await pageB.goto(`${APP}/app/clique`)
    await pageB.getByLabel('10 of 10').waitFor()
    check('the Clique page shows 10 of 10 and explains it is full', await pageB.getByText(/Your Clique is full/).isVisible())
    const self = await rpc(tokenB, 'app_follow', { p_creator: idB })
    check('members cannot follow themselves', self.status >= 400 && JSON.stringify(self.body).includes('cannot_follow_self'))
  }

  // 6. Unfollowing closes the Clique membership and keeps the history.
  await pageB.goto(`${APP}/app/u/${userA}`)
  await pageB.getByRole('button', { name: 'Unfollow Aye Teacher' }).click()
  await pageB.getByRole('button', { name: 'Follow Aye Teacher' }).waitFor()
  check(
    'unfollowing closes the Clique membership (reason "unfollowed") and records the unfollow',
    sql(`select (select count(*) from social.clique_members where fan_id = '${idB}' and creator_id = '${idA}' and removal_reason = 'unfollowed') || '|' || (select count(*) from social.follow_events where follower_id = '${idB}' and creator_id = '${idA}')`) === '1|2',
  )

  // 7. A sees B's comment on their post, and only A can delete the post.
  await pageA.goto(`${APP}/app/u/${userA}`)
  await pageA.getByText(postText).waitFor()
  check('A sees one comment on their post', await pageA.getByRole('link', { name: 'Comments (1)' }).isVisible())
  await pageA.getByRole('button', { name: 'Delete post' }).click()
  await pageA.getByRole('button', { name: 'Delete', exact: true }).click()
  await pageA.getByText(`You haven't posted yet.`).waitFor()
  check('A deleted their post (kept as deleted, never shown)', sql(`select count(*) from social.posts where author_id = '${idA}' and deleted_at is not null`) === '1')

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
