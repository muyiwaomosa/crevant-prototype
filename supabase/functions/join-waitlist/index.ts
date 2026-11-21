// Supabase Edge Function: join-waitlist. NOT deployed: deployment and every
// secret below need the founder's approval (docs/WAITLIST.md).
//
// Environment (set as Supabase function secrets, never in the repository):
//   WAITLIST_FUNCTION_ENABLED   'true' to accept submissions; anything else = closed
//   WAITLIST_DB_URL             postgres:// URL logging in as waitlist_writer
//                               (through the Supabase pooler: user
//                               waitlist_writer.<project ref>, port 6543). Any
//                               other login, another project's database, or
//                               any connection setting after "?" is refused.
//                               Missing = closed.
//   WAITLIST_DB_CA_CERT         optional PEM certificate to verify the database
//                               against, if its certificate isn't publicly
//                               trusted. TLS verification can't be turned off.
//   WAITLIST_ALLOWED_ORIGINS    comma-separated exact origins allowed to call it
//   WAITLIST_ALLOWED_HOSTNAMES  comma-separated hostnames Turnstile must report
//   TURNSTILE_SECRET_KEY        Cloudflare Turnstile secret. Missing = closed.
//   WAITLIST_RATE_SALT          random string (at least 32 characters) used to
//                               make the salted rate limit keys. Missing = closed.
//   WAITLIST_CLIENT_ADDRESS     'ignore': never read forwarding headers, and
//                               switch the per-visitor limit off (the per-email
//                               and overall limits and Turnstile remain; see
//                               docs/WAITLIST-ABUSE-CONTROLS.md). Requires
//                               WAITLIST_TRUSTED_PROXY_HOPS to be unset.
//                               Unset or 'forwarded': use the hop count below.
//   WAITLIST_TRUSTED_PROXY_HOPS how many X-Forwarded-For entries, counted from
//                               the right, Supabase's own proxies add (1 to 5).
//                               No default: it must be confirmed on the hosted
//                               platform first (docs/WAITLIST.md, hosted
//                               staging check 3).
//   One of the two must be chosen, consistently. Neither, or both = closed.
//
// Supabase also provides SUPABASE_URL (https://<project ref>.supabase.co),
// which secrets can't override. The database URL must belong to that same
// project, so a function can never be pointed at another project's database.
//
// This function does not read SUPABASE_SERVICE_ROLE_KEY or SUPABASE_DB_URL,
// which Supabase provides to every function. It uses only the restricted login.
//
// Deploy with JWT verification off (the function checks the origin and
// Turnstile itself, and the public site sends no key), always naming the
// project explicitly (docs/WAITLIST.md), never to member Production:
//   supabase functions deploy join-waitlist --no-verify-jwt --project-ref <waitlist or staging ref>

import postgres from 'npm:postgres@3.4.9'
import { cachedHealthCheck, clientIpFor, handleJoin, parseClientAddressMode, rateKeysForMode, verifyWithCloudflare } from './handler.ts'
import { checkDatabaseTarget, databaseOptions, databaseReachable, previewWithDatabase, submitWithDatabase, type Sql } from './db.ts'
import { waitlistProjectAllowed } from '../_shared/policy.ts'

// Runtime project guard (Phase 1B-2): this function may run only on the
// waitlist project, staging or local Supabase (../_shared/policy.ts, from
// config/supabase-projects.json). On any other project, member Production
// above all, it reads no secret at all: every setting below reads as empty,
// so it stays closed (no database, no Turnstile secret). On the allowed
// projects nothing below changes.
const projectAllowed = waitlistProjectAllowed(Deno.env.get('SUPABASE_URL') ?? '')
const env = (k: string) => (projectAllowed ? (Deno.env.get(k) ?? '') : '').trim()
const list = (k: string) =>
  env(k)
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)

const configProblem = (problem: string) => console.error(JSON.stringify({ event: 'config', problem }))
if (!projectAllowed) configProblem('not an approved project for join-waitlist (only the waitlist project, staging or local Supabase); closed, no secret read')

// Build the database client once per instance. Any problem with the URL
// (wrong login, another project, connection settings, no password, a bad
// certificate) leaves the function closed. There is no fallback.
let sql: Sql | null = null
try {
  if (env('WAITLIST_DB_URL')) {
    const target = checkDatabaseTarget(env('WAITLIST_DB_URL'), env('SUPABASE_URL'))
    const db = databaseOptions(env('WAITLIST_DB_URL'), { caCert: env('WAITLIST_DB_CA_CERT') || undefined, localPlaintext: target.local })
    sql = postgres(db.url, db.options) as unknown as Sql
  }
} catch (e) {
  configProblem((e as Error).message)
}

// Not guessed: either addresses are ignored on purpose, or a confirmed hop
// count says where the visitor's address is. Neither, or both, stays closed.
const clientMode = parseClientAddressMode(env('WAITLIST_CLIENT_ADDRESS'), env('WAITLIST_TRUSTED_PROXY_HOPS'))
if (clientMode === null) {
  configProblem('WAITLIST_CLIENT_ADDRESS is not ignore and WAITLIST_TRUSTED_PROXY_HOPS is not set to a confirmed value (1 to 5), or both are set')
}

const enabled =
  env('WAITLIST_FUNCTION_ENABLED') === 'true' &&
  sql !== null &&
  clientMode !== null &&
  env('WAITLIST_RATE_SALT').length >= 32 &&
  env('TURNSTILE_SECRET_KEY') !== ''

// At most one database health check per 30 seconds per instance.
const health = cachedHealthCheck(() => databaseReachable(sql))

Deno.serve(async (req: Request) => {
  // In 'ignore' mode no forwarding header is read at all. Otherwise only the
  // trusted hop of X-Forwarded-For; client-supplied entries are ignored.
  const ip = clientIpFor(clientMode, () => req.headers.get('x-forwarded-for'))
  const out = await handleJoin(
    {
      method: req.method,
      origin: req.headers.get('origin'),
      contentType: req.headers.get('content-type'),
      body: req.method === 'POST' ? await req.text() : '',
      ip,
    },
    {
      enabled,
      allowedOrigins: list('WAITLIST_ALLOWED_ORIGINS'),
      allowedHostnames: list('WAITLIST_ALLOWED_HOSTNAMES'),
      verifyTurnstile: (token, clientIp) => verifyWithCloudflare(token, clientIp, env('TURNSTILE_SECRET_KEY'), fetch),
      rateKeys: (email, clientIp) => rateKeysForMode(clientMode!, email, clientIp, env('WAITLIST_RATE_SALT')),
      submit: (payload) => submitWithDatabase(sql!, payload),
      previewInvite: (code, clientKey) => previewWithDatabase(sql!, code, clientKey),
      databaseReachable: health,
    },
  )
  // Status, and for a failed Turnstile check a fixed reason: never the email, address, token or request body.
  console.log(
    JSON.stringify({ event: req.method === 'GET' ? 'health' : 'join', status: out.status, result: JSON.parse(out.body || '{}').status ?? null, ...(out.logNote ? { reason: out.logNote } : {}) }),
  )
  return new Response(out.body || null, { status: out.status, headers: out.headers })
})
