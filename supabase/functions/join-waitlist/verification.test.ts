import { describe, expect, it, vi } from 'vitest'
import { verificationMail, verifyOriginFor } from './verification'
import { handleJoin, type JoinDeps } from './handler'

const ORIGIN = 'https://crevant.example'
const TOKEN = 'a'.repeat(64)

describe('waitlist verification email (BL-009)', () => {
  it('links to the site verification page with the token after #, never in the path or query', () => {
    const m = verificationMail('maya@example.com', 'https://www.splitpost.ca', TOKEN)
    expect(m.text).toContain(`https://www.splitpost.ca/waitlist/verify#${TOKEN}`)
    expect(m.html).toContain(`https://www.splitpost.ca/waitlist/verify#${TOKEN}`)
    expect(m.text).not.toMatch(/\?token=/)
    expect(m.text).toMatch(/expires in 48 hours/)
    expect(m.text).toMatch(/Splitpost, Ontario, Canada/)
  })
  it('only uses an https origin that is one of the allowed origins', () => {
    expect(verifyOriginFor('https://www.splitpost.ca', ['https://www.splitpost.ca'])).toBe('https://www.splitpost.ca')
    expect(verifyOriginFor('https://evil.example', ['https://www.splitpost.ca'])).toBeNull()
    expect(verifyOriginFor('http://www.splitpost.ca', ['http://www.splitpost.ca'])).toBeNull()
  })
})

const base = (over: Partial<JoinDeps> = {}): JoinDeps => ({
  enabled: true,
  allowedOrigins: [ORIGIN],
  allowedHostnames: ['crevant.example'],
  verifyTurnstile: async () => ({ success: true, hostname: 'crevant.example', action: 'join' }),
  rateKeys: async () => ({ emailKey: 'e'.repeat(64), clientKey: 'c'.repeat(64) }),
  submit: async () => 'ok',
  previewInvite: async () => ({ status: 'ok', invite: 'unavailable' }),
  databaseReachable: async () => true,
  ...over,
})
const post = (body: unknown) => ({ method: 'POST', origin: ORIGIN, contentType: 'application/json', body: JSON.stringify(body), ip: null })
const join = { email: 'maya@example.com', interests: [], ageConfirmed: true, waitlistConsent: true, noticeVersion: 'notice-2026-11', turnstileToken: 'tok', website: '' }

describe('the join function with verification (BL-009)', () => {
  it('asks for a verification email after an accepted submission, and answers the same whatever happens to it', async () => {
    const afterJoin = vi.fn(async () => 'sent' as const)
    const a = await handleJoin(post(join), base({ afterJoin }))
    expect(afterJoin).toHaveBeenCalledWith('maya@example.com')
    const failing = await handleJoin(post(join), base({ afterJoin: async () => { throw new Error('provider_unavailable') } }))
    expect([a.status, JSON.parse(a.body).status]).toEqual([200, 'ok'])
    expect([failing.status, JSON.parse(failing.body).status, failing.logNote]).toEqual([200, 'ok', 'verification_email_failed'])
  })
  it('sends no email when the submission was not accepted', async () => {
    const afterJoin = vi.fn(async () => 'sent' as const)
    await handleJoin(post(join), base({ submit: async () => 'rate_limited', afterJoin }))
    expect(afterJoin).not.toHaveBeenCalled()
  })
  it('checks a verification link without Turnstile, and answers only verified, invalid or expired', async () => {
    const verifyEmail = vi.fn(async () => 'verified' as const)
    const turnstile = vi.fn()
    const out = await handleJoin(post({ action: 'verify_email', token: TOKEN.toUpperCase() }), base({ verifyEmail, verifyTurnstile: turnstile }))
    expect(JSON.parse(out.body)).toEqual({ status: 'verified' })
    expect(verifyEmail).toHaveBeenCalledWith(TOKEN)
    expect(turnstile).not.toHaveBeenCalled()
    const bad = await handleJoin(post({ action: 'verify_email', token: 'nope' }), base({ verifyEmail }))
    expect(JSON.parse(bad.body)).toEqual({ status: 'invalid' })
    expect(verifyEmail).toHaveBeenCalledTimes(1)
  })
  it('refuses a verification check from another origin or while closed', async () => {
    expect((await handleJoin({ ...post({ action: 'verify_email', token: TOKEN }), origin: 'https://evil.example' }, base())).status).toBe(403)
    expect((await handleJoin(post({ action: 'verify_email', token: TOKEN }), base({ enabled: false }))).status).toBe(503)
  })
})
