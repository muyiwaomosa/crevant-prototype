import { describe, expect, it } from 'vitest'
import { DISCLOSURES, findMisleadingClaims, mentionsProvisionalAllocation } from './claims'
import { allHomepageText, HOMEPAGE_COPY } from './copy'

describe('Splitpost homepage copy', () => {
  it('the hero is exactly as approved', () => {
    const h = HOMEPAGE_COPY.hero
    expect(h.headline).toBe('SUCCESS SHOULD BE SPLIT.')
    expect(h.tagline).toBe('Every Post. A Better Split.')
    expect(h.body.join(' ')).toBe('Creators make the content. Fans help it grow. Both deserve to benefit from its success.')
    expect([h.primaryCta, h.secondaryCta]).toEqual(['Join the Waitlist', 'Discover Splitpost'])
  })

  it('uses the five approved section headlines, in order', () => {
    const c = HOMEPAGE_COPY
    expect([c.why.headline, c.who.headline.join(' '), c.what.headline, c.how.headline, c.invitation.headline]).toEqual([
      "You helped build it. Where's your split?",
      'The creator who keeps posting. The fan who keeps sharing.',
      'What if every successful post created more winners?',
      'POST. SUPPORT. SPLIT.',
      'Be part of a better split.',
    ])
  })

  it('WHY states the gap accurately, not absolutely, and has no money in the story', () => {
    const w = HOMEPAGE_COPY.why
    expect(w.steps.map((s) => s.title)).toEqual(['Priya posts.', 'Ana joins in.', 'Leo recommends it.', 'The post takes off.'])
    expect(w.gap.headline).toBe('They all helped it grow. Not all of them had a way to benefit.')
    const story = allHomepageText(w).join(' ')
    expect(story).not.toMatch(/\bnobody (shared|benefit)|\bno one (shared|benefit)|everyone helped/i)
    expect(story).not.toMatch(/[$€£¥]|\bad(vertising)? revenue\b/i)
  })

  it('WHO names three specific frustrations each, with no quotes that could read as testimonials', () => {
    const w = HOMEPAGE_COPY.who
    expect(w.creator.points).toHaveLength(3)
    expect(w.fan.points).toHaveLength(3)
    expect(allHomepageText(w).join(' ')).not.toMatch(/[“”"]/)
  })

  it('POST. SUPPORT. SPLIT. is exactly as approved', () => {
    expect(HOMEPAGE_COPY.how.steps.map((x) => `${x.word} ${x.line}`)).toEqual([
      'POST. Create something worth sharing.',
      'SUPPORT. Help it reach more people.',
      'SPLIT. Make meaningful contributions count.',
    ])
  })

  it('keeps pilot recognition and the future vision apart', () => {
    const { now, later } = HOMEPAGE_COPY.what
    expect(now.badge).toMatch(/pilot/i)
    for (const k of ['noFanCash', 'cpNoCashValue', 'cpRules'] as const) expect(now.note).toContain(DISCLOSURES[k])
    // The pilot side never mentions revenue or payment at all.
    expect(allHomepageText(now).join(' ')).not.toMatch(/revenue|\bpaid\b|payout|\bincome\b/i)
    expect(later.badge).toMatch(/vision/i)
    expect(later.body).toMatch(/working toward a future/)
    expect(later.body).toMatch(/Not every post would earn it/)
    expect(later.body).toMatch(/hasn't been decided/)
    expect(later.note).toBe(DISCLOSURES.visionOnly)
    // No numbers, percentages or currency anywhere in the vision.
    expect(allHomepageText(later).join(' ')).not.toMatch(/\d|[$€£¥%]/)
  })

  it('carries every required pilot disclosure in the invitation', () => {
    const details = HOMEPAGE_COPY.invitation.pilotDetails.join(' ')
    for (const k of ['invitationOnly', 'stillTesting', 'noFanCash', 'cpNoCashValue', 'cpRules', 'creatorSupportTest', 'adsAreDemos', 'pilotStart'] as const) {
      expect(details, k).toContain(DISCLOSURES[k])
    }
    expect(HOMEPAGE_COPY.hero.smallPrint).toContain(DISCLOSURES.noFanCash)
    expect(HOMEPAGE_COPY.how.smallPrint).toBe(DISCLOSURES.noGuarantee)
  })

  it('says the photos are stock images of models and the people in the story are samples', () => {
    expect(HOMEPAGE_COPY.peopleNote).toMatch(/stock images/)
    expect(HOMEPAGE_COPY.peopleNote).toMatch(/sample people/)
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
