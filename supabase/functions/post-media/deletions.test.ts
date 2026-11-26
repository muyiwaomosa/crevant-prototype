// Unit tests for the deletion register report (20261216000000, docs/RECOVERY.md).
import { describe, expect, it } from 'vitest'
import { reportDeletions, type Deps, type RpcResult } from './handler.ts'

function fakeDeps(unreported: RpcResult, markResult: RpcResult = { ok: true, data: 1 }) {
  const logs: Array<{ event: string; detail: Record<string, unknown> }> = []
  const calls: Array<{ fn: string; body: Record<string, unknown> }> = []
  const deps = {
    log: (event: string, detail: Record<string, unknown> = {}) => void logs.push({ event, detail }),
    serviceRpc: async (fn: string, body: Record<string, unknown>) => {
      calls.push({ fn, body })
      return fn === 'svc_deletion_register_unreported' ? unreported : markResult
    },
  } as unknown as Deps
  return { deps, logs, calls }
}

const row = (id: number, kind: string, event: string) => ({
  id, kind, event, target_id: `00000000-0000-4000-8000-${String(id).padStart(12, '0')}`, occurred_at: '2026-11-26T12:00:00Z',
})

describe('the deletion register is written to the function log, outside the database', () => {
  it('logs each completed deletion or restore with ids and times only, then marks exactly those reported', async () => {
    const { deps, logs, calls } = fakeDeps({ ok: true, data: [row(1, 'account', 'deleted'), row(2, 'post', 'deleted'), row(3, 'post', 'restored')] })
    expect(await reportDeletions(deps, 'scheduled')).toBe(3)
    const lines = logs.filter((l) => l.event === 'deletion_register')
    expect(lines.map((l) => [l.detail.kind, l.detail.change])).toEqual([['account', 'deleted'], ['post', 'deleted'], ['post', 'restored']])
    for (const l of lines) expect(Object.keys(l.detail).sort()).toEqual(['change', 'id', 'kind', 'occurred_at', 'target_id'])
    expect(calls.at(-1)).toEqual({ fn: 'svc_deletion_register_reported', body: { p_ids: [1, 2, 3] } })
  })

  it('never logs a malformed row and never marks it reported', async () => {
    const bad = [{ ...row(4, 'account', 'deleted'), target_id: 'not-a-uuid' }, { ...row(5, 'profile', 'deleted') }, row(6, 'comment', 'deleted')]
    const { deps, logs, calls } = fakeDeps({ ok: true, data: bad })
    expect(await reportDeletions(deps, 'scheduled')).toBe(1)
    expect(logs.filter((l) => l.event === 'deletion_register').map((l) => l.detail.id)).toEqual([6])
    expect(calls.at(-1)?.body).toEqual({ p_ids: [6] })
  })

  it('before the migration (function missing) it reports nothing and logs no failure; other read failures are logged', async () => {
    const missing = fakeDeps({ ok: false, status: 404, code: 'not found' })
    expect(await reportDeletions(missing.deps, 'scheduled')).toBe(0)
    expect(missing.logs).toEqual([])
    const broken = fakeDeps({ ok: false, status: 503, code: 'unavailable' })
    expect(await reportDeletions(broken.deps, 'scheduled')).toBe(0)
    expect(broken.logs.map((l) => l.event)).toEqual(['deletion_register_read_failed'])
  })

  it('if marking fails, the rows stay unreported (logged again next pass) and the failure is logged', async () => {
    const { deps, logs } = fakeDeps({ ok: true, data: [row(7, 'post', 'deleted')] }, { ok: false, status: 503, code: 'unavailable' })
    expect(await reportDeletions(deps, 'scheduled')).toBe(1)
    expect(logs.map((l) => l.event)).toEqual(['deletion_register', 'deletion_register_mark_failed'])
  })
})
