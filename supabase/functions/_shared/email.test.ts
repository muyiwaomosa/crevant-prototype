import { describe, expect, it, vi } from 'vitest'
import { EMAIL_FROM, RESEND_ENDPOINT, escapeHtml, sendEmail } from './email'

const KEY = 're_' + 'a'.repeat(30)
const MAIL = { to: 'maya@example.com', subject: 'S', text: 'T', html: '<p>T</p>' }
const ok = (body: unknown, status = 200) => vi.fn(async () => new Response(JSON.stringify(body), { status }))

describe('sendEmail (BL-009)', () => {
  it('sends from the fixed Splitpost address to one recipient, with the key as a bearer token', async () => {
    const f = ok({ id: 'abc-123' })
    expect(await sendEmail(MAIL, KEY, f as unknown as typeof fetch)).toEqual({ ok: true, id: 'abc-123' })
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe(RESEND_ENDPOINT)
    expect((init.headers as Record<string, string>).Authorization).toBe(`Bearer ${KEY}`)
    expect(JSON.parse(String(init.body))).toEqual({ from: EMAIL_FROM, to: ['maya@example.com'], subject: 'S', text: 'T', html: '<p>T</p>' })
    expect(EMAIL_FROM).toBe('Splitpost <noreply@mail.splitpost.ca>')
  })
  it('sends nothing without a usable key or with a malformed recipient', async () => {
    const f = ok({ id: 'x' })
    expect(await sendEmail(MAIL, '', f as unknown as typeof fetch)).toEqual({ ok: false, error: 'not_configured' })
    expect(await sendEmail({ ...MAIL, to: 'a@b.c, d@e.f' }, KEY, f as unknown as typeof fetch)).toEqual({ ok: false, error: 'invalid_recipient' })
    expect(f).not.toHaveBeenCalled()
  })
  it('reports refusals, outages and network failures as fixed codes', async () => {
    expect(await sendEmail(MAIL, KEY, ok({ message: 'bad' }, 422) as unknown as typeof fetch)).toEqual({ ok: false, error: 'provider_rejected' })
    expect(await sendEmail(MAIL, KEY, ok({}, 503) as unknown as typeof fetch)).toEqual({ ok: false, error: 'provider_unavailable' })
    expect(await sendEmail(MAIL, KEY, vi.fn(async () => { throw new Error('down') }) as unknown as typeof fetch)).toEqual({ ok: false, error: 'network' })
  })
  it('escapes HTML', () => expect(escapeHtml(`<a href="x">'&`)).toBe('&lt;a href=&quot;x&quot;&gt;&#39;&amp;'))
})
