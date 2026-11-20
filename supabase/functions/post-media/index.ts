// Supabase Edge Function: post-media (Build 5.3). Photo posts: upload (two
// server-made copies), signed links, the reported photo for moderators, the
// deletion queue (scheduled, on request and by moderators), and the founder's
// hosted processing check.
//
// STAGING ONLY. Deployed by hand by the founder after the database migration
// (docs/PHOTOS.md), with the gateway JWT check off, because the function
// verifies every member itself with Supabase Auth (handler.ts):
//   supabase functions deploy post-media --no-verify-jwt --project-ref kpudeppgokpjhvaqrprn
// It refuses to run in any other hosted project (see PROJECT below).
//
// Environment: what Supabase provides to every hosted function, plus one
// secret the founder sets for the schedule (never in the repository, GitHub
// or Vercel):
//   SUPABASE_URL               the project (checked against PROJECT)
//   SUPABASE_ANON_KEY          fallback project key for the caller's own calls
//   SUPABASE_SERVICE_ROLE_KEY  used only for Storage and the svc_* steps
//   MEDIA_DRAIN_KEY            optional: at least 32 characters; lets the
//                              schedule run the drain. Without it the drain
//                              action refuses, and everything else works.
//
// Routes (POST): /post-media/photo, /links, /cleanup, /mod-photo, /mod-drain,
// /check (signed-in members; the database decides), /drain (the schedule).
import { handle, type Deps, type RpcResult } from './handler.ts'

// The one hosted project this function may serve. Changing it needs a reviewed PR.
const PROJECT = 'kpudeppgokpjhvaqrprn'
const HOSTED = `https://${PROJECT}.supabase.co`
// Local Supabase (development and CI) is also allowed.
const LOCAL = /^http:\/\/(127\.0\.0\.1|localhost|kong|host\.docker\.internal)(:\d+)?$/

// Browsers may call it only from the member app's Previews and local development.
const ALLOWED_ORIGIN = /^https:\/\/splitpost-app-[a-z0-9-]+-crevant\.vercel\.app$/
const LOCAL_ORIGIN = /^http:\/\/(127\.0\.0\.1|localhost):\d+$/

const env = (k: string) => (Deno.env.get(k) ?? '').trim()
const url = env('SUPABASE_URL').replace(/\/+$/, '')
const anon = env('SUPABASE_ANON_KEY')
const service = env('SUPABASE_SERVICE_ROLE_KEY')
const drainKey = env('MEDIA_DRAIN_KEY')
const local = LOCAL.test(url)
const configured = (url === HOSTED || local) && anon !== '' && service !== ''
const log = (event: string, detail: Record<string, string | number | boolean> = {}) => console.log(JSON.stringify({ fn: 'post-media', event, ...detail }))
if (!configured) log('refusing_to_run', { reason: url === '' ? 'no SUPABASE_URL' : url === HOSTED || local ? 'missing keys' : 'not the staging project' })

// Supabase Auth checks the token: signature (current ES256 key or the previous
// HS256 key), expiry, and that its session still exists. Only a signed-in
// user passes; the anon or service key used as a token does not.
async function verifyUser(token: string, key: string | null): Promise<boolean> {
  try {
    const res = await fetch(`${url}/auth/v1/user`, { headers: { apikey: key ?? anon, Authorization: `Bearer ${token}` } })
    if (!res.ok) {
      await res.body?.cancel()
      return false
    }
    const user = (await res.json()) as { id?: unknown; aud?: unknown; role?: unknown }
    return typeof user.id === 'string' && /^[0-9a-f-]{36}$/.test(user.id) && user.aud === 'authenticated' && user.role === 'authenticated'
  } catch {
    return false
  }
}

async function rpc(key: string, token: string, fn: string, body: Record<string, unknown>): Promise<RpcResult> {
  try {
    const res = await fetch(`${url}/rest/v1/rpc/${fn}`, {
      method: 'POST',
      headers: { apikey: key, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    const text = await res.text()
    let data: unknown = null
    try {
      data = text ? JSON.parse(text) : null
    } catch {
      data = null
    }
    if (res.ok) return { ok: true, data }
    const message = data && typeof data === 'object' && 'message' in data ? String((data as { message: unknown }).message) : ''
    const code = res.status === 401 ? 'not_signed_in' : /permission denied/.test(message) ? 'not_signed_in' : message
    return { ok: false, status: res.status, code }
  } catch {
    return { ok: false, status: 503, code: 'unavailable' }
  }
}

const storage = (path: string, init: RequestInit) =>
  fetch(`${url}/storage/v1${path}`, { ...init, headers: { apikey: service, Authorization: `Bearer ${service}`, ...(init.headers ?? {}) } })

const deps: Deps = {
  verifyUser,
  userRpc: (token, fn, body, key) => rpc(key ?? anon, token, fn, body),
  serviceRpc: (fn, body) => rpc(service, service, fn, body),
  async upload(path, bytes) {
    try {
      const res = await storage(`/object/post-photos/${path}`, {
        method: 'POST',
        // Never overwrite: every upload has a new path.
        headers: { 'Content-Type': 'image/jpeg', 'x-upsert': 'false', 'cache-control': 'max-age=3600' },
        body: bytes as unknown as BodyInit,
      })
      await res.body?.cancel()
      return res.ok
    } catch {
      return false
    }
  },
  async remove(paths) {
    try {
      const res = await storage('/object/post-photos', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ prefixes: paths }) })
      await res.body?.cancel()
      return res.ok
    } catch {
      return false
    }
  },
  async sign(paths, seconds) {
    try {
      const res = await storage('/object/sign/post-photos', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ expiresIn: seconds, paths }) })
      if (!res.ok) {
        await res.body?.cancel()
        return null
      }
      const rows = (await res.json()) as Array<{ path?: string; signedURL?: string | null; error?: string | null }>
      const out: Record<string, string> = {}
      // Links are relative to /storage/v1, so the app adds its own project address.
      for (const r of rows) if (r.path && r.signedURL && !r.error) out[r.path] = r.signedURL
      return out
    } catch {
      return null
    }
  },
  drainKeyMatches(presented) {
    if (drainKey.length < 32 || presented.length !== drainKey.length) return false
    let diff = 0
    for (let i = 0; i < drainKey.length; i++) diff |= drainKey.charCodeAt(i) ^ presented.charCodeAt(i)
    return diff === 0
  },
  log,
}

function cors(origin: string | null): Record<string, string> {
  const allowed = origin && (ALLOWED_ORIGIN.test(origin) || (local && LOCAL_ORIGIN.test(origin))) ? origin : null
  return allowed
    ? {
        'Access-Control-Allow-Origin': allowed,
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
        'Access-Control-Max-Age': '600',
        Vary: 'Origin',
      }
    : { Vary: 'Origin' }
}

Deno.serve(async (req) => {
  const headers = cors(req.headers.get('origin'))
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers })
  const respond = (res: Response) => {
    for (const [k, v] of Object.entries(headers)) res.headers.set(k, v)
    res.headers.set('X-Content-Type-Options', 'nosniff')
    return res
  }
  if (!configured) {
    return respond(new Response(JSON.stringify({ error: 'unavailable' }), { status: 503, headers: { 'Content-Type': 'application/json' } }))
  }
  const action = new URL(req.url).pathname.split('/').filter(Boolean).pop() ?? ''
  try {
    return respond(await handle(req, action, deps))
  } catch {
    log('unexpected_error')
    return respond(new Response(JSON.stringify({ error: 'unknown' }), { status: 500, headers: { 'Content-Type': 'application/json' } }))
  }
})
