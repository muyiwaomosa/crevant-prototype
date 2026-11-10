// End-to-end checks for the join-waitlist function running in Supabase's Edge
// runtime as the restricted waitlist_writer login, against a LOCAL Supabase
// database. Started by scripts/e2e/waitlist-edge.sh, which provides:
//   EDGE_URL      the function (real handler and database code, stand-in Turnstile)
//   EDGE_BAD_URL  the same function given the database owner's login
//   EDGE_HOPS2_URL the same function trusting two proxy hops instead of one
//   DB_URL        the local database owner (to inspect and clean up)
//   WRITER_URL    waitlist_writer with a throwaway password
//   ADMIN_URL     waitlist_admin with a throwaway password
// Every check prints PASS or FAIL; the process exits non zero on any failure.

const http = require('node:http')
const postgres = require('postgres')

const { EDGE_URL, EDGE_BAD_URL, EDGE_HOPS2_URL, DB_URL, WRITER_URL, ADMIN_URL } = process.env
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
async function post(payload, { origin = ORIGIN, xff = '198.51.100.7', url = EDGE_URL, headers = {} } = {}) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: origin, ...(xff === null ? {} : { 'X-Forwarded-For': xff }), ...headers },
    body: JSON.stringify(payload),
  })
  const data = await res.json().catch(() => ({}))
  return { status: res.status, state: data.status }
}
// Sends separate header lines for one name (fetch would join them first),
// as a client can on the wire.
function postRawHeaders(payload, rawHeaders, url = EDGE_URL) {
  return new Promise((resolve, reject) => {
    const req = http.request(url, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: ORIGIN, ...rawHeaders } }, (res) => {
      let text = ''
      res.on('data', (c) => (text += c))
      res.on('end', () => {
        let state
        try {
          state = JSON.parse(text).status
        } catch {}
        resolve({ status: res.statusCode, state })
      })
    })
    req.on('error', reject)
    req.end(JSON.stringify(payload))
  })
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

    // 9b. Forged client addresses, in depth. Each case: ten submissions that
    // should all count against ONE client bucket (10 per hour), varying only
    // what a visitor controls; the eleventh must be limited. Limits are
    // cleared first, and no case runs near the edge of an hourly window.
    let seq = 0
    const email = () => `f${++seq}@e2e.test`
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
    async function awayFromWindowEdge(windowSeconds, marginSeconds) {
      const into = Number((await owner`select extract(epoch from now())::numeric % ${windowSeconds} as s`)[0].s)
      if (windowSeconds - into < marginSeconds) await sleep((windowSeconds - into + 1) * 1000)
    }
    async function freshLimits() {
      await owner`delete from ops.waitlist_rate_limits`
      await awayFromWindowEdge(3600, 30)
    }
    async function oneBucket(name, send) {
      await freshLimits()
      const states = []
      for (let i = 1; i <= 10; i++) states.push((await send(i)).state)
      const eleventh = (await send(11)).state
      check(name, states.every((x) => x === 'ok') && eleventh === 'rate_limited', `${states.join(',')} then ${eleventh}`)
    }
    const forged = (i, n) => Array.from({ length: n }, (_, k) => `198.18.${i}.${k + 1}`).join(', ')

    await oneBucket('many forged X-Forwarded-For entries (12, rotated) change nothing', (i) =>
      post(body({ email: email() }), { xff: `${forged(i, 12)}, 203.0.113.80` }))
    check('a different visitor right after is not limited', (await post(body({ email: email() }), { xff: `${forged(99, 12)}, 203.0.113.180` })).state === 'ok')

    const junk = ['<script>', '999.1.1.1', '', 'unknown', '::::', '203.0.113.81 x', '"', 'a'.repeat(60), '2001:db8::1::2', 'null', '-1']
    await oneBucket('malformed forged entries change nothing', (i) => post(body({ email: email() }), { xff: `${junk[i % junk.length]}${i}, ${junk[(i + 3) % junk.length]}, 203.0.113.81` }))

    await oneBucket('duplicate X-Forwarded-For header lines count as one list (the last entry is trusted)', (i) =>
      i === 11
        ? post(body({ email: email() }), { xff: '203.0.113.82' })
        : postRawHeaders(body({ email: email() }), { 'X-Forwarded-For': [`198.18.0.${i}`, `198.18.1.${i}, 203.0.113.82`] }))

    await oneBucket('X-Real-IP, CF-Connecting-IP, True-Client-IP and Forwarded are ignored', (i) =>
      post(body({ email: email() }), {
        xff: '203.0.113.83',
        headers: { 'X-Real-IP': `198.18.2.${i}`, 'CF-Connecting-IP': `198.18.3.${i}`, 'True-Client-IP': `198.18.4.${i}`, Forwarded: `for=198.18.5.${i}` },
      }))
    check('X-Real-IP naming a limited visitor does not make a request count as that visitor',
      (await post(body({ email: email() }), { xff: '203.0.113.84', headers: { 'X-Real-IP': '203.0.113.83' } })).state === 'ok')

    await oneBucket('IPv6 addresses in one /64 share a bucket', (i) => post(body({ email: email() }), { xff: i === 11 ? '2001:db8:5:6:ffff:ffff:ffff:ffff' : `2001:db8:5:6::${i.toString(16)}` }))
    check('the next /64 is a different visitor', (await post(body({ email: email() }), { xff: '2001:db8:5:7::1' })).state === 'ok')
    check('IPv6 written in capitals is the same /64', (await post(body({ email: email() }), { xff: '2001:DB8:5:6::abc' })).state === 'rate_limited')

    const untrusted = [null, '10.1.2.3', 'junk', '192.168.0.9', '', 'fd00::1', '127.0.0.1', '100.64.1.1', 'fe80::1', '203.0.113.85,', '::1']
    await oneBucket('a missing, malformed or private trusted entry falls into ONE shared bucket (never trusted)', (i) =>
      post(body({ email: email() }), { xff: untrusted[i - 1] }))
    check('a visitor with a real address is unaffected by the shared bucket', (await post(body({ email: email() }), { xff: '203.0.113.86' })).state === 'ok')

    // Two trusted hops: the second entry from the right is the visitor.
    const cfg2 = await (await fetch(`${EDGE_HOPS2_URL}/__config`)).json()
    check('the two-hop instance reads its confirmed hop count', cfg2.trustedHops === 2 && cfg2.ok === true, JSON.stringify(cfg2))
    await oneBucket('with two trusted hops, forged entries and the inner proxy entry change nothing', (i) =>
      post(body({ email: email() }), { url: EDGE_HOPS2_URL, xff: `${forged(i, 3)}, 203.0.113.90, 10.9.9.${i}` }))
    check('with two trusted hops, another visitor is not limited', (await post(body({ email: email() }), { url: EDGE_HOPS2_URL, xff: '203.0.113.91, 10.9.9.1' })).state === 'ok')
    check('with two trusted hops, a header with only one entry is not trusted as that visitor',
      (await post(body({ email: email() }), { url: EDGE_HOPS2_URL, xff: '203.0.113.90' })).state === 'ok')

    // 9c. Rate limit boundaries and resets (time moved by shifting stored windows back).
    await freshLimits()
    for (let i = 1; i <= 10; i++) await post(body({ email: email() }), { xff: '203.0.113.95' })
    check('client limit: the 11th in an hour is limited', (await post(body({ email: email() }), { xff: '203.0.113.95' })).state === 'rate_limited')
    await owner`update ops.waitlist_rate_limits set window_start = window_start - interval '1 hour' where bucket like 'client:%'`
    check('client limit: it resets in the next hour', (await post(body({ email: email() }), { xff: '203.0.113.95' })).state === 'ok')

    await freshLimits()
    await awayFromWindowEdge(86400, 60)
    const same = email()
    const tries = []
    for (let i = 1; i <= 3; i++) tries.push((await post(body({ email: same }), { xff: `203.0.113.${100 + i}` })).state)
    check('email limit: three submissions of one address in a day answer ok', tries.every((x) => x === 'ok'), tries.join(','))
    check('email limit: the 4th is limited, from any client', (await post(body({ email: same.toUpperCase() }), { xff: '203.0.113.110' })).state === 'rate_limited')
    await owner`update ops.waitlist_rate_limits set window_start = window_start - interval '1 day' where bucket like 'email:%'`
    check('email limit: it resets the next day', (await post(body({ email: same }), { xff: '203.0.113.111' })).state === 'ok')

    await freshLimits()
    await awayFromWindowEdge(60, 15)
    await owner`insert into ops.waitlist_rate_limits (bucket, window_start, hits)
      values ('global', to_timestamp(floor(extract(epoch from now()) / 60) * 60), 59)
      on conflict (bucket, window_start) do update set hits = 59`
    check('global limit: the 60th in a minute is accepted', (await post(body({ email: email() }), { xff: '203.0.113.120' })).state === 'ok')
    check('global limit: the 61st is limited, whoever sends it', (await post(body({ email: email() }), { xff: '203.0.113.121' })).state === 'rate_limited')
    await owner`update ops.waitlist_rate_limits set window_start = window_start - interval '1 minute' where bucket = 'global'`
    check('global limit: it resets the next minute', (await post(body({ email: email() }), { xff: '203.0.113.122' })).state === 'ok')
    const keys = await owner`select bucket from ops.waitlist_rate_limits`
    check('rate limit keys never contain an address', keys.every((b) => !/[.@]|2001/.test(b.bucket)))

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

    // 13. Health check: a GET proves the restricted login connects, and says nothing else.
    const h = await fetch(EDGE_URL)
    check('the health check answers ok when the database login connects', h.status === 200 && (await h.text()) === '{"status":"ok"}')
    const hb = await fetch(EDGE_BAD_URL)
    check('the health check answers error when the function has no usable login', hb.status === 503 && (await hb.text()) === '{"status":"error"}')

    // 14. The daily health script against the real runtime (its address rewritten to this test).
    const { runHealthCheck } = await import('../scripts/waitlist-health.mjs')
    const official = 'https://kpudeppgokpjhvaqrprn.supabase.co/functions/v1/join-waitlist'
    const viaTest = (target) => (url, init) => fetch(url === official ? target : url, init)
    const before = (await owner`select count(*)::int as n from ops.waitlist`)[0].n
    const healthy = await runHealthCheck({ url: official, origin: ORIGIN, expected: 'open' }, viaTest(EDGE_URL))
    check('the health script passes against a healthy function', healthy.ok, healthy.lines.join(' | '))
    const unhealthy = await runHealthCheck({ url: official, origin: ORIGIN, expected: 'open' }, viaTest(EDGE_BAD_URL))
    check('the health script fails, clearly, when the database login is broken', !unhealthy.ok && /could not connect/.test(unhealthy.lines.join(' ')), unhealthy.lines[0])
    check('the health script stores nothing', (await owner`select count(*)::int as n from ops.waitlist`)[0].n === before)
    check('the health script output holds nothing personal', !/@|e2e\.test/.test([...healthy.lines, ...unhealthy.lines].join(' ')))

    // 15. The emergency close script, run as the database owner (as in the Supabase SQL editor).
    await admin`select waitlist_api.admin_open()`
    check('reopened for the emergency test', (await post(body({ email: 'pre@e2e.test' }), { xff: '203.0.113.60' })).state === 'ok')
    const closeSql = require('node:fs').readFileSync(require('node:path').join(__dirname, '..', 'scripts', 'db', 'emergency-close.sql'), 'utf8')
    const closed = await owner.unsafe(closeSql)
    check('the emergency close script reports submissions OFF', JSON.stringify(closed).includes('"submissions":"OFF"'))
    check('after the emergency close script, submissions are refused at once', (await post(body({ email: 'after@e2e.test' }), { xff: '203.0.113.61' })).state === 'closed')
    check('the emergency close script left the notice version alone', (await admin`select waitlist_api.admin_status() as s`)[0].s.notice_version === NOTICE)
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
