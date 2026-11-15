import { APPROVED_NOTICE, type ApprovedNotice } from '../privacy/notice'

/**
 * The waitlist form's browser switch. The form appears only when ALL of these
 * are set for the build, so a half-configured build can never show it:
 *
 *   VITE_WAITLIST_FORM_ENABLED    exactly 'true' (OFF by default, including Preview)
 *   VITE_WAITLIST_ENDPOINT        the join-waitlist server function's address
 *   VITE_TURNSTILE_SITE_KEY       Cloudflare Turnstile site key (public)
 *   VITE_PRIVACY_NOTICE_URL       exactly '/privacy', where the approved notice is published
 *   VITE_PRIVACY_NOTICE_VERSION   its version, stored with every consent
 *
 * and there must be an APPROVED privacy notice (src/public/privacy/notice.ts)
 * whose version is exactly VITE_PRIVACY_NOTICE_VERSION. Until a notice is
 * approved, the form cannot turn on, whatever the settings say.
 *
 * No Supabase key is needed or used: the form posts JSON straight to the
 * server function, which checks the origin, Turnstile and its own switches.
 * That keeps the public site build free of any Supabase key. The server keeps
 * its own two switches (the function's environment and the database
 * setting), so turning this on alone stores nothing.
 */
export type WaitlistConfig = {
  endpoint: string
  turnstileSiteKey: string
  noticeUrl: string
  noticeVersion: string
}

const NOTICE_VERSION = /^[a-z0-9._-]{1,40}$/

/**
 * The only addresses the form may post to: a Supabase project's join-waitlist
 * function over https, or a local development stack.
 */
export const WAITLIST_ENDPOINT = /^(https:\/\/[a-z0-9]{20}\.supabase\.co|http:\/\/(127\.0\.0\.1|localhost):\d{2,5})\/functions\/v1\/join-waitlist$/

export function readWaitlistConfig(env: Record<string, unknown>, notice: ApprovedNotice | null = APPROVED_NOTICE): WaitlistConfig | null {
  const get = (k: string) => (typeof env[k] === 'string' ? (env[k] as string).trim() : '')
  if (get('VITE_WAITLIST_FORM_ENABLED') !== 'true') return null
  const endpoint = get('VITE_WAITLIST_ENDPOINT')
  const turnstileSiteKey = get('VITE_TURNSTILE_SITE_KEY')
  const noticeUrl = get('VITE_PRIVACY_NOTICE_URL')
  const noticeVersion = get('VITE_PRIVACY_NOTICE_VERSION')
  if (!WAITLIST_ENDPOINT.test(endpoint) || !turnstileSiteKey || !NOTICE_VERSION.test(noticeVersion)) return null
  if (noticeUrl !== '/privacy') return null
  // No approved notice, or a different version: no form.
  if (!notice || notice.version !== noticeVersion) return null
  return { endpoint, turnstileSiteKey, noticeUrl, noticeVersion }
}

/**
 * Where someone came from, from the link:
 *   ?src=  the acquisition channel label (for example ig_bio)
 *   ?ref=  a creator invitation code, kept separate from the channel. It is
 *          only a claim until the server resolves it against an accepted
 *          creator's active link; an unknown code is simply ignored there.
 */
export function readAcquisition(search: string): { source: string | null; creatorRef: string | null } {
  const params = new URLSearchParams(search)
  const s = (params.get('src') ?? '').trim().toLowerCase()
  const r = (params.get('ref') ?? '').trim().toLowerCase()
  return {
    source: /^[a-z0-9_-]{1,40}$/.test(s) ? s : null,
    creatorRef: /^[0-9a-f]{20}$/.test(r) ? r : null,
  }
}

/**
 * A creator's name or handle as someone typed it: 1 to 60 letters, numbers,
 * spaces and @ . _ ' - only, with no links, email addresses or phone numbers.
 * Mirrors the database rule (ops.waitlist introducer_reported), which is the
 * one that counts.
 */
export function introducerProblem(value: string): string | null {
  const v = value.trim()
  if (!v) return null
  if (v.length > 60) return 'Please keep it to 60 characters.'
  if (/https?|www\.|\.(com|net|org|io|co|app|me|tv|gg|ly)\b/i.test(v)) return 'Just their name or handle, please, not a link.'
  if (/[^@\s]+@[^@\s]+\.[^@\s]+/.test(v)) return 'Just their name or handle, please, not an email address.'
  if (/[0-9]{7,}/.test(v)) return 'Just their name or handle, please, not a phone number.'
  if (!/^[\p{L}\p{N}@._'’ -]+$/u.test(v)) return 'Please use only letters, numbers, spaces and @ . _ \' -'
  return null
}
