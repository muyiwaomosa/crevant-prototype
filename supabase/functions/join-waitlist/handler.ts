// The join-waitlist server function's logic, kept free of Deno APIs so it can
// be unit tested (handler.test.ts). index.ts wires it to Deno.serve.
//
// Order of checks for a submission:
//   1. Allowed origin, POST, JSON, at most 4 KB.
//   2. Function switch (WAITLIST_FUNCTION_ENABLED). Off: 'closed', nothing else.
//   3. Honeypot: a hidden field real people never fill. If filled, reply 'ok'
//      and store nothing, so bots learn nothing.
//   4. Cloudflare Turnstile, verified server side, including the hostname.
//   5. Basic shape checks, then the database function, which repeats every
//      check, applies the database switch, checks the privacy notice version
//      against the approved one, applies the rate limits, and stores.
//
// Marketing consent is never forwarded: it stays off until email addresses
// can be verified. Responses never include the email address, and nothing
// here logs it.

export type SubmitResult = 'ok' | 'closed' | 'invalid' | 'notice_changed' | 'rate_limited'

export interface SubmitPayload {
  p_email: string
  p_interests: string[]
  p_shares_content: string | null
  p_platform: string | null
  p_audience_band: string | null
  p_public_link: string | null
  p_source: string | null
  p_campaign: string | null
  p_age_confirmed: boolean
  p_waitlist_consent: boolean
  p_notice_version: string
  p_client_key: string
}

export interface TurnstileResult {
  success: boolean
  hostname?: string
}

export interface JoinDeps {
  /** WAITLIST_FUNCTION_ENABLED === 'true'. Off by default. */
  enabled: boolean
  /** Exact origins allowed to call the function, e.g. https://crevant.example. */
  allowedOrigins: string[]
  /** Hostnames Turnstile must report the challenge was solved on. */
  allowedHostnames: string[]
  verifyTurnstile(token: string, ip: string | null): Promise<TurnstileResult>
  /** Salted hash of the client address (or of a shared "unknown" bucket). */
  clientKey(ip: string | null): Promise<string>
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
    'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
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

/** Turns the browser's JSON into the database function's arguments. Throws on a wrong shape. */
export function toPayload(input: Record<string, unknown>, clientKey: string): SubmitPayload {
  const email = str(input.email, 254)
  if (!email) throw new Error('shape')
  const interests = input.interests ?? []
  if (!Array.isArray(interests) || interests.length > 6 || interests.some((i) => typeof i !== 'string' || i.length > 40)) {
    throw new Error('shape')
  }
  const noticeVersion = str(input.noticeVersion, 40)
  if (!noticeVersion) throw new Error('shape')
  return {
    p_email: email.toLowerCase(),
    p_interests: interests as string[],
    p_shares_content: str(input.sharesContent, 20),
    p_platform: str(input.platform, 20),
    p_audience_band: str(input.audienceBand, 20),
    p_public_link: str(input.publicLink, 200),
    p_source: str(input.source, 40),
    p_campaign: str(input.campaign, 60),
    p_age_confirmed: bool(input.ageConfirmed),
    p_waitlist_consent: bool(input.waitlistConsent),
    p_notice_version: noticeVersion,
    p_client_key: clientKey,
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
  if (!verified.success || !verified.hostname || !deps.allowedHostnames.includes(verified.hostname)) {
    return reply(400, 'verification_failed', origin)
  }

  let clientKey: string
  try {
    clientKey = await deps.clientKey(req.ip)
  } catch {
    return reply(500, 'error', origin)
  }
  let payload: SubmitPayload
  try {
    payload = toPayload(body, clientKey)
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

/**
 * A salted SHA-256 of the client address: the only form it is ever kept in.
 * Without an address everyone shares one "unknown" bucket, so a missing or
 * malformed header can't be used to skip the per-client limit.
 */
export async function hashClientKey(ip: string | null, salt: string): Promise<string> {
  if (!salt) throw new Error('WAITLIST_RATE_SALT is not set')
  const data = new TextEncoder().encode(`${salt}:${ip ?? 'unknown'}`)
  const digest = await crypto.subtle.digest('SHA-256', data)
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')
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
  const data = (await res.json()) as { success?: unknown; hostname?: unknown }
  return { success: data.success === true, hostname: typeof data.hostname === 'string' ? data.hostname : undefined }
}

/** Calls public.waitlist_submit through the Data API with the server key. */
export async function submitThroughDataApi(
  payload: SubmitPayload,
  supabaseUrl: string,
  serviceKey: string,
  fetchImpl: typeof fetch,
): Promise<SubmitResult> {
  const res = await fetchImpl(`${supabaseUrl}/rest/v1/rpc/waitlist_submit`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: serviceKey, Authorization: `Bearer ${serviceKey}` },
    body: JSON.stringify(payload),
  })
  if (!res.ok) throw new Error(`waitlist_submit failed with ${res.status}`)
  const out = await res.json()
  if (out === 'ok' || out === 'closed' || out === 'invalid' || out === 'notice_changed' || out === 'rate_limited') return out
  throw new Error('unexpected result')
}
