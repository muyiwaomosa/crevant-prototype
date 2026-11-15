import { describe, expect, it } from 'vitest'
import { DISCLOSURES, findMisleadingClaims, mentionsProvisionalAllocation } from './claims'
import { allHomepageText, HOMEPAGE_COPY } from './copy'

describe('approved Splitpost homepage copy', () => {
  it('the hero is exactly as approved', () => {
    const h = HOMEPAGE_COPY.hero
    expect(h.headline).toBe('SUCCESS SHOULD BE SPLIT.')
    expect(h.tagline).toBe('Every Post. A Better Split.')
    expect(h.body.join(' ')).toBe(
      'Every post begins with a creator. Every success has people behind it. Splitpost is where both get the opportunity to benefit.',
    )
    expect([h.primaryCta, h.secondaryCta]).toEqual(['Join the Waitlist', 'Discover Splitpost'])
    expect(h.status).toBe('final')
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
