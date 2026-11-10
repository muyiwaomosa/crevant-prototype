// Checks the A3 proxy diagnostic running in Supabase's Edge runtime (started
// by e2e.sh, which provides TOKEN, EXPIRES_AT_EPOCH and BASE_PORT).
// Every check prints PASS or FAIL; the process exits non zero on any failure.

const http = require('node:http')

const { TOKEN, EXPIRES_AT_EPOCH, BASE_PORT } = process.env
const port = Number(BASE_PORT)
const URLS = {
  good: `http://127.0.0.1:${port}/`,
  off: `http://127.0.0.1:${port + 1}/`,
  elsewhere: `http://127.0.0.1:${port + 2}/`,
  expiring: `http://127.0.0.1:${port + 3}/`,
}
const KEY = 'eyJhbGciOiJIUzI1NiJ9.public-anon-key-placeholder.signature'
const ME = '81.2.69.160'

let failures = 0
const check = (name, ok, detail = '') => {
  if (!ok) failures++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`)
}

// Raw request, so duplicate header lines can be sent as a client could.
function request(url, { method = 'GET', headers = {} } = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request(url, { method, headers }, (res) => {
      let body = ''
      res.on('data', (c) => (body += c))
      res.on('end', () => resolve({ status: res.statusCode, body, headers: res.headers }))
    })
    req.on('error', reject)
    req.end()
  })
}
const auth = (extra = {}) => ({ Authorization: `Bearer ${KEY}`, 'X-Diag-Token': TOKEN, ...extra })
const json = (r) => {
  try {
    return JSON.parse(r.body)
  } catch {
    return null
  }
}
const bare404 = (r) => r.status === 404 && r.body === '' && !('access-control-allow-origin' in r.headers)

;(async () => {
  // 1. Every refusal looks the same: a bare 404.
  const other = require('node:crypto').randomBytes(32).toString('base64url')
  const refusals = [
    ['no headers at all', URLS.good, {}],
    ['no diagnostic token', URLS.good, { Authorization: `Bearer ${KEY}` }],
    ['a wrong token', URLS.good, auth({ 'X-Diag-Token': other })],
    ['a short token', URLS.good, auth({ 'X-Diag-Token': TOKEN.slice(0, 20) })],
    ['the token without a Supabase key header', URLS.good, { 'X-Diag-Token': TOKEN }],
    ['the token in Authorization instead', URLS.good, { Authorization: `Bearer ${TOKEN}` }],
    ['the right token while disabled', URLS.off, auth()],
    ['the right token on another project', URLS.elsewhere, auth()],
  ]
  const shapes = new Set()
  for (const [what, url, headers] of refusals) {
    const r = await request(url, { headers })
    check(`refused with a bare 404: ${what}`, bare404(r), `${r.status} ${r.body.slice(0, 40)}`)
    shapes.add(`${r.status}|${r.body}|${r.headers['content-type'] ?? ''}`)
  }
  for (const method of ['POST', 'PUT', 'DELETE', 'OPTIONS']) {
    const r = await request(URLS.good, { method, headers: auth() })
    check(`refused with a bare 404: ${method} with the right token`, bare404(r))
    shapes.add(`${r.status}|${r.body}|${r.headers['content-type'] ?? ''}`)
  }
  check('all refusals are identical, whatever the reason', shapes.size === 1, [...shapes].join(' / '))

  // 2. Authenticated: what it reports.
  const ok = await request(URLS.good, { headers: auth({ 'X-Forwarded-For': `198.51.100.7, ${ME}`, 'X-Diag-Your-Address': ME }) })
  const body = json(ok)
  check('the right token through a Supabase key header gets a report', ok.status === 200 && body !== null, `${ok.status}`)
  check('the report is never cached', ok.headers['cache-control'] === 'no-store')
  check('a forged entry left of the visitor: one trusted hop suggested', body?.suggested_trusted_hops === 1 && body.forwarded_for.positions[1].scope === 'documentation')

  const viaApikey = await request(URLS.good, { headers: { apikey: 'sb_publishable_placeholder_value_x', 'X-Diag-Token': TOKEN } })
  check('a publishable key in the apikey header also counts as the Supabase key header', viaApikey.status === 200)

  const two = json(await request(URLS.good, { headers: auth({ 'X-Forwarded-For': `198.51.100.7, ${ME}, 10.4.4.4`, 'X-Diag-Your-Address': ME }) }))
  check('an internal entry right of the visitor: two trusted hops suggested', two?.suggested_trusted_hops === 2)

  const many = json(await request(URLS.good, { headers: auth({ 'X-Forwarded-For': `${Array.from({ length: 15 }, (_, i) => `198.51.100.${i}`).join(', ')}, ${ME}`, 'X-Diag-Your-Address': ME }) }))
  check('many forged entries are counted, the rightmost eight described', many?.forwarded_for.entries === 16 && many.forwarded_for.positions.length === 8 && many.forwarded_for.more_positions === 8)

  const dup = json(await request(URLS.good, { headers: auth({ 'X-Forwarded-For': ['198.51.100.7, 203.0.113.9', ME], 'X-Diag-Your-Address': ME }) }))
  check('duplicate X-Forwarded-For lines are read as one list', dup?.forwarded_for.entries === 3 && dup.suggested_trusted_hops === 1, JSON.stringify(dup?.forwarded_for.entries))

  const v6 = json(await request(URLS.good, { headers: auth({ 'X-Forwarded-For': '2001:db8::7, 2a00:1450:4001:81a::200e', 'X-Diag-Your-Address': '2a00:1450:4001:81a::200e' }) }))
  check('IPv6: the visitor matches, forged documentation entry recognised', v6?.forwarded_for.positions[0].matches_your_address === true && v6.forwarded_for.positions[0].same_ipv6_64_as_yours === true && v6.forwarded_for.positions[1].scope === 'documentation')

  const bad = json(await request(URLS.good, { headers: auth({ 'X-Forwarded-For': '<script>, 999.1.1.1, , unknown' }) }))
  check('malformed entries are described as malformed or empty, never echoed', bad?.forwarded_for.positions.map((p) => p.kind).join(',') === 'malformed,empty,malformed,malformed')

  const none = json(await request(URLS.good, { headers: auth() }))
  check('no forwarding header: reported as absent', none?.forwarded_for.present === false && none.suggested_trusted_hops === null)

  const others = json(await request(URLS.good, { headers: auth({ 'X-Real-IP': ME, 'CF-Connecting-IP': '203.0.113.5', Forwarded: `for=${ME}`, 'X-Diag-Your-Address': ME }) }))
  check('other forwarding headers: presence, kind and match only', others?.other_headers['x-real-ip'].matches_your_address === true && others.other_headers['cf-connecting-ip'].scope === 'documentation' && others.other_headers.forwarded.present === true)

  // 3. Nothing sensitive in any response.
  const all = [ok, viaApikey].map((r) => r.body).join('\n') + JSON.stringify([two, many, dup, v6, bad, none, others])
  const leaked = [ME, '198.51.100', '203.0.113', '2a00', '2001:db8', 'for=', '<script>', 'unknown', TOKEN, KEY, 'placeholder'].filter((s) => all.includes(s))
  check('no response contains an address, a header value, the token or a key', leaked.length === 0, leaked.join(', '))

  // 4. Automatic refusal after expiry, in the real runtime.
  const before = await request(URLS.expiring, { headers: auth() })
  check('the short-lived instance answers before it expires', before.status === 200, `${before.status}`)
  const wait = Number(EXPIRES_AT_EPOCH) * 1000 - Date.now() + 1500
  if (wait > 0) await new Promise((r) => setTimeout(r, wait))
  const after = await request(URLS.expiring, { headers: auth({ 'X-Forwarded-For': ME }) })
  check('after expiry it refuses by itself, with the same bare 404', bare404(after), `${after.status}`)

  console.log(failures ? `\n${failures} CHECK(S) FAILED` : '\nALL CHECKS PASSED')
  process.exit(failures ? 1 : 0)
})().catch((e) => {
  console.error(String(e).replaceAll(TOKEN, '<token>'))
  process.exit(1)
})
