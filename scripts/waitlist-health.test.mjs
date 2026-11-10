// Tests for the waitlist health check, against a simulated function. Run with: node --test scripts/*.test.mjs
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { runHealthCheck } from './waitlist-health.mjs'

const URL_OK = 'https://kpudeppgokpjhvaqrprn.supabase.co/functions/v1/join-waitlist'
const ORIGIN = 'https://crevant.example'
const json = (status, body, headers = {}) => new Response(JSON.stringify(body), { status, headers })

// A simulated function: dbOk, open and allowed origin are configurable.
function fakeFunction({ dbOk = true, open = false, allowed = ORIGIN, down = false } = {}) {
  const calls = []
  const f = async (url, init) => {
    calls.push({ url, method: init.method, body: init.body ?? null })
    if (down) throw new Error('ECONNREFUSED')
    if (init.method === 'GET') return json(dbOk ? 200 : 503, { status: dbOk ? 'ok' : 'error' })
    const origin = init.headers?.Origin
    if (init.method === 'OPTIONS') return origin === allowed ? new Response(null, { status: 204, headers: { 'access-control-allow-origin': origin } }) : json(403, { status: 'forbidden' })
    if (origin !== allowed) return json(403, { status: 'forbidden' })
    return open ? json(400, { status: 'verification_failed' }) : json(503, { status: 'closed' })
  }
  return { f, calls }
}

test('a healthy, closed function passes when closed is expected, and submits nothing', async () => {
  const { f, calls } = fakeFunction()
  const r = await runHealthCheck({ url: URL_OK, origin: ORIGIN, expected: 'closed' }, f)
  assert.equal(r.ok, true, r.lines.join('\n'))
  assert.equal(r.lines.length, 3)
  const post = calls.find((c) => c.method === 'POST')
  assert.equal(post.body, '{}')
})

test('an unexpected switch state is reported', async () => {
  const r1 = await runHealthCheck({ url: URL_OK, origin: ORIGIN, expected: 'open' }, fakeFunction({ open: false }).f)
  assert.equal(r1.ok, false)
  assert.match(r1.lines.join('\n'), /closed, but open was expected/)
  const r2 = await runHealthCheck({ url: URL_OK, origin: ORIGIN, expected: 'closed' }, fakeFunction({ open: true }).f)
  assert.equal(r2.ok, false)
  assert.match(r2.lines.join('\n'), /open, but closed was expected/)
  assert.equal((await runHealthCheck({ url: URL_OK, origin: ORIGIN, expected: 'open' }, fakeFunction({ open: true }).f)).ok, true)
})

test('a database login failure, a refused origin and an unreachable function are reported', async () => {
  const db = await runHealthCheck({ url: URL_OK, origin: ORIGIN, expected: 'closed' }, fakeFunction({ dbOk: false }).f)
  assert.equal(db.ok, false)
  assert.match(db.lines.join('\n'), /database login could not connect/)
  const origin = await runHealthCheck({ url: URL_OK, origin: ORIGIN, expected: 'closed' }, fakeFunction({ allowed: 'https://other.example' }).f)
  assert.equal(origin.ok, false)
  assert.match(origin.lines.join('\n'), /origin is not allowed/)
  const down = await runHealthCheck({ url: URL_OK, origin: ORIGIN, expected: 'closed' }, fakeFunction({ down: true }).f)
  assert.equal(down.ok, false)
  assert.equal(down.lines.filter((l) => /did not answer/.test(l)).length, 3)
})

test('bad configuration is refused before any request', async () => {
  for (const cfg of [
    { url: '', origin: ORIGIN, expected: 'closed' },
    { url: 'https://evil.example/functions/v1/join-waitlist', origin: ORIGIN, expected: 'closed' },
    { url: URL_OK, origin: 'not an origin', expected: 'closed' },
    { url: URL_OK, origin: ORIGIN, expected: 'maybe' },
  ]) {
    const { f, calls } = fakeFunction()
    const r = await runHealthCheck(cfg, f)
    assert.equal(r.ok, false, JSON.stringify(cfg))
    assert.equal(calls.length, 0)
  }
})
