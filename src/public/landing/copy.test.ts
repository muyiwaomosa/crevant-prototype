import { describe, expect, it } from 'vitest'
import { DISCLOSURES, findMisleadingClaims, mentionsProvisionalAllocation } from './claims'
import { allHomepageText, FOUNDER_LOCKED_EXCEPTIONS, HOMEPAGE_COPY, withoutLockedExceptions } from './copy'

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

  it('WHY: the founder-approved, locked wording of Nov 28 (BR-001), verbatim, paragraph by paragraph', () => {
    expect(c.why.headline).toBe('You do the work. Who gets the reward?')
    expect([...c.why.body, c.why.emphasis, c.why.closing]).toEqual([
      'You create the content. Your followers watch, like, comment, save and share it. Together, you generate the attention that platforms turn into billions in advertising revenue.',
      'Yet the platforms decide who sees your content, how much you earn and whether you earn anything at all.',
      'They have built predictable businesses from your creativity, while you are left trying to build a business on unpredictable algorithms.',
      'Your followers help you grow, but rarely share in the financial value they help create.',
      'Everyone contributes. Not everyone gets a split.',
      "We believe it's time to change that.",
    ])
    expect('eyebrow' in c.why).toBe(false)
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
    expect('note' in contribute && contribute.note).toBe('Connection Points recognize your contributions. They are not money and have no cash value.')
    const earn = c.how.steps.find((s) => s.id === 'earn')!
    // Decisions 1 and 4: a future share, the simulated split today, and where eligible revenue comes from.
    expect(earn.body).toEqual([
      'Whether you create content or help creators grow, work towards qualifying for a future share of eligible content revenue.',
      'During the pilot, you can track your simulated split, see your progress and know what to do next.',
    ])
    expect('source' in earn && earn.source).toBe(
      'Splitpost is designed to share future eligible revenue from advertising shown with content with the creators and qualifying supporters who help that content succeed.',
    )
    // Decision 7: the five callouts, exactly.
    expect(c.how.steps.map((s) => s.callout)).toEqual([
      'Find creators who share your interests.',
      'Your Clique, first on Home.',
      'Your posts and your insights, together.',
      'Your contributions, recognized.',
      'Your split, your goals, your next step.',
    ])
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
    // Decision 5: creators and supporters.
    expect(c.pilot.body[0]).toBe("We're inviting creators and supporters to help us test a better way for social media to work.")
    expect(c.pilot.details.slice(0, 7)).toEqual([
      'The initial pilot is invitation-only and available to adults aged 18 and over.',
      'All pilot earnings and financial rewards are simulated.',
      'Connection Points recognize your contributions. They are not money and have no cash value.',
      'No cash payments or payouts will take place during the pilot.',
      'Future financial rewards are subject to eligibility, verification and applicable legal and financial requirements.',
      'Features and experiences are being tested and may evolve.',
      'Earnings are not guaranteed.',
    ])
    for (const k of ['invitationOnly', 'cpNotMoney', 'noGuarantee', 'creatorSupportTest', 'adsAndRevenueTested', 'pilotStart'] as const) expect(c.pilot.details, k).toContain(DISCLOSURES[k])
    expect(new Set(c.pilot.details).size).toBe(c.pilot.details.length)
  })

  it('no sentence anywhere makes a misleading claim (the checker unchanged; only the listed founder-locked sentence is excepted)', () => {
    const findings = allHomepageText().flatMap((t) => findMisleadingClaims(t))
    // The checker still flags the locked sentence: the exception is recorded, never hidden by loosening a rule.
    expect(findings).toEqual([{ rule: 'revenue sharing described as existing today', sentence: FOUNDER_LOCKED_EXCEPTIONS[0].sentence }])
    expect(allHomepageText().flatMap((t) => findMisleadingClaims(withoutLockedExceptions(t)))).toEqual([])
  })

  it('lists exactly one founder-locked exception, word for word on the page, pending counsel review', () => {
    expect(FOUNDER_LOCKED_EXCEPTIONS.map((e) => e.sentence)).toEqual([c.why.body[0].split('it. ')[1]])
    expect(FOUNDER_LOCKED_EXCEPTIONS[0].approved).toMatch(/counsel review pending/)
  })

  it('never publishes the provisional allocation, a currency amount or a statistic (outside the founder-locked sentence)', () => {
    const all = allHomepageText()
    expect(all.some((t) => mentionsProvisionalAllocation(t))).toBe(false)
    const text = withoutLockedExceptions(all.join(' '))
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
