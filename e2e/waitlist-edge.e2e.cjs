// End-to-end checks for the join-waitlist function running in Supabase's Edge
// runtime as the restricted waitlist_writer login, against a LOCAL Supabase
// database. Started by scripts/e2e/waitlist-edge.sh, which provides:
//   EDGE_URL      the function (real handler and database code, stand-in Turnstile)
//   EDGE_BAD_URL  the same function given the database owner's login
//   DB_URL        the local database owner (to inspect and clean up)
//   WRITER_URL    waitlist_writer with a throwaway password
//   ADMIN_URL     waitlist_admin with a throwaway password
// Every check prints PASS or FAIL; the process exits non zero on any failure.

const postgres = require('postgres')

const { EDGE_URL, EDGE_BAD_URL, DB_URL, WRITER_URL, ADMIN_URL } = process.env
const ORIGIN = 'https://site.test'
const NOTICE = 'e2e-notice-1'

let failures = 0
const check = (name, ok, detail = '') => {
  if (!ok) failures++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`)
}
async function denied(fn) {
  try {
    await fn()
    return false
  } catch (e) {
    return /permission denied/.test(e.message)
  }
}

const body = (over = {}) => ({
  email: 'maya@e2e.test',
  interests: ['reach_followers'],
  sharesContent: 'yes',
  platform: 'youtube',
  audienceBand: '1k_10k',
  source: 'newsletter',
  ageConfirmed: true,
  waitlistConsent: true,
  noticeVersion: NOTICE,
  turnstileToken: 'pass:site.test:join',
  website: '',
  ...over,
})
async function post(payload, { origin = ORIGIN, xff = '198.51.100.7', url = EDGE_URL } = {}) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: origin, 'X-Forwarded-For': xff },
    body: JSON.stringify(payload),
  })
  const data = await res.json().catch(() => ({}))
  return { status: res.status, state: data.status }
}

;(async () => {
  const owner = postgres(DB_URL, { max: 1, onnotice: () => {} })
  const writer = postgres(WRITER_URL, { max: 1, prepare: false })
  const admin = postgres(ADMIN_URL, { max: 1, prepare: false })
  const rowOf = async (email) => (await owner`select to_jsonb(w) - 'id' as row from ops.waitlist w where email = ${email}`)[0]?.row
  try {
    await owner`delete from ops.waitlist where email like '%@e2e.test'`
    await owner`delete from ops.waitlist_rate_limits`

    // 1. The function refuses a broader database login.
    const bad = await (await fetch(`${EDGE_BAD_URL}/__config`)).json()
    check('the function refuses any database login but waitlist_writer', bad.ok === false && /waitlist_writer/.test(bad.problem), bad.problem)
    check('given a broader login, it stays closed', (await post(body(), { url: EDGE_BAD_URL })).state === 'closed')
    const good = await (await fetch(`${EDGE_URL}/__config`)).json()
    check('the function accepts the waitlist_writer login', good.ok === true, good.problem)

    // 2. Closed by default: nothing stored.
    check('closed until opened', (await post(body())).state === 'closed')
    check('nothing stored while closed', !(await rowOf('maya@e2e.test')))

    // 3. The admin login opens it (only with a notice version).
    check('the admin login cannot open without a notice version', !(await admin`select waitlist_api.admin_open()`.then(() => true).catch(() => false)))
    await admin`select waitlist_api.admin_set_notice_version(${NOTICE})`
    const opened = (await admin`select waitlist_api.admin_open() as s`)[0].s
    check('the admin login opens the waitlist', opened.submissions === 'ON', JSON.stringify(opened))

    // 4. Origin and CORS.
    const pre = await fetch(EDGE_URL, { method: 'OPTIONS', headers: { Origin: ORIGIN, 'Access-Control-Request-Method': 'POST' } })
    check('preflight from the site is allowed, for content-type only', pre.status === 204 && pre.headers.get('access-control-allow-headers') === 'content-type')
    const preBad = await fetch(EDGE_URL, { method: 'OPTIONS', headers: { Origin: 'https://evil.example', 'Access-Control-Request-Method': 'POST' } })
    check('preflight from another site is refused', preBad.status === 403)
    check('a post from another site is refused', (await post(body(), { origin: 'https://evil.example' })).status === 403)

    // 5. Turnstile hostname and action.
    check('Turnstile failure is refused', (await post(body({ turnstileToken: 'fail' }))).state === 'verification_failed')
    check('a Turnstile pass on another hostname is refused', (await post(body({ turnstileToken: 'pass:evil.example:join' }))).state === 'verification_failed')
    check('a Turnstile pass for another action is refused', (await post(body({ turnstileToken: 'pass:site.test:login' }))).state === 'verification_failed')
    check('nothing stored by refused requests', !(await rowOf('maya@e2e.test')))

    // 6. Honeypot and notice version.
    check('a filled honeypot looks fine', (await post(body({ email: 'bot@e2e.test', website: 'x' }))).state === 'ok')
    check('a filled honeypot stores nothing', !(await rowOf('bot@e2e.test')))
    check('an old notice version is refused', (await post(body({ noticeVersion: 'e2e-notice-0' }))).state === 'notice_changed')

    // 7. A valid submission is stored once, unverified, with its consent record.
    check('a valid submission is accepted', (await post(body({ publicLink: 'https://x.test', campaign: 'c1', marketingConsent: true }))).state === 'ok')
    const first = await rowOf('maya@e2e.test')
    check('it is stored, unverified, with the approved notice version',
      first && first.verified === false && first.email_verified_at === null && first.waitlist_consent_version === NOTICE && first.platform === 'youtube')
    check('no link, campaign or marketing field exists to store', first && !Object.keys(first).some((k) => /link|campaign|marketing/.test(k)))
    const consents = await owner`select count(*)::int as n from ops.waitlist_consents c join ops.waitlist w on w.id = c.waitlist_id where w.email = 'maya@e2e.test'`
    check('one consent record', consents[0].n === 1)

    // 8. A repeat submission changes nothing.
    check('a repeat submission answers ok', (await post(body({ email: 'MAYA@e2e.test', sharesContent: 'not_yet', platform: null, audienceBand: null, source: 'tiktok', interests: [] }), { xff: '198.51.100.8' })).state === 'ok')
    check('the existing entry is unchanged', JSON.stringify(await rowOf('maya@e2e.test')) === JSON.stringify(first))

    // 9. Rate limits use only the trusted hop of X-Forwarded-For.
    for (let i = 1; i <= 10; i++) {
      const r = await post(body({ email: `p${i}@e2e.test` }), { xff: `10.0.0.${i}, 203.0.113.50` })
      if (r.state !== 'ok') check(`submission ${i} from one client`, false, r.state)
    }
    check('an 11th from one client is limited, despite a rotated spoofed address',
      (await post(body({ email: 'p11@e2e.test' }), { xff: '10.0.0.99, 203.0.113.50' })).state === 'rate_limited')
    check('another client is not limited', (await post(body({ email: 'q1@e2e.test' }), { xff: '203.0.113.51' })).state === 'ok')
    const buckets = await owner`select bucket from ops.waitlist_rate_limits`
    check('every rate limit key is a salted 64 character hash', buckets.every((b) => /^(global|email:[0-9a-f]{64}|client:[0-9a-f]{64})$/.test(b.bucket)))

    // 10. What the login roles can NOT do, over real connections.
    check('waitlist_writer cannot read the waitlist', await denied(() => writer`select * from ops.waitlist limit 1`))
    check('waitlist_writer cannot read member profiles', await denied(() => writer`select * from public.profiles limit 1`))
    check('waitlist_writer cannot read auth users', await denied(() => writer`select * from auth.users limit 1`))
    check('waitlist_writer cannot open or close the waitlist', await denied(() => writer`select waitlist_api.admin_close()`))
    check('waitlist_writer cannot call the internal function', await denied(() => writer`select ops.join_waitlist(null,null,null,null,null,null,null,null,null,null,null)`))
    check('waitlist_admin cannot read the waitlist', await denied(() => admin`select * from ops.waitlist limit 1`))
    check('waitlist_admin cannot submit', await denied(() => admin`select waitlist_api.submit(null,null,null,null,null,null,null,null,null,null,null)`))
    check('waitlist_admin cannot read member profiles', await denied(() => admin`select * from public.profiles limit 1`))

    // 11. Admin summary: counts only, unverified apart.
    const summary = (await admin`select waitlist_api.admin_summary() as s`)[0].s
    check('the admin summary has no addresses', !/@/.test(JSON.stringify(summary)))
    check('the admin summary counts unverified entries apart', summary.unverified >= 12 && summary.verified === 0, JSON.stringify({ total: summary.total, unverified: summary.unverified }))

    // 12. Closing is immediate.
    await admin`select waitlist_api.admin_close()`
    check('closing stops submissions at once', (await post(body({ email: 'late@e2e.test' }), { xff: '203.0.113.52' })).state === 'closed')
  } finally {
    await owner`update ops.settings set enabled = false, value = null, updated_at = now() where key in ('waitlist_submissions', 'waitlist_notice_version')`
    await owner`delete from ops.waitlist where email like '%@e2e.test'`
    await owner`delete from ops.waitlist_rate_limits`
    await Promise.all([owner.end(), writer.end(), admin.end()])
  }
  console.log(failures ? `\n${failures} CHECK(S) FAILED` : '\nALL CHECKS PASSED')
  process.exit(failures ? 1 : 0)
})().catch((e) => {
  console.error(e)
  process.exit(1)
})
