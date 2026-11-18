import { describe, expect, it } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { AppApiError, createSupabaseApi, isMissingRequestIdVersion } from './api'

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
