// e2e/lib/safe-reply.cjs: test output never carries a reply's free text,
// credentials, tokens, signed links or personal data.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
const { describe, scrub, unlistedCodes, SAFE_CODES } = createRequire(import.meta.url)('../e2e/lib/safe-reply.cjs')

const JWT = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoic2VydmljZV9yb2xlIn0.c2lnbmF0dXJlLXNlY3JldA'
const headers = (t) => ({ get: (k) => (k === 'content-type' ? t : null) })
const SECRETS = [JWT, 'sb_secret_N7UND0UgjKTVK', 'pw-in-url', 'person@example.com', 'token=abc123', 'Traceback', '/object/sign/post-photos/x.jpg?token=', 'drainkey0123456789abcdef', 'hunter2']

test('allowed codes, numbers and booleans are shown; nothing else', () => {
  assert.equal(describe({ status: 422, ms: 12, bytes: 21, headers: headers('application/json; charset=utf-8'), json: { error: 'not_jpeg' } }),
    '422 in 12 ms, application/json, 21 bytes, error=not_jpeg')
  assert.equal(describe({ status: 546, ms: 2100, json: { code: 'WORKER_LIMIT', message: 'Worker hit a limit' } }),
    '546 in 2100 ms, code=WORKER_LIMIT, message withheld')
  assert.equal(describe({ status: 200, ms: 400, json: { uploadId: '6796decc-ecea-40f8-829e-9fcc1e89312c', width: 900, height: 1600 } }),
    '200 in 400 ms, width=900, height=1600, uploadId present')
  assert.equal(describe({ status: 400, json: { code: 'P0001', details: null, hint: null, message: 'upload_not_ready' } }),
    '400 in ? ms, code=P0001, message=upload_not_ready')
  assert.equal(describe({ status: 200, json: '6796decc-ecea-40f8-829e-9fcc1e89312c' }), '200 in ? ms, an id')
})

test('unexpected bodies never reach the output', () => {
  const bodies = [
    { error: `bad token ${JWT}` }, { error: 'person@example.com' }, { code: 'hunter2' }, { message: 'Traceback at /srv: pw-in-url' },
    { photos: { a: { feed: '/object/sign/post-photos/x.jpg?token=abc123' } } }, { key: 'sb_secret_N7UND0UgjKTVK', ok: true },
    { email: 'person@example.com', count: 3 }, { nested: { error: 'not_jpeg', token: JWT } }, [JWT], `<html>${JWT}</html>`,
    'drainkey0123456789abcdef', { error: { message: 'hunter2' } }, { 'person@example.com': 1 }, { uploadId: 'token=abc123' },
  ]
  for (const json of bodies) {
    const out = describe({ status: 500, ms: 1, json, headers: headers('text/html; x=person@example.com') })
    for (const s of SECRETS) assert.ok(!out.includes(s), `${JSON.stringify(json).slice(0, 40)} leaked ${s}: ${out}`)
  }
  assert.ok(describe({ status: 500, json: { 'person@example.com': 1 } }).endsWith('500 in ? ms'))
})

test('scrub masks credentials, tokens and keys in error text', () => {
  const out = scrub(`Command failed: psql postgresql://postgres:pw-in-url@127.0.0.1:54322/postgres
Authorization: Bearer ${JWT} apikey ${JWT} sb_secret_N7UND0UgjKTVK sb_publishable_ACJWlzQH
GET /storage/v1/object/sign/post-photos/a.jpg?token=abc123&x=1`)
  for (const s of [JWT, 'pw-in-url', 'N7UND0UgjKTVK', 'ACJWlzQH', 'token=abc123']) assert.ok(!out.includes(s), `leaked ${s}: ${out}`)
  assert.match(out, /postgresql:\/\/postgres:\*\*\*@127\.0\.0\.1:54322/)
  assert.match(out, /token=\*\*\*&x=1/)
})

test('every error code the photo function returns is listed', () => {
  assert.deepEqual(unlistedCodes(), [])
  assert.ok(SAFE_CODES.size > 20)
})
