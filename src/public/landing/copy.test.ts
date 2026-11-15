import { describe, expect, it } from 'vitest'
import { DISCLOSURES, findMisleadingClaims, mentionsProvisionalAllocation } from './claims'
import { allHomepageText, HOMEPAGE_COPY } from './copy'

describe('approved Splitpost homepage copy', () => {
  it('the hero is exactly as approved', () => {
    const h = HOMEPAGE_COPY.hero
    expect(h.headline).toBe('SUCCESS SHOULD BE SPLIT.')
    expect(h.tagline).toBe('Every Post. A Better Split.')
    expect(h.body.join(' ')).toBe('Creators make the content. Fans help it grow. Both deserve to benefit from its success.')
    expect([h.primaryCta, h.secondaryCta]).toEqual(['Join the Waitlist', 'Discover Splitpost'])
    expect(h.status).toBe('final')
  })

  it('WHY keeps the approved headline and states the gap accurately', () => {
    const w = HOMEPAGE_COPY.why
    expect(w.headline).toBe("You helped build it. Where's your split?")
    expect(w.steps.map((s) => s.title)).toEqual(['Priya posts.', 'Ana joins in.', 'Leo recommends it.', 'The post takes off.'])
    expect(w.gap.headline).toBe('They all helped it grow. Not all of them had a way to benefit.')
    // No absolute claims that nobody benefits, and no money in the story itself.
    const story = allHomepageText(w).join(' ')
    expect(story).not.toMatch(/\bnobody (shared|benefit)|\bno one (shared|benefit)|everyone helped/i)
    expect(story).not.toMatch(/[$€£¥]|\bad(vertising)? revenue\b/i)
  })

  it('WHO names the creator and the fan, three recognisable points each', () => {
    const w = HOMEPAGE_COPY.who
    expect(w.headline).toEqual(['The creator who keeps posting.', 'The fan who keeps sharing.'])
    expect(w.creator.points).toHaveLength(3)
    expect(w.fan.points).toHaveLength(3)
    expect(w.samplePeople).toMatch(/sample people/)
  })

  it('POST. SUPPORT. SPLIT. is exactly as approved', () => {
    const s = HOMEPAGE_COPY.solution
    expect(s.headline).toBe('POST. SUPPORT. SPLIT.')
    expect(s.steps.map((x) => `${x.word} ${x.line}`)).toEqual([
      'POST. Create something worth sharing.',
      'SUPPORT. Help it reach more people.',
      'SPLIT. Make meaningful contributions count.',
    ])
    expect(s.status).toBe('final')
  })

  it('keeps pilot recognition and the future vision clearly apart', () => {
    const { now, later } = HOMEPAGE_COPY.solution
    expect(now.badge).toMatch(/pilot/i)
    expect(now.body).toMatch(/no cash value/)
    expect(later.badge).toMatch(/vision/i)
    expect(later.body).toMatch(/working toward a future/)
    expect(later.body).toContain(DISCLOSURES.visionOnly)
    // The vision has no numbers, dates or currency at all.
    expect(later.body).not.toMatch(/\d|[$€£¥%]/)
  })

  it('carries every required pilot disclosure in the invitation', () => {
    const details = HOMEPAGE_COPY.invitation.pilotDetails.join(' ')
    for (const k of ['invitationOnly', 'stillTesting', 'noFanCash', 'cpNoCashValue', 'cpRules', 'creatorSupportTest', 'adsAreDemos', 'pilotStart'] as const) {
      expect(details, k).toContain(DISCLOSURES[k])
    }
    expect(HOMEPAGE_COPY.hero.smallPrint).toContain(DISCLOSURES.noFanCash)
    expect(HOMEPAGE_COPY.experience.smallPrint).toBe(DISCLOSURES.noGuarantee)
  })

  it('no sentence anywhere in the copy makes a misleading claim', () => {
    const text = allHomepageText()
    expect(text.length).toBeGreaterThan(30)
    expect(text.flatMap((t) => findMisleadingClaims(t))).toEqual([])
  })

  it('never publishes the provisional allocation', () => {
    expect(allHomepageText().some((t) => mentionsProvisionalAllocation(t))).toBe(false)
  })

  it('uses the new brand only, and not the retired headline', () => {
    const text = allHomepageText().join(' ')
    expect(text).not.toMatch(/crevant/i)
    expect(text).not.toMatch(/success should be shared/i)
    expect(text).toMatch(/Splitpost/)
  })

  it('reads the visitor-facing strings only, not the internal status', () => {
    expect(allHomepageText()).not.toContain('final')
    expect(allHomepageText({ status: 'final', a: 'x', b: ['y', { c: 'z' }] })).toEqual(['x', 'y', 'z'])
  })
})
