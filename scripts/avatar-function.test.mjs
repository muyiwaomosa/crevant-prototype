// Guards for the avatar Edge Function (Build 5.2b; node --test, run by npm test).
//
// 1. The vendored jpeg-js 0.4.4 is the reviewed upstream code, byte for byte,
//    plus one export line per file.
// 2. The entry point serves only the staging project (or local Supabase),
//    reads only the keys Supabase provides, and keeps JWT verification on.
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
    for (const i of imports) assert.ok(i.startsWith('./'), `${f} imports ${i}`)
  }
})

test('the entry point serves only the staging project, with the provided keys only', () => {
  const index = code(read(`${dir}/index.ts`))
  assert.match(index, /const PROJECT = 'kpudeppgokpjhvaqrprn'/)
  assert.ok(!/hmrliwoychnqrbbydorg/.test(index), 'no reference to the Production project')
  assert.match(index, /const configured = \(url === HOSTED \|\| local\) && anon !== '' && service !== ''/)
  assert.match(index, /if \(!configured\) \{\s*return respond\(new Response\(JSON\.stringify\(\{ error: 'unavailable' \}\), \{ status: 503/)
  const envs = [...index.matchAll(/env\('([A-Z_]+)'\)/g)].map((m) => m[1]).sort()
  assert.deepEqual(envs, ['SUPABASE_ANON_KEY', 'SUPABASE_SERVICE_ROLE_KEY', 'SUPABASE_URL'], 'only the keys Supabase provides to every function')
  assert.match(index, /ALLOWED_ORIGIN = \/\^https:\\\/\\\/splitpost-app-\[a-z0-9-\]\+-crevant\\\.vercel\\\.app\$\//)
  assert.match(read('supabase/config.toml'), /\[functions\.avatar\]\nverify_jwt = true/)
})

test('the handler asks the database as the caller first, and trusts no id or path from the browser', () => {
  const h = code(read(`${dir}/handler.ts`))
  assert.ok(!/body\??\.(path|paths|user|userId|user_id|member|memberId|owner)\b/.test(h), 'no member id or path is read from the request')
  // Upload: header check, then the caller's authorization, then decode/re-encode, then storage, then commit.
  const order = ['checkHeader(bytes)', "deps.userRpc(token, 'app_avatar_begin'", 'reencode(bytes)', 'deps.upload(path, clean)', "deps.serviceRpc('svc_avatar_commit'"]
  const at = order.map((s) => h.indexOf(s))
  assert.ok(at.every((i) => i >= 0) && at.every((i, k) => k === 0 || i > at[k - 1]), `upload steps in order: ${at}`)
  // Every privileged action is preceded by the caller's own database check.
  for (const [action, check] of [['remove', "'app_avatar_remove'"], ['urls', "'app_avatars'"], ['cleanup', "'app_mod_storage_cleanup_start'"]]) {
    const block = h.slice(h.indexOf(`action === '${action}'`))
    assert.ok(block.indexOf(`deps.userRpc(token, ${check}`) >= 0 && block.indexOf(`deps.userRpc(token, ${check}`) < Math.max(block.indexOf('deps.remove('), block.indexOf('deps.sign(')), `${action}: the caller's check comes first`)
  }
  assert.match(h, /if \(!token\) return json\(401, \{ error: 'not_signed_in' \}\)/)
  assert.match(h, /const LINK_SECONDS = 3600/)
  const image = code(read(`${dir}/image.ts`))
  assert.match(image, /export const SIZE = 512/)
  assert.match(image, /export const MAX_STORED_BYTES = 200 \* 1024/)
  assert.match(image, /maxResolutionInMP: 1, maxMemoryUsageInMB: 64, tolerantDecoding: false/)
})
