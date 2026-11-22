// Guards for the avatar Edge Function (Build 5.2b; node --test, run by npm test).
//
// 1. The vendored jpeg-js 0.4.4 is the reviewed upstream code, byte for byte,
//    plus one export line per file.
// 2. The entry point serves only the staging project (or local Supabase),
//    reads only the keys Supabase provides (the new publishable and secret
//    keys first, the legacy ones only as a fallback: ../_shared/keys.ts), and
//    verifies every caller with Supabase Auth itself (the gateway JWT check is
//    off for ES256 sessions).
// 3. The handler never trusts a member id or storage path from the browser,
//    asks the database as the caller before any privileged step, and keeps
//    the approved limits.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const root = new URL('..', import.meta.url).pathname
const read = (p) => readFileSync(join(root, p), 'utf8')
const code = (text) => text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '').replace(/\s\/\/ .*$/gm, '')
const dir = 'supabase/functions/avatar'

test('the vendored jpeg-js is the reviewed 0.4.4 code plus one export line', () => {
  for (const [file, sha, line] of [
    ['decoder.js', 'a3f175fd6f62d142aad94d3bd90f3a30be4e076baf9b6a6fa31c8e84d9d4aa9f', 'export { decode }'],
    ['encoder.js', '00bde8df2517eca556669ab6fc27b414e9ba3fc52a0a71e1e37ec7c5f19c3d34', 'export { encode }'],
  ]) {
    const text = read(`${dir}/vendor/jpeg-js-0.4.4/${file}`)
    const suffix = `\n// VENDORED (Splitpost): the one line added to the upstream file, so it loads as an ES module.\n${line}\n`
    assert.ok(text.endsWith(suffix), `${file} ends with exactly the one added line`)
    assert.equal(createHash('sha256').update(text.slice(0, -suffix.length)).digest('hex'), sha, `${file} matches upstream jpeg-js 0.4.4`)
  }
  assert.match(read(`${dir}/vendor/jpeg-js-0.4.4/LICENSE`), /Copyright \(c\) 2014, Eugene Ware/)
})

test('no remote or npm import: nothing is downloaded at deploy or run time', () => {
  for (const f of ['index.ts', 'handler.ts', 'image.ts']) {
    const imports = [...code(read(`${dir}/${f}`)).matchAll(/from\s+['"]([^'"]+)['"]/g)].map((m) => m[1])
    // Local files, plus the shared project and origin policy (Phase 1B-2) and project keys, nothing else.
    for (const i of imports) assert.ok(i.startsWith('./') || i === '../_shared/policy.ts' || i === '../_shared/keys.ts', `${f} imports ${i}`)
  }
})

test('the entry point serves only the projects the shared policy allows, with the provided keys only', () => {
  const index = code(read(`${dir}/index.ts`))
  // Phase 1B-2: no project reference or origin of its own; both come from ../_shared/policy.ts.
  assert.ok(!/'[a-z0-9]{20}'/.test(index), 'no project reference in the entry point')
  assert.ok(!/vercel\.app|splitpost\.ca/.test(index), 'no origin in the entry point')
  assert.match(index, /const role = memberFunctionRole\(url\)/)
  assert.match(index, /corsHeaders\(role, req\.headers\.get\('origin'\)\)/)
  assert.match(index, /\[BUILD_HEADER\]: BUILD_ID/)
  assert.match(index, /if \(!configured\) \{\s*return respond\(new Response\(JSON\.stringify\(\{ error: 'unavailable' \}\), \{ status: 503/)
  const envs = [...index.matchAll(/env\('([A-Z_]+)'\)/g)].map((m) => m[1]).sort()
  assert.deepEqual(envs, ['SUPABASE_URL'], 'the project address directly; keys only through ../_shared/keys.ts')
  // Keys (../_shared/keys.ts): the new publishable and secret keys first, the legacy keys only as a fallback.
  assert.match(index, /const keys = projectKeys\(env\)/)
  assert.match(index, /const configured = role !== null && publishable !== '' && service !== ''/)
  assert.match(index, /const asService = serviceHeaders\(service\)/, 'the secret key is sent as keys.ts says (apikey only for a new key)')
  assert.match(index, /serviceRpc: \(fn, body\) => rpc\(asService, fn, body\)/)
  assert.match(index, /headers: \{ \.\.\.\(init\.headers \?\? \{\}\), \.\.\.asService \}/, 'Storage gets the service headers last, so nothing overrides them')
  assert.match(index, /userRpc: \(token, fn, body, key\) => rpc\(\{ apikey: key \?\? publishable, Authorization: `Bearer \$\{token\}` \}, fn, body\)/, 'caller calls use the publishable key, never the secret key')
  assert.equal((index.match(/\bservice\b/g) ?? []).length, 3, 'the secret key is used only to decide configured and to build the service headers')
  assert.match(index, /else log\('keys', \{ publishable: keys\.styles\.publishable \?\? 'none', secret: keys\.styles\.secret \?\? 'none' \}\)/, 'only which kind of key is logged')
  for (const line of index.split('\n').filter((l) => /\blog\(/.test(l))) {
    const args = line.replace(/keys\.styles\.(publishable|secret)/g, '').replace(/\b(publishable|secret): /g, '')
    assert.ok(!/\b(service|publishable|asService|keys\.(secret|publishable)|key|token)\b/.test(args), `no key is ever logged: ${line.trim()}`)
  }
  const keys = code(read('supabase/functions/_shared/keys.ts'))
  assert.deepEqual([...keys.matchAll(/'(SUPABASE_[A-Z_]+)'/g)].map((m) => m[1]).sort(),
    ['SUPABASE_ANON_KEY', 'SUPABASE_PUBLISHABLE_KEY', 'SUPABASE_PUBLISHABLE_KEYS', 'SUPABASE_SECRET_KEY', 'SUPABASE_SECRET_KEYS', 'SUPABASE_SERVICE_ROLE_KEY'])
  assert.ok(!/console\.|fetch\(/.test(keys), 'keys.ts neither logs nor sends anything')
  // The gateway check is off ON PURPOSE: the function verifies every caller with Supabase Auth.
  assert.match(read('supabase/config.toml'), /\[functions\.avatar\]\nverify_jwt = false/)
  assert.match(index, /fetch\(`\$\{url\}\/auth\/v1\/user`, \{ headers: \{ apikey: key \?\? publishable, Authorization: `Bearer \$\{token\}` \} \}\)/)
  assert.match(index, /user\.aud === 'authenticated' && user\.role === 'authenticated'/)
})

test('every request is authenticated with Supabase Auth before anything else', () => {
  const h = code(read(`${dir}/handler.ts`))
  const verify = h.indexOf('if (!(await deps.verifyUser(token, key))) return json(401')
  assert.ok(verify > 0, 'the handler verifies the caller')
  for (const later of ["action === 'upload'", 'readBody(req', 'readJson(req', 'deps.userRpc', 'deps.serviceRpc', 'deps.upload', 'deps.remove', 'deps.sign']) {
    const at = h.indexOf(later, h.indexOf('export async function handle'))
    assert.ok(at > verify, `${later} comes after authentication`)
  }
  assert.match(h, /\/\^sb_publishable_\[A-Za-z0-9_-\]\{10,200\}\$\//, 'only a publishable key is taken from the request')
})

test('the handler asks the database as the caller first, and trusts no id or path from the browser', () => {
  const h = code(read(`${dir}/handler.ts`))
  assert.ok(!/body\??\.(path|paths|user|userId|user_id|member|memberId|owner)\b/.test(h), 'no member id or path is read from the request')
  // Upload: header check, then the caller's authorization, then decode/re-encode, then storage, then commit.
  const order = ['checkHeader(bytes)', "asCaller('app_avatar_begin'", 'reencode(bytes)', 'deps.upload(path, clean)', "deps.serviceRpc('svc_avatar_commit'"]
  const at = order.map((s) => h.indexOf(s))
  assert.ok(at.every((i) => i >= 0) && at.every((i, k) => k === 0 || i > at[k - 1]), `upload steps in order: ${at}`)
  // Every privileged action is preceded by the caller's own database check.
  for (const [action, check] of [['remove', "'app_avatar_remove'"], ['urls', "'app_avatars'"], ['cleanup', "'app_mod_storage_cleanup_start'"]]) {
    const block = h.slice(h.indexOf(`action === '${action}'`))
    assert.ok(block.indexOf(`asCaller(${check}`) >= 0 && block.indexOf(`asCaller(${check}`) < Math.max(block.indexOf('deps.remove('), block.indexOf('deps.sign(')), `${action}: the caller's check comes first`)
  }
  assert.match(h, /if \(!token\) return json\(401, \{ error: 'not_signed_in' \}\)/)
  assert.match(h, /const LINK_SECONDS = 3600/)
  const image = code(read(`${dir}/image.ts`))
  assert.match(image, /export const SIZE = 512/)
  assert.match(image, /export const MAX_STORED_BYTES = 200 \* 1024/)
  assert.match(image, /maxResolutionInMP: 1, maxMemoryUsageInMB: 64, tolerantDecoding: false/)
})
