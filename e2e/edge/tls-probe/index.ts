// TEST ONLY. Never deployed: it lives outside supabase/functions.
//
// Runs the real join-waitlist database code (db.ts: databaseOptions and the
// pinned postgres.js driver) in Supabase's Edge runtime, against throwaway
// local Postgres servers, to prove that TLS certificate and hostname
// verification really happen and that nothing weakens them.
// Used by scripts/e2e/waitlist-tls.sh, which binds it to this machine only.
//
// POST {"url": "...", "ca": "PEM or empty", "localPlaintext": false}
//   -> {"result": "connected", "ssl": true}
//   -> {"result": "refused_config"}       databaseOptions refused the settings
//   -> {"result": "refused_connection"}   the connection failed (no fallback)

import postgres from 'npm:postgres@3.4.9'
import { databaseOptions } from '../join-waitlist/db.ts'

Deno.serve(async (req: Request) => {
  const { url, ca, localPlaintext } = (await req.json()) as { url: string; ca?: string; localPlaintext?: boolean }
  let db
  try {
    db = databaseOptions(url, { caCert: ca || undefined, localPlaintext: localPlaintext === true })
  } catch (e) {
    return Response.json({ result: 'refused_config', problem: (e as Error).message })
  }
  const sql = postgres(db.url, { ...db.options, connect_timeout: 8, onnotice: () => {} })
  try {
    const rows = await sql`select current_user as who, (select ssl from pg_stat_ssl where pid = pg_backend_pid()) as ssl`
    return Response.json({ result: 'connected', who: rows[0].who, ssl: rows[0].ssl === true })
  } catch (e) {
    return Response.json({ result: 'refused_connection', problem: String((e as Error).message ?? e).slice(0, 160) })
  } finally {
    await sql.end({ timeout: 1 }).catch(() => {})
  }
})
