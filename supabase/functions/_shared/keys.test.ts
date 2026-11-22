// Unit tests for the member functions' project keys (new keys first, legacy fallback).
import { describe, expect, it } from 'vitest'
import { projectKeys, serviceHeaders } from './keys.ts'

const PUB = 'sb_publishable_AbCdEfGhIjKlMnOp_12-3'
const SEC = 'sb_secret_QrStUvWxYz0123456789_-x'
const ANON = 'eyJhbGciOiJIUzI1NiJ9.eyJyb2xlIjoiYW5vbiJ9.c2lnbmF0dXJlLWFub24tdGVzdA'
const SERVICE = 'eyJhbGciOiJIUzI1NiJ9.eyJyb2xlIjoic2VydmljZV9yb2xlIn0.c2lnbmF0dXJlLXNlcnZpY2UtdGVzdA'
const from = (vars: Record<string, string>) => projectKeys((k) => (vars[k] ?? '').trim())
const dict = (v: unknown) => JSON.stringify(v)

describe('projectKeys', () => {
  it('uses the hosted JSON dictionaries ("default") when only the new keys are present', () => {
    const k = from({ SUPABASE_PUBLISHABLE_KEYS: dict({ default: PUB }), SUPABASE_SECRET_KEYS: dict({ default: SEC }) })
    expect(k).toEqual({ publishable: PUB, secret: SEC, styles: { publishable: 'new', secret: 'new' } })
  })

  it('uses only the key named "default", whatever else the dictionary holds or its order', () => {
    const other = 'sb_secret_OtherOtherOther12345'
    const k = from({ SUPABASE_PUBLISHABLE_KEYS: dict({ web: 'sb_publishable_web000000000', default: PUB }), SUPABASE_SECRET_KEYS: dict({ automations: other, default: SEC }) })
    expect([k.publishable, k.secret]).toEqual([PUB, SEC])
    expect(from({ SUPABASE_SECRET_KEYS: dict({ automations: other }) }).secret).toBe('')
  })

  it('accepts the single-key variables (local CLI)', () => {
    const k = from({ SUPABASE_PUBLISHABLE_KEY: PUB, SUPABASE_SECRET_KEY: SEC })
    expect(k).toEqual({ publishable: PUB, secret: SEC, styles: { publishable: 'new', secret: 'new' } })
  })

  it('prefers the new keys over the legacy ones when both are present', () => {
    const k = from({ SUPABASE_PUBLISHABLE_KEYS: dict({ default: PUB }), SUPABASE_SECRET_KEYS: dict({ default: SEC }), SUPABASE_ANON_KEY: ANON, SUPABASE_SERVICE_ROLE_KEY: SERVICE })
    expect(k.styles).toEqual({ publishable: 'new', secret: 'new' })
    expect([k.publishable, k.secret]).toEqual([PUB, SEC])
  })

  it('falls back to the legacy keys only when no new key is present (transition)', () => {
    const k = from({ SUPABASE_ANON_KEY: ANON, SUPABASE_SERVICE_ROLE_KEY: SERVICE })
    expect(k).toEqual({ publishable: ANON, secret: SERVICE, styles: { publishable: 'legacy', secret: 'legacy' } })
    // Each key independently: a new secret key with the legacy anon key.
    expect(from({ SUPABASE_SECRET_KEYS: dict({ default: SEC }), SUPABASE_ANON_KEY: ANON }).styles).toEqual({ publishable: 'legacy', secret: 'new' })
  })

  it('a malformed new value falls through to the legacy key, never used itself', () => {
    const k = from({ SUPABASE_SECRET_KEYS: '{not json', SUPABASE_SERVICE_ROLE_KEY: SERVICE, SUPABASE_PUBLISHABLE_KEYS: dict({ default: SEC }), SUPABASE_ANON_KEY: ANON })
    expect(k.secret).toBe(SERVICE)
    expect(k.publishable).toBe(ANON) // a secret key in the publishable slot is not a publishable key
  })

  it('has no usable key (so the function refuses to run) when nothing of the right shape is present', () => {
    const none = { publishable: '', secret: '', styles: { publishable: null, secret: null } }
    expect(from({})).toEqual(none)
    expect(from({ SUPABASE_ANON_KEY: 'dummy', SUPABASE_SERVICE_ROLE_KEY: 'dummy' })).toEqual(none)
    expect(from({ SUPABASE_PUBLISHABLE_KEYS: dict({ default: '' }), SUPABASE_SECRET_KEYS: dict([SEC]) })).toEqual(none)
    expect(from({ SUPABASE_PUBLISHABLE_KEYS: 'null', SUPABASE_SECRET_KEYS: dict({ default: 42 }) })).toEqual(none)
    expect(from({ SUPABASE_PUBLISHABLE_KEY: SEC, SUPABASE_SECRET_KEY: PUB })).toEqual(none) // swapped keys are refused
    expect(from({ SUPABASE_SECRET_KEY: 'sb_secret_short' }).secret).toBe('')
  })
})

describe('serviceHeaders', () => {
  it('sends a new secret key on apikey only, never as a Bearer token', () => {
    expect(serviceHeaders(SEC)).toEqual({ apikey: SEC })
  })
  it('sends the legacy service_role JWT on apikey and Authorization, as before', () => {
    expect(serviceHeaders(SERVICE)).toEqual({ apikey: SERVICE, Authorization: `Bearer ${SERVICE}` })
  })
})
