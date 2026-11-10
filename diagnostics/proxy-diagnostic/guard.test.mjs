// Isolation guards for the A3 proxy diagnostic (node --test; temporary
// branch only). They read the diagnostic's own files and fail if it could
// reach anything beyond its job.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'

const here = new URL('.', import.meta.url)
const fnDir = new URL('deploy/supabase/functions/proxy-diagnostic/', here)
const read = (u) => readFileSync(u, 'utf8')
const code = (t) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '').replace(/\s\/\/ .*$/gm, '')
const files = readdirSync(fnDir).sort()
const all = files.map((f) => code(read(new URL(f, fnDir)))).join('\n')

test('the deploy folder holds only the diagnostic, with Supabase key checks on', () => {
  assert.deepEqual(readdirSync(new URL('deploy/supabase/functions/', here)), ['proxy-diagnostic'])
  assert.deepEqual(files, ['diagnose.ts', 'index.ts'])
  const toml = read(new URL('deploy/supabase/config.toml', here)).replace(/^#.*$/gm, '')
  assert.match(toml, /^\[functions\.proxy-diagnostic\]\nverify_jwt = true$/m)
  assert.equal((toml.match(/^\[/gm) ?? []).length, 1, 'config.toml configures nothing else')
  assert.ok(!/verify_jwt\s*=\s*false/.test(toml))
})

test('it reads only its own settings', () => {
  const index = code(read(new URL('index.ts', fnDir)))
  assert.deepEqual([...index.matchAll(/Deno\.env\.[a-zA-Z]+/g)].map((m) => m[0]), ['Deno.env.get'], 'one Deno.env.get, no toObject')
  assert.match(index, /const env = \(k: Setting\) => \(Deno\.env\.get\(k\)/, 'the key is typed to the allowed settings')
  const settings = /export const SETTINGS = \[([^\]]*)\] as const/.exec(all)?.[1]
  assert.equal(settings?.replace(/\s/g, ''), "'DIAG_ENABLED','DIAG_TOKEN_SHA256','DIAG_ACTIVATED_AT','DIAG_EXPIRES_AT','SUPABASE_URL'")
  for (const name of ['WAITLIST_', 'TURNSTILE', 'SERVICE_ROLE', 'SUPABASE_DB_URL', 'SECRET_KEY', 'JWT_SECRET', 'ANON_KEY', 'PUBLISHABLE']) {
    assert.ok(!all.includes(name), `the diagnostic mentions ${name}`)
  }
})

test('it imports nothing, connects to nothing, and stores nothing', () => {
  const imports = [...all.matchAll(/^\s*import\s[^'"]*['"]([^'"]+)['"]/gm)].map((m) => m[1])
  assert.deepEqual(imports, ['./diagnose.ts'])
  for (const [re, what] of [
    [/\bfetch\s*\(/, 'an outgoing request'],
    [/Deno\.(connect|connectTls|open|openKv|writeFile|writeTextFile|mkdir|run|Command|listen)/, 'a connection, file or process'],
    [/postgres|createClient|supabase-js|join-waitlist|\.\.\//, 'a database or the waitlist'],
    [/localStorage|indexedDB|caches\./, 'storage'],
    [/\beval\s*\(|new Function/, 'dynamic code'],
  ]) {
    assert.ok(!re.test(all), `the diagnostic contains ${what} (${re})`)
  }
})

test('it logs one fixed line, and never a header or address', () => {
  const logs = [...all.matchAll(/console\.[a-z]+\(([^\n]*)\)/g)].map((m) => m[1])
  assert.deepEqual(logs, ["JSON.stringify({ event: 'diag', status })"])
})

test('the token is checked as a digest, in constant time', () => {
  assert.match(all, /const matches = constantTimeEqual\(digest, config\.tokenSha256\)/)
  assert.match(all, /return wellFormed && matches && viaSupabaseKey/)
  assert.ok(!/tokenSha256\s*===|===\s*config\.tokenSha256|token\s*===/.test(all), 'no plain comparison of the token')
})

test('every refusal is the same bare 404', () => {
  const index = code(read(new URL('index.ts', fnDir)))
  assert.equal((index.match(/new Response\(/g) ?? []).length, 1)
  assert.match(index, /return new Response\(null, \{ status: 404, headers: NO_STORE \}\)/)
  assert.ok(!/access-control-allow/i.test(index), 'no CORS: it is not for browsers')
})

test('the documented procedure targets staging only, never weakens key checks, never prunes', () => {
  const readme = read(new URL('README.md', here))
  const deploys = [...readme.matchAll(/functions deploy[^\n`]*/g)].map((m) => m[0])
  assert.ok(deploys.length >= 1)
  for (const d of deploys) {
    assert.match(d, /^functions deploy proxy-diagnostic --project-ref kpudeppgokpjhvaqrprn --workdir \S+ --use-api$/, d)
  }
  assert.ok(!/--no-verify-jwt|--prune/.test(readme))
  for (const m of readme.matchAll(/--project-ref (\S+)/g)) assert.equal(m[1], 'kpudeppgokpjhvaqrprn')
})
