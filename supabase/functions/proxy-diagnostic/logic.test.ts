import { describe, expect, it } from 'vitest'
import { classify, diagnose, fingerprint, isOpen, MAX_WINDOW_MS, TEST_VALUE, tokenMatches } from './logic'

const TOKEN = 'a'.repeat(20) + 'b'.repeat(24)
const now = Date.parse('2026-11-17T12:00:00Z')
const open = { enabled: 'true', token: TOKEN, expiresAt: '2026-11-18T03:00:00Z', now }
const req = (forwardedFor: string | null, token: string | null = TOKEN) => ({ token, forwardedFor })

describe('proxy diagnostic', () => {
  it('is a bare 404 unless switched on, with a long token and an expiry under 24 hours away', async () => {
    const closed = [
      { ...open, enabled: 'TRUE' },
      { ...open, enabled: '' },
      { ...open, token: 'short' },
      { ...open, token: '' },
      { ...open, expiresAt: '' },
      { ...open, expiresAt: '2026-11-17T11:59:59Z' },
      { ...open, expiresAt: new Date(now + MAX_WINDOW_MS).toISOString() },
      { ...open, expiresAt: '2026-11-18T03:00:00+05:00' },
      { ...open, expiresAt: 'tomorrow' },
    ]
    for (const s of closed) {
      expect(isOpen(s)).toBe(false)
      expect(await diagnose(req('1.2.3.4'), s)).toEqual({ status: 404, body: '' })
    }
    expect(isOpen(open)).toBe(true)
  })

  it('is a bare 404 without the right token', async () => {
    for (const t of [null, '', TOKEN.slice(1), TOKEN + 'x', 'Bearer ' + TOKEN]) {
      expect(await diagnose(req('1.2.3.4', t), open)).toEqual({ status: 404, body: '' })
    }
    expect(await tokenMatches(TOKEN, TOKEN)).toBe(true)
    expect(await tokenMatches(null, '')).toBe(false)
  })

  it('reports where the forged test value lands, without returning any address', async () => {
    const header = `${TEST_VALUE}, 203.0.113.50, 10.1.2.3`
    const out = await diagnose(req(header), open)
    expect(out.status).toBe(200)
    const body = JSON.parse(out.body)
    expect(body.entries).toBe(3)
    expect(body.testValueFromRight).toBe(3)
    expect(body.positions.map((p: { kind: string }) => p.kind)).toEqual(['ipv4_private', 'ipv4_public', 'test_value'])
    expect(out.body).not.toContain('203.0.113.50')
    expect(out.body).not.toContain('10.1.2.3')
    expect(out.body).not.toContain(TEST_VALUE)
    for (const p of body.positions) expect(p.fingerprint).toMatch(/^[0-9a-f]{8}$/)
  })

  it('fingerprints are stable for one session key and differ by address and by key', async () => {
    expect(await fingerprint('203.0.113.50', TOKEN)).toBe(await fingerprint('203.0.113.50', TOKEN))
    expect(await fingerprint('203.0.113.50', TOKEN)).not.toBe(await fingerprint('203.0.113.51', TOKEN))
    expect(await fingerprint('203.0.113.50', TOKEN)).not.toBe(await fingerprint('203.0.113.50', TOKEN + 'x'))
  })

  it('classifies IPv4, IPv6, private ranges and anything else', () => {
    expect(classify('8.8.8.8')).toBe('ipv4_public')
    for (const ip of ['10.0.0.1', '172.20.0.1', '192.168.1.1', '127.0.0.1', '100.64.0.1', '169.254.1.1']) expect(classify(ip)).toBe('ipv4_private')
    expect(classify('2001:db8::1')).toBe('ipv6_public')
    for (const ip of ['::1', 'fd00::1', 'fe80::1', '::ffff:10.0.0.1']) expect(classify(ip)).toBe('ipv6_private')
    for (const x of ['', 'unknown', '999.1.1.1', '<script>']) expect(classify(x)).toBe('other')
  })

  it('handles a missing or oversized header without failing', async () => {
    expect(JSON.parse((await diagnose(req(null), open)).body)).toMatchObject({ entries: 0, positions: [], testValueFromRight: null })
    expect(JSON.parse((await diagnose(req('1.1.1.1,'.repeat(600)), open)).body)).toMatchObject({ entries: null, headerTooLong: true, positions: [] })
  })
})
