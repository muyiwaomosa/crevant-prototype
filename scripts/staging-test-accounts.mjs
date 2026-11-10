#!/usr/bin/env node
// Creates, lists or removes the approved staging test accounts.
//
// Runs only from .github/workflows/staging-test-accounts.yml, which runs only
// from `main` and waits for the founder's approval in the "staging" GitHub
// environment. It talks to Supabase Auth's admin API for one project only:
// the staging project hard-coded in the workflow.
//
// Inputs (environment variables):
//   EXPECTED_PROJECT_REF            hard-coded in the workflow (changing it needs a reviewed PR)
//   SUPABASE_PROJECT_REF            "staging" environment variable
//   CONFIRM_PROJECT_REF             typed by the person running the workflow
//   MODE                            plan (default, read-only) | create | delete
//   STAGING_SERVICE_ROLE_KEY        "staging" environment secret (never printed)
//   STAGING_TEST_ACCOUNT_EMAILS     "staging" environment secret: exactly four
//                                   approved addresses, comma or newline separated
//   STAGING_TEST_ACCOUNT_PASSWORD   "staging" environment secret, create only
//   TEST_ACCOUNTS_LOCAL_API_URL     local tests only: a loopback Supabase URL
//
// Safety rules:
//   * Never prints an address, password or key. Accounts are "test account 1..4".
//   * Refuses to run if public sign-up is enabled, and checks it again after
//     any change. The invitation-only model is never altered.
//   * Every account it creates is tagged in app_metadata, which only server
//     code can set. It never modifies or deletes an untagged (real) account.
//   * delete removes an account only if it carries the tag AND its address
//     exactly matches one of the four approved addresses. Tagged accounts with
//     any other address are reported, never deleted.

export const ACCOUNT_COUNT = 4
export const TEST_TAG = 'crevant_staging_test_account'
const MIN_PASSWORD_LENGTH = 12

export class Refusal extends Error {}
const refuse = (msg) => {
  throw new Refusal(msg)
}

export function parseEmails(raw) {
  const emails = String(raw || '')
    .split(/[\s,]+/)
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean)
  if (emails.length !== ACCOUNT_COUNT) refuse(`STAGING_TEST_ACCOUNT_EMAILS must list exactly ${ACCOUNT_COUNT} addresses (found ${emails.length}).`)
  for (const [i, e] of emails.entries()) {
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e)) refuse(`Test account ${i + 1}'s address is not a valid email address.`)
  }
  if (new Set(emails).size !== emails.length) refuse('STAGING_TEST_ACCOUNT_EMAILS lists the same address twice.')
  return emails
}

function decodeJwtPayload(token) {
  try {
    const part = token.split('.')[1]
    return JSON.parse(Buffer.from(part.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8'))
  } catch {
    return null
  }
}

/** Works out where to send requests, refusing anything but the approved project or a local test stack. */
export function resolveTarget(env) {
  const expected = env.EXPECTED_PROJECT_REF || ''
  if (!/^[a-z0-9]{20}$/.test(expected)) refuse('The expected project reference in the workflow is malformed.')
  const local = env.TEST_ACCOUNTS_LOCAL_API_URL
  if (local) {
    let u
    try {
      u = new URL(local)
    } catch {
      refuse('TEST_ACCOUNTS_LOCAL_API_URL is not a valid URL.')
    }
    if (u.protocol !== 'http:' || !['127.0.0.1', 'localhost'].includes(u.hostname) || (u.pathname !== '/' && u.pathname !== '') || u.username || u.password || u.search) {
      refuse('TEST_ACCOUNTS_LOCAL_API_URL must be a plain loopback address (local tests only).')
    }
    if (env.GITHUB_ACTIONS === 'true' && env.SUPABASE_PROJECT_REF) refuse('A local test address cannot be used in a staging run.')
    return { apiUrl: `${u.origin}`, local: true }
  }
  if (!env.SUPABASE_PROJECT_REF) refuse('SUPABASE_PROJECT_REF is not set in the staging environment.')
  if (env.SUPABASE_PROJECT_REF !== expected) refuse('SUPABASE_PROJECT_REF does not match the approved staging project.')
  if (env.CONFIRM_PROJECT_REF !== expected) refuse('The typed confirmation does not match the approved staging project.')
  return { apiUrl: `https://${expected}.supabase.co`, local: false }
}

/** The key must be a server key, and a legacy key must name the approved project. */
export function checkKey(key, env, target) {
  if (!key) refuse('STAGING_SERVICE_ROLE_KEY is not set in the staging environment.')
  if (/^sb_publishable_/.test(key)) refuse('STAGING_SERVICE_ROLE_KEY is a publishable key. A secret (server) key is required.')
  if (/^sb_secret_[A-Za-z0-9_-]{16,}$/.test(key)) return
  const payload = key.split('.').length === 3 ? decodeJwtPayload(key) : null
  if (!payload) refuse('STAGING_SERVICE_ROLE_KEY is not a recognised Supabase server key.')
  if (payload.role !== 'service_role') refuse('STAGING_SERVICE_ROLE_KEY is not a service role key.')
  if (!target.local && payload.ref !== env.EXPECTED_PROJECT_REF) refuse('STAGING_SERVICE_ROLE_KEY belongs to a different Supabase project.')
}

export function checkPassword(password, emails) {
  if (!password) refuse('STAGING_TEST_ACCOUNT_PASSWORD is not set in the staging environment.')
  if ([...password].length < MIN_PASSWORD_LENGTH) refuse(`STAGING_TEST_ACCOUNT_PASSWORD must be at least ${MIN_PASSWORD_LENGTH} characters.`)
  if (new TextEncoder().encode(password).length > 72) refuse('STAGING_TEST_ACCOUNT_PASSWORD must be at most 72 bytes.')
  const lower = password.toLowerCase()
  if (emails.some((e) => lower.includes(e.split('@')[0]))) refuse('STAGING_TEST_ACCOUNT_PASSWORD must not contain a test account address.')
}

const isTagged = (user) => user?.app_metadata?.[TEST_TAG] === true

export function makeApi(apiUrl, key, fetchImpl = fetch) {
  const headers = { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' }
  const call = async (path, init = {}) => {
    const res = await fetchImpl(`${apiUrl}${path}`, { ...init, headers: { ...headers, ...(init.headers || {}) } })
    const text = await res.text()
    let body = null
    try {
      body = text ? JSON.parse(text) : null
    } catch {
      body = null
    }
    return { status: res.status, body }
  }
  return {
    async signupDisabled() {
      const r = await call('/auth/v1/settings')
      if (r.status !== 200) refuse(`Could not read Auth settings (HTTP ${r.status}). Check STAGING_SERVICE_ROLE_KEY.`)
      return r.body?.disable_signup === true
    },
    async listUsers() {
      const users = []
      for (let page = 1; page <= 100; page++) {
        const r = await call(`/auth/v1/admin/users?page=${page}&per_page=1000`)
        if (r.status === 401 || r.status === 403) refuse(`The key was refused (HTTP ${r.status}). It may belong to a different project.`)
        if (r.status !== 200) refuse(`Could not list accounts (HTTP ${r.status}).`)
        const batch = r.body?.users || []
        users.push(...batch)
        if (batch.length < 1000) return users
      }
      refuse('Too many accounts to list safely.')
    },
    async createUser(email, password) {
      return call('/auth/v1/admin/users', {
        method: 'POST',
        body: JSON.stringify({
          email,
          password,
          email_confirm: true,
          app_metadata: { [TEST_TAG]: true, created_by: 'staging-test-accounts workflow' },
        }),
      })
    },
    async deleteUser(id) {
      return call(`/auth/v1/admin/users/${encodeURIComponent(id)}`, { method: 'DELETE' })
    },
    async profileCount(ids) {
      if (!ids.length) return 0
      const r = await call(`/rest/v1/profiles?select=id&id=in.(${ids.map(encodeURIComponent).join(',')})`)
      if (r.status !== 200) refuse(`Could not check profiles (HTTP ${r.status}).`)
      return Array.isArray(r.body) ? r.body.length : 0
    },
  }
}

/**
 * Runs one mode and returns the lines it printed. Only ever reports
 * "test account N", counts and statuses.
 */
export async function run(env, { fetchImpl = fetch, print = console.log, mask = () => {} } = {}) {
  const out = []
  const say = (line) => {
    out.push(line)
    print(line)
  }
  const mode = env.MODE || 'plan'
  if (!['plan', 'create', 'delete'].includes(mode)) refuse(`Unknown mode "${mode}".`)

  // Mask secrets first, before anything can fail and echo them.
  const key = env.STAGING_SERVICE_ROLE_KEY || ''
  const rawEmails = env.STAGING_TEST_ACCOUNT_EMAILS || ''
  const password = env.STAGING_TEST_ACCOUNT_PASSWORD || ''
  if (key) mask(key)
  if (password) mask(password)
  for (const e of rawEmails.split(/[\s,]+/).filter(Boolean)) mask(e.trim().toLowerCase())

  const target = resolveTarget(env)
  checkKey(key, env, target)
  const emails = parseEmails(rawEmails)
  if (mode === 'create') checkPassword(password, emails)

  const api = makeApi(target.apiUrl, key, fetchImpl)
  say(`Target: ${target.local ? 'local test stack' : `staging project ${env.EXPECTED_PROJECT_REF}`}. Mode: ${mode}.`)

  if (!(await api.signupDisabled())) refuse('Public sign-up is enabled on this project. Refusing to run: the invitation-only model must stay in place.')
  say('Public sign-up is disabled (invitation-only). Confirmed.')

  const users = await api.listUsers()
  const byEmail = new Map(users.map((u) => [String(u.email || '').toLowerCase(), u]))
  const listed = emails.map((e, i) => ({ n: i + 1, user: byEmail.get(e) }))
  const unlistedTagged = users.filter((u) => isTagged(u) && !emails.includes(String(u.email || '').toLowerCase()))

  const status = ({ user }) => (!user ? 'not created' : isTagged(user) ? 'exists (tagged test account)' : 'exists as a REAL account (never touched)')
  for (const a of listed) say(`Test account ${a.n}: ${status(a)}.`)
  say(`Tagged test accounts not on the approved list: ${unlistedTagged.length}${unlistedTagged.length ? ' (never deleted by this workflow; review them in the Supabase dashboard)' : ''}.`)

  const realClash = listed.filter((a) => a.user && !isTagged(a.user))
  if (mode === 'plan') {
    say('Plan only. Nothing was changed.')
    return out
  }

  if (mode === 'create') {
    if (realClash.length) refuse(`Test account ${realClash.map((a) => a.n).join(', ')} already exists as a real, untagged account. Nothing was changed. Use a different address.`)
    let created = 0
    for (const a of listed) {
      if (a.user) continue
      const r = await api.createUser(emails[a.n - 1], password)
      if (r.status !== 200 && r.status !== 201) refuse(`Creating test account ${a.n} failed (HTTP ${r.status}${r.body?.error_code ? ` ${r.body.error_code}` : ''}). Earlier accounts stay created and tagged.`)
      if (!isTagged(r.body)) refuse(`Test account ${a.n} was created without its test tag. Stop and investigate.`)
      created++
      say(`Test account ${a.n}: created, email confirmed, tagged.`)
    }
    const after = await api.listUsers()
    const ids = emails.map((e) => after.find((u) => String(u.email || '').toLowerCase() === e)).filter(isTagged).map((u) => u.id)
    if (ids.length !== ACCOUNT_COUNT) refuse(`Expected ${ACCOUNT_COUNT} tagged test accounts, found ${ids.length}.`)
    say(`Created ${created}; ${ACCOUNT_COUNT - created} already existed. All ${ACCOUNT_COUNT} are tagged test accounts.`)
    say(`Profiles created automatically: ${await api.profileCount(ids)} of ${ACCOUNT_COUNT}.`)
  }

  if (mode === 'delete') {
    // Both conditions, always: the server-only tag and an exact match with one
    // of the four approved addresses.
    const targets = listed.filter((a) => a.user && isTagged(a.user)).map((a) => ({ label: `Test account ${a.n}`, user: a.user }))
    for (const t of targets) {
      if (!isTagged(t.user) || !emails.includes(String(t.user.email || '').toLowerCase())) refuse('Internal check failed: an account without both the tag and an approved address was selected for deletion.')
      const r = await api.deleteUser(t.user.id)
      if (r.status !== 200 && r.status !== 204) refuse(`Deleting ${t.label.toLowerCase()} failed (HTTP ${r.status}).`)
      say(`${t.label}: deleted, with its profile.`)
    }
    if (realClash.length) say(`Real accounts left untouched: ${realClash.length}.`)
    say(`Deleted ${targets.length} tagged test account(s).`)
  }

  if (!(await api.signupDisabled())) refuse('Public sign-up is enabled after the run. Investigate immediately.')
  say('Public sign-up is still disabled after the run.')
  return out
}

const isMain = process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href
if (isMain) {
  const mask = (v) => {
    if (process.env.GITHUB_ACTIONS === 'true' && v) console.log(`::add-mask::${v}`)
  }
  run(process.env, { mask }).catch((e) => {
    console.log(`::error::${e instanceof Refusal ? e.message : 'Unexpected error. Nothing more was attempted.'}`)
    if (!(e instanceof Refusal)) console.error(e?.name || 'Error')
    process.exit(1)
  })
}
