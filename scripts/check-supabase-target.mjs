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
//   Local builds        staging, a local development stack, or nothing.
//   Any build           fails if the key looks like a secret or service key.
//
// Project references live in config/supabase-projects.json; changing them
// requires a reviewed pull request.

import { readFileSync } from 'node:fs'

const projects = JSON.parse(readFileSync(new URL('../config/supabase-projects.json', import.meta.url), 'utf8'))
const REF = /^[a-z0-9]{20}$/

export const PROJECTS = { staging: projects.staging?.ref ?? null, production: projects.production?.ref ?? null }
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

/**
 * @param env  the build environment
 * @param opts { mode: 'app' | 'site', refs: { staging, production } } (refs default to config)
 */
export function checkSupabaseTarget(env, { mode = env.CREVANT_BUILD_MODE === 'site' ? 'site' : 'app', refs = PROJECTS } = {}) {
  const target = (env.VERCEL_ENV || '').trim().toLowerCase()
  const url = (env.VITE_SUPABASE_URL || '').trim().replace(/\/$/, '')
  const key = (env.VITE_SUPABASE_PUBLISHABLE_KEY || '').trim()
  const fail = (message) => ({ ok: false, message })
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
