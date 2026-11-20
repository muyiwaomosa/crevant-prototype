// Guards for the post-media Edge Function (Build 5.3; node --test, run by npm test).
//
// 1. Its jpeg-js is the same reviewed 0.4.4 code as the avatar function's.
// 2. The avatar function is unchanged by Build 5.3 (byte for byte).
// 3. The entry point serves only the staging project (or local Supabase),
//    verifies every member with Supabase Auth itself, and only the drain
//    key (compared in constant time) opens the scheduled drain.
// 4. The handler authenticates first, asks the database as the caller before
//    any privileged step, trusts no id or path from the browser, and keeps
//    the approved limits and the processing check's pass mark.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const root = new URL('..', import.meta.url).pathname
const read = (p) => readFileSync(join(root, p), 'utf8')
const code = (text) => text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '').replace(/\s\/\/ .*$/gm, '')
const sha = (p) => createHash('sha256').update(readFileSync(join(root, p))).digest('hex')
const dir = 'supabase/functions/post-media'

test('the shared jpeg-js is byte for byte the avatar function\'s reviewed copy', () => {
  for (const f of ['decoder.js', 'encoder.js', 'LICENSE']) {
    assert.equal(sha(`supabase/functions/_shared/jpeg-js-0.4.4/${f}`), sha(`supabase/functions/avatar/vendor/jpeg-js-0.4.4/${f}`), f)
  }
})

test('the avatar function is unchanged by Build 5.3', () => {
  assert.deepEqual(
    Object.fromEntries(['handler.ts', 'image.ts', 'index.ts'].map((f) => [f, sha(`supabase/functions/avatar/${f}`)])),
    {
      'handler.ts': '6653dfd6f602378139decabd2dfaddaff2db92a51f40f0e289833f815567d0f3',
      'image.ts': '436fc7c60f391df9baf4f93cbfbb75974d9f97a53e3a510864dde3050fb76a44',
      'index.ts': '6f83254fe78a01adb4bea3b860c183c00ff85566cfec3b174c16cbc38ef7357b',
    },
  )
})

test('no remote or npm import', () => {
  for (const f of ['index.ts', 'handler.ts', 'image.ts']) {
    const imports = [...code(read(`${dir}/${f}`)).matchAll(/from\s+['"]([^'"]+)['"]/g)].map((m) => m[1])
    for (const i of imports) assert.ok(i.startsWith('./') || i.startsWith('../_shared/'), `${f} imports ${i}`)
  }
})

test('the entry point serves only staging, verifies members with Supabase Auth, and guards the drain key', () => {
  const index = code(read(`${dir}/index.ts`))
  assert.match(index, /const PROJECT = 'kpudeppgokpjhvaqrprn'/)
  assert.ok(!/hmrliwoychnqrbbydorg/.test(index), 'no reference to the Production project')
  assert.match(index, /if \(!configured\) \{\s*return respond\(new Response\(JSON\.stringify\(\{ error: 'unavailable' \}\), \{ status: 503/)
  const envs = [...index.matchAll(/env\('([A-Z_]+)'\)/g)].map((m) => m[1]).sort()
  assert.deepEqual(envs, ['MEDIA_DRAIN_KEY', 'SUPABASE_ANON_KEY', 'SUPABASE_SERVICE_ROLE_KEY', 'SUPABASE_URL'])
  assert.match(read('supabase/config.toml'), /\[functions\.post-media\]\nverify_jwt = false/)
  assert.match(index, /fetch\(`\$\{url\}\/auth\/v1\/user`, \{ headers: \{ apikey: key \?\? anon, Authorization: `Bearer \$\{token\}` \} \}\)/)
  assert.match(index, /user\.aud === 'authenticated' && user\.role === 'authenticated'/)
  assert.match(index, /if \(drainKey\.length < 32 \|\| presented\.length !== drainKey\.length\) return false/)
  assert.match(index, /diff \|= drainKey\.charCodeAt\(i\) \^ presented\.charCodeAt\(i\)/, 'constant-time comparison')
  for (const p of ["'/object/post-photos'", '`/object/post-photos/${path}`', "'/object/sign/post-photos'"]) assert.ok(index.includes(p), p)
  assert.ok(!/\/object\/(sign\/)?avatars/.test(index), 'never touches the avatars bucket')
})

test('every member action is authenticated first; only the drain uses the drain key instead', () => {
  const h = code(read(`${dir}/handler.ts`))
  const start = h.indexOf('export async function handle')
  const drainBlock = h.indexOf("if (action === 'drain')", start)
  const verify = h.indexOf('if (!(await deps.verifyUser(token, key))) return json(401', start)
  assert.ok(drainBlock > start && verify > drainBlock, 'the drain is handled before member authentication, and nothing else is')
  assert.match(h.slice(drainBlock, verify), /if \(!deps\.drainKeyMatches\(presented\)\) return json\(401/)
  for (const later of ["action === 'photo'", "action === 'links'", "action === 'cleanup'", "action === 'mod-photo'", "action === 'mod-drain'", "action === 'check'", 'readBody(req', 'readJson(req']) {
    assert.ok(h.indexOf(later, start) > verify, `${later} comes after authentication`)
  }
})

test('the database is asked as the caller before every privileged step; no id or path from the browser', () => {
  const h = code(read(`${dir}/handler.ts`))
  assert.ok(!/body\??\.(path|paths|user|userId|user_id|member|memberId|owner|upload|uploadId)\b/.test(h), 'no member id, upload id or path is read from the request')
  const photo = h.slice(h.indexOf("action === 'photo'"))
  const order = ['checkHeader(bytes)', "asCaller('app_photo_upload_begin'", 'makeVariants(bytes)', 'deps.upload(fullPath', "deps.serviceRpc('svc_photo_upload_stored'"]
  const at = order.map((s) => photo.indexOf(s))
  assert.ok(at.every((i) => i >= 0) && at.every((i, k) => k === 0 || i > at[k - 1]), `photo steps in order: ${at}`)
  for (const [action, check, privileged] of [['links', "'app_post_photos'", 'deps.sign('], ['cleanup', "'app_photo_status'", 'drain(deps'], ['mod-photo', "'app_mod_report_media'", 'deps.sign('], ['mod-drain', "'app_mod_media_status'", 'drain(deps'], ['check', "'app_is_founder'", 'makeVariants(']]) {
    const block = h.slice(h.indexOf(`action === '${action}'`))
    assert.ok(block.indexOf(`asCaller(${check}`) >= 0 && block.indexOf(`asCaller(${check}`) < block.indexOf(privileged), `${action}: the caller's check comes first`)
  }
  assert.match(h, /export const CHECK_PASS_MS = 1000/)
  assert.match(h, /const LINK_SECONDS = 3600/)
  const image = code(read(`${dir}/image.ts`))
  for (const re of [/export const MAX_EDGE = 1600/, /export const FEED_EDGE = 800/, /export const MAX_INPUT_BYTES = 1_500_000/, /export const MAX_FULL_BYTES = 600 \* 1024/, /export const MAX_FEED_BYTES = 200 \* 1024/, /const QUALITIES = \[80, 70\]/, /maxResolutionInMP: 2\.6, maxMemoryUsageInMB: 64, tolerantDecoding: false/]) {
    assert.match(image, re)
  }
})
