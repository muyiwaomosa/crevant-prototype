// The avatar Edge Function's actions (Build 5.2b), with every outside call
// injected (database calls as the caller, database calls as the service
// role, Storage), so the safeguards can be tested.
//
// Authorization: EVERY action first asks the database, as the caller (with
// the caller's own token), whether they may do it. The database derives who
// they are from that token; this code never accepts a member id or a storage
// path from the browser. The service role is used only afterwards, for
// Storage and for the two service-only database steps, and only with paths
// the database handed out.
import { checkHeader, ImageRejected, MAX_INPUT_BYTES, reencode } from './image.ts'

export type RpcResult = { ok: true; data: unknown } | { ok: false; status: number; code: string }

export interface Deps {
  /** A database function called AS THE CALLER (their token). */
  userRpc(token: string, fn: string, body: Record<string, unknown>): Promise<RpcResult>
  /** A service-only database function (svc_*). */
  serviceRpc(fn: string, body: Record<string, unknown>): Promise<RpcResult>
  upload(path: string, bytes: Uint8Array): Promise<boolean>
  remove(paths: string[]): Promise<boolean>
  /** Signs links for paths; returns path -> link relative to /storage/v1, or null on failure. */
  sign(paths: string[], seconds: number): Promise<Record<string, string> | null>
  /** Structured log line. Never pass ids, paths, tokens or image data. */
  log(event: string, detail?: Record<string, string | number | boolean>): void
}

const LINK_SECONDS = 3600
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
// Database codes a caller may see. Anything else becomes "unknown".
const KNOWN = new Set([
  'not_signed_in', 'no_pilot_access', 'profile_incomplete', 'rate_limited', 'not_moderator', 'not_found', 'not_open',
  'plan_expired', 'confirmation_mismatch', 'too_many', 'upload_expired',
])

const json = (status: number, body: Record<string, unknown>) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } })
const refuse = (r: { status: number; code: string }) => {
  const code = KNOWN.has(r.code) ? r.code : 'unknown'
  const status = code === 'not_signed_in' ? 401 : code === 'no_pilot_access' || code === 'not_moderator' ? 403 : code === 'rate_limited' ? 429 : r.status >= 500 ? 502 : 400
  return json(status, { error: code })
}

/** The caller's bearer token, or null. (The platform also verifies it before the function runs.) */
export function bearer(req: Request): string | null {
  const m = /^Bearer ([A-Za-z0-9._-]+)$/.exec(req.headers.get('authorization') ?? '')
  return m ? m[1] : null
}

async function readBody(req: Request, limit: number): Promise<Uint8Array | null> {
  const declared = Number(req.headers.get('content-length') ?? '0')
  if (declared > limit) return null
  const reader = req.body?.getReader()
  if (!reader) return new Uint8Array()
  const chunks: Uint8Array[] = []
  let total = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    total += value.length
    if (total > limit) {
      await reader.cancel()
      return null
    }
    chunks.push(value)
  }
  const out = new Uint8Array(total)
  let at = 0
  for (const c of chunks) {
    out.set(c, at)
    at += c.length
  }
  return out
}

async function readJson(req: Request): Promise<Record<string, unknown> | null> {
  const bytes = await readBody(req, 16_384)
  if (!bytes) return null
  try {
    const v = JSON.parse(new TextDecoder().decode(bytes))
    return v && typeof v === 'object' && !Array.isArray(v) ? v : null
  } catch {
    return null
  }
}

/** Records a file a failed step may have left behind, so the moderator's cleanup can remove it. */
async function orphan(deps: Deps, path: string, reason: string) {
  const r = await deps.serviceRpc('svc_avatar_orphan', { p_path: path, p_reason: reason })
  if (!r.ok) deps.log('orphan_not_recorded', { reason })
}

export async function handle(req: Request, action: string, deps: Deps): Promise<Response> {
  if (req.method !== 'POST') return json(405, { error: 'method_not_allowed' })
  const token = bearer(req)
  if (!token) return json(401, { error: 'not_signed_in' })

  if (action === 'upload') {
    const bytes = await readBody(req, MAX_INPUT_BYTES)
    if (!bytes) return json(413, { error: 'too_large' })
    // Cheap structural check first, so obviously wrong files don't count against the daily limit.
    try {
      checkHeader(bytes)
    } catch (e) {
      return json(422, { error: e instanceof ImageRejected ? e.code : 'not_jpeg' })
    }
    // 1. Authorization, as the caller: membership, complete profile, 10 a day. The database chooses the path.
    const begin = await deps.userRpc(token, 'app_avatar_begin', {})
    if (!begin.ok) return refuse(begin)
    const path = typeof begin.data === 'string' && /^[0-9a-f-]{36}\/[0-9a-f-]{36}\.jpg$/.test(begin.data) ? begin.data : null
    if (!path) {
      deps.log('unexpected_begin_reply')
      return json(502, { error: 'unknown' })
    }
    // 2. Full decode under limits, then a fresh encode: the only bytes ever stored.
    let clean: Uint8Array
    try {
      clean = reencode(bytes)
    } catch (e) {
      // Nothing was stored; the unused authorisation simply expires after 15 minutes.
      return json(422, { error: e instanceof ImageRejected ? e.code : 'not_decodable' })
    }
    // 3. Store at the database's path (never overwriting).
    if (!(await deps.upload(path, clean))) {
      await orphan(deps, path, 'upload failed')
      deps.log('upload_failed')
      return json(502, { error: 'storage_unavailable' })
    }
    // 4. Make it current. The database re-checks membership at this moment and serialises per member.
    const commit = await deps.serviceRpc('svc_avatar_commit', { p_path: path })
    if (!commit.ok) {
      if (!(await deps.remove([path]))) await orphan(deps, path, 'commit refused and the new file could not be deleted')
      return refuse(commit)
    }
    // 5. Delete the previous file (its link stops working).
    const previous = typeof commit.data === 'string' ? commit.data : null
    if (previous && !(await deps.remove([previous]))) await orphan(deps, previous, 'replaced; delete failed')
    deps.log('avatar_set', { bytes: clean.length, replaced: previous !== null })
    return json(200, { ok: true })
  }

  if (action === 'remove') {
    const r = await deps.userRpc(token, 'app_avatar_remove', {})
    if (!r.ok) return refuse(r)
    const previous = typeof r.data === 'string' ? r.data : null
    if (previous && !(await deps.remove([previous]))) await orphan(deps, previous, 'removed; delete failed')
    deps.log('avatar_removed', { had_picture: previous !== null })
    return json(200, { ok: true })
  }

  if (action === 'urls') {
    const body = await readJson(req)
    const ids = Array.isArray(body?.ids) ? (body!.ids as unknown[]) : null
    if (!ids || ids.length > 100 || !ids.every((x) => typeof x === 'string' && UUID.test(x))) return json(400, { error: 'invalid_request' })
    if (ids.length === 0) return json(200, { avatars: {} })
    // The database returns paths only for visible members (active, not hidden), and only to members.
    const r = await deps.userRpc(token, 'app_avatars', { p_members: [...new Set(ids)] })
    if (!r.ok) return refuse(r)
    const rows = Array.isArray(r.data) ? (r.data as Array<{ id?: unknown; path?: unknown; updated_at?: unknown }>) : []
    const valid = rows.filter((x) => typeof x.id === 'string' && typeof x.path === 'string')
    if (valid.length === 0) return json(200, { avatars: {} })
    const links = await deps.sign(valid.map((x) => x.path as string), LINK_SECONDS)
    if (!links) return json(502, { error: 'storage_unavailable' })
    const avatars: Record<string, { url: string; updatedAt: string | null }> = {}
    for (const x of valid) {
      const url = links[x.path as string]
      if (url) avatars[x.id as string] = { url, updatedAt: typeof x.updated_at === 'string' ? x.updated_at : null }
    }
    return json(200, { avatars, expiresIn: LINK_SECONDS })
  }

  if (action === 'cleanup') {
    const body = await readJson(req)
    const plan = typeof body?.plan === 'string' && UUID.test(body.plan) ? body.plan : null
    const confirm = typeof body?.confirm === 'string' ? body.confirm : null
    if (!plan || !confirm) return json(400, { error: 'invalid_request' })
    // Moderator, same moderator's dry run, within 15 minutes, exact phrase; the
    // database rechecks every file and returns only those still safe to delete.
    const start = await deps.userRpc(token, 'app_mod_storage_cleanup_start', { p_plan: plan, p_confirm: confirm })
    if (!start.ok) return refuse(start)
    const paths = (Array.isArray(start.data) ? start.data : []).filter((p): p is string => typeof p === 'string' && /^[0-9a-f-]{36}\/[0-9a-f-]{36}\.jpg$/.test(p))
    for (let i = 0; i < paths.length; i += 100) await deps.remove(paths.slice(i, i + 100))
    // The database records only files that are really gone.
    const finish = await deps.userRpc(token, 'app_mod_storage_cleanup_finish', { p_plan: plan })
    if (!finish.ok) return refuse(finish)
    deps.log('storage_cleanup', { confirmed: paths.length, deleted: Number(finish.data) || 0 })
    return json(200, { deleted: Number(finish.data) || 0, confirmed: paths.length })
  }

  return json(404, { error: 'not_found' })
}
