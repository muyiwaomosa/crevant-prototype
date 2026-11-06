import { describe, expect, it } from 'vitest'
import { isAllowedSupabaseUrl, isPrivilegedKey, readAuthConfig, STAGING_SUPABASE_URL } from './config'
import { safeNext } from './safeNext'

const jwt = (payload: object) => `eyJhbGciOiJIUzI1NiJ9.${btoa(JSON.stringify(payload)).replace(/=+$/, '')}.sig`

describe('browser Supabase configuration', () => {
  it('accepts the staging project with a publishable key', () => {
    expect(readAuthConfig({ VITE_SUPABASE_URL: STAGING_SUPABASE_URL, VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_abc123' })).toEqual({
      url: STAGING_SUPABASE_URL,
      key: 'sb_publishable_abc123',
    })
  })

  it('is unavailable without configuration (for example, Production)', () => {
    expect(readAuthConfig({})).toBeNull()
    expect(readAuthConfig({ VITE_SUPABASE_URL: STAGING_SUPABASE_URL })).toBeNull()
  })

  it('refuses secret and service-role keys', () => {
    expect(isPrivilegedKey('sb_secret_abc')).toBe(true)
    expect(isPrivilegedKey(jwt({ role: 'service_role' }))).toBe(true)
    expect(isPrivilegedKey(jwt({ role: 'anon' }))).toBe(false)
    expect(isPrivilegedKey('sb_publishable_abc')).toBe(false)
    expect(readAuthConfig({ VITE_SUPABASE_URL: STAGING_SUPABASE_URL, VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_secret_abc' })).toBeNull()
    expect(readAuthConfig({ VITE_SUPABASE_URL: STAGING_SUPABASE_URL, VITE_SUPABASE_PUBLISHABLE_KEY: jwt({ role: 'service_role' }) })).toBeNull()
  })

  it('accepts only Supabase project URLs or a local development stack', () => {
    expect(isAllowedSupabaseUrl(STAGING_SUPABASE_URL)).toBe(true)
    expect(isAllowedSupabaseUrl('http://127.0.0.1:54321')).toBe(true)
    for (const bad of [
      'http://kpudeppgokpjhvaqrprn.supabase.co',
      'https://evil.example',
      'https://kpudeppgokpjhvaqrprn.supabase.co.evil.example',
      'https://kpudeppgokpjhvaqrprn.supabase.co/path',
      'https://user:pw@kpudeppgokpjhvaqrprn.supabase.co',
      'http://192.168.1.10:54321',
      'not a url',
    ])
      expect(isAllowedSupabaseUrl(bad), bad).toBe(false)
  })
})

describe('after sign-in, only pages on this site', () => {
  it.each([
    [null, '/app'],
    ['/app/account', '/app/account'],
    ['/tour/discover?x=1#y', '/tour/discover?x=1#y'],
    ['https://evil.example', '/app'],
    ['//evil.example', '/app'],
    ['/\\evil.example', '/app'],
    ['javascript:alert(1)', '/app'],
    ['/%0d%0aSet-Cookie', '/%0d%0aSet-Cookie'],
    ['/sign-in', '/app'],
    ['/auth/confirm?token_hash=x', '/app'],
    ['/auth/set-password', '/auth/set-password'],
    ['/' + 'a'.repeat(600), '/app'],
  ])('%s goes to %s', (input, expected) => {
    expect(safeNext(input)).toBe(expected)
  })
})

describe('browser code never registers users or holds secrets', () => {
  const sources = import.meta.glob(['../**/*.{ts,tsx}', '!../**/*.test.{ts,tsx}'], { query: '?raw', import: 'default', eager: true }) as Record<string, string>

  it('scans the app source', () => {
    expect(Object.keys(sources).length).toBeGreaterThan(20)
  })

  it('never calls sign-up or one-time-code sign-in', () => {
    for (const [file, code] of Object.entries(sources)) {
      expect(code, file).not.toMatch(/\.signUp\s*\(/)
      expect(code, file).not.toMatch(/\.signInWithOtp\s*\(/)
      expect(code, file).not.toMatch(/\.signInAnonymously\s*\(/)
      expect(code, file).not.toMatch(/\.admin\./)
    }
  })

  it('contains no secret key material', () => {
    for (const [file, code] of Object.entries(sources)) {
      expect(code, file).not.toMatch(/sb_secret_[A-Za-z0-9]/)
      expect(code, file).not.toMatch(/SERVICE_ROLE|SUPABASE_SECRET/)
    }
  })
})
