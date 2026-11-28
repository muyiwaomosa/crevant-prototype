// The waitlist-bridge function's request handling (BL-009, founder decision D1
// option A), kept free of Deno imports so it can be unit tested.
//
// Control Center calls it as the signed-in founder:
//   POST /waitlist-bridge/import  carry withdrawals and deletions, record
//                                 declines, then copy newly verified,
//                                 consenting applicants for review
//   POST /waitlist-bridge/replace {"invitation_id":"..."}: the founder's
//                                 replacement for an invitation that expired,
//                                 failed or bounced, after a fresh waitlist check
//   POST /waitlist-bridge/delivery-event  the email provider's signed delivery
//                                 events (delivered, delayed, bounced,
//                                 complained); no member token
//   POST /waitlist-bridge/forget-email  {"email":"..."}: a deletion request
//                                 received by email, carried out here and on
//                                 the waitlist (whether or not the person was
//                                 ever imported)
//   POST /waitlist-bridge/send    the same first steps, then for each approved
//                                 applicant: recheck with the waitlist, create
//                                 the single-use invitation, email it, record
//                                 the delivery and the outcome; then retry
//                                 failed deliveries
// The database decides who the founder is (app_founder_waitlist_overview with
// the caller's own token) and whether invitations may be sent (the launch gate
// and registration settings): while external access is closed nothing is
// created and nothing is sent.
import type { Mail, SendResult } from '../_shared/email.ts'
import { invitationMail } from './invitation.ts'

export type RpcResult = { ok: true; data: unknown } | { ok: false; status: number; code: string }
export type HandoffResult = { ok: true; data: Record<string, unknown> } | { ok: false }

export interface BridgeDeps {
  /** The project is allowed and every key and secret is present. */
  configured: boolean
  verifyUser(token: string): Promise<boolean>
  userRpc(token: string, fn: string, body: Record<string, unknown>): Promise<RpcResult>
  serviceRpc(fn: string, body: Record<string, unknown>): Promise<RpcResult>
  handoff(body: Record<string, unknown>): Promise<HandoffResult>
  sendEmail(mail: Mail): Promise<SendResult>
  /** Where invitation links point: the member app for this project. */
  appOrigin: string
  /** A Resend key is configured. */
  emailReady: boolean
  /** RESEND_WEBHOOK_SECRET (whsec_...): verifies the provider's delivery events. */
  webhookSecret: string
}

export interface BridgeRequest {
  method: string
  path: string
  authorization: string | null
  /** The raw body. */
  body?: string
  /** The provider's signature headers (delivery-event only). */
  headers?: Record<string, string | null>
}

export interface BridgeReply {
  status: number
  data: Record<string, unknown>
}

const r = (status: number, data: Record<string, unknown>): BridgeReply => ({ status, data })
const arr = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [])

class Unreachable extends Error {}

async function svc(deps: BridgeDeps, fn: string, body: Record<string, unknown>): Promise<unknown> {
  const out = await deps.serviceRpc(fn, body)
  if (!out.ok) throw new Error(`${fn}: ${out.code}`)
  return out.data
}

async function handoff(deps: BridgeDeps, body: Record<string, unknown>): Promise<Record<string, unknown>> {
  const out = await deps.handoff(body)
  if (!out.ok) throw new Unreachable()
  return out.data
}

/** Withdrawals, deletions, declines and unrecorded outcomes, carried before anything else. */
async function sync(deps: BridgeDeps) {
  const pending = (await svc(deps, 'svc_waitlist_bridge_pending', {})) as Record<string, unknown>
  const since = typeof pending.withdrawals_since === 'string' && pending.withdrawals_since !== '-infinity' ? pending.withdrawals_since : null
  const w = await handoff(deps, { action: 'withdrawals', since })
  const withdrawals = Array.isArray(w.withdrawals) ? w.withdrawals : []
  const removed = withdrawals.length ? ((await svc(deps, 'svc_waitlist_withdraw', { p_rows: withdrawals })) as number) : 0
  const forget = arr(pending.forget)
  let deleted = 0
  if (forget.length) {
    deleted = Number((await handoff(deps, { action: 'forget', ids: forget })).deleted ?? 0)
    await svc(deps, 'svc_waitlist_forget_done', { p_ids: forget })
  }
  const declined = arr(pending.declined)
  for (const id of declined) await handoff(deps, { action: 'record', id, outcome: 'declined' })
  if (declined.length) await svc(deps, 'svc_waitlist_declined_done', { p_ids: declined })
  // "Invited" outcomes the waitlist missed (it couldn't be reached when the
  // invitation went out). Recording one twice changes nothing there.
  const outcomes = arr(pending.outcomes)
  for (const id of outcomes) await handoff(deps, { action: 'record', id, outcome: 'invited' })
  if (outcomes.length) await svc(deps, 'svc_waitlist_outcomes_done', { p_ids: outcomes })
  return { pending, summary: { withdrawn: withdrawals.length, invitations_removed: removed, deleted, declined: declined.length, outcomes_recorded: outcomes.length } }
}

/** Emails one created invitation and records what the provider said. */
async function deliver(deps: BridgeDeps, inv: Record<string, unknown>): Promise<boolean> {
  const result = await deps.sendEmail(invitationMail(String(inv.email), deps.appOrigin, String(inv.code)))
  await svc(deps, 'svc_invitation_delivery', {
    p_invitation: inv.invitation_id, p_status: result.ok ? 'sent' : 'failed', p_provider_id: result.ok ? result.id : null, p_error: result.ok ? null : result.error,
  })
  return result.ok
}

/** Records "invited" on the waitlist now if it answers; otherwise it stays pending for the next sync. */
async function recordInvited(deps: BridgeDeps, id: string): Promise<boolean> {
  const out = await deps.handoff({ action: 'record', id, outcome: 'invited' })
  if (!out.ok) return false
  await svc(deps, 'svc_waitlist_outcomes_done', { p_ids: [id] })
  return true
}

const DELIVERY_EVENTS = ['email.delivered', 'email.delivery_delayed', 'email.bounced', 'email.complained']
const b64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes))

/**
 * Checks a Resend (Svix) webhook signature: base64 HMAC-SHA256 of
 * "<svix-id>.<svix-timestamp>.<body>" with the secret after "whsec_", within
 * five minutes. Any one of the listed v1 signatures may match.
 */
export async function verifyWebhook(secret: string, headers: Record<string, string | null>, body: string, nowSeconds = Math.floor(Date.now() / 1000)): Promise<boolean> {
  const id = headers['svix-id'] ?? ''
  const ts = headers['svix-timestamp'] ?? ''
  const sigs = (headers['svix-signature'] ?? '').split(' ').map((x) => x.replace(/^v1,/, '')).filter(Boolean)
  if (!/^whsec_[A-Za-z0-9+/=]{16,}$/.test(secret) || !id || !/^\d{1,12}$/.test(ts) || !sigs.length) return false
  if (Math.abs(nowSeconds - Number(ts)) > 300) return false
  let key: Uint8Array
  try {
    key = Uint8Array.from(atob(secret.slice(6)), (c) => c.charCodeAt(0))
  } catch {
    return false
  }
  const k = await crypto.subtle.importKey('raw', key, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const mac = b64(new Uint8Array(await crypto.subtle.sign('HMAC', k, new TextEncoder().encode(`${id}.${ts}.${body}`))))
  return sigs.some((sig) => sig.length === mac.length && [...sig].reduce((d, ch, i) => d | (ch.charCodeAt(0) ^ mac.charCodeAt(i)), 0) === 0)
}

export async function handleBridge(req: BridgeRequest, deps: BridgeDeps): Promise<BridgeReply> {
  if (req.method !== 'POST') return r(405, { error: 'method_not_allowed' })
  if (!deps.configured) return r(503, { error: 'not_configured' })
  const action = req.path.replace(/\/+$/, '').split('/').pop()
  // The email provider's delivery events: signed, not a member request.
  if (action === 'delivery-event') {
    if (!(await verifyWebhook(deps.webhookSecret, req.headers ?? {}, req.body ?? ''))) return r(401, { error: 'bad_signature' })
    let ev: { type?: unknown; created_at?: unknown; data?: { email_id?: unknown } }
    try {
      ev = JSON.parse(req.body ?? '')
    } catch {
      return r(400, { error: 'invalid' })
    }
    if (typeof ev.type !== 'string' || !DELIVERY_EVENTS.includes(ev.type)) return r(200, { status: 'ignored' })
    const at = typeof ev.created_at === 'string' && !Number.isNaN(Date.parse(ev.created_at)) ? ev.created_at : null
    const emailId = typeof ev.data?.email_id === 'string' ? ev.data.email_id : ''
    if (!at || !/^[A-Za-z0-9_-]{1,100}$/.test(emailId)) return r(400, { error: 'invalid' })
    const out = await deps.serviceRpc('svc_invitation_delivery_event', { p_provider_id: emailId, p_event: ev.type, p_at: at })
    if (!out.ok) return r(500, { error: 'failed' })
    return r(200, { status: out.data === true ? 'recorded' : 'ignored' })
  }
  const token = /^Bearer (.+)$/.exec(req.authorization ?? '')?.[1] ?? ''
  if (!token || !(await deps.verifyUser(token))) return r(401, { error: 'not_signed_in' })
  // The database decides: only the founder gets past this.
  const founder = await deps.userRpc(token, 'app_founder_waitlist_overview', {})
  if (!founder.ok) return r(founder.code === 'not_founder' ? 403 : founder.status === 401 ? 401 : 403, { error: founder.code === 'not_founder' ? 'not_founder' : 'not_allowed' })
  try {
    if (action === 'import') {
      const { summary } = await sync(deps)
      const exported = await handoff(deps, { action: 'export', limit: 200 })
      const rows = Array.isArray(exported.applicants) ? (exported.applicants as Array<Record<string, unknown>>) : []
      const stored = rows.length ? ((await svc(deps, 'svc_waitlist_import', { p_rows: rows })) as Record<string, unknown>) : { imported: 0, skipped: 0 }
      // Confirm what was stored or deliberately skipped; anything unconfirmed is offered again in an hour.
      if (rows.length) await handoff(deps, { action: 'confirm', ids: rows.map((x) => String(x.waitlist_id)) })
      return r(200, { status: 'imported', ...summary, imported: Number(stored.imported ?? 0), skipped: Number(stored.skipped ?? 0) })
    }
    if (action === 'send') {
      const { pending, summary } = await sync(deps)
      if (pending.may_send !== true) return r(200, { status: 'closed', ...summary, sent: 0 })
      if (!deps.emailReady) return r(200, { status: 'email_not_configured', ...summary, sent: 0 })
      const approved = arr(pending.approved)
      let notConfirmed = 0
      let sent = 0
      let failed = 0
      let already = 0
      let outcomesPending = 0
      if (approved.length) {
        const eligible = arr((await handoff(deps, { action: 'recheck', ids: approved })).eligible)
        const gone = approved.filter((id) => !eligible.includes(id))
        if (gone.length) notConfirmed = (await svc(deps, 'svc_waitlist_not_confirmed', { p_ids: gone })) as number
        for (const id of eligible) {
          const inv = (await svc(deps, 'svc_invitation_create', { p_waitlist_id: id })) as Record<string, unknown>
          if (inv.status !== 'created') {
            already++
            continue
          }
          if (await deliver(deps, inv)) sent++
          else failed++
          if (!(await recordInvited(deps, id))) outcomesPending++
        }
      }
      let retried = 0
      for (const x of ((await svc(deps, 'svc_invitation_retry_list', {})) as Array<Record<string, unknown>>) ?? []) {
        if (await deliver(deps, x)) retried++
      }
      return r(200, { status: 'sent', ...summary, sent, failed, retried, not_confirmed: notConfirmed, already_invited: already, outcomes_pending: outcomesPending })
    }
    if (action === 'replace') {
      let invitation = ''
      try {
        const b = JSON.parse(req.body ?? '{}') as { invitation_id?: unknown }
        invitation = typeof b.invitation_id === 'string' ? b.invitation_id : ''
      } catch {
        invitation = ''
      }
      if (!/^[0-9a-f-]{36}$/.test(invitation)) return r(400, { error: 'invalid_invitation' })
      if (!deps.emailReady) return r(200, { status: 'email_not_configured' })
      const check = await deps.serviceRpc('svc_invitation_replace_check', { p_invitation: invitation })
      if (!check.ok) {
        const known = ['not_found', 'already_accepted', 'already_replaced', 'still_open', 'invitations_closed']
        return r(409, { error: known.includes(check.code) ? check.code : 'not_replaceable' })
      }
      const wid = String((check.data as Record<string, unknown>).waitlist_id)
      const eligible = arr((await handoff(deps, { action: 'recheck', ids: [wid], replacement: true })).eligible)
      if (!eligible.includes(wid)) return r(200, { status: 'not_eligible' })
      const inv = (await svc(deps, 'svc_invitation_replace', { p_invitation: invitation })) as Record<string, unknown>
      const ok = await deliver(deps, inv)
      return r(200, { status: 'replaced', sent: ok ? 1 : 0, failed: ok ? 0 : 1 })
    }
    if (action === 'forget-email') {
      let email = ''
      try {
        const b = JSON.parse(req.body ?? '{}') as { email?: unknown }
        email = typeof b.email === 'string' ? b.email.trim().toLowerCase() : ''
      } catch {
        email = ''
      }
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) || email.length > 254) return r(400, { error: 'invalid_email' })
      const here = (await svc(deps, 'svc_waitlist_forget_address', { p_email: email })) as number
      const there = Number((await handoff(deps, { action: 'forget_email', email })).deleted ?? 0)
      return r(200, { status: 'deleted', removed_here: here, waitlist_deleted: there })
    }
    return r(404, { error: 'not_found' })
  } catch (e) {
    if (e instanceof Unreachable) return r(502, { error: 'waitlist_unreachable' })
    return r(500, { error: 'failed' })
  }
}
