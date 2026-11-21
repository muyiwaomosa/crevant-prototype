// Every GitHub workflow that connects to a hosted Supabase database verifies
// the server's certificate and host name (sslmode=verify-full) against
// Supabase's public root CA, committed at config/certs. Before this, four
// workflows used sslmode=require, which encrypts but checks nothing.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { X509Certificate } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'

const CA_PATH = 'config/certs/supabase-root-2021-ca.crt'
// Supabase Root 2021 CA, as downloaded from Supabase and compared with the
// certificate from the staging project's dashboard (docs/WAITLIST.md).
const CA_SHA256 = '80:70:25:AD:50:D4:ED:21:9D:2C:9C:7D:29:9C:00:4F:82:4E:B0:0C:F7:F6:5A:FE:F6:07:D0:7B:72:E6:CA:FA'
const SECRET = /secrets\.(STAGING_DATABASE_URL|PRODUCTION_DATABASE_URL|MEMBERS_PRODUCTION_DATABASE_URL|WAITLIST_ADMIN_DATABASE_URL)\b/
const JOB_ENV = [
  '    env:',
  '      PGSSLMODE: verify-full',
  '      PGSSLROOTCERT: ${{ github.workspace }}/config/certs/supabase-root-2021-ca.crt',
  "      REQUIRE_VERIFY_FULL: '1'",
].join('\n')

const read = (p) => readFileSync(p, 'utf8')
const workflows = execFileSync('git', ['ls-files', '.github/workflows'], { encoding: 'utf8' }).split('\n').filter((f) => /\.ya?ml$/.test(f))

function jobsOf(text) {
  const body = text.slice(text.search(/^jobs:$/m))
  const starts = [...body.matchAll(/^ {2}([A-Za-z0-9_-]+):$/gm)]
  return starts.map((m, i) => ({ name: m[1], text: body.slice(m.index, i + 1 < starts.length ? starts[i + 1].index : undefined) }))
}

test('the committed CA is exactly Supabase Root 2021 CA: a public CA certificate, nothing else', () => {
  const pem = read(CA_PATH)
  assert.equal((pem.match(/-----BEGIN CERTIFICATE-----/g) ?? []).length, 1, 'one certificate')
  assert.ok(!/PRIVATE KEY|BEGIN (RSA|EC|ENCRYPTED)/.test(pem), 'no key material')
  const cert = new X509Certificate(pem)
  assert.equal(cert.fingerprint256, CA_SHA256)
  assert.ok(cert.ca, 'a CA certificate')
  assert.match(cert.subject, /CN=Supabase Root 2021 CA/)
  assert.ok(new Date(cert.validTo).getTime() - Date.now() > 180 * 86400e3, `renew before ${cert.validTo}`)
})

test('the workflows that use a hosted database secret are the expected eleven', () => {
  const users = workflows.filter((f) => SECRET.test(read(f))).sort()
  assert.deepEqual(users, [
    '.github/workflows/deploy-db-members-production.yml',
    '.github/workflows/deploy-db-production.yml',
    '.github/workflows/deploy-db-staging.yml',
    '.github/workflows/members-activate-member-access.yml',
    '.github/workflows/staging-activate-member-access.yml',
    '.github/workflows/staging-photo-cleanup-check.yml',
    '.github/workflows/staging-photo-cleanup-schedule.yml',
    '.github/workflows/staging-remove-pg-net.yml',
    '.github/workflows/waitlist-admin-production.yml',
    '.github/workflows/waitlist-admin.yml',
    '.github/workflows/waitlist-rollback-staging.yml',
  ])
})

test('every job that uses a hosted database secret sets verify-full, the committed CA and REQUIRE_VERIFY_FULL', () => {
  for (const f of workflows) {
    for (const job of jobsOf(read(f))) {
      if (!SECRET.test(job.text)) continue
      assert.ok(job.text.includes(JOB_ENV), `${f} job ${job.name} lacks the verify-full job env`)
    }
  }
})

test('no workflow weakens or overrides it', () => {
  for (const f of workflows) {
    const text = read(f).replace(/^\s*#.*$/gm, '')
    assert.ok(!/sslmode\s*[=:]\s*['"]?(require|prefer|allow|disable|verify-ca)/i.test(text), `${f} weakens sslmode`)
    assert.ok(!/PGSSLMODE:[ \t]*(?![ \t]|verify-full\b)/.test(text), `${f} sets PGSSLMODE to something other than verify-full`)
    for (const m of text.matchAll(/PGSSLROOTCERT:\s*(.+)/g)) {
      assert.equal(m[1].trim(), '${{ github.workspace }}/config/certs/supabase-root-2021-ca.crt', `${f} uses another root certificate`)
    }
    assert.equal((text.match(/PGSSLMODE:/g) ?? []).length, (text.match(/PGSSLROOTCERT:/g) ?? []).length, `${f}: every PGSSLMODE comes with the CA`)
    assert.ok(!/sslrootcert|PGSSLCERT|PGSSLKEY|NODE_TLS_REJECT_UNAUTHORIZED|--insecure|-k\s/.test(text), `${f} adds another TLS setting`)
  }
})

test('the target checks refuse a URL that would override verify-full', () => {
  for (const s of ['scripts/db/verify-staging-target.sh', 'scripts/db/verify-production-target.sh', 'scripts/db/verify-members-target.sh']) {
    const t = read(s)
    assert.match(t, /REQUIRE_VERIFY_FULL/)
    assert.match(t, /any\(k != "sslmode" for k in params\) or params\.get\("sslmode", \["verify-full"\]\) != \["verify-full"\]/)
  }
})

test('no private key is committed anywhere', () => {
  const files = execFileSync('git', ['ls-files'], { encoding: 'utf8' }).split('\n').filter(Boolean)
  for (const f of files) {
    if (/\.(png|jpe?g|webp|gif|ico|woff2?|mp4|webm|pdf)$/i.test(f)) continue
    let text
    try { text = read(f) } catch { continue }
    // A real key has a long encoded body; tests use short fake ones like "abc".
    assert.ok(!/-----BEGIN [A-Z ]*PRIVATE KEY-----\s+[A-Za-z0-9+/=\s]{100,}-----END/.test(text), `${f} contains a private key`)
  }
})
