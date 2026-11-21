// Project isolation and origin policy for the member Edge Functions (avatar,
// post-media) and the runtime project guard for join-waitlist (Phase 1B-2).
// Pure: no network, no environment. The references come only from
// ./projects.ts, generated from config/supabase-projects.json.
//
// Member functions (avatar, post-media) serve:
//   staging            the staging project; browsers from the member app's Previews
//   member-production  the member Production project, ONLY when its reference
//                      is set (and differs from staging and the waitlist);
//                      browsers from exactly https://app.splitpost.ca
//   local              local Supabase (development and CI); local browsers too
// Anything else (the waitlist project, an unknown project, member Production
// while its reference is null) is refused: the function answers 503 and makes
// no network call.
//
// join-waitlist may run only on the waitlist project, staging or local
// Supabase; anywhere else, member Production above all, it stays closed
// before reading any secret.
import { MEMBER_PRODUCTION_REF, STAGING_REF, WAITLIST_REF } from './projects.ts'
import { BUILD } from './build-info.ts'

export type Role = 'staging' | 'member-production' | 'local'
export type Refs = { staging: string | null; waitlist: string | null; member: string | null }

export const DEFAULT_REFS: Refs = { staging: STAGING_REF, waitlist: WAITLIST_REF, member: MEMBER_PRODUCTION_REF }
export const MEMBER_APP_ORIGIN = 'https://app.splitpost.ca'
export const PREVIEW_ORIGIN = /^https:\/\/splitpost-app-[a-z0-9-]+-crevant\.vercel\.app$/
export const BUILD_HEADER = 'X-Splitpost-Build'
export const BUILD_ID = BUILD

const REF = /^[a-z0-9]{20}$/
const LOCAL_URL = /^http:\/\/(127\.0\.0\.1|localhost|kong|host\.docker\.internal)(:\d+)?$/
const LOCAL_ORIGIN = /^http:\/\/(127\.0\.0\.1|localhost):\d+$/
const HOSTED_URL = /^https:\/\/([a-z0-9]{20})\.supabase\.co$/

const valid = (r: string | null): r is string => typeof r === 'string' && REF.test(r)

function hostedRef(supabaseUrl: string): string | null {
  const m = HOSTED_URL.exec(supabaseUrl.trim().replace(/\/+$/, ''))
  return m ? m[1] : null
}

/** Which project a member function is running in, or null: refuse to run. */
export function memberFunctionRole(supabaseUrl: string, refs: Refs = DEFAULT_REFS): Role | null {
  const url = supabaseUrl.trim().replace(/\/+$/, '')
  if (LOCAL_URL.test(url)) return 'local'
  const ref = hostedRef(url)
  if (!ref) return null
  if (valid(refs.waitlist) && ref === refs.waitlist) return null
  if (valid(refs.staging) && ref === refs.staging) return 'staging'
  if (valid(refs.member) && ref === refs.member && refs.member !== refs.staging && refs.member !== refs.waitlist) return 'member-production'
  return null
}

/** Why a member function refuses to run (for its log; never secret). */
export function refusalReason(supabaseUrl: string, refs: Refs = DEFAULT_REFS): string {
  const ref = hostedRef(supabaseUrl)
  if (supabaseUrl.trim() === '') return 'no SUPABASE_URL'
  if (!ref) return 'not a Supabase project address'
  if (valid(refs.waitlist) && ref === refs.waitlist) return 'the waitlist project'
  if (!valid(refs.member)) return 'not an approved project (member Production is not configured)'
  return 'not an approved project'
}

/** Whether a browser from this origin may call a member function in this project. */
export function originAllowed(role: Role | null, origin: string | null): boolean {
  if (!role || !origin) return false
  if (role === 'staging') return PREVIEW_ORIGIN.test(origin)
  if (role === 'member-production') return origin === MEMBER_APP_ORIGIN
  return PREVIEW_ORIGIN.test(origin) || LOCAL_ORIGIN.test(origin)
}

/** CORS headers: the exact origin echoed when allowed; never a wildcard, never credentials. */
export function corsHeaders(role: Role | null, origin: string | null): Record<string, string> {
  return originAllowed(role, origin)
    ? {
        'Access-Control-Allow-Origin': origin as string,
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
        'Access-Control-Max-Age': '600',
        Vary: 'Origin',
      }
    : { Vary: 'Origin' }
}

/** join-waitlist's runtime guard: only the waitlist project, staging or local Supabase. */
export function waitlistProjectAllowed(supabaseUrl: string, refs: Refs = DEFAULT_REFS): boolean {
  const url = supabaseUrl.trim().replace(/\/+$/, '')
  if (LOCAL_URL.test(url)) return true
  const ref = hostedRef(url)
  if (!ref) return false
  if (valid(refs.member) && ref === refs.member) return false
  return (valid(refs.waitlist) && ref === refs.waitlist) || (valid(refs.staging) && ref === refs.staging)
}
