// The join-waitlist server function's logic, kept free of Deno APIs so it can
// be unit tested (handler.test.ts). index.ts wires it to Deno.serve and the
// database.
//
// Order of checks for a submission:
//   1. Allowed origin, POST, JSON, at most 4 KB.
//   2. Function switch (WAITLIST_FUNCTION_ENABLED). Off: 'closed', nothing else.
//   3. Honeypot: a hidden field real people never fill. If filled, reply 'ok'
//      and store nothing, so bots learn nothing.
//   4. Cloudflare Turnstile, verified server side: success, an allowed
//      hostname and the expected action ('join').
//   5. Basic shape checks, then waitlist_api.submit as the restricted
//      waitlist_writer login, which repeats every check, applies the database
//      switch, the approved notice version and the rate limits, and stores
//      new addresses only.
//
// Responses never include the email address, and nothing here logs it.

export type SubmitResult = 'ok' | 'closed' | 'invalid' | 'notice_changed' | 'rate_limited'

/** The Turnstile action the form renders with and the server requires. */
export const TURNSTILE_ACTION = 'join'

export interface SubmitPayload {
  email: string
  interests: string[]
  sharesContent: string | null
  platform: string | null
  audienceBand: string | null
  source: string | null
  ageConfirmed: boolean
  waitlistConsent: boolean
  noticeVersion: string
  /** HMAC of the normalised email with the secret salt. */
  emailKey: string
  /** HMAC of the client address (or a shared bucket) with the secret salt. */
  clientKey: string
}

export interface TurnstileResult {
  success: boolean
  hostname?: string
  action?: string
}

export interface RateKeys {
  emailKey: string
  clientKey: string
}

export interface JoinDeps {
  /** WAITLIST_FUNCTION_ENABLED === 'true' and every secret present. Off by default. */
  enabled: boolean
  /** Exact origins allowed to call the function, e.g. https://crevant.example. */
  allowedOrigins: string[]
  /** Hostnames Turnstile must report the challenge was solved on. */
  allowedHostnames: string[]
  verifyTurnstile(token: string, ip: string | null): Promise<TurnstileResult>
  rateKeys(email: string, ip: string | null): Promise<RateKeys>
  submit(payload: SubmitPayload): Promise<SubmitResult>
}

export interface IncomingRequest {
  method: string
  origin: string | null
  contentType: string | null
  body: string
  /** The client address from the trusted proxy hop (clientIpFrom), or null. */
  ip: string | null
}

export interface Outgoing {
  status: number
  headers: Record<string, string>
  body: string
}

const MAX_BODY_BYTES = 4096

function corsHeaders(origin: string): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    // The form sends JSON only. No keys or tokens are needed or accepted.
    'Access-Control-Allow-Headers': 'content-type',
    'Access-Control-Max-Age': '600',
    Vary: 'Origin',
  }
}

function reply(status: number, state: string, origin: string | null): Outgoing {
  return {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...(origin ? corsHeaders(origin) : {}) },
    body: JSON.stringify({ status: state }),
  }
}

const str = (v: unknown, max: number): string | null => {
  if (v === undefined || v === null || v === '') return null
  if (typeof v !== 'string' || v.length > max) throw new Error('shape')
  return v.trim() || null
}
const bool = (v: unknown): boolean => {
  if (v === undefined || v === null) return false
  if (typeof v !== 'boolean') throw new Error('shape')
  return v
}

/** Normalises an email the same way the database does. */
export const normaliseEmail = (email: string) => email.trim().toLowerCase()

/**
 * Turns the browser's JSON into the submission. Throws on a wrong shape.
 * Only the expected fields are read; anything else (a link, a campaign,
 * marketing consent) is ignored and never stored.
 */
export function toPayload(input: Record<string, unknown>, keys: RateKeys): SubmitPayload {
  const email = str(input.email, 254)
  if (!email) throw new Error('shape')
  const interests = input.interests ?? []
  if (!Array.isArray(interests) || interests.length > 6 || interests.some((i) => typeof i !== 'string' || i.length > 40)) {
    throw new Error('shape')
  }
  const noticeVersion = str(input.noticeVersion, 40)
  if (!noticeVersion) throw new Error('shape')
  return {
    email: normaliseEmail(email),
    interests: interests as string[],
    sharesContent: str(input.sharesContent, 20),
    platform: str(input.platform, 20),
    audienceBand: str(input.audienceBand, 20),
    source: str(input.source, 40),
    ageConfirmed: bool(input.ageConfirmed),
    waitlistConsent: bool(input.waitlistConsent),
    noticeVersion,
    emailKey: keys.emailKey,
    clientKey: keys.clientKey,
  }
}

export async function handleJoin(req: IncomingRequest, deps: JoinDeps): Promise<Outgoing> {
  const origin = req.origin && deps.allowedOrigins.includes(req.origin) ? req.origin : null

  if (req.method === 'OPTIONS') {
    return origin ? { status: 204, headers: corsHeaders(origin), body: '' } : reply(403, 'forbidden', null)
  }
  if (req.method !== 'POST') return reply(405, 'method_not_allowed', origin)
  if (!origin) return reply(403, 'forbidden', null)
  if (!deps.enabled) return reply(503, 'closed', origin)
  if (!(req.contentType ?? '').toLowerCase().startsWith('application/json')) return reply(415, 'invalid', origin)
  if (new TextEncoder().encode(req.body).length > MAX_BODY_BYTES) return reply(413, 'invalid', origin)

  let input: unknown
  try {
    input = JSON.parse(req.body)
  } catch {
    return reply(400, 'invalid', origin)
  }
  if (!input || typeof input !== 'object' || Array.isArray(input)) return reply(400, 'invalid', origin)
  const body = input as Record<string, unknown>

  // Honeypot: looks like success, stores nothing, costs no Turnstile call.
  if (typeof body.website === 'string' && body.website.trim() !== '') return reply(200, 'ok', origin)

  const token = typeof body.turnstileToken === 'string' ? body.turnstileToken : ''
  if (!token || token.length > 2048) return reply(400, 'verification_failed', origin)
  let verified: TurnstileResult
  try {
    // Cloudflare's optional remoteip takes a full address, not a /64 network.
    verified = await deps.verifyTurnstile(token, req.ip && !req.ip.includes('/') ? req.ip : null)
  } catch {
    return reply(502, 'error', origin)
  }
  if (
    !verified.success ||
    !verified.hostname ||
    !deps.allowedHostnames.includes(verified.hostname) ||
    verified.action !== TURNSTILE_ACTION
  ) {
    return reply(400, 'verification_failed', origin)
  }

  const email = typeof body.email === 'string' ? normaliseEmail(body.email) : ''
  let keys: RateKeys
  try {
    keys = await deps.rateKeys(email, req.ip)
  } catch {
    return reply(500, 'error', origin)
  }
  let payload: SubmitPayload
  try {
    payload = toPayload(body, keys)
  } catch {
    return reply(400, 'invalid', origin)
  }

  let result: SubmitResult
  try {
    result = await deps.submit(payload)
  } catch {
    return reply(500, 'error', origin)
  }
  switch (result) {
    case 'ok':
      return reply(200, 'ok', origin)
    case 'closed':
      return reply(503, 'closed', origin)
    case 'rate_limited':
      return reply(429, 'rate_limited', origin)
    case 'notice_changed':
      return reply(409, 'notice_changed', origin)
    default:
      return reply(400, 'invalid', origin)
  }
}

const IPV4 = /^(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}$/

/** The first four groups (the /64 network) of an IPv6 address, or null. */
function ipv6Network(ip: string): string | null {
  if (!/^[0-9a-f:]{2,39}$/i.test(ip) || (ip.match(/::/g) ?? []).length > 1) return null
  const [head, tail] = ip.includes('::') ? ip.split('::') : [ip, null]
  const left = head ? head.split(':') : []
  const right = tail ? tail.split(':') : []
  const missing = 8 - left.length - right.length
  if (tail === null ? missing !== 0 : missing < 1) return null
  const groups = [...left, ...Array(tail === null ? 0 : missing).fill('0'), ...right]
  if (groups.some((g) => !/^[0-9a-f]{1,4}$/i.test(g))) return null
  return groups
    .slice(0, 4)
    .map((g) => parseInt(g, 16).toString(16))
    .join(':')
}

/**
 * The client address, read only from X-Forwarded-For at the hop our own
 * proxies added (`trustedHops` from the right; 1 = the rightmost entry).
 * Entries further left can be written by the client, and so can headers
 * such as CF-Connecting-IP here, so they are ignored. IPv6 addresses are
 * reduced to their /64 network, since one connection can rotate through a
 * whole /64. Anything malformed gives null, which shares one bucket.
 */
export function clientIpFrom(forwardedFor: string | null, trustedHops = 1): string | null {
  if (!forwardedFor || !Number.isInteger(trustedHops) || trustedHops < 1 || trustedHops > 5) return null
  const hops = forwardedFor.split(',').map((h) => h.trim())
  const ip = hops[hops.length - trustedHops]
  if (!ip) return null
  if (IPV4.test(ip)) return ip
  const v6 = ipv6Network(ip.toLowerCase())
  return v6 ? `${v6}::/64` : null
}

async function hmacHex(salt: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(salt), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const mac = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(message))
  return [...new Uint8Array(mac)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

/**
 * Salted rate limit keys: HMAC-SHA256 with the secret salt, separately for
 * the email and the client address, so neither can be reversed or matched
 * without the salt. Without an address everyone shares one "unknown" bucket,
 * so a missing or malformed header can't be used to skip the per-client limit.
 */
export async function rateKeysFor(email: string, ip: string | null, salt: string): Promise<RateKeys> {
  if (salt.length < 32) throw new Error('WAITLIST_RATE_SALT is missing or too short')
  return {
    emailKey: await hmacHex(salt, `email:${normaliseEmail(email)}`),
    clientKey: await hmacHex(salt, `client:${ip ?? 'unknown'}`),
  }
}

/** Cloudflare Turnstile server-side verification. */
export async function verifyWithCloudflare(
  token: string,
  ip: string | null,
  secret: string,
  fetchImpl: typeof fetch,
): Promise<TurnstileResult> {
  if (!secret) return { success: false }
  const form = new URLSearchParams({ secret, response: token })
  if (ip) form.set('remoteip', ip)
  const res = await fetchImpl('https://challenges.cloudflare.com/turnstile/v0/siteverify', { method: 'POST', body: form })
  if (!res.ok) return { success: false }
  const data = (await res.json()) as { success?: unknown; hostname?: unknown; action?: unknown }
  return {
    success: data.success === true,
    hostname: typeof data.hostname === 'string' ? data.hostname : undefined,
    action: typeof data.action === 'string' ? data.action : undefined,
  }
}
