/**
 * Where to send someone after signing in. Only paths on this site are
 * allowed, so a crafted link can never redirect to another website.
 */
export const DEFAULT_AFTER_SIGN_IN = '/app'

export function safeNext(raw: string | null | undefined, fallback = DEFAULT_AFTER_SIGN_IN): string {
  if (!raw || raw.length > 512) return fallback
  if (!raw.startsWith('/') || raw.startsWith('//') || raw.startsWith('/\\')) return fallback
  if (/[\u0000-\u001F\u007F\\]/.test(raw)) return fallback
  let u: URL
  try {
    u = new URL(raw, 'https://same-origin.invalid')
  } catch {
    return fallback
  }
  if (u.origin !== 'https://same-origin.invalid') return fallback
  // Never send people back into the sign-in or email-link pages. The
  // password page is allowed: it is itself for signed-in members only.
  if (u.pathname === '/sign-in' || u.pathname === '/forgot-password') return fallback
  if (u.pathname.startsWith('/auth/') && u.pathname !== '/auth/set-password') return fallback
  return u.pathname + u.search + u.hash
}
