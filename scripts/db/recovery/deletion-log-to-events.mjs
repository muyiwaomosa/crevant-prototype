#!/usr/bin/env node
// Turns the post-media function's log into the events ops.reapply_deletions
// takes (docs/RECOVERY.md, "Deletions after a backup").
//
//   node scripts/db/recovery/deletion-log-to-events.mjs <exported log file> > events.json
//
// The input is whatever the Supabase Logs explorer exports for the post-media
// function (CSV or JSON), or a raw function log: every line written by the
// drain's deletion report looks like
//   {"fn":"post-media","event":"deletion_register","id":12,"kind":"account","target_id":"...","change":"deleted","occurred_at":"..."}
// possibly quoted inside a CSV cell. Lines are de-duplicated by id (a row is
// logged again if marking it failed) and sorted by id. Ids and times only.
import { readFileSync } from 'node:fs'

export function eventsFromLog(text) {
  const plain = text.replace(/\\"/g, '"').replace(/""/g, '"')
  const byId = new Map()
  for (const m of plain.matchAll(/\{"fn":"post-media","event":"deletion_register"[^{}]*\}/g)) {
    let e
    try {
      e = JSON.parse(m[0])
    } catch {
      continue
    }
    if (typeof e.id !== 'number' || !['account', 'post', 'comment'].includes(e.kind) || !['deleted', 'restored'].includes(e.change)
        || typeof e.target_id !== 'string' || !/^[0-9a-f-]{36}$/.test(e.target_id) || Number.isNaN(Date.parse(e.occurred_at))) continue
    byId.set(e.id, { id: e.id, kind: e.kind, target_id: e.target_id, change: e.change, occurred_at: e.occurred_at })
  }
  return [...byId.values()].sort((a, b) => a.id - b.id)
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const file = process.argv[2]
  if (!file) {
    console.error('usage: node scripts/db/recovery/deletion-log-to-events.mjs <exported log file>')
    process.exit(2)
  }
  process.stdout.write(JSON.stringify(eventsFromLog(readFileSync(file, 'utf8'))) + '\n')
}
