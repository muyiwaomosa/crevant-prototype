import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { BRAND_LINE, HOMEPAGE_COPY, PILOT_DISCLOSURES, allHomepageText, briefLines, type SectionKey } from './copy'
import { findMisleadingClaims, mentionsProvisionalAllocation, sentences } from './claims'

/**
 * docs/website-brief.md is the approved source. It is parsed here, section by
 * section: each `## ` heading starts a section, `### ` lines are labels, and
 * every other non-empty line is one approved line of copy, in page order.
 */
function parseBrief() {
  const text = readFileSync(join(process.cwd(), 'docs/website-brief.md'), 'utf8')
  const sections: { title: string; lines: string[] }[] = []
  for (const raw of text.split('\n')) {
    const line = raw.trimEnd()
    if (line.startsWith('## ')) sections.push({ title: line.slice(3), lines: [] })
    else if (sections.length && line && !line.startsWith('#')) sections[sections.length - 1].lines.push(line)
  }
  return sections
}

const ORDER: SectionKey[] = ['hero', 'problem', 'people', 'future', 'howItWorks', 'invitation']
const TITLES = [
  'SECTION 1 — HERO',
  'SECTION 2 — THE PROBLEM',
  'SECTION 3 — THE PEOPLE BEHIND THE POSTS',
  'SECTION 4 — A BETTER FUTURE FOR CREATORS',
  'SECTION 5 — HOW SPLITPOST WORKS',
  'SECTION 6 — THE INVITATION',
]

describe('the homepage copy is the approved brief, word for word', () => {
  const brief = parseBrief()

  it('has the six approved sections, in order, then the approved pilot disclosures', () => {
    expect(brief.map((s) => s.title)).toEqual([...TITLES, 'APPROVED PILOT DISCLOSURES'])
  })

  it.each(ORDER.map((key, i) => [TITLES[i], key] as const))('%s matches line for line', (_title, key) => {
    const i = ORDER.indexOf(key)
    expect(briefLines(key)).toEqual(brief[i].lines)
  })

  it('uses the four approved pilot disclosures exactly', () => {
    expect(brief[6].lines).toEqual([PILOT_DISCLOSURES.hero, PILOT_DISCLOSURES.step04, PILOT_DISCLOSURES.invitation, PILOT_DISCLOSURES.footer])
  })

  it('opens and closes with the brand line, which is also the footer tagline', () => {
    expect(BRAND_LINE).toBe("Don't just post. Get your split.")
    expect(HOMEPAGE_COPY.hero.headline).toBe(BRAND_LINE)
    expect(HOMEPAGE_COPY.hero.headlineLines.join(' ')).toBe(BRAND_LINE)
    expect(HOMEPAGE_COPY.invitation.brandLine).toBe(BRAND_LINE)
  })

  it('the revisions removed exactly the lines the founder decided, and nothing else', () => {
    const all = allHomepageText()
    for (const removed of [
      // The Vision merge.
      'A DIFFERENT WAY TO POST',
      'Where the people who follow you can actually find your posts.',
      "Where the fans who help you grow aren't just spectators, but have an opportunity to share in the success they help create.",
      "Your content deserves more than attention. Here's how we're building a different way to post.",
      // The revision of Sections 2 to 5.
      'Imagine a social network where growing your audience could also grow your opportunity to earn.',
      "That's the future we're building with Splitpost.",
      'During the pilot, fan rewards are simulated, with no cash payouts.',
      'Not just more followers. More freedom to build the life you want.',
      'But what about you?',
      // The shortened WHY and the fan rewards clarification (2026-11-19).
      'You show up consistently, hoping to grow an audience and build something meaningful.',
      'And slowly, it starts working.',
      'You can have thousands of followers and still struggle to earn enough to do what you love full-time.',
      "Even the people who chose to follow you don't always see what you post.",
      "You're helping the platforms grow. But is all that hard work helping you build a future?",
      'Yet they rarely share financially in the success they help create.',
      'But when their contributions help create value, they rarely get to share financially in the success.',
    ])
      expect(all, removed).not.toContain(removed)
    // The shortened WHY opens on the platform problem, in its first three lines.
    expect(HOMEPAGE_COPY.problem.body.slice(0, 3)).toEqual([
      'Think about how much time you spend creating content.',
      'Planning. Recording. Editing. Posting.',
      'You create the content. Your fans help it grow. The platforms make money.',
    ])
    expect(HOMEPAGE_COPY.problem.body.filter((t) => t === 'You create the content. Your fans help it grow. The platforms make money.')).toHaveLength(1)
    expect(all.filter((t) => t === 'What if the split worked differently?')).toEqual(['What if the split worked differently?'])
    expect(all.filter((t) => t === 'One post reaches thousands of people. The next barely reaches anyone.')).toHaveLength(1)
    expect(HOMEPAGE_COPY.problem.body).not.toContain('One post reaches thousands of people. The next barely reaches anyone.')
    expect(HOMEPAGE_COPY.problem.headline).toBe('Your content makes platforms money. But what about you?')
    expect(HOMEPAGE_COPY.howItWorks.steps.map((s) => s.label)).toEqual(['STEP 01 — POST', 'STEP 02 — CONNECT', 'STEP 03 — GROW', 'STEP 04 — SPLIT'])
  })

  it('the emphasized Problem lines are approved body lines, not new copy', () => {
    for (const e of HOMEPAGE_COPY.problem.emphasis) expect(HOMEPAGE_COPY.problem.body).toContain(e)
  })
})

describe('claims safeguards on the copy', () => {
  it('no sentence makes a misleading claim (only the two approved marketing sentences are exempt)', () => {
    expect(allHomepageText().flatMap((t) => findMisleadingClaims(t))).toEqual([])
  })

  it('never publishes the provisional allocation, a statistic or a currency amount', () => {
    const all = allHomepageText().join('\n')
    expect(mentionsProvisionalAllocation(all)).toBe(false)
    expect(all).not.toMatch(/\d\s?%|percent|[$€£]\s?\d|\b\d[\d,.]*\s?(usd|cad|dollars?)\b/i)
  })

  it('describes the pilot accurately: fans earn Connection Points, fulfillment is simulated, and points have no cash value', () => {
    expect(PILOT_DISCLOSURES.step04).toBe(
      '60-day pilot: Fans can earn and accumulate Connection Points for qualifying contributions. Reward fulfillment is simulated, and Connection Points have no cash value. Full details will be shared by email.',
    )
    for (const d of [PILOT_DISCLOSURES.step04, PILOT_DISCLOSURES.invitation]) {
      expect(d).toMatch(/fans can earn and accumulate Connection Points for qualifying contributions/i)
      expect(d).toMatch(/Reward fulfillment (and advertising shown during the pilot )?(is|are) simulated/)
      expect(d).toMatch(/Connection Points have no cash value/)
    }
    // Future money is described for creators only, never as fan rewards.
    expect(PILOT_DISCLOSURES.invitation).toMatch(/Future creator earnings will depend on/)
    expect(PILOT_DISCLOSURES.invitation).not.toMatch(/monetary rewards|cash earnings/)
    const all = allHomepageText().join('\n')
    // Connection Points only ever appear beside cash as "no cash value".
    for (const s of sentences(all).filter((x) => /connection points?[^.]*\b(cash|worth|redeem|convert)/i.test(x))) expect(s).toMatch(/Connection Points have no cash value\.$/)
    expect(all).not.toMatch(/connection points?[^.]*\b(worth|redeem(able)? for (cash|money)|convert)/i)
    expect(all).not.toMatch(/every (like|share|comment|post)[^.]*(reward|earn|cash|paid)/i)
  })
})
