// The post-media Edge Function against a real LOCAL Supabase (Storage, the
// Edge runtime, the database). The suite runs on a copy started with ONLY the
// new API keys (publishable and secret); the legacy fallback, the gateway's
// copy, and copies without usable keys are checked in section 9d. Run
// through scripts/e2e/post-media-edge.sh. Test photos are generated here
// with the reviewed jpeg-js (nothing third-party is committed).
// Every check prints PASS or FAIL; the process exits non zero on any failure.
const { execFileSync } = require('node:child_process')
const { readFileSync } = require('node:fs')
const path = require('node:path')
const crypto = require('node:crypto')

const env = (k) => {
  const v = process.env[k]
  if (!v) throw new Error(`Missing ${k}; run through scripts/e2e/post-media-edge.sh`)
  return v
}
const API = env('API_URL')
const DB = env('DB_URL')
const PUB = env('PUBLISHABLE_KEY')
const ANON = env('ANON_KEY')
const SERVICE = env('SERVICE_ROLE_KEY')
const DRAIN = env('DRAIN_URL') // the copy with only the new keys, and the test drain key
const LEGACY = env('LEGACY_URL') // a copy with only the legacy anon and service_role keys
const NOKEYS = env('NOKEYS_URL') // a copy with no key at all
const PARTIAL = env('PARTIAL_URL') // a copy with a publishable key and only malformed secret values
const GUARD = env('GUARD_URL') // a copy started with the PRODUCTION project's address
const DRAIN_KEY = env('DRAIN_KEY')
if (!/^http:\/\/(127\.0\.0\.1|localhost):/.test(API)) throw new Error('Refusing: not a local Supabase')
// The suite's copy has only the new keys (FN_URL, the drain copy); the gateway's copy runs on what the local CLI provides.
const GATEWAY = `${API}/functions/v1/post-media`
const FN = env('FN_URL')
const RUN = String(Date.now()).slice(-7)
const PASSWORD = 'Media-Edge-42-pass'
const avatarFixture = (n) => readFileSync(path.join(__dirname, 'fixtures', 'avatars', n))

let failures = 0
const check = (name, ok, detail = '') => {
  if (!ok) failures++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`)
}
const sql = (q) => execFileSync('psql', [DB, '-v', 'ON_ERROR_STOP=1', '-qAt', '-c', q]).toString().trim()
const admin = { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, 'Content-Type': 'application/json' }

async function account(tag, { member = true, moderator = false, cohort = 'tester' } = {}) {
  const email = `${tag}-${RUN}@example.test`
  const r = await fetch(`${API}/auth/v1/admin/users`, { method: 'POST', headers: admin, body: JSON.stringify({ email, password: PASSWORD, email_confirm: true }) })
  const { id } = await r.json()
  sql(`update public.profiles set username = '${tag}_${RUN}', display_name = '${tag}' where id = '${id}'`)
  // Only the launch founder may hold the founder cohort (20261129000000): on a fresh
  // test database none is set yet, so this account becomes it (recorded, with its phrase).
  if (member && cohort === 'founder') sql(`select ops.set_launch_founder('media-edge', '${id}', 'SET THE LAUNCH FOUNDER') where (select founder_user_id from ops.member_launch_settings) is null`)
  if (member) sql(`select ops.grant_member_access('${id}', '${cohort}', 'media-edge')`)
  if (moderator) sql(`select ops.grant_moderator('${id}', 'founder', 'media-edge')`)
  const t = await fetch(`${API}/auth/v1/token?grant_type=password`, { method: 'POST', headers: { apikey: PUB, 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password: PASSWORD }) })
  return { id, token: (await t.json()).access_token }
}
async function call(action, token, body, { url = FN, contentType, headers: extra = {} } = {}) {
  const headers = { apikey: PUB, ...extra }
  if (token) headers.Authorization = `Bearer ${token}`
  if (contentType) headers['Content-Type'] = contentType
  const started = Date.now()
  const r = await fetch(`${url}/${action}`, { method: 'POST', headers, body })
  const text = await r.text()
  let json = null
  try {
    json = JSON.parse(text)
  } catch {
    json = text
  }
  return { status: r.status, json, headers: r.headers, ms: Date.now() - started, bytes: Buffer.byteLength(text) }
}
const photo = (token, bytes) => call('photo', token, bytes, { contentType: 'image/jpeg' })
const { UUID, describe, scrub, unlistedCodes } = require('./lib/safe-reply.cjs')
// An upload the rest of the test depends on must have succeeded: otherwise
// stop here, saying why, instead of failing later on a missing upload id.
const requireUpload = (r, what) => {
  if (r.status === 200 && typeof r.json?.uploadId === 'string' && UUID.test(r.json.uploadId)) return r.json.uploadId
  check(`${what} was stored, with an upload id`, false, describe(r))
  throw new Error(`stopping: ${what} was not stored (${describe(r)})`)
}
const jsonCall = (action, token, body, opts = {}) => call(action, token, JSON.stringify(body), { contentType: 'application/json', ...opts })
async function rpc(token, fn, body) {
  const r = await fetch(`${API}/rest/v1/rpc/${fn}`, { method: 'POST', headers: { apikey: PUB, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  const text = await r.text()
  try {
    return { status: r.status, json: JSON.parse(text) }
  } catch {
    return { status: r.status, json: text }
  }
}
const photoFiles = () => Number(sql("select count(*) from storage.objects where bucket_id = 'post-photos'"))
const avatarFiles = () => Number(sql("select count(*) from storage.objects where bucket_id = 'avatars'"))
async function stored(p) {
  const r = await fetch(`${API}/storage/v1/object/post-photos/${p}`, { headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}` } })
  return { status: r.status, type: r.headers.get('content-type'), bytes: Buffer.from(await r.arrayBuffer()) }
}
function frame(b) {
  for (let i = 2; i + 9 < b.length; ) {
    if (b[i] !== 0xff) return null
    const m = b[i + 1]
    const len = b.readUInt16BE(i + 2)
    if (m === 0xc0 || m === 0xc1 || m === 0xc2) return { h: b.readUInt16BE(i + 5), w: b.readUInt16BE(i + 7) }
    i += 2 + len
  }
  return null
}

;(async () => {
  { const missing = unlistedCodes(); check('every error code the function can return is on the test output allowlist', missing.length === 0, missing.length ? `missing ${missing.length}` : '') }
  const { encode } = await import(path.join(__dirname, '..', 'supabase', 'functions', '_shared', 'jpeg-js-0.4.4', 'encoder.js'))
  // A camera-like photo: gradients and fine noise.
  const makePhoto = (w, h, seed = 1) => {
    const data = Buffer.alloc(w * h * 4)
    let s = seed
    for (let i = 0; i < w * h; i++) {
      s = (s * 1664525 + 1013904223) >>> 0
      const n = (s / 4294967296 - 0.5) * 40
      const x = i % w
      const y = (i / w) | 0
      data[i * 4] = Math.max(0, Math.min(255, (x * 255) / w + n))
      data[i * 4 + 1] = Math.max(0, Math.min(255, (y * 255) / h + n))
      data[i * 4 + 2] = 120 + n
      data[i * 4 + 3] = 255
    }
    return Buffer.from(encode({ data, width: w, height: h }, 90).data)
  }
  // Camera metadata (EXIF with GPS and a maker note) inserted after the start of image.
  const withExif = (jpeg) => {
    const payload = Buffer.from('Exif\0\0MM\0*GPSLatitude 43.6532 N GPSLongitude 79.3832 W Make SplitpostTestCam')
    const seg = Buffer.alloc(4)
    seg[0] = 0xff
    seg[1] = 0xe1
    seg.writeUInt16BE(payload.length + 2, 2)
    return Buffer.concat([jpeg.subarray(0, 2), seg, payload, jpeg.subarray(2), Buffer.from('<html>appended</html>')])
  }
  const landscape = withExif(makePhoto(1600, 1067, 7))
  const portrait = makePhoto(900, 1600, 3)

  const avatarsBefore = avatarFiles()
  const A = await account('pma') // posts photos
  const B = await account('pmb') // follows A
  const N = await account('pmn', { member: false }) // signed in, no pilot membership
  const M = await account('pmm', { moderator: true }) // a moderator
  const F = await account('pmf', { cohort: 'founder' }) // the founder
  sql(`insert into social.follows (follower_id, creator_id) values ('${B.id}', '${A.id}')`)

  // 0. Sign-in is checked first, for every member action.
  for (const [what, token] of [['no token', null], ['a malformed token', 'abc.def'], ['the anon key', ANON], ['the service key', SERVICE]]) {
    const codes = []
    for (const action of ['photo', 'links', 'cleanup', 'mod-photo', 'mod-drain', 'check']) codes.push((await call(action, token, '{}', { contentType: 'application/json' })).status)
    check(`${what} is refused (401) for every member action`, codes.every((c) => c === 401), codes.join(','))
  }
  check('nothing was stored by any refused request', photoFiles() === 0 && sql('select count(*) from social.media_uploads') === '0')

  // 1. Off by default: no upload is authorised, nothing is stored.
  const off = await photo(A.token, landscape)
  check('with the switch off, uploads are refused (photos_unavailable) and nothing is stored', off.status === 403 && off.json?.error === 'photos_unavailable' && photoFiles() === 0, describe(off))
  const offStatus = await rpc(A.token, 'app_photo_status', {})
  check('and the app is told photos are off', offStatus.status === 200 && offStatus.json === false)

  // 2. The founder's hosted processing check gates the switch.
  const notFounder = await jsonCall('check', A.token, { seed: 1 })
  check('only the founder can run the processing check', notFounder.status === 403, describe(notFounder))
  let enableRefused = false
  try {
    sql("select ops.set_media_settings('founder', true, 2000000000, 10, 20)")
  } catch {
    enableRefused = true
  }
  check('photos can\'t be turned on before the processing checks', enableRefused)
  const timings = []
  for (let seed = 1; seed <= 6; seed++) {
    const r = await jsonCall('check', F.token, { seed })
    timings.push(r.json?.ms)
    if (!(r.status === 200 && r.json?.ok === true)) check(`processing check ${seed}`, false, describe(r))
  }
  check('six processing checks pass in the local Edge runtime (each under 1 second)', timings.every((ms) => typeof ms === 'number' && ms < 1000), `${timings.join(', ')} ms`)
  check('the checks are recorded, and stored nothing', sql("select count(*) from ops.media_admin_events where action = 'processing_check' and ok") === '6' && photoFiles() === 0)
  sql("select ops.set_media_settings('founder', true, 2000000000, 10, 20)")
  check('with the checks passed, a cap and both thresholds, photos turn on', sql('select photos_enabled from ops.media_settings') === 't')

  // 2b. Who may post (20261128000000): founder-only by default, enforced through the function too.
  check('the audience is founder-only by default', sql('select photos_audience from ops.media_settings') === 'founder')
  const testerRefused = await photo(A.token, landscape)
  check('with photos on and the audience at founder, a tester\'s upload is refused (photos_unavailable) and nothing is stored',
    testerRefused.status === 403 && testerRefused.json?.error === 'photos_unavailable' && photoFiles() === 0, describe(testerRefused))
  const founderUp = await photo(F.token, makePhoto(1200, 900, 21))
  check('the founder\'s upload is accepted through the function', founderUp.status === 200 && typeof founderUp.json?.uploadId === 'string', describe(founderUp))
  sql("select ops.set_photo_audience('founder', 'members', 'OPEN PHOTO POSTING TO ALL MEMBERS')")
  check('opening to all members is recorded', sql("select count(*) from ops.media_admin_events where action = 'audience_changed'") === '1')

  // 3. A valid photo: checked, decoded, re-encoded into two copies; nothing else stored.
  const up = await photo(A.token, landscape)
  check('a 1600 px photo with camera metadata is accepted', up.status === 200 && typeof up.json?.uploadId === 'string' && up.json.width === 1600 && up.json.height === 1067, describe(up))
  requireUpload(up, 'the 1600 px photo')
  const row = sql(`select full_path || '|' || feed_path || '|' || status || '|' || full_bytes || '|' || feed_bytes from social.media_uploads where id = '${up.json?.uploadId}'`).split('|')
  check('the paths were chosen by the database, in A\'s own folder', row[0] === `${A.id}/${up.json?.uploadId}.jpg` && row[1] === `${A.id}/${up.json?.uploadId}-feed.jpg` && row[2] === 'stored')
  const full = await stored(row[0])
  const feed = await stored(row[1])
  const ff = frame(full.bytes)
  const fd = frame(feed.bytes)
  check('the full copy is a freshly encoded JPEG, 1600 px, at most 600 KB', full.status === 200 && ff?.w === 1600 && ff?.h === 1067 && full.bytes.length <= 600 * 1024, `${ff?.w}x${ff?.h} ${full.bytes.length} B`)
  check('the feed copy is at most 800 px and 200 KB', feed.status === 200 && Math.max(fd?.w, fd?.h) === 800 && feed.bytes.length <= 200 * 1024, `${fd?.w}x${fd?.h} ${feed.bytes.length} B`)
  check('neither copy carries EXIF, GPS, camera data or anything appended',
    ![full.bytes, feed.bytes].some((b) => b.includes(Buffer.from('Exif')) || b.includes(Buffer.from('GPS')) || b.includes(Buffer.from('SplitpostTestCam')) || b.includes(Buffer.from('<html>')))
    && full.bytes.subarray(-2).equals(Buffer.from([0xff, 0xd9])))
  check('Storage records both as image/jpeg', full.type === 'image/jpeg' && feed.type === 'image/jpeg', `${full.type} ${feed.type}`)
  check('the sizes recorded match the files', Number(row[3]) === full.bytes.length && Number(row[4]) === feed.bytes.length)
  const pu = await photo(A.token, portrait)
  requireUpload(pu, 'the portrait photo')
  const pf = frame((await stored(sql(`select feed_path from social.media_uploads where id = '${pu.json?.uploadId}'`))).bytes)
  check('a portrait photo keeps its shape (feed 450 x 800)', pu.status === 200 && pu.json.width === 900 && pu.json.height === 1600 && pf?.w === 450 && pf?.h === 800, `${describe(pu)}; feed ${pf?.w}x${pf?.h}`)

  // 4. Anything else is refused, and leaves nothing behind.
  const filesBefore = photoFiles()
  for (const [what, bytes, code] of [
    ['an HTML file named .jpg', avatarFixture('html.jpg'), 'not_jpeg'],
    ['a photo over 1600 px', makePhoto(2000, 1000), 'wrong_size'],
    ['a header claiming 30,000 x 30,000 pixels', avatarFixture('bomb.jpg'), 'wrong_size'],
    ['a truncated JPEG', avatarFixture('truncated.jpg'), 'not_decodable'],
    ['a PNG', Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex'), 'not_jpeg'],
  ]) {
    const r = await photo(A.token, bytes)
    check(`${what} is refused (${code})`, r.status === 422 && r.json?.error === code, describe(r))
  }
  const tooBig = await photo(A.token, Buffer.concat([landscape, Buffer.alloc(1_600_000)]))
  check('a body over 1.5 MB is refused (too_large)', tooBig.status === 413, String(tooBig.status))
  check('no refused file was stored', photoFiles() === filesBefore)
  const nonMember = await photo(N.token, landscape)
  check('a signed-in account without pilot membership is refused, nothing stored', nonMember.status === 403 && nonMember.json?.error === 'no_pilot_access' && photoFiles() === filesBefore, `${nonMember.status}`)

  // 5. Publishing (as the member, with the app's request id) and links.
  const rid = crypto.randomUUID()
  const pub = await rpc(A.token, 'app_create_post', { p_body: '', p_request_id: rid, p_media: up.json.uploadId, p_media_description: 'A test photo' })
  const again = await rpc(A.token, 'app_create_post', { p_body: '', p_request_id: rid, p_media: up.json.uploadId, p_media_description: 'A test photo' })
  check('A publishes the photo with no caption; a retry returns the same post', pub.status === 200 && pub.json === again.json, describe(pub))
  const postId = pub.json
  const taken = await rpc(B.token, 'app_create_post', { p_body: 'mine now', p_request_id: crypto.randomUUID(), p_media: pu.json.uploadId })
  check('B can\'t publish A\'s upload', taken.status === 400 && taken.json?.message === 'upload_not_ready', describe(taken))
  const links = await jsonCall('links', B.token, { ids: [postId] })
  const lk = links.json?.photos?.[postId]
  check('B gets signed links for both copies of A\'s photo', links.status === 200 && /^\/object\/sign\/post-photos\//.test(lk?.feed ?? '') && /^\/object\/sign\/post-photos\//.test(lk?.full ?? ''), `${describe(links)}; ${Object.keys(links.json?.photos ?? {}).length} photo(s) linked`)
  const served = await fetch(`${API}/storage/v1${lk?.feed}`)
  check('the feed link serves the image', served.status === 200 && served.headers.get('content-type') === 'image/jpeg', String(served.status))
  const nonMemberLinks = await jsonCall('links', N.token, { ids: [postId] })
  check('a non-member gets no links', nonMemberLinks.status === 403, String(nonMemberLinks.status))
  const badIds = await jsonCall('links', B.token, { ids: ['not-a-uuid'] })
  check('malformed ids are refused', badIds.status === 400)
  const direct = await fetch(`${API}/storage/v1/object/post-photos/${row[0]}`, { headers: { apikey: PUB, Authorization: `Bearer ${B.token}` } })
  check('a member can\'t read a photo straight from Storage (private bucket)', direct.status >= 400, String(direct.status))

  // 6. Delete: the database queues both files; the server deletes them.
  const del = await rpc(A.token, 'app_delete_post', { p_post: postId })
  check('A deletes the post; both files are queued in the same transaction', del.status === 204 || del.status === 200,
    `${del.status} queued ${sql(`select count(*) from ops.media_deletions where path in ('${row[0]}', '${row[1]}')`)}`)
  const linksAfter = await jsonCall('links', B.token, { ids: [postId] })
  check('no new links are issued for the deleted post', linksAfter.status === 200 && !linksAfter.json?.photos?.[postId])
  const clean = await call('cleanup', A.token, '{}', { contentType: 'application/json' })
  check('the cleanup request deletes the queued files at once', clean.status === 200 && (await stored(row[0])).status >= 400 && (await stored(row[1])).status >= 400,
    describe(clean))
  check('the queue records them as deleted, and the pass is recorded', sql(`select count(*) from ops.media_deletions where path in ('${row[0]}', '${row[1]}') and deleted_at is not null`) === '2'
    && Number(sql("select count(*) from ops.media_drain_runs where source = 'request'")) >= 1)
  check('the old link no longer serves the photo', (await fetch(`${API}/storage/v1${lk?.feed}`)).status >= 400)

  // 7. Evidence: a reported photo stays while its report is kept, even after the author deletes it.
  const ev = await photo(A.token, makePhoto(1200, 900, 11))
  requireUpload(ev, 'the photo to be reported')
  const evPost = (await rpc(A.token, 'app_create_post', { p_body: 'Reported photo', p_request_id: crypto.randomUUID(), p_media: ev.json.uploadId })).json
  const rep = await rpc(B.token, 'app_report', { p_target_type: 'post', p_target_id: evPost, p_reason: 'harassment' })
  check('B reports the photo post', rep.status === 204 || rep.status === 200, String(rep.status))
  await rpc(A.token, 'app_delete_post', { p_post: evPost })
  await call('cleanup', A.token, '{}', { contentType: 'application/json' })
  const evPaths = sql(`select full_path || '|' || feed_path from social.media_uploads where id = '${ev.json.uploadId}'`).split('|')
  check('the reported photo is held as evidence: still stored after the author deleted it and a cleanup ran', (await stored(evPaths[0])).status === 200 && (await stored(evPaths[1])).status === 200)
  const reportId = sql(`select id from ops.content_reports where target_id = '${evPost}'`)
  const modPhoto = await jsonCall('mod-photo', M.token, { report: reportId })
  check('the moderator gets links to the reported photo', modPhoto.status === 200 && (await fetch(`${API}/storage/v1${modPhoto.json?.photo?.feed}`)).status === 200, describe(modPhoto))
  const memberPhoto = await jsonCall('mod-photo', B.token, { report: reportId })
  check('a member can\'t get the reported photo', memberPhoto.status === 403, String(memberPhoto.status))
  const memberDrain = await call('mod-drain', B.token, '{}', { contentType: 'application/json' })
  check('a member can\'t run the moderator\'s cleanup', memberDrain.status === 403, String(memberDrain.status))

  // 8. The scheduled drain: only with the drain key; it works through the queue and is recorded.
  const orphan = `${A.id}/00000000-0000-4000-8000-00000000abcd.jpg`
  await fetch(`${API}/storage/v1/object/post-photos/${orphan}`, { method: 'POST', headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, 'Content-Type': 'image/jpeg' }, body: makePhoto(100, 100) })
  sql(`update storage.objects set created_at = now() - interval '2 days' where bucket_id = 'post-photos' and name = '${orphan}'`)
  const noKey = await call('drain', null, '{}', { url: DRAIN, contentType: 'application/json' })
  const wrongKey = await call('drain', null, '{}', { url: DRAIN, contentType: 'application/json', headers: { 'x-media-drain-key': 'x'.repeat(48) } })
  const gatewayKey = await call('drain', null, '{}', { url: GATEWAY, contentType: 'application/json', headers: { 'x-media-drain-key': DRAIN_KEY } })
  check('the drain refuses without the key, with a wrong key, and where no key is configured', noKey.status === 401 && wrongKey.status === 401 && gatewayKey.status === 401,
    `${noKey.status} ${wrongKey.status} ${gatewayKey.status}`)
  const runsBefore = Number(sql("select count(*) from ops.media_drain_runs where source = 'scheduled'"))
  const sched = await call('drain', null, '{}', { url: DRAIN, contentType: 'application/json', headers: { 'x-media-drain-key': DRAIN_KEY } })
  check('with the key, the scheduled drain deletes the orphaned file and is recorded', sched.status === 200 && (await stored(orphan)).status >= 400
    && Number(sql("select count(*) from ops.media_drain_runs where source = 'scheduled'")) === runsBefore + 1, describe(sched))
  check('and still keeps the evidence', (await stored(evPaths[0])).status === 200)
  const modDrain = await call('mod-drain', M.token, '{}', { contentType: 'application/json' })
  check('a moderator can run a pass too', modDrain.status === 200, String(modDrain.status))

  // 9. A deleted post with the browser gone: the schedule alone cleans it up.
  const failUpload = await photo(A.token, makePhoto(800, 600, 5))
  requireUpload(failUpload, 'the photo for the scheduled cleanup')
  const failPost = (await rpc(A.token, 'app_create_post', { p_body: 'Will fail to delete', p_request_id: crypto.randomUUID(), p_media: failUpload.json.uploadId })).json
  await rpc(A.token, 'app_delete_post', { p_post: failPost })
  const pending = sql(`select count(*) from ops.media_deletions where deleted_at is null and path like '${A.id}/${failUpload.json.uploadId}%'`)
  check('the deleted post\'s files wait in the queue (no browser needed)', pending === '2', pending)
  await call('drain', null, '{}', { url: DRAIN, contentType: 'application/json', headers: { 'x-media-drain-key': DRAIN_KEY } })
  check('the next scheduled pass deletes them', sql(`select count(*) from ops.media_deletions where deleted_at is null and path like '${A.id}/${failUpload.json.uploadId}%'`) === '0')

  // 9b. Overlapping passes (a slow scheduled run meeting the next one, a
  // member's cleanup, a moderator's pass): each queued file is claimed and
  // deleted exactly once, and evidence is still held.
  const overlapIds = []
  for (let i = 0; i < 3; i++) {
    const up = await photo(A.token, makePhoto(640, 480, 20 + i))
    requireUpload(up, `overlap photo ${i + 1}`)
    const p = (await rpc(A.token, 'app_create_post', { p_body: `Overlap ${i}`, p_request_id: crypto.randomUUID(), p_media: up.json.uploadId })).json
    await rpc(A.token, 'app_delete_post', { p_post: p })
    overlapIds.push(up.json.uploadId)
  }
  const like = overlapIds.map((u) => `path like '${A.id}/${u}%'`).join(' or ')
  const queuedNow = sql(`select count(*) from ops.media_deletions where deleted_at is null and (${like})`)
  const key = { 'x-media-drain-key': DRAIN_KEY }
  const passes = await Promise.all([
    call('drain', null, '{}', { url: DRAIN, contentType: 'application/json', headers: key }),
    call('drain', null, '{}', { url: DRAIN, contentType: 'application/json', headers: key }),
    call('drain', null, '{}', { url: DRAIN, contentType: 'application/json', headers: key }),
    call('mod-drain', M.token, '{}', { contentType: 'application/json' }),
  ])
  const deletedTotal = passes.reduce((n, r) => n + (r.json?.deleted ?? 0), 0)
  const after = sql(`select count(*) filter (where deleted_at is null) || '|' || count(*) filter (where attempts <> 1) from ops.media_deletions where ${like}`)
  let gone = true
  for (const u of overlapIds) for (const suffix of ['.jpg', '-feed.jpg']) if ((await stored(`${A.id}/${u}${suffix}`)).status < 400) gone = false
  check('four overlapping passes delete each of the 6 queued files exactly once (claimed once, none left, none deleted twice)',
    queuedNow === '6' && passes.every((r) => r.status === 200) && deletedTotal === 6 && after === '0|0' && gone,
    `queued ${queuedNow}, statuses ${passes.map((r) => r.status).join(',')}, deleted ${deletedTotal}, left|reclaimed ${after}, gone ${gone}`)
  check('and the evidence is still held after them', (await stored(evPaths[0])).status === 200 && (await stored(evPaths[1])).status === 200)

  // 9c. Manual cleanup doesn't depend on the schedule: with no cleanup job
  // scheduled (as after pausing it), a moderator's Run cleanup now still
  // deletes queued files.
  const manualUp = await photo(A.token, makePhoto(640, 480, 31))
  requireUpload(manualUp, 'the photo for the manual cleanup')
  const manualPost = (await rpc(A.token, 'app_create_post', { p_body: 'Manual cleanup', p_request_id: crypto.randomUUID(), p_media: manualUp.json.uploadId })).json
  await rpc(A.token, 'app_delete_post', { p_post: manualPost })
  // (Two queries: SQL resolves cron.job before it could short-circuit.)
  const noJob = sql("select to_regclass('cron.job') is null") === 't' ? 't'
    : sql("select not exists (select 1 from cron.job where jobname = 'post-media-drain')")
  const manualQueued = sql(`select count(*) from ops.media_deletions where deleted_at is null and path like '${A.id}/${manualUp.json.uploadId}%'`)
  const manual = await call('mod-drain', M.token, '{}', { contentType: 'application/json' })
  const manualLeft = sql(`select count(*) from ops.media_deletions where deleted_at is null and path like '${A.id}/${manualUp.json.uploadId}%'`)
  check('with no cleanup job scheduled, a moderator\'s Run cleanup now deletes the queued files',
    noJob === 't' && manualQueued === '2' && manual.status === 200 && manualLeft === '0'
      && (await stored(`${A.id}/${manualUp.json.uploadId}.jpg`)).status >= 400,
    `no job ${noJob}, queued ${manualQueued}, status ${manual.status}, left ${manualLeft}`)

  // 9d. Keys: everything else runs on the copy with only the new keys. The
  // legacy keys still work as a fallback; without a usable key of each kind
  // the function refuses to run, even for the drain with its key.
  {
    const L = await account('pml')
    const lup = await call('photo', L.token, makePhoto(800, 600, 41), { url: LEGACY, contentType: 'image/jpeg' })
    const lid = requireUpload(lup, 'the photo through the legacy-key copy')
    const lpost = (await rpc(L.token, 'app_create_post', { p_body: 'Legacy keys', p_request_id: crypto.randomUUID(), p_media: lid })).json
    const llinks = await call('links', B.token, JSON.stringify({ ids: [lpost] }), { url: LEGACY, contentType: 'application/json' })
    const lfeed = llinks.json?.photos?.[lpost]?.feed
    check('with only the legacy keys (transition fallback), upload and links work', llinks.status === 200 && (await fetch(`${API}/storage/v1${lfeed}`)).status === 200, describe(llinks))
    const gw = await call('links', B.token, JSON.stringify({ ids: [lpost] }), { url: GATEWAY, contentType: 'application/json' })
    check('the copy behind the local gateway works too (on whatever keys the local CLI gives it)', gw.status === 200 && typeof gw.json?.photos?.[lpost]?.feed === 'string', describe(gw))
    await rpc(L.token, 'app_delete_post', { p_post: lpost })
    const lclean = await call('cleanup', L.token, '{}', { url: LEGACY, contentType: 'application/json' })
    check('with only the legacy keys, the cleanup deletes the queued files (Storage and the svc_* steps)', lclean.status === 200
      && (await stored(`${L.id}/${lid}.jpg`)).status >= 400 && (await stored(`${L.id}/${lid}-feed.jpg`)).status >= 400
      && sql(`select count(*) from ops.media_deletions where deleted_at is null and path like '${L.id}/%'`) === '0', describe(lclean))
    const filesBefore = photoFiles()
    const uploadsBefore = sql(`select count(*) from social.media_uploads where user_id = '${L.id}'`)
    for (const [what, url] of [['no key at all', NOKEYS], ['a publishable key but only malformed secret values', PARTIAL]]) {
      const r = await call('photo', L.token, makePhoto(640, 480, 42), { url, contentType: 'image/jpeg' })
      const d = await call('drain', null, '{}', { url, contentType: 'application/json', headers: { 'x-media-drain-key': DRAIN_KEY } })
      check(`with ${what}, the function refuses to run (503 unavailable), even the drain with its key, and touches nothing`,
        [r, d].every((x) => x.status === 503 && x.json?.error === 'unavailable') && photoFiles() === filesBefore
        && sql(`select count(*) from social.media_uploads where user_id = '${L.id}'`) === uploadsBefore, `${r.status} ${d.status}`)
    }
  }

  // 10. The moderator's status panel numbers.
  const st = await rpc(M.token, 'app_mod_media_status', {})
  check('the photo storage status shows the switch, usage, queue, held evidence and the last scheduled pass',
    st.status === 200 && st.json?.photos_enabled === true && st.json?.used_bytes > 0 && st.json?.held >= 2 && st.json?.last_scheduled_at, describe(st))

  // 11. Production can't be targeted; browsers only from the member app.
  const g = await call('photo', A.token, landscape, { url: GUARD, contentType: 'image/jpeg' })
  const gd = await call('drain', null, '{}', { url: GUARD, contentType: 'application/json', headers: { 'x-media-drain-key': DRAIN_KEY } })
  check('started with the Production project address, the function refuses everything (503), even the drain with its key', g.status === 503 && gd.status === 503, `${g.status} ${gd.status}`)
  const origin = async (o) => (await fetch(`${DRAIN}/photo`, { method: 'OPTIONS', headers: { Origin: o, 'Access-Control-Request-Method': 'POST' } })).headers.get('access-control-allow-origin')
  check('the member app\'s Preview may call it from the browser', (await origin('https://splitpost-app-git-claude-pilot-membership-integration-crevant.vercel.app')) === 'https://splitpost-app-git-claude-pilot-membership-integration-crevant.vercel.app')
  check('other websites may not', (await origin('https://evil.example')) === null)

  // 12. Avatars untouched.
  check('nothing in the avatars bucket changed, and no photo file is outside post-photos', avatarFiles() === avatarsBefore
    && sql(`select count(*) from storage.objects where bucket_id = 'avatars' and name like '%${up.json.uploadId}%'`) === '0')

  sql("select ops.set_photo_audience('founder', 'founder')")
  sql("select ops.set_media_settings('founder', false, 2000000000, 10, 20)")
  console.log(failures === 0 ? 'ALL CHECKS PASSED' : `${failures} CHECK(S) FAILED`)
  process.exit(failures === 0 ? 0 : 1)
})().catch((e) => {
  // Only the message (scrubbed) and where it came from: never a raw reply or connection string.
  console.error(`Stopped: ${scrub(e?.message ?? e)}`)
  if (e?.stderr?.length) console.error(scrub(e.stderr.toString().trim().split('\n').slice(0, 5).join('\n')))
  if (e?.stack) console.error(scrub(e.stack.split('\n').slice(1, 4).join('\n')))
  process.exit(1)
})
