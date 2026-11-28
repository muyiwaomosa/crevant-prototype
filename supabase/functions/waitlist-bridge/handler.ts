// The waitlist-bridge function's request handling (BL-009, founder decision D1
// option A), kept free of Deno imports so it can be unit tested.
//
// Control Center calls it as the signed-in founder:
//   POST /waitlist-bridge/import  carry withdrawals and deletions, record
//                                 declines, then copy newly verified,
//                                 consenting applicants for review
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
}

export interface BridgeRequest {
  method: string
  path: string
  authorization: string | null
  /** The JSON body (forget-email only). */
  body?: string
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

/** Withdrawals, deletions and declines, carried before anything else. */
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
  return { pending, summary: { withdrawn: withdrawals.length, invitations_removed: removed, deleted, declined: declined.length } }
}

export async function handleBridge(req: BridgeRequest, deps: BridgeDeps): Promise<BridgeReply> {
  if (req.method !== 'POST') return r(405, { error: 'method_not_allowed' })
  if (!deps.configured) return r(503, { error: 'not_configured' })
  const token = /^Bearer (.+)$/.exec(req.authorization ?? '')?.[1] ?? ''
  if (!token || !(await deps.verifyUser(token))) return r(401, { error: 'not_signed_in' })
  // The database decides: only the founder gets past this.
  const founder = await deps.userRpc(token, 'app_founder_waitlist_overview', {})
  if (!founder.ok) return r(founder.code === 'not_founder' ? 403 : founder.status === 401 ? 401 : 403, { error: founder.code === 'not_founder' ? 'not_founder' : 'not_allowed' })
  const action = req.path.replace(/\/+$/, '').split('/').pop()
  try {
    if (action === 'import') {
      const { summary } = await sync(deps)
      const exported = await handoff(deps, { action: 'export', limit: 200 })
      const rows = Array.isArray(exported.applicants) ? exported.applicants : []
      const stored = rows.length ? ((await svc(deps, 'svc_waitlist_import', { p_rows: rows })) as Record<string, unknown>) : { imported: 0, skipped: 0 }
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
          // Recorded on the waitlist as soon as the invitation exists; a failed email is retried below and next time.
          await handoff(deps, { action: 'record', id, outcome: 'invited' })
          const result = await deps.sendEmail(invitationMail(String(inv.email), deps.appOrigin, String(inv.code)))
          await svc(deps, 'svc_invitation_delivery', {
            p_invitation: inv.invitation_id, p_status: result.ok ? 'sent' : 'failed', p_provider_id: result.ok ? result.id : null, p_error: result.ok ? null : result.error,
          })
          if (result.ok) sent++
          else failed++
        }
      }
      let retried = 0
      for (const x of ((await svc(deps, 'svc_invitation_retry_list', {})) as Array<Record<string, unknown>>) ?? []) {
        const result = await deps.sendEmail(invitationMail(String(x.email), deps.appOrigin, String(x.code)))
        await svc(deps, 'svc_invitation_delivery', {
          p_invitation: x.invitation_id, p_status: result.ok ? 'sent' : 'failed', p_provider_id: result.ok ? result.id : null, p_error: result.ok ? null : result.error,
        })
        if (result.ok) retried++
      }
      return r(200, { status: 'sent', ...summary, sent, failed, retried, not_confirmed: notConfirmed, already_invited: already })
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
