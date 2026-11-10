#!/usr/bin/env node
// Runs before every build (npm run build). Makes sure the browser bundle can
// only ever talk to the right Supabase project, with a public key:
//
//   Vercel Preview      must use the staging project and a publishable key
//   Vercel Production   must have no Supabase values at all (the demo)
//   Local builds        staging, a local development stack, or nothing
//   Any build           fails if the key looks like a secret or service key
//
// Changing the staging project requires a reviewed pull request.

export const STAGING_SUPABASE_URL = 'https://kpudeppgokpjhvaqrprn.supabase.co'

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

/** The staging project's waitlist function: the only hosted address the form may post to. */
export const STAGING_WAITLIST_ENDPOINT = `${STAGING_SUPABASE_URL}/functions/v1/join-waitlist`

/** Checks VITE_WAITLIST_ENDPOINT on its own; null means it is fine. */
function waitlistEndpointProblem(target, endpoint) {
  if (!endpoint) return null
  if (target === 'production') return 'Production must not have VITE_WAITLIST_ENDPOINT until a reviewed change moves Production to the public site build.'
  if (endpoint === STAGING_WAITLIST_ENDPOINT) return null
  if (target !== 'preview' && /^http:\/\/(127\.0\.0\.1|localhost):\d+\/functions\/v1\/join-waitlist$/.test(endpoint)) return null
  return `VITE_WAITLIST_ENDPOINT must be the staging waitlist function (${STAGING_WAITLIST_ENDPOINT}).`
}

export function checkSupabaseTarget(env) {
  const target = (env.VERCEL_ENV || '').trim().toLowerCase()
  const endpointProblem = waitlistEndpointProblem(target, (env.VITE_WAITLIST_ENDPOINT || '').trim())
  if (endpointProblem) return { ok: false, message: endpointProblem }
  const url = (env.VITE_SUPABASE_URL || '').trim().replace(/\/$/, '')
  const key = (env.VITE_SUPABASE_PUBLISHABLE_KEY || '').trim()
  const fail = (message) => ({ ok: false, message })

  if (key && isPrivilegedKey(key)) return fail('VITE_SUPABASE_PUBLISHABLE_KEY looks like a secret or service key. Only the publishable key may be used in the browser.')
  if (target === 'production') {
    if (url || key) return fail('Production must not have Supabase values. The demo is built without them.')
    return { ok: true, message: 'Supabase: none (production demo).' }
  }
  if (target === 'preview') {
    if (url !== STAGING_SUPABASE_URL) return fail(`Preview builds must use the staging project (${STAGING_SUPABASE_URL}).`)
    if (!/^sb_publishable_[A-Za-z0-9_-]+$/.test(key)) return fail('Preview builds need the staging publishable key (sb_publishable_...).')
    return { ok: true, message: 'Supabase: staging project (kpudeppgokpjhvaqrprn), publishable key.' }
  }
  if (!url && !key) return { ok: true, message: 'Supabase: none (sign-in unavailable in this build).' }
  if (!url || !key) return fail('Set both VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY, or neither.')
  if (url === STAGING_SUPABASE_URL || /^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(url)) return { ok: true, message: `Supabase: ${url}` }
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
