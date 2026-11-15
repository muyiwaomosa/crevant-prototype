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

  it('WHY uses the approved introduction, the simple story and the closing question', () => {
    const w = HOMEPAGE_COPY.why
    expect(w.intro).toBe('One post goes viral. Thousands help it spread. But who gets a piece of its success?')
    expect(w.steps.map((s) => s.title)).toEqual([
      'Priya creates a relatable post.',
      'Ana comments and shares it with friends.',
      'Leo reposts it and introduces new people.',
      'The post takes off because people helped it spread.',
    ])
    expect(w.question).toBe("So where's their split?")
    expect(allHomepageText(w).join(' ')).not.toMatch(/[$€£¥]|\bad(vertising)? revenue\b/i)
  })

  it('the sample post is relatable, not technical, and its numbers are sample data', () => {
    expect(HOMEPAGE_COPY.post.text).toMatch(/first 10K/)
    expect(allHomepageText().join(' ')).not.toMatch(/offline mode|build log|sync bug/i)
    expect(HOMEPAGE_COPY.why.steps[3].line).toMatch(/Sample numbers/)
  })

  it('WHO uses the approved headlines, with split central for fans, and no testimonial-like quotes', () => {
    expect(HOMEPAGE_COPY.who.creator.line).toBe('You’re creating content people love. But the money doesn’t reflect the work.')
    expect(HOMEPAGE_COPY.who.fan.line).toBe("You helped make that post successful. But where's your split?")
    expect(HOMEPAGE_COPY.who.creator.points).toHaveLength(3)
    expect(HOMEPAGE_COPY.who.fan.points).toHaveLength(3)
    expect(allHomepageText(HOMEPAGE_COPY.who).join(' ')).not.toMatch(/[“”"]/)
  })

  it('WHAT leads with the value proposition and keeps both disclosures accurate', () => {
    const w = HOMEPAGE_COPY.what
    expect(w.creator.headline).toBe('Create what matters. Earn a better split.')
    expect(w.fan.headline).toBe("Don't just share the post. Share in its success.")
    for (const k of ['noFanCash', 'cpNoCashValue'] as const) expect(w.today.body).toContain(DISCLOSURES[k])
    expect(w.today.body).not.toMatch(/revenue|\bpaid\b|payout/i)
    expect(w.vision.body).toMatch(/future vision/)
    expect(w.vision.body).toMatch(/isn't guaranteed/)
    expect(w.vision.body).toContain(DISCLOSURES.visionOnly)
    expect(allHomepageText(w).join(' ')).not.toMatch(/\d|[$€£¥%]/)
  })

  it('carries every required pilot disclosure in the invitation', () => {
    const details = HOMEPAGE_COPY.invitation.pilotDetails.join(' ')
    for (const k of ['invitationOnly', 'stillTesting', 'noFanCash', 'cpNoCashValue', 'cpRules', 'creatorSupportTest', 'adsAreDemos', 'pilotStart'] as const) {
      expect(details, k).toContain(DISCLOSURES[k])
    }
    expect(HOMEPAGE_COPY.hero.smallPrint).toContain(DISCLOSURES.noFanCash)
    expect(HOMEPAGE_COPY.how.smallPrint).toBe(DISCLOSURES.noGuarantee)
    expect(HOMEPAGE_COPY.how.headline).toBe('POST. SUPPORT. SPLIT.')
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
