// TEST ONLY: runs only against a LOCAL Supabase (CI's Integration job, via
// scripts/db/request-ids-fallback-test.sh). Skipped everywhere else.
//
// The app's real API code (createSupabaseApi, through supabase-js and
// PostgREST) against both database schemas:
//   1. The old schema (the request id versions removed with their staging
//      rollback): posting and commenting still work, once each, through the
//      fallback to the original calls.
//   2. The new schema (the migration reapplied): the same request id sent
//      twice is one post, through the server's request id.
// The later migrations (member launch gate 20261129000000, photo audience 20261128000000, photo posts 20261127000000, feedback 20261126000000, profile pictures 20261125000000, moderation 20261124000000, profile details 20261123000000, pilot membership 20261122000000, viewed state
// 20261121000000, then the Inner Clique 20261120000000) are rolled back
// first, newest first, and reapplied last,
// oldest first, because each staging rollback refuses while a later migration
// is recorded. Leaves every migration applied, as it found them.
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { createSupabaseApi, newRequestId, type AppApi } from './api'

const { LOCAL_SUPABASE_API_URL: API, LOCAL_SUPABASE_ANON_KEY: ANON, LOCAL_SUPABASE_SERVICE_ROLE_KEY: SERVICE, LOCAL_SUPABASE_DB_URL: DB } = process.env
const enabled = !!(API && ANON && SERVICE && DB && /@(127\.0\.0\.1|localhost):/.test(DB))

const MIGRATION = 'supabase/migrations/20261119000000_publishing_request_ids.sql'
const ROLLBACK = 'scripts/db/staging-rollback-publishing-requests.sql'
// Newest first.
const LATER = [
  { version: '20261130000000', name: 'foundation_v2', file: 'supabase/migrations/20261130000000_foundation_v2.sql', rollback: 'scripts/db/staging-rollback-foundation-v2.sql', phrase: 'REMOVE THE STAGING FOUNDATION V2' },
  { version: '20261129000000', name: 'member_launch_gate', file: 'supabase/migrations/20261129000000_member_launch_gate.sql', rollback: 'scripts/db/staging-rollback-member-launch-gate.sql', phrase: 'REMOVE THE STAGING MEMBER LAUNCH GATE' },
  { version: '20261128000000', name: 'photo_audience', file: 'supabase/migrations/20261128000000_photo_audience.sql', rollback: 'scripts/db/staging-rollback-photo-audience.sql', phrase: 'REMOVE THE STAGING PHOTO AUDIENCE' },
  { version: '20261127000000', name: 'post_photos', file: 'supabase/migrations/20261127000000_post_photos.sql', rollback: 'scripts/db/staging-rollback-post-photos.sql', phrase: 'REMOVE THE STAGING PHOTO POSTS' },
  { version: '20261126000000', name: 'feedback', file: 'supabase/migrations/20261126000000_feedback.sql', rollback: 'scripts/db/staging-rollback-feedback.sql', phrase: 'REMOVE THE STAGING FEEDBACK' },
  { version: '20261125000000', name: 'avatars', file: 'supabase/migrations/20261125000000_avatars.sql', rollback: 'scripts/db/staging-rollback-avatars.sql', phrase: 'REMOVE THE STAGING AVATARS' },
  { version: '20261124000000', name: 'moderation', file: 'supabase/migrations/20261124000000_moderation.sql', rollback: 'scripts/db/staging-rollback-moderation.sql', phrase: 'REMOVE THE STAGING MODERATION' },
  { version: '20261123000000', name: 'profile_details', file: 'supabase/migrations/20261123000000_profile_details.sql', rollback: 'scripts/db/staging-rollback-profile-details.sql', phrase: 'REMOVE THE STAGING PROFILE DETAILS' },
  { version: '20261122000000', name: 'member_access', file: 'supabase/migrations/20261122000000_member_access.sql', rollback: 'scripts/db/staging-rollback-member-access.sql', phrase: 'REMOVE THE STAGING MEMBER ACCESS' },
  { version: '20261121000000', name: 'viewed_state', file: 'supabase/migrations/20261121000000_viewed_state.sql', rollback: 'scripts/db/staging-rollback-viewed-state.sql', phrase: 'REMOVE THE STAGING VIEWED STATE' },
  { version: '20261120000000', name: 'inner_clique', file: 'supabase/migrations/20261120000000_inner_clique.sql', rollback: 'scripts/db/staging-rollback-inner-clique.sql', phrase: 'REMOVE THE STAGING INNER CLIQUE' },
]
const sql = (q: string) => execFileSync('psql', [DB!, '-X', '-qAt', '-v', 'ON_ERROR_STOP=1', '-c', q]).toString().trim()
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
const recorded = (version: string) => sql(`select count(*) from supabase_migrations.schema_migrations where version = '${version}'`) === '1'
function removeLater() {
  for (const m of LATER) {
    if (recorded(m.version)) execFileSync('psql', [DB!, '-X', '-q', '-v', 'ON_ERROR_STOP=1', '-v', 'mode=apply', '-v', `confirm=${m.phrase}`, '-f', m.rollback])
  }
}
function reapplyLater() {
  for (const m of [...LATER].reverse()) {
    if (recorded(m.version)) continue
    execFileSync('psql', [DB!, '-X', '-q', '-v', 'ON_ERROR_STOP=1', '-f', m.file])
    sql(`insert into supabase_migrations.schema_migrations (version, name) values ('${m.version}', '${m.name}')`)
  }
  // The launch gate (20261129000000) comes back closed: reopen it (recorded) for the test accounts.
  execFileSync('scripts/db/local-open-launch-gate.sh', { env: { ...process.env, DB_URL: DB! } })
}

describe.skipIf(!enabled)('posting against the old and the new database schema (local Supabase)', () => {
  let admin: SupabaseClient
  let member: SupabaseClient
  let api: AppApi
  let userId = ''

  // Waits until PostgREST has reloaded and the request id version is (or isn't) there.
  async function waitForSchema(hasRequestIds: boolean) {
    for (let i = 0; i < 40; i++) {
      sql("notify pgrst, 'reload schema'")
      await sleep(250)
      const { error } = await member.rpc('app_create_post', { p_body: '', p_request_id: '00000000-0000-4000-8000-000000000000' })
      const missing = error?.code === 'PGRST202'
      if (missing !== hasRequestIds) return
    }
    throw new Error(`PostgREST did not reload: request id version ${hasRequestIds ? 'still missing' : 'still present'}`)
  }

  beforeAll(async () => {
    expect(sql("select count(*) from supabase_migrations.schema_migrations where version = '20261119000000'")).toBe('1')
    admin = createClient(API!, SERVICE!, { auth: { persistSession: false } })
    const email = `fallback-${Date.now()}@example.test`
    const password = `Fallback-${newRequestId()}`
    const created = await admin.auth.admin.createUser({ email, password, email_confirm: true })
    if (created.error) throw created.error
    userId = created.data.user.id
    sql(`update public.profiles set username = 'fb_${userId.slice(0, 8)}', display_name = 'Fallback' where id = '${userId}'`)
    member = createClient(API!, ANON!, { auth: { persistSession: false } })
    const signedIn = await member.auth.signInWithPassword({ email, password })
    if (signedIn.error) throw signedIn.error
    api = createSupabaseApi(member, userId)
  })

  afterAll(async () => {
    if (userId) await admin.auth.admin.deleteUser(userId)
    // Whatever happened, leave the migration applied.
    if (sql("select count(*) from supabase_migrations.schema_migrations where version = '20261119000000'") === '0') {
      execFileSync('psql', [DB!, '-X', '-q', '-v', 'ON_ERROR_STOP=1', '-f', MIGRATION])
      sql("insert into supabase_migrations.schema_migrations (version, name) values ('20261119000000', 'publishing_request_ids')")
    }
    reapplyLater()
    sql("notify pgrst, 'reload schema'")
  })

  it('on the old schema, a post and a comment sent with a request id are stored once each', async () => {
    removeLater()
    execFileSync('psql', [DB!, '-X', '-q', '-v', 'ON_ERROR_STOP=1', '-v', 'mode=apply', '-v', 'confirm=REMOVE THE STAGING PUBLISHING REQUEST IDS', '-f', ROLLBACK])
    await waitForSchema(false)
    // No membership gate in this schema: real PostgREST answers "function not
    // found" (PGRST202), so the app treats the account as pre-gate, exactly as
    // the database does, and saves the profile with the old own-row update.
    expect(await api.accessState()).toEqual({ status: 'active', expiresAt: null, preGate: true })
    await api.saveProfile({ username: `fb_${userId.slice(0, 8)}`, displayName: 'Fallback Old' })
    expect(sql(`select display_name from public.profiles where id = '${userId}'`)).toBe('Fallback Old')
    const postId = await api.createPost('Sent to the old schema', newRequestId())
    expect(sql(`select count(*) from social.posts where author_id = '${userId}' and body = 'Sent to the old schema'`)).toBe('1')
    expect(sql(`select id from social.posts where author_id = '${userId}' and body = 'Sent to the old schema'`)).toBe(postId)
    await api.addComment(postId, 'Commented on the old schema', newRequestId())
    expect(sql(`select count(*) from social.comments where author_id = '${userId}' and body = 'Commented on the old schema'`)).toBe('1')
  })

  it('on the new schema, the same request id sent twice is one post', async () => {
    execFileSync('psql', [DB!, '-X', '-q', '-v', 'ON_ERROR_STOP=1', '-f', MIGRATION])
    sql("insert into supabase_migrations.schema_migrations (version, name) values ('20261119000000', 'publishing_request_ids')")
    reapplyLater()
    // With pilot membership back (20261122000000), posting needs an active
    // membership. Granted only now, after every rollback in this job has run:
    // membership history is audit data, and the rollbacks refuse once it exists.
    sql(`select ops.grant_member_access('${userId}', 'tester', 'integration-test')`)
    await waitForSchema(true)
    // With the gate: a real state (never pre-gate), and the profile saved through app_set_profile.
    expect(await api.accessState()).toEqual({ status: 'active', expiresAt: null })
    await api.saveProfile({ username: `fb_${userId.slice(0, 8)}`, displayName: 'Fallback New' })
    expect(sql(`select display_name from public.profiles where id = '${userId}'`)).toBe('Fallback New')
    const rid = newRequestId()
    const a = await api.createPost('Sent twice to the new schema', rid)
    const b = await api.createPost('Sent twice to the new schema', rid)
    expect(b).toBe(a)
    expect(sql(`select count(*) from social.posts where author_id = '${userId}' and body = 'Sent twice to the new schema'`)).toBe('1')
    expect(sql(`select client_request_id from social.posts where id = '${a}'`)).toBe(rid)
  })

  it('the migration file in use is the one under review', () => {
    expect(readFileSync(MIGRATION, 'utf8')).toContain('create function public.app_create_post(p_body text, p_request_id uuid)')
  })
})
