#!/usr/bin/env node
// Daily health check for the join-waitlist function. Uses no secrets and no
// database credentials: it only calls the function's public address, the way
// a browser would, and never submits anything.
//
//   1. GET                       the function answers, and its restricted
//                                database login can connect
//   2. OPTIONS from the site     the browser preflight is allowed
//   3. POST {} from the site     no data and no Turnstile token: 'closed'
//                                means the function switch is off;
//                                'verification_failed' means it is on.
//                                Nothing is stored either way.
//
// The function switch is then compared with WAITLIST_EXPECTED_STATE (open or
// closed), so an unexpected change is reported. The database switch is not
// visible from outside; use the admin workflow's "status" action for that.
//
// Environment (repository variables, not secrets):
//   WAITLIST_FUNCTION_URL    https://<project>.supabase.co/functions/v1/join-waitlist
//   WAITLIST_SITE_ORIGIN     the site origin the function allows
//   WAITLIST_EXPECTED_STATE  open or closed
//
// Prints one line per check and exits non zero on any failure, so GitHub
// emails a failed run. It never prints anything personal.

export const FUNCTION_URL = /^https:\/\/[a-z0-9]{20}\.supabase\.co\/functions\/v1\/join-waitlist$/
const ORIGIN = /^https:\/\/[a-z0-9.-]+$/

async function status(res) {
  const data = await res.json().catch(() => ({}))
  return typeof data.status === 'string' ? data.status : null
}

/** Runs the checks and returns { ok, lines }. */
export async function runHealthCheck({ url, origin, expected }, fetchImpl = fetch) {
  const lines = []
  let ok = true
  const result = (pass, text) => {
    if (!pass) ok = false
    lines.push(`${pass ? 'PASS' : 'FAIL'}  ${text}`)
  }

  if (!FUNCTION_URL.test(url || '') || !ORIGIN.test(origin || '') || !['open', 'closed'].includes(expected)) {
    result(false, 'configuration: WAITLIST_FUNCTION_URL, WAITLIST_SITE_ORIGIN and WAITLIST_EXPECTED_STATE (open or closed) must be set correctly')
    return { ok, lines }
  }

  const attempt = async (label, fn) => {
    try {
      return await fn()
    } catch {
      result(false, `${label}: the function did not answer (network error or timeout)`)
      return null
    }
  }
  const signal = () => AbortSignal.timeout(20000)

  const health = await attempt('health', () => fetchImpl(url, { method: 'GET', signal: signal() }))
  if (health) {
    const s = await status(health)
    result(health.status === 200 && s === 'ok', health.status === 200 && s === 'ok'
      ? 'health: the function answers and its database login connects'
      : `health: the function answered ${health.status} ${s ?? ''}`.trim() + (health.status === 503 ? ' (its database login could not connect)' : ''))
  }

  const pre = await attempt('preflight', () =>
    fetchImpl(url, { method: 'OPTIONS', headers: { Origin: origin, 'Access-Control-Request-Method': 'POST' }, signal: signal() }),
  )
  if (pre) {
    const allowed = pre.status === 204 && pre.headers.get('access-control-allow-origin') === origin
    result(allowed, allowed ? 'preflight: the site origin is allowed' : `preflight: answered ${pre.status}, the site origin is not allowed`)
  }

  const probe = await attempt('switch', () =>
    fetchImpl(url, { method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json' }, body: '{}', signal: signal() }),
  )
  if (probe) {
    const s = await status(probe)
    const actual = s === 'closed' ? 'closed' : s === 'verification_failed' ? 'open' : null
    if (!actual) result(false, `switch: unexpected answer ${probe.status} ${s ?? ''}`.trim())
    else result(actual === expected, `switch: the function is ${actual}${actual === expected ? ', as expected' : `, but ${expected} was expected`}`)
  }

  return { ok, lines }
}

const isMain = import.meta.url === `file://${process.argv[1]}`
if (isMain) {
  const { ok, lines } = await runHealthCheck({
    url: (process.env.WAITLIST_FUNCTION_URL || '').trim(),
    origin: (process.env.WAITLIST_SITE_ORIGIN || '').trim(),
    expected: (process.env.WAITLIST_EXPECTED_STATE || '').trim(),
  })
  for (const line of lines) console.log(line)
  if (!ok) {
    console.log('::error::Waitlist health check failed. See docs/WAITLIST-OPERATIONS.md, "When the health check fails".')
    process.exit(1)
  }
}
