// The avatar Edge Function against a real LOCAL Supabase (Storage, the Edge
// runtime with JWT verification, the database), through the same gateway
// the app uses. Run through scripts/e2e/avatar-edge.sh.
// Every check prints PASS or FAIL; the process exits non zero on any failure.
const { execFileSync } = require('node:child_process')
const { readFileSync } = require('node:fs')
const path = require('node:path')

const env = (k) => {
  const v = process.env[k]
  if (!v) throw new Error(`Missing ${k}; run through scripts/e2e/avatar-edge.sh`)
  return v
}
const API = env('API_URL')
const DB = env('DB_URL')
const PUB = env('ANON_KEY')
const SERVICE = env('SERVICE_ROLE_KEY')
const GUARD = env('GUARD_URL') // the same function, started with the PRODUCTION project's address
if (!/^http:\/\/(127\.0\.0\.1|localhost):/.test(API)) throw new Error('Refusing: not a local Supabase')
const FN = `${API}/functions/v1/avatar`
const RUN = String(Date.now()).slice(-7)
const PASSWORD = 'Avatar-Edge-42-pass'
const fixture = (n) => readFileSync(path.join(__dirname, 'fixtures', 'avatars', n))

let failures = 0
const check = (name, ok, detail = '') => {
  if (!ok) failures++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`)
}
const sql = (q) => execFileSync('psql', [DB, '-v', 'ON_ERROR_STOP=1', '-qAt', '-c', q]).toString().trim()
const admin = { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, 'Content-Type': 'application/json' }

async function account(tag, { member = true, moderator = false } = {}) {
  const email = `${tag}-${RUN}@example.test`
  const r = await fetch(`${API}/auth/v1/admin/users`, { method: 'POST', headers: admin, body: JSON.stringify({ email, password: PASSWORD, email_confirm: true }) })
  const { id } = await r.json()
  sql(`update public.profiles set username = '${tag}_${RUN}', display_name = '${tag}' where id = '${id}'`)
  if (member) sql(`select ops.grant_member_access('${id}', 'tester', 'avatar-edge')`)
  if (moderator) sql(`select ops.grant_moderator('${id}', 'founder', 'avatar-edge')`)
  const t = await fetch(`${API}/auth/v1/token?grant_type=password`, { method: 'POST', headers: { apikey: PUB, 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password: PASSWORD }) })
  return { id, token: (await t.json()).access_token }
}
async function call(action, token, body, { url = FN, contentType } = {}) {
  const headers = { apikey: PUB }
  if (token) headers.Authorization = `Bearer ${token}`
  if (contentType) headers['Content-Type'] = contentType
  const r = await fetch(`${url}/${action}`, { method: 'POST', headers, body })
  const text = await r.text()
  let json = null
  try {
    json = JSON.parse(text)
  } catch {
    json = text
  }
  return { status: r.status, json }
}
const upload = (token, bytes) => call('upload', token, bytes, { contentType: 'image/jpeg' })
const urls = (token, ids) => call('urls', token, JSON.stringify({ ids }), { contentType: 'application/json' })
const current = (id) => sql(`select coalesce((select path from social.avatars where user_id = '${id}'), '')`)
const filesOf = (id) => Number(sql(`select count(*) from storage.objects where bucket_id = 'avatars' and name like '${id}/%'`))
async function stored(p) {
  const r = await fetch(`${API}/storage/v1/object/avatars/${p}`, { headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}` } })
  return Buffer.from(await r.arrayBuffer())
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
  const A = await account('pica')
  const B = await account('picb')
  const D = await account('picd')
  const M = await account('picm', { moderator: true })
  const N = await account('picn', { member: false })

  // 1. Who can call it.
  {
    const r = await call('upload', null, fixture('good.jpg'), { contentType: 'image/jpeg' })
    check('without a sign-in, the platform refuses before the function runs', r.status === 401, String(r.status))
    const g = await call('upload', A.token, fixture('good.jpg'), { url: GUARD, contentType: 'image/jpeg' })
    check('started with the Production project address, the function refuses everything (503) and touches nothing', g.status === 503 && g.json?.error === 'unavailable' && filesOf(A.id) === 0, `${g.status} ${JSON.stringify(g.json)}`)
    const n = await upload(N.token, fixture('good.jpg'))
    check('a signed-in account without pilot membership is refused (no_pilot_access), nothing stored', n.status === 403 && n.json?.error === 'no_pilot_access' && filesOf(N.id) === 0, `${n.status} ${JSON.stringify(n.json)}`)
    const nu = await urls(N.token, [A.id])
    check('and can\'t get picture links', nu.status === 403, String(nu.status))
  }

  // 2. Nothing the browser sends is trusted.
  {
    for (const [file, code] of [['html.jpg', 'not_jpeg'], ['small.jpg', 'wrong_size'], ['bomb.jpg', 'wrong_size'], ['truncated.jpg', 'not_decodable']]) {
      const r = await upload(A.token, fixture(file))
      check(`${file} is refused (${code}) and nothing is stored`, r.status === 422 && r.json?.error === code && filesOf(A.id) === 0, `${r.status} ${JSON.stringify(r.json)}`)
    }
    const big = await upload(A.token, Buffer.concat([fixture('good.jpg'), Buffer.alloc(1_000_001)]))
    check('a body over 1 MB is refused (too_large)', big.status === 413, String(big.status))
    const r = await upload(A.token, fixture('exif.jpg'))
    check('a valid JPEG carrying EXIF and GPS text is accepted', r.status === 200 && r.json?.ok === true, `${r.status} ${JSON.stringify(r.json)}`)
    const p = current(A.id)
    check('the path was chosen by the database, inside A\'s own folder', new RegExp(`^${A.id}/[0-9a-f-]{36}\\.jpg$`).test(p), p)
    const b = await stored(p)
    const f = frame(b)
    check('the stored file is a freshly encoded 512 x 512 JPEG of at most 200 KB', b[0] === 0xff && b[1] === 0xd8 && f?.w === 512 && f?.h === 512 && b.length <= 200 * 1024, `${b.length} bytes`)
    check('the stored file has no EXIF or GPS metadata', !b.includes(Buffer.from('Exif')) && !b.includes(Buffer.from('GPS')))
    check('the stored file ends at the end of the image', b[b.length - 2] === 0xff && b[b.length - 1] === 0xd9)
    check('Storage records it as image/jpeg', sql(`select metadata->>'mimetype' from storage.objects where name = '${p}'`) === 'image/jpeg')
  }

  // 3. Replacing deletes the previous file; data appended after an image is dropped.
  {
    const before = current(A.id)
    const r = await upload(A.token, fixture('polyglot.jpg'))
    const after = current(A.id)
    const b = await stored(after)
    check('replacing works, with a new path', r.status === 200 && after !== before, `${r.status}`)
    check('the replaced file is deleted at once (A has exactly one file)', filesOf(A.id) === 1 && sql(`select count(*) from storage.objects where name = '${before}'`) === '0')
    check('HTML appended after the image is not in the stored file', !b.includes(Buffer.from('<html')) && !b.includes(Buffer.from('script')))
  }

  // 4. Links: only visible members, signed for an hour, relative to Storage.
  let link
  {
    const r = await urls(B.token, [A.id, N.id, D.id])
    link = r.json?.avatars?.[A.id]?.url
    check('B gets a link for A (who has a picture) and none for members without one or non-members', r.status === 200 && typeof link === 'string' && Object.keys(r.json.avatars).length === 1 && r.json.expiresIn === 3600, JSON.stringify(r.json).slice(0, 120))
    const img = await fetch(`${API}/storage/v1${link}`)
    check('the link serves the image', img.status === 200 && (img.headers.get('content-type') || '').includes('image/jpeg'), `${img.status} ${img.headers.get('content-type')}`)
    const bad = await urls(B.token, ['not-an-id'])
    const many = await urls(B.token, Array.from({ length: 101 }, () => A.id))
    check('malformed ids, or more than 100, are refused', bad.status === 400 && many.status === 400, `${bad.status} ${many.status}`)
    const direct = await fetch(`${API}/storage/v1/object/avatars/${current(A.id)}`, { headers: { apikey: PUB, Authorization: `Bearer ${B.token}` } })
    check('a member can\'t read a picture straight from Storage (private bucket, no member policy)', direct.status >= 400, String(direct.status))
    const put = await fetch(`${API}/storage/v1/object/avatars/${B.id}/00000000-0000-4000-8000-000000000999.jpg`, { method: 'POST', headers: { apikey: PUB, Authorization: `Bearer ${B.token}`, 'Content-Type': 'image/jpeg' }, body: fixture('good.jpg') })
    check('a member can\'t upload straight into Storage', put.status >= 400 && filesOf(B.id) === 0, String(put.status))
  }

  // 5. Hidden by a moderator, or revoked: no new links (an issued link lasts until it expires).
  {
    sql(`insert into social.profile_details (user_id, hidden_at, onboarded_at) values ('${A.id}', now(), now()) on conflict (user_id) do update set hidden_at = now()`)
    const h = await urls(B.token, [A.id])
    check('a profile hidden by a moderator gets no picture link', h.status === 200 && Object.keys(h.json.avatars).length === 0)
    sql(`update social.profile_details set hidden_at = null where user_id = '${A.id}'`)
    sql(`select ops.revoke_member_access('${A.id}', 'test', 'avatar-edge')`)
    const r = await urls(B.token, [A.id])
    check('a revoked member gets no new picture link', r.status === 200 && Object.keys(r.json.avatars).length === 0)
    const old = await fetch(`${API}/storage/v1${link}`)
    check('DOCUMENTED LIMITATION: a link issued before revocation keeps working until it expires (at most 1 hour)', old.status === 200, String(old.status))
    const up = await upload(A.token, fixture('good.jpg'))
    check('a revoked member can\'t upload', up.status === 403 && up.json?.error === 'no_pilot_access', `${up.status}`)
    sql(`select ops.grant_member_access('${A.id}', 'tester', 'avatar-edge')`)
  }

  // 6. Remove: the file goes, its links stop working.
  {
    const p = current(A.id)
    const r = await call('remove', A.token, null)
    check('removing works and deletes the file', r.status === 200 && current(A.id) === '' && filesOf(A.id) === 0, `${r.status}`)
    const gone = await fetch(`${API}/storage/v1${link}`)
    check('after removal, the earlier link no longer serves the picture', gone.status >= 400, String(gone.status))
    check('and no link is handed out', Object.keys((await urls(B.token, [A.id])).json.avatars).length === 0)
    check('the removed path is not referenced anywhere', sql(`select count(*) from social.avatars where path = '${p}'`) === '0')
  }

  // 7. Overlapping uploads by one member end with exactly one current file.
  {
    const rs = await Promise.all([upload(B.token, fixture('good.jpg')), upload(B.token, fixture('exif.jpg')), upload(B.token, fixture('polyglot.jpg'))])
    check('three overlapping uploads all succeed', rs.every((r) => r.status === 200), rs.map((r) => r.status).join(','))
    check('afterwards B has exactly one file, and it is the current picture', filesOf(B.id) === 1 && sql(`select count(*) from storage.objects where name = '${current(B.id)}'`) === '1')
  }

  // 8. At most 10 changes a day (uploads started and removals).
  {
    const statuses = []
    for (let i = 0; i < 11; i++) statuses.push((await upload(D.token, fixture('good.jpg'))).status)
    check('the 11th change in a day is refused (429), the first 10 succeed', statuses.slice(0, 10).every((s) => s === 200) && statuses[10] === 429, statuses.join(','))
    check('and still only one file is kept', filesOf(D.id) === 1)
  }

  // 9. Cleanup: moderators only, dry run, exact phrase, recheck, audit.
  {
    // A leftover file (as if a delete had failed), old enough to clean.
    const leftover = `${D.id}/00000000-0000-4000-8000-00000000c1ea.jpg`
    await fetch(`${API}/storage/v1/object/avatars/${leftover}`, { method: 'POST', headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, 'Content-Type': 'image/jpeg' }, body: fixture('good.jpg') })
    sql(`update storage.objects set created_at = now() - interval '2 days' where name = '${leftover}'`)
    const rest = async (token, fn, body) => {
      const r = await fetch(`${API}/rest/v1/rpc/${fn}`, { method: 'POST', headers: { apikey: PUB, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      return { status: r.status, json: await r.json().catch(() => null) }
    }
    const asMember = await rest(B.token, 'app_mod_storage_preview', {})
    check('an ordinary member can\'t run the dry run', asMember.status >= 400 && JSON.stringify(asMember.json).includes('not_moderator'))
    const plan = (await rest(M.token, 'app_mod_storage_preview', {})).json?.[0]
    check('the moderator\'s dry run finds only the old, unused file', plan?.file_count === 1 && plan?.confirm_phrase === 'DELETE 1 FILES', JSON.stringify(plan))
    const memberRun = await call('cleanup', B.token, JSON.stringify({ plan: plan.plan_id, confirm: plan.confirm_phrase }), { contentType: 'application/json' })
    check('an ordinary member can\'t run the cleanup, even with the plan and phrase', memberRun.status === 403 && memberRun.json?.error === 'not_moderator', `${memberRun.status}`)
    const wrong = await call('cleanup', M.token, JSON.stringify({ plan: plan.plan_id, confirm: 'delete 1 files' }), { contentType: 'application/json' })
    check('the wrong phrase is refused and nothing is deleted', wrong.status === 400 && wrong.json?.error === 'confirmation_mismatch' && sql(`select count(*) from storage.objects where name = '${leftover}'`) === '1')
    const ok = await call('cleanup', M.token, JSON.stringify({ plan: plan.plan_id, confirm: plan.confirm_phrase }), { contentType: 'application/json' })
    check('with the exact phrase, the moderator\'s cleanup deletes the leftover file', ok.status === 200 && ok.json?.deleted === 1 && sql(`select count(*) from storage.objects where name = '${leftover}'`) === '0', JSON.stringify(ok.json))
    check('current pictures are untouched', filesOf(B.id) === 1 && filesOf(D.id) === 1)
    check('the dry run and the cleanup are in the moderation audit trail', sql(`select string_agg(action, ',' order by id) from ops.moderation_actions where actor_id = '${M.id}'`) === 'storage_cleanup_preview,storage_cleanup')
    const again = await call('cleanup', M.token, JSON.stringify({ plan: plan.plan_id, confirm: plan.confirm_phrase }), { contentType: 'application/json' })
    check('the same dry run can\'t be confirmed twice', again.status === 400 && again.json?.error === 'not_open')
  }

  // 10. Browsers: only the member app's Previews. (Checked on the function
  //     itself: the LOCAL gateway answers preflight requests on its own with
  //     "*", unlike the hosted platform, which passes them to the function.
  //     CORS is not the security boundary either way: sign-in and the
  //     database checks are.)
  {
    const pre = (origin) => fetch(`${GUARD}/upload`, { method: 'OPTIONS', headers: { Origin: origin, 'Access-Control-Request-Method': 'POST' } })
    const preview = 'https://splitpost-app-git-claude-pilot-membership-integration-crevant.vercel.app'
    check('the member app\'s Preview may call it from the browser', (await pre(preview)).headers.get('access-control-allow-origin') === preview)
    check('other websites may not', !(await pre('https://evil.example')).headers.get('access-control-allow-origin'))
    check('look-alike addresses may not', !(await pre('https://splitpost-app-x-crevant.vercel.app.evil.example')).headers.get('access-control-allow-origin'))
    check('outside local development, localhost may not', !(await pre('http://127.0.0.1:4176')).headers.get('access-control-allow-origin'))
  }

  // Leave nothing behind for later tests in this job: the pictures' files.
  const left = sql("select coalesce(string_agg(name, ' '), '') from storage.objects where bucket_id = 'avatars'").split(' ').filter(Boolean)
  if (left.length) await fetch(`${API}/storage/v1/object/avatars`, { method: 'DELETE', headers: admin, body: JSON.stringify({ prefixes: left }) })

  console.log(failures === 0 ? 'ALL CHECKS PASSED' : `${failures} CHECK(S) FAILED`)
  process.exit(failures === 0 ? 0 : 1)
})().catch((e) => {
  console.error(e)
  process.exit(1)
})
