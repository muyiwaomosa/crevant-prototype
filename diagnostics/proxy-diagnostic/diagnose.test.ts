// Unit tests for the A3 proxy diagnostic (temporary branch only).
// Run: npx vitest run --config diagnostics/vitest.config.ts
import { createHash, randomBytes } from 'node:crypto'
import { describe as group, expect, it } from 'vitest'
import {
  authorised,
  constantTimeEqual,
  describe,
  MAX_WINDOW_MS,
  readConfig,
  STAGING_SUPABASE_URL,
  type DiagConfig,
  type Setting,
} from './deploy/supabase/functions/proxy-diagnostic/diagnose'

const TOKEN = randomBytes(32).toString('base64url')
const HASH = createHash('sha256').update(TOKEN).digest('hex')
const NOW = Date.parse('2026-11-11T12:00:00Z')
const iso = (ms: number) => new Date(ms).toISOString().slice(0, 19) + 'Z'
const GOOD: Record<Setting, string> = {
  DIAG_ENABLED: 'true',
  DIAG_TOKEN_SHA256: HASH,
  DIAG_ACTIVATED_AT: iso(NOW - 60_000),
  DIAG_EXPIRES_AT: iso(NOW + 3 * 3600_000),
  SUPABASE_URL: STAGING_SUPABASE_URL,
}
const cfg = (over: Partial<Record<Setting, string>> = {}, now = NOW) => readConfig((k) => ({ ...GOOD, ...over })[k] ?? '', now)
const CONFIG = cfg() as DiagConfig
const KEY = 'eyJhbGciOiJIUzI1NiJ9.public-anon-key.signature'
const hdrs = (h: Record<string, string>) => new Headers(h)
const authed = (extra: Record<string, string> = {}) => hdrs({ authorization: `Bearer ${KEY}`, 'x-diag-token': TOKEN, ...extra })

group('configuration: off by default, staging only, at most 24 hours', () => {
  it('accepts a complete, current configuration', () => {
    expect(CONFIG).not.toBeNull()
    expect(CONFIG.expiresAt - CONFIG.activatedAt).toBeLessThanOrEqual(MAX_WINDOW_MS)
  })

  it('is off unless DIAG_ENABLED is exactly "true"', () => {
    for (const v of ['', 'false', 'TRUE', '1', 'yes', ' true']) expect(cfg({ DIAG_ENABLED: v }), v).toBeNull()
  })

  it('refuses every project but staging', () => {
    for (const v of ['', 'https://abcdefghijabcdefghij.supabase.co', `${STAGING_SUPABASE_URL}/`, 'http://kong:8000', 'http://127.0.0.1:54321']) {
      expect(cfg({ SUPABASE_URL: v }), v).toBeNull()
    }
  })

  it('refuses a missing, malformed or empty-input token hash', () => {
    const empty = createHash('sha256').update('').digest('hex')
    for (const v of ['', 'x', HASH.toUpperCase(), HASH.slice(1), `${HASH}0`, TOKEN, empty]) expect(cfg({ DIAG_TOKEN_SHA256: v }), v).toBeNull()
  })

  it('refuses malformed times', () => {
    for (const v of ['', 'tomorrow', '2026-11-11', '2026-11-11T12:00:00', '2026-11-11T12:00:00.000Z', '2026-11-11T12:00:00+00:00', '2026-02-30T12:00:00Z', '2026-11-11T25:00:00Z']) {
      expect(cfg({ DIAG_EXPIRES_AT: v }), v).toBeNull()
      expect(cfg({ DIAG_ACTIVATED_AT: v }), v).toBeNull()
    }
  })

  it('refuses a window longer than 24 hours, or backwards', () => {
    const DAY = 24 * 60 * 60 * 1000
    expect(MAX_WINDOW_MS).toBe(DAY)
    expect(cfg({ DIAG_ACTIVATED_AT: iso(NOW - 1000), DIAG_EXPIRES_AT: iso(NOW - 1000 + DAY) })).not.toBeNull()
    expect(cfg({ DIAG_ACTIVATED_AT: iso(NOW - 1000), DIAG_EXPIRES_AT: iso(NOW + DAY) })).toBeNull()
    expect(cfg({ DIAG_ACTIVATED_AT: iso(NOW - 1000), DIAG_EXPIRES_AT: iso(NOW + 2 * DAY) })).toBeNull()
    expect(cfg({ DIAG_ACTIVATED_AT: iso(NOW), DIAG_EXPIRES_AT: iso(NOW + 30 * 86400_000) })).toBeNull()
    expect(cfg({ DIAG_ACTIVATED_AT: iso(NOW + 3600_000), DIAG_EXPIRES_AT: iso(NOW) })).toBeNull()
  })

  it('is refused before activation, and automatically from the moment it expires', () => {
    expect(cfg({ DIAG_ACTIVATED_AT: iso(NOW + 60_000), DIAG_EXPIRES_AT: iso(NOW + 3600_000) })).toBeNull()
    const expires = Date.parse(GOOD.DIAG_EXPIRES_AT)
    expect(cfg({}, expires - 1000)).not.toBeNull()
    expect(cfg({}, expires)).toBeNull()
    expect(cfg({}, expires + 1)).toBeNull()
    expect(cfg({}, expires + 365 * 86400_000)).toBeNull()
  })
})

group('authentication', () => {
  it('accepts the right token through a Supabase key header', async () => {
    expect(await authorised(authed(), CONFIG)).toBe(true)
    expect(await authorised(hdrs({ apikey: 'sb_publishable_xxxxxxxxxxxxxxxxxxxx', 'x-diag-token': TOKEN }), CONFIG)).toBe(true)
  })

  it('refuses a missing, wrong, short or malformed token', async () => {
    const other = randomBytes(32).toString('base64url')
    for (const t of [null, '', other, TOKEN.slice(0, 42), `${TOKEN}=`, TOKEN.toUpperCase() === TOKEN ? `${TOKEN}x` : TOKEN.toUpperCase(), HASH, 'x'.repeat(43), `${TOKEN}!`]) {
      const h = authed()
      if (t === null) h.delete('x-diag-token')
      else h.set('x-diag-token', t)
      expect(await authorised(h, CONFIG), String(t)).toBe(false)
    }
  })

  it('refuses a token shorter than 32 random bytes, even when its hash is the configured one', async () => {
    for (const short of ['abc', 'shortbutvalidbase64url_chars', randomBytes(31).toString('base64url')]) {
      const c = cfg({ DIAG_TOKEN_SHA256: createHash('sha256').update(short).digest('hex') }) as DiagConfig
      expect(await authorised(hdrs({ authorization: `Bearer ${KEY}`, 'x-diag-token': short }), c), short).toBe(false)
    }
  })

  it('refuses the right token without a Supabase key header', async () => {
    expect(await authorised(hdrs({ 'x-diag-token': TOKEN }), CONFIG)).toBe(false)
    expect(await authorised(hdrs({ 'x-diag-token': TOKEN, authorization: 'Bearer short' }), CONFIG)).toBe(false)
    expect(await authorised(hdrs({ 'x-diag-token': TOKEN, authorization: `Basic ${KEY}` }), CONFIG)).toBe(false)
  })

  it('does not take the token from the Authorization header', async () => {
    expect(await authorised(hdrs({ authorization: `Bearer ${TOKEN}` }), CONFIG)).toBe(false)
  })

  it('compares in constant time over the whole digest', () => {
    const a = new Uint8Array(32).fill(7)
    expect(constantTimeEqual(a, a.slice())).toBe(true)
    for (const i of [0, 15, 31]) {
      const b = a.slice()
      b[i] ^= 1
      expect(constantTimeEqual(a, b)).toBe(false)
    }
    expect(constantTimeEqual(a, a.slice(0, 31))).toBe(false)
  })
})

group('what it describes', () => {
  const report = (h: Record<string, string>) => describe(hdrs(h), CONFIG, NOW)

  it('a platform-added entry to the right of a forged one: one trusted hop', () => {
    const r = report({ 'x-forwarded-for': '198.51.100.7, 81.2.69.160', 'x-diag-your-address': '81.2.69.160' })
    expect(r.forwarded_for.entries).toBe(2)
    expect(r.forwarded_for.positions[0]).toEqual({ from_right: 1, kind: 'ipv4', scope: 'public', matches_your_address: true, same_ipv6_64_as_yours: null })
    expect(r.forwarded_for.positions[1]).toMatchObject({ from_right: 2, scope: 'documentation', matches_your_address: false })
    expect(r.suggested_trusted_hops).toBe(1)
  })

  it('an internal proxy entry to the right of the visitor: two trusted hops', () => {
    const r = report({ 'x-forwarded-for': '198.51.100.7, 203.0.113.9, 81.2.69.160, 10.1.2.3', 'x-diag-your-address': '81.2.69.160' })
    expect(r.forwarded_for.positions.map((p) => p.scope)).toEqual(['internal', 'public', 'documentation', 'documentation'])
    expect(r.suggested_trusted_hops).toBe(2)
  })

  it('no suggestion when a forged or malformed entry sits to the right of the match, or nothing matches', () => {
    expect(report({ 'x-forwarded-for': '81.2.69.160, 198.51.100.7', 'x-diag-your-address': '81.2.69.160' }).suggested_trusted_hops).toBeNull()
    expect(report({ 'x-forwarded-for': '81.2.69.160, junk', 'x-diag-your-address': '81.2.69.160' }).suggested_trusted_hops).toBeNull()
    expect(report({ 'x-forwarded-for': '81.2.69.160, ', 'x-diag-your-address': '81.2.69.160' }).suggested_trusted_hops).toBeNull()
    expect(report({ 'x-forwarded-for': '81.2.69.161', 'x-diag-your-address': '81.2.69.160' }).suggested_trusted_hops).toBeNull()
    expect(report({ 'x-forwarded-for': '81.2.69.160' }).suggested_trusted_hops).toBeNull()
  })

  it('many forged entries: counts them, describes the rightmost eight', () => {
    const forged = Array.from({ length: 20 }, (_, i) => `198.51.100.${i + 1}`).join(', ')
    const r = report({ 'x-forwarded-for': `${forged}, 81.2.69.160`, 'x-diag-your-address': '81.2.69.160' })
    expect(r.forwarded_for.entries).toBe(21)
    expect(r.forwarded_for.positions).toHaveLength(8)
    expect(r.forwarded_for.more_positions).toBe(13)
    expect(r.suggested_trusted_hops).toBe(1)
  })

  it('separate header lines, joined with ", " by the runtime, read as one list', () => {
    const r = report({ 'x-forwarded-for': ['198.51.100.7', '81.2.69.160'].join(', '), 'x-diag-your-address': '81.2.69.160' })
    expect(r.forwarded_for.entries).toBe(2)
    expect(r.suggested_trusted_hops).toBe(1)
  })

  it('IPv6: kinds, scopes, exact match and same /64', () => {
    const r = report({ 'x-forwarded-for': '2001:db8::7, 2a00:1450:4001:81a::200e, fd00::1', 'x-diag-your-address': '2A00:1450:4001:081A:0:0:0:200E' })
    expect(r.forwarded_for.positions.map((p) => [p.kind, p.scope])).toEqual([['ipv6', 'internal'], ['ipv6', 'public'], ['ipv6', 'documentation']])
    expect(r.forwarded_for.positions[1]).toMatchObject({ matches_your_address: true, same_ipv6_64_as_yours: true })
    const near = report({ 'x-forwarded-for': '2a00:1450:4001:81a::1', 'x-diag-your-address': '2a00:1450:4001:81a::200e' })
    expect(near.forwarded_for.positions[0]).toMatchObject({ matches_your_address: false, same_ipv6_64_as_yours: true })
    const far = report({ 'x-forwarded-for': '2a00:1450:4001:81b::1', 'x-diag-your-address': '2a00:1450:4001:81a::200e' })
    expect(far.forwarded_for.positions[0]).toMatchObject({ matches_your_address: false, same_ipv6_64_as_yours: false })
    expect(report({ 'x-forwarded-for': '81.2.69.160', 'x-diag-your-address': '::ffff:81.2.69.160' }).forwarded_for.positions[0].matches_your_address).toBeNull()
  })

  it('internal and special IPv4 ranges', () => {
    for (const ip of ['10.0.0.1', '172.16.0.1', '192.168.0.1', '127.0.0.1', '169.254.1.1', '100.64.0.1', '0.0.0.0', '198.18.0.1', '224.0.0.1']) {
      expect(report({ 'x-forwarded-for': ip }).forwarded_for.positions[0].scope, ip).toBe('internal')
    }
    for (const ip of ['192.0.2.1', '198.51.100.1', '203.0.113.1']) expect(report({ 'x-forwarded-for': ip }).forwarded_for.positions[0].scope, ip).toBe('documentation')
    for (const ip of ['8.8.8.8', '172.32.0.1', '100.128.0.1']) expect(report({ 'x-forwarded-for': ip }).forwarded_for.positions[0].scope, ip).toBe('public')
  })

  it('malformed, empty, missing and oversized headers', () => {
    const r = report({ 'x-forwarded-for': '999.1.1.1, <script>, , 1.2.3.4 5.6.7.8, unknown' })
    expect(r.forwarded_for.positions.map((p) => p.kind)).toEqual(['malformed', 'malformed', 'empty', 'malformed', 'malformed'])
    expect(report({}).forwarded_for).toEqual({ present: false, too_long: false, entries: 0, positions: [], more_positions: 0 })
    const big = report({ 'x-forwarded-for': '1.1.1.1, '.repeat(600) })
    expect(big.forwarded_for).toMatchObject({ present: true, too_long: true, entries: 0, positions: [] })
    expect(report({ 'x-diag-your-address': 'not-an-address' }).your_address).toEqual({ given: true, kind: 'malformed' })
  })

  it('other forwarding headers: presence, kind and match only', () => {
    const r = report({ 'x-real-ip': '81.2.69.160', 'cf-connecting-ip': '2a00:1450::1', forwarded: 'for=81.2.69.160', 'x-diag-your-address': '81.2.69.160' })
    expect(r.other_headers['x-real-ip']).toEqual({ present: true, kind: 'ipv4', scope: 'public', matches_your_address: true })
    expect(r.other_headers['cf-connecting-ip']).toMatchObject({ present: true, kind: 'ipv6', matches_your_address: false })
    expect(r.other_headers['true-client-ip']).toEqual({ present: false, kind: null, scope: null, matches_your_address: null })
    expect(r.other_headers.forwarded).toEqual({ present: true })
  })

  it('never returns an address, a header value or the token', () => {
    const secrets = ['81.2.69.160', '198.51.100.7', '2a00:1450:4001:81a::200e', '2a00', '1450', 'for=', '<script>', 'unknown', TOKEN, HASH, KEY]
    const r = report({
      'x-forwarded-for': '198.51.100.7, <script>, unknown, 2a00:1450:4001:81a::200e, 81.2.69.160',
      'x-real-ip': '81.2.69.160',
      forwarded: 'for=81.2.69.160',
      'x-diag-your-address': '81.2.69.160',
      'x-diag-token': TOKEN,
      authorization: `Bearer ${KEY}`,
    })
    const text = JSON.stringify(r)
    for (const s of secrets) expect(text.includes(s), s).toBe(false)
    // Only these keys and value types, anywhere in the report.
    const walk = (v: unknown): void => {
      if (v === null || typeof v === 'boolean' || typeof v === 'number') return
      if (typeof v === 'string') return void expect(['ipv4', 'ipv6', 'malformed', 'empty', 'public', 'internal', 'documentation']).toContain(v)
      if (Array.isArray(v)) return v.forEach(walk)
      Object.values(v as object).forEach(walk)
    }
    walk(r)
  })
})
