// BL-009: the personal invitation email. Pure, so it can be unit tested.
import { escapeHtml, footer, type Mail } from '../_shared/email.ts'

export const PUBLIC_SITE = 'https://www.splitpost.ca'

export function invitationMail(to: string, appOrigin: string, code: string): Mail {
  const link = `${appOrigin}/register/${code}`
  const privacy = `${PUBLIC_SITE}/privacy`
  const f = footer('You are receiving this because you joined the Splitpost waitlist and confirmed your email.')
  const text = [
    "You're invited to the Splitpost pilot",
    '',
    'Thank you for joining the waitlist. You have a personal invitation to the invitation-only Splitpost pilot. Create your account with this link:',
    link,
    '',
    'The link is for you only, works once, and expires in 14 days. Earnings, pools and payouts in the pilot are simulated: no money is paid.',
    "If you no longer want to join, you can ignore this email and the invitation will expire. To have your waitlist details deleted, see how we handle your information: " + privacy,
    '',
    f.text,
  ].join('\n')
  const html = `<!doctype html><html><body style="font-family:Arial,Helvetica,sans-serif;color:#111;max-width:520px;margin:0 auto;padding:24px">
<h1 style="font-size:20px">You're invited to the Splitpost pilot</h1>
<p>Thank you for joining the waitlist. You have a personal invitation to the invitation-only Splitpost pilot.</p>
<p><a href="${escapeHtml(link)}" style="display:inline-block;background:#1d3fd8;color:#fff;padding:12px 18px;border-radius:8px;text-decoration:none">Create my account</a></p>
<p style="font-size:13px">The link is for you only, works once, and expires in 14 days. Earnings, pools and payouts in the pilot are simulated: no money is paid.</p>
<p style="font-size:13px">If you no longer want to join, you can ignore this email and the invitation will expire. <a href="${escapeHtml(privacy)}">How we handle your information</a>, including how to have your waitlist details deleted.</p>
${f.html}
</body></html>`
  return { to, subject: "You're invited to the Splitpost pilot", text, html }
}
