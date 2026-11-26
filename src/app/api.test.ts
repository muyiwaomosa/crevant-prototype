import { describe, expect, it } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { AppApiError, DELETION_REGISTER_RPCS, createSupabaseApi, isMissingFunction, isMissingRequestIdVersion, toMyProgress } from './api'

// The exact answers local Supabase gave when the request id versions were not
// deployed (PostgREST lists the parameters it searched for, alphabetically).
const MISSING_POST = {
  code: 'PGRST202',
  message: 'Could not find the function public.app_create_post(p_body, p_request_id) in the schema cache',
  details: 'Searched for the function public.app_create_post with parameters p_body, p_request_id or with a single unnamed json/jsonb parameter, but no matches were found in the schema cache.',
  hint: 'Perhaps you meant to call the function public.app_create_post(p_body)',
}
const MISSING_COMMENT = {
  code: 'PGRST202',
  message: 'Could not find the function public.app_add_comment(p_body, p_post, p_request_id) in the schema cache',
  details: '',
  hint: 'Perhaps you meant to call the function public.app_add_comment(p_body, p_post)',
}
// What supabase-js returns when the request never got an answer.
const NETWORK = { code: '', message: 'TypeError: Failed to fetch', details: 'TypeError: Failed to fetch', hint: '' }

type Answer = { data?: unknown; error?: unknown } | Error
function fakeClient(answers: Answer[]) {
  const calls: Array<{ fn: string; args: Record<string, unknown> }> = []
  const client = {
    async rpc(fn: string, args: Record<string, unknown>) {
      calls.push({ fn, args })
      const a = answers.shift()
      if (!a) throw new Error('unexpected extra call')
      if (a instanceof Error) throw a
      return { data: a.data ?? null, error: a.error ?? null }
    },
    // The legacy own-row profile update (only before 20261122000000).
    from(table: string) {
      return {
        update(values: Record<string, unknown>) {
          return {
            async eq(col: string, val: unknown) {
              calls.push({ fn: `update ${table}`, args: { ...values, [col]: val } })
              const a = answers.shift()
              if (!a || a instanceof Error) throw new Error('unexpected extra call')
              return { data: a.data ?? null, error: a.error ?? null }
            },
          }
        },
      }
    },
  }
  return { api: createSupabaseApi(client as unknown as SupabaseClient, 'u1'), calls }
}

describe('isMissingRequestIdVersion', () => {
  it('is true only for PGRST202 naming exactly this function with p_request_id', () => {
    expect(isMissingRequestIdVersion(MISSING_POST, 'app_create_post')).toBe(true)
    expect(isMissingRequestIdVersion(MISSING_COMMENT, 'app_add_comment')).toBe(true)
    // Another function, or the original signature itself missing, or another code.
    expect(isMissingRequestIdVersion(MISSING_POST, 'app_add_comment')).toBe(false)
    expect(isMissingRequestIdVersion({ ...MISSING_POST, message: 'Could not find the function public.app_create_post(p_body) in the schema cache' }, 'app_create_post')).toBe(false)
    expect(isMissingRequestIdVersion({ ...MISSING_POST, message: 'Could not find the function public.app_create_post_x(p_body, p_request_id) in the schema cache' }, 'app_create_post')).toBe(false)
    expect(isMissingRequestIdVersion({ ...MISSING_POST, code: 'PGRST203' }, 'app_create_post')).toBe(false)
    expect(isMissingRequestIdVersion({ ...MISSING_POST, code: '' }, 'app_create_post')).toBe(false)
    expect(isMissingRequestIdVersion({ code: 'PGRST202', message: '' }, 'app_create_post')).toBe(false)
    expect(isMissingRequestIdVersion(NETWORK, 'app_create_post')).toBe(false)
    expect(isMissingRequestIdVersion(null, 'app_create_post')).toBe(false)
  })
})

describe('posting with a request id', () => {
  it('sends the request id first, and uses only that call when it works', async () => {
    const { api, calls } = fakeClient([{ data: 'post-1' }])
    expect(await api.createPost('Hello', 'rq-1')).toBe('post-1')
    expect(calls).toEqual([{ fn: 'app_create_post', args: { p_body: 'Hello', p_request_id: 'rq-1' } }])
  })

  it('falls back once to the original call when the database has no request id version (old schema)', async () => {
    const { api, calls } = fakeClient([{ error: MISSING_POST }, { data: 'post-2' }])
    expect(await api.createPost('Hello', 'rq-2')).toBe('post-2')
    expect(calls).toEqual([
      { fn: 'app_create_post', args: { p_body: 'Hello', p_request_id: 'rq-2' } },
      { fn: 'app_create_post', args: { p_body: 'Hello' } },
    ])
  })

  it('never sends a second write after an ambiguous failure', async () => {
    const ambiguous: Answer[] = [
      { error: NETWORK }, // no answer: the first write may have been stored
      { error: { code: '57014', message: 'canceling statement due to statement timeout' } },
      { error: { code: '', message: 'upstream request timeout' } },
      { error: { code: 'PGRST000', message: 'Could not connect to the database' } },
      { error: { code: '23505', message: 'duplicate key value violates unique constraint' } },
      { error: { ...MISSING_POST, message: 'Could not find the function public.app_add_comment(p_body, p_post, p_request_id) in the schema cache' } },
      new TypeError('Failed to fetch'), // the client itself throwing
    ]
    for (const answer of ambiguous) {
      const { api, calls } = fakeClient([answer])
      await expect(api.createPost('Hello', 'rq-3')).rejects.toBeInstanceOf(Error)
      expect(calls, JSON.stringify(answer)).toHaveLength(1)
    }
    const { api } = fakeClient([{ error: NETWORK }])
    await expect(api.createPost('Hello', 'rq-4')).rejects.toEqual(new AppApiError('network'))
  })

  it('reports a failure of the fallback call itself, without trying again', async () => {
    const { api, calls } = fakeClient([{ error: MISSING_POST }, { error: { code: 'P0001', message: 'rate_limited' } }])
    await expect(api.createPost('Hello', 'rq-5')).rejects.toEqual(new AppApiError('rate_limited'))
    expect(calls).toHaveLength(2)
  })

  it('without a request id, sends only the original call', async () => {
    const { api, calls } = fakeClient([{ data: 'post-6' }])
    expect(await api.createPost('Hello')).toBe('post-6')
    expect(calls).toEqual([{ fn: 'app_create_post', args: { p_body: 'Hello' } }])
  })
})

describe('commenting with a request id', () => {
  it('falls back once to the original call on the old schema', async () => {
    const { api, calls } = fakeClient([{ error: MISSING_COMMENT }, { data: 'c-1' }])
    expect(await api.addComment('p1', 'Nice', 'rq-c1')).toBe('c-1')
    expect(calls).toEqual([
      { fn: 'app_add_comment', args: { p_post: 'p1', p_body: 'Nice', p_request_id: 'rq-c1' } },
      { fn: 'app_add_comment', args: { p_post: 'p1', p_body: 'Nice' } },
    ])
  })

  it('never sends a second write after an ambiguous failure, or a PGRST202 about posting', async () => {
    for (const answer of [{ error: NETWORK }, { error: MISSING_POST }, new TypeError('Failed to fetch')] as Answer[]) {
      const { api, calls } = fakeClient([answer])
      await expect(api.addComment('p1', 'Nice', 'rq-c2')).rejects.toBeInstanceOf(Error)
      expect(calls).toHaveLength(1)
    }
  })
})

describe('pilot membership (20261122000000)', () => {
  it('reads the account\'s own access state, and treats anything unexpected as no access', async () => {
    const { api, calls } = fakeClient([
      { data: [{ status: 'active', expires_at: '2026-12-31T00:00:00Z' }] },
      { data: [{ status: 'revoked', expires_at: null }] },
      { data: [{ status: 'expired', expires_at: '2026-11-01T00:00:00Z' }] },
      { data: [{ status: 'attestation_required', expires_at: null }] },
      { data: [{ status: 'something-new' }] },
      { data: 'link_required' },
      { data: [] },
      { data: 'link_required' },
    ])
    expect(await api.accessState()).toEqual({ status: 'active', expiresAt: '2026-12-31T00:00:00Z' })
    expect(await api.accessState()).toEqual({ status: 'revoked', expiresAt: null })
    expect(await api.accessState()).toEqual({ status: 'expired', expiresAt: null })
    expect(await api.accessState()).toEqual({ status: 'attestation_required', expiresAt: null })
    expect(await api.accessState()).toEqual({ status: 'none', expiresAt: null, registration: 'link_required' })
    expect(await api.accessState()).toEqual({ status: 'none', expiresAt: null, registration: 'link_required' })
    // Only a 'none' state tries to claim membership through a registration link.
    expect(calls.map((c) => c.fn)).toEqual(['app_access_state', 'app_access_state', 'app_access_state', 'app_access_state', 'app_access_state', 'app_claim_access', 'app_access_state', 'app_claim_access'])
  })

  it('claims membership through the registration link (20261130000000) and explains every outcome', async () => {
    const none = { data: [{ status: 'none', expires_at: null }] }
    const outcomes = ['not_confirmed', 'invalid', 'paused', 'closed', 'full', 'referrer_limit', 'link_required'] as const
    for (const o of outcomes) {
      const { api } = fakeClient([none, { data: o }])
      expect(await api.accessState(), o).toEqual({ status: 'none', expiresAt: null, registration: o })
    }
    const granted = fakeClient([none, { data: 'active' }])
    expect(await granted.api.accessState()).toEqual({ status: 'active', expiresAt: null })
    expect(granted.calls[1]).toEqual({ fn: 'app_claim_access', args: { p_code: null, p_adult_attested: false, p_wording_version: 'adult-v1' } })
    const revoked = fakeClient([none, { data: 'revoked' }])
    expect(await revoked.api.accessState()).toEqual({ status: 'revoked', expiresAt: null })
    // An unexpected answer is never access.
    for (const data of ['ACTIVE', 'admin', null, 7]) {
      const { api } = fakeClient([none, { data }])
      expect((await api.accessState()).status, String(data)).toBe('none')
    }
    // A failed claim asks to retry; before the migration there is nothing to claim.
    const failed = fakeClient([none, { error: { code: 'XX000', message: 'boom' } }])
    expect(await failed.api.accessState()).toEqual({ status: 'none', expiresAt: null, registration: 'retry' })
    const missing = fakeClient([none, { error: { code: 'PGRST202', message: 'Could not find the function public.app_claim_access(p_adult_attested, p_code, p_wording_version) in the schema cache' } }])
    expect(await missing.api.accessState()).toEqual({ status: 'none', expiresAt: null })
  })

  it('saves the profile through app_set_profile (never a direct table update), trimmed', async () => {
    const { api, calls } = fakeClient([{ data: null }])
    await api.saveProfile({ username: ' mia ', displayName: '  Mia Chen ' })
    expect(calls).toEqual([{ fn: 'app_set_profile', args: { p_username: 'mia', p_display_name: 'Mia Chen' } }])
  })

  it('a refused profile save without membership surfaces as no_pilot_access', async () => {
    const { api } = fakeClient([{ error: { code: 'P0001', message: 'no_pilot_access', details: 'Your pilot access is not active.' } }])
    await expect(api.saveProfile({ username: 'mia', displayName: 'Mia' })).rejects.toMatchObject({ code: 'no_pilot_access' })
  })

  it('a taken username still says it is taken', async () => {
    const { api } = fakeClient([{ error: { code: '23505', message: 'duplicate key value violates unique constraint "profiles_username_unique"' } }])
    await expect(api.saveProfile({ username: 'mia', displayName: 'Mia' })).rejects.toBeInstanceOf(AppApiError)
    const { api: api2 } = fakeClient([{ error: { code: '23505', message: 'duplicate key value violates unique constraint "profiles_username_unique"' } }])
    await expect(api2.saveProfile({ username: 'mia', displayName: 'Mia' })).rejects.toMatchObject({ code: 'username_taken' })
  })
})

// What PostgREST answers when the membership functions don't exist yet (a
// database before 20261122000000): PGRST202, naming the exact function.
const NO_ACCESS_FN = { code: 'PGRST202', message: 'Could not find the function public.app_access_state without parameters in the schema cache', details: '', hint: null }
const NO_SET_PROFILE_FN = {
  code: 'PGRST202',
  message: 'Could not find the function public.app_set_profile(p_display_name, p_username) in the schema cache',
  details: 'Searched for the function public.app_set_profile with parameters p_display_name, p_username or with a single unnamed json/jsonb parameter, but no matches were found in the schema cache.',
  hint: null,
}

describe('before the membership migration (compatibility, never a bypass)', () => {
  it('recognises only a definite "function not found" for that exact function', () => {
    expect(isMissingFunction(NO_ACCESS_FN, 'app_access_state')).toBe(true)
    expect(isMissingFunction(NO_SET_PROFILE_FN, 'app_set_profile')).toBe(true)
    // Not the same function, not PGRST202, or not a "not found" message: never.
    expect(isMissingFunction(NO_ACCESS_FN, 'app_set_profile')).toBe(false)
    expect(isMissingFunction({ ...NO_ACCESS_FN, message: 'Could not find the function public.app_access_states without parameters in the schema cache' }, 'app_access_state')).toBe(false)
    expect(isMissingFunction({ code: 'PGRST203', message: NO_ACCESS_FN.message }, 'app_access_state')).toBe(false)
    expect(isMissingFunction({ code: '42501', message: 'permission denied for function app_access_state' }, 'app_access_state')).toBe(false)
    expect(isMissingFunction({ code: 'P0001', message: 'no_pilot_access' }, 'app_access_state')).toBe(false)
    expect(isMissingFunction({ code: 'PGRST202', message: 'see: Could not find the function public.app_access_state' }, 'app_access_state')).toBe(false)
    expect(isMissingFunction(null, 'app_access_state')).toBe(false)
  })

  it('a database without the gate yet: every signed-in account is active (pre-gate), as the database itself treats it', async () => {
    const { api } = fakeClient([{ error: NO_ACCESS_FN }])
    expect(await api.accessState()).toEqual({ status: 'active', expiresAt: null, preGate: true })
  })

  it('any other failure is a failure, never access', async () => {
    for (const error of [
      { code: '42501', message: 'permission denied for function app_access_state' },
      { code: 'P0001', message: 'not_signed_in' },
      { code: 'PGRST000', message: 'Could not connect to the database' },
      { code: '57014', message: 'canceling statement due to statement timeout' },
      { code: 'PGRST202', message: 'Could not find the function public.app_other without parameters in the schema cache' },
      NETWORK,
    ]) {
      const { api } = fakeClient([{ error }])
      await expect(api.accessState(), error.message).rejects.toBeInstanceOf(AppApiError)
    }
    const thrown = fakeClient([new Error('socket hang up')])
    await expect(thrown.api.accessState()).rejects.toThrow()
  })

  it('an unexpected reply is never access', async () => {
    for (const data of [null, {}, 'active', [{}], [{ status: 'ACTIVE' }], [{ status: true }], [{ status: 'admin' }]]) {
      const { api } = fakeClient([{ data }, { data: 'link_required' }])
      expect((await api.accessState()).status, JSON.stringify(data)).toBe('none')
    }
    const { api } = fakeClient([{ data: [{ status: 'active', expires_at: 12345 }] }])
    expect(await api.accessState()).toEqual({ status: 'active', expiresAt: null })
  })

  it('profile setup falls back to the own-row update only when app_set_profile does not exist', async () => {
    const { api, calls } = fakeClient([{ error: NO_SET_PROFILE_FN }, { data: null }])
    await api.saveProfile({ username: ' mia ', displayName: ' Mia ' })
    expect(calls).toEqual([
      { fn: 'app_set_profile', args: { p_username: 'mia', p_display_name: 'Mia' } },
      { fn: 'update profiles', args: { username: 'mia', display_name: 'Mia', id: 'u1' } },
    ])
  })

  it('profile setup never falls back on any other error (no_pilot_access, permission, network, timeout)', async () => {
    for (const error of [
      { code: 'P0001', message: 'no_pilot_access' },
      { code: '42501', message: 'permission denied for function app_set_profile' },
      { code: 'PGRST000', message: 'Could not connect to the database' },
      NETWORK,
    ]) {
      const { api, calls } = fakeClient([{ error }])
      await expect(api.saveProfile({ username: 'mia', displayName: 'Mia' })).rejects.toBeInstanceOf(AppApiError)
      expect(calls.map((c) => c.fn), error.message).toEqual(['app_set_profile'])
    }
  })
})

// Profile details (20261123000000): a database without them answers PGRST202
// for the exact function, and only then does the app fall back.
const missing = (fn: string, params = '') => ({
  code: 'PGRST202',
  message: params ? `Could not find the function public.${fn}(${params}) in the schema cache` : `Could not find the function public.${fn} without parameters in the schema cache`,
  details: '',
  hint: null,
})

describe('profile details (20261123000000)', () => {
  it('saves all four fields through app_set_profile_details, trimmed, empty as null', async () => {
    const { api, calls } = fakeClient([{ data: null }])
    await api.saveDetails({ identity: 'both', bio: '  Hi  ', followReason: '   ', topics: ['food'] })
    expect(calls).toEqual([{ fn: 'app_set_profile_details', args: { p_identity: 'both', p_bio: 'Hi', p_follow_reason: null, p_topics: ['food'] } }])
  })

  it('maps rows, and never trusts an unknown identity', async () => {
    const { api } = fakeClient([
      { data: [{ identity: 'creator', bio: 'Bio', follow_reason: 'Why', topics: ['food', 'music'], onboarded: true }] },
      { data: [{ identity: 'admin', bio: '', follow_reason: null, topics: 'food', onboarded: false }] },
      { data: [{ identity: 'fan', bio: null, follow_reason: null, topics: [] }] },
      { data: [] },
    ])
    expect(await api.myDetails()).toEqual({ identity: 'creator', bio: 'Bio', followReason: 'Why', topics: ['food', 'music'], onboarded: true })
    expect(await api.myDetails()).toEqual({ identity: null, bio: null, followReason: null, topics: [], onboarded: false })
    expect(await api.memberDetails('c1')).toEqual({ identity: 'fan', bio: null, followReason: null, topics: [] })
    expect(await api.memberDetails('gone')).toBeNull()
  })

  it('Discover sends the interest and reads shared interests; without the new function it uses the original Discover', async () => {
    const row = { id: 'c1', username: 'c', display_name: 'C', post_count: '2', follower_count: 1, followed_by_me: false, in_my_clique: false }
    const { api, calls } = fakeClient([
      { data: [{ ...row, identity: 'creator', bio: 'B', follow_reason: null, topics: ['food'], shared_topics: 1 }] },
      { error: missing('app_discover_people', 'p_limit, p_query, p_topic') },
      { data: [row] },
    ])
    expect((await api.discover(' cook ', 'food'))[0]).toMatchObject({ postCount: 2, sharedTopics: 1, details: { identity: 'creator', bio: 'B', topics: ['food'] } })
    const old = await api.discover('cook', 'food')
    expect(old[0].details).toBeUndefined()
    expect(calls.map((c) => c.fn)).toEqual(['app_discover_people', 'app_discover_people', 'app_discover'])
    expect(calls[0].args).toEqual({ p_query: 'cook', p_topic: 'food', p_limit: 30 })
    expect(calls[2].args).toEqual({ p_query: 'cook', p_limit: 30 })
  })

  it('on a database without profile details, everything degrades to "not there", never to an error or a bypass', async () => {
    const { api } = fakeClient([
      { error: missing('app_topics') },
      { error: missing('app_my_details') },
      { error: missing('app_member_details', 'p_member') },
      { error: missing('app_suggested_creators', 'p_limit') },
      { error: missing('app_set_profile_details', 'p_bio, p_follow_reason, p_identity, p_topics') },
    ])
    expect(await api.topics()).toBeNull()
    expect(await api.myDetails()).toBeNull()
    expect(await api.memberDetails('c1')).toBeNull()
    expect(await api.suggested()).toEqual([])
    await expect(api.saveDetails({ identity: 'fan', bio: null, followReason: null, topics: [] })).rejects.toMatchObject({ code: 'not_available' })
  })

  it('any other failure stays a failure (no_pilot_access, another function, network)', async () => {
    for (const error of [{ code: 'P0001', message: 'no_pilot_access' }, missing('app_topicsx'), NETWORK]) {
      const { api } = fakeClient([{ error }, { error }, { error }])
      await expect(api.topics(), error.message).rejects.toBeInstanceOf(AppApiError)
      await expect(api.myDetails()).rejects.toBeInstanceOf(AppApiError)
      await expect(api.suggested()).rejects.toBeInstanceOf(AppApiError)
    }
    const { api } = fakeClient([{ error: { code: 'P0001', message: 'too_many_topics' } }])
    await expect(api.saveDetails({ identity: null, bio: null, followReason: null, topics: [] })).rejects.toMatchObject({ code: 'too_many_topics' })
  })
})

// Profile pictures (the avatar Edge Function). With the function missing or
// failing, links are simply absent (initials) and saving says why; nothing throws into the app.
describe('profile pictures when the avatar function is unavailable', () => {
  function pictureClient(answer: { data?: unknown; status?: number; body?: unknown } | Error) {
    const calls: string[] = []
    const client = {
      functions: {
        async invoke(name: string) {
          calls.push(name)
          if (answer instanceof Error) return { data: null, error: answer }
          if (answer.status && answer.status >= 400) {
            return { data: null, error: { name: 'FunctionsHttpError', context: new Response(JSON.stringify(answer.body ?? {}), { status: answer.status }) } }
          }
          return { data: answer.data ?? null, error: null }
        },
      },
      storage: { from: () => ({ getPublicUrl: () => ({ data: { publicUrl: 'https://staging.example/storage/v1/object/public/avatars/x' } }) }) },
    }
    return { api: createSupabaseApi(client as unknown as SupabaseClient, 'u1'), calls }
  }

  it('links: a missing function, a server error or a network failure all mean "no pictures" (initials)', async () => {
    for (const answer of [{ status: 404, body: 'Function not found' }, { status: 503, body: { error: 'unavailable' } }, { status: 500 }, new Error('Failed to fetch')]) {
      const { api } = pictureClient(answer)
      expect(await api.avatarLinks(['c1', 'c2'])).toEqual({})
    }
  })

  it('links: valid answers become full links on the project; anything else is ignored', async () => {
    const { api } = pictureClient({ data: { avatars: { c1: { url: '/object/sign/avatars/c1/a.jpg?token=t', updatedAt: null }, c2: { url: 'https://evil.example/x.jpg' } } } })
    expect(await api.avatarLinks(['c1', 'c2'])).toEqual({ c1: { url: 'https://staging.example/storage/v1/object/sign/avatars/c1/a.jpg?token=t', updatedAt: null } })
  })

  it('saving and removing explain what went wrong, with known codes only', async () => {
    const cases: Array<[{ status: number; body?: unknown } | Error, string]> = [
      [{ status: 404, body: 'Function not found' }, 'not_available'],
      [{ status: 503, body: { error: 'unavailable' } }, 'not_available'],
      [{ status: 429, body: { error: 'rate_limited' } }, 'avatar_limit'],
      [{ status: 422, body: { error: 'not_jpeg' } }, 'not_jpeg'],
      [{ status: 413, body: { error: 'too_large' } }, 'photo_too_large'],
      [{ status: 401, body: { error: 'not_signed_in' } }, 'not_signed_in'],
      [{ status: 400, body: { error: 'some internal detail' } }, 'unknown'],
      [{ status: 502 }, 'storage_unavailable'],
      // No answer at all, while the device is online: the media service, not the member's connection.
      [new Error('Failed to fetch'), 'media_unreachable'],
    ]
    for (const [answer, code] of cases) {
      const up = pictureClient(answer)
      await expect(up.api.uploadAvatar(new Blob(['x'], { type: 'image/jpeg' }))).rejects.toMatchObject({ code })
      const rm = pictureClient(answer)
      await expect(rm.api.removeAvatar()).rejects.toMatchObject({ code })
    }
  })
})

describe('foundation v2 (20261130000000): complete paging, adult confirmation, referral links', () => {
  const row = (id: string, at: string, inClique = false) => ({
    id, author_id: 'c1', author_username: 'c1', author_display_name: 'C1', body: 'x', created_at: at,
    like_count: 0, comment_count: 0, liked_by_me: false, author_in_my_clique: inClique, is_mine: false, media: null,
  })
  const MISSING = (fn: string) => ({ code: 'PGRST202', message: `Could not find the function public.${fn}(p_before_at, p_before_id, p_filter, p_limit) in the schema cache` })

  it('pages Home with reposts on (activity, id) with the face filter (20261202000000)', async () => {
    const { api, calls } = fakeClient([{ data: [{ ...row('p2', '2026-11-30T12:00:00Z'), activity_at: '2026-11-30T13:00:00Z', reposted_by_id: 'r1', reposted_by_username: 'rae', reposted_by_display_name: 'Rae' }] }])
    const posts = await api.feed({ createdAt: '2026-11-30T14:00:00Z', id: 'p3' }, 'all')
    expect(posts.map((p) => [p.id, p.activityAt, p.repostedBy?.username])).toEqual([['p2', '2026-11-30T13:00:00Z', 'rae']])
    expect(calls).toEqual([{ fn: 'app_feed_items_page', args: { p_before_at: '2026-11-30T14:00:00Z', p_before_id: 'p3', p_limit: 20, p_filter: 'all' } }])
  })

  it('before content, pages Home on (created_at, id) with the face filter', async () => {
    const { api, calls } = fakeClient([{ error: MISSING('app_feed_items_page') }, { data: [row('p2', '2026-11-30T12:00:00Z')] }])
    const posts = await api.feed({ createdAt: '2026-11-30T12:00:00Z', id: 'p3' }, 'clique')
    expect(posts.map((p) => p.id)).toEqual(['p2'])
    expect(calls[1]).toEqual({ fn: 'app_feed_page', args: { p_before_at: '2026-11-30T12:00:00Z', p_before_id: 'p3', p_limit: 20, p_filter: 'clique' } })
  })

  it('before the migration, falls back to time-only paging and filters My Clique in the app', async () => {
    const { api, calls } = fakeClient([{ error: MISSING('app_feed_items_page') }, { error: MISSING('app_feed_page') }, { data: [row('a', '2026-11-30T12:00:00Z', true), row('b', '2026-11-30T11:00:00Z', false)] }])
    const posts = await api.feed(undefined, 'clique')
    expect(posts.map((p) => p.id)).toEqual(['a'])
    expect(calls[2]).toEqual({ fn: 'app_feed', args: { p_before: null, p_limit: 20 } })
  })

  it('any other paging error is reported, never silently downgraded', async () => {
    const { api } = fakeClient([{ error: { code: 'P0001', message: 'invalid_cursor' } }])
    await expect(api.feed({ createdAt: 'x', id: 'y' })).rejects.toBeInstanceOf(AppApiError)
  })

  it('pages a member\'s posts on (created_at, id)', async () => {
    const { api, calls } = fakeClient([{ data: [] }])
    await api.memberPosts('m1', { createdAt: '2026-11-30T12:00:00Z', id: 'p1' })
    expect(calls).toEqual([{ fn: 'app_member_posts_page', args: { p_member: 'm1', p_before_at: '2026-11-30T12:00:00Z', p_before_id: 'p1', p_limit: 20 } }])
  })

  it('records the adult confirmation with the wording version', async () => {
    const { api, calls } = fakeClient([{ data: '2026-11-30T12:00:00Z' }])
    await api.attestAdult()
    expect(calls).toEqual([{ fn: 'app_attest_adult', args: { p_wording_version: 'adult-v1' } }])
  })

  it('reads the personal referral code, or nothing before the migration', async () => {
    expect(await fakeClient([{ data: '0123456789abcdef' }]).api.myReferralCode()).toBe('0123456789abcdef')
    expect(await fakeClient([{ error: { code: 'PGRST202', message: 'Could not find the function public.app_my_referral_link without parameters in the schema cache' } }]).api.myReferralCode()).toBeNull()
  })
})

describe('a media function that never answers is not blamed on the connection', () => {
  function mediaClient(error: unknown) {
    const client = {
      functions: { invoke: async () => ({ data: null, error }) },
      storage: { from: () => ({ getPublicUrl: () => ({ data: { publicUrl: 'https://staging.example/storage/v1/object/public/x/x' } }) }) },
    }
    return createSupabaseApi(client as unknown as SupabaseClient, 'u1')
  }
  const fetchFailed = Object.assign(new Error('Failed to send a request to the Edge Function'), { name: 'FunctionsFetchError', context: new TypeError('Failed to fetch') })

  it('online: photo, avatar and video calls say the media service did not answer, and text posting is unaffected', async () => {
    const warn = console.warn
    const seen: string[] = []
    console.warn = (m: string) => void seen.push(m)
    try {
      const api = mediaClient(fetchFailed)
      await expect(api.uploadPhoto(new Blob(['x'], { type: 'image/jpeg' }))).rejects.toMatchObject({ code: 'media_unreachable' })
      await expect(api.uploadAvatar(new Blob(['x'], { type: 'image/jpeg' }))).rejects.toMatchObject({ code: 'media_unreachable' })
      expect(await api.photoLinks(['p1'])).toEqual({})
      expect(await api.avatarLinks(['c1'])).toEqual({})
    } finally {
      console.warn = warn
    }
    // The console says which function and from which address, never a token or a response body.
    expect(seen.some((m) => /post-media photo media function did not answer from /.test(m))).toBe(true)
    expect(seen.some((m) => /avatar urls media function did not answer/.test(m))).toBe(true)
    expect(seen.join(' ')).not.toMatch(/Bearer|eyJ/)
  })

  it('offline: the same failure asks the member to check the connection', async () => {
    const desc = Object.getOwnPropertyDescriptor(globalThis, 'navigator')
    Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { onLine: false } })
    try {
      await expect(mediaClient(fetchFailed).uploadPhoto(new Blob(['x'], { type: 'image/jpeg' }))).rejects.toMatchObject({ code: 'network' })
    } finally {
      if (desc) Object.defineProperty(globalThis, 'navigator', desc)
      else delete (globalThis as { navigator?: unknown }).navigator
    }
  })
})

// The deletion register (docs/RECOVERY.md): a completed deletion or restore is
// reported to the post-media log at once; the deletion never waits for it or fails because of it.
describe('reporting deletions right away', () => {
  function reportingClient(invoke: () => Promise<unknown>) {
    const invoked: string[] = []
    const rpcs: string[] = []
    const client = {
      async rpc(fn: string) {
        rpcs.push(fn)
        return { data: null, error: null }
      },
      functions: {
        invoke(name: string) {
          invoked.push(name)
          return invoke()
        },
      },
    }
    return { api: createSupabaseApi(client as unknown as SupabaseClient, 'u1'), invoked, rpcs }
  }

  it('after a member deletes a post or comment, and after moderator and founder removals, it asks post-media to report', async () => {
    const { api, invoked, rpcs } = reportingClient(async () => ({ data: { reported: 1 }, error: null }))
    await api.deletePost('p1')
    await api.deleteComment('c1')
    await api.modRestore('r1')
    expect(rpcs).toEqual(['app_delete_post', 'app_delete_comment', 'app_mod_restore'])
    expect(invoked).toEqual(['post-media/deletions', 'post-media/deletions', 'post-media/deletions'])
  })

  it('does not report after calls that delete nothing', async () => {
    const { api, invoked } = reportingClient(async () => ({ data: null, error: null }))
    await api.modDismiss('r1')
    expect(invoked).toEqual([])
  })

  it('a failed or unavailable report never fails the deletion', async () => {
    const rejected = reportingClient(() => Promise.reject(new Error('Failed to fetch')))
    await rejected.api.deletePost('p1') // rejects the test if the deletion fails
    const thrown = reportingClient(() => {
      throw new Error('functions unavailable')
    })
    await thrown.api.deleteComment('c1')
  })

  it('covers every function that deletes or restores an account, post or comment', () => {
    expect([...DELETION_REGISTER_RPCS].sort()).toEqual([
      'app_delete_comment', 'app_delete_post', 'app_founder_delete_member', 'app_mod_decide_appeal',
      'app_mod_enforce', 'app_mod_hide', 'app_mod_lift', 'app_mod_restore',
    ])
  })
})

describe('progression (20261217000000)', () => {
  it('reads a switched-off answer as disabled, and an enabled one with null targets kept null', () => {
    expect(toMyProgress({ enabled: false })).toEqual({ enabled: false })
    expect(toMyProgress({})).toEqual({ enabled: false })
    const p = toMyProgress({
      enabled: true,
      good_standing: false,
      creator: { status: 'under_review', qualified_at: null, goals_since: '2026-11-26T00:00:00Z', steps: [{ metric: 'original_posts', value: 3, target: null }] },
      consumer: { status: 'qualified', qualified_at: '2026-11-26T00:00:00Z', steps: [{ metric: 'shares', value: '2', target: 1 }] },
      notices: [{ kind: 'hold', message: 'Being checked.', since: '2026-11-26T00:00:00Z', scope: 'account' }],
      earnings: {
        creator: { accumulated_cents: 4000, locked_cents: 2000, paused_cents: 2000, eligible_cents: 0, settled_cents: 0 },
        consumer: { accumulated_cents: '500', locked_cents: 0, eligible_cents: 500, settled_cents: 0 },
      },
    })
    expect(p).toEqual({
      enabled: true,
      goodStanding: false,
      creator: { status: 'under_review', qualifiedAt: null, goalsSince: '2026-11-26T00:00:00Z', steps: [{ metric: 'original_posts', value: 3, target: null }] },
      consumer: { status: 'qualified', qualifiedAt: '2026-11-26T00:00:00Z', goalsSince: null, steps: [{ metric: 'shares', value: 2, target: 1 }] },
      notices: [{ kind: 'hold', message: 'Being checked.', since: '2026-11-26T00:00:00Z', scope: 'account', audience: null }],
      earnings: {
        creator: { accumulatedCents: 4000, lockedCents: 2000, pausedCents: 2000, eligibleCents: 0, settledCents: 0 },
        consumer: { accumulatedCents: 500, lockedCents: 0, pausedCents: 0, eligibleCents: 500, settledCents: 0 },
      },
    })
  })
})
