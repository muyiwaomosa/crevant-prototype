// Phase 1B-2: authorization does not depend on the Origin, on a real LOCAL
// Supabase (the gateway the app uses). CORS only tells a browser whether it
// may read a response; it never grants or refuses access. Access is decided
// by Supabase Auth (signed in) and then the database (pilot membership), the
// same whatever Origin is sent. Run through scripts/e2e/functions-policy-local.sh.
//
// CORS itself is NOT asserted here: the LOCAL gateway (Kong) adds its own
// "Access-Control-Allow-Origin: *" to every function response. The functions'
// own CORS is tested without a gateway (scripts/e2e/functions-policy-edge.sh),
// and on hosted projects by scripts/functions/verify.mjs, which fails on any
// wildcard.
const { execFileSync } = require('node:child_process')
const { readFileSync } = require('node:fs')
const path = require('node:path')
const JPEG = readFileSync(path.join(__dirname, 'fixtures', 'avatars', 'good.jpg'))
const env = (k) => { const v = process.env[k]; if (!v) throw new Error(`Missing ${k}`); return v }
const API = env('API_URL'), DB = env('DB_URL'), PUB = env('PUBLISHABLE_KEY'), SERVICE = env('SERVICE_ROLE_KEY')
if (!/^http:\/\/(127\.0\.0\.1|localhost):/.test(API)) throw new Error('Refusing: not a local Supabase')
const RUN = String(Date.now()).slice(-7)
const PASSWORD = 'Policy-Edge-42-pass'
const ALLOWED = 'http://127.0.0.1:4176' // a local browser: allowed on local Supabase
const DISALLOWED = 'https://evil.example'
let failures = 0
const check = (name, ok, detail = '') => { if (!ok) failures++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`) }
const sql = (q) => execFileSync('psql', [DB, '-v', 'ON_ERROR_STOP=1', '-qAt', '-c', q]).toString().trim()
const admin = { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, 'Content-Type': 'application/json' }
async function account(tag, member) {
  const email = `${tag}-${RUN}@example.test`
  const r = await fetch(`${API}/auth/v1/admin/users`, { method: 'POST', headers: admin, body: JSON.stringify({ email, password: PASSWORD, email_confirm: true }) })
  const { id } = await r.json()
  if (member) sql(`select ops.grant_member_access('${id}', 'tester', 'functions-policy')`)
  const t = await fetch(`${API}/auth/v1/token?grant_type=password`, { method: 'POST', headers: { apikey: PUB, 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password: PASSWORD }) })
  return (await t.json()).access_token
}
async function call(fn, route, { token, origin, body = JPEG, type = 'image/jpeg' } = {}) {
  const headers = { apikey: PUB, 'Content-Type': type }
  if (token) headers.Authorization = `Bearer ${token}`
  if (origin) headers.Origin = origin
  const r = await fetch(`${API}/functions/v1/${fn}/${route}`, { method: 'POST', headers, body })
  const text = await r.text()
  let json = null
  try { json = JSON.parse(text) } catch {}
  return { status: r.status, json, build: r.headers.get('x-splitpost-build') }
}

;(async () => {
  const member = await account('fpol-member', true)
  const outsider = await account('fpol-outsider', false)
  // The upload routes always ask the database, as the caller, whether they are a member.
  for (const [fn, route] of [['avatar', 'upload'], ['post-media', 'photo']]) {
    for (const origin of [ALLOWED, DISALLOWED, null]) {
      const where = origin ? `from ${origin}` : 'with no Origin'
      let r = await call(fn, route, { token: outsider, origin })
      check(`${fn}: a signed-in non-member ${where} is refused by the database (no_pilot_access)`, r.status === 403 && r.json?.error === 'no_pilot_access', `${r.status} ${JSON.stringify(r.json)}`)
      r = await call(fn, route, { origin })
      check(`${fn}: no session ${where} is refused (401)`, r.status === 401 && r.json?.error === 'not_signed_in', `${r.status}`)
    }
    // A member is authorized the same way whatever the Origin: the read-only route answers alike.
    const ro = fn === 'avatar' ? 'urls' : 'links'
    const a = await call(fn, ro, { token: member, origin: ALLOWED, body: JSON.stringify({ ids: [] }), type: 'application/json' })
    const b = await call(fn, ro, { token: member, origin: DISALLOWED, body: JSON.stringify({ ids: [] }), type: 'application/json' })
    check(`${fn}: a member is served identically from an allowed and a disallowed origin (CORS is not authorization)`, a.status === 200 && b.status === 200 && JSON.stringify(a.json) === JSON.stringify(b.json), `${a.status} ${b.status}`)
    check(`${fn}: every response carries the build stamp header (unstamped locally)`, a.build === 'unstamped' && b.build === 'unstamped', `${a.build}`)
  }
  const missing = await fetch(`${API}/functions/v1/not-deployed-${RUN}/x`, { method: 'POST', headers: { apikey: PUB } })
  await missing.body?.cancel()
  check('a function that is not deployed answers 404 (what "removed" verification expects)', missing.status === 404, `${missing.status}`)
  console.log(failures ? `${failures} check(s) FAILED` : 'ALL CHECKS PASSED')
  process.exit(failures ? 1 : 0)
})().catch((e) => { console.error(e); process.exit(1) })
