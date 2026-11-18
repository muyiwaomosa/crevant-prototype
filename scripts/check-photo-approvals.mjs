#!/usr/bin/env node
// Runs in every public site build (scripts/build.mjs). Fails a Vercel
// Production build while any photograph shown on the public site is still
// pending the founder's approval (src/public/landing/photo-approvals.json).
// Previews and local builds only report the pending photos, so they can be
// reviewed. The founder's rule (2026-11-18): any unverified photograph must
// remain pending approval and must not be published to production.
//
// Tests never edit the real registry. A test build may point
// CREVANT_PHOTO_APPROVALS_FIXTURE at a file in scripts/e2e/fixtures/, and only
// outside Vercel: on Vercel (VERCEL=1) any fixture fails the build, so it can
// never stand in for the founder's approval in a real deployment.

import { readFileSync } from 'node:fs'
import { dirname, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const REGISTRY = resolve(ROOT, 'src/public/landing/photo-approvals.json')
const FIXTURES = resolve(ROOT, 'scripts/e2e/fixtures')

/** Which approval list a build uses: the real registry, or (tests only, never on Vercel) a fixture. */
export function approvalsSource(env) {
  const fixture = typeof env.CREVANT_PHOTO_APPROVALS_FIXTURE === 'string' ? env.CREVANT_PHOTO_APPROVALS_FIXTURE.trim() : ''
  if (!fixture) return { ok: true, path: REGISTRY, fixture: false }
  if ((env.VERCEL || '').trim() === '1') return { ok: false, message: 'A photo approval fixture was set on Vercel. Real deployments use only the founder-approved registry.' }
  const path = resolve(ROOT, fixture)
  const rel = relative(FIXTURES, path)
  if (rel.startsWith('..') || rel.includes(`..${sep}`) || resolve(FIXTURES, rel) !== path) return { ok: false, message: `Photo approval fixtures must live in scripts/e2e/fixtures/ (got ${fixture}).` }
  return { ok: true, path, fixture: true }
}

export function checkPhotoApprovals(env, list) {
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

/** The whole check, as the build runs it. */
export function runPhotoApprovalCheck(env) {
  const source = approvalsSource(env)
  if (!source.ok) return source
  const result = checkPhotoApprovals(env, JSON.parse(readFileSync(source.path, 'utf8')))
  return source.fixture && result.ok ? { ...result, message: `${result.message} (test fixture: ${relative(ROOT, source.path)})` } : result
}

const isMain = import.meta.url === `file://${process.argv[1]}`
if (isMain) {
  const result = runPhotoApprovalCheck(process.env)
  if (!result.ok) {
    console.error(`\n✖ ${result.message}\n`)
    process.exit(1)
  }
  console.log(result.message)
}
