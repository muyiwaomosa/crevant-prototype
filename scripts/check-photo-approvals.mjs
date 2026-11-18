#!/usr/bin/env node
// Runs in every public site build (scripts/build.mjs). Fails a Vercel
// Production build while any photograph shown on the public site is still
// pending the founder's approval (src/public/landing/photo-approvals.json).
// Previews and local builds only report the pending photos, so they can be
// reviewed. The founder's rule (2026-11-18): any unverified photograph must
// remain pending approval and must not be published to production.

import { readFileSync } from 'node:fs'

const approvals = JSON.parse(readFileSync(new URL('../src/public/landing/photo-approvals.json', import.meta.url), 'utf8'))

export function checkPhotoApprovals(env, list = approvals) {
  const production = (typeof env.VERCEL_ENV === 'string' ? env.VERCEL_ENV.trim().toLowerCase() : '') === 'production'
  const entries = Object.entries(list.photos ?? {})
  const bad = entries.filter(([, status]) => status !== 'pending' && status !== 'approved')
  if (bad.length) return { ok: false, message: `Unknown photo approval status: ${bad.map(([id, s]) => `${id}=${s}`).join(', ')}` }
  const pending = entries.filter(([, status]) => status !== 'approved').map(([id]) => id)
  if (production && pending.length) {
    return { ok: false, message: `Photos pending the founder's approval can't be published to production: ${pending.join(', ')}.` }
  }
  return { ok: true, message: pending.length ? `Photo approvals: ${pending.length} pending (allowed outside production): ${pending.join(', ')}.` : 'Photo approvals: every photo approved.' }
}

const isMain = import.meta.url === `file://${process.argv[1]}`
if (isMain) {
  const result = checkPhotoApprovals(process.env)
  if (!result.ok) {
    console.error(`\n✖ ${result.message}\n`)
    process.exit(1)
  }
  console.log(result.message)
}
