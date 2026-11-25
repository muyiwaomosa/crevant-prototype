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

  it('keeps the approved signature line exactly', () => {
    expect(HOMEPAGE_COPY.hero.signature).toBe("Don't just post. Get your split.")
    expect(HOMEPAGE_COPY.hero.signatureLines.join(' ')).toBe(HOMEPAGE_COPY.hero.signature)
  })

  it('offers three paths, for creators, members and advertisers, with no separate sign up', () => {
    const p = HOMEPAGE_COPY.paths
    expect(p.cards.map((c) => c.id)).toEqual(['creators', 'members', 'advertisers'])
    const text = allHomepageText(p).join(' ')
    expect(text).not.toMatch(/apply as|application|talk to us|advertiser form|separate (form|account)/i)
    expect(p.cards[2].body).toMatch(/from your account/)
  })

  it('follows the approved sections, in order', () => {
    const c = HOMEPAGE_COPY
    expect([
      c.problem.headline,
      c.building.headline,
      c.paths.headline,
      c.creators.headline,
      c.betterSplit.headline,
      c.vision.headline,
      c.pilot.headline,
      c.invitation.headline,
    ]).toEqual([
      'You Do the Work. Who Gets the Reward?',
      'A Better Split Starts With a Better Connection.',
      'One Account. Every Way to Take Part.',
      'Different Creators. The Same Problem.',
      'More Connection. More Ways to Earn.',
      'What If Creating Content Could Be a Real Career?',
      'What the Pilot Is, Plainly.',
      'Help Us Build a Better Split.',
    ])
  })

  it('keeps the founder’s goal statement verbatim', () => {
    expect(HOMEPAGE_COPY.building.goal).toBe(
      'we want to create a platform that generates sustainable pay for content creators who have something valuable to say',
    )
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

  it('carries every required pilot disclosure in the one pilot details band, near signup (BRD-10)', () => {
    const details = HOMEPAGE_COPY.pilot.details.join(' ')
    for (const k of ['invitationOnly', 'cpNotMoney', 'simulated', 'noGuarantee', 'stillTesting', 'creatorSupportTest', 'adsAreDemos', 'pilotStart'] as const) {
      expect(details, k).toContain(DISCLOSURES[k])
    }
    // Adults only; points are not money; simulated; nothing paid; no guaranteed reach.
    expect(details).toMatch(/adults 18 and older/)
    expect(details).toMatch(/Connection Points are not money\. They have no cash value/)
    expect(details).toMatch(/simulated during the pilot\. Nothing is paid/)
    expect(details).toContain('No guaranteed reach')
    // Each disclosure once: the band consolidates rather than repeats.
    expect(new Set(HOMEPAGE_COPY.pilot.details).size).toBe(HOMEPAGE_COPY.pilot.details.length)
    // Fans' cash rewards are still disclosed beside the hero's claims.
    expect(HOMEPAGE_COPY.hero.smallPrint).toContain(DISCLOSURES.noFanCash)
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
