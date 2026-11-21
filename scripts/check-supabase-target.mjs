#!/usr/bin/env node
// Runs before every build. Makes sure the browser bundle can only ever talk to
// the right Supabase project, with a public key, and that the waitlist form
// can only ever post to the right project's function:
//
//   Vercel Preview      full app: the staging project and a publishable key.
//                       The waitlist address, if set, must be the STAGING
//                       function; never Production.
//   Vercel Production   no Supabase URL or key at all. The waitlist address,
//                       if set, must be the PRODUCTION function; never staging.
//                       While the Production project reference is unset
//                       (config/supabase-projects.json), any address fails:
//                       Production fails closed.
//   Member app project  (splitpost-app, app.splitpost.ca):
//                       Preview (and local): exactly the staging (pilot)
//                       project and a publishable key; never the member
//                       Production project.
//                       Production: exactly the member Production project
//                       (memberProduction) and a publishable key; never
//                       staging. While memberProduction is unset, every
//                       member Production build fails closed.
//                       Both: never the waitlist project, and no waitlist
//                       address at all (members never use the waitlist
//                       form). Any other build environment fails.
//   Every other build   never the member Production project, anywhere.
//   Local builds        staging, a local development stack, or nothing.
//   Any build           fails if the key looks like a secret or service key,
//                       or if the project list is broken (a malformed or
//                       missing staging reference, or two the same:
//                       scripts/supabase-projects.mjs).
//
// Project references live in config/supabase-projects.json; changing them
// requires a reviewed pull request.

import { identifyProject } from './vercel-project.mjs'
import { REF, loadProjectRefs, projectRefProblems } from './supabase-projects.mjs'

/** { staging, production (the waitlist project), memberProduction }. */
export const PROJECTS = loadProjectRefs()
export const STAGING_SUPABASE_URL = `https://${PROJECTS.staging}.supabase.co`
export const functionAddress = (ref) => `https://${ref}.supabase.co/functions/v1/join-waitlist`
/** The staging project's waitlist function. */
export const STAGING_WAITLIST_ENDPOINT = functionAddress(PROJECTS.staging)

function isPrivilegedKey(key) {
  if (/^sb_secret_/i.test(key)) return true
  const parts = key.split('.')
  if (parts.length === 3) {
    try {
      const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'))
      return !payload || payload.role !== 'anon'
    } catch {
      return true
    }
  }
  return false
}

/** Checks VITE_WAITLIST_ENDPOINT on its own; null means it is fine. */
function waitlistEndpointProblem(target, endpoint, refs) {
  if (!endpoint) return null
  const staging = refs.staging && REF.test(refs.staging) ? functionAddress(refs.staging) : null
  const production = refs.production && REF.test(refs.production) ? functionAddress(refs.production) : null
  if (target === 'production') {
    if (!production) return 'VITE_WAITLIST_ENDPOINT is set, but the Production Supabase project is not configured (config/supabase-projects.json). Production fails closed.'
    if (endpoint === staging) return 'Production must never use the staging waitlist function.'
    if (endpoint !== production) return `Production may only use the Production waitlist function (${production}).`
    return null
  }
  if (production && endpoint === production) return 'Only Production builds may use the Production waitlist function.'
  if (staging && endpoint === staging) return null
  if (target !== 'preview' && /^http:\/\/(127\.0\.0\.1|localhost):\d+\/functions\/v1\/join-waitlist$/.test(endpoint)) return null
  return `VITE_WAITLIST_ENDPOINT must be the staging waitlist function (${staging}).`
}

const MEMBER_TARGETS = ['', 'development', 'preview', 'production']

/**
 * The member app project. Preview, development and local builds: the staging
 * (pilot) project only. Production: the member Production project only, and
 * nothing at all until it is configured. Publishable key only, no waitlist
 * address. Fails closed.
 */
function checkMemberApp(env, target, refs) {
  const url = (env.VITE_SUPABASE_URL || '').trim().replace(/\/$/, '')
  const key = (env.VITE_SUPABASE_PUBLISHABLE_KEY || '').trim()
  const fail = (message) => ({ ok: false, message: `Member app: ${message}` })
  if (!MEMBER_TARGETS.includes(target)) return fail(`unknown build environment "${target}". Only Preview, Production, development or a local build may build the member app.`)
  if (refs.production && REF.test(refs.production) && url.includes(refs.production)) {
    return fail(target === 'production'
      ? 'it must never use the Production waitlist project. Use the member Production project.'
      : 'it must never use the Production waitlist project. Use the staging (pilot) project.')
  }
  if ((env.VITE_WAITLIST_ENDPOINT || '').trim()) return fail('VITE_WAITLIST_ENDPOINT must not be set. Members never use the waitlist form.')
  if (key && isPrivilegedKey(key)) return fail('VITE_SUPABASE_PUBLISHABLE_KEY looks like a secret or service key. Only the publishable key may be used in the browser.')

  if (target === 'production') {
    if (!refs.memberProduction) {
      return fail('the member Production Supabase project is not configured (memberProduction in config/supabase-projects.json). Member Production builds fail closed until its reference is added in a reviewed pull request.')
    }
    const memberUrl = `https://${refs.memberProduction}.supabase.co`
    if (url.includes(refs.staging)) return fail(`Production must never use the staging (pilot) project. Use the member Production project (${memberUrl}).`)
    if (url !== memberUrl) return fail(`VITE_SUPABASE_URL must be exactly the member Production project (${memberUrl}).`)
    if (!/^sb_publishable_[A-Za-z0-9_-]+$/.test(key)) return fail('VITE_SUPABASE_PUBLISHABLE_KEY must be the member Production publishable key (sb_publishable_...).')
    return { ok: true, message: `Supabase: member Production project (${refs.memberProduction}), publishable key, member app (production).` }
  }

  const stagingUrl = `https://${refs.staging}.supabase.co`
  if (refs.memberProduction && url.includes(refs.memberProduction)) {
    return fail('Previews and local builds must never use the member Production project. Use the staging (pilot) project.')
  }
  if (url !== stagingUrl) return fail(`VITE_SUPABASE_URL must be exactly the staging (pilot) project (${stagingUrl}).`)
  if (!/^sb_publishable_[A-Za-z0-9_-]+$/.test(key)) return fail('VITE_SUPABASE_PUBLISHABLE_KEY must be the staging publishable key (sb_publishable_...).')
  return { ok: true, message: `Supabase: staging (pilot) project (${refs.staging}), publishable key, member app (${target || 'local'}).` }
}

/**
 * @param env  the build environment
 * @param opts { mode: 'app' | 'site', refs: { staging, production, memberProduction }, project } (refs default to config; project to the Vercel project this build runs in)
 */
export function checkSupabaseTarget(env, { mode = env.CREVANT_BUILD_MODE === 'site' ? 'site' : 'app', refs = PROJECTS, project = identifyProject(env) } = {}) {
  const target = (env.VERCEL_ENV || '').trim().toLowerCase()
  // A broken project list fails every build.
  const configProblems = projectRefProblems(refs)
  if (configProblems.length) return { ok: false, message: `Supabase project list: ${configProblems.join('; ')}.` }
  if (project === 'memberApp') return checkMemberApp(env, target, refs)
  const url = (env.VITE_SUPABASE_URL || '').trim().replace(/\/$/, '')
  const key = (env.VITE_SUPABASE_PUBLISHABLE_KEY || '').trim()
  const fail = (message) => ({ ok: false, message })
  // Only the member app's Production build may ever use the member Production project.
  if (refs.memberProduction) {
    for (const [name, value] of [['VITE_SUPABASE_URL', url], ['VITE_WAITLIST_ENDPOINT', (env.VITE_WAITLIST_ENDPOINT || '').trim()]]) {
      if (value.includes(refs.memberProduction)) return fail(`${name} points at the member Production project. Only the member app's Production build may use it.`)
    }
  }
  const stagingUrl = `https://${refs.staging}.supabase.co`

  const endpointProblem = waitlistEndpointProblem(target, (env.VITE_WAITLIST_ENDPOINT || '').trim(), refs)
  if (endpointProblem) return fail(endpointProblem)

  if (key && isPrivilegedKey(key)) return fail('VITE_SUPABASE_PUBLISHABLE_KEY looks like a secret or service key. Only the publishable key may be used in the browser.')
  if (target === 'production') {
    if (url || key) return fail('Production must not have Supabase values. The public site build has no sign in and needs none.')
    return { ok: true, message: 'Supabase: none (production).' }
  }
  // The public site build drops these values itself, so it doesn't need them.
  if (mode === 'site') return { ok: true, message: 'Supabase: none needed (public site build).' }
  if (target === 'preview') {
    if (url !== stagingUrl) return fail(`Preview builds must use the staging project (${stagingUrl}).`)
    if (!/^sb_publishable_[A-Za-z0-9_-]+$/.test(key)) return fail('Preview builds need the staging publishable key (sb_publishable_...).')
    return { ok: true, message: `Supabase: staging project (${refs.staging}), publishable key.` }
  }
  if (!url && !key) return { ok: true, message: 'Supabase: none (sign-in unavailable in this build).' }
  if (!url || !key) return fail('Set both VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY, or neither.')
  if (url === stagingUrl || /^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(url)) return { ok: true, message: `Supabase: ${url}` }
  return fail('VITE_SUPABASE_URL must be the staging project or a local development stack.')
}

const isMain = import.meta.url === `file://${process.argv[1]}`
if (isMain) {
  const result = checkSupabaseTarget(process.env)
  if (!result.ok) {
    console.error(`\n✖ ${result.message}\n`)
    process.exit(1)
  }
  console.log(result.message)
}
