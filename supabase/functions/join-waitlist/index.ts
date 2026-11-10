// Supabase Edge Function: join-waitlist. NOT deployed: deployment and every
// secret below need the founder's approval (docs/WAITLIST.md).
//
// Environment (set as Supabase function secrets, never in the repository):
//   WAITLIST_FUNCTION_ENABLED   'true' to accept submissions; anything else = closed
//   WAITLIST_DB_URL             postgres:// URL logging in as waitlist_writer
//                               (through the Supabase pooler: user
//                               waitlist_writer.<project ref>). Any other login
//                               is refused. Missing = closed.
//   WAITLIST_DB_CA_CERT         optional PEM certificate to verify the database
//                               against, if its certificate isn't publicly trusted.
//   WAITLIST_ALLOWED_ORIGINS    comma-separated exact origins allowed to call it
//   WAITLIST_ALLOWED_HOSTNAMES  comma-separated hostnames Turnstile must report
//   TURNSTILE_SECRET_KEY        Cloudflare Turnstile secret. Missing = closed.
//   WAITLIST_RATE_SALT          random string (at least 32 characters) used to
//                               make the salted rate limit keys. Missing = closed.
//   WAITLIST_TRUSTED_PROXY_HOPS how many X-Forwarded-For entries, counted from
//                               the right, Supabase's own proxies add (default 1).
//                               Confirm before activation (docs/WAITLIST.md).
//
// This function does not read SUPABASE_SERVICE_ROLE_KEY or SUPABASE_DB_URL,
// which Supabase provides to every function. It uses only the restricted login.
//
// Deploy with JWT verification off (the function checks the origin and
// Turnstile itself, and the public site sends no key):
//   supabase functions deploy join-waitlist --no-verify-jwt

import postgres from 'npm:postgres@3.4.9'
import { cachedHealthCheck, clientIpFrom, handleJoin, rateKeysFor, verifyWithCloudflare } from './handler.ts'
import { databaseOptions, databaseReachable, submitWithDatabase, type Sql } from './db.ts'

const env = (k: string) => (Deno.env.get(k) ?? '').trim()
const list = (k: string) =>
  env(k)
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)

// Build the database client once per instance. Any problem with the URL
// (wrong login, no password) leaves the function closed.
let sql: Sql | null = null
try {
  if (env('WAITLIST_DB_URL')) {
    const db = databaseOptions(env('WAITLIST_DB_URL'), env('WAITLIST_DB_CA_CERT') || undefined)
    sql = postgres(db.url, db.options) as unknown as Sql
  }
} catch (e) {
  console.error(JSON.stringify({ event: 'config', problem: (e as Error).message }))
}

const enabled =
  env('WAITLIST_FUNCTION_ENABLED') === 'true' && sql !== null && env('WAITLIST_RATE_SALT').length >= 32 && env('TURNSTILE_SECRET_KEY') !== ''

// At most one database health check per 30 seconds per instance.
const health = cachedHealthCheck(() => databaseReachable(sql))

Deno.serve(async (req: Request) => {
  // Only the trusted hop of X-Forwarded-For; client-supplied headers are ignored.
  const ip = clientIpFrom(req.headers.get('x-forwarded-for'), Number(env('WAITLIST_TRUSTED_PROXY_HOPS') || '1'))
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
      rateKeys: (email, clientIp) => rateKeysFor(email, clientIp, env('WAITLIST_RATE_SALT')),
      submit: (payload) => submitWithDatabase(sql!, payload),
      databaseReachable: health,
    },
  )
  // Status only: never the email, address or request body.
  console.log(
    JSON.stringify({ event: req.method === 'GET' ? 'health' : 'join', status: out.status, result: JSON.parse(out.body || '{}').status ?? null }),
  )
  return new Response(out.body || null, { status: out.status, headers: out.headers })
})
