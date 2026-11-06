// Integration test against a REAL local Supabase (started by scripts/db/integration.sh).
// Exercises the PR 2 migration through Supabase Auth and the real Data API:
// profile creation on confirmation, backfill, access isolation, protected
// fields, validation (including Unicode), and the private ops schema.
// Plain fetch only. Prints PASS or FAIL per check; exits non zero on failure.
import { execFileSync } from 'node:child_process'

const env = (k) => {
  const v = process.env[k]
  if (!v) throw new Error(`Missing ${k}; run through scripts/db/integration.sh`)
  return v
}
const API = env('API_URL')
const MAIL = env('MAILPIT_URL')
const DB = env('DB_URL')
const PUB = env('PUBLISHABLE_KEY')
const SERVICE = env('SERVICE_ROLE_KEY')
const RUN = env('RUN_ID')
const SETTINGS_BEFORE = JSON.parse(env('AUTH_SETTINGS_BEFORE'))
const PRE_CONFIRMED_ID = env('PRE_CONFIRMED_ID')
const PRE_INVITED_ID = env('PRE_INVITED_ID')
const PRE_INVITED_EMAIL = env('PRE_INVITED_EMAIL')
if (!/^http:\/\/(127\.0\.0\.1|localhost):/.test(API)) throw new Error('Refusing: not a local Supabase')

let pass = 0
let fail = 0
const check = (name, ok, detail = '') => {
  ok ? pass++ : fail++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`)
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const sql = (q) => execFileSync('psql', [DB, '-v', 'ON_ERROR_STOP=1', '-qAt', '-c', q]).toString().trim()

async function call(path, { method = 'GET', key = PUB, token, body, headers = {} } = {}) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: {
      apikey: key,
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...headers,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const text = await res.text()
  let json = null
  try {
    json = text ? JSON.parse(text) : null
  } catch {
    json = text
  }
  return { status: res.status, json }
}
const admin = (path, opts = {}) => call(path, { ...opts, key: SERVICE, token: SERVICE })
const rest = (path, opts = {}) => call(`/rest/v1${path}`, { ...opts, headers: { Prefer: 'return=representation', ...(opts.headers || {}) } })
const profileOf = async (id) => (await rest(`/profiles?id=eq.${id}&select=*`, { key: SERVICE, token: SERVICE })).json
const profileCount = (id) => Number(sql(`select count(*) from public.profiles where id = '${id}'`))

async function inviteLink(email, type = 'invite', subject = 'invited') {
  for (let i = 0; i < 40; i++) {
    const r = await fetch(`${MAIL}/api/v1/search?query=${encodeURIComponent(`to:"${email}"`)}`).then((x) => x.json())
    const m = (r.messages || []).find((x) => x.Subject.toLowerCase().includes(subject))
    if (m) {
      const full = await fetch(`${MAIL}/api/v1/message/${m.ID}`).then((x) => x.json())
      const href = (full.HTML || full.Text).match(/href="([^"]+)"/)[1].replace(/&amp;/g, '&')
      const u = new URL(href)
      // The code must travel in the fragment (#), never the query string.
      if (u.search) throw new Error(`Email link has a query string: ${u.pathname}${u.search.replace(/token_hash=[^&]+/, 'token_hash=…')}`)
      const params = new URLSearchParams(u.hash.slice(1))
      if (params.get('type') !== type) continue
      return params.get('token_hash')
    }
    await sleep(250)
  }
  throw new Error(`No ${type} email for ${email}`)
}
const verify = (token_hash, type = 'invite') => call('/auth/v1/verify', { method: 'POST', body: { token_hash, type } })
const signIn = (email, password) => call('/auth/v1/token?grant_type=password', { method: 'POST', body: { email, password } })

// ---------------------------------------------------------------------------
// 1. The migration changed no Auth configuration.
{
  const now = (await call('/auth/v1/settings')).json
  check('Auth settings are identical before and after the migration', JSON.stringify(now) === JSON.stringify(SETTINGS_BEFORE))
  check('public sign-up is still disabled, email login on, confirmation required',
    now.disable_signup === true && now.external?.email === true && now.mailer_autoconfirm === false)
}

// 2. Backfill and the pre-migration invitee.
check('identity confirmed before the migration was backfilled', profileCount(PRE_CONFIRMED_ID) === 1)
check('identity invited before the migration has no profile yet', profileCount(PRE_INVITED_ID) === 0)
check('every confirmed identity has a profile',
  sql("select count(*) from auth.users u where u.email_confirmed_at is not null and not exists (select 1 from public.profiles p where p.id = u.id)") === '0')
{
  const hash = await inviteLink(PRE_INVITED_EMAIL)
  const v = await verify(hash)
  check('pre-migration invitee can confirm through real Supabase Auth', v.status === 200 && !!v.json?.access_token, String(v.status))
  check('confirming creates their profile (trigger under the Auth role)', profileCount(PRE_INVITED_ID) === 1)
}

// 3. Public sign-up stays refused and creates nothing.
{
  const email = `signup-${RUN}@example.test`
  const r = await call('/auth/v1/signup', { method: 'POST', body: { email, password: 'Correct-Horse-42-battery' } })
  check('direct sign-up is refused', r.status === 422 && r.json?.error_code === 'signup_disabled', `${r.status} ${r.json?.error_code}`)
  check('refused sign-up created no identity or profile', sql(`select count(*) from auth.users where email = '${email}'`) === '0')
}

// 4. Invite, confirm, repeat, set password, sign in.
const PASSWORD = 'Correct-Horse-42-battery'
const emailA = `alice-${RUN}@example.test`
const emailB = `bob-${RUN}@example.test`
let A, B, tokenA
{
  const inv = await admin('/auth/v1/invite', { method: 'POST', body: { email: emailA } })
  A = inv.json?.id
  check('server-side invite works with sign-up disabled', inv.status === 200 && !!A, String(inv.status))
  check('no profile before confirmation', profileCount(A) === 0)
  const hash = await inviteLink(emailA)
  const v = await verify(hash)
  check('invite link confirms and signs in', v.status === 200 && !!v.json?.access_token, String(v.status))
  check('exactly one profile after confirmation', profileCount(A) === 1)
  const again = await verify(hash)
  check('reusing the link fails cleanly (no server error)', again.status >= 400 && again.status < 500, `${again.status} ${again.json?.error_code}`)
  check('still exactly one profile after a repeated confirmation attempt', profileCount(A) === 1)
  const pw = await call('/auth/v1/user', { method: 'PUT', token: v.json.access_token, body: { password: PASSWORD } })
  check('password can be set', pw.status === 200, String(pw.status))
  const s = await signIn(emailA, PASSWORD)
  tokenA = s.json?.access_token
  check('A signs in with the new password', s.status === 200 && !!tokenA, String(s.status))

  const b = await admin('/auth/v1/admin/users', { method: 'POST', body: { email: emailB, password: PASSWORD, email_confirm: true } })
  B = b.json?.id
  check('a confirmed identity created by the server gets a profile', b.status === 200 && profileCount(B) === 1, String(b.status))
  await rest(`/profiles?id=eq.${B}`, { method: 'PATCH', key: SERVICE, token: SERVICE, body: { username: `bob_${RUN}`.slice(0, 30), display_name: 'Bob' } })
}

// 5. Authentication failures create or change nothing and never cause a server error.
{
  const usersBefore = sql('select count(*) from auth.users')
  const profilesBefore = sql('select count(*) from public.profiles')
  const emailC = `carol-${RUN}@example.test`
  const inv = await admin('/auth/v1/invite', { method: 'POST', body: { email: emailC } })
  const C = inv.json?.id
  const hash = await inviteLink(emailC)
  sql(`update auth.users set confirmation_sent_at = now() - interval '2 hours', invited_at = now() - interval '2 hours' where id = '${C}'`)
  const exp = await verify(hash)
  check('an expired invite link is refused without a server error', exp.status >= 400 && exp.status < 500, `${exp.status} ${exp.json?.error_code}`)
  check('the expired invitee got no profile', profileCount(C) === 0)
  const wrong = await signIn(emailA, 'Wrong-password-000')
  check('a wrong password is refused', wrong.status === 400 && wrong.json?.error_code === 'invalid_credentials', `${wrong.status} ${wrong.json?.error_code}`)
  const unknown = await signIn(`nobody-${RUN}@example.test`, PASSWORD)
  check('an unknown email gets the same error', unknown.json?.error_code === wrong.json?.error_code, unknown.json?.error_code)
  const weak = await call('/auth/v1/user', { method: 'PUT', token: tokenA, body: { password: 'short1' } })
  check('a weak password is refused', weak.status === 422 && weak.json?.error_code === 'weak_password', `${weak.status} ${weak.json?.error_code}`)
  check('failures created no extra identities or profiles',
    sql('select count(*) from auth.users') === String(Number(usersBefore) + 1) && sql('select count(*) from public.profiles') === profilesBefore)
}

// 6. Access through the real Data API.
{
  const anon = await rest('/profiles?select=*')
  check('anonymous visitors cannot read profiles', anon.status === 401 || anon.status === 403 || (Array.isArray(anon.json) && anon.json.length === 0), String(anon.status))
  const mine = await rest('/profiles?select=*', { token: tokenA })
  check('A sees only their own profile', mine.status === 200 && mine.json.length === 1 && mine.json[0].id === A, `${mine.status} ${mine.json?.length}`)
  const other = await rest(`/profiles?id=eq.${B}`, { method: 'PATCH', token: tokenA, body: { display_name: 'Hacked' } })
  check("A's update of B's profile changes nothing", other.status === 200 && Array.isArray(other.json) && other.json.length === 0, `${other.status} ${JSON.stringify(other.json)}`)
  check("B's profile is untouched", (await profileOf(B))[0]?.display_name === 'Bob')

  for (const [field, value] of [['id', B], ['created_at', '2020-01-01T00:00:00Z'], ['updated_at', '2020-01-01T00:00:00Z']]) {
    const r = await rest(`/profiles?id=eq.${A}`, { method: 'PATCH', token: tokenA, body: { [field]: value } })
    check(`A cannot change protected field ${field}`, r.status === 401 || r.status === 403, `${r.status} ${r.json?.code}`)
  }
  const ins = await rest('/profiles', { method: 'POST', token: tokenA, body: { id: A } })
  check('A cannot insert a profile', ins.status === 401 || ins.status === 403, `${ins.status} ${ins.json?.code}`)
  const del = await rest(`/profiles?id=eq.${A}`, { method: 'DELETE', token: tokenA })
  check('A cannot delete their profile', (del.status === 401 || del.status === 403) && profileCount(A) === 1, `${del.status} ${del.json?.code}`)

  const before = (await profileOf(A))[0]
  await sleep(50)
  const own = await rest(`/profiles?id=eq.${A}`, { method: 'PATCH', token: tokenA, body: { username: `alice_${RUN}`.slice(0, 30), display_name: 'Alice' } })
  const after = (await profileOf(A))[0]
  check('A can change their own username and display name', own.status === 200 && after.display_name === 'Alice', String(own.status))
  check('updated_at is set by the database, created_at unchanged',
    new Date(after.updated_at) > new Date(before.updated_at) && after.created_at === before.created_at)
}

// 7. Validation through the real Data API, including Unicode edge cases.
{
  const patch = (body) => rest(`/profiles?id=eq.${A}`, { method: 'PATCH', token: tokenA, body })
  for (const ok of ['abc', 'maya_99', 'a1_', 'z'.repeat(30)]) {
    const r = await patch({ username: ok })
    check(`username "${ok.length > 12 ? ok.slice(0, 12) + '...' : ok}" is accepted`, r.status === 200, String(r.status))
  }
  for (const bad of ['ab', 'z'.repeat(31), 'Alice', 'al ice', 'al-ice', 'émile', 'admin', 'sign_in', 'crevant', 'null']) {
    const r = await patch({ username: bad })
    check(`username "${bad.length > 12 ? bad.slice(0, 12) + '...' : bad}" is rejected`, r.status === 400 && r.json?.code === '23514', `${r.status} ${r.json?.code}`)
  }
  const dup = await patch({ username: `bob_${RUN}`.slice(0, 30) })
  check("taking B's username is rejected", dup.status === 409 && dup.json?.code === '23505', `${dup.status} ${dup.json?.code}`)

  const accepted = [
    ['Ålice', 'Ålice'],
    ['山田太郎', '山田太郎'],
    ['مريم', 'مريم'],
    ['👨‍👩‍👧‍👦', '👨‍👩‍👧‍👦'],
    ['José', 'José'],
    ['  spaced out  ', 'spaced out'],
    ['  Name​﻿', 'Name'],
    ['Mary Jane', 'Mary Jane'],
    ['x'.repeat(50), 'x'.repeat(50)],
    ['🌱'.repeat(50), '🌱'.repeat(50)],
  ]
  for (const [input, stored] of accepted) {
    const r = await patch({ display_name: input })
    check(`display name ${JSON.stringify(input).slice(0, 24)} is stored as ${JSON.stringify(stored).slice(0, 24)}`,
      r.status === 200 && r.json?.[0]?.display_name === stored, `${r.status} ${JSON.stringify(r.json?.[0]?.display_name)}`)
  }
  for (const bad of ['', '   ', '  ', '​​', '‍', '﻿', 'a\u0007b', 'line\nbreak', 'x'.repeat(51), '🌱'.repeat(51)]) {
    const r = await patch({ display_name: bad })
    check(`display name ${JSON.stringify(bad).slice(0, 24)} is rejected`, r.status === 400 && r.json?.code === '23514', `${r.status} ${r.json?.code}`)
  }
}

// 8. The private ops schema is unreachable through the Data API.
{
  for (const [label, token] of [['anonymous', undefined], ['signed-in', tokenA]]) {
    const r = await rest('/invitations?select=*', { token, headers: { 'Accept-Profile': 'ops' } })
    check(`ops is not exposed to ${label} callers`, r.status === 406 && r.json?.code === 'PGRST106', `${r.status} ${r.json?.code}`)
    const w = await rest('/admins', { method: 'POST', token, headers: { 'Content-Profile': 'ops' }, body: { user_id: A } })
    check(`${label} callers cannot write to ops`, w.status === 406, `${w.status} ${w.json?.code}`)
  }
  const fn = await rest('/rpc/create_profile_for_confirmed_user', { method: 'POST', token: tokenA, body: {} })
  check('ops functions are not callable through the Data API', fn.status === 404, `${fn.status} ${fn.json?.code}`)
  const gql = await call('/graphql/v1', { method: 'POST', token: undefined, body: { query: '{ profilesCollection { edges { node { id } } } }' } })
  const leaked = JSON.stringify(gql.json || '').includes(A)
  check('GraphQL does not reveal profiles to anonymous visitors', !leaked, String(gql.status))
}

// 9. Deleting an identity deletes its profile (Phase 1A behaviour).
{
  const d = await admin(`/auth/v1/admin/users/${B}`, { method: 'DELETE' })
  check("deleting B's identity removes B's profile", d.status === 200 && profileCount(B) === 0, String(d.status))
}

console.log(`\nIntegration: ${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
