import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { describe, expect, it } from 'vitest'
import { EARN_RULES } from '../../lib/points'
import {
  APPROVED_MARKETING_SENTENCES,
  DISCLOSURES,
  findMisleadingClaims,
  mentionsProvisionalAllocation,
  PROVISIONAL_CP_RULES,
  PROVISIONAL_LABEL,
} from './claims'

describe('misleading financial claims are caught', () => {
  const misleading = [
    'Earn $50 for every referral.',
    'Get €10 when a friend joins.',
    'Fans earn 25 dollars a month.',
    'Fans get paid for sharing posts.',
    'Creators make more money on Splitpost.',
    'You will receive cash for every post you share.',
    'Win cash prizes for supporting creators.',
    'Weekly payouts for top fans.',
    'Guaranteed income for creators.',
    'We guarantee you will earn more.',
    'Your rewards are guaranteed.',
    'Guaranteed reach for every post.',
    'Connection Points are worth real money.',
    'Convert your Connection Points to cash.',
    'Redeem CP for cash at any time.',
    'Sell your Connection Points to other fans.',
    'Transfer CP to a friend.',
    'Creators and fans share in advertising revenue.',
    'Fans get a share of the revenue from every post.',
    'Splitpost pays out ad revenue to fans each month.',
    'Not only do you earn cash, you get perks too.',
  ]
  for (const text of misleading) {
    it(`flags: ${text}`, () => {
      expect(findMisleadingClaims(text).length, JSON.stringify(findMisleadingClaims(text))).toBeGreaterThan(0)
    })
  }
})

describe('the provisional 40/20/40 allocation is caught in any form', () => {
  const forms = [
    '40/20/40',
    'A 40 / 20 / 40 split.',
    'The 40-20-40 model.',
    'Creators receive 40% of ad revenue.',
    '20% goes to the shared fan pool.',
    'Splitpost keeps 40 percent.',
    'Revenue is split 40% to creators.',
  ]
  for (const text of forms) {
    it(`flags: ${text}`, () => {
      expect(mentionsProvisionalAllocation(text)).toBe(true)
      expect(findMisleadingClaims(text).some((f) => f.rule === 'the provisional revenue allocation')).toBe(true)
    })
  }

  it('does not mistake unrelated percentages for the allocation', () => {
    // From the tour's sample budgeting post, and a CSS position.
    for (const text of ['30% for wants, 20% for savings and paying off debt.', "top: '40%'", 'I started at 10% and moved it on payday.']) {
      expect(mentionsProvisionalAllocation(text), text).toBe(false)
    }
  })
})

describe('accurate disclosures and the future vision are allowed', () => {
  const accurate = [
    ...Object.values(DISCLOSURES),
    "We're working toward a future where creators and fans can share in advertising revenue from the posts they create and support.",
    'Our long-term goal is a model where creators and fans could share in advertising revenue.',
    'Revenue sharing is not part of the pilot.',
    'Fans receive no cash rewards during the pilot.',
    "Connection Points can't be converted to cash.",
    'No money changes hands during the pilot for fans.',
    "Joining the waitlist doesn't guarantee an invitation.",
    'Earn Connection Points with each creator for meaningful support.',
    'Make meaningful contributions count.',
    'More posts. More followers. Not more income.',
  ]
  for (const text of accurate) {
    it(`allows: ${text}`, () => {
      expect(findMisleadingClaims(text)).toEqual([])
    })
  }
})

describe('provisional Connection Points values stay marked as unvalidated', () => {
  it('every value is labelled provisional and not validated', () => {
    expect(PROVISIONAL_CP_RULES.length).toBeGreaterThanOrEqual(6)
    for (const rule of PROVISIONAL_CP_RULES) {
      expect(rule.validated, rule.action).toBe(false)
      expect(rule.label, rule.action).toBe(PROVISIONAL_LABEL)
      expect(rule.label).toMatch(/provisional/i)
      expect(rule.label).toMatch(/not yet validated/i)
    }
  })

  it('recognizes several kinds of participation, not only referrals', () => {
    const earning = PROVISIONAL_CP_RULES.filter((r) => r.points > 0).map((r) => r.action)
    expect(earning).toEqual(expect.arrayContaining(['follow', 'comment', 'watch', 'like', 'save', 'verified_referral']))
    expect(earning.length).toBeGreaterThan(1)
  })

  it('sharing alone earns nothing', () => {
    expect(PROVISIONAL_CP_RULES.find((r) => r.action === 'share')?.points).toBe(0)
  })

  it('matches the sample tour, so the two never drift apart', () => {
    for (const action of ['follow', 'comment', 'watch', 'like', 'save'] as const) {
      expect(PROVISIONAL_CP_RULES.find((r) => r.action === action)?.points, action).toBe(EARN_RULES[action].points)
    }
  })

  it('no rule title or limit describes Connection Points as money', () => {
    for (const rule of PROVISIONAL_CP_RULES) expect(findMisleadingClaims(`${rule.title}. ${rule.limit}.`), rule.action).toEqual([])
  })
})

describe('the provisional allocation appears in no published source', () => {
  const root = join(__dirname, '..', '..', '..')
  const walk = (dir: string): string[] =>
    readdirSync(dir).flatMap((name) => {
      const p = join(dir, name)
      return statSync(p).isDirectory() ? walk(p) : [p]
    })
  const published = [
    ...walk(join(root, 'src')).filter((p) => /\.(ts|tsx|css|json)$/.test(p) && !/\.test\.(ts|tsx)$/.test(p)),
    ...walk(join(root, 'public')).filter((p) => /\.(html|svg|json|txt|webmanifest)$/.test(p)),
    join(root, 'index.html'),
  ]

  it('scans the site, tour and app source', () => {
    expect(published.length).toBeGreaterThan(50)
  })

  for (const file of published) {
    it(`${relative(root, file)} doesn't mention it`, () => {
      expect(mentionsProvisionalAllocation(readFileSync(file, 'utf8'))).toBe(false)
    })
  }
})

describe('the approved marketing sentences (exact allow-list)', () => {
  it('holds exactly the two founder-approved sentences', () => {
    expect(APPROVED_MARKETING_SENTENCES).toEqual([
      'Your content helps platforms attract attention and generate revenue.',
      'When eligible content generates advertising revenue, creators receive a share, and a portion is set aside to reward qualifying fan contributions.',
    ])
  })

  it('lets them through only as those exact sentences, in context too', () => {
    for (const s of APPROVED_MARKETING_SENTENCES) expect(findMisleadingClaims(s)).toEqual([])
    expect(findMisleadingClaims(`Your followers grow. Your views increase. ${APPROVED_MARKETING_SENTENCES[0]}`)).toEqual([])
  })

  it('still flags any change to their wording, and any other revenue promise', () => {
    const variants = [
      'Your content helps Splitpost attract attention and generate revenue for you.',
      'When content generates advertising revenue, creators receive a share.',
      'When eligible content generates advertising revenue, fans receive a share.',
      'When eligible content generates advertising revenue, creators receive a share, and a portion is paid to fans.',
      'Fans get a share of the revenue from every post.',
      'Creators receive 40% of ad revenue.',
    ]
    for (const v of variants) expect(findMisleadingClaims(v).length, v).toBeGreaterThan(0)
  })
})
