// Stage 5.2a: reporting and founder-only moderation in a real browser,
// against a real LOCAL Supabase, with the vercel.json security headers
// applied. B reports A's post (a safety report); A's pages never reveal who
// reported; a moderator (granted by server code) hides it, and it disappears
// for everyone; then restores it. Run through scripts/e2e/auth-journey.sh.
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
const PASSWORD = 'Moderation-Journey-42'
let failures = 0
const check = (name, ok, detail = '') => {
  if (!ok) failures++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`)
}
const sql = (q) => execFileSync('psql', [DB, '-v', 'ON_ERROR_STOP=1', '-qAt', '-c', q]).toString().trim()
const adminHeaders = { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, 'Content-Type': 'application/json' }

// A granted pilot member with a complete profile who has finished setup.
async function member(tag, displayName) {
  const email = `${tag}-${RUN}@example.test`
  const r = await fetch(`${API}/auth/v1/admin/users`, { method: 'POST', headers: adminHeaders, body: JSON.stringify({ email, password: PASSWORD, email_confirm: true }) })
  const body = await r.json()
  if (!r.ok) throw new Error(`could not create ${tag}: ${JSON.stringify(body)}`)
  const id = body.id
  const username = `${tag}_${RUN}`
  sql(`update public.profiles set username = '${username}', display_name = '${displayName}' where id = '${id}'`)
  sql(`select ops.grant_member_access('${id}', 'tester', 'moderation-journey')`)
  sql(`insert into social.profile_details (user_id, onboarded_at) values ('${id}', now())`)
  return { id, email, username, displayName }
}

// scope: a CSS selector to check only part of the page (the open dialog).
async function axe(page, scope) {
  await page.evaluate(AXE)
  return page.evaluate(async (sel) =>
    (await window.axe.run(sel ? document.querySelector(sel) : document, { runOnly: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] })).violations.map(
      (v) => `${v.id} x${v.nodes.length} [${v.nodes.map((n) => n.target.join(' ')).join('; ').slice(0, 160)}]`,
    ),
    scope || null,
  )
}
async function fits(page, label) {
  const desktop = page.viewportSize()
  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 760 })
    const result = await page.evaluate(() => ({
      sideways: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      clipped: [...document.querySelectorAll('main button, main a, [role="dialog"] button')].filter((e) => {
        const r = e.getBoundingClientRect()
        return r.width > 0 && (r.left < 0 || r.right > document.documentElement.clientWidth)
      }).length,
    }))
    check(`at ${width}px, ${label} has no sideways scrolling or clipped controls`, result.sideways <= 0 && result.clipped === 0, `${result.sideways}px, ${result.clipped} clipped`)
  }
  if (desktop) await page.setViewportSize(desktop)
}

// Every member-function answer a context receives, to prove the reporter never appears.
async function newContext(browser, responses) {
  const ctx = await browser.newContext()
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
  if (responses) {
    ctx.on('response', async (res) => {
      if (!new URL(res.url()).pathname.startsWith('/rest/v1/')) return
      try {
        responses.push(await res.text())
      } catch {
        /* the page moved on */
      }
    })
  }
  return ctx
}

async function signIn(page, email) {
  await page.goto(`${APP}/sign-in?next=%2Fapp`)
  await page.getByLabel('Email address', { exact: true }).fill(email)
  await page.getByLabel('Password', { exact: true }).fill(PASSWORD)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await page.waitForURL(`${APP}/app`)
  await page.getByRole('heading', { name: 'Home' }).waitFor()
}

;(async () => {
  const browser = await chromium.launch({
    args: ['--disable-features=LocalNetworkAccessChecks,BlockInsecurePrivateNetworkRequests,PrivateNetworkAccessSendPreflights'],
  })
  const A = await member('moda', 'Ada Author')
  const B = await member('modb', 'Ben Reporter')
  const M = await member('modm', 'Mo Moderator')
  const postText = `A post that crosses a line (${RUN})`
  sql(`insert into social.follows (follower_id, creator_id) values ('${B.id}', '${A.id}'), ('${M.id}', '${A.id}')`)
  const postId = sql(`insert into social.posts (author_id, body) values ('${A.id}', '${postText}') returning id`)
  // The founder grants moderation through server code (as in docs/MODERATION.md).
  sql(`select ops.grant_moderator('${M.id}', 'founder', 'moderation journey')`)
  check('granting moderation is recorded with who granted it', sql(`select action || ':' || actor from ops.moderator_events where user_id = '${M.id}'`) === 'granted:founder')

  // 1. B reports A's post: safety notice, reasons, a priority report.
  const ctxB = await newContext(browser)
  const pageB = await ctxB.newPage()
  await signIn(pageB, B.email)
  const post = pageB.getByTestId('post').filter({ hasText: postText })
  await post.waitFor()
  check("B's own posts and other members' posts: Report shows only on other people's", (await post.getByRole('button', { name: `More options for this post by ${A.displayName}` }).count()) === 1)
  // Report is in the post's "···" menu.
  await post.getByRole('button', { name: `More options for this post by ${A.displayName}` }).click()
  await post.getByRole('button', { name: `Report this post by ${A.displayName}` }).click()
  const dialog = pageB.getByRole('dialog', { name: 'Report this post' })
  await dialog.waitFor()
  check('the report dialog starts with the safety notice', ((await dialog.getByRole('note').innerText()) || '').includes("Reporting isn't an emergency service"))
  {
    // The dialog only, once its opening animation has finished (the feed
    // behind it is checked by its own journey).
    await pageB.waitForTimeout(400)
    const v = await axe(pageB, '[role="dialog"]')
    check('the report dialog has no WCAG 2.2 AA violations', v.length === 0, v.join(', '))
    await fits(pageB, 'the report dialog')
  }
  await dialog.getByRole('radio', { name: 'Violence or threats' }).check()
  await dialog.getByLabel('Anything else we should know? (optional)').fill('They threatened another member.')
  await dialog.getByRole('button', { name: 'Send report' }).click()
  await dialog.getByTestId('report-sent').waitFor()
  const sentText = await dialog.getByTestId('report-sent').innerText()
  check('B is thanked, told the person isn\'t told who reported, and that safety reports are reviewed first but not around the clock',
    sentText.includes("We'll review this") && sentText.includes("isn't told who reported them") && sentText.includes('not around the clock'))
  check('the report is stored once, flagged for priority, with B as reporter (server side only)',
    sql(`select count(*) || ':' || bool_and(priority) || ':' || bool_and(reporter_id = '${B.id}') from ops.content_reports where target_id = '${postId}'`) === '1:true:true')
  await dialog.getByRole('button', { name: 'Done' }).click()
  check('reporting hides nothing by itself', await post.isVisible())
  await post.getByRole('button', { name: `Report this post by ${A.displayName}` }).click()
  await dialog.getByRole('radio', { name: 'Spam or scam' }).check()
  await dialog.getByRole('button', { name: 'Send report' }).click()
  check('a second report of the same post is refused politely', ((await dialog.getByTestId('report-sent').innerText()) || '').includes("You've already reported this"))
  await dialog.getByRole('button', { name: 'Done' }).click()
  await pageB.goto(`${APP}/app/moderation`)
  await pageB.getByText("This page isn't available").waitFor()
  check('a member who is not a moderator gets no moderation page', true)

  // 2. A uses the app: nothing A receives identifies B as the reporter.
  const seenByA = []
  const ctxA = await newContext(browser, seenByA)
  const pageA = await ctxA.newPage()
  await signIn(pageA, A.email)
  await pageA.goto(`${APP}/app/u/${A.username}`)
  await pageA.getByTestId('post-tile').filter({ hasText: postText }).waitFor()
  await pageA.goto(`${APP}/app/profile`)
  await pageA.getByRole('heading', { name: 'Settings' }).waitFor()
  check('the reported member sees no Moderation link', (await pageA.getByRole('link', { name: 'Moderation' }).count()) === 0)
  const leaks = seenByA.filter((t) => t.includes(B.id) || t.includes(B.username) || t.includes('content_reports') || t.includes('They threatened'))
  check(`nothing the reported member's app receives (${seenByA.length} responses) identifies the reporter or the report`, seenByA.length > 0 && leaks.length === 0, `${leaks.length} leaking`)

  // 3. The moderator: queue (safety first), report, Hide.
  const ctxM = await newContext(browser)
  const pageM = await ctxM.newPage()
  await signIn(pageM, M.email)
  await pageM.goto(`${APP}/app/profile`)
  await pageM.getByRole('link', { name: 'Moderation' }).click()
  const queue = pageM.getByRole('list', { name: 'Open reports' })
  await queue.waitFor()
  const first = queue.getByRole('listitem').first()
  check('the queue shows the safety report first, flagged', ((await first.innerText()) || '').includes('Priority: safety') && ((await first.innerText()) || '').includes('Violence or threats'))
  check('the queue never shows who reported', !((await pageM.locator('main').innerText()) || '').includes(B.displayName) && !((await pageM.locator('main').innerText()) || '').includes(B.username))
  {
    const v = await axe(pageM)
    check('the moderation queue has no WCAG 2.2 AA violations', v.length === 0, v.join(', '))
    await fits(pageM, 'the moderation queue')
  }
  await first.getByRole('link').click()
  await pageM.getByText('They threatened another member.').waitFor()
  check('the report shows what was reported and that it is still visible', await pageM.getByText('Visible to members').isVisible())
  {
    const v = await axe(pageM)
    check('the report page has no WCAG 2.2 AA violations', v.length === 0, v.join(', '))
    await fits(pageM, 'the report page')
  }
  await pageM.getByLabel('Note for the record (optional)').fill('Threat confirmed.')
  await pageM.getByRole('button', { name: 'Hide' }).click()
  await pageM.getByText('Hidden. Members can no longer see it.').waitFor()
  check('hiding is recorded in the audit trail with the moderator and the note',
    sql(`select action || ':' || (actor_id = '${M.id}') || ':' || note from ops.moderation_actions where target_id = '${postId}'`) === 'hide:true:Threat confirmed.')

  // 4. Hidden for everyone: feed, the author's own page, the post's own page.
  await pageB.goto(`${APP}/app`)
  await pageB.getByRole('heading', { name: 'Home' }).waitFor()
  await pageB.waitForTimeout(500)
  check("the hidden post is gone from B's feed", (await pageB.getByTestId('post').filter({ hasText: postText }).count()) === 0)
  await pageB.goto(`${APP}/app/post/${postId}`)
  await pageB.getByText("This post isn't available").waitFor()
  check("the hidden post's own page is not available", true)
  await pageA.goto(`${APP}/app/u/${A.username}`)
  await pageA.getByRole('heading', { name: 'Posts' }).waitFor()
  await pageA.waitForTimeout(500)
  check("the hidden post is gone from the author's own page", (await pageA.getByTestId('post-tile').filter({ hasText: postText }).count()) === 0 && (await pageA.getByTestId('post').filter({ hasText: postText }).count()) === 0)

  // 5. Restore brings it back.
  await pageM.getByRole('button', { name: 'Restore' }).click()
  await pageM.getByText('Restored. Members can see it again.').waitFor()
  await pageB.goto(`${APP}/app`)
  await pageB.getByTestId('post').filter({ hasText: postText }).waitFor()
  check('after Restore, the post is back in the feed', true)
  check('every action is in the append-only audit trail', sql(`select string_agg(action, ',' order by id) from ops.moderation_actions where target_id = '${postId}'`) === 'hide,restore')

  // 6. Build 5.2b: the Clique confirmation on "People you might like" (a
  //    fresh member who hasn't finished setup), then the same state on Discover.
  {
    const email = `modc-${RUN}@example.test`
    const r = await fetch(`${API}/auth/v1/admin/users`, { method: 'POST', headers: adminHeaders, body: JSON.stringify({ email, password: PASSWORD, email_confirm: true }) })
    const C = await r.json()
    sql(`update public.profiles set username = 'modc_${RUN}', display_name = 'Cleo New' where id = '${C.id}'`)
    sql(`select ops.grant_member_access('${C.id}', 'tester', 'moderation-journey')`)
    const ctxC = await newContext(browser)
    const pageC = await ctxC.newPage()
    await pageC.goto(`${APP}/sign-in?next=%2Fapp`)
    await pageC.getByLabel('Email address', { exact: true }).fill(email)
    await pageC.getByLabel('Password', { exact: true }).fill(PASSWORD)
    await pageC.getByRole('button', { name: 'Sign in' }).click()
    await pageC.getByRole('heading', { name: 'What brings you to Splitpost?' }).waitFor()
    await pageC.getByRole('button', { name: 'Skip the rest' }).click()
    await pageC.getByRole('heading', { name: 'People you might like' }).waitFor()
    const card = pageC.getByTestId('suggested-people').getByRole('listitem').filter({ hasText: A.displayName })
    await card.getByRole('button', { name: `Follow ${A.displayName}` }).click()
    await card.getByTestId('follow-confirmation').getByRole('button', { name: `Join Clique (${A.displayName})` }).click()
    await card.getByRole('button', { name: `In your Clique (${A.displayName}, tap to remove)` }).waitFor()
    check('on "People you might like", adding to the Clique says "Added to your Clique!" and shows "In your Clique"',
      ((await card.getByTestId('relationship-notice').innerText()) || '').includes('Added to your Clique!'))
    await pageC.waitForTimeout(800)
    check('the card keeps "In your Clique" (no stale "Join Clique")',
      (await card.getByRole('button', { name: `Join Clique (${A.displayName})` }).count()) === 0
        && (await card.getByRole('button', { name: `In your Clique (${A.displayName}, tap to remove)` }).count()) === 1)
    check('the Clique membership is stored once', sql(`select count(*) from social.clique_members where fan_id = '${C.id}' and creator_id = '${A.id}' and removed_at is null`) === '1')
    {
      const v = await axe(pageC)
      check('"People you might like" with the confirmation has no WCAG 2.2 AA violations', v.length === 0, v.join(', '))
      await fits(pageC, '"People you might like"')
    }
    await pageC.getByRole('button', { name: 'Continue' }).click()
    await pageC.getByRole('button', { name: 'Go to my feed' }).click()
    await pageC.getByRole('heading', { name: 'Home' }).waitFor()
    await pageC.reload()
    await pageC.goto(`${APP}/app/discover?face=creators`)
    await pageC.getByLabel('Search people, posts and topics').fill(A.username)
    await pageC.getByRole('button', { name: 'Search', exact: true }).click()
    await pageC.getByRole('button', { name: `In your Clique (${A.displayName}, tap to remove)` }).waitFor()
    check('after a reload and navigating to Discover, the person is still "In your Clique"', true)
    await ctxC.close()
  }

  await browser.close()
  console.log(failures === 0 ? 'ALL CHECKS PASSED' : `${failures} CHECK(S) FAILED`)
  process.exit(failures === 0 ? 0 : 1)
})().catch((e) => {
  console.error(e)
  process.exit(1)
})
