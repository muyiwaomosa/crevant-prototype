// Supabase Edge Function: waitlist-handoff (BL-009, founder decision D1 option
// A). The ONLY way into the waitlist for the member project: its
// waitlist-bridge function calls this one server to server, with a shared key,
// to export verified, consenting applicants, recheck them, record outcomes, and
// read withdrawals or carry deletions. Runs on the waitlist project or staging
// only (../_shared/policy.ts); anywhere else it reads no secret and stays closed.
//
// Environment (function secrets set by the founder, never in the repository):
//   WAITLIST_HANDOFF_DB_URL  postgres:// URL logging in as waitlist_handoff
//                            (pooler: user waitlist_handoff.<project ref>, port
//                            6543) on THIS project. Any other login, project or
//                            connection setting is refused. Missing = closed.
//   WAITLIST_HANDOFF_KEY     at least 32 random characters, the same value the
//                            member project's waitlist-bridge holds. Missing = closed.
//   WAITLIST_DB_CA_CERT      optional PEM certificate, as for join-waitlist.
//
// It does not read SUPABASE_SERVICE_ROLE_KEY or SUPABASE_DB_URL.
// Deploy with JWT verification off (the key is checked here, and it is not a
// JWT), naming the project explicitly (docs/WAITLIST-HANDOFF.md):
//   supabase functions deploy waitlist-handoff --no-verify-jwt --project-ref <waitlist or staging ref>

import postgres from 'npm:postgres@3.4.9'
import { handleHandoff, keyUsable } from './handler.ts'
import { HANDOFF_ROLE, checkDatabaseTarget, databaseOptions, type Sql } from '../join-waitlist/db.ts'
import { waitlistProjectAllowed } from '../_shared/policy.ts'

const projectAllowed = waitlistProjectAllowed(Deno.env.get('SUPABASE_URL') ?? '')
const env = (k: string) => (projectAllowed ? (Deno.env.get(k) ?? '') : '').trim()
const configProblem = (problem: string) => console.error(JSON.stringify({ fn: 'waitlist-handoff', event: 'config', problem }))
if (!projectAllowed) configProblem('not an approved project for waitlist-handoff (only the waitlist project, staging or local Supabase); closed, no secret read')

let sql: Sql | null = null
try {
  if (env('WAITLIST_HANDOFF_DB_URL')) {
    const target = checkDatabaseTarget(env('WAITLIST_HANDOFF_DB_URL'), env('SUPABASE_URL'), HANDOFF_ROLE)
    const db = databaseOptions(env('WAITLIST_HANDOFF_DB_URL'), { caCert: env('WAITLIST_DB_CA_CERT') || undefined, localPlaintext: target.local, role: HANDOFF_ROLE })
    sql = postgres(db.url, db.options) as unknown as Sql
  }
} catch (e) {
  configProblem((e as Error).message)
}
const key = env('WAITLIST_HANDOFF_KEY')
if (key && !keyUsable(key)) configProblem('WAITLIST_HANDOFF_KEY is shorter than 32 characters or not printable; closed')

const one = async (q: Promise<Array<Record<string, unknown>>>) => (await q)[0]?.result

Deno.serve(async (req: Request) => {
  const out = await handleHandoff(
    {
      method: req.method,
      origin: req.headers.get('origin'),
      authorization: req.headers.get('authorization'),
      contentType: req.headers.get('content-type'),
      body: req.method === 'POST' ? await req.text() : '',
    },
    {
      enabled: sql !== null,
      key,
      exportRows: (limit) => one(sql!`select waitlist_api.handoff_export(${limit}) as result`),
      confirm: (ids) => one(sql!`select waitlist_api.handoff_confirm(${ids}::uuid[]) as result`),
      recheck: (ids, replacement) => one(sql!`select waitlist_api.handoff_recheck(${ids}::uuid[], ${replacement}) as result`),
      record: (id, outcome) => one(sql!`select waitlist_api.handoff_record(${id}::uuid, ${outcome}) as result`),
      withdrawals: (since) => one(sql!`select waitlist_api.handoff_withdrawals(${since}::timestamptz) as result`),
      forget: (ids) => one(sql!`select waitlist_api.handoff_forget(${ids}::uuid[]) as result`),
      forgetEmail: (email) => one(sql!`select waitlist_api.handoff_forget_email(${email}) as result`),
    },
  )
  // The status and a fixed note only: never an address, id list or key.
  console.log(JSON.stringify({ fn: 'waitlist-handoff', status: out.status, ...(out.logNote ? { reason: out.logNote } : {}) }))
  return new Response(out.body, { status: out.status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } })
})
