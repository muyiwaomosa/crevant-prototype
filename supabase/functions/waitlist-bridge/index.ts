// Supabase Edge Function: waitlist-bridge (BL-009, founder decision D1 option
// A). Control Center's waitlist review and invitations: import verified,
// consenting applicants from the waitlist for review, and send the personal
// invitations the founder approved. Member projects only (staging, and member
// Production once waitlistBridgeFunctionApproved is true in
// config/member-production.json); it refuses to run anywhere else.
// Deployed with scripts/functions/deploy.mjs (docs/FUNCTIONS-DEPLOYMENT.md),
// gateway JWT check off: the function verifies the founder itself.
//
// Environment: what Supabase provides, plus two founder-set secrets:
//   SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY (the svc_* steps only)
//   WAITLIST_HANDOFF_KEY  the key the waitlist's waitlist-handoff function holds
//                         (at least 32 characters). Missing = not configured.
//   RESEND_API_KEY        a sending-only Resend key for mail.splitpost.ca.
//                         Missing: applicants can be imported and reviewed,
//                         but nothing is sent.
//   RESEND_WEBHOOK_SECRET the signing secret (whsec_...) of the Resend webhook
//                         pointed at /waitlist-bridge/delivery-event. Missing:
//                         every event is refused, and invitations stay at
//                         "accepted by the provider", never shown as delivered.
// The waitlist address comes from ../_shared/policy.ts (config), never a secret.
import { handleBridge, type BridgeDeps, type RpcResult } from './handler.ts'
import { BUILD_HEADER, BUILD_ID, bridgeTargets, corsHeaders, memberFunctionRole, refusalReason } from '../_shared/policy.ts'
import { resendKeyUsable, sendEmail } from '../_shared/email.ts'

const env = (k: string) => (Deno.env.get(k) ?? '').trim()
const url = env('SUPABASE_URL').replace(/\/+$/, '')
const anon = env('SUPABASE_ANON_KEY')
const service = env('SUPABASE_SERVICE_ROLE_KEY')
const role = memberFunctionRole(url)
const targets = bridgeTargets(role, url)
const handoffKey = env('WAITLIST_HANDOFF_KEY')
const resendKey = env('RESEND_API_KEY')
const webhookSecret = env('RESEND_WEBHOOK_SECRET')
const configured = role !== null && targets !== null && anon !== '' && service !== '' && handoffKey.length >= 32
const log = (event: string, detail: Record<string, string | number | boolean> = {}) => console.log(JSON.stringify({ fn: 'waitlist-bridge', event, ...detail }))
if (!configured) log('refusing_to_run', { reason: role === null ? refusalReason(url) : 'missing keys or waitlist address' })

async function verifyUser(token: string): Promise<boolean> {
  try {
    const res = await fetch(`${url}/auth/v1/user`, { headers: { apikey: anon, Authorization: `Bearer ${token}` } })
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
    return { ok: false, status: res.status, code: res.status === 401 || /permission denied/.test(message) ? 'not_signed_in' : message }
  } catch {
    return { ok: false, status: 503, code: 'unavailable' }
  }
}

const deps: BridgeDeps = {
  configured,
  verifyUser,
  userRpc: (token, fn, body) => rpc(anon, token, fn, body),
  serviceRpc: (fn, body) => rpc(service, service, fn, body),
  async handoff(body) {
    try {
      const res = await fetch(targets!.handoffUrl, {
        method: 'POST',
        headers: { Authorization: `Bearer ${handoffKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(20_000),
      })
      if (!res.ok) {
        await res.body?.cancel()
        log('handoff_failed', { status: res.status })
        return { ok: false }
      }
      return { ok: true, data: (await res.json()) as Record<string, unknown> }
    } catch {
      log('handoff_unreachable')
      return { ok: false }
    }
  },
  sendEmail: (mail) => sendEmail(mail, resendKey, fetch),
  appOrigin: targets?.appOrigin ?? '',
  emailReady: resendKeyUsable(resendKey),
  webhookSecret,
}

Deno.serve(async (req: Request) => {
  const origin = req.headers.get('origin')
  const cors = corsHeaders(role, origin)
  // nosniff on every response, preflights included, as on the other member functions (verify.mjs checks it).
  const headers = { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', [BUILD_HEADER]: BUILD_ID, ...cors }
  if (req.method === 'OPTIONS') return new Response(null, { status: cors['Access-Control-Allow-Origin'] ? 204 : 403, headers })
  const body = req.method === 'POST' ? (await req.text()).slice(0, 16384) : ''
  const out = await handleBridge({
    method: req.method, path: new URL(req.url).pathname, authorization: req.headers.get('authorization'), body,
    headers: { 'svix-id': req.headers.get('svix-id'), 'svix-timestamp': req.headers.get('svix-timestamp'), 'svix-signature': req.headers.get('svix-signature') },
  }, deps)
  // Counts and fixed codes only: never an address, link or key.
  log('request', { status: out.status, ...Object.fromEntries(Object.entries(out.data).filter(([, v]) => typeof v === 'number' || typeof v === 'string')) as Record<string, string | number> })
  return new Response(JSON.stringify(out.data), { status: out.status, headers })
})
