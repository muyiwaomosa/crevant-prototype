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
 * The addresses Supabase gives a function as SUPABASE_URL. Hosted:
 * https://<project ref>.supabase.co. Local (supabase start / functions
 * serve): http://kong:8000, or this machine for the isolated tests. Secrets
 * can't override it (Supabase refuses secret names starting with SUPABASE_).
 */
const HOSTED_SUPABASE_URL = /^https:\/\/([a-z0-9]{20})\.supabase\.co$/
const LOCAL_SUPABASE_URL = /^http:\/\/(kong:8000|127\.0\.0\.1:\d{2,5}|localhost:\d{2,5})$/
/** Supabase's connection pooler, e.g. aws-0-us-west-2.pooler.supabase.com. */
const POOLER_HOST = /^[a-z0-9-]+\.pooler\.supabase\.com$/

function parseDatabaseUrl(rawUrl: string): URL {
  let u: URL
  try {
    u = new URL(rawUrl)
  } catch {
    throw new Error('WAITLIST_DB_URL is not a valid URL')
  }
  if (u.protocol !== 'postgres:' && u.protocol !== 'postgresql:') throw new Error('WAITLIST_DB_URL must be a postgres:// URL')
  // Connection settings in the URL (sslmode, ssl, options, ...) could weaken
  // TLS or change the login, so none are accepted. TLS is set in code only.
  if (u.search || u.hash || /[?#]/.test(rawUrl.slice(rawUrl.lastIndexOf('@') + 1))) throw new Error('WAITLIST_DB_URL must not contain connection settings (nothing after ?)')
  return u
}

function hostOf(u: URL): string {
  return u.hostname.replace(/^\[|\]$/g, '').toLowerCase()
}

export interface DatabaseTarget {
  /** The project the function belongs to, or null when running locally. */
  ref: string | null
  /** True only for a local Supabase, where the database may be on this machine without TLS. */
  local: boolean
}

/**
 * Checks that WAITLIST_DB_URL points at the database of the project this
 * function runs in, as Supabase itself reports it in SUPABASE_URL, so a
 * staging function can never be given another project's database (or the
 * reverse). Fails closed: anything it doesn't recognise is refused.
 *
 * Hosted, the URL must be either
 *   the pooler:  waitlist_writer.<ref> @ <region>.pooler.supabase.com:6543
 *   direct:      waitlist_writer       @ db.<ref>.supabase.co:5432
 * with <ref> equal to the project in SUPABASE_URL. A local database is only
 * accepted when SUPABASE_URL is itself local.
 */
export function checkDatabaseTarget(rawUrl: string, supabaseUrl: string): DatabaseTarget {
  const u = parseDatabaseUrl(rawUrl)
  const user = decodeURIComponent(u.username)
  const host = hostOf(u)
  const port = u.port || '5432'
  const hosted = HOSTED_SUPABASE_URL.exec(supabaseUrl.trim())
  if (hosted) {
    const ref = hosted[1]
    if (POOLER_HOST.test(host)) {
      if (port !== '6543') throw new Error('WAITLIST_DB_URL must use the transaction pooler port, 6543')
      if (user !== `${WRITER_ROLE}.${ref}`) throw new Error("WAITLIST_DB_URL must log in as waitlist_writer on this function's own project")
      return { ref, local: false }
    }
    if (host === `db.${ref}.supabase.co`) {
      if (port !== '5432') throw new Error('WAITLIST_DB_URL must use port 5432 for a direct connection')
      if (user !== WRITER_ROLE) throw new Error('WAITLIST_DB_URL must log in as waitlist_writer')
      return { ref, local: false }
    }
    throw new Error("WAITLIST_DB_URL must point at this function's own Supabase project (pooler or direct host)")
  }
  if (LOCAL_SUPABASE_URL.test(supabaseUrl.trim())) {
    if (!LOCAL_HOSTS.includes(host)) {
      throw new Error('a local function may only use a local database')
    }
    if (user !== WRITER_ROLE) throw new Error('WAITLIST_DB_URL must log in as waitlist_writer')
    return { ref: null, local: true }
  }
  throw new Error('SUPABASE_URL is missing or not a recognised Supabase address, so the project cannot be confirmed')
}

/** A PEM certificate (public), never a private key or anything else. */
function checkCaCertificate(ca: string): string {
  const pem = ca.trim()
  const block = /^-----BEGIN CERTIFICATE-----\r?\n[A-Za-z0-9+/=\r\n]+-----END CERTIFICATE-----$/
  const blocks = pem.split(/(?<=-----END CERTIFICATE-----)\s*/).filter(Boolean)
  if (!blocks.length || !blocks.every((b) => block.test(b.trim())) || /PRIVATE KEY/.test(pem)) {
    throw new Error('WAITLIST_DB_CA_CERT must be one or more PEM certificates')
  }
  return pem
}

/**
 * Checks the connection URL and builds the client options, or explains why
 * it refuses. Refuses any login but waitlist_writer (plain, or
 * waitlist_writer.<project ref> as the Supabase pooler expects), so a broader
 * credential can never be used by mistake. TLS with full certificate and
 * hostname verification is always on, except for a database on this machine
 * when the caller has established it is running locally
 * (checkDatabaseTarget). There is no setting, here or in the URL, that turns
 * verification off, and a failed connection is never retried with weaker
 * settings.
 */
export function databaseOptions(rawUrl: string, opts: { caCert?: string; localPlaintext?: boolean } = {}): DatabaseOptions {
  const u = parseDatabaseUrl(rawUrl)
  const user = decodeURIComponent(u.username)
  if (!(user === WRITER_ROLE || /^waitlist_writer\.[a-z0-9]{20}$/.test(user))) {
    throw new Error('WAITLIST_DB_URL must log in as waitlist_writer, the restricted waitlist role')
  }
  if (!u.password) throw new Error('WAITLIST_DB_URL has no password')
  const host = hostOf(u)
  const plaintext = opts.localPlaintext === true && LOCAL_HOSTS.includes(host)
  const ca = opts.caCert ? checkCaCertificate(opts.caCert) : undefined
  return {
    url: rawUrl,
    options: {
      ssl: plaintext ? false : { rejectUnauthorized: true, servername: host, ...(ca ? { ca } : {}) },
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

/** The health check: proves the waitlist_writer login can connect. Reads no data. */
export async function databaseReachable(sql: Sql | null): Promise<boolean> {
  if (!sql) return false
  const rows = await sql`select 1 as ok`
  return rows[0]?.ok === 1
}
