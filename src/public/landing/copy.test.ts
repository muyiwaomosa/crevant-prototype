import { describe, expect, it } from 'vitest'
import { DISCLOSURES, findMisleadingClaims, mentionsProvisionalAllocation } from './claims'
import { allHomepageText, HOMEPAGE_COPY } from './copy'

describe('Splitpost homepage copy', () => {
  it('the hero keeps the headline and tagline, with the core belief and positioning', () => {
    const h = HOMEPAGE_COPY.hero
    expect(h.headline).toBe('SOCIAL MEDIA NEEDS A BETTER SPLIT.')
    expect(h.tagline).toBe('Every Post. A Better Split.')
    expect(h.body.join(' ')).toBe("Creating content isn't just a hobby. It's creating value, and value deserves recognition.")
    expect(h.positioning).toBe('Splitpost is a social platform built around connection, not just attention.')
    expect([h.primaryCta, h.secondaryCta]).toEqual(['Join the Waitlist', 'Discover Splitpost'])
  })

  it('follows the approved, creator-led narrative, in order', () => {
    const c = HOMEPAGE_COPY
    expect([c.problem.headline, c.alternative.headline, c.connection.headline, c.vision.headline, c.invitation.headline]).toEqual([
      'You create the value. The algorithm decides who sees it.',
      'A social platform built around connection, not just attention.',
      'When your community helps you grow, they’re recognized too.',
      'Content creation deserves to be a respected profession.',
      'Be part of a better split.',
    ])
  })

  it('the problem uses the founder’s wording: access and trust, not just views', () => {
    expect(HOMEPAGE_COPY.problem.body).toEqual([
      'You can have thousands of followers and still struggle to reach them. You can create content that changes lives and still struggle to earn a living from it.',
      'Because when attention determines who gets seen, building trust, community and a sustainable career becomes harder than it should be.',
    ])
    expect(HOMEPAGE_COPY.problem.points).toHaveLength(4)
  })

  it('the sample post is an educational running-coach post, and its numbers are sample data', () => {
    expect(HOMEPAGE_COPY.post.role).toBe('Running coach')
    expect(HOMEPAGE_COPY.post.text).toMatch(/calf drill/)
    expect(HOMEPAGE_COPY.peopleNote).toMatch(/sample data/)
    expect([HOMEPAGE_COPY.split.creatorTag, HOMEPAGE_COPY.split.communityTag]).toEqual(['Created by Priya', 'Grown by her community'])
  })

  it('keeps each limitation beside the claim it qualifies', () => {
    expect(HOMEPAGE_COPY.alternative.note).toBe(DISCLOSURES.stillTesting)
    expect(HOMEPAGE_COPY.connection.disclosure).toContain(DISCLOSURES.cpNoCashValue)
    expect(HOMEPAGE_COPY.connection.disclosure).toContain(DISCLOSURES.noFanCash)
    expect(HOMEPAGE_COPY.vision.disclosure).toContain(DISCLOSURES.visionOnly)
    expect(HOMEPAGE_COPY.vision.disclosure).toContain(DISCLOSURES.noGuarantee)
    expect(HOMEPAGE_COPY.hero.smallPrint).toContain(DISCLOSURES.noFanCash)
  })

  it('never promises income or a full-time living', () => {
    const text = allHomepageText().join(' ')
    expect(text).not.toMatch(/guaranteed income|full-time income|make a living|quit your job|replace your income|get paid/i)
    expect(HOMEPAGE_COPY.vision.body).toMatch(/help make creating it more financially sustainable/)
  })

  it('carries every required pilot disclosure in the invitation, near signup', () => {
    const details = HOMEPAGE_COPY.invitation.pilotDetails.join(' ')
    for (const k of ['invitationOnly', 'stillTesting', 'noFanCash', 'cpNoCashValue', 'cpRules', 'creatorSupportTest', 'adsAreDemos', 'pilotStart'] as const) {
      expect(details, k).toContain(DISCLOSURES[k])
    }
  })

  it('no sentence anywhere in the copy makes a misleading claim', () => {
    const text = allHomepageText()
    expect(text.length).toBeGreaterThan(40)
    expect(text.flatMap((t) => findMisleadingClaims(t))).toEqual([])
  })

  it('never publishes the provisional allocation, a statistic or a currency amount', () => {
    const all = allHomepageText()
    expect(all.some((t) => mentionsProvisionalAllocation(t))).toBe(false)
    expect(all.join(' ')).not.toMatch(/[$€£¥]|\d+(\.\d+)?\s?%|per ?cent|million|billion/i)
  })

  it('uses the new brand only', () => {
    const text = allHomepageText().join(' ')
    expect(text).not.toMatch(/crevant/i)
    expect(text).toMatch(/Splitpost/)
  })

  it('reads the visitor-facing strings only, not the internal status', () => {
    expect(allHomepageText()).not.toContain('final')
    expect(allHomepageText({ status: 'final', a: 'x', b: ['y', { c: 'z' }] })).toEqual(['x', 'y', 'z'])
  })
})
