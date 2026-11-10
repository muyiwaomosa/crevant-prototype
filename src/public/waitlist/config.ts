import { readAuthConfig } from '../../auth/config'

/**
 * The waitlist form's browser switch. The form appears only when ALL of these
 * are set for the build, so a half-configured build can never show it:
 *
 *   VITE_WAITLIST_FORM_ENABLED    exactly 'true' (OFF by default, including Preview)
 *   VITE_TURNSTILE_SITE_KEY       Cloudflare Turnstile site key (public)
 *   VITE_PRIVACY_NOTICE_URL       the APPROVED, published privacy notice
 *   VITE_PRIVACY_NOTICE_VERSION   its version, stored with every consent
 *   VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY (as for sign-in)
 *
 * The server keeps its own two switches (the function's environment and the
 * database setting), so turning this on alone stores nothing.
 */
export type WaitlistConfig = {
  endpoint: string
  publishableKey: string
  turnstileSiteKey: string
  noticeUrl: string
  noticeVersion: string
}

const NOTICE_VERSION = /^[a-z0-9._-]{1,40}$/

export function readWaitlistConfig(env: Record<string, unknown>): WaitlistConfig | null {
  const get = (k: string) => (typeof env[k] === 'string' ? (env[k] as string).trim() : '')
  if (get('VITE_WAITLIST_FORM_ENABLED') !== 'true') return null
  const auth = readAuthConfig(env)
  const turnstileSiteKey = get('VITE_TURNSTILE_SITE_KEY')
  const noticeUrl = get('VITE_PRIVACY_NOTICE_URL')
  const noticeVersion = get('VITE_PRIVACY_NOTICE_VERSION')
  if (!auth || !turnstileSiteKey || !NOTICE_VERSION.test(noticeVersion)) return null
  if (!/^(https:\/\/[^\s]+|\/[a-z0-9/_-]*)$/i.test(noticeUrl)) return null
  return {
    endpoint: `${auth.url}/functions/v1/join-waitlist`,
    publishableKey: auth.key,
    turnstileSiteKey,
    noticeUrl,
    noticeVersion,
  }
}

/** Where someone came from, from ?src= and ?c= in the link, if well formed. */
export function readAcquisition(search: string): { source: string | null; campaign: string | null } {
  const q = new URLSearchParams(search)
  const clean = (v: string | null, max: number) => {
    const s = (v ?? '').trim().toLowerCase()
    return new RegExp(`^[a-z0-9_-]{1,${max}}$`).test(s) ? s : null
  }
  return { source: clean(q.get('src'), 40), campaign: clean(q.get('c'), 60) }
}
