// TEST ONLY. Never deployed: it lives outside supabase/functions.
//
// Runs the real join-waitlist handler and database code in Supabase's Edge
// runtime, connected as the restricted waitlist_writer login, with one
// difference: Turnstile is replaced by a stand-in, so the test needs no
// Cloudflare account. A token "pass:<hostname>:<action>" verifies with that
// hostname and action; anything else fails. Used by scripts/e2e/waitlist-edge.sh.
// Everything else (the database target and TLS checks, the trusted proxy hop
// count from WAITLIST_TRUSTED_PROXY_HOPS or the 'ignore' mode from
// WAITLIST_CLIENT_ADDRESS, the rate limits) is the real code.

import postgres from 'npm:postgres@3.4.9'
import { cachedHealthCheck, clientIpFor, handleJoin, parseClientAddressMode, rateKeysForMode } from '../join-waitlist/handler.ts'
import { checkDatabaseTarget, databaseOptions, databaseReachable, previewWithDatabase, submitWithDatabase, type Sql } from '../join-waitlist/db.ts'

const env = (k: string) => (Deno.env.get(k) ?? '').trim()

let sql: Sql | null = null
let configProblem = ''
try {
  const target = checkDatabaseTarget(env('WAITLIST_DB_URL'), env('SUPABASE_URL'))
  const db = databaseOptions(env('WAITLIST_DB_URL'), { localPlaintext: target.local })
  sql = postgres(db.url, db.options) as unknown as Sql
} catch (e) {
  configProblem = (e as Error).message
}

const clientMode = parseClientAddressMode(env('WAITLIST_CLIENT_ADDRESS'), env('WAITLIST_TRUSTED_PROXY_HOPS'))
const trustedHops = clientMode?.kind === 'forwarded' ? clientMode.hops : null

// At most one database health check per 30 seconds per instance.
const health = cachedHealthCheck(() => databaseReachable(sql))

Deno.serve(async (req: Request) => {
  if (new URL(req.url).pathname.endsWith('/__config')) return Response.json({ ok: sql !== null, problem: configProblem, trustedHops, clientMode: clientMode?.kind ?? null })
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
      enabled: sql !== null && clientMode !== null,
      allowedOrigins: [env('TEST_ORIGIN')],
      allowedHostnames: [env('TEST_HOSTNAME')],
      verifyTurnstile: async (token) => {
        const [verdict, hostname, action] = token.split(':')
        return verdict === 'pass' ? { success: true, hostname, action } : { success: false }
      },
      rateKeys: (email, clientIp) => rateKeysForMode(clientMode!, email, clientIp, env('WAITLIST_RATE_SALT')),
      submit: (payload) => submitWithDatabase(sql!, payload),
      previewInvite: (code, clientKey) => previewWithDatabase(sql!, code, clientKey),
      databaseReachable: health,
    },
  )
  console.log(JSON.stringify({ event: 'join', status: out.status }))
  return new Response(out.body || null, { status: out.status, headers: out.headers })
})
