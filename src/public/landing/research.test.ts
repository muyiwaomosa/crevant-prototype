import { describe, expect, it } from 'vitest'
import { findMisleadingClaims, mentionsProvisionalAllocation } from './claims'
import { citedStatements, RESEARCH, type ResearchFigure } from './research'

describe('research figures shown on the homepage', () => {
  it('shows no more than two figures', () => {
    expect(RESEARCH.length).toBeLessThanOrEqual(2)
  })

  it.each(RESEARCH.map((r) => [r.id, r] as const))('%s is verified, sourced, dated and linked', (_, r) => {
    expect(r.verified).toBe(true)
    expect(r.source.publisher).toBeTruthy()
    expect(r.source.title).toBeTruthy()
    expect(r.source.date).toContain(String(r.source.year))
    expect(r.source.url).toMatch(/^https:\/\//)
    expect(r.source.note).toBeTruthy()
    expect(r.context).toBeTruthy()
  })

  it('cites Goldman Sachs, April 2023, with its professional-creator definition', () => {
    const g = RESEARCH.find((r) => r.id === 'goldman-professional-creators')!
    expect(g.source.publisher).toBe('Goldman Sachs Research')
    expect(g.source.date).toBe('April 2023')
    expect(g.figure).toBe('About 4%')
    expect(g.statement).toContain('50 million creators')
    expect(g.statement).toContain('which Goldman Sachs defined as creators earning more than $100,000 a year')
    // Historical, not current.
    expect(g.statement).toMatch(/\bwere\b.*\bin 2023\b/)
    expect(g.source.note).toMatch(/historical/i)
  })

  it('uses Nielsen only to show recommendations matter', () => {
    const n = RESEARCH.find((r) => r.id === 'nielsen-recommendations')!
    expect(n.statement).toContain('trust recommendations from people they know')
    expect(`${n.statement} ${n.context}`).not.toMatch(/pay|paid|cash|money|reward|compensat|earn|income/i)
  })

  it('does not use the Linktree income figures', () => {
    expect(RESEARCH.map((r) => r.source.publisher).join(' ')).not.toMatch(/linktree/i)
  })

  it('never mentions the provisional allocation', () => {
    for (const r of RESEARCH) expect(mentionsProvisionalAllocation(`${r.figure} ${r.statement} ${r.context}`)).toBe(false)
  })

  it('apart from the cited figure, every sentence passes the claims checker', () => {
    for (const r of RESEARCH) {
      expect(findMisleadingClaims(`${r.figure} ${r.statement}`, { citedResearch: [`${r.figure} ${r.statement}`] })).toEqual([])
      expect(findMisleadingClaims(r.context)).toEqual([])
      expect(findMisleadingClaims(r.source.note)).toEqual([])
    }
  })
})

describe('the cited research exception is narrow', () => {
  const goldman = RESEARCH.find((r) => r.id === 'goldman-professional-creators')!

  it('lets the exact cited sentence through the currency rule', () => {
    expect(findMisleadingClaims(goldman.statement)).not.toEqual([])
    expect(findMisleadingClaims(goldman.statement, { citedResearch: citedStatements() })).toEqual([])
  })

  it('does not cover an edited version of the sentence', () => {
    const edited = goldman.statement.replace('$100,000', '$200,000')
    expect(findMisleadingClaims(edited, { citedResearch: citedStatements() }).map((f) => f.rule)).toContain('a currency amount')
  })

  it('does not cover other money claims nearby', () => {
    const text = `${goldman.statement} Fans earn $50 for every referral.`
    expect(findMisleadingClaims(text, { citedResearch: citedStatements() }).map((f) => f.sentence)).toEqual(['Fans earn $50 for every referral.'])
  })

  it('lifts only the currency rule, never the others', () => {
    const promise = 'Creators get paid $100 a month.'
    const findings = findMisleadingClaims(promise, { citedResearch: [promise] }).map((f) => f.rule)
    expect(findings).not.toContain('a currency amount')
    expect(findings).toContain('a promise of money, pay or income')
  })

  it('only accepts figures that are verified and fully sourced', () => {
    const unverified: ResearchFigure = { ...goldman, verified: false }
    const unlinked: ResearchFigure = { ...goldman, source: { ...goldman.source, url: 'http://example.com' } }
    expect(citedStatements([unverified, unlinked])).toEqual([])
    expect(citedStatements()).toEqual(RESEARCH.map((r) => r.statement))
  })
})
