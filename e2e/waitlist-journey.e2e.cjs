// The waitlist as people use it: the REAL form (InviteBanner and
// WaitlistForm, mounted by the test-only harness in e2e/harness/waitlist) in
// a real browser, posting to the REAL join-waitlist function in Supabase's
// Edge runtime (e2e/edge/waitlist-e2e, which swaps only Turnstile for a
// stand-in), storing in a LOCAL Supabase database as the restricted
// waitlist_writer login. Run by scripts/e2e/waitlist-journey.sh.
//
// Covers, on desktop and on a phone: one form for everyone (nobody chooses
// creator or fan), validation, consent, two people signing up, what is stored, a repeat signup, a failed bot check, the
// waitlist closed, a channel label, a creator's invitation link (and an
// unknown one), the rate limit, deletion on request, the success screen's way
// to leave, layout on a phone, and accessibility (axe-core, WCAG 2.2 AA).
// Every check prints PASS or FAIL; the process exits non zero on any failure.
const { chromium, devices } = require('playwright')
const { execFileSync } = require('node:child_process')
const { readFileSync } = require('node:fs')
const path = require('node:path')

const env = (k) => {
  const v = process.env[k]
  if (!v) throw new Error(`Missing ${k}; run through scripts/e2e/waitlist-journey.sh`)
  return v
}
const HARNESS = env('HARNESS_URL')
const DB = env('DB_URL')
const ADMIN_DB = env('ADMIN_DB_URL')
for (const u of [DB, ADMIN_DB, HARNESS]) if (!/@?127\.0\.0\.1[:/]/.test(u)) throw new Error('Refusing: local only')

const AXE = readFileSync(path.join(__dirname, '..', 'node_modules', 'axe-core', 'axe.min.js'), 'utf8')
const sql = (q, url = DB) => execFileSync('psql', [url, '-v', 'ON_ERROR_STOP=1', '-qAt', '-c', q]).toString().trim()
const admin = (q) => sql(q, ADMIN_DB)
let failures = 0
const check = (name, ok, detail = '') => {
  if (!ok) failures++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`)
}
const row = (email, cols) => sql(`select ${cols} from ops.waitlist where email = '${email}'`)
const count = (email) => Number(sql(`select count(*) from ops.waitlist where email = '${email}'`))
const resetLimits = () => sql('delete from ops.waitlist_rate_limits')
const CREATOR_ID = '00000000-0000-0000-0000-0000000a11c1'

function cleanup() {
  sql(`delete from ops.waitlist where email like '%@journey.test'; delete from ops.waitlist_rate_limits;
       delete from ops.creator_links where creator_id = '${CREATOR_ID}'; delete from ops.pilot_creators where user_id = '${CREATOR_ID}';
       delete from auth.users where id = '${CREATOR_ID}'`)
}

async function open(page, query = '') {
  await page.goto(`${HARNESS}/${query}`, { waitUntil: 'networkidle' })
  await page.getByTestId('waitlist-form').waitFor()
  // The bot check (stand-in) hands the form its token right away.
  await page.waitForTimeout(150)
}
async function fillRequired(page, email) {
  await page.getByLabel('Email address').fill(email)
  await page.getByLabel("I'm 18 or older.").check()
  await page.getByLabel(/I agree that Splitpost can store these details/).check()
}
// Choices are styled chips: the input is visually hidden, people tap the label.
const choose = (scope, text) => scope.locator('label').filter({ hasText: new RegExp(`^\\s*${text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*$`) }).first().click()
const submit = (page) => page.getByRole('button', { name: 'Join the Waitlist' }).click()
async function outcome(page) {
  const ok = page.getByTestId('waitlist-success')
  const live = page.locator('[aria-live="polite"]')
  await Promise.race([ok.waitFor({ timeout: 8000 }).catch(() => {}), live.filter({ hasText: /\S/ }).waitFor({ timeout: 8000 }).catch(() => {})])
  if (await ok.isVisible()) return 'ok'
  return (await live.innerText()).trim()
}
async function axe(page) {
  await page.addScriptTag({ content: AXE })
  return page.evaluate(async () => (await window.axe.run(document, { runOnly: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] })).violations.map((v) => `${v.id} x${v.nodes.length}`))
}

;(async () => {
  cleanup()
  admin("select waitlist_api.admin_set_notice_version('e2e-notice-1')")
  admin('select waitlist_api.admin_open()')
  const browser = await chromium.launch()

  // ---------------------------------------------------------------- desktop
  {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } })
    const page = await ctx.newPage()
    const consoleErrors = []
    // The browser logs the function's deliberate refusals (400 bot check,
    // 429 rate limit, 503 closed) as failed loads; those are expected here.
    // Anything else, such as a script error, fails the check.
    page.on('console', (m) => {
      if (m.type() !== 'error') return
      if (/^Failed to load resource: the server responded with a status of (400|429|503)/.test(m.text()) && m.location().url.startsWith(env('ENDPOINT'))) return
      consoleErrors.push(m.text())
    })
    page.on('pageerror', (e) => consoleErrors.push(e.message))

    // 1. Validation: nothing is sent until the required answers are given.
    await open(page)
    check('the form offers email, the optional questions, the 18+ and consent boxes, and links the privacy notice',
      (await page.getByLabel('Email address').count()) === 1 && (await page.getByTestId('waitlist-sharing').count()) === 1 &&
      (await page.getByRole('link', { name: 'privacy notice' }).getAttribute('href')) === '/privacy')
    const formText = await page.getByTestId('waitlist-form').innerText()
    check('one form for everyone: nobody is asked to choose creator or fan',
      !/How do you plan to use Splitpost|Create content|Discover and support creators|account type|creator or (a )?fan/i.test(formText) &&
      (await page.locator('input[name="wl-intent"]').count()) === 0)
    let sent = 0
    page.on('request', (r) => r.method() === 'POST' && r.url().startsWith(env('ENDPOINT')) && !r.postData()?.includes('invite_preview') && sent++)
    await submit(page)
    const invalid = await page.locator('[aria-invalid="true"]').count()
    check('submitting empty shows the email, 18+ and consent errors, and sends nothing', invalid >= 3 && sent === 0, `${invalid} marked invalid, ${sent} sent`)
    await page.getByLabel('Email address').fill('not-an-email')
    await submit(page)
    check('a malformed email is refused in the browser', (await page.locator('#wl-email-error').count()) === 1 && sent === 0)
    await fillRequired(page, 'creator@journey.test')
    await page.getByLabel(/I agree that Splitpost can store these details/).uncheck()
    await submit(page)
    check('without consent nothing is sent', sent === 0 && (await page.locator('[aria-invalid="true"]').count()) >= 1)
    check('nothing was stored by the refused attempts', count('creator@journey.test') === 0)

    // 2. Someone who already shares content signs up, with every optional answer.
    await open(page)
    await choose(page, 'Reaching the people who follow me')
    await choose(page, 'Earning more sustainably from my work')
    await choose(page.getByTestId('waitlist-sharing'), 'Yes')
    await page.getByLabel(/Where\?/).selectOption('youtube')
    await page.getByLabel(/Roughly how many followers\?/).selectOption('1k_10k')
    await choose(page.getByTestId('waitlist-introduced'), 'Yes')
    await fillRequired(page, 'Creator@Journey.test')
    await submit(page)
    check('someone who shares content signs up and sees the success screen', (await outcome(page)) === 'ok')
    const leave = page.getByTestId('waitlist-leave')
    check('the success screen says how to leave: email privacy@splitpost.ca',
      (await leave.innerText()).includes('privacy@splitpost.ca') && (await leave.getByRole('link').getAttribute('href')) === 'mailto:privacy@splitpost.ca')
    const c = row('creator@journey.test', "concat_ws('|', coalesce(intent, 'none'), array_to_string(interests, ','), shares_content, platform, audience_band, introduced_by_creator, age_confirmed, waitlist_consent_version, email_verified_at is null, creator_link_id is null)")
    check('stored as answered (no creator or fan choice), lower-cased, unverified, with the notice version shown', c === 'none|reach_followers,sustainable_income|yes|youtube|1k_10k|t|t|e2e-notice-1|t|t', c)
    check('one consent record, for the notice version shown',
      sql("select count(*) || '|' || string_agg(notice_version, ',') from ops.waitlist_consents k join ops.waitlist w on w.id = k.waitlist_id where w.email = 'creator@journey.test' and k.granted") === '1|e2e-notice-1')

    // 3. Someone who mostly wants to discover and support creators signs up
    // through the very same form, skipping the questions that don't apply.
    await open(page)
    await choose(page, 'Supporting creators I care about')
    await fillRequired(page, 'fan@journey.test')
    await submit(page)
    check('someone who skips the sharing questions signs up the same way', (await outcome(page)) === 'ok')
    const f = row('fan@journey.test', "concat_ws('|', coalesce(intent, 'none'), array_to_string(interests, ','), coalesce(shares_content, 'none'), coalesce(platform, 'none'))")
    check('stored as answered, with the skipped questions empty', f === 'none|support_creators|none|none', f)

    // 4. The same address again: the visitor sees success; nothing changes.
    const before = row('fan@journey.test', "concat_ws('|', id, array_to_string(interests, ','), joined_at)")
    await open(page)
    await choose(page, 'Discovering new creators')
    await fillRequired(page, 'fan@journey.test')
    await submit(page)
    check('a repeat signup shows the same success screen (nobody can tell who has joined)', (await outcome(page)) === 'ok')
    check('a repeat signup changes nothing: one entry, the first answers kept', count('fan@journey.test') === 1 && row('fan@journey.test', "concat_ws('|', id, array_to_string(interests, ','), joined_at)") === before)

    // 5. A failed bot check.
    await open(page, '?turnstile=fail')
    await fillRequired(page, 'botcheck@journey.test')
    await submit(page)
    const failed = await outcome(page)
    check('a failed bot check shows an error and the form stays', failed !== 'ok' && failed.length > 0 && (await page.getByTestId('waitlist-form').isVisible()), failed)
    check('a failed bot check stores nothing', count('botcheck@journey.test') === 0)

    // 6. The waitlist closed (the founder's switch).
    admin('select waitlist_api.admin_close()')
    await open(page)
    await fillRequired(page, 'closed@journey.test')
    await submit(page)
    const closed = await outcome(page)
    check('while closed, the visitor is told it isn\'t open right now', /isn't open right now/.test(closed), closed)
    check('while closed, nothing is stored', count('closed@journey.test') === 0)
    admin('select waitlist_api.admin_open()')

    // 7. A channel label from the link.
    await open(page, '?src=ig_bio')
    await fillRequired(page, 'channel@journey.test')
    await submit(page)
    check('a channel label from the link (?src=) is stored with the entry', (await outcome(page)) === 'ok' && row('channel@journey.test', 'source') === 'ig_bio')

    // 8. A creator's invitation link, and an unknown one.
    sql(`insert into auth.users (id, email, email_confirmed_at) values ('${CREATOR_ID}', 'invites@journey.test', now()) on conflict do nothing`)
    admin(`select waitlist_api.admin_accept_creator('${CREATOR_ID}', '{fitness}')`)
    admin(`select waitlist_api.admin_set_creator_public_name('${CREATOR_ID}', 'Priya Raman')`)
    const code = admin(`select waitlist_api.admin_issue_creator_link('${CREATOR_ID}', 90, 'journey')`)
    // Pilot membership (20261122000000): a creator's link works only while the
    // creator has active pilot access, granted by server code.
    check("a creator's link is inactive until the creator has pilot access", sql(`select status from ops.resolve_creator_link('${code}')`) === 'creator_inactive')
    sql(`select ops.grant_member_access('${CREATOR_ID}', 'creator', 'waitlist-journey')`)
    await open(page, `?ref=${code}`)
    const banner = page.getByText('Priya Raman invited you to Splitpost.')
    check('an invitation link shows the creator\'s agreed name', await banner.isVisible().catch(() => false))
    await fillRequired(page, 'invited@journey.test')
    await submit(page)
    const linkId = sql(`select id from ops.creator_links where code = '${code}'`)
    check('the invited signup is attributed to that creator\'s link', (await outcome(page)) === 'ok' && row('invited@journey.test', 'creator_link_id') === linkId)
    check('the signup is counted for the link, with no address or account', Number(sql(`select count(*) from ops.acquisition_events where event = 'waitlist_signup' and creator_link_id = '${linkId}'`)) >= 1)
    await open(page, '?ref=0123456789abcdef0123')
    check('an unknown invitation code shows no creator', (await page.getByText(/invited you to Splitpost/).count()) === 0)
    await fillRequired(page, 'unknownref@journey.test')
    await submit(page)
    check('a signup with an unknown code is accepted, unattributed', (await outcome(page)) === 'ok' && row('unknownref@journey.test', "coalesce(creator_link_id::text, 'none')") === 'none')

    // 9. The rate limit: the browser sends no client address here, so every
    // attempt shares one bucket (10 an hour), and the 11th is limited.
    resetLimits()
    let limitedAt = 0
    for (let i = 1; i <= 12 && !limitedAt; i++) {
      await open(page)
      await fillRequired(page, `rate${i}@journey.test`)
      await submit(page)
      const o = await outcome(page)
      if (o !== 'ok') limitedAt = i
      if (o !== 'ok') check('when limited, the visitor is told to try again later', /Too many attempts/.test(o), o)
    }
    check('the 11th attempt in an hour is limited', limitedAt === 11, `limited at ${limitedAt || 'never'}`)
    check('the limited attempt stored nothing', count(`rate${limitedAt || 11}@journey.test`) === 0)
    resetLimits()

    // 10. Deletion on request: the founder deletes by the entry's id.
    const id = row('creator@journey.test', 'id')
    admin(`select waitlist_api.admin_delete('${id}')`)
    check('deleting on request removes the entry and its consent record',
      count('creator@journey.test') === 0 && Number(sql(`select count(*) from ops.waitlist_consents where waitlist_id = '${id}'`)) === 0)

    // 11. Accessibility.
    await open(page)
    const v = await axe(page)
    check('desktop: no WCAG 2.2 AA violations on the form', v.length === 0, v.join(', '))
    check('desktop: no script errors (only the deliberate refusals were logged)', consoleErrors.length === 0, consoleErrors.slice(0, 2).join(' | '))
    await ctx.close()
  }

  // ------------------------------------------------------------------ phone
  {
    resetLimits()
    const ctx = await browser.newContext({ ...devices['iPhone 13'] })
    const page = await ctx.newPage()
    await open(page)
    const layout = await page.evaluate(() => {
      const button = [...document.querySelectorAll('button')].find((b) => b.textContent.includes('Join the Waitlist')).getBoundingClientRect()
      const email = document.querySelector('#wl-email').getBoundingClientRect()
      return { over: document.documentElement.scrollWidth - window.innerWidth, button: Math.round(button.height), email: Math.round(email.height) }
    })
    check('phone: no sideways scrolling', layout.over <= 0, `${layout.over}px`)
    check('phone: the button and email field are easy to tap (at least 44px tall)', layout.button >= 44 && layout.email >= 44, JSON.stringify(layout))
    await choose(page.getByTestId('waitlist-sharing'), 'Not yet')
    await fillRequired(page, 'phone@journey.test')
    await submit(page)
    check('phone: a signup works and shows the success screen', (await outcome(page)) === 'ok' && count('phone@journey.test') === 1)
    await open(page)
    const v = await axe(page)
    check('phone: no WCAG 2.2 AA violations on the form', v.length === 0, v.join(', '))
    await ctx.close()
  }

  await browser.close()
  admin('select waitlist_api.admin_close()')
  cleanup()
  console.log(failures ? `\n${failures} waitlist journey check(s) failed` : '\nALL CHECKS PASSED')
  process.exit(failures ? 1 : 0)
})().catch((e) => {
  console.error(e)
  try { cleanup() } catch {}
  process.exit(1)
})
