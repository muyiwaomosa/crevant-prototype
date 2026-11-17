// Temporary staging diagnostic for hosted staging check 3 (the proxy hop
// count). Design and threat model: docs/PROXY-DIAGNOSTIC-THREAT-MODEL.md.
// This branch is never merged; the function is deleted in the same session
// as the test. It shares no code with join-waitlist, has no database
// connection, reads no other secret, and never returns, logs or stores an
// address, another header or the request body.

/** The documentation address (RFC 5737) the tester forges on the left. */
export const TEST_VALUE = '198.51.100.7'
export const MAX_WINDOW_MS = 24 * 60 * 60 * 1000
const MIN_TOKEN_LENGTH = 32
const MAX_HEADER_LENGTH = 4096
const MAX_ENTRIES = 20

export interface DiagSettings {
  enabled: string
  token: string
  expiresAt: string
  now: number
}

export interface DiagRequest {
  token: string | null
  forwardedFor: string | null
}

export interface DiagReply {
  status: number
  body: string
}

export type EntryKind = 'test_value' | 'ipv4_public' | 'ipv4_private' | 'ipv6_public' | 'ipv6_private' | 'other'

export interface Position {
  fromRight: number
  kind: EntryKind
  fingerprint: string
}

const NOT_FOUND: DiagReply = { status: 404, body: '' }

/** Off unless the switch is exactly 'true', the token is long enough, and the expiry is in the future and under 24 hours away. */
export function isOpen(s: DiagSettings): boolean {
  if (s.enabled !== 'true' || s.token.length < MIN_TOKEN_LENGTH) return false
  if (!/^\d{4}-\d\d-\d\dT\d\d:\d\d(:\d\d)?(\.\d+)?Z$/.test(s.expiresAt)) return false
  const expires = Date.parse(s.expiresAt)
  return Number.isFinite(expires) && expires > s.now && expires - s.now < MAX_WINDOW_MS
}

async function sha256(text: string): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)))
}

/** Constant time: both sides are hashed to the same length first. */
export async function tokenMatches(given: string | null, expected: string): Promise<boolean> {
  const [a, b] = await Promise.all([sha256(given ?? ''), sha256(expected)])
  let diff = given === null ? 1 : 0
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i]
  return diff === 0
}

const IPV4 = /^(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}$/

function privateIpv4(ip: string): boolean {
  const [a, b] = ip.split('.').map(Number)
  return a === 0 || a === 10 || a === 127 || (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || a >= 224
}

function looksIpv6(ip: string): boolean {
  return /^[0-9a-f:.]{2,45}$/i.test(ip) && ip.includes(':') && (ip.match(/::/g) ?? []).length <= 1
}

function privateIpv6(ip: string): boolean {
  const v = ip.toLowerCase()
  return v === '::' || v === '::1' || /^f[cd]/.test(v) || /^fe[89ab]/.test(v) || v.startsWith('::ffff:')
}

export function classify(entry: string): EntryKind {
  if (entry === TEST_VALUE) return 'test_value'
  if (IPV4.test(entry)) return privateIpv4(entry) ? 'ipv4_private' : 'ipv4_public'
  if (looksIpv6(entry)) return privateIpv6(entry) ? 'ipv6_private' : 'ipv6_public'
  return 'other'
}

/** 8 hex characters of an HMAC keyed by this test session's token: the same for the same entry, irreversible without the token. */
export async function fingerprint(entry: string, sessionKey: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(sessionKey), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const mac = new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode('xff:' + entry)))
  return [...mac.slice(0, 4)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

export async function diagnose(req: DiagRequest, s: DiagSettings): Promise<DiagReply> {
  if (!isOpen(s)) return NOT_FOUND
  if (!(await tokenMatches(req.token, s.token))) return NOT_FOUND
  const header = req.forwardedFor ?? ''
  const tooLong = header.length > MAX_HEADER_LENGTH
  const entries = tooLong || header === '' ? [] : header.split(',').map((e) => e.trim())
  const positions: Position[] = []
  for (let i = 0; i < Math.min(entries.length, MAX_ENTRIES); i++) {
    const entry = entries[entries.length - 1 - i]
    positions.push({ fromRight: i + 1, kind: classify(entry), fingerprint: await fingerprint(entry, s.token) })
  }
  const testAt = positions.find((p) => p.kind === 'test_value')?.fromRight ?? null
  return {
    status: 200,
    body: JSON.stringify({ entries: tooLong ? null : entries.length, headerTooLong: tooLong, testValueFromRight: testAt, positions }),
  }
}
