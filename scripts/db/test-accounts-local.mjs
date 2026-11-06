// Exercises scripts/staging-test-accounts.mjs against the REAL local Supabase
// (Docker) started by CI or scripts/ci/start-local-supabase.sh. Never touches
// a hosted project: the script itself refuses any non-loopback address here.
//
// Usage: node scripts/db/test-accounts-local.mjs   (local Supabase must be running)
import { execFileSync } from 'node:child_process'
import { run, TEST_TAG } from '../staging-test-accounts.mjs'

const status = JSON.parse(execFileSync('supabase', ['status', '-o', 'json'], { stdio: ['ignore', 'pipe', 'ignore'] }).toString())
const API = status.API_URL
const SECRET = status.SECRET_KEY
const PUB = status.PUBLISHABLE_KEY
if (!/^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(API)) throw new Error('Refusing: not a local Supabase')

const RUN = Date.now()
const EMAILS = [1, 2, 3, 4].map((n) => `test${n}-${RUN}@example.test`)
const PASSWORD = `Local-Test-Passphrase-${RUN}`
let failures = 0
const check = (name, ok, detail = '') => {
  if (!ok) failures++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`)
}
const admin = (path, init = {}) =>
  fetch(`${API}${path}`, { ...init, headers: { apikey: SECRET, Authorization: `Bearer ${SECRET}`, 'Content-Type': 'application/json', ...(init.headers || {}) } }).then(async (r) => ({ status: r.status, body: await r.json().catch(() => null) }))
const listUsers = async () => (await admin('/auth/v1/admin/users?per_page=1000')).body.users
const env = (MODE, extra = {}) => ({
  EXPECTED_PROJECT_REF: 'kpudeppgokpjhvaqrprn',
  TEST_ACCOUNTS_LOCAL_API_URL: API,
  STAGING_SERVICE_ROLE_KEY: SECRET,
  STAGING_TEST_ACCOUNT_EMAILS: EMAILS.join(','),
  STAGING_TEST_ACCOUNT_PASSWORD: PASSWORD,
  MODE,
  ...extra,
})
const attempt = async (e) => {
  const lines = []
  try {
    await run(e, { print: (l) => lines.push(l) })
    return { ok: true, lines, text: lines.join('\n') }
  } catch (err) {
    return { ok: false, lines, text: `${lines.join('\n')}\n${err.message}` }
  }
}
const noSecrets = (text) => ![SECRET, PASSWORD, ...EMAILS].some((s) => text.includes(s))

// 1. Plan changes nothing.
{
  const before = (await listUsers()).length
  const r = await attempt(env('plan'))
  check('plan succeeds and reports four missing accounts', r.ok && (r.text.match(/: not created\./g) || []).length === 4, r.ok ? '' : r.text)
  check('plan changes nothing', (await listUsers()).length === before)
  check('plan output contains no address, password or key', noSecrets(r.text))
}

// 2. A real (untagged) account with an approved address blocks creation entirely.
{
  const real = await admin('/auth/v1/invite', { method: 'POST', body: JSON.stringify({ email: EMAILS[2] }) })
  check('a real invited account exists for address 3', real.status === 200, String(real.status))
  const before = (await listUsers()).length
  const r = await attempt(env('create'))
  check('create refuses when an approved address belongs to a real account', !r.ok && /Test account 3 already exists as a real, untagged account/.test(r.text))
  check('nothing was created', (await listUsers()).length === before)
  const realUser = (await listUsers()).find((u) => u.email === EMAILS[2])
  await admin(`/auth/v1/admin/users/${realUser.id}`, { method: 'DELETE' })
}

// 3. Create: four confirmed, tagged accounts with profiles, and they can sign in.
{
  const r = await attempt(env('create'))
  check('create succeeds', r.ok, r.ok ? '' : r.text)
  check('create reports four new accounts and four profiles', /Created 4; 0 already existed/.test(r.text) && /Profiles created automatically: 4 of 4/.test(r.text))
  check('create output contains no address, password or key', noSecrets(r.text))
  const users = (await listUsers()).filter((u) => EMAILS.includes(u.email))
  check('all four are tagged test accounts with confirmed email', users.length === 4 && users.every((u) => u.app_metadata?.[TEST_TAG] === true && u.email_confirmed_at))
  const login = await fetch(`${API}/auth/v1/token?grant_type=password`, { method: 'POST', headers: { apikey: PUB, 'Content-Type': 'application/json' }, body: JSON.stringify({ email: EMAILS[0], password: PASSWORD }) })
  const session = await login.json()
  check('a test account can sign in with the approved password', login.status === 200 && !!session.access_token, String(login.status))

  // A member cannot remove or forge the tag: app_metadata is server-only.
  const upd = await fetch(`${API}/auth/v1/user`, {
    method: 'PUT',
    headers: { apikey: PUB, Authorization: `Bearer ${session.access_token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ data: { [TEST_TAG]: false }, app_metadata: { [TEST_TAG]: false } }),
  })
  const after = (await listUsers()).find((u) => u.email === EMAILS[0])
  check('a member cannot remove their own test tag', after.app_metadata?.[TEST_TAG] === true, String(upd.status))

  const again = await attempt(env('create'))
  check('running create again creates nothing', again.ok && /Created 0; 4 already existed/.test(again.text))
}

// 4. Delete: only tagged, listed accounts go; a real account is untouched.
{
  const realEmail = `real-${RUN}@example.test`
  await admin('/auth/v1/admin/users', { method: 'POST', body: JSON.stringify({ email: realEmail, password: PASSWORD, email_confirm: true }) })
  const r = await attempt(env('delete'))
  check('delete succeeds', r.ok, r.ok ? '' : r.text)
  const remaining = await listUsers()
  check('all four test accounts are gone', !remaining.some((u) => EMAILS.includes(u.email)))
  check('the real account is untouched', remaining.some((u) => u.email === realEmail))
  const profiles = await admin(`/rest/v1/profiles?select=id`)
  const ids = new Set(remaining.map((u) => u.id))
  check('no profile is left without its account', Array.isArray(profiles.body) && profiles.body.every((p) => ids.has(p.id)))
  check('delete output contains no address, password or key', noSecrets(r.text))
}

// 5. Sign-up is still disabled.
{
  const s = await fetch(`${API}/auth/v1/settings`, { headers: { apikey: PUB } }).then((r) => r.json())
  check('public sign-up is still disabled', s.disable_signup === true)
}

console.log(failures ? `${failures} CHECK(S) FAILED` : 'ALL CHECKS PASSED')
process.exit(failures ? 1 : 0)
