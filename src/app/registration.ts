/**
 * First-touch registration link (foundation v2, 20261130000000).
 *
 * The first valid-looking registration code a browser opens is kept for seven
 * days and is not replaced by later links, so attribution goes to the first
 * person whose link brought someone here. The code is sent with sign-up (the
 * database checks it again then and when membership is claimed). Storage can
 * be unavailable (private windows, blocked site data): every access is
 * guarded and the app works without it.
 */
const KEY = 'splitpost.registration'
const TTL_MS = 7 * 24 * 60 * 60 * 1000
export const REGISTRATION_CODE = /^[0-9a-f]{16}$/

type Stored = { code: string; at: number }

function read(): Stored | null {
  try {
    const raw = window.localStorage.getItem(KEY)
    if (!raw) return null
    const v = JSON.parse(raw) as Partial<Stored>
    if (typeof v.code !== 'string' || !REGISTRATION_CODE.test(v.code) || typeof v.at !== 'number') return null
    if (Date.now() - v.at > TTL_MS) return null
    return { code: v.code, at: v.at }
  } catch {
    return null
  }
}

/** Remembers a code unless an unexpired earlier one exists. Returns the code that counts. */
export function rememberRegistrationCode(code: string): string | null {
  const c = code.trim().toLowerCase()
  const existing = read()
  if (existing) return existing.code
  if (!REGISTRATION_CODE.test(c)) return null
  try {
    window.localStorage.setItem(KEY, JSON.stringify({ code: c, at: Date.now() }))
  } catch {
    // Not stored: the code from the current link is still used for this sign-up.
  }
  return c
}

export function storedRegistrationCode(): string | null {
  return read()?.code ?? null
}

export function forgetRegistrationCode(): void {
  try {
    window.localStorage.removeItem(KEY)
  } catch {
    // Nothing to do.
  }
}
