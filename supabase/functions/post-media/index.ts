// Supabase Edge Function: post-media (Build 5.3). Photo posts: upload (two
// server-made copies), signed links, the reported photo for moderators, the
// deletion queue (scheduled, on request and by moderators), and the founder's
// hosted processing check. Video posts (IP-5, 20261213000000): a signed
// resumable upload token, the server's header check, the poster, and links.
//
// Staging, and member Production ONLY once separately approved
// (postMediaFunctionApproved in config/member-production.json; photos stay off
// in the database either way). Deployed only with scripts/functions/deploy.sh
// (docs/FUNCTIONS-DEPLOYMENT.md), commit pinned, by the founder, with the
// gateway JWT check off, because the function verifies every member itself
// with Supabase Auth (handler.ts). It refuses to run in any project other than
// those ../_shared/policy.ts allows. Every response carries X-Splitpost-Build.
//
// Environment: what Supabase provides to every hosted function, plus one
// secret the founder sets for the schedule (never in the repository, GitHub
// or Vercel):
//   SUPABASE_URL               the project (checked by ../_shared/policy.ts)
//   SUPABASE_ANON_KEY          fallback project key for the caller's own calls
//   SUPABASE_SERVICE_ROLE_KEY  used only for Storage and the svc_* steps
//   MEDIA_DRAIN_KEY            optional: at least 32 characters; lets the
//                              schedule run the drain. Without it the drain
//                              action refuses, and everything else works.
//
// Routes (POST): /post-media/photo, /links, /cleanup, /deletions, /mod-photo, /mod-drain,
// /check, /video-begin, /video-verify, /video-poster, /video-links,
// /video-test-link (signed-in members; the database decides), /drain (the schedule).
import { handle, type Bucket, type Deps, type RpcResult } from './handler.ts'
import { BUILD_HEADER, BUILD_ID, corsHeaders, memberFunctionRole, refusalReason } from '../_shared/policy.ts'

// Which projects this function may serve, and which browser origins may call
// it there, come only from ../_shared/policy.ts (references generated from
// config/supabase-projects.json): staging with the member app's Previews,
// member Production (only once its reference is set) with exactly
// https://app.splitpost.ca, and local Supabase. Anywhere else it refuses.
const env = (k: string) => (Deno.env.get(k) ?? '').trim()
const url = env('SUPABASE_URL').replace(/\/+$/, '')
const anon = env('SUPABASE_ANON_KEY')
const service = env('SUPABASE_SERVICE_ROLE_KEY')
const drainKey = env('MEDIA_DRAIN_KEY')
const role = memberFunctionRole(url)
const configured = role !== null && anon !== '' && service !== ''
const log = (event: string, detail: Record<string, string | number | boolean> = {}) => console.log(JSON.stringify({ fn: 'post-media', event, ...detail }))
if (!configured) log('refusing_to_run', { reason: role === null ? refusalReason(url) : 'missing keys' })

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
  async upload(path, bytes, bucket: Bucket = 'post-photos', type = 'image/jpeg', upsert = false) {
    try {
      // Only the two media buckets, spelled out.
      const res = await storage(bucket === 'post-videos' ? `/object/post-videos/${path}` : `/object/post-photos/${path}`, {
        method: 'POST',
        // Never overwrite a photo: every upload has a new path. A video's poster may be sent again.
        headers: { 'Content-Type': type, 'x-upsert': upsert ? 'true' : 'false', 'cache-control': 'max-age=3600' },
        body: bytes as unknown as BodyInit,
      })
      await res.body?.cancel()
      return res.ok
    } catch {
      return false
    }
  },
  async remove(paths, bucket: Bucket = 'post-photos') {
    try {
      const res = await storage(bucket === 'post-videos' ? '/object/post-videos' : '/object/post-photos', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ prefixes: paths }) })
      await res.body?.cancel()
      return res.ok
    } catch {
      return false
    }
  },
  async sign(paths, seconds, bucket: Bucket = 'post-photos') {
    try {
      const res = await storage(bucket === 'post-videos' ? '/object/sign/post-videos' : '/object/sign/post-photos', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ expiresIn: seconds, paths }) })
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
  async signUpload(bucket, path) {
    try {
      // Storage's own signed upload token for exactly this path (never overwriting), valid 2 hours.
      if (bucket !== 'post-videos') return null
      const res = await storage(`/object/upload/sign/post-videos/${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-upsert': 'false' }, body: '{}' })
      if (!res.ok) {
        await res.body?.cancel()
        return null
      }
      const d = (await res.json()) as { token?: unknown; url?: unknown }
      if (typeof d.token === 'string' && /^[A-Za-z0-9_.-]{20,4096}$/.test(d.token)) return d.token
      const m = typeof d.url === 'string' ? /[?&]token=([A-Za-z0-9_.-]{20,4096})/.exec(d.url) : null
      return m ? m[1] : null
    } catch {
      return null
    }
  },
  async readRange(bucket, path, start, length) {
    try {
      if (bucket !== 'post-videos') return null
      const res = await storage(`/object/authenticated/post-videos/${path}`, { method: 'GET', headers: { Range: `bytes=${start}-${start + length - 1}` } })
      if (res.status !== 206 && res.status !== 200) {
        await res.body?.cancel()
        return null
      }
      const range = /\/(\d+)$/.exec(res.headers.get('content-range') ?? '')
      const size = range ? Number(range[1]) : Number(res.headers.get('content-length') ?? '-1')
      // Never read more than asked, even if Storage ignored the range.
      const reader = res.body?.getReader()
      if (!reader) return null
      const out = new Uint8Array(length)
      let at = 0
      while (at < length) {
        const { done, value } = await reader.read()
        if (done) break
        const take = Math.min(value.length, length - at)
        out.set(value.subarray(0, take), at)
        at += take
      }
      await reader.cancel().catch(() => {})
      if (res.status === 200 && start > 0) return null
      return { bytes: out.subarray(0, at), size }
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

Deno.serve(async (req) => {
  const headers: Record<string, string> = { ...corsHeaders(role, req.headers.get('origin')), [BUILD_HEADER]: BUILD_ID }
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: { ...headers, 'X-Content-Type-Options': 'nosniff' } })
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
