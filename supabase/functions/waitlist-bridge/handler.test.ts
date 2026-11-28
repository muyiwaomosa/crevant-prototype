import { describe, expect, it, vi } from 'vitest'
import { handleBridge, type BridgeDeps, type RpcResult } from './handler'
import { invitationMail } from './invitation'
import { bridgeTargets, MEMBER_APP_ORIGIN, STAGING_APP_ORIGIN } from '../_shared/policy'

const A = '00000000-0000-4000-8000-0000000000a1'
const B = '00000000-0000-4000-8000-0000000000b2'

function world(over: { pending?: Record<string, unknown>; eligible?: string[]; founder?: RpcResult; send?: BridgeDeps['sendEmail']; emailReady?: boolean; handoffDown?: boolean } = {}) {
  const calls: string[] = []
  const handoffCalls: Array<Record<string, unknown>> = []
  const pending = { withdrawals_since: '-infinity', forget: [], declined: [], approved: [A, B], may_send: true, ...over.pending }
  const serviceRpc = vi.fn(async (fn: string, body: Record<string, unknown>): Promise<RpcResult> => {
    calls.push(fn)
    switch (fn) {
      case 'svc_waitlist_bridge_pending': return { ok: true, data: pending }
      case 'svc_waitlist_import': return { ok: true, data: { imported: (body.p_rows as unknown[]).length, skipped: 0 } }
      case 'svc_invitation_create': return { ok: true, data: { status: 'created', invitation_id: 'inv-' + String(body.p_waitlist_id).slice(-2), email: 'a@example.com', code: '0123456789abcdef' } }
      case 'svc_invitation_retry_list': return { ok: true, data: [] }
      default: return { ok: true, data: 1 }
    }
  })
  const deps: BridgeDeps = {
    configured: true,
    verifyUser: async (t) => t === 'founder-token' || t === 'member-token',
    userRpc: async (t) => over.founder ?? (t === 'founder-token' ? { ok: true, data: {} } : { ok: false, status: 400, code: 'not_founder' }),
    serviceRpc,
    handoff: vi.fn(async (body: Record<string, unknown>) => {
      handoffCalls.push(body)
      if (over.handoffDown) return { ok: false as const }
      switch (body.action) {
        case 'withdrawals': return { ok: true as const, data: { withdrawals: [] } }
        case 'export': return { ok: true as const, data: { applicants: [{ waitlist_id: A, email: 'a@example.com' }] } }
        case 'recheck': return { ok: true as const, data: { eligible: over.eligible ?? [A, B] } }
        case 'forget': return { ok: true as const, data: { deleted: (body.ids as unknown[]).length } }
        case 'forget_email': return { ok: true as const, data: { deleted: 1 } }
        default: return { ok: true as const, data: { recorded: true } }
      }
    }),
    sendEmail: over.send ?? vi.fn(async () => ({ ok: true as const, id: 'msg_1' })),
    appOrigin: 'https://app.splitpost.ca',
    emailReady: over.emailReady ?? true,
  }
  return { deps, calls, handoffCalls }
}
const run = (deps: BridgeDeps, path: string, token = 'founder-token') => handleBridge({ method: 'POST', path: `/waitlist-bridge/${path}`, authorization: `Bearer ${token}` }, deps)

describe('waitlist-bridge (BL-009)', () => {
  it('only the signed-in founder gets past the door, and the database decides who that is', async () => {
    const w = world()
    expect((await run(w.deps, 'import', 'member-token')).status).toBe(403)
    expect((await run(w.deps, 'import', 'nobody')).status).toBe(401)
    expect(w.calls).toEqual([])
    expect((await run({ ...w.deps, configured: false }, 'import')).status).toBe(503)
  })
  it('import carries withdrawals first, then copies the exported applicants', async () => {
    const w = world()
    const out = await run(w.deps, 'import')
    expect(out).toMatchObject({ status: 200, data: { status: 'imported', imported: 1 } })
    expect(w.handoffCalls.map((c) => c.action)).toEqual(['withdrawals', 'export'])
    expect(w.handoffCalls[0]).toEqual({ action: 'withdrawals', since: null })
  })
  it('carries deletion requests and declines to the waitlist before anything else', async () => {
    const w = world({ pending: { forget: [B], declined: [A], approved: [] } })
    await run(w.deps, 'import')
    expect(w.handoffCalls.map((c) => c.action)).toEqual(['withdrawals', 'forget', 'record', 'export'])
    expect(w.handoffCalls[2]).toEqual({ action: 'record', id: A, outcome: 'declined' })
    expect(w.calls).toContain('svc_waitlist_forget_done')
    expect(w.calls).toContain('svc_waitlist_declined_done')
  })
  it('sends nothing while invitations may not be sent (external access closed), or without an email key', async () => {
    for (const w of [world({ pending: { may_send: false } }), world({ emailReady: false })]) {
      const out = await run(w.deps, 'send')
      expect(out.data.sent).toBe(0)
      expect(w.calls).not.toContain('svc_invitation_create')
      expect(w.deps.sendEmail).not.toHaveBeenCalled()
    }
    expect((await run(world({ pending: { may_send: false } }).deps, 'send')).data.status).toBe('closed')
  })
  it('rechecks with the waitlist; only confirmed applicants are invited, the rest dropped', async () => {
    const w = world({ eligible: [A] })
    const out = await run(w.deps, 'send')
    expect(out.data).toMatchObject({ status: 'sent', sent: 1, not_confirmed: 1 })
    expect(w.calls.filter((c) => c === 'svc_invitation_create')).toHaveLength(1)
    expect(w.calls).toContain('svc_waitlist_not_confirmed')
    expect(w.handoffCalls).toContainEqual({ action: 'record', id: A, outcome: 'invited' })
    expect(w.handoffCalls).not.toContainEqual({ action: 'record', id: B, outcome: 'invited' })
  })
  it('records a failed email with a fixed code, so it is retried', async () => {
    const w = world({ eligible: [A], send: vi.fn(async () => ({ ok: false as const, error: 'provider_unavailable' as const })) })
    const out = await run(w.deps, 'send')
    expect(out.data).toMatchObject({ sent: 0, failed: 1 })
    const delivery = (w.deps.serviceRpc as ReturnType<typeof vi.fn>).mock.calls.find((c) => c[0] === 'svc_invitation_delivery')
    expect(delivery?.[1]).toMatchObject({ p_status: 'failed', p_error: 'provider_unavailable', p_provider_id: null })
  })
  it('carries a deletion request by address here and to the waitlist', async () => {
    const w = world()
    const out = await handleBridge({ method: 'POST', path: '/waitlist-bridge/forget-email', authorization: 'Bearer founder-token', body: JSON.stringify({ email: ' Ava@Example.com ' }) }, w.deps)
    expect(out).toEqual({ status: 200, data: { status: 'deleted', removed_here: 1, waitlist_deleted: 1 } })
    expect(w.handoffCalls).toContainEqual({ action: 'forget_email', email: 'ava@example.com' })
    expect((await handleBridge({ method: 'POST', path: '/waitlist-bridge/forget-email', authorization: 'Bearer founder-token', body: '{"email":"nope"}' }, w.deps)).status).toBe(400)
    expect((await handleBridge({ method: 'POST', path: '/waitlist-bridge/forget-email', authorization: 'Bearer member-token', body: '{"email":"a@b.co"}' }, w.deps)).status).toBe(403)
  })
  it('stops, sending nothing, when the waitlist cannot be reached', async () => {
    const w = world({ handoffDown: true })
    expect(await run(w.deps, 'send')).toEqual({ status: 502, data: { error: 'waitlist_unreachable' } })
    expect(w.deps.sendEmail).not.toHaveBeenCalled()
  })
})

describe('the invitation email and where it points', () => {
  it('is a personal, single-use registration link that expires in 14 days', () => {
    const m = invitationMail('a@example.com', 'https://app.splitpost.ca', '0123456789abcdef')
    expect(m.text).toContain('https://app.splitpost.ca/register/0123456789abcdef')
    expect(m.text).toMatch(/works once, and expires in 14 days/)
    expect(m.text).toMatch(/simulated: no money is paid/)
    expect(m.text).toMatch(/Splitpost, Ontario, Canada/)
  })
  it('reaches the waitlist project from member Production, and the same project on staging', () => {
    const refs = { staging: 'kpudeppgokpjhvaqrprn', waitlist: 'hmrliwoychnqrbbydorg', member: 'brfdqkondnnzsguailcc' }
    expect(bridgeTargets('member-production', 'https://brfdqkondnnzsguailcc.supabase.co', refs)).toEqual({
      handoffUrl: 'https://hmrliwoychnqrbbydorg.supabase.co/functions/v1/waitlist-handoff', appOrigin: MEMBER_APP_ORIGIN })
    expect(bridgeTargets('staging', 'https://kpudeppgokpjhvaqrprn.supabase.co', refs)).toEqual({
      handoffUrl: 'https://kpudeppgokpjhvaqrprn.supabase.co/functions/v1/waitlist-handoff', appOrigin: STAGING_APP_ORIGIN })
    expect(bridgeTargets(null, 'https://hmrliwoychnqrbbydorg.supabase.co', refs)).toBeNull()
  })
})
