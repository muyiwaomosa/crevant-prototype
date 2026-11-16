import { describe, expect, it } from 'vitest'
import { DISCLOSURES, findMisleadingClaims, mentionsProvisionalAllocation } from './claims'
import { allHomepageText, HOMEPAGE_COPY } from './copy'

describe('Splitpost homepage copy', () => {
  it('the hero uses the founder-approved headline and supporting copy exactly', () => {
    const h = HOMEPAGE_COPY.hero
    expect(h.headline).toBe('You Create The Post. You Deserve a Split.')
    expect(h.headlineLines.join(' ')).toBe(h.headline)
    expect(h.body).toEqual([
      "You put in the work. You grow your followers. But the money doesn't always follow.",
      "We're building a social platform where your content can help you earn, and your followers can become a real community.",
    ])
    expect(h.primaryCta).toBe('Join the Waitlist')
    expect(h.smallPrint).toContain(DISCLOSURES.noGuarantee)
  })

  it('follows the seven approved sections, in order', () => {
    const c = HOMEPAGE_COPY
    expect([c.problem.headline, c.building.headline, c.creators.headline, c.betterSplit.headline, c.vision.headline, c.invitation.headline]).toEqual([
      'You Do the Work. Who Gets the Reward?',
      'A Better Split Starts With a Better Connection.',
      'Different Creators. The Same Problem.',
      'More Connection. More Ways to Earn.',
      'What If Creating Content Could Be a Real Career?',
      'Help Us Build a Better Split.',
    ])
  })

  it('keeps the founder’s goal statement verbatim', () => {
    expect(HOMEPAGE_COPY.building.goal).toBe('we want to create a platform that generates sustainable pay for content creators who have something valuable to say')
  })

  it('uses everyday sample posts, each a practical topic', () => {
    expect(HOMEPAGE_COPY.samplePosts.map((p) => p.role)).toEqual(['Math teacher', 'Home cook', 'Leather maker', 'Tech reviewer'])
    expect(HOMEPAGE_COPY.post.role).toBe('Content creator')
  })

  it('keeps each limitation beside the claim it qualifies', () => {
    expect(HOMEPAGE_COPY.building.note).toContain(DISCLOSURES.noGuarantee)
    expect(HOMEPAGE_COPY.betterSplit.disclosures).toHaveLength(3)
    expect(HOMEPAGE_COPY.vision.disclosure).toBe('This is our long-term vision, not a promise of income during the pilot.')
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
    // "millions of followers" is the founder's vision copy (no one needs them), not a statistic.
    expect(all.join(' ').replace("don't need millions of followers", '')).not.toMatch(/[$€£¥]|\d+(\.\d+)?\s?%|per ?cent|million|billion/i)
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
