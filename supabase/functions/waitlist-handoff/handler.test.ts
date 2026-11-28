import { describe, expect, it, vi } from 'vitest'
import { handleHandoff, sameKey, type HandoffDeps } from './handler'

const KEY = 'k'.repeat(40)
const ID = '00000000-0000-4000-8000-000000000001'
const deps = (over: Partial<HandoffDeps> = {}): HandoffDeps => ({
  enabled: true,
  key: KEY,
  exportRows: async () => [{ waitlist_id: ID, email: 'maya@example.com', groups: [] }],
  confirm: async () => 1,
  recheck: async () => [ID],
  record: async () => true,
  withdrawals: async () => [{ waitlist_id: ID, withdrawn_at: '2026-11-28T00:00:00Z' }],
  forget: async () => 1,
  forgetEmail: async () => 1,
  ...over,
})
const req = (body: unknown, over: Record<string, unknown> = {}) => ({
  method: 'POST', origin: null, authorization: `Bearer ${KEY}`, contentType: 'application/json', body: JSON.stringify(body), ...over,
}) as Parameters<typeof handleHandoff>[0]
const call = async (body: unknown, d = deps(), over = {}) => {
  const out = await handleHandoff(req(body, over), d)
  return { status: out.status, data: JSON.parse(out.body) }
}

describe('waitlist-handoff (BL-009)', () => {
  it('refuses browsers, missing or wrong keys, and runs closed without its login or key', async () => {
    expect((await call({ action: 'export', limit: 5 }, deps(), { origin: 'https://www.splitpost.ca' })).status).toBe(403)
    expect((await call({ action: 'export', limit: 5 }, deps(), { authorization: null })).status).toBe(401)
    expect((await call({ action: 'export', limit: 5 }, deps(), { authorization: `Bearer ${KEY}x` })).status).toBe(401)
    expect((await call({ action: 'export', limit: 5 }, deps({ enabled: false }))).status).toBe(503)
    expect((await call({ action: 'export', limit: 5 }, deps({ key: 'short' }))).status).toBe(503)
    expect((await call({ action: 'export', limit: 5 }, deps(), { method: 'GET' })).status).toBe(405)
  })
  it('exports within the limit and passes on only the expected applicant fields', async () => {
    const exportRows = vi.fn(async () => [{ waitlist_id: ID, email: 'maya@example.com', groups: ['supporter'] }])
    expect(await call({ action: 'export', limit: 200 }, deps({ exportRows }))).toEqual({ status: 200, data: { applicants: [{ waitlist_id: ID, email: 'maya@example.com', groups: ['supporter'] }] } })
    expect((await call({ action: 'export', limit: 501 })).status).toBe(400)
    expect((await call({ action: 'export', limit: 5 }, deps({ exportRows: async () => [{ waitlist_id: ID, email: 'x@y.z', interests: ['a'] }] }))).status).toBe(500)
  })
  it('rechecks, records, reads withdrawals and forgets, validating every id', async () => {
    expect(await call({ action: 'recheck', ids: [ID] })).toEqual({ status: 200, data: { eligible: [ID] } })
    expect((await call({ action: 'recheck', ids: ['not-a-uuid'] })).status).toBe(400)
    const recheck = vi.fn(async () => [ID])
    await call({ action: 'recheck', ids: [ID], replacement: true }, deps({ recheck }))
    expect(recheck).toHaveBeenCalledWith([ID], true)
    expect(await call({ action: 'confirm', ids: [ID] })).toEqual({ status: 200, data: { confirmed: 1 } })
    expect(await call({ action: 'record', id: ID, outcome: 'invited' })).toEqual({ status: 200, data: { recorded: true } })
    expect((await call({ action: 'record', id: ID, outcome: 'shortlisted' })).status).toBe(400)
    expect((await call({ action: 'withdrawals', since: null })).data.withdrawals).toHaveLength(1)
    expect((await call({ action: 'withdrawals', since: 'yesterday' })).status).toBe(400)
    expect(await call({ action: 'forget', ids: [ID] })).toEqual({ status: 200, data: { deleted: 1 } })
    expect(await call({ action: 'forget_email', email: ' Maya@Example.com ' })).toEqual({ status: 200, data: { deleted: 1 } })
    expect((await call({ action: 'forget_email', email: 'not an address' })).status).toBe(400)
    expect((await call({ action: 'drop' })).status).toBe(400)
  })
  it('never passes on an unexpected database answer', async () => {
    expect((await call({ action: 'withdrawals', since: null }, deps({ withdrawals: async () => [{ waitlist_id: ID, email: 'x@y.z' }] }))).status).toBe(500)
    expect((await call({ action: 'recheck', ids: [ID] }, deps({ recheck: async () => { throw new Error('db') } }))).status).toBe(500)
  })
  it('compares keys without stopping at the first difference', () => {
    expect(sameKey('abc', 'abc')).toBe(true)
    expect(sameKey('abc', 'abd')).toBe(false)
    expect(sameKey('abc', 'abcd')).toBe(false)
  })
})
