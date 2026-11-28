// Sending one email through Resend (BL-009): waitlist verification links
// (join-waitlist, on the waitlist project) and personal invitations
// (waitlist-bridge, on the member project). Pure apart from the fetch it is
// given, so it can be unit tested.
//
// The sender is fixed here, never configured: Splitpost <noreply@mail.splitpost.ca>,
// on the domain verified in Resend. Each project holds its own sending-only
// key as the function secret RESEND_API_KEY. Without one, nothing is sent.
// The address, link and key are never logged; only a fixed error code is.

export const EMAIL_FROM = 'Splitpost <noreply@mail.splitpost.ca>'
export const RESEND_ENDPOINT = 'https://api.resend.com/emails'

export interface Mail {
  to: string
  subject: string
  text: string
  html: string
}

export type SendResult = { ok: true; id: string } | { ok: false; error: 'not_configured' | 'invalid_recipient' | 'provider_rejected' | 'provider_unavailable' | 'network' }

const EMAIL = /^[^@\s<>"',;]+@[^@\s<>"',;]+\.[^@\s<>"',;]+$/
const RESEND_ID = /^[A-Za-z0-9_-]{1,100}$/

/** A Resend key looks like re_ followed by letters, digits and underscores. */
export function resendKeyUsable(key: string): boolean {
  return /^re_[A-Za-z0-9_]{16,}$/.test(key)
}

export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string)
}

export async function sendEmail(mail: Mail, key: string, fetchFn: typeof fetch): Promise<SendResult> {
  if (!resendKeyUsable(key)) return { ok: false, error: 'not_configured' }
  if (!EMAIL.test(mail.to) || mail.to.length > 254) return { ok: false, error: 'invalid_recipient' }
  let res: Response
  try {
    res = await fetchFn(RESEND_ENDPOINT, {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: EMAIL_FROM, to: [mail.to], subject: mail.subject, text: mail.text, html: mail.html }),
      signal: AbortSignal.timeout(10_000),
    })
  } catch {
    return { ok: false, error: 'network' }
  }
  if (!res.ok) {
    await res.body?.cancel()
    return { ok: false, error: res.status >= 500 || res.status === 429 ? 'provider_unavailable' : 'provider_rejected' }
  }
  let id: unknown
  try {
    id = ((await res.json()) as { id?: unknown }).id
  } catch {
    id = null
  }
  return typeof id === 'string' && RESEND_ID.test(id) ? { ok: true, id } : { ok: false, error: 'provider_unavailable' }
}

/** The plain footer every Splitpost email carries (sender identification). */
export function footer(reason: string): { text: string; html: string } {
  const text = `Splitpost, Ontario, Canada. ${reason}`
  return { text, html: `<p style="color:#6b6b6b;font-size:12px;line-height:1.5">${escapeHtml(text)}</p>` }
}
