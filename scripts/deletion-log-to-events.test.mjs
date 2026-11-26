import { test } from 'node:test'
import assert from 'node:assert/strict'
import { eventsFromLog } from './db/recovery/deletion-log-to-events.mjs'

const line = (id, kind, change, t = '00000000-0000-4000-8000-000000000001') =>
  JSON.stringify({ fn: 'post-media', event: 'deletion_register', id, kind, target_id: t, change, occurred_at: '2026-11-26T12:00:00Z' })

test('reads raw log lines, a CSV export and a JSON export, de-duplicated and in order', () => {
  const raw = [line(2, 'post', 'deleted'), 'other output', line(1, 'account', 'deleted'), line(2, 'post', 'deleted')].join('\n')
  assert.deepEqual(eventsFromLog(raw).map((e) => e.id), [1, 2])
  const csv = `timestamp,event_message\n2026-11-26,"${line(3, 'comment', 'restored').replace(/"/g, '""')}"`
  assert.deepEqual(eventsFromLog(csv).map((e) => [e.id, e.kind, e.change]), [[3, 'comment', 'restored']])
  const json = JSON.stringify([{ event_message: line(4, 'post', 'deleted') }])
  assert.deepEqual(eventsFromLog(json).map((e) => e.id), [4])
})

test('ignores anything malformed or of another kind', () => {
  const text = [line(5, 'profile', 'deleted'), line(6, 'post', 'erased'), line(7, 'post', 'deleted', 'nope'), '{"fn":"post-media","event":"drain_failures"}'].join('\n')
  assert.deepEqual(eventsFromLog(text), [])
})
