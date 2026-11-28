// BL-009: the waitlist verification email. Pure, so it can be unit tested.
// The link carries the token after '#', so it never reaches a server log:
// the public site's /waitlist/verify page reads it and posts it back.
import { escapeHtml, footer, type Mail } from '../_shared/email.ts'

export const VERIFY_PATH = '/waitlist/verify'

/** The site origin links point at: https only, and one of the allowed origins. */
export function verifyOriginFor(origin: string, allowed: string[]): string | null {
  return /^https:\/\/[a-z0-9.-]+$/.test(origin) && allowed.includes(origin) ? origin : null
}

export function verificationMail(to: string, origin: string, token: string): Mail {
  const link = `${origin}${VERIFY_PATH}#${token}`
  const privacy = `${origin}/privacy`
  const f = footer('You are receiving this because this address was entered on the Splitpost waitlist.')
  const text = [
    'Confirm your email for the Splitpost waitlist',
    '',
    'Open this link to confirm the address. Only confirmed addresses can be considered for the invitation-only pilot.',
    link,
    '',
    'The link works once and expires in 48 hours.',
    "If you didn't join the waitlist, ignore this email: an unconfirmed address is never invited, and it is deleted under our retention policy.",
    `How we handle your information: ${privacy}`,
    '',
    f.text,
  ].join('\n')
  const html = `<!doctype html><html><body style="font-family:Arial,Helvetica,sans-serif;color:#111;max-width:520px;margin:0 auto;padding:24px">
<h1 style="font-size:20px">Confirm your email for the Splitpost waitlist</h1>
<p>Open this link to confirm the address. Only confirmed addresses can be considered for the invitation-only pilot.</p>
<p><a href="${escapeHtml(link)}" style="display:inline-block;background:#1d3fd8;color:#fff;padding:12px 18px;border-radius:8px;text-decoration:none">Confirm my email</a></p>
<p style="font-size:13px">The link works once and expires in 48 hours.</p>
<p style="font-size:13px">If you didn't join the waitlist, ignore this email: an unconfirmed address is never invited, and it is deleted under our retention policy.</p>
<p style="font-size:13px"><a href="${escapeHtml(privacy)}">How we handle your information</a></p>
${f.html}
</body></html>`
  return { to, subject: 'Confirm your email for the Splitpost waitlist', text, html }
}
