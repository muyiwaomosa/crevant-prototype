/**
 * Public Supabase configuration for the browser.
 *
 * Only the project URL and the PUBLISHABLE key may ever reach the browser.
 * This refuses anything that looks like a secret or service-role key, and
 * any URL that is not a Supabase project (or a local development stack).
 */

/** The one hosted project Phase 1A uses: crevant-staging. */
export const STAGING_SUPABASE_URL = 'https://kpudeppgokpjhvaqrprn.supabase.co'

export type AuthConfig = { url: string; key: string }

function base64UrlDecode(s: string): string {
  const pad = s.length % 4 === 0 ? '' : '='.repeat(4 - (s.length % 4))
  return atob(s.replace(/-/g, '+').replace(/_/g, '/') + pad)
}

/** True for keys that must never be in browser code. */
export function isPrivilegedKey(key: string): boolean {
  if (/^sb_secret_/i.test(key)) return true
  const parts = key.split('.')
  if (parts.length === 3) {
    try {
      const payload = JSON.parse(base64UrlDecode(parts[1]))
      if (payload && typeof payload === 'object' && payload.role !== 'anon') return true
    } catch {
      return true
    }
  }
  return false
}

export function isAllowedSupabaseUrl(raw: string): boolean {
  let u: URL
  try {
    u = new URL(raw)
  } catch {
    return false
  }
  if (u.username || u.password || u.search || u.hash || (u.pathname !== '/' && u.pathname !== '')) return false
  if (u.protocol === 'https:' && /^[a-z0-9]{20}\.supabase\.co$/.test(u.hostname)) return true
  // Local development stack only (never in a deployed build: see scripts/check-supabase-target.mjs).
  if (u.protocol === 'http:' && (u.hostname === '127.0.0.1' || u.hostname === 'localhost')) return true
  return false
}

/** Returns the configuration, or null when sign-in is not available on this build. */
export function readAuthConfig(env: Record<string, unknown>): AuthConfig | null {
  const url = typeof env.VITE_SUPABASE_URL === 'string' ? env.VITE_SUPABASE_URL.trim().replace(/\/$/, '') : ''
  const key = typeof env.VITE_SUPABASE_PUBLISHABLE_KEY === 'string' ? env.VITE_SUPABASE_PUBLISHABLE_KEY.trim() : ''
  if (!url || !key) return null
  if (isPrivilegedKey(key)) return null
  if (!isAllowedSupabaseUrl(url)) return null
  return { url, key }
}
