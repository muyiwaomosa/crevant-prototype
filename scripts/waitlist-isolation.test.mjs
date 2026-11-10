// Guards for the waitlist's deployable code (node --test, run by npm test).
//
// 1. Test substitutions stay under e2e/: nothing deployable (supabase/functions)
//    may contain the Turnstile stand-in, Cloudflare's always-pass test keys,
//    the test probe, or any switch that skips verification.
// 2. The deployed entry point keeps its safeguards: real Turnstile, the
//    project identity check, a required hop count, no privileged credential,
//    no way to weaken TLS.
// 3. Nothing deploys anything but join-waitlist (the A3 proxy diagnostic is
//    not part of this repository's main branch).
// 4. The staging rollback's inventory names every object the two waitlist
//    migrations create, so a rollback can never leave one behind silently.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

const root = new URL('..', import.meta.url).pathname
const read = (p) => readFileSync(join(root, p), 'utf8')
const walk = (dir) =>
  readdirSync(join(root, dir)).flatMap((n) => {
    const p = join(dir, n)
    return statSync(join(root, p)).isDirectory() ? walk(p) : [p]
  })
// Code only: comments may name what the code must not do.
const code = (text) => text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '').replace(/\s\/\/ .*$/gm, '')

test('supabase/functions holds only the join-waitlist function', () => {
  assert.deepEqual(readdirSync(join(root, 'supabase/functions')).sort(), ['join-waitlist'])
})

test('no test substitution or verification bypass in deployable code', () => {
  const forbidden = [
    [/TEST ONLY/, 'a test-only file'],
    [/TEST_ORIGIN|TEST_HOSTNAME/, 'the test settings'],
    [/verdict === 'pass'|'pass:'|"pass:"/, 'the Turnstile stand-in'],
    [/[123]x0{15,}[A-Z]{2}/, "Cloudflare's always-pass or always-fail test keys"],
    [/e2e\/|tls-probe|waitlist-e2e/, 'a reference to test code'],
    [/SKIP_TURNSTILE|TURNSTILE_BYPASS|BYPASS|DISABLE_TURNSTILE|DUMMY/i, 'a bypass switch'],
    [/rejectUnauthorized:\s*false|sslmode|['"](prefer|allow|require|disable)['"]/, 'a way to weaken TLS'],
  ]
  for (const f of walk('supabase/functions').filter((p) => !p.endsWith('.test.ts'))) {
    const text = code(read(f))
    for (const [re, what] of forbidden) assert.ok(!re.test(text), `${f} contains ${what} (${re})`)
  }
})

test('the deployed entry point keeps every safeguard', () => {
  const index = code(read('supabase/functions/join-waitlist/index.ts'))
  assert.match(index, /verifyTurnstile: \(token, clientIp\) => verifyWithCloudflare\(token, clientIp, env\('TURNSTILE_SECRET_KEY'\), fetch\)/)
  assert.match(index, /env\('TURNSTILE_SECRET_KEY'\) !== ''/, 'closed without the Turnstile secret')
  assert.match(index, /checkDatabaseTarget\(env\('WAITLIST_DB_URL'\), env\('SUPABASE_URL'\)\)/, 'project identity from SUPABASE_URL')
  assert.match(index, /localPlaintext: target\.local/, 'the local exception comes only from the identity check')
  assert.match(index, /parseTrustedHops\(env\('WAITLIST_TRUSTED_PROXY_HOPS'\)\)/)
  assert.match(index, /trustedHops !== null &&/, 'closed without a confirmed hop count')
  assert.ok(!/WAITLIST_TRUSTED_PROXY_HOPS'\)\s*\|\|/.test(index), 'no default hop count')
  assert.ok(!/SUPABASE_DB_URL|SUPABASE_SERVICE_ROLE_KEY|SUPABASE_SECRET|service_role/.test(index), 'no privileged credential is read')
  const handler = code(read('supabase/functions/join-waitlist/handler.ts'))
  assert.match(handler, /'https:\/\/challenges\.cloudflare\.com\/turnstile\/v0\/siteverify'/)
  assert.ok(!/trustedHops = 1|trustedHops\?/.test(handler), 'clientIpFrom has no default hop count')
})

test('every e2e/edge file is marked test only', () => {
  for (const f of walk('e2e/edge')) assert.match(read(f), /^\/\/ TEST ONLY\. Never deployed/, f)
})

test('nothing deploys any function but join-waitlist', () => {
  const files = [...walk('.github'), ...walk('scripts'), ...walk('docs'), 'package.json'].filter((p) => !p.endsWith('.test.mjs'))
  for (const f of files) {
    for (const m of read(f).matchAll(/functions deploy\s+([^\s`'"]+)/g)) {
      assert.equal(m[1], 'join-waitlist', `${f} deploys ${m[1]}`)
    }
  }
})

test('the staging rollback inventory covers every object the waitlist migrations create', () => {
  const sql = read('scripts/db/staging-rollback-waitlist.sql')
  const inventory = [...sql.matchAll(/^\s*\(\s*\d+,\s*'([^']+)',\s*'([^']+)'/gm)].map((m) => [m[1], m[2]])
  const names = inventory.map(([, n]) => n)
  const migrations = ['supabase/migrations/20261110000000_waitlist.sql', 'supabase/migrations/20261111000000_waitlist_admin_tools.sql'].map(read).join('\n')
  const created = [
    ...[...migrations.matchAll(/^create (?:or replace )?function ([a-z_.]+)\(/gm)].map((m) => ['function', m[1]]),
    ...[...migrations.matchAll(/^create table ([a-z_.]+)/gm)].map((m) => ['table', m[1]]),
    ...[...migrations.matchAll(/^create view ([a-z_.]+)/gm)].map((m) => ['view', m[1]]),
    ...[...migrations.matchAll(/^create schema ([a-z_]+)/gm)].map((m) => ['schema', m[1]]),
    ...[...migrations.matchAll(/^create trigger ([a-z_]+)/gm)].map((m) => ['trigger', m[1]]),
    ...[...migrations.matchAll(/create role ([a-z_]+) login/g)].map((m) => ['role', m[1]]),
  ]
  assert.ok(created.length >= 30, `found ${created.length} created objects`)
  for (const [kind, name] of created) {
    const hit = inventory.some(([k, n]) => k === kind && (n === name || n.startsWith(`${name}(`) || n.startsWith(`${name} on `)))
    assert.ok(hit, `the rollback inventory is missing ${kind} ${name}`)
  }
  // And nothing else: every inventory function or table comes from these migrations.
  for (const [kind, name] of inventory.filter(([k]) => ['function', 'table', 'view', 'schema'].includes(k))) {
    assert.ok(created.some(([k, n]) => k === kind && name.split('(')[0] === n), `the rollback inventory names ${kind} ${name}, which these migrations did not create`)
  }
  assert.ok(names.includes('20261110000000 waitlist') && names.includes('20261111000000 waitlist_admin_tools'))
})
