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

/** Where someone came from, from ?src= in the link, if well formed. */
export function readAcquisition(search: string): { source: string | null } {
  const s = (new URLSearchParams(search).get('src') ?? '').trim().toLowerCase()
  return { source: /^[a-z0-9_-]{1,40}$/.test(s) ? s : null }
}
