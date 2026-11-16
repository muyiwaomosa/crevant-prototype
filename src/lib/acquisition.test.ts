import { describe, expect, it } from 'vitest'
import { CREATORS } from '../data/seed'
import { DEMO_ACCEPTED_CREATORS, DEMO_INVITE_LINKS, resolveDemoInvite } from './invites'
import { rankForDiscover, suggestedForOnboarding } from './matching'

describe('tour invitation links', () => {
  it('resolve only for an active link of an accepted creator', () => {
    expect(resolveDemoInvite('7c1e94a2b05d3f68e1a9')).toEqual({ status: 'valid', creatorId: 'jordan' })
    expect(resolveDemoInvite(' 7C1E94A2B05D3F68E1A9 ')).toEqual({ status: 'valid', creatorId: 'jordan' })
  })

  it('fail safely, with no creator, for anything unusable', () => {
    expect(resolveDemoInvite('5b8d2e7a1c94f063b2e1')).toEqual({ status: 'revoked', creatorId: null })
    expect(resolveDemoInvite('e9a4c1b7d3f5082a6c4b')).toEqual({ status: 'expired', creatorId: null })
    expect(resolveDemoInvite('0d6b3f9e2a8c51e7b4d2')).toEqual({ status: 'creator_inactive', creatorId: null })
    for (const bad of [null, undefined, '', 'jordan', 'ffffffffffffffffffff', '7c1e94a2b05d3f68e1a', '../welcome']) {
      expect(resolveDemoInvite(bad), String(bad)).toEqual({ status: 'unknown', creatorId: null })
    }
  })

  it('use random codes that reveal nothing about the creator', () => {
    for (const l of DEMO_INVITE_LINKS) {
      expect(l.code).toMatch(/^[0-9a-f]{20}$/)
      const c = CREATORS.find((x) => x.id === l.creatorId)!
      expect(l.code).not.toContain(c.id)
      expect(l.code).not.toContain(c.handle.toLowerCase())
    }
    for (const id of DEMO_ACCEPTED_CREATORS) expect(CREATORS.some((c) => c.id === id), id).toBe(true)
  })
})

describe('Discover matching', () => {
  it('puts creators matching the selected interests first, then everyone else, A to Z', () => {
    const ranked = rankForDiscover(CREATORS, ['Fitness', 'Wellness'], [])
    const matches = ranked.filter((e) => e.matches).map((e) => e.creator.category)
    expect(matches.length).toBeGreaterThan(0)
    expect(matches.every((c) => c === 'Fitness' || c === 'Wellness')).toBe(true)
    const firstNonMatch = ranked.findIndex((e) => !e.matches)
    expect(ranked.slice(0, firstNonMatch).every((e) => e.matches)).toBe(true)
    expect(ranked.slice(firstNonMatch).every((e) => !e.matches)).toBe(true)
    expect(ranked.length).toBe(CREATORS.filter((c) => !c.isSelf).length)
  })

  it('falls back to plain A to Z with no interests, and never changes who is followed', () => {
    const following = ['amara']
    const ranked = rankForDiscover(CREATORS, [], following)
    expect(ranked.every((e) => !e.matches)).toBe(true)
    expect(following).toEqual(['amara'])
  })

  it('sorts people already followed after new matches', () => {
    const fitness = CREATORS.filter((c) => c.category === 'Fitness').map((c) => c.id)
    const ranked = rankForDiscover(CREATORS, ['Fitness', 'Money'], [fitness[0]])
    const idx = (id: string) => ranked.findIndex((e) => e.creator.id === id)
    expect(idx(fitness[0])).toBeGreaterThan(idx('amara'))
  })

  it('leaves the inviting creator out of onboarding suggestions, where they are shown on their own', () => {
    expect(suggestedForOnboarding(CREATORS, ['Fitness'], [], 'jordan').some((e) => e.creator.id === 'jordan')).toBe(false)
  })
})
