// The waitlist-handoff function's request handling (BL-009), kept free of Deno
// and npm imports so it can be unit tested. index.ts wires in the database.
//
// Server to server only: the member project's waitlist-bridge function calls
// it with `Authorization: Bearer <WAITLIST_HANDOFF_KEY>`. A request with an
// Origin header (a browser) is refused, as is anything without the key.
// POST application/json, one action per request:
//   {"action":"export","limit":1..500}                 -> {"applicants":[...]}
//   {"action":"confirm","ids":[uuid,...]}              -> {"confirmed":n}
//   {"action":"recheck","ids":[uuid,...],"replacement":bool} -> {"eligible":[uuid,...]}
//   {"action":"record","id":uuid,"outcome":"invited"|"declined"} -> {"recorded":bool}
//   {"action":"withdrawals","since":iso|null}          -> {"withdrawals":[...]}
//   {"action":"forget","ids":[uuid,...]}               -> {"deleted":n}
//   {"action":"forget_email","email":"..."}            -> {"deleted":0|1}
// Every answer is shape-checked; nothing unexpected is passed on.

export interface HandoffDeps {
  /** The database login and a key of at least 32 characters are configured. */
  enabled: boolean
  key: string
  exportRows(limit: number): Promise<unknown>
  confirm(ids: string[]): Promise<unknown>
  recheck(ids: string[], replacement: boolean): Promise<unknown>
  record(id: string, outcome: 'invited' | 'declined'): Promise<unknown>
  withdrawals(since: string | null): Promise<unknown>
  forget(ids: string[]): Promise<unknown>
  forgetEmail(email: string): Promise<unknown>
}

export interface HandoffRequest {
  method: string
  origin: string | null
  authorization: string | null
  contentType: string | null
  body: string
}

export interface HandoffReply {
  status: number
  body: string
  logNote?: string
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
const MAX_BODY = 64 * 1024
const json = (status: number, data: unknown, logNote?: string): HandoffReply => ({ status, body: JSON.stringify(data), ...(logNote ? { logNote } : {}) })

/** Compares two strings in time that depends only on their lengths. */
export function sameKey(a: string, b: string): boolean {
  const x = new TextEncoder().encode(a)
  const y = new TextEncoder().encode(b)
  let diff = x.length ^ y.length
  for (let i = 0; i < Math.max(x.length, y.length); i++) diff |= (x[i] ?? 0) ^ (y[i] ?? 0)
  return diff === 0
}

export const keyUsable = (k: string) => k.length >= 32 && /^[\x21-\x7e]+$/.test(k)

const ids = (v: unknown): string[] | null =>
  Array.isArray(v) && v.length >= 1 && v.length <= 500 && v.every((x) => typeof x === 'string' && UUID.test(x)) ? (v as string[]) : null

const APPLICANT_KEYS = ['waitlist_id', 'email', 'joined_at', 'verified_at', 'consent_version', 'consented_at', 'groups', 'intent',
  'platform', 'audience_band', 'introduced_by_creator', 'source', 'creator_ref']

export function checkApplicants(raw: unknown): unknown[] {
  if (!Array.isArray(raw)) throw new Error('unexpected export')
  for (const r of raw) {
    if (!r || typeof r !== 'object') throw new Error('unexpected export')
    const o = r as Record<string, unknown>
    if (Object.keys(o).some((k) => !APPLICANT_KEYS.includes(k)) || typeof o.waitlist_id !== 'string' || !UUID.test(o.waitlist_id) || typeof o.email !== 'string') {
      throw new Error('unexpected export')
    }
  }
  return raw
}

export async function handleHandoff(req: HandoffRequest, deps: HandoffDeps): Promise<HandoffReply> {
  if (req.origin) return json(403, { status: 'forbidden' }, 'browser_origin')
  if (req.method !== 'POST') return json(405, { status: 'method_not_allowed' })
  if (!deps.enabled || !keyUsable(deps.key)) return json(503, { status: 'closed' })
  const given = /^Bearer (.+)$/.exec(req.authorization ?? '')?.[1] ?? ''
  if (!sameKey(given, deps.key)) return json(401, { status: 'unauthorized' }, 'bad_key')
  if (!(req.contentType ?? '').toLowerCase().startsWith('application/json')) return json(415, { status: 'invalid' })
  if (new TextEncoder().encode(req.body).length > MAX_BODY) return json(413, { status: 'invalid' })
  let body: Record<string, unknown>
  try {
    const parsed = JSON.parse(req.body)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return json(400, { status: 'invalid' })
    body = parsed as Record<string, unknown>
  } catch {
    return json(400, { status: 'invalid' })
  }
  try {
    switch (body.action) {
      case 'export': {
        const limit = body.limit
        if (typeof limit !== 'number' || !Number.isInteger(limit) || limit < 1 || limit > 500) return json(400, { status: 'invalid' })
        return json(200, { applicants: checkApplicants(await deps.exportRows(limit)) })
      }
      case 'confirm': {
        const list = ids(body.ids)
        if (!list) return json(400, { status: 'invalid' })
        const out = await deps.confirm(list)
        if (typeof out !== 'number') throw new Error('unexpected confirm')
        return json(200, { confirmed: out })
      }
      case 'recheck': {
        const list = ids(body.ids)
        if (!list || (body.replacement !== undefined && typeof body.replacement !== 'boolean')) return json(400, { status: 'invalid' })
        const out = await deps.recheck(list, body.replacement === true)
        if (!Array.isArray(out) || !out.every((x) => typeof x === 'string' && UUID.test(x))) throw new Error('unexpected recheck')
        return json(200, { eligible: out })
      }
      case 'record': {
        if (typeof body.id !== 'string' || !UUID.test(body.id) || (body.outcome !== 'invited' && body.outcome !== 'declined')) return json(400, { status: 'invalid' })
        const out = await deps.record(body.id, body.outcome)
        if (typeof out !== 'boolean') throw new Error('unexpected record')
        return json(200, { recorded: out })
      }
      case 'withdrawals': {
        const since = body.since === null || body.since === undefined ? null : typeof body.since === 'string' && !Number.isNaN(Date.parse(body.since)) ? body.since : undefined
        if (since === undefined) return json(400, { status: 'invalid' })
        const out = await deps.withdrawals(since)
        if (!Array.isArray(out) || !out.every((w) => w && typeof w === 'object' && UUID.test(String((w as Record<string, unknown>).waitlist_id))
          && Object.keys(w as object).every((k) => k === 'waitlist_id' || k === 'withdrawn_at'))) throw new Error('unexpected withdrawals')
        return json(200, { withdrawals: out })
      }
      case 'forget': {
        const list = ids(body.ids)
        if (!list) return json(400, { status: 'invalid' })
        const out = await deps.forget(list)
        if (typeof out !== 'number') throw new Error('unexpected forget')
        return json(200, { deleted: out })
      }
      case 'forget_email': {
        const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : ''
        if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) || email.length > 254) return json(400, { status: 'invalid' })
        const out = await deps.forgetEmail(email)
        if (out !== 0 && out !== 1) throw new Error('unexpected forget_email')
        return json(200, { deleted: out })
      }
      default:
        return json(400, { status: 'invalid' })
    }
  } catch {
    return json(500, { status: 'error' }, 'database_error')
  }
}
