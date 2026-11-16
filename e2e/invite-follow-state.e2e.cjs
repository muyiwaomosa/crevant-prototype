// Follow and "Not now" stay accurate in the sample tour's invitation onboarding,
// across refreshes, navigation and repeated taps, and following someone never
// earns more than the normal follow bonus (an invitation itself earns nothing,
// and there is no money anywhere).
//
//   node e2e/invite-follow-state.e2e.cjs [base-url]
//
// Runs against the tour only (sample data in the browser). It never touches a
// database, an Edge Function or the waitlist.
const { chromium } = require('playwright')

const BASE = (process.argv[2] || 'http://localhost:5199').replace(/\/$/, '')
const CODE = '7c1e94a2b05d3f68e1a9' // jordan's active sample link (src/lib/invites.ts)
const INVITER = 'jordan'
const FOLLOW_BONUS = 10 // EARN_RULES.follow.points
const KEY = 'crevant-demo-state'

let failed = 0
let passed = 0
const check = (name, ok, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`)
  ok ? passed++ : failed++
}

async function state(page) {
  return page.evaluate((k) => JSON.parse(localStorage.getItem(k) || 'null'), KEY)
}
const cpWith = (s, id) => (s?.ledger || []).filter((e) => e.creatorId === id).reduce((n, e) => n + e.amount, 0)
const inviteEntries = (s) => (s?.ledger || []).filter((e) => /invit|referr/i.test(`${e.kind} ${e.label}`))
const moneyFields = (s) => JSON.stringify(s || {}).match(/"(cash|money|payout|usd|gbp|eur|currency)"/gi) || []

async function walkTo(page, decisionClicks) {
  await page.goto(`${BASE}/tour/welcome?invite=${CODE}`)
  await page.getByRole('button', { name: 'Get started' }).click()
  await page.getByRole('button', { name: 'Continue', exact: true }).click()
  const choice = page.getByTestId('invite-choice')
  await choice.waitFor()
  for (const label of decisionClicks) await choice.getByRole('button', { name: label, exact: true }).click()
  return choice
}
async function finish(page) {
  await page.getByRole('button', { name: /continue$/i }).last().click()
  await page.getByRole('button', { name: /Go to my feed|Back to Splitpost/ }).click()
  await page.waitForURL(/\/tour(\/|$)(?!welcome)/)
}
const pressed = async (choice, label) => (await choice.getByRole('button', { name: label, exact: true }).getAttribute('aria-pressed')) === 'true'

;(async () => {
  const browser = await chromium.launch()
  const fresh = async () => {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } })
    const page = await ctx.newPage()
    return { ctx, page }
  }

  // 1. Arriving with an invitation follows nobody and earns nothing.
  {
    const { ctx, page } = await fresh()
    const choice = await walkTo(page, [])
    check('the invitation shows the inviter, with neither choice made', !(await pressed(choice, 'Follow')) && !(await pressed(choice, 'Not now')))
    const s = await state(page)
    check('arriving with an invitation follows nobody and earns nothing', !(s?.following || []).includes(INVITER) && cpWith(s, INVITER) === 0)

    // A refresh before finishing records nothing: the decision is only saved when onboarding ends.
    await choice.getByRole('button', { name: 'Follow', exact: true }).click()
    await page.reload()
    const after = await state(page)
    check('a refresh before finishing saves nothing (no follow, no points, no decision)', !(after?.following || []).includes(INVITER) && cpWith(after, INVITER) === 0 && !after?.invite)
    await ctx.close()
  }

  // 2. Repeated taps: Follow, Not now, Follow, Follow. One follow, one normal bonus.
  {
    const { ctx, page } = await fresh()
    const choice = await walkTo(page, ['Follow', 'Not now', 'Follow', 'Follow'])
    check('after repeated taps the last choice shows (Follow on, Not now off)', (await pressed(choice, 'Follow')) && !(await pressed(choice, 'Not now')))
    await finish(page)
    let s = await state(page)
    check('Follow: the inviter is followed exactly once', s.following.filter((id) => id === INVITER).length === 1)
    check('Follow: the decision is recorded as followed, with a time', s.invite?.decision === 'followed' && typeof s.invite?.decidedAt === 'number')
    check(`Follow: exactly the normal follow bonus (${FOLLOW_BONUS} CP), nothing for the invitation`, cpWith(s, INVITER) === FOLLOW_BONUS && inviteEntries(s).length === 0, `cp=${cpWith(s, INVITER)}`)
    check('no money appears anywhere in the saved state', moneyFields(s).length === 0, moneyFields(s).join(','))

    // Refreshes and navigation keep it exactly as it was.
    for (const path of ['/tour', `/tour/creator/${INVITER}`, '/tour/rewards?tab=cp', '/tour/discover']) {
      await page.goto(`${BASE}${path}`)
      await page.reload()
    }
    s = await state(page)
    check('Follow: unchanged after navigating and refreshing four pages', s.following.filter((id) => id === INVITER).length === 1 && cpWith(s, INVITER) === FOLLOW_BONUS && s.invite?.decision === 'followed')
    await page.goto(`${BASE}/tour/creator/${INVITER}`)
    // The button's accessible name is "Unfollow <name>" while following (it shows "Following").
    const btn = page.getByRole('button', { name: /^Unfollow / }).first()
    check("Follow: the creator's page shows Following", (await btn.isVisible()) && (await btn.innerText()).includes('Following'))

    // Opening the invitation link again must not follow twice or earn again.
    await page.goto(`${BASE}/tour/welcome?invite=${CODE}`)
    await page.goto(`${BASE}/tour`)
    s = await state(page)
    check('Follow: opening the invitation again does not follow twice or earn again', s.following.filter((id) => id === INVITER).length === 1 && cpWith(s, INVITER) === FOLLOW_BONUS)

    // Unfollow and follow again, twice: the bonus is held while following, never stacked.
    for (let i = 0; i < 2; i++) {
      await page.goto(`${BASE}/tour/creator/${INVITER}`)
      await page.getByRole('button', { name: /^Unfollow / }).first().click()
      await page.waitForFunction((k) => !JSON.parse(localStorage.getItem(k)).following.includes('jordan'), KEY)
      const mid = await state(page)
      check(`unfollow #${i + 1}: the follow bonus is taken back (0 CP)`, cpWith(mid, INVITER) === 0, `cp=${cpWith(mid, INVITER)}`)
      await page.getByRole('button', { name: /^Follow / }).first().click()
      await page.waitForFunction((k) => JSON.parse(localStorage.getItem(k)).following.includes('jordan'), KEY)
      const back = await state(page)
      check(`follow again #${i + 1}: back to exactly ${FOLLOW_BONUS} CP, never stacked`, cpWith(back, INVITER) === FOLLOW_BONUS, `cp=${cpWith(back, INVITER)}`)
    }
    await ctx.close()
  }

  // 3. Not now: no follow, no points, and it stays that way.
  {
    const { ctx, page } = await fresh()
    const choice = await walkTo(page, ['Follow', 'Not now'])
    check('after Follow then Not now, Not now shows', (await pressed(choice, 'Not now')) && !(await pressed(choice, 'Follow')))
    await finish(page)
    let s = await state(page)
    check('Not now: the inviter is not followed', !s.following.includes(INVITER))
    check('Not now: the decision is recorded as declined, with a time', s.invite?.decision === 'declined' && typeof s.invite?.decidedAt === 'number')
    check('Not now: no points for anyone from the invitation', cpWith(s, INVITER) === 0 && inviteEntries(s).length === 0)
    for (const path of ['/tour', `/tour/creator/${INVITER}`, '/tour/rewards?tab=cp']) {
      await page.goto(`${BASE}${path}`)
      await page.reload()
    }
    s = await state(page)
    check('Not now: unchanged after navigating and refreshing', !s.following.includes(INVITER) && cpWith(s, INVITER) === 0 && s.invite?.decision === 'declined')
    await page.goto(`${BASE}/tour/creator/${INVITER}`)
    check("Not now: the creator's page offers Follow, not Following", (await page.getByRole('button', { name: /^Follow / }).first().isVisible()) && !(await page.getByRole('button', { name: /^Unfollow / }).first().isVisible()))
    await page.goto(`${BASE}/tour/welcome?invite=${CODE}`)
    await page.goto(`${BASE}/tour`)
    s = await state(page)
    check('Not now: opening the invitation again does not follow anyone', !s.following.includes(INVITER) && cpWith(s, INVITER) === 0)
    await ctx.close()
  }

  // 4. Never choosing leaves it pending, follows nobody and earns nothing.
  {
    const { ctx, page } = await fresh()
    await walkTo(page, [])
    await finish(page)
    const s = await state(page)
    check('no choice: recorded as pending, nobody followed, no points', s.invite?.decision === 'pending' && s.invite?.decidedAt === null && !s.following.includes(INVITER) && cpWith(s, INVITER) === 0)
    await ctx.close()
  }

  // 5. An unusable link: a short note, no inviter, no follow.
  {
    const { ctx, page } = await fresh()
    await page.goto(`${BASE}/tour/welcome?invite=5b8d2e7a1c94f063b2e1`)
    check('a revoked link shows the short note and no inviter', (await page.getByTestId('invite-unusable').isVisible()) && !(await page.getByTestId('invite-banner').isVisible()))
    await ctx.close()
  }

  await browser.close()
  console.log(`\nInvite follow-state checks: ${passed} passed, ${failed} failed`)
  process.exit(failed ? 1 : 0)
})()
