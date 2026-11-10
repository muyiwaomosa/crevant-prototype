// Database access for the join-waitlist function, kept free of Deno and npm
// imports so it can be unit tested. index.ts creates the real postgres.js
// client from these options and passes it in.
//
// The function connects as the dedicated waitlist_writer login, which can
// call waitlist_api.submit and nothing else. It never uses the Supabase
// service role key or the platform's own database URL.

import type { SubmitPayload, SubmitResult } from './handler.ts'

/** The subset of a postgres.js `sql` tagged template this module uses. */
export type Sql = (strings: TemplateStringsArray, ...values: unknown[]) => Promise<Array<Record<string, unknown>>>

export const WRITER_ROLE = 'waitlist_writer'

export interface DatabaseOptions {
  url: string
  /** postgres.js options: TLS, no prepared statements (transaction pooler), one connection. */
  options: {
    ssl: false | { rejectUnauthorized: true; ca?: string; servername: string }
    prepare: false
    max: 1
    idle_timeout: number
    connect_timeout: number
  }
}

const LOCAL_HOSTS = ['127.0.0.1', 'localhost', '::1']

/**
 * Checks the connection URL and builds the client options, or explains why
 * it refuses. Refuses any login but waitlist_writer (plain, or
 * waitlist_writer.<project ref> as the Supabase pooler expects), so a broader
 * credential can never be used by mistake. Anything but a local test database
 * must use TLS with full certificate verification.
 */
export function databaseOptions(rawUrl: string, caCert?: string): DatabaseOptions {
  let u: URL
  try {
    u = new URL(rawUrl)
  } catch {
    throw new Error('WAITLIST_DB_URL is not a valid URL')
  }
  if (u.protocol !== 'postgres:' && u.protocol !== 'postgresql:') throw new Error('WAITLIST_DB_URL must be a postgres:// URL')
  const user = decodeURIComponent(u.username)
  if (!(user === WRITER_ROLE || /^waitlist_writer\.[a-z0-9]{20}$/.test(user))) {
    throw new Error('WAITLIST_DB_URL must log in as waitlist_writer, the restricted waitlist role')
  }
  if (!u.password) throw new Error('WAITLIST_DB_URL has no password')
  const host = u.hostname.replace(/^\[|\]$/g, '')
  const local = LOCAL_HOSTS.includes(host)
  return {
    url: rawUrl,
    options: {
      ssl: local ? false : { rejectUnauthorized: true, servername: host, ...(caCert ? { ca: caCert } : {}) },
      prepare: false,
      max: 1,
      idle_timeout: 20,
      connect_timeout: 10,
    },
  }
}

const RESULTS: SubmitResult[] = ['ok', 'closed', 'invalid', 'notice_changed', 'rate_limited']

/** Calls waitlist_api.submit with bound parameters (never string building). */
export async function submitWithDatabase(sql: Sql, p: SubmitPayload): Promise<SubmitResult> {
  const rows = await sql`select waitlist_api.submit(
    ${p.email}, ${p.interests}::text[], ${p.sharesContent}, ${p.platform}, ${p.audienceBand}, ${p.source},
    ${p.ageConfirmed}, ${p.waitlistConsent}, ${p.noticeVersion}, ${p.emailKey}, ${p.clientKey}
  ) as result`
  const out = rows[0]?.result
  if (typeof out === 'string' && (RESULTS as string[]).includes(out)) return out as SubmitResult
  throw new Error('unexpected result from waitlist_api.submit')
}
