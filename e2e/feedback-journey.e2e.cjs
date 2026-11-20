// Build 5.2c: member feedback and the founder's inbox in a real browser,
// against a real LOCAL Supabase with the vercel.json security headers
// applied. T (a tester, on a phone) sends feedback from Home's header; F (the
// founder, on a laptop) reviews it in the inbox, changes its status and adds
// a private note. Run through scripts/e2e/auth-journey.sh.
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
const PASSWORD = 'Feedback-Journey-42-pass'
let failures = 0
const check = (name, ok, detail = '') => {
  if (!ok) failures++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`)
}
const sql = (q) => execFileSync('psql', [DB, '-v', 'ON_ERROR_STOP=1', '-qAt', '-c', q]).toString().trim()
const admin = { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, 'Content-Type': 'application/json' }

async function member(tag, name, cohort = 'tester') {
  const email = `${tag}-${RUN}@example.test`
  const r = await fetch(`${API}/auth/v1/admin/users`, { method: 'POST', headers: admin, body: JSON.stringify({ email, password: PASSWORD, email_confirm: true }) })
  const { id } = await r.json()
  sql(`update public.profiles set username = '${tag}_${RUN}', display_name = '${name}' where id = '${id}'`)
  sql(`select ops.grant_member_access('${id}', '${cohort}', 'feedback-journey')`)
  sql(`insert into social.profile_details (user_id, onboarded_at) values ('${id}', now())`)
  return { id, email, name, username: `${tag}_${RUN}` }
}
async function axe(page, scope) {
  await page.evaluate(AXE)
  return page.evaluate(
    async (sel) =>
      (await window.axe.run(sel ? document.querySelector(sel) : document, { runOnly: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] })).violations.map(
        (v) => `${v.id} x${v.nodes.length} [${v.nodes.map((n) => n.target.join(' ')).join('; ').slice(0, 140)}]`,
      ),
    scope || null,
  )
}
async function newContext(browser, opts = {}) {
  const ctx = await browser.newContext(opts)
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
  return ctx
}
async function signIn(page, email) {
  await page.goto(`${APP}/sign-in?next=%2Fapp`)
  await page.getByLabel('Email address', { exact: true }).fill(email)
  await page.getByLabel('Password', { exact: true }).fill(PASSWORD)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await page.getByRole('heading', { name: 'Home' }).waitFor()
}


const sideways = (page) => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)

;(async () => {
  const browser = await chromium.launch({ args: ['--disable-features=LocalNetworkAccessChecks,BlockInsecurePrivateNetworkRequests,PrivateNetworkAccessSendPreflights'] })
  const T = await member('fbt', 'Tara Tester')
  const F = await member('fbf', 'Fola Founder', 'founder')
  const cspViolations = []
  const MESSAGE = `The feed did not refresh after I posted (${RUN}).`

  // 1. T, on a phone, sends feedback from Home's header.
  const ctxT = await newContext(browser, { viewport: { width: 390, height: 844 } })
  const pageT = await ctxT.newPage()
  pageT.on('console', (m) => /Content Security Policy/i.test(m.text()) && cspViolations.push(m.text()))
  await signIn(pageT, T.email)
  const headerLink = pageT.getByRole('banner').getByRole('link', { name: 'Send feedback' })
  await headerLink.waitFor()
  check('on a phone, Send feedback is in the header', await headerLink.isVisible())
  await headerLink.click()
  await pageT.getByRole('heading', { name: 'Help us improve Splitpost' }).waitFor()
  check('the page has the approved title and supporting text', await pageT.getByText('Your feedback helps us build a better experience for creators and fans.').isVisible())
  await pageT.getByText(/^Sent from:/).waitFor()
  check('the form says it was opened from Home', /Sent from: Home\./.test(await pageT.getByText(/^Sent from:/).textContent()))
  check('the URL carries no context (nothing in the address or query string)', new URL(pageT.url()).pathname === '/app/feedback' && new URL(pageT.url()).search === '')
  {
    const v = await axe(pageT)
    check('the feedback form has no WCAG 2.2 AA violations', v.length === 0, v.join(', '))
    check('at 390px, the form has no sideways scrolling', (await sideways(pageT)) <= 0)
    await pageT.setViewportSize({ width: 320, height: 700 })
    check('at 320px, the form has no sideways scrolling', (await sideways(pageT)) <= 0)
    await pageT.setViewportSize({ width: 390, height: 844 })
  }
  // Keyboard only: choose a category with the arrow keys, type, submit with Enter on the button.
  await pageT.getByRole('button', { name: 'Submit feedback' }).click()
  check('submitting without a category explains what to do', (await pageT.getByRole('alert').textContent()) === 'Choose what kind of feedback this is.')
  await pageT.getByRole('radio', { name: 'Report a problem' }).focus()
  await pageT.keyboard.press('Space')
  check('a category can be chosen with the keyboard', await pageT.getByRole('radio', { name: 'Report a problem' }).isChecked())
  const box = pageT.getByRole('textbox', { name: 'Tell us more' })
  check('the description has a placeholder for the chosen category', /What happened, and what did you expect/.test(await box.getAttribute('placeholder')))
  await box.fill('Too short')
  await pageT.getByRole('button', { name: 'Submit feedback' }).click()
  check('a description under 10 characters is refused before sending', (await pageT.getByRole('alert').textContent()) === 'Please write at least 10 characters.')
  check('nothing was stored yet', sql(`select count(*) from ops.feedback where submitter_id = '${T.id}'`) === '0')
  await box.fill(MESSAGE)
  const sends = []
  pageT.on('request', (r) => r.url().includes('/rpc/app_feedback_submit') && sends.push(r.postDataJSON()))
  // Two quick taps.
  await pageT.getByRole('button', { name: 'Submit feedback' }).dblclick()
  await pageT.getByText('Thanks for sharing! Your feedback has been received.').waitFor()
  check('T sees the approved confirmation', true)
  check('a double tap sends one request', sends.length === 1, String(sends.length))
  check('the request names only a category, a feature from the list, the text and a request id',
    sends.length === 1 && JSON.stringify(Object.keys(sends[0]).sort()) === JSON.stringify(['p_body', 'p_category', 'p_feature', 'p_request_id']) && sends[0].p_feature === 'home')
  const row = sql(`select category || '|' || feature || '|' || cohort || '|' || status || '|' || body from ops.feedback where submitter_id = '${T.id}'`)
  check('exactly one entry is stored: problem, from Home, with T\'s role, status new', row === `problem|home|tester|new|${MESSAGE}`, row)
  {
    const v = await axe(pageT)
    check('the confirmation has no WCAG 2.2 AA violations', v.length === 0, v.join(', '))
  }

  // From Discover, the context follows the page.
  await pageT.getByRole('link', { name: 'Discover' }).first().click()
  await pageT.getByRole('heading', { name: 'Discover' }).first().waitFor()
  await pageT.getByRole('banner').getByRole('link', { name: 'Send feedback' }).click()
  await pageT.getByText(/^Sent from:/).waitFor()
  check('opened from Discover, the form says Discover', /Sent from: Discover\./.test(await pageT.getByText(/^Sent from:/).textContent()))

  // T can't open the founder's inbox.
  await pageT.goto(`${APP}/app/feedback/inbox`)
  await pageT.getByRole('heading', { name: "This page isn't available" }).waitFor()
  check('a member who is not the founder can\'t open the inbox', true)
  check('a member sees no link to the inbox', (await pageT.getByRole('link', { name: 'Open the feedback inbox' }).count()) === 0)

  // 2. F, the founder, on a laptop: the sidebar entry, the inbox, status and a note.
  const ctxF = await newContext(browser, { viewport: { width: 1280, height: 900 } })
  const pageF = await ctxF.newPage()
  pageF.on('console', (m) => /Content Security Policy/i.test(m.text()) && cspViolations.push(m.text()))
  await signIn(pageF, F.email)
  const side = pageF.getByRole('navigation', { name: 'Main' }).first().getByRole('link', { name: 'Send feedback' })
  await side.waitFor()
  check('on a laptop, Send feedback is in the sidebar', await side.isVisible())
  await side.click()
  await pageF.getByRole('link', { name: 'Open the feedback inbox' }).click()
  await pageF.getByRole('heading', { name: 'Feedback inbox' }).waitFor()
  const item = pageF.getByRole('link').filter({ hasText: MESSAGE })
  await item.waitFor()
  check('the founder sees T\'s feedback with name, role and where it was sent from', /Tara Tester \(@fbt_\d+\) · Tester · Home/.test(await item.textContent()))
  check('no email address is shown', !/@example\.test/.test(await pageF.locator('main').textContent()))
  {
    const v = await axe(pageF)
    check('the inbox has no WCAG 2.2 AA violations', v.length === 0, v.join(', '))
  }
  await pageF.getByRole('combobox', { name: 'Category' }).selectOption('praise')
  await pageF.getByRole('heading', { name: 'Nothing matches these filters' }).waitFor()
  check('filtering by category works', true)
  await pageF.getByRole('combobox', { name: 'Category' }).selectOption('')
  await pageF.getByRole('combobox', { name: 'Role' }).selectOption('tester')
  await item.waitFor()
  check('filtering by role works', true)
  await item.click()
  await pageF.getByRole('heading', { name: 'Problem' }).waitFor()
  await pageF.getByRole('combobox', { name: 'Status' }).selectOption('reviewing')
  await pageF.getByRole('button', { name: 'Save status' }).click()
  await pageF.getByText('Status changed to Reviewing.').waitFor()
  await pageF.getByRole('textbox', { name: 'Add a note' }).fill('Reproduced on an iPhone.')
  await pageF.getByRole('button', { name: 'Add note' }).click()
  await pageF.getByText('Note added.').waitFor()
  check('the founder changes the status and adds a private note', sql(`select status from ops.feedback where submitter_id = '${T.id}'`) === 'reviewing'
    && sql(`select count(*) from ops.feedback_notes n join ops.feedback f on f.id = n.feedback_id where f.submitter_id = '${T.id}'`) === '1')
  check('both are in the audit trail, without the note text',
    sql(`select string_agg(action || ':' || coalesce(from_status, '') || '>' || coalesce(to_status, ''), ',' order by a.id) from ops.feedback_actions a join ops.feedback f on f.id = a.feedback_id where f.submitter_id = '${T.id}'`) === 'status_changed:new>reviewing,note_added:>'
    && sql("select count(*) from ops.feedback_actions where detail ilike '%iPhone%'") === '0')
  {
    const v = await axe(pageF)
    check('the entry page has no WCAG 2.2 AA violations', v.length === 0, v.join(', '))
  }
  // Back on a phone width, the inbox fits.
  await pageF.setViewportSize({ width: 360, height: 800 })
  await pageF.goto(`${APP}/app/feedback/inbox`)
  await pageF.getByRole('heading', { name: 'Feedback inbox' }).waitFor()
  check('at 360px, the inbox has no sideways scrolling', (await sideways(pageF)) <= 0)
  check('no Content Security Policy violation', cspViolations.length === 0, cspViolations.join(' | ').slice(0, 200))

  await browser.close()
  console.log(failures === 0 ? 'ALL CHECKS PASSED' : `${failures} CHECK(S) FAILED`)
  process.exit(failures === 0 ? 0 : 1)
})().catch((e) => {
  console.error(e)
  process.exit(1)
})
