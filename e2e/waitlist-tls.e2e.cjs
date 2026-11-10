// TLS checks for the join-waitlist database code (db.ts) running in
// Supabase's Edge runtime. Started by scripts/e2e/waitlist-tls.sh, which
// provides throwaway local servers and certificates:
//   PROBE_URL   the test-only probe (e2e/edge/tls-probe)
//   CERTS       folder with ca.crt (right), wrong-ca.crt and server.key
//   WRITER_PW   the throwaway waitlist_writer password on both servers
//   TLS_PORT    a server that only accepts TLS, certificate for db.tls.test
//   PLAIN_PORT  a server with no TLS at all
// Every check prints PASS or FAIL; the process exits non zero on any failure.

const { readFileSync } = require('node:fs')
const path = require('node:path')

const { PROBE_URL, CERTS, WRITER_PW, TLS_PORT, PLAIN_PORT } = process.env
const CA = readFileSync(path.join(CERTS, 'ca.crt'), 'utf8')
const WRONG_CA = readFileSync(path.join(CERTS, 'wrong-ca.crt'), 'utf8')
const KEY = readFileSync(path.join(CERTS, 'server.key'), 'utf8')
const url = (host, port, query = '') => `postgresql://waitlist_writer:${WRITER_PW}@${host}:${port}/postgres${query}`

let failures = 0
const check = (name, ok, detail = '') => {
  if (!ok) failures++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`)
}
async function probe(body) {
  const res = await fetch(PROBE_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  return res.json()
}
// The probe's messages must never carry the password back.
const safe = (r) => JSON.stringify(r).replaceAll(WRITER_PW, '<password>').slice(0, 140)

;(async () => {
  for (let i = 0; i < 90; i++) {
    try {
      await probe({ url: 'x' })
      break
    } catch {
      await new Promise((r) => setTimeout(r, 2000))
    }
  }

  const ok = await probe({ url: url('db.tls.test', TLS_PORT), ca: CA })
  check('the right CA and hostname connect, over TLS, as waitlist_writer', ok.result === 'connected' && ok.ssl === true && ok.who === 'waitlist_writer', safe(ok))

  const cases = [
    ['without the CA (not publicly trusted), the connection is refused', { url: url('db.tls.test', TLS_PORT) }, 'refused_connection'],
    ['with the wrong CA, the connection is refused', { url: url('db.tls.test', TLS_PORT), ca: WRONG_CA }, 'refused_connection'],
    ['with the right CA but the wrong hostname, the connection is refused', { url: url('other.tls.test', TLS_PORT), ca: CA }, 'refused_connection'],
    ['a server without TLS is refused (no plain text fallback)', { url: url('db.tls.test', PLAIN_PORT), ca: CA }, 'refused_connection'],
    ['the local exception never applies to another host: no TLS is still refused', { url: url('db.tls.test', PLAIN_PORT), ca: CA, localPlaintext: true }, 'refused_connection'],
    ['sslmode=disable in the URL is refused before connecting', { url: url('db.tls.test', PLAIN_PORT, '?sslmode=disable'), ca: CA }, 'refused_config'],
    ['sslmode=prefer in the URL is refused before connecting', { url: url('db.tls.test', PLAIN_PORT, '?sslmode=prefer'), ca: CA }, 'refused_config'],
    ['sslmode=require (no verification) in the URL is refused before connecting', { url: url('db.tls.test', TLS_PORT, '?sslmode=require') }, 'refused_config'],
    ['ssl=false in the URL is refused before connecting', { url: url('db.tls.test', PLAIN_PORT, '?ssl=false'), ca: CA }, 'refused_config'],
    ['a private key given as the CA is refused', { url: url('db.tls.test', TLS_PORT), ca: KEY }, 'refused_config'],
    ['junk given as the CA is refused', { url: url('db.tls.test', TLS_PORT), ca: 'false' }, 'refused_config'],
    ['the database owner login is refused, even over good TLS', { url: `postgresql://postgres:x@db.tls.test:${TLS_PORT}/postgres`, ca: CA }, 'refused_config'],
  ]
  for (const [name, body, want] of cases) {
    const r = await probe(body)
    check(name, r.result === want, safe(r))
  }

  const bundle = await probe({ url: url('db.tls.test', TLS_PORT), ca: `${WRONG_CA}\n${CA}` })
  check('a CA bundle that includes the right CA connects', bundle.result === 'connected' && bundle.ssl === true, safe(bundle))

  console.log(failures ? `\n${failures} CHECK(S) FAILED` : '\nALL CHECKS PASSED')
  process.exit(failures ? 1 : 0)
})().catch((e) => {
  console.error(String(e).replaceAll(WRITER_PW, '<password>'))
  process.exit(1)
})
