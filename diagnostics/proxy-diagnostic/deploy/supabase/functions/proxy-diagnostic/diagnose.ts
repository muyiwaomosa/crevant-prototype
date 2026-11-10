// A3 proxy diagnostic: the logic, kept free of Deno APIs so it can be unit
// tested (diagnostics/proxy-diagnostic/diagnose.test.ts). TEMPORARY: never
// merged into main, deleted after the hosted test (README.md).
//
// It answers one question: which X-Forwarded-For position, counted from the
// right, holds the visitor's real address when a request reaches a Supabase
// function on the STAGING project. It never returns, logs or stores an
// address. For each position it says only what kind of entry it is and
// whether it equals the address the tester says they have, which the tester
// sends themselves (X-Diag-Your-Address).
//
// It has no database connection, reads no secret but its own settings, makes
// no outgoing request and imports nothing.

export const STAGING_SUPABASE_URL = 'https://kpudeppgokpjhvaqrprn.supabase.co'
/** The longest window between activation and expiry. */
export const MAX_WINDOW_MS = 24 * 60 * 60 * 1000
/** How many positions, from the right, are described. */
export const MAX_POSITIONS = 8
/** Longer forwarding headers are not parsed at all. */
export const MAX_HEADER_LENGTH = 4096

const EMPTY_SHA256 = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'
const UTC_SECONDS = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/
/** base64url, at least 43 characters: 32 random bytes or more. */
const TOKEN_FORMAT = /^[A-Za-z0-9_-]{43,128}$/

export interface DiagConfig {
  tokenSha256: Uint8Array
  activatedAt: number
  expiresAt: number
}

/** The only settings the diagnostic reads. */
export const SETTINGS = ['DIAG_ENABLED', 'DIAG_TOKEN_SHA256', 'DIAG_ACTIVATED_AT', 'DIAG_EXPIRES_AT', 'SUPABASE_URL'] as const
export type Setting = (typeof SETTINGS)[number]

function hexBytes(hex: string): Uint8Array {
  const out = new Uint8Array(hex.length / 2)
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16)
  return out
}

/**
 * The configuration, or null whenever anything is missing, malformed,
 * outside its time window, or on any project but staging. Off by default:
 * DIAG_ENABLED must be exactly "true".
 */
export function readConfig(get: (k: Setting) => string, now: number): DiagConfig | null {
  if (get('DIAG_ENABLED') !== 'true') return null
  if (get('SUPABASE_URL') !== STAGING_SUPABASE_URL) return null
  const hash = get('DIAG_TOKEN_SHA256')
  if (!/^[0-9a-f]{64}$/.test(hash) || hash === EMPTY_SHA256) return null
  const a = get('DIAG_ACTIVATED_AT')
  const e = get('DIAG_EXPIRES_AT')
  if (!UTC_SECONDS.test(a) || !UTC_SECONDS.test(e)) return null
  const activatedAt = Date.parse(a)
  const expiresAt = Date.parse(e)
  if (!Number.isFinite(activatedAt) || !Number.isFinite(expiresAt)) return null
  if (new Date(activatedAt).toISOString().slice(0, 19) + 'Z' !== a || new Date(expiresAt).toISOString().slice(0, 19) + 'Z' !== e) return null
  if (expiresAt <= activatedAt || expiresAt - activatedAt > MAX_WINDOW_MS) return null
  if (now < activatedAt || now >= expiresAt) return null
  return { tokenSha256: hexBytes(hash), activatedAt, expiresAt }
}

/** Compares two byte arrays in time that depends only on their length. */
export function constantTimeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i]
  return diff === 0
}

async function sha256(text: string): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)))
}

/**
 * True only with the right diagnostic token (X-Diag-Token, compared as a
 * SHA-256 digest in constant time) and a Supabase key header present, which
 * means the request came through Supabase's own key check. The same work is
 * done whatever is wrong, so timing doesn't say what failed.
 */
export async function authorised(headers: Headers, config: DiagConfig): Promise<boolean> {
  const token = headers.get('x-diag-token') ?? ''
  const wellFormed = TOKEN_FORMAT.test(token)
  const digest = await sha256(wellFormed ? token : 'x'.repeat(43))
  const matches = constantTimeEqual(digest, config.tokenSha256)
  const auth = headers.get('authorization') ?? ''
  const viaSupabaseKey = /^Bearer \S{20,}$/.test(auth) || (headers.get('apikey') ?? '').length >= 20
  return wellFormed && matches && viaSupabaseKey
}

// ---------------------------------------------------------------------------
// Describing addresses without revealing them.

const IPV4 = /^(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}$/

/** The eight groups of an IPv6 address, as numbers, or null. */
function ipv6Groups(ip: string): number[] | null {
  if (!/^[0-9a-f:]{2,39}$/i.test(ip) || (ip.match(/::/g) ?? []).length > 1) return null
  const [head, tail] = ip.includes('::') ? ip.split('::') : [ip, null]
  const left = head ? head.split(':') : []
  const right = tail ? tail.split(':') : []
  const missing = 8 - left.length - right.length
  if (tail === null ? missing !== 0 : missing < 1) return null
  const groups = [...left, ...Array(tail === null ? 0 : missing).fill('0'), ...right]
  if (groups.some((g) => !/^[0-9a-f]{1,4}$/i.test(g))) return null
  return groups.map((g) => parseInt(g, 16))
}

type Kind = 'ipv4' | 'ipv6' | 'malformed' | 'empty'
type Scope = 'public' | 'internal' | 'documentation' | null

interface Parsed {
  kind: Kind
  scope: Scope
  /** Canonical form, for comparison only. Never returned. */
  canonical: string | null
  /** The /64 network, for comparison only. Never returned. */
  net64: string | null
}

function parse(raw: string): Parsed {
  const s = raw.trim()
  if (!s) return { kind: 'empty', scope: null, canonical: null, net64: null }
  if (IPV4.test(s)) {
    const [a, b, c] = s.split('.').map(Number)
    const documentation = (a === 192 && b === 0 && c === 2) || (a === 198 && b === 51 && c === 100) || (a === 203 && b === 0 && c === 113)
    const internal =
      a === 0 || a === 10 || a === 127 || (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 198 && (b === 18 || b === 19)) || a >= 224
    return { kind: 'ipv4', scope: documentation ? 'documentation' : internal ? 'internal' : 'public', canonical: s, net64: null }
  }
  const g = ipv6Groups(s.toLowerCase())
  if (g) {
    const documentation = g[0] === 0x2001 && g[1] === 0x0db8
    const internal = g.slice(0, 7).every((x) => x === 0) || (g[0] & 0xfe00) === 0xfc00 || (g[0] & 0xffc0) === 0xfe80 || (g[0] & 0xff00) === 0xff00
    const hex = g.map((x) => x.toString(16))
    return { kind: 'ipv6', scope: documentation ? 'documentation' : internal ? 'internal' : 'public', canonical: hex.join(':'), net64: hex.slice(0, 4).join(':') }
  }
  return { kind: 'malformed', scope: null, canonical: null, net64: null }
}

export interface PositionReport {
  from_right: number
  kind: Kind
  scope: Scope
  matches_your_address: boolean | null
  same_ipv6_64_as_yours: boolean | null
}

export interface Report {
  forwarded_for: {
    present: boolean
    too_long: boolean
    entries: number
    positions: PositionReport[]
    more_positions: number
  }
  other_headers: Record<'x-real-ip' | 'cf-connecting-ip' | 'true-client-ip', { present: boolean; kind: Kind | null; scope: Scope; matches_your_address: boolean | null }> & {
    forwarded: { present: boolean }
  }
  your_address: { given: boolean; kind: Kind | null }
  /** The smallest hop count whose entry is your address, with only platform entries to its right. A hint, not a decision. */
  suggested_trusted_hops: number | null
  expires_in_minutes: number
}

function compare(entry: Parsed, mine: Parsed | null) {
  if (!mine || mine.canonical === null || entry.canonical === null) return { matches: null, same64: null }
  return {
    matches: entry.kind === mine.kind && entry.canonical === mine.canonical,
    same64: entry.kind === 'ipv6' && mine.kind === 'ipv6' ? entry.net64 === mine.net64 : null,
  }
}

/** What arrived, as kinds and yes/no answers only. */
export function describe(headers: Headers, config: DiagConfig, now: number): Report {
  const mineRaw = headers.get('x-diag-your-address')
  const mine = mineRaw === null ? null : parse(mineRaw)
  const xff = headers.get('x-forwarded-for')
  const tooLong = xff !== null && xff.length > MAX_HEADER_LENGTH
  const entries = xff === null || tooLong ? [] : xff.split(',').map(parse)
  const positions: PositionReport[] = []
  for (let k = 1; k <= Math.min(MAX_POSITIONS, entries.length); k++) {
    const e = entries[entries.length - k]
    const c = compare(e, mine)
    positions.push({ from_right: k, kind: e.kind, scope: e.scope, matches_your_address: c.matches, same_ipv6_64_as_yours: c.same64 })
  }
  let suggested: number | null = null
  for (const p of positions) {
    if (p.from_right > 5) break
    if (p.matches_your_address === true) {
      suggested = p.from_right
      break
    }
    // An entry the visitor could have written, to the right of the match,
    // would mean the count is not safe: no suggestion.
    if (p.scope === 'documentation' || p.kind === 'malformed' || p.kind === 'empty') break
  }
  const other = (name: 'x-real-ip' | 'cf-connecting-ip' | 'true-client-ip') => {
    const v = headers.get(name)
    if (v === null) return { present: false, kind: null, scope: null, matches_your_address: null }
    const p = parse(v.length > 64 ? '' : v)
    return { present: true, kind: p.kind, scope: p.scope, matches_your_address: compare(p, mine).matches }
  }
  return {
    forwarded_for: {
      present: xff !== null,
      too_long: tooLong,
      entries: entries.length,
      positions,
      more_positions: Math.max(0, entries.length - MAX_POSITIONS),
    },
    other_headers: {
      'x-real-ip': other('x-real-ip'),
      'cf-connecting-ip': other('cf-connecting-ip'),
      'true-client-ip': other('true-client-ip'),
      forwarded: { present: headers.get('forwarded') !== null },
    },
    your_address: { given: mine !== null, kind: mine ? mine.kind : null },
    suggested_trusted_hops: suggested,
    expires_in_minutes: Math.max(0, Math.floor((config.expiresAt - now) / 60000)),
  }
}
