#!/usr/bin/env node
// Independent verification of a deployed Edge Function (Phase 1B-2), run by
// .github/workflows/verify-functions.yml with no secrets, against the public
// function URL only. It checks, separately:
//   CORS        the approved origin gets exactly itself back; every other
//               origin gets NO Access-Control-Allow-Origin, -Credentials,
//               -Methods or -Headers (never a wildcard), on preflight and POST
//   auth        every route refuses a request with no session (401), with a
//               malformed bearer token (401), from the approved origin too
//               (CORS grants nothing); the drain refuses without its key; GET
//               is refused (405); a 503 (refusing to run) fails the check
//   build       every response carries X-Splitpost-Build equal to
//               "<expected commit>.<digest of that commit's source>", computed
//               here from the commit itself, and X-Content-Type-Options: nosniff
//   absence     member Production: join-waitlist is not deployed (404), and
//               post-media is not deployed unless approved (404)
// Membership authorization (a signed-in non-member is refused) needs real
// accounts, so it is tested on local Supabase (e2e/functions-policy.e2e.cjs)
// and by the existing avatar and post-media edge suites, not here.
//
//   node scripts/functions/verify.mjs --target <staging|member-production> --function <avatar|post-media|join-waitlist>
//        --mode <deployed|removed> --commit <sha> --source-root <export of that commit>
// Test only (local addresses): --base-url http://127.0.0.1:<port> --config-root <dir> --skip-absence
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { memberProductionProblems } from '../supabase-projects.mjs'
import { sourceDigest } from './source-digest.mjs'

export const ROUTES = {
  avatar: ['upload', 'remove', 'urls', 'cleanup'],
  'post-media': ['photo', 'links', 'cleanup', 'mod-photo', 'mod-drain', 'check', 'drain'],
}
const PREVIEW = 'https://splitpost-app-git-main-crevant.vercel.app'
const MEMBER_APP = 'https://app.splitpost.ca'
const COMMON_DISALLOWED = [
  'https://splitpost.ca', 'https://www.splitpost.ca', 'https://crevant-prototype.vercel.app', 'https://evil.example', 'null',
  'https://app.splitpost.ca.evil.example', 'http://app.splitpost.ca', 'https://splitpost-app-x-crevant.vercel.app.evil.example',
  'http://127.0.0.1:4176', 'http://localhost:5173',
]
export function originsFor(target) {
  if (target === 'staging') return { approved: PREVIEW, disallowed: [...COMMON_DISALLOWED, MEMBER_APP] }
  return { approved: MEMBER_APP, disallowed: [...COMMON_DISALLOWED, PREVIEW] }
}
const CORS_HEADERS = ['access-control-allow-origin', 'access-control-allow-credentials', 'access-control-allow-methods', 'access-control-allow-headers']

function parse(argv) {
  const o = {}
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i]
    if (k === '--skip-absence') { o.skipAbsence = true; continue }
    if (!['--target', '--function', '--mode', '--commit', '--source-root', '--base-url', '--config-root'].includes(k)) throw new Error(`unknown option ${k}`)
    o[k.slice(2)] = argv[++i]
  }
  return o
}

export async function verify(o, fetchImpl = fetch) {
  const failures = []
  const passes = []
  const check = (ok, area, what) => (ok ? passes : failures).push(`${area}: ${what}`)
  const testMode = o['base-url'] !== undefined || o['config-root'] !== undefined || o.skipAbsence
  if (testMode && !/^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(o['base-url'] ?? '')) throw new Error('--base-url, --config-root and --skip-absence are for local tests only (a local --base-url is required)')
  if (!['staging', 'member-production'].includes(o.target)) throw new Error('--target must be staging or member-production')
  if (!['deployed', 'removed'].includes(o.mode)) throw new Error('--mode must be deployed or removed')
  const fns = o.mode === 'removed' ? ['avatar', 'post-media', 'join-waitlist'] : ['avatar', 'post-media']
  if (!fns.includes(o.function)) throw new Error(`--function must be one of ${fns.join(', ')} in ${o.mode} mode`)
  if (o.function === 'join-waitlist' && o.target !== 'member-production') throw new Error('join-waitlist is verified absent on member Production only')
  if (!/^[0-9a-f]{40}$/.test(o.commit ?? '')) throw new Error('--commit must be a full 40 character SHA')

  const configRoot = o['config-root'] ?? '.'
  const projects = JSON.parse(readFileSync(join(configRoot, 'config/supabase-projects.json'), 'utf8'))
  const approvals = JSON.parse(readFileSync(join(configRoot, 'config/member-production.json'), 'utf8'))
  let ref
  if (o.target === 'staging') ref = projects.staging.ref
  else {
    const m = projects.memberProduction ?? {}
    if (m.ref == null) throw new Error('memberProduction.ref is null: member Production is not provisioned, nothing to verify')
    const problems = memberProductionProblems(m)
    if (problems.length || !m.name || !m.region) throw new Error(`member Production's ref, name and region must all be valid: ${problems.join('; ')}`)
    ref = m.ref
  }
  const base = (o['base-url'] ?? `https://${ref}.supabase.co/functions/v1`).replace(/\/+$/, '')
  const call = (path, init = {}) => fetchImpl(`${base}/${path}`, { redirect: 'manual', ...init })

  if (o.mode === 'removed') {
    const r = await call(`${o.function}/verify-absent`, { method: 'POST' })
    await r.body?.cancel?.()
    check(r.status === 404, 'absence', `${o.function} answers 404 (got ${r.status})`)
    check(!r.headers.get('x-splitpost-build'), 'absence', `${o.function} serves no build stamp`)
    return { ref, failures, passes }
  }

  if (o.target === 'member-production' && o.function === 'post-media' && approvals.postMediaFunctionApproved !== true) {
    throw new Error('post-media is not approved for member Production (postMediaFunctionApproved is false): it must not be deployed, so it is not verified as deployed')
  }
  if (!o['source-root']) throw new Error('--source-root (an export of the expected commit) is required')
  const expectedBuild = `${o.commit}.${sourceDigest(o['source-root'], o.function)}`
  const { approved, disallowed } = originsFor(o.target)
  const observed = new Set()
  const buildOk = (r) => {
    observed.add(r.headers.get('x-splitpost-build') ?? 'none')
    return r.headers.get('x-splitpost-build') === expectedBuild
  }
  const common = (r, what) => {
    check(r.status !== 503, 'auth', `${what}: not refusing to run (got ${r.status}: a 503 means the wrong project or missing keys)`)
    check(buildOk(r), 'build', `${what}: build stamp is ${expectedBuild.slice(0, 12)}... (got ${r.headers.get('x-splitpost-build') ?? 'none'})`)
    check(r.headers.get('x-content-type-options') === 'nosniff', 'build', `${what}: nosniff`)
  }
  const noCors = (r, what) => {
    const present = CORS_HEADERS.filter((h) => r.headers.get(h) !== null)
    check(present.length === 0, 'cors', `${what}: no CORS grant (found ${present.join(', ') || 'none'})`)
  }

  for (const route of ROUTES[o.function]) {
    const path = `${o.function}/${route}`
    // CORS: the approved origin, exactly.
    let r = await call(path, { method: 'OPTIONS', headers: { Origin: approved, 'Access-Control-Request-Method': 'POST' } })
    await r.body?.cancel?.()
    check(r.status === 204 || r.status === 200, 'cors', `${route}: preflight from the approved origin succeeds (got ${r.status})`)
    check(r.headers.get('access-control-allow-origin') === approved, 'cors', `${route}: the approved origin is echoed exactly`)
    check(r.headers.get('access-control-allow-credentials') === null, 'cors', `${route}: no credentials grant`)
    check((r.headers.get('vary') ?? '').toLowerCase().includes('origin'), 'cors', `${route}: Vary: Origin`)
    common(r, `${route} preflight`)
    // CORS: every other origin gets nothing, on preflight and on POST.
    for (const origin of disallowed) {
      r = await call(path, { method: 'OPTIONS', headers: { Origin: origin, 'Access-Control-Request-Method': 'POST' } })
      await r.body?.cancel?.()
      noCors(r, `${route} preflight from ${origin}`)
      r = await call(path, { method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json' }, body: '{}' })
      await r.body?.cancel?.()
      noCors(r, `${route} POST from ${origin}`)
      check(r.status === 401, 'auth', `${route} POST from ${origin} without a session is refused (got ${r.status})`)
    }
    // Authentication, independent of CORS.
    const unauth = [
      ['no origin, no session', {}],
      ['the approved origin, no session', { Origin: approved }],
      ['a malformed bearer token', { Authorization: 'Bearer not.a.token' }],
    ]
    if (route === 'drain') unauth.push(['a wrong drain key', { 'x-media-drain-key': 'x'.repeat(40) }])
    for (const [what, headers] of unauth) {
      r = await call(path, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: '{}' })
      const text = await r.text()
      check(r.status === 401, 'auth', `${route}: ${what} is refused (got ${r.status})`)
      check(/not_signed_in/.test(text), 'auth', `${route}: ${what} says not_signed_in`)
      common(r, `${route} (${what})`)
    }
    r = await call(path, { method: 'GET' })
    await r.body?.cancel?.()
    check(r.status === 405 || r.status === 401, 'auth', `${route}: GET is refused (got ${r.status})`)
  }

  if (o.target === 'member-production' && !o.skipAbsence) {
    const absent = ['join-waitlist']
    if (approvals.postMediaFunctionApproved !== true) absent.push('post-media')
    for (const fn of absent) {
      const r = await call(`${fn}/verify-absent`, { method: 'POST' })
      await r.body?.cancel?.()
      check(r.status === 404, 'absence', `${fn} is not deployed on member Production (got ${r.status})`)
    }
  }
  // Exactly one build must have been served throughout (no mix of versions).
  check(observed.size === 1 && observed.has(expectedBuild), 'build', `one build served throughout (${[...observed].map((b) => b.slice(0, 12)).join(', ')})`)
  return { ref, failures, passes, observedBuild: observed.size === 1 ? [...observed][0] : null }
}

/**
 * The evidence line a passing GitHub run records (as a run annotation): what
 * the runner itself observed, independently of the founder's computer. The
 * rollback check in scripts/functions/deploy.mjs requires it to match the ledger.
 */
export function evidenceAnnotation(o, r) {
  const observed = o.mode === 'removed' ? 'none' : r.observedBuild
  return `::notice title=Verified deployment::target=${o.target} ref=${r.ref} function=${o.function} mode=${o.mode} commit=${o.commit} observed_build=${observed}`
}

if (/[\\/]scripts[\\/]functions[\\/]verify\.mjs$/.test(process.argv[1] ?? '')) {
  try {
    const o = parse(process.argv.slice(2))
    const r = await verify(o)
    for (const f of r.failures) console.log(`FAIL  ${f}`)
    console.log(`Verification of ${r.ref}: ${r.passes.length} passed, ${r.failures.length} failed`)
    if (!r.failures.length && process.env.GITHUB_ACTIONS === 'true') console.log(evidenceAnnotation(o, r))
    process.exit(r.failures.length ? 1 : 0)
  } catch (e) {
    console.error(`REFUSED: ${e.message}`)
    process.exit(1)
  }
}
