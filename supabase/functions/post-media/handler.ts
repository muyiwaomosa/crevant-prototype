// The post-media Edge Function's actions (Build 5.3: photos), with every
// outside call injected (database calls as the caller, database calls as the
// service role, Storage), so the safeguards can be tested.
//
// Authentication: the platform's gateway JWT check is OFF (staging signs
// sessions with ES256 keys). EVERY member action is checked here first, with
// Supabase Auth itself (verifyUser): signature, expiry, and that the session
// still exists. The one exception is the scheduled drain, which carries no
// member: it must present the drain key (a secret only the schedule and the
// function know), and all it can do is delete files the database has queued.
//
// Authorization: every member action then asks the database, as the caller,
// whether they may: membership, the switch, limits and the cap (uploads);
// visibility (links); moderator (the reported photo, a moderator drain);
// founder (the processing check). The database chooses every path; this code
// never accepts a member id or a storage path from the browser. The service
// role is used only afterwards, for Storage and the svc_* steps.
import { checkHeader, ImageRejected, makeVariants, MAX_INPUT_BYTES, syntheticPhoto } from './image.ts'

export type RpcResult = { ok: true; data: unknown } | { ok: false; status: number; code: string }

export interface Deps {
  verifyUser(token: string, key: string | null): Promise<boolean>
  userRpc(token: string, fn: string, body: Record<string, unknown>, key: string | null): Promise<RpcResult>
  serviceRpc(fn: string, body: Record<string, unknown>): Promise<RpcResult>
  upload(path: string, bytes: Uint8Array): Promise<boolean>
  remove(paths: string[]): Promise<boolean>
  /** path -> link relative to /storage/v1, or null on failure. */
  sign(paths: string[], seconds: number): Promise<Record<string, string> | null>
  /** True only for the exact drain key (constant time); false if none is configured. */
  drainKeyMatches(presented: string): boolean
  log(event: string, detail?: Record<string, string | number | boolean>): void
}

const LINK_SECONDS = 3600
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
const PHOTO_PATH = /^[0-9a-f-]{36}\/[0-9a-f-]{36}(-feed)?\.jpg$/
const KNOWN = new Set([
  'not_signed_in', 'no_pilot_access', 'profile_incomplete', 'rate_limited', 'not_moderator', 'not_found',
  'photos_unavailable', 'photo_limit', 'storage_full', 'upload_expired', 'too_many', 'invalid_request',
])
export const CHECK_PASS_MS = 1000

const json = (status: number, body: Record<string, unknown>) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } })
const refuse = (r: { status: number; code: string }) => {
  const code = KNOWN.has(r.code) ? r.code : 'unknown'
  const status =
    code === 'not_signed_in' ? 401
    : code === 'no_pilot_access' || code === 'not_moderator' || code === 'photos_unavailable' ? 403
    : code === 'rate_limited' || code === 'photo_limit' ? 429
    : code === 'storage_full' ? 507
    : r.status >= 500 ? 502 : 400
  return json(status, { error: code })
}

export function bearer(req: Request): string | null {
  const m = /^Bearer ([A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)$/.exec(req.headers.get('authorization') ?? '')
  return m && m[1].length <= 4096 ? m[1] : null
}
export function publishableKey(req: Request): string | null {
  const k = req.headers.get('apikey') ?? ''
  return /^sb_publishable_[A-Za-z0-9_-]{10,200}$/.test(k) ? k : null
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

/** One pass over the deletion queue: claim, delete from Storage, record the outcome. */
export async function drain(deps: Deps, source: 'scheduled' | 'request' | 'moderator', limit: number): Promise<{ ok: boolean; deleted: number; failed: number }> {
  const claim = await deps.serviceRpc('svc_media_drain_claim', { p_limit: limit })
  if (!claim.ok) {
    deps.log('drain_claim_failed', { source })
    return { ok: false, deleted: 0, failed: 0 }
  }
  const rows = (Array.isArray(claim.data) ? claim.data : []) as Array<{ id?: unknown; bucket?: unknown; path?: unknown }>
  const valid = rows.filter((r) => typeof r.id === 'number' && r.bucket === 'post-photos' && typeof r.path === 'string' && PHOTO_PATH.test(r.path))
  const deleted: number[] = []
  const failed: number[] = []
  for (let i = 0; i < valid.length; i += 100) {
    const batch = valid.slice(i, i + 100)
    const ok = await deps.remove(batch.map((r) => r.path as string))
    for (const r of batch) (ok ? deleted : failed).push(r.id as number)
  }
  // Rows this code refused to act on (never expected) are recorded as failures, not lost.
  for (const r of rows) if (typeof r.id === 'number' && !valid.includes(r)) failed.push(r.id)
  const done = await deps.serviceRpc('svc_media_drain_done', {
    p_source: source, p_deleted: deleted, p_failed: failed, p_error: failed.length ? 'storage delete failed' : null,
  })
  if (!done.ok) deps.log('drain_record_failed', { source, deleted: deleted.length })
  if (failed.length) deps.log('drain_failures', { source, failed: failed.length })
  return { ok: done.ok, deleted: deleted.length, failed: failed.length }
}

export async function handle(req: Request, action: string, deps: Deps): Promise<Response> {
  if (req.method !== 'POST') return json(405, { error: 'method_not_allowed' })

  // The scheduled drain: no member, only the drain key.
  if (action === 'drain') {
    const presented = req.headers.get('x-media-drain-key') ?? ''
    if (!deps.drainKeyMatches(presented)) return json(401, { error: 'not_signed_in' })
    const r = await drain(deps, 'scheduled', 100)
    return json(r.ok ? 200 : 502, { deleted: r.deleted, failed: r.failed })
  }

  const token = bearer(req)
  if (!token) return json(401, { error: 'not_signed_in' })
  const key = publishableKey(req)
  // Authentication first, for every member action, before reading the body or touching anything.
  if (!(await deps.verifyUser(token, key))) return json(401, { error: 'not_signed_in' })
  const asCaller = (fn: string, body: Record<string, unknown>) => deps.userRpc(token, fn, body, key)

  if (action === 'photo') {
    const bytes = await readBody(req, MAX_INPUT_BYTES)
    if (!bytes) return json(413, { error: 'too_large' })
    try {
      checkHeader(bytes)
    } catch (e) {
      return json(422, { error: e instanceof ImageRejected ? e.code : 'not_jpeg' })
    }
    // 1. Authorization, as the caller: membership, the switch, limits and the cap. The database chooses both paths.
    const begin = await asCaller('app_photo_upload_begin', {})
    if (!begin.ok) return refuse(begin)
    const row = (Array.isArray(begin.data) ? begin.data[0] : null) as { upload_id?: unknown; full_path?: unknown; feed_path?: unknown } | null
    const id = typeof row?.upload_id === 'string' && UUID.test(row.upload_id) ? row.upload_id : null
    const fullPath = typeof row?.full_path === 'string' && PHOTO_PATH.test(row.full_path) ? row.full_path : null
    const feedPath = typeof row?.feed_path === 'string' && PHOTO_PATH.test(row.feed_path) ? row.feed_path : null
    if (!id || !fullPath || !feedPath || !fullPath.endsWith(`${id}.jpg`) || feedPath !== fullPath.replace(/\.jpg$/, '-feed.jpg')) {
      deps.log('unexpected_begin_reply')
      return json(502, { error: 'unknown' })
    }
    // 2. Full decode under limits, then two fresh encodes: the only bytes ever stored.
    let v
    try {
      v = makeVariants(bytes)
    } catch (e) {
      const code = e instanceof ImageRejected ? e.code : 'not_decodable'
      await deps.serviceRpc('svc_photo_upload_failed', { p_upload: id, p_reason: `rejected: ${code}` })
      return json(422, { error: code })
    }
    // 3. Store both (never overwriting); on any failure the database queues whatever was written.
    if (!(await deps.upload(fullPath, v.full)) || !(await deps.upload(feedPath, v.feed))) {
      await deps.serviceRpc('svc_photo_upload_failed', { p_upload: id, p_reason: 'storage upload failed' })
      deps.log('upload_failed')
      return json(502, { error: 'storage_unavailable' })
    }
    // 4. Mark it stored: the database re-checks membership at this moment.
    const stored = await deps.serviceRpc('svc_photo_upload_stored', {
      p_upload: id, p_width: v.width, p_height: v.height, p_full_bytes: v.full.length, p_feed_bytes: v.feed.length,
    })
    if (!stored.ok) {
      await deps.serviceRpc('svc_photo_upload_failed', { p_upload: id, p_reason: 'store refused' })
      return refuse(stored)
    }
    deps.log('photo_stored', { ms: v.ms, full_bytes: v.full.length, feed_bytes: v.feed.length })
    return json(200, { uploadId: id, width: v.width, height: v.height })
  }

  if (action === 'links') {
    const body = await readJson(req)
    const ids = Array.isArray(body?.ids) ? (body!.ids as unknown[]) : null
    if (!ids || ids.length > 100 || !ids.every((x) => typeof x === 'string' && UUID.test(x))) return json(400, { error: 'invalid_request' })
    if (ids.length === 0) return json(200, { photos: {} })
    // The database returns paths only for live posts by visible members, and only to members.
    const r = await asCaller('app_post_photos', { p_posts: [...new Set(ids)] })
    if (!r.ok) return refuse(r)
    const rows = (Array.isArray(r.data) ? r.data : []) as Array<{ post_id?: unknown; full_path?: unknown; feed_path?: unknown }>
    const valid = rows.filter((x) => typeof x.post_id === 'string' && typeof x.full_path === 'string' && typeof x.feed_path === 'string'
      && PHOTO_PATH.test(x.full_path) && PHOTO_PATH.test(x.feed_path))
    if (valid.length === 0) return json(200, { photos: {} })
    const links = await deps.sign(valid.flatMap((x) => [x.full_path as string, x.feed_path as string]), LINK_SECONDS)
    if (!links) return json(502, { error: 'storage_unavailable' })
    const photos: Record<string, { full: string; feed: string }> = {}
    for (const x of valid) {
      const full = links[x.full_path as string]
      const feed = links[x.feed_path as string]
      if (full && feed) photos[x.post_id as string] = { full, feed }
    }
    return json(200, { photos, expiresIn: LINK_SECONDS })
  }

  if (action === 'cleanup') {
    // After a member deletes a post: a small pass over the queue now. The
    // schedule guarantees it; this only makes it quicker.
    const me = await asCaller('app_photo_status', {})
    if (!me.ok) return refuse(me)
    const r = await drain(deps, 'request', 20)
    return json(r.ok ? 200 : 502, { deleted: r.deleted })
  }

  if (action === 'mod-photo') {
    const body = await readJson(req)
    const report = typeof body?.report === 'string' && UUID.test(body.report) ? body.report : null
    if (!report) return json(400, { error: 'invalid_request' })
    const r = await asCaller('app_mod_report_media', { p_report: report })
    if (!r.ok) return refuse(r)
    const row = (Array.isArray(r.data) ? r.data[0] : null) as { full_path?: unknown; feed_path?: unknown; description?: unknown } | null
    if (!row || typeof row.full_path !== 'string' || typeof row.feed_path !== 'string' || !PHOTO_PATH.test(row.full_path) || !PHOTO_PATH.test(row.feed_path)) {
      return json(200, { photo: null })
    }
    const links = await deps.sign([row.full_path, row.feed_path], LINK_SECONDS)
    if (!links) return json(502, { error: 'storage_unavailable' })
    // The file may already be gone (report retention): then there is no link.
    const full = links[row.full_path]
    const feed = links[row.feed_path]
    return json(200, { photo: full && feed ? { full, feed, description: typeof row.description === 'string' ? row.description : null } : null })
  }

  if (action === 'mod-drain') {
    const st = await asCaller('app_mod_media_status', {})
    if (!st.ok) return refuse(st)
    const r = await drain(deps, 'moderator', 100)
    return json(r.ok ? 200 : 502, { deleted: r.deleted, failed: r.failed })
  }

  if (action === 'check') {
    // The founder's hosted processing check: one synthetic photo through the
    // same steps as an upload (nothing stored), timed and recorded.
    const f = await asCaller('app_is_founder', {})
    if (!f.ok) return refuse(f)
    if (f.data !== true) return json(403, { error: 'not_founder' })
    const body = await readJson(req)
    const seed = typeof body?.seed === 'number' && Number.isInteger(body.seed) && body.seed >= 1 && body.seed <= 6 ? body.seed : null
    if (!seed) return json(400, { error: 'invalid_request' })
    const input = syntheticPhoto(seed)
    let ms = 0
    let ok = false
    let detail = ''
    try {
      const v = makeVariants(input)
      ms = v.ms
      ok = v.ms < CHECK_PASS_MS
      detail = `seed ${seed}: ${v.width}x${v.height}, full ${v.full.length} B, feed ${v.feed.length} B`
    } catch (e) {
      detail = `seed ${seed}: ${e instanceof ImageRejected ? e.code : 'error'}`
    }
    const rec = await deps.serviceRpc('svc_photo_check_record', { p_actor: 'founder', p_ms: ms, p_ok: ok, p_detail: detail })
    if (!rec.ok) return json(502, { error: 'unknown' })
    deps.log('processing_check', { ms, ok })
    return json(200, { ms, ok, passBelowMs: CHECK_PASS_MS })
  }

  return json(404, { error: 'not_found' })
}
