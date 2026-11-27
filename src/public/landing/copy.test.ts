import { describe, expect, it } from 'vitest'
import { DISCLOSURES, findMisleadingClaims, mentionsProvisionalAllocation } from './claims'
import { allHomepageText, FOUNDER_REVIEW, HOMEPAGE_COPY } from './copy'

// SP-BRAND-002 (Nov 27), with the positioning amendment: the founder's script,
// word for word. These tests are the confirmation that it is preserved.
describe('Splitpost homepage copy (SP-BRAND-002)', () => {
  const c = HOMEPAGE_COPY

  it('HOOK: the signature line is the headline, with the approved body, calls to action and disclosure', () => {
    expect(c.hero.headline).toBe("Don't just post. Get your split.")
    expect(c.hero.headlineLines.join(' ')).toBe(c.hero.headline)
    expect(c.hero.body).toEqual([
      'The social network where everyone who contributes to the success of content has an opportunity to benefit.',
      'Create what you love. Connect with people you value. Get recognized for the difference you make.',
    ])
    expect([c.hero.primaryCta, c.hero.secondaryCta]).toEqual(['Join the Waitlist', 'Discover Splitpost'])
    expect(c.hero.smallPrint).toBe('Invitation-only pilot for adults 18+. All pilot earnings are simulated. Earnings are not guaranteed.')
    expect(c.hero.belief).toBe('Everyone deserves a split.')
  })

  it('WHY: the approved script, in order', () => {
    expect(c.why.eyebrow).toBe('Why Splitpost exists')
    expect(c.why.headline).toBe('You do the work. Who gets the reward?')
    expect([...c.why.body, c.why.question, ...c.why.body2, ...c.why.belief].join(' ')).toBe(
      'Every day, millions of people create the content that makes social media valuable. Millions more watch, comment, share and help that content reach new people. Together, they build communities, influence decisions and generate value. But who benefits the most? Creators spend hours making content but struggle to turn their passion into a sustainable income. Followers help their favourite creators grow but rarely receive anything in return. And somewhere along the way, social media became more about capturing attention than building meaningful connections. We believe social media should work differently. The people who help create the value should have an opportunity to share in it. That\'s why we\'re building Splitpost.',
    )
  })

  it('WHO: creators and supporters only (amendment), each in the approved words', () => {
    expect(c.who.headline).toBe('Built for people like you.')
    expect(c.who.groups.map((g) => [g.tag, g.title])).toEqual([
      ['For creators', "You've built an audience. Now you want to build a future."],
      ['For supporters', 'You do more than watch. You help creators grow.'],
    ])
    expect(c.who.groups[0].body.at(-1)).toBe('You want to build something sustainable, not spend your life chasing the next viral post.')
    expect(c.who.groups[1].body.at(-1)).toBe('You deserve an experience where your connections and contributions matter.')
  })

  it('WHAT: the vision without the advertiser line (amendment), three commitments and the vision disclosure', () => {
    expect(c.what.headline).toBe('Imagine a better kind of social media.')
    expect(c.what.body.join(' ')).not.toMatch(/business(es)? can connect/i)
    expect(c.what.body).toHaveLength(5)
    expect(c.what.closing).toEqual(["That's the future we're building at Splitpost.", 'A social network where success is something we can share.'])
    expect(c.what.commitments.map((x) => `${x.title}: ${x.line}`)).toEqual([
      'Meaningful connections: People before algorithms.',
      'Sustainable growth: Relationships before virality.',
      'Shared success: Recognize those who contribute.',
    ])
    expect(c.what.disclosure).toBe('This is our long-term vision, not a promise of income during the pilot.')
  })

  it('HOW: five steps with the approved words, each with a different screen, and the money step disclosed', () => {
    expect(c.how.headline).toBe('A better split starts with a better connection.')
    expect(c.how.steps.map((s) => `${s.number} ${s.label}: ${s.title}`)).toEqual([
      '01 Discover: Find your people.',
      '02 Connect: Keep your people close.',
      '03 Create: Share what makes you valuable.',
      '04 Contribute: Make your support count.',
      '05 Earn: Get your split.',
    ])
    expect(new Set(c.how.steps.map((s) => s.screen)).size).toBe(5)
    const contribute = c.how.steps.find((s) => s.id === 'contribute')!
    expect('note' in contribute && contribute.note).toBe('Connection Points recognize contributions. They are not money.')
    const earn = c.how.steps.find((s) => s.id === 'earn')!
    expect('note' in earn && earn.note).toBe(
      'All pilot earnings are simulated. No cash is paid during the pilot. Eligibility, verification and qualification review requirements apply. Future earnings are not guaranteed.',
    )
    expect(c.how.screenLabel).toMatch(/illustrative sample people and data\. Amounts are simulated\./)
  })

  it('ONE ACCOUNT and INVITATION: the amended copy, with no business proposition', () => {
    expect([c.account.headline, c.account.body, ...c.account.lines, c.account.closing]).toEqual([
      "You don't have to choose a side.",
      'You can be a creator today and a supporter tomorrow. Or you can be both.',
      'Share what you know.',
      'Support what you believe in.',
      'Build meaningful connections.',
      'Get recognized for the value you contribute.',
      'One account. Every opportunity.',
    ])
    expect([c.invitation.headline, ...c.invitation.body, c.invitation.belief, c.invitation.close, c.invitation.cta]).toEqual([
      "Let's build a better kind of social media.",
      'Better for the people who create.',
      'Better for the people who support them.',
      'Better for everyone who believes valuable content deserves more than just views.',
      'Everyone deserves a split.',
      'Be part of the beginning.',
      'Join the Waitlist',
    ])
    expect(c.invitation.disclosure).toBe(
      'Invitation-only pilot for adults 18+. All earnings are simulated. No cash is paid during the pilot, and future earnings are not guaranteed.',
    )
    expect(allHomepageText(c.account).concat(allHomepageText(c.invitation)).join(' ')).not.toMatch(/business|advertis/i)
  })

  it('PILOT: the founder’s list, then every earlier approved disclosure still in force', () => {
    expect(c.pilot.headline).toBe('Help shape the future of Splitpost.')
    expect(c.pilot.details.slice(0, 7)).toEqual([
      'The initial pilot is invitation-only and available to adults aged 18 and over.',
      'All pilot earnings and financial rewards are simulated.',
      'Connection Points are not money and cannot be exchanged for cash during the pilot.',
      'No cash payments or payouts will take place during the pilot.',
      'Future financial rewards are subject to eligibility, verification and applicable legal and financial requirements.',
      'Features and experiences are being tested and may evolve.',
      'Earnings are not guaranteed.',
    ])
    for (const k of ['invitationOnly', 'cpNotMoney', 'noGuarantee', 'creatorSupportTest', 'adsAreDemos', 'pilotStart'] as const) expect(c.pilot.details, k).toContain(DISCLOSURES[k])
    expect(new Set(c.pilot.details).size).toBe(c.pilot.details.length)
  })

  it('no sentence makes a misleading claim, except the one listed for the founder’s decision', () => {
    const findings = allHomepageText().flatMap((t) => findMisleadingClaims(t))
    expect(findings).toEqual([{ rule: 'revenue sharing described as existing today', sentence: FOUNDER_REVIEW.revenueToday }])
  })

  it('never publishes the provisional allocation, a currency amount or a statistic (the founder’s "millions" lines aside, listed for review)', () => {
    const all = allHomepageText()
    expect(all.some((t) => mentionsProvisionalAllocation(t))).toBe(false)
    let text = all.join(' ')
    for (const s of FOUNDER_REVIEW.millions) text = text.split(s).join(' ')
    expect(text).not.toMatch(/[$€£¥]|\d+(\.\d+)?\s?%|per ?cent|million|billion/i)
  })

  it('names no advertiser proposition anywhere on the page (amendment)', () => {
    expect(allHomepageText().join(' ')).not.toMatch(/for advertisers|for businesses|reach the right people|customers, not just clicks/i)
  })

  it('uses the new brand only', () => {
    const text = allHomepageText().join(' ')
    expect(text).not.toMatch(/crevant/i)
    expect(text).toMatch(/Splitpost/)
  })
})
