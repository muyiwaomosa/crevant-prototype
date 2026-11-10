import { describe, expect, it, vi } from 'vitest'
import { handleJoin, hashClientKey, submitThroughDataApi, toPayload, verifyWithCloudflare, type JoinDeps } from './handler'

const ORIGIN = 'https://crevant.example'
const valid = {
  email: '  Maya@Example.com ',
  interests: ['reach_followers'],
  sharesContent: 'yes',
  platform: 'youtube',
  audienceBand: '1k_10k',
  publicLink: 'https://youtube.com/@maya',
  source: 'instagram',
  ageConfirmed: true,
  waitlistConsent: true,
  marketingConsent: false,
  noticeVersion: 'notice-2026-11',
  turnstileToken: 'tok',
  website: '',
}

function deps(over: Partial<JoinDeps> = {}): JoinDeps {
  return {
    enabled: true,
    allowedOrigins: [ORIGIN],
    allowedHostnames: ['crevant.example'],
    verifyTurnstile: vi.fn(async () => ({ success: true, hostname: 'crevant.example' })),
    clientKey: vi.fn(async () => 'a'.repeat(64)),
    submit: vi.fn(async () => 'ok' as const),
    ...over,
  }
}
const post = (body: unknown, extra: Partial<Parameters<typeof handleJoin>[0]> = {}) => ({
  method: 'POST',
  origin: ORIGIN,
  contentType: 'application/json',
  body: typeof body === 'string' ? body : JSON.stringify(body),
  ip: '203.0.113.7',
  ...extra,
})
const state = (o: { body: string }) => JSON.parse(o.body).status

describe('join-waitlist handler', () => {
  it('accepts a valid submission and passes normalised arguments to the database', async () => {
    const d = deps()
    const out = await handleJoin(post(valid), d)
    expect([out.status, state(out)]).toEqual([200, 'ok'])
    expect(out.headers['Access-Control-Allow-Origin']).toBe(ORIGIN)
    expect(d.submit).toHaveBeenCalledWith(
      expect.objectContaining({ p_email: 'maya@example.com', p_waitlist_consent: true, p_age_confirmed: true, p_notice_version: 'notice-2026-11', p_client_key: 'a'.repeat(64) }),
    )
  })

  it('is closed when the function switch is off, before any check or call', async () => {
    const d = deps({ enabled: false })
    const out = await handleJoin(post(valid), d)
    expect([out.status, state(out)]).toEqual([503, 'closed'])
    expect(d.verifyTurnstile).not.toHaveBeenCalled()
    expect(d.submit).not.toHaveBeenCalled()
  })

  it('refuses other origins, methods, content types and oversized bodies', async () => {
    expect((await handleJoin(post(valid, { origin: 'https://evil.example' }), deps())).status).toBe(403)
    expect((await handleJoin(post(valid, { origin: null }), deps())).status).toBe(403)
    expect((await handleJoin(post(valid, { method: 'GET' }), deps())).status).toBe(405)
    expect((await handleJoin(post(valid, { contentType: 'text/plain' }), deps())).status).toBe(415)
    expect((await handleJoin(post({ ...valid, publicLink: 'x'.repeat(5000) }), deps())).status).toBe(413)
    expect((await handleJoin(post('not json'), deps())).status).toBe(400)
    expect((await handleJoin(post('[1,2]'), deps())).status).toBe(400)
  })

  it('answers the browser preflight only for allowed origins', async () => {
    expect((await handleJoin({ ...post(''), method: 'OPTIONS' }, deps())).status).toBe(204)
    expect((await handleJoin({ ...post('', { origin: 'https://evil.example' }), method: 'OPTIONS' }, deps())).status).toBe(403)
  })

  it('silently drops honeypot submissions: looks like success, stores nothing', async () => {
    const d = deps()
    const out = await handleJoin(post({ ...valid, website: 'https://spam.example' }), d)
    expect([out.status, state(out)]).toEqual([200, 'ok'])
    expect(d.verifyTurnstile).not.toHaveBeenCalled()
    expect(d.submit).not.toHaveBeenCalled()
  })

  it('requires a Turnstile pass on an allowed hostname', async () => {
    for (const over of [
      { verifyTurnstile: vi.fn(async () => ({ success: false })) },
      { verifyTurnstile: vi.fn(async () => ({ success: true, hostname: 'evil.example' })) },
      { verifyTurnstile: vi.fn(async () => ({ success: true })) },
    ]) {
      const d = deps(over)
      const out = await handleJoin(post(valid), d)
      expect([out.status, state(out)]).toEqual([400, 'verification_failed'])
      expect(d.submit).not.toHaveBeenCalled()
    }
    const d = deps()
    expect(state(await handleJoin(post({ ...valid, turnstileToken: '' }), d))).toBe('verification_failed')
    expect(d.verifyTurnstile).not.toHaveBeenCalled()
  })

  it('rejects wrong shapes before reaching the database', async () => {
    for (const bad of [{ ...valid, email: 42 }, { ...valid, email: '' }, { ...valid, interests: 'all' }, { ...valid, ageConfirmed: 'yes' }, { ...valid, noticeVersion: '' }]) {
      const d = deps()
      expect(state(await handleJoin(post(bad), d))).toBe('invalid')
      expect(d.submit).not.toHaveBeenCalled()
    }
  })

  it('maps database results to statuses, and hides errors', async () => {
    const cases: Array<[Awaited<ReturnType<JoinDeps['submit']>>, number, string]> = [
      ['closed', 503, 'closed'],
      ['invalid', 400, 'invalid'],
      ['rate_limited', 429, 'rate_limited'],
    ]
    for (const [result, status, s] of cases) {
      const out = await handleJoin(post(valid), deps({ submit: vi.fn(async () => result) }))
      expect([out.status, state(out)]).toEqual([status, s])
    }
    const out = await handleJoin(post(valid), deps({ submit: vi.fn(async () => Promise.reject(new Error('boom maya@example.com'))) }))
    expect([out.status, out.body]).toEqual([500, '{"status":"error"}'])
  })

  it('never puts the email address in any response', async () => {
    for (const d of [deps(), deps({ enabled: false }), deps({ submit: vi.fn(async () => 'invalid' as const) })]) {
      const out = await handleJoin(post(valid), d)
      expect(JSON.stringify(out)).not.toMatch(/maya/i)
    }
  })
})

describe('helpers', () => {
  it('hashes the client address with a salt, and keeps nothing without one', async () => {
    const a = await hashClientKey('203.0.113.7', 'salt-1')
    expect(a).toMatch(/^[0-9a-f]{64}$/)
    expect(a).not.toContain('203')
    expect(await hashClientKey('203.0.113.7', 'salt-2')).not.toBe(a)
    expect(await hashClientKey('203.0.113.7', '')).toBeNull()
    expect(await hashClientKey(null, 'salt-1')).toBeNull()
  })

  it('verifies Turnstile server side with the secret, token and client address', async () => {
    const f = vi.fn(async () => new Response(JSON.stringify({ success: true, hostname: 'crevant.example' }), { status: 200 }))
    expect(await verifyWithCloudflare('tok', '203.0.113.7', 'sec', f as unknown as typeof fetch)).toEqual({ success: true, hostname: 'crevant.example' })
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('https://challenges.cloudflare.com/turnstile/v0/siteverify')
    const form = init.body as URLSearchParams
    expect([form.get('secret'), form.get('response'), form.get('remoteip')]).toEqual(['sec', 'tok', '203.0.113.7'])
    expect(await verifyWithCloudflare('tok', null, '', f as unknown as typeof fetch)).toEqual({ success: false })
  })

  it('calls only public.waitlist_submit, with the server key', async () => {
    const f = vi.fn(async () => new Response('"ok"', { status: 200 }))
    const payload = toPayload(valid, null)
    expect(await submitThroughDataApi(payload, 'https://abc.supabase.co', 'server-key', f as unknown as typeof fetch)).toBe('ok')
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('https://abc.supabase.co/rest/v1/rpc/waitlist_submit')
    expect((init.headers as Record<string, string>).apikey).toBe('server-key')
    const bad = vi.fn(async () => new Response('"something else"', { status: 200 }))
    await expect(submitThroughDataApi(payload, 'https://abc.supabase.co', 'k', bad as unknown as typeof fetch)).rejects.toThrow()
  })
})
