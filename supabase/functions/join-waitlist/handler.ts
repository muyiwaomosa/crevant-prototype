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
//      check, applies the database switch and the rate limits, and stores.
//
// Responses never include the email address, and nothing here logs it.

export type SubmitResult = 'ok' | 'closed' | 'invalid' | 'rate_limited'

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
  p_marketing_consent: boolean
  p_client_key: string | null
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
  clientKey(ip: string | null): Promise<string | null>
  submit(payload: SubmitPayload): Promise<SubmitResult>
}

export interface IncomingRequest {
  method: string
  origin: string | null
  contentType: string | null
  body: string
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
export function toPayload(input: Record<string, unknown>, clientKey: string | null): SubmitPayload {
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
    p_marketing_consent: bool(input.marketingConsent),
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
    verified = await deps.verifyTurnstile(token, req.ip)
  } catch {
    return reply(502, 'error', origin)
  }
  if (!verified.success || !verified.hostname || !deps.allowedHostnames.includes(verified.hostname)) {
    return reply(400, 'verification_failed', origin)
  }

  let payload: SubmitPayload
  try {
    payload = toPayload(body, await deps.clientKey(req.ip))
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
    default:
      return reply(400, 'invalid', origin)
  }
}

/** A salted SHA-256 of the client address: the only form it is ever kept in. */
export async function hashClientKey(ip: string | null, salt: string): Promise<string | null> {
  if (!ip || !salt) return null
  const data = new TextEncoder().encode(`${salt}:${ip}`)
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
  if (out === 'ok' || out === 'closed' || out === 'invalid' || out === 'rate_limited') return out
  throw new Error('unexpected result')
}
