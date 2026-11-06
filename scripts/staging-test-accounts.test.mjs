// Tests for scripts/staging-test-accounts.mjs against a fake Supabase that
// records every request. Nothing here touches a network or a real project.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { run, Refusal, TEST_TAG, ACCOUNT_COUNT } from './staging-test-accounts.mjs'

const REF = 'kpudeppgokpjhvaqrprn'
// Fake keys are assembled at runtime so no key-shaped text sits in the repository.
const fakeKey = (prefix, body) => `sb_${prefix}_${body}`
const KEY = fakeKey('secret', 'TESTKEY_abcdefghijklmnop0123456789')
const PASSWORD = 'Long-Test-Passphrase-42'
const EMAILS = ['founder+t1@example.test', 'founder+t2@example.test', 'founder+t3@example.test', 'founder+t4@example.test']
const jwt = (payload) => ['eyJhbGciOiJIUzI1NiJ9', Buffer.from(JSON.stringify(payload)).toString('base64url'), 'sig'].join('.')

function fakeSupabase({ users = [], signupDisabled = true, flipSignupAfterWrite = false } = {}) {
  const state = { users: users.map((u) => ({ ...u })), signupDisabled, writes: [], requests: [] }
  let nextId = 1
  const reply = (status, body) => ({ status, text: async () => (body === undefined ? '' : JSON.stringify(body)) })
  const fetchImpl = async (url, init = {}) => {
    const u = new URL(url)
    const method = init.method || 'GET'
    state.requests.push({ host: u.host, method, path: u.pathname, key: init.headers?.apikey })
    if (init.headers?.apikey !== KEY) return reply(401, { msg: 'invalid key' })
    if (u.pathname === '/auth/v1/settings') return reply(200, { disable_signup: state.signupDisabled })
    if (u.pathname === '/auth/v1/admin/users' && method === 'GET') return reply(200, { users: state.users })
    if (u.pathname === '/auth/v1/admin/users' && method === 'POST') {
      const body = JSON.parse(init.body)
      state.writes.push({ method, body })
      const user = { id: `u${nextId++}`, email: body.email, email_confirmed_at: body.email_confirm ? 'now' : null, app_metadata: { provider: 'email', ...body.app_metadata } }
      state.users.push(user)
      if (flipSignupAfterWrite) state.signupDisabled = false
      return reply(200, user)
    }
    if (u.pathname.startsWith('/auth/v1/admin/users/') && method === 'DELETE') {
      const id = decodeURIComponent(u.pathname.split('/').pop())
      state.writes.push({ method, id })
      state.users = state.users.filter((x) => x.id !== id)
      return reply(200, {})
    }
    if (u.pathname === '/rest/v1/profiles') {
      const ids = (u.searchParams.get('id') || '').replace(/^in\.\(|\)$/g, '').split(',')
      return reply(200, state.users.filter((x) => ids.includes(x.id)).map((x) => ({ id: x.id })))
    }
    return reply(404, {})
  }
  return { state, fetchImpl }
}

const baseEnv = (over = {}) => ({
  EXPECTED_PROJECT_REF: REF,
  SUPABASE_PROJECT_REF: REF,
  CONFIRM_PROJECT_REF: REF,
  STAGING_SERVICE_ROLE_KEY: KEY,
  STAGING_TEST_ACCOUNT_EMAILS: EMAILS.join(','),
  STAGING_TEST_ACCOUNT_PASSWORD: PASSWORD,
  MODE: 'plan',
  ...over,
})

async function go(env, fake = fakeSupabase()) {
  const printed = []
  const masked = []
  let error = null
  try {
    await run(env, { fetchImpl: fake.fetchImpl, print: (l) => printed.push(l), mask: (v) => masked.push(v) })
  } catch (e) {
    error = e
  }
  return { ...fake, printed, masked, error, text: printed.join('\n') + (error ? `\n${error.message}` : '') }
}

const assertNoSecrets = (r) => {
  for (const s of [KEY, PASSWORD, ...EMAILS]) assert.ok(!r.text.includes(s), `output must not contain ${s.slice(0, 12)}...`)
}
const assertRefusedWithoutWrites = (r, pattern) => {
  assert.ok(r.error instanceof Refusal, `expected a refusal, got ${r.error}`)
  if (pattern) assert.match(r.error.message, pattern)
  assert.equal(r.state.writes.length, 0, 'no account may be created or deleted')
  assertNoSecrets(r)
}

test('plan reports status by number, changes nothing and never prints secrets', async () => {
  const r = await go(baseEnv())
  assert.equal(r.error, null)
  assert.equal(r.state.writes.length, 0)
  assert.match(r.text, /Test account 1: not created\./)
  assert.match(r.text, /Plan only\. Nothing was changed\./)
  assertNoSecrets(r)
  // Only the hard-coded staging project is contacted.
  assert.ok(r.state.requests.every((q) => q.host === `${REF}.supabase.co`))
})

test('secrets are masked before any check can fail', async () => {
  const r = await go(baseEnv({ SUPABASE_PROJECT_REF: 'abcdefghijabcdefghij' }))
  assertRefusedWithoutWrites(r, /does not match the approved staging project/)
  for (const s of [KEY, PASSWORD, ...EMAILS]) assert.ok(r.masked.includes(s), 'each secret is masked first')
  assert.equal(r.state.requests.length, 0, 'nothing is contacted')
})

test('refuses any target but the approved staging project', async () => {
  assertRefusedWithoutWrites(await go(baseEnv({ CONFIRM_PROJECT_REF: 'wrong' })), /typed confirmation/)
  assertRefusedWithoutWrites(await go(baseEnv({ SUPABASE_PROJECT_REF: '' })), /SUPABASE_PROJECT_REF is not set/)
  assertRefusedWithoutWrites(await go(baseEnv({ EXPECTED_PROJECT_REF: 'not-a-ref' })), /malformed/)
  for (const url of ['https://abcdefghijabcdefghij.supabase.co', 'http://example.com', 'http://127.0.0.1:54321/x', 'http://user:pw@127.0.0.1:54321']) {
    assertRefusedWithoutWrites(await go(baseEnv({ TEST_ACCOUNTS_LOCAL_API_URL: url })), /loopback/)
  }
  assertRefusedWithoutWrites(await go(baseEnv({ TEST_ACCOUNTS_LOCAL_API_URL: 'http://127.0.0.1:54321', GITHUB_ACTIONS: 'true' })), /cannot be used in a staging run/)
})

test('refuses keys that are not a server key for this project', async () => {
  assertRefusedWithoutWrites(await go(baseEnv({ STAGING_SERVICE_ROLE_KEY: '' })), /not set/)
  assertRefusedWithoutWrites(await go(baseEnv({ STAGING_SERVICE_ROLE_KEY: fakeKey('publishable', 'abcdefghijklmnopqrstuvwxyz') })), /publishable/)
  assertRefusedWithoutWrites(await go(baseEnv({ STAGING_SERVICE_ROLE_KEY: jwt({ role: 'anon', ref: REF }) })), /not a service role key/)
  assertRefusedWithoutWrites(await go(baseEnv({ STAGING_SERVICE_ROLE_KEY: jwt({ role: 'service_role', ref: 'abcdefghijabcdefghij' }) })), /different Supabase project/)
  assertRefusedWithoutWrites(await go(baseEnv({ STAGING_SERVICE_ROLE_KEY: 'not-a-key' })), /not a recognised/)
})

test('a key the project rejects stops the run before any change', async () => {
  const r = await go(baseEnv({ STAGING_SERVICE_ROLE_KEY: fakeKey('secret', 'SOMEOTHERPROJECTKEY_0123456789') }))
  assertRefusedWithoutWrites(r, /Could not read Auth settings \(HTTP 401\)/)
})

test('requires exactly four distinct, valid addresses', async () => {
  assertRefusedWithoutWrites(await go(baseEnv({ STAGING_TEST_ACCOUNT_EMAILS: EMAILS.slice(0, 3).join(',') })), /exactly 4/)
  assertRefusedWithoutWrites(await go(baseEnv({ STAGING_TEST_ACCOUNT_EMAILS: [...EMAILS, 'x@example.test'].join(',') })), /exactly 4/)
  assertRefusedWithoutWrites(await go(baseEnv({ STAGING_TEST_ACCOUNT_EMAILS: [EMAILS[0], EMAILS[0].toUpperCase(), EMAILS[2], EMAILS[3]].join('\n') })), /same address twice/)
  assertRefusedWithoutWrites(await go(baseEnv({ STAGING_TEST_ACCOUNT_EMAILS: ['not-an-email', ...EMAILS.slice(1)].join(',') })), /Test account 1's address is not a valid/)
  assert.equal(ACCOUNT_COUNT, 4)
})

test('create needs a strong password that is not an address', async () => {
  assertRefusedWithoutWrites(await go(baseEnv({ MODE: 'create', STAGING_TEST_ACCOUNT_PASSWORD: '' })), /not set/)
  assertRefusedWithoutWrites(await go(baseEnv({ MODE: 'create', STAGING_TEST_ACCOUNT_PASSWORD: 'short-pass' })), /at least 12/)
  assertRefusedWithoutWrites(await go(baseEnv({ MODE: 'create', STAGING_TEST_ACCOUNT_PASSWORD: 'founder+t1-and-more' })), /must not contain/)
  // Plan and delete never need the password.
  assert.equal((await go(baseEnv({ STAGING_TEST_ACCOUNT_PASSWORD: '' }))).error, null)
})

test('refuses to run while public sign-up is enabled', async () => {
  for (const MODE of ['plan', 'create', 'delete']) {
    assertRefusedWithoutWrites(await go(baseEnv({ MODE }), fakeSupabase({ signupDisabled: false })), /Public sign-up is enabled/)
  }
})

test('create makes confirmed, tagged accounts, skips existing test accounts and is repeatable', async () => {
  const fake = fakeSupabase({ users: [{ id: 'old', email: EMAILS[1], app_metadata: { [TEST_TAG]: true } }] })
  const r = await go(baseEnv({ MODE: 'create' }), fake)
  assert.equal(r.error, null, r.error?.message)
  assert.equal(r.state.writes.length, 3, 'only the three missing accounts are created')
  for (const w of r.state.writes) {
    assert.equal(w.body.email_confirm, true)
    assert.equal(w.body.app_metadata[TEST_TAG], true)
    assert.equal(w.body.password, PASSWORD)
  }
  assert.match(r.text, /Created 3; 1 already existed\. All 4 are tagged test accounts\./)
  assert.match(r.text, /Profiles created automatically: 4 of 4\./)
  assert.match(r.text, /Public sign-up is still disabled after the run\./)
  assertNoSecrets(r)
  const again = await go(baseEnv({ MODE: 'create' }), fake)
  assert.equal(again.error, null)
  assert.equal(fake.state.writes.length, 3, 'a second run creates nothing')
})

test('create never touches an existing real account with an approved address', async () => {
  const fake = fakeSupabase({ users: [{ id: 'real', email: EMAILS[2], app_metadata: { provider: 'email' } }] })
  const r = await go(baseEnv({ MODE: 'create' }), fake)
  assertRefusedWithoutWrites(r, /Test account 3 already exists as a real, untagged account\. Nothing was changed/)
  assert.ok(fake.state.users.some((u) => u.id === 'real'))
})

test('delete removes only tagged accounts on the list, never real ones', async () => {
  const fake = fakeSupabase({
    users: [
      { id: 't1', email: EMAILS[0], app_metadata: { [TEST_TAG]: true } },
      { id: 'real', email: EMAILS[1], app_metadata: { provider: 'email' } },
      { id: 'other', email: 'someone@example.test', app_metadata: { provider: 'email' } },
      { id: 'orphan', email: 'old+t9@example.test', app_metadata: { [TEST_TAG]: true } },
      { id: 'tag-false', email: EMAILS[3], app_metadata: { [TEST_TAG]: 'true' } },
    ],
  })
  const r = await go(baseEnv({ MODE: 'delete' }), fake)
  assert.equal(r.error, null, r.error?.message)
  assert.deepEqual(r.state.writes.map((w) => w.id), ['t1'])
  assert.match(r.text, /Real accounts left untouched: 2\./)
  assert.match(r.text, /Tagged test accounts not on the approved list: 1\./)
  assertNoSecrets(r)
  const r2 = await go(baseEnv({ MODE: 'delete', INCLUDE_UNLISTED: 'true' }), fake)
  assert.equal(r2.error, null)
  assert.deepEqual(r2.state.writes.map((w) => w.id), ['t1', 'orphan'])
  assert.deepEqual(fake.state.users.map((u) => u.id).sort(), ['other', 'real', 'tag-false'])
})

test('notices if sign-up becomes enabled during a run', async () => {
  const r = await go(baseEnv({ MODE: 'create' }), fakeSupabase({ flipSignupAfterWrite: true }))
  assert.ok(r.error instanceof Refusal)
  assert.match(r.error.message, /enabled after the run/)
})

test('unknown modes are refused', async () => {
  assertRefusedWithoutWrites(await go(baseEnv({ MODE: 'reset' })), /Unknown mode/)
})
