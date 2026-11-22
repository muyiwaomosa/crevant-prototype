// Unit tests for the Edge Function project and origin policy (Phase 1B-2).
import { describe, expect, it } from 'vitest'
import { corsHeaders, memberFunctionRole, MEMBER_APP_ORIGIN, originAllowed, refusalReason, waitlistProjectAllowed, type Refs } from './policy.ts'
import { MEMBER_PRODUCTION_REF, STAGING_REF, WAITLIST_REF } from './projects.ts'

const STAGING = 'kpudeppgokpjhvaqrprn'
const WAITLIST = 'hmrliwoychnqrbbydorg'
const MEMBER = 'membersprodtestrefab'
const url = (ref: string) => `https://${ref}.supabase.co`
const NULL_MEMBER: Refs = { staging: STAGING, waitlist: WAITLIST, member: null }
const WITH_MEMBER: Refs = { staging: STAGING, waitlist: WAITLIST, member: MEMBER }
const PREVIEW = 'https://splitpost-app-git-feature-crevant.vercel.app'

const DISALLOWED = [
  'https://splitpost.ca', 'https://www.splitpost.ca', 'https://crevant-prototype.vercel.app',
  'https://evil.example', 'null', 'https://app.splitpost.ca.evil.example', 'http://app.splitpost.ca',
  'https://splitpost-app-x-crevant.vercel.app.evil.example', 'https://APP.splitpost.ca', 'https://app.splitpost.ca/',
]

describe('the committed references match config (generated file)', () => {
  it('has staging, the waitlist project and the recorded member Production project, all different', () => {
    expect(STAGING_REF).toBe(STAGING)
    expect(WAITLIST_REF).toBe(WAITLIST)
    expect(MEMBER_PRODUCTION_REF).toMatch(/^[a-z]{20}$/)
    expect([STAGING, WAITLIST]).not.toContain(MEMBER_PRODUCTION_REF)
  })
})

describe('which project a member function serves', () => {
  it('serves staging and local Supabase', () => {
    expect(memberFunctionRole(url(STAGING), NULL_MEMBER)).toBe('staging')
    expect(memberFunctionRole(`${url(STAGING)}/`, NULL_MEMBER)).toBe('staging')
    for (const u of ['http://127.0.0.1:54321', 'http://localhost:54321', 'http://kong:8000', 'http://host.docker.internal:54321']) {
      expect(memberFunctionRole(u, NULL_MEMBER)).toBe('local')
    }
  })
  it('fails closed while the member Production reference is null', () => {
    expect(memberFunctionRole(url(MEMBER), NULL_MEMBER)).toBeNull()
    expect(refusalReason(url(MEMBER), NULL_MEMBER)).toMatch(/member Production is not configured/)
  })
  it('serves member Production only once its reference is set', () => {
    expect(memberFunctionRole(url(MEMBER), WITH_MEMBER)).toBe('member-production')
  })
  it('never serves the waitlist project, an unknown project or a malformed address', () => {
    for (const refs of [NULL_MEMBER, WITH_MEMBER]) {
      expect(memberFunctionRole(url(WAITLIST), refs)).toBeNull()
      expect(memberFunctionRole(url('abcdefghijabcdefghij'), refs)).toBeNull()
      for (const bad of ['', 'https://kpudeppgokpjhvaqrprn.supabase.co.evil.example', 'http://kpudeppgokpjhvaqrprn.supabase.co', 'https://evil.example', 'http://10.0.0.1:54321']) {
        expect(memberFunctionRole(bad, refs)).toBeNull()
      }
    }
    expect(refusalReason(url(WAITLIST), WITH_MEMBER)).toBe('the waitlist project')
  })
  it('refuses a member reference equal to staging or the waitlist project (misconfiguration)', () => {
    expect(memberFunctionRole(url(WAITLIST), { staging: STAGING, waitlist: WAITLIST, member: WAITLIST })).toBeNull()
    expect(memberFunctionRole(url(STAGING), { staging: STAGING, waitlist: WAITLIST, member: STAGING })).toBe('staging')
    expect(memberFunctionRole(url(MEMBER), { staging: STAGING, waitlist: WAITLIST, member: 'NOT-A-REF' })).toBeNull()
  })
})

describe('which browser origins may call a member function', () => {
  it('staging: the member app Previews only', () => {
    expect(originAllowed('staging', PREVIEW)).toBe(true)
    expect(originAllowed('staging', MEMBER_APP_ORIGIN)).toBe(false)
    expect(originAllowed('staging', 'http://127.0.0.1:4176')).toBe(false)
  })
  it('member Production: exactly https://app.splitpost.ca', () => {
    expect(originAllowed('member-production', MEMBER_APP_ORIGIN)).toBe(true)
    expect(originAllowed('member-production', PREVIEW)).toBe(false)
    expect(originAllowed('member-production', 'http://localhost:5173')).toBe(false)
  })
  it('local: Previews and local browsers', () => {
    expect(originAllowed('local', PREVIEW)).toBe(true)
    expect(originAllowed('local', 'http://127.0.0.1:4176')).toBe(true)
    expect(originAllowed('local', MEMBER_APP_ORIGIN)).toBe(false)
  })
  it('refuses every other origin everywhere, and no origin, and a refused project', () => {
    for (const role of ['staging', 'member-production', 'local'] as const) {
      for (const o of DISALLOWED) expect(originAllowed(role, o), `${role} ${o}`).toBe(false)
      expect(originAllowed(role, null)).toBe(false)
    }
    expect(originAllowed(null, MEMBER_APP_ORIGIN)).toBe(false)
    expect(originAllowed(null, PREVIEW)).toBe(false)
  })
  it('CORS headers echo only an allowed origin: never a wildcard, never credentials', () => {
    expect(corsHeaders('member-production', MEMBER_APP_ORIGIN)['Access-Control-Allow-Origin']).toBe(MEMBER_APP_ORIGIN)
    for (const role of ['staging', 'member-production', 'local', null] as const) {
      for (const o of [...DISALLOWED, null]) {
        const h = corsHeaders(role, o)
        expect(h).toEqual({ Vary: 'Origin' })
      }
      for (const o of [PREVIEW, MEMBER_APP_ORIGIN]) {
        const h = corsHeaders(role, o)
        expect(h['Access-Control-Allow-Origin']).not.toBe('*')
        expect(h).not.toHaveProperty('Access-Control-Allow-Credentials')
      }
    }
  })
})

describe('join-waitlist runtime guard', () => {
  it('allows the waitlist project, staging and local Supabase (today\'s behaviour unchanged)', () => {
    for (const refs of [NULL_MEMBER, WITH_MEMBER]) {
      expect(waitlistProjectAllowed(url(WAITLIST), refs)).toBe(true)
      expect(waitlistProjectAllowed(url(STAGING), refs)).toBe(true)
      expect(waitlistProjectAllowed('http://127.0.0.1:54321', refs)).toBe(true)
      expect(waitlistProjectAllowed('http://kong:8000', refs)).toBe(true)
    }
  })
  it('refuses member Production, unknown projects and malformed addresses', () => {
    expect(waitlistProjectAllowed(url(MEMBER), WITH_MEMBER)).toBe(false)
    expect(waitlistProjectAllowed(url(MEMBER), NULL_MEMBER)).toBe(false)
    expect(waitlistProjectAllowed(url('abcdefghijabcdefghij'), WITH_MEMBER)).toBe(false)
    expect(waitlistProjectAllowed('', WITH_MEMBER)).toBe(false)
    expect(waitlistProjectAllowed('https://hmrliwoychnqrbbydorg.supabase.co.evil.example', WITH_MEMBER)).toBe(false)
  })
  it('with the default (committed) references, the waitlist project and staging are allowed', () => {
    expect(waitlistProjectAllowed(url(WAITLIST))).toBe(true)
    expect(waitlistProjectAllowed(url(STAGING))).toBe(true)
  })
})
