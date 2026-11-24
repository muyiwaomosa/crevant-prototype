// The project's API keys, for the member Edge Functions (avatar, post-media).
//
// Supabase is retiring the legacy anon and service_role keys (JWTs). Hosted
// Supabase gives every function the new keys as JSON dictionaries, keyed by
// the key's name; every project has one named "default":
//   SUPABASE_PUBLISHABLE_KEYS  {"default": "sb_publishable_..."}
//   SUPABASE_SECRET_KEYS       {"default": "sb_secret_..."}
// The local Supabase CLI (and some hosts) may give a single key instead:
//   SUPABASE_PUBLISHABLE_KEY   sb_publishable_...
//   SUPABASE_SECRET_KEY        sb_secret_...
// The new keys are always preferred. The legacy keys are a TRANSITION
// FALLBACK only, used if no new key is present:
//   SUPABASE_ANON_KEY          a JWT (role anon)
//   SUPABASE_SERVICE_ROLE_KEY  a JWT (role service_role)
// Remove the fallback (and its tests) once both staging and member Production
// run on the new keys and their legacy keys are disabled (docs/FUNCTIONS-DEPLOYMENT.md).
//
// Only the "default" key of a dictionary is used, so which key the functions
// hold never depends on the order of a JSON object. A value of the wrong
// shape counts as missing: a function with no usable key refuses to run (503).
//
// How each key is sent: a new key (sb_publishable_..., sb_secret_...) is not
// a JWT, so it goes on the apikey header ONLY, never as Authorization: Bearer,
// as Supabase's API key documentation asks; the gateway then acts with that
// key's role (service_role for a secret key; proven on local Supabase for
// Storage, PostgREST and Auth by scripts/e2e/*-edge.sh).
// A legacy service_role key is a JWT and is sent on both, as before.
//
// Never log or return a key. ProjectKeys.styles names only which kind is in use.

export type KeyStyle = 'new' | 'legacy'

export interface ProjectKeys {
  /** The publishable key (or the legacy anon key), or '' if none is usable. */
  publishable: string
  /** The secret key (or the legacy service_role key), or '' if none is usable. */
  secret: string
  /** Which kind each one is, for the start-up log line. Never the values. */
  styles: { publishable: KeyStyle | null; secret: KeyStyle | null }
}

export const PUBLISHABLE_SHAPE = /^sb_publishable_[A-Za-z0-9_-]{10,200}$/
export const SECRET_SHAPE = /^sb_secret_[A-Za-z0-9_-]{10,200}$/
const JWT_SHAPE = /^[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}$/

/** The "default" key of a JSON dictionary, if it has the expected shape; otherwise ''. */
function fromDictionary(raw: string, shape: RegExp): string {
  if (raw === '') return ''
  try {
    const parsed: unknown = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return ''
    const value = (parsed as Record<string, unknown>).default
    return typeof value === 'string' && shape.test(value.trim()) ? value.trim() : ''
  } catch {
    return ''
  }
}

function pick(get: (name: string) => string, dictionary: string, single: string, legacy: string, shape: RegExp): [string, KeyStyle | null] {
  const fromDict = fromDictionary(get(dictionary), shape)
  if (fromDict) return [fromDict, 'new']
  const one = get(single)
  if (shape.test(one)) return [one, 'new']
  const old = get(legacy)
  if (JWT_SHAPE.test(old)) return [old, 'legacy']
  return ['', null]
}

/** Reads the project's keys. `get` returns an environment variable, trimmed, or ''. */
export function projectKeys(get: (name: string) => string): ProjectKeys {
  const [publishable, p] = pick(get, 'SUPABASE_PUBLISHABLE_KEYS', 'SUPABASE_PUBLISHABLE_KEY', 'SUPABASE_ANON_KEY', PUBLISHABLE_SHAPE)
  const [secret, s] = pick(get, 'SUPABASE_SECRET_KEYS', 'SUPABASE_SECRET_KEY', 'SUPABASE_SERVICE_ROLE_KEY', SECRET_SHAPE)
  return { publishable, secret, styles: { publishable: p, secret: s } }
}

/**
 * Headers for a call to Storage or PostgREST with the secret key (service role).
 * A new secret key goes on apikey only: it is not a JWT, and Supabase asks for
 * it on apikey, not Authorization. A legacy service_role JWT goes on both, as before.
 */
export function serviceHeaders(secret: string): Record<string, string> {
  return SECRET_SHAPE.test(secret) ? { apikey: secret } : { apikey: secret, Authorization: `Bearer ${secret}` }
}
