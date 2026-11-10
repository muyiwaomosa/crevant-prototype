// TEST ONLY. Never deployed: it lives outside supabase/functions.
//
// Runs the real join-waitlist handler and database code in Supabase's Edge
// runtime, connected as the restricted waitlist_writer login, with one
// difference: Turnstile is replaced by a stand-in, so the test needs no
// Cloudflare account. A token "pass:<hostname>:<action>" verifies with that
// hostname and action; anything else fails. Used by scripts/e2e/waitlist-edge.sh.

import postgres from 'npm:postgres@3.4.9'
import { cachedHealthCheck, clientIpFrom, handleJoin, rateKeysFor } from '../join-waitlist/handler.ts'
import { databaseOptions, databaseReachable, submitWithDatabase, type Sql } from '../join-waitlist/db.ts'

const env = (k: string) => (Deno.env.get(k) ?? '').trim()

let sql: Sql | null = null
let configProblem = ''
try {
  const db = databaseOptions(env('WAITLIST_DB_URL'))
  sql = postgres(db.url, db.options) as unknown as Sql
} catch (e) {
  configProblem = (e as Error).message
}

// At most one database health check per 30 seconds per instance.
const health = cachedHealthCheck(() => databaseReachable(sql))

Deno.serve(async (req: Request) => {
  if (new URL(req.url).pathname.endsWith('/__config')) return Response.json({ ok: sql !== null, problem: configProblem })
  const ip = clientIpFrom(req.headers.get('x-forwarded-for'), 1)
  const out = await handleJoin(
    {
      method: req.method,
      origin: req.headers.get('origin'),
      contentType: req.headers.get('content-type'),
      body: req.method === 'POST' ? await req.text() : '',
      ip,
    },
    {
      enabled: sql !== null,
      allowedOrigins: [env('TEST_ORIGIN')],
      allowedHostnames: [env('TEST_HOSTNAME')],
      verifyTurnstile: async (token) => {
        const [verdict, hostname, action] = token.split(':')
        return verdict === 'pass' ? { success: true, hostname, action } : { success: false }
      },
      rateKeys: (email, clientIp) => rateKeysFor(email, clientIp, env('WAITLIST_RATE_SALT')),
      submit: (payload) => submitWithDatabase(sql!, payload),
      databaseReachable: health,
    },
  )
  console.log(JSON.stringify({ event: 'join', status: out.status }))
  return new Response(out.body || null, { status: out.status, headers: out.headers })
})
