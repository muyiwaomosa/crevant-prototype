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
// Counts the rows matching a condition and, when there isn't exactly the
// expected number, lists them (id, created_at, body) so a failure shows
// whether it was a duplicate write, a missing one, or something else.
function rowsReport(table, where, cols = 'id, created_at, left(body, 40) as body') {
  const n = Number(sql(`select count(*) from ${table} where ${where}`))
  const rows = n > 1 ? sql(`select ${cols} from ${table} where ${where} order by created_at, 1`).split('\n').join(' ; ') : ''
  return { n, detail: rows ? `found ${n}: ${rows}` : `found ${n}` }
}
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

// Every write the pages send (as the page sees it: a request the browser
// re-sends on its own over a fresh connection is not listed here, which tells
// the two apart). Printed with a failing storage check.
const writes = []
const WRITE_FNS = /\/rest\/v1\/rpc\/(app_create_post|app_add_comment)$/
const writesTo = (fn) => writes.filter((w) => w.fn === fn).map((w) => `${w.at} ${w.status ?? w.failure ?? 'pending'}`).join(', ') || 'none'
const cspViolations = []
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
  const postStatus = await answered(pageA, 'app_create_post', () => pageA.getByRole('button', { name: 'Post', exact: true }).click())
  check('the server accepted A\'s post', postStatus === 200, String(postStatus))
  await pageA.getByTestId('post').filter({ hasText: postText }).waitFor()
  check('A\'s post appears in their own feed', (await pageA.getByTestId('post').filter({ hasText: postText }).count()) === 1)
  check('the composer is cleared once the post is published', (await pageA.getByLabel('Write a post').inputValue()) === '')
  {
    const posts = rowsReport('social.posts', `author_id = '${idA}' and body = '${postText}' and deleted_at is null`)
    const all = rowsReport('social.posts', `author_id = '${idA}'`)
    check('the post is stored once, as written', posts.n === 1, `${posts.detail}; all of A's posts: ${all.detail}; page sent app_create_post: ${writesTo('app_create_post')}`)
  }

  // 3. B finds A, follows, adds A to their Clique, likes and comments.
  const ctxB = await newContext(browser)
  const pageB = await ctxB.newPage()
  await signInAndSetUp(pageB, emailB, userB, 'Bee Fan')
  await pageB.getByText('Your feed is quiet').waitFor()
  check('B\'s feed is empty before following anyone', (await pageB.getByTestId('post').count()) === 0)
  check('a new member sees the three first steps on Home', await pageB.getByText('Choose your Clique').isVisible())
  await pageB.getByRole('link', { name: 'Discover people' }).click()
  await pageB.getByLabel('Search people by name or username').fill(userA)
  await pageB.getByRole('button', { name: 'Search' }).click()
  await pageB.getByRole('button', { name: 'Follow Aye Teacher' }).click()
  const confirmation = pageB.getByTestId('follow-confirmation')
  await confirmation.waitFor()
  check(
    'after following, a confirmation offers Add to Clique and See their posts',
    (await confirmation.getByRole('button', { name: 'Add Aye Teacher to your Clique' }).count()) === 1
      && (await confirmation.getByRole('link', { name: 'See their posts' }).getAttribute('href')) === `/app/u/${userA}#posts`
      && (await pageB.getByRole('button', { name: 'Add Aye Teacher to your Clique' }).count()) === 1,
  )
  await pageB.getByRole('button', { name: 'Add Aye Teacher to your Clique' }).click()
  await pageB.getByRole('button', { name: 'Remove Aye Teacher from your Clique (you keep following them)' }).waitFor()
  check('following and joining the Clique are separate records', sql(`select (select count(*) from social.follows where follower_id = '${idB}' and creator_id = '${idA}') || '|' || (select count(*) from social.clique_members where fan_id = '${idB}' and creator_id = '${idA}' and removed_at is null)`) === '1|1')

  await pageB.getByRole('link', { name: 'Home' }).first().click()
  await pageB.getByTestId('post').filter({ hasText: postText }).waitFor()
  check('A\'s post shows in B\'s feed after following, marked as in B\'s Clique', await pageB.getByTestId('post').filter({ hasText: postText }).getByText('Clique', { exact: true }).isVisible())
  const likeStatus = await answered(pageB, 'app_like', () => pageB.getByRole('button', { name: 'Like (0 likes)' }).click())
  check('the server accepted B\'s like', likeStatus === 204 || likeStatus === 200, String(likeStatus))
  await pageB.getByRole('button', { name: 'Unlike (1 likes)' }).waitFor()
  await pageB.getByRole('link', { name: 'Comments (0)' }).click()
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
  check('after a reload, B\'s like is still there', await pageB.getByRole('button', { name: 'Unlike (1 likes)' }).isVisible())
  {
    const shown = await pageB.getByRole('link', { name: /^Comments \(\d+\)$/ }).evaluateAll((els) => els.map((e) => e.getAttribute('aria-label')))
    const stored = rowsReport('social.comments', `author_id = '${idB}' and deleted_at is null`, 'id, created_at, post_id, left(body, 40) as body')
    check('after a reload, the comment count is still 1', await pageB.getByRole('link', { name: 'Comments (1)' }).isVisible(), `page shows ${JSON.stringify(shown)}; stored ${stored.detail}`)
  }
  const appStorage = await pageB.evaluate(() => Object.keys(localStorage).filter((k) => !/^sb-/.test(k)))
  check('no social data is kept in browser storage', appStorage.length === 0, appStorage.join(','))

  // 5. Following is unlimited; My Clique holds at most 25. The database
  //    refuses a 26th even through the API, and at 25 the page offers an
  //    atomic replacement instead.
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
    check('a 26th Clique creator is refused by the database', extra.status >= 400 && JSON.stringify(extra.body).includes('clique_full'), JSON.stringify(extra.body).slice(0, 80))
    const anon = await rpc(null, 'app_clique_replace', { p_remove: others[0], p_add: others[24] })
    check('signed-out visitors cannot replace Clique creators', anon.status === 401 || anon.status === 403 || anon.status === 404, String(anon.status))

    await pageB.goto(`${APP}/app/clique`)
    await pageB.getByLabel('25 of 25 in your Clique').waitFor()
    check('the Clique page lists all 27 followed creators in Following', (await pageB.getByRole('region', { name: 'Following' }).getByRole('listitem').count()) === 27)
    const add = pageB.getByRole('button', { name: 'Add Maker 25 to your Clique' })
    await add.click()
    const dialog = pageB.getByRole('dialog', { name: 'Your Clique is full' })
    await dialog.waitFor()
    await pageB.keyboard.press('Escape')
    await dialog.waitFor({ state: 'detached' })
    check('Escape closes the replacement dialog and returns focus to the button', await add.evaluate((el) => el === document.activeElement))
    await add.click()
    await dialog.getByRole('radio', { name: /Maker 1\b/ }).check()
    const replaceStatus = await answered(pageB, 'app_clique_replace', () => dialog.getByRole('button', { name: 'Replace' }).click())
    check('the server accepted the replacement', replaceStatus === 204 || replaceStatus === 200, String(replaceStatus))
    await dialog.waitFor({ state: 'detached' })
    await pageB.getByRole('button', { name: 'Add Maker 1 to your Clique' }).waitFor()
    check(
      'the replacement swapped Maker 1 for Maker 25 in one step: still 25, Maker 1 still followed, closed as "replaced"',
      sql(`select (select count(*) from social.clique_members where fan_id = '${idB}' and removed_at is null)
        || '|' || (select count(*) from social.clique_members where fan_id = '${idB}' and creator_id = '${others[0]}' and removal_reason = 'replaced')
        || '|' || (select count(*) from social.clique_members where fan_id = '${idB}' and creator_id = '${others[24]}' and removed_at is null)
        || '|' || (select count(*) from social.follows where follower_id = '${idB}' and creator_id = '${others[0]}')`) === '25|1|1|1',
    )
    const failed = await rpc(tokenB, 'app_clique_replace', { p_remove: others[0], p_add: others[25] })
    check('a replacement naming someone no longer in the Clique is refused and changes nothing',
      failed.status >= 400 && JSON.stringify(failed.body).includes('not_in_clique')
        && sql(`select count(*) from social.clique_members where fan_id = '${idB}' and removed_at is null`) === '25'
        && sql(`select count(*) from social.clique_members where fan_id = '${idB}' and creator_id = '${others[25]}'`) === '0')

    // A stale choice: another device replaces Maker 3 while the dialog is open.
    await pageB.getByRole('button', { name: 'Add Maker 26 to your Clique' }).click()
    await dialog.waitFor()
    await dialog.getByRole('radio', { name: /Maker 3\b/ }).check()
    const elsewhere = await rpc(tokenB, 'app_clique_replace', { p_remove: others[2], p_add: others[0] })
    check('another device replaced Maker 3 while the dialog was open', elsewhere.status === 204 || elsewhere.status === 200, String(elsewhere.status))
    const staleErrorsBefore = consoleErrors.length
    const staleStatus = await answered(pageB, 'app_clique_replace', () => dialog.getByRole('button', { name: 'Replace' }).click())
    await dialog.getByRole('alert').waitFor()
    // The refusal is on purpose; the browser logs its 400. Remove only that one.
    for (let i = consoleErrors.length - 1; i >= staleErrorsBefore; i--) {
      if (/status of 400/.test(consoleErrors[i])) { consoleErrors.splice(i, 1); break }
    }
    await dialog.getByRole('radio', { name: /Maker 3\b/ }).waitFor({ state: 'detached' })
    check(
      'the stale replacement is refused, the dialog stays open with the error, and the list is refreshed',
      staleStatus >= 400
        && /Nothing was changed/.test(await dialog.getByRole('alert').textContent())
        && (await dialog.getByRole('radio', { name: /Maker 1\b/ }).count()) === 1
        && (await dialog.getByRole('radio').count()) === 25
        && sql(`select count(*) from social.clique_members where fan_id = '${idB}' and removed_at is null`) === '25'
        && sql(`select count(*) from social.clique_members where fan_id = '${idB}' and creator_id = '${others[25]}'`) === '0',
      String(staleStatus),
    )
    await dialog.getByRole('button', { name: 'Cancel' }).click()
    await dialog.waitFor({ state: 'detached' })

    await pageB.getByRole('region', { name: 'My Clique' }).getByRole('button', { name: 'Remove Maker 2 from your Clique (you keep following them)' }).click()
    await pageB.getByLabel('24 of 25 in your Clique').waitFor()
    check('removing from the Clique keeps the follow', sql(`select count(*) from social.follows where follower_id = '${idB}' and creator_id = '${others[1]}'`) === '1')
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
  await pageA.getByTestId('post').filter({ hasText: postText }).waitFor()
  check('A sees one comment on their post', await pageA.getByRole('link', { name: 'Comments (1)' }).isVisible())
  await pageA.getByRole('button', { name: 'Delete post' }).click()
  await pageA.getByRole('button', { name: 'Delete', exact: true }).click()
  await pageA.getByText(`You haven't posted yet.`).waitFor()
  check('A deleted their post (kept as deleted, never shown)', sql(`select count(*) from social.posts where author_id = '${idA}' and deleted_at is not null`) === '1')

  // 7b. Publishing reliability (issue #48): a double click, and a retry after
  // an answer that never arrived, each store one post or comment. The page
  // sends a request id, and the database returns the first row for a repeat.
  {
    const errorsBefore = consoleErrors.length
    const countWhere = (table, where) => rowsReport(table, where)
    await pageA.goto(`${APP}/app`)
    await pageA.getByRole('heading', { name: 'Home' }).waitFor()

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
    await pageA.getByTestId('post').filter({ hasText: lost }).getByRole('link', { name: 'Comments (0)' }).click()
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
      await page.goto(`${APP}/app/discover`)
      await page.getByRole('search').waitFor()
      await page.getByRole('listitem').first().waitFor()
      const discoverSideways = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
      const discoverClipped = await page.evaluate(() => [...document.querySelectorAll('main button, main a')].filter((e) => { const r = e.getBoundingClientRect(); return r.width > 0 && (r.left < 0 || r.right > document.documentElement.clientWidth) }).length)
      check(`at ${width}px, Discover has no sideways scrolling or clipped controls`, discoverSideways <= 0 && discoverClipped === 0, `${discoverSideways}px, ${discoverClipped} clipped`)
      await page.screenshot({ path: `${process.env.SCREENSHOT_DIR || '/tmp'}/discover-${width}.png`, fullPage: false })
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
