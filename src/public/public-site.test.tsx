// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { PublicRoutes } from './PublicApp'
import { BRAND_LINE, HOMEPAGE_COPY, PILOT_DISCLOSURES, PRODUCT_IMAGES_DISCLOSURE, briefLines } from './landing/copy'
import { APPROVED_MARKETING_SENTENCES, DISCLOSURES, findMisleadingClaims, mentionsProvisionalAllocation } from './landing/claims'
import { waitlistCta } from './waitlist/status'
import { PHOTOS } from './landing/photos'

const PUBLIC_PATHS = ['/', '/join', '/request-invite', '/sign-in', '/forgot-password', '/auth/confirm', '/no-such-page']
// Pages that must never collect anything until the privacy notice is approved.
// (Sign-in and password reset are for invited members and are tested in src/public/auth.)
const FORM_FREE_PATHS = ['/', '/join', '/join/creator', '/join/supporter', '/request-invite', '/no-such-page']

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <PublicRoutes />
    </MemoryRouter>,
  )
}
const textOf = (path: string) => {
  const { container } = renderAt(path)
  const text = (container.textContent || '').replace(/\s+/g, ' ')
  cleanup()
  return text
}

beforeEach(() => {
  window.scrollTo = vi.fn() as unknown as typeof window.scrollTo
})
afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

const norm = (el: Element | null) => (el?.textContent || '').replace(/\s+/g, ' ')
const landing = () => renderAt('/').container
const section = (id: string) => landing().querySelector(`#${id}`)!
const SECTION_ORDER = ['hero', 'problem', 'people', 'future', 'how-it-works', 'invitation']
const SECTION_KEYS = ['hero', 'problem', 'people', 'future', 'howItWorks', 'invitation'] as const
const HEADINGS = [
  HOMEPAGE_COPY.hero.headline,
  HOMEPAGE_COPY.problem.headline,
  HOMEPAGE_COPY.people.headline,
  HOMEPAGE_COPY.future.headline,
  HOMEPAGE_COPY.howItWorks.headline,
  HOMEPAGE_COPY.invitation.headline,
]
// The only allowed uses of "guarantee": these exact disclaimers.
const APPROVED_GUARANTEE_SENTENCES = [
  PILOT_DISCLOSURES.hero,
  PILOT_DISCLOSURES.invitation,
  DISCLOSURES.invitationOnly,
  DISCLOSURES.noGuarantee,
  // The founder-approved wording on /join, unchanged.
  "Joining the waitlist doesn't guarantee an invitation to the pilot.",
  'Participation does not guarantee earnings or rewards.',
]
// Approved sentences that mention a banned idea only to describe how platforms make money today
// (the same exact sentences the claims guard allows, and nothing else).
const APPROVED_PROBLEM_SENTENCES: readonly string[] = APPROVED_MARKETING_SENTENCES
/** Every block of visible text in an element, for the claims checker. */
const blocks = (el: Element) =>
  // The smallest text blocks only (a list item that wraps a heading and a paragraph is checked through them), so sentences are never glued together.
  [...el.querySelectorAll('h1, h2, h3, p, li, span, a, figcaption')]
    .filter((e) => !e.querySelector('h1, h2, h3, p, li'))
    .map((e) => norm(e).trim())
    .filter(Boolean)

describe('one Splitpost story, top to bottom', () => {
  it('has the six sections, in the approved story order: HOOK, WHY, WHO, WHERE, HOW, CTA', () => {
    expect([...landing().querySelectorAll('section')].map((sec) => sec.id)).toEqual(SECTION_ORDER)
  })
  it('uses the approved headlines, with exactly one main heading', () => {
    const c = landing()
    expect(c.querySelectorAll('h1')).toHaveLength(1)
    expect(norm(c.querySelector('h1')).trim()).toBe(HOMEPAGE_COPY.hero.headline)
    expect(SECTION_ORDER.map((id) => norm(c.querySelector(`#${id} :is(h1, h2)`)).trim())).toEqual(HEADINGS)
  })
  it.each(SECTION_ORDER.map((id, i) => [id, SECTION_KEYS[i]] as const))('#%s shows every approved line, in order', (id, key) => {
    const text = norm(section(id))
    let from = 0
    for (const line of briefLines(key)) {
      // The CTA reads "Waitlist Opens Soon" while registration is closed (see the waitlist tests).
      const shown = line === 'Join the Waitlist' ? waitlistCta() : line
      const at = text.indexOf(shown, from)
      expect(at, `${id}: "${shown}"`).toBeGreaterThanOrEqual(0)
      from = at + shown.length
    }
  })
  it('leaves nothing of Crevant, the old headlines, the retired sections or the app mockups on the page', () => {
    const c = landing()
    expect(norm(c)).not.toMatch(/Crevant|You Create The Post|Every Post\. A Better Split|Concept illustration|Your month at a glance/i)
    expect(c.querySelector('#building, #creators, #split, #vision')).toBeNull()
  })
  it('uses only the listed licensed photos (plus the sample avatar and the founder), each with alt text', () => {
    const c = landing()
    const listed = new Set(Object.values(PHOTOS).map((p) => p.id))
    const photos = [...c.querySelectorAll('img[data-photo]')]
    for (const img of photos) {
      const id = img.getAttribute('data-photo')!
      if (id === 'priya-avatar') continue
      expect(listed.has(id), id).toBe(true)
      expect((img.getAttribute('alt') ?? '').length, id).toBeGreaterThan(20)
    }
    expect(new Set(photos.map((i) => i.getAttribute('data-photo'))).size).toBe(listed.size + 1)
    expect(c.querySelectorAll('img[src*="/media/landing"]:not([data-photo]):not([src$="founder.jpg"])')).toHaveLength(0)
  })
  it('shows no external research, statistics, percentages or amounts, in words or illustrations', () => {
    const c = landing()
    expect(norm(c)).not.toMatch(/Goldman|Nielsen|Linktree|\bstudy\b|survey|respondents|\d+(\.\d+)?\s?%|percent|billion|[$€£]/i)
    for (const svg of c.querySelectorAll('svg')) expect(svg.textContent ?? '').not.toMatch(/\d|%|[$€£]/)
  })
  it('keeps every illustration decorative, so the approved copy carries the meaning', () => {
    for (const svg of landing().querySelectorAll('svg')) expect(svg.getAttribute('aria-hidden'), svg.outerHTML.slice(0, 60)).toBe('true')
  })
})

describe('HERO', () => {
  it('shows the brand line as the headline, on two lines, with the approved supporting copy', () => {
    const h = section('hero')
    expect([...h.querySelectorAll('h1 [data-testid^="headline-"]')].map((e) => norm(e).trim())).toEqual(["Don't just post.", 'Get your split.'])
    expect([...h.querySelectorAll('[data-testid="hero-body"] p')].map((p) => norm(p))).toEqual([...HOMEPAGE_COPY.hero.body])
  })
  it('offers one call to action, the waitlist (no secondary button), and the hero disclosure below it', () => {
    const h = section('hero')
    const links = [...h.querySelectorAll('[data-testid="hero-actions"] a')]
    expect(links.map((a) => [norm(a).trim(), a.getAttribute('href')])).toEqual([[waitlistCta(), '/join']])
    expect(norm(h)).not.toContain('Discover Splitpost')
    expect(norm(h.querySelector('[data-testid="hero-disclosure"]')).trim()).toBe(PILOT_DISCLOSURES.hero)
    const order = [...h.querySelectorAll('[data-testid="hero-actions"], [data-testid="hero-disclosure"]')].map((e) => e.getAttribute('data-testid'))
    expect(order).toEqual(['hero-actions', 'hero-disclosure'])
  })
  it("keeps the original split post: Priya's sample post and what her community grew, labelled as a sample", () => {
    const h = section('hero')
    const scene = h.querySelector('[data-testid="hero-scene"]')!
    expect(scene.querySelector('[data-testid="split-creator-piece"]')).toBeTruthy()
    expect(scene.querySelector('[data-testid="split-community-piece"]')).toBeTruthy()
    expect(norm(scene)).toContain(HOMEPAGE_COPY.split.creatorTag)
    expect(norm(scene)).toContain(HOMEPAGE_COPY.split.communityTag)
    expect(norm(scene)).toMatch(/Sample/)
    expect(norm(scene.querySelector('figcaption'))).toMatch(/fictional sample creator/)
  })
  it('on phones, shows the picture right under the headline, then the supporting copy, the call to action and the disclosure', () => {
    const h = section('hero')
    const order = [...h.querySelectorAll('h1, [data-testid="hero-scene"], [data-testid="hero-body"], [data-testid="hero-actions"], [data-testid="hero-disclosure"]')].map((e) => e.getAttribute('data-testid') ?? e.tagName)
    expect(order).toEqual(['H1', 'hero-scene', 'hero-body', 'hero-actions', 'hero-disclosure'])
  })
  it('settles the split post into place once, only when motion is allowed, and never loops', () => {
    const scene = section('hero').querySelector('[data-testid="hero-scene"]')!
    const animated = [...scene.querySelectorAll('[class*="animate-"]')]
    expect(animated.length).toBe(3)
    for (const el of animated) {
      const anim = el.getAttribute('class')!.split(/\s+/).filter((c) => c.includes('animate-'))
      expect(anim.every((c) => c.startsWith('motion-safe:')), anim.join()).toBe(true)
      expect(anim.join()).not.toMatch(/infinite/)
    }
  })
})

describe('THE PROBLEM', () => {
  it('emphasizes approved lines only and shows how value flows today; the transition line has moved to A Better Future', () => {
    const p = section('problem')
    expect([...p.querySelectorAll('[data-testid="problem-emphasis"]')].map((e) => norm(e))).toEqual([...HOMEPAGE_COPY.problem.emphasis])
    for (const e of HOMEPAGE_COPY.problem.emphasis) expect(HOMEPAGE_COPY.problem.body).toContain(e)
    expect(p.querySelector('[data-testid="problem-transition"]')).toBeNull()
    expect(norm(p)).not.toContain('What if the split worked differently?')
    expect(p.querySelector('[data-testid="value-capture"]')).toBeTruthy()
    // Some creators do earn: the picture never suggests that nobody is paid.
    expect(norm(p.querySelector('figcaption'))).toMatch(/small\s+stack, another a single coin/)
  })
  it('on phones, shows the illustration right after the headline and the two opening lines, then the rest of the copy in order', () => {
    const p = section('problem')
    const order = [...p.querySelectorAll('h2, [data-testid="problem-opening"], [data-testid="problem-visual"], [data-testid="problem-copy"]')].map((e) => e.getAttribute('data-testid') ?? e.tagName)
    expect(order).toEqual(['H2', 'problem-opening', 'problem-visual', 'problem-copy'])
    expect([...p.querySelectorAll('[data-testid="problem-opening"] p')].map((e) => norm(e))).toEqual(HOMEPAGE_COPY.problem.body.slice(0, 2))
    expect([...p.querySelectorAll('[data-testid="problem-copy"] p')].map((e) => norm(e))).toEqual(HOMEPAGE_COPY.problem.body.slice(2))
  })
  it('says "But what about you?" once, in the headline, and leaves the reach example to Section 4', () => {
    const t = norm(section('problem'))
    expect(t.split('But what about you?').length - 1).toBe(1)
    expect(t).not.toContain('One post reaches thousands of people.')
  })
})

describe('HOW SPLITPOST WORKS (The Vision merged in)', () => {
  it('has no separate POST → CONNECT → SPLIT illustration and no leftover Vision lines', () => {
    const h = section('how-it-works')
    expect(h.querySelector('[data-testid="journey"]')).toBeNull()
    expect(norm(h)).not.toMatch(/Imagine a social network|That's the future we're building/)
  })
  it('labels the steps exactly as approved, and leaves the simulated-rewards sentence out of Step 04', () => {
    const h = section('how-it-works')
    expect([...h.querySelectorAll('[data-testid="step-label"]')].map((e) => norm(e))).toEqual(['STEP 01 — POST', 'STEP 02 — CONNECT', 'STEP 03 — GROW', 'STEP 04 — SPLIT'])
    expect(norm(h)).not.toContain('During the pilot, fan rewards are simulated, with no cash payouts.')
  })
  it('has four connected steps, each with its own illustration, then the closing statement', () => {
    const h = section('how-it-works')
    const steps = [...h.querySelectorAll('[data-testid="step"]')]
    expect(steps).toHaveLength(4)
    expect(steps.map((s) => norm(s.querySelector('h3')))).toEqual(HOMEPAGE_COPY.howItWorks.steps.map((s) => s.title))
    expect(steps.map((s) => s.querySelector('svg')?.getAttribute('data-testid'))).toEqual(['step-art-1', 'step-art-2', 'step-art-3', 'step-art-4'])
    expect(norm(h.querySelector('[data-testid="how-closing"]'))).toBe(HOMEPAGE_COPY.howItWorks.closing)
  })
  it('puts the approved simulated-rewards disclosure right beside Step 04, and nowhere else in the section', () => {
    const steps = [...section('how-it-works').querySelectorAll('[data-testid="step"]')]
    expect(norm(steps[3].querySelector('[data-testid="step04-disclosure"]')).trim()).toBe(PILOT_DISCLOSURES.step04)
    // Inline and discreet: a line of text right under the explanation, not a separate card.
    const d = steps[3].querySelector('[data-testid="step04-disclosure"]')!
    expect(d.tagName).toBe('P')
    expect(d.previousElementSibling?.textContent).toBe(HOMEPAGE_COPY.howItWorks.steps[3].body)
    expect(d.className).not.toMatch(/rounded|ring-|bg-white/)
    expect(norm(section('how-it-works'))).not.toContain('Simulated rewards are not redeemable for money.')
    for (const s of steps.slice(0, 3)) expect(s.querySelector('[data-testid="step04-disclosure"]')).toBeNull()
  })
})

describe('THE PEOPLE BEHIND THE POSTS', () => {
  it('keeps the original cards for the three challenges, each drawn, holding only approved lines (no invented headings)', () => {
    const p = section('people')
    const cards = [...p.querySelectorAll('[data-testid="challenge"]')]
    expect(cards.map((c) => c.querySelector('svg')?.getAttribute('data-testid'))).toEqual(['challenge-reach', 'challenge-earnings', 'challenge-business'])
    expect(cards.map((c) => [...c.querySelectorAll('p')].slice(1).map((e) => norm(e)))).toEqual(HOMEPAGE_COPY.people.challenges.map((l) => [...l]))
    expect(p.querySelectorAll('[data-testid="challenge"] h3')).toHaveLength(0)
  })
  it('shows creators first and largest, then the fans, smaller; no identifiable person is shown struggling', () => {
    const p = section('people')
    const ids = [...p.querySelectorAll('img[data-photo]')].map((e) => e.getAttribute('data-photo'))
    expect(ids).toEqual(['creator-at-night', 'another-job', 'fans-sharing'])
    expect(norm(p.querySelector('[data-testid="people-emphasis"]'))).toBe(HOMEPAGE_COPY.people.emphasis)
    expect(norm(p.querySelector('[data-testid="people-fans"] h3'))).toBe(HOMEPAGE_COPY.people.fanTransition)
  })
})

describe('A BETTER FUTURE FOR CREATORS', () => {
  it('shows a mosaic of creators enjoying the work, with the approved copy only', () => {
    const f = section('future')
    expect([...f.querySelectorAll('[data-testid="future-mosaic"] img')].map((i) => i.getAttribute('data-photo'))).toEqual(['cooking-vlog', 'filmmaker', 'painter', 'craftsman'])
    expect(norm(f.querySelector('[data-testid="future-signal"]'))).toBe(HOMEPAGE_COPY.future.signal)
    expect(norm(f.querySelector('[data-testid="future-closing"]'))).toBe(HOMEPAGE_COPY.future.closing)
  })
  it('ends with the transition into How Splitpost Works, with its arrow, right after the signal line', () => {
    const f = section('future')
    const t = f.querySelector('[data-testid="future-transition"]')!
    expect(norm(t)).toBe('What if the split worked differently?')
    expect(t.querySelector('svg[aria-hidden="true"]')).toBeTruthy()
    const order = [...f.querySelectorAll('[data-testid="future-closing"], [data-testid="future-signal"], [data-testid="future-transition"]')].map((e) => e.getAttribute('data-testid'))
    expect(order).toEqual(['future-closing', 'future-signal', 'future-transition'])
    const ids = [...landing().querySelectorAll('section')].map((sec) => sec.id)
    expect(ids[ids.indexOf('future') + 1]).toBe('how-it-works')
  })
})

describe('THE INVITATION', () => {
  it('closes with the waitlist, the Section 7 disclosure beside it, and the brand line', () => {
    const inv = section('invitation')
    expect(norm(inv.querySelector('[data-testid="invitation-secondary"]'))).toBe(HOMEPAGE_COPY.invitation.secondaryHeadline)
    const cta = [...inv.querySelectorAll('a')].find((a) => a.getAttribute('href') === '/join')!
    expect(norm(cta).trim()).toBe(waitlistCta())
    expect(norm(inv.querySelector('[data-testid="invitation-disclosure"]')).trim()).toBe(PILOT_DISCLOSURES.invitation)
    expect(norm(inv.querySelector('[data-testid="brand-line"]'))).toBe(BRAND_LINE)
    expect(norm(inv.querySelector('[data-testid="founder-signoff"]')).trim()).toBe(HOMEPAGE_COPY.invitation.signOff)
    expect(inv.querySelector('[data-testid="founder-signoff"] img')?.getAttribute('src')).toBe('/media/landing/founder.jpg')
  })
  it('has a phone-only waitlist bar that starts hidden', () => {
    const bar = landing().querySelector('[data-testid="mobile-waitlist-bar"]')!
    expect(bar.getAttribute('aria-hidden')).toBe('true')
    expect(bar.className).toContain('md:hidden')
  })
})

describe('the pilot disclosures', () => {
  it('appear exactly once each on the homepage, in their approved places', () => {
    const t = norm(landing())
    for (const d of [PILOT_DISCLOSURES.hero, PILOT_DISCLOSURES.step04, PILOT_DISCLOSURES.invitation]) expect(t.split(d).length - 1, d).toBe(1)
  })
  it('replace the older, duplicated pilot disclosures', () => {
    const t = norm(landing())
    for (const old of [DISCLOSURES.noFanCash, DISCLOSURES.cpNoCashValue, DISCLOSURES.creatorSupportTest, DISCLOSURES.adsAreDemos, DISCLOSURES.pilotStart, 'Fans will not receive cash rewards during the pilot.', 'Future revenue sharing depends on']) {
      expect(t, old).not.toContain(old)
    }
  })
})

describe('claims safeguards across the whole page', () => {
  it('makes no misleading financial claim anywhere (an extra safeguard, not a substitute for review)', () => {
    const b = blocks(landing())
    expect(b.length).toBeGreaterThan(80)
    expect(b.flatMap((x) => findMisleadingClaims(x))).toEqual([])
  })
  it('never publishes the provisional allocation', () => {
    expect(mentionsProvisionalAllocation(norm(landing()))).toBe(false)
  })
  it('never describes anything as live or available now', () => {
    for (const path of PUBLIC_PATHS) expect(textOf(path)).not.toMatch(/\b(now live|live now|available now|is live)\b/i)
  })
  it('adds no inline <style> blocks, which the Content Security Policy would block', () => {
    for (const path of PUBLIC_PATHS) {
      const { container } = renderAt(path)
      expect(container.querySelectorAll('style'), path).toHaveLength(0)
      cleanup()
    }
  })
})

describe('header and footer', () => {
  it('has the Splitpost header on every page: wordmark, Discover Splitpost and Join the Waitlist', () => {
    for (const path of PUBLIC_PATHS) {
      const { container } = renderAt(path)
      const header = container.querySelector('header')!
      expect(header.querySelector('a[aria-label="Splitpost home"]'), path).toBeTruthy()
      expect([...header.querySelectorAll('a')].some((a) => norm(a).trim() === 'Discover Splitpost' && a.getAttribute('href') === '/#how-it-works'), path).toBe(true)
      const join = [...header.querySelectorAll('a')].find((a) => a.getAttribute('aria-label') === 'Waitlist Opens Soon')!
      expect(join.getAttribute('href'), path).toBe('/join')
      expect(join.closest('.hidden'), path).toBeNull()
      expect(norm(header), path).not.toMatch(/Crevant/)
      cleanup()
    }
  })
  it('has the Splitpost footer on every page, with no Privacy or Terms links', () => {
    for (const path of PUBLIC_PATHS) {
      const { container } = renderAt(path)
      const footer = container.querySelector('footer')!
      expect(norm(footer.querySelector('[data-testid="footer-tagline"]')), path).toBe(BRAND_LINE)
      expect(norm(footer.querySelector('[data-testid="footer-disclosure"]')), path).toBe(PILOT_DISCLOSURES.footer)
      expect(norm(footer), path).toContain('© 2026 Splitpost. All rights reserved.')
      // Restored word for word from the original site (founder decision): photos are stock images of models.
      expect(norm(footer.querySelector('[data-testid="product-images-note"]')), path).toBe(PRODUCT_IMAGES_DISCLOSURE)
      expect(norm(footer), path).not.toMatch(/Every Post\. A Better Split/)
      expect(norm(footer), path).not.toMatch(/Crevant|privacy|terms/i)
      cleanup()
    }
    const { container } = renderAt('/')
    const links = [...container.querySelectorAll('footer a')].map((a) => [norm(a).trim(), a.getAttribute('href')])
    expect(links).toEqual([
      ['Why Splitpost', '/#problem'],
      ['How It Works', '/#how-it-works'],
      ['Waitlist Opens Soon', '/join'],
      ['Sign In', '/sign-in'],
    ])
  })
  it('sends every "Discover Splitpost" link to HOW SPLITPOST WORKS, and nothing on a public page to the old sample tour', () => {
    const c = landing()
    const discover = [...c.querySelectorAll('a')].filter((a) => norm(a).trim() === 'Discover Splitpost')
    expect(discover.length).toBeGreaterThanOrEqual(1)
    for (const a of discover) expect(a.getAttribute('href')).toBe('/#how-it-works')
    expect(c.querySelector('#how-it-works')).toBeTruthy()
    cleanup()
    for (const path of PUBLIC_PATHS) {
      const { container } = renderAt(path)
      const tour = [...container.querySelectorAll('a')].map((a) => a.getAttribute('href') ?? '').filter((h) => h === '/tour' || h.startsWith('/tour/'))
      expect(tour, path).toEqual([])
      cleanup()
    }
  })
})

describe('copy rules', () => {
  // Phrases that would imply guaranteed reach, guaranteed earnings, an
  // earnings figure tied to an audience size, or invented traction. Checked
  // case-insensitively on every public page.
  const BANNED = [
    /guarantee/i,
    /earn money now/i,
    /get paid/i,
    /passive income/i,
    /make money/i,
    /start earning/i,
    /make a living (with|from)/i,
    /quit your (day )?job/i,
    /replace your income/i,
    /full-time income/i,
    /reach everyone/i,
    /reach all (of )?your/i,
    /every(one|body) (will )?sees?/i,
    /all your followers (will )?see/i,
    /(every|all) (of your |your )?followers? (will )?(see|sees)/i,
    /organic reach/i,
    /go viral/i,
    /[$£€]\s?\d/,
    /\b\d[\d,.]*\s*(dollars|usd|cad)\b/i,
    /\b\d[\d,.]*\s*(k\+?|\+)?\s*(creators|users|members|fans) (already|have joined|trust)/i,
    /join (thousands|millions)/i,
    /#1|number one|best platform/i,
  ]
  const checkedText = (path: string) => {
    const { container } = renderAt(path)
    let text = norm(container)
    for (const s of [...APPROVED_GUARANTEE_SENTENCES, ...APPROVED_PROBLEM_SENTENCES]) text = text.split(s).join(' ')
    cleanup()
    return text
  }
  it.each(PUBLIC_PATHS)('%s contains no banned phrases (outside the approved disclaimers)', (path) => {
    const t = checkedText(path)
    for (const re of BANNED) expect(t, `matched ${re}`).not.toMatch(re)
  })
  it('"guarantee" appears only in the approved disclaimers', () => {
    let t = norm(landing())
    expect(t).toMatch(/guarantee/i)
    // Longest first, since an older disclaimer can sit inside a newer one.
    for (const s of [...APPROVED_GUARANTEE_SENTENCES].sort((a, b) => b.length - a.length)) t = t.split(s).join(' ')
    expect(t).not.toMatch(/guarantee/i)
  })
})

describe('the waitlist page', () => {
  const INTRO = [
    'Be among the first to try Splitpost, where creators make the content, fans help it grow, and both deserve to benefit from its success.',
    "Whether you create content or support the people who do, there's a place for you on Splitpost.",
    "We're inviting people in small groups as we build and test the platform. Joining the waitlist doesn't guarantee an invitation to the pilot.",
  ]
  it.each(['/join', '/join/creator', '/join/supporter'])('%s shows the one waitlist, says it is not open, and links back and to how Splitpost works', (path) => {
    const { container } = renderAt(path)
    expect(norm(container.querySelector('h1'))).toBe('The Waitlist Opens Soon')
    expect([...container.querySelectorAll('[data-testid="join-intro"] p')].map((p) => norm(p))).toEqual(INTRO)
    expect(norm(container.querySelector('[data-testid="not-open"]'))).toContain("You can't sign up just yet.")
    expect(norm(container.querySelector('[data-testid="not-open"]'))).toContain('as soon as our privacy notice is published')
    expect(norm(container)).not.toMatch(/as a creator|as a supporter/i)
    expect(container.querySelector('form, input, textarea, select')).toBeNull()
    expect(norm(container.querySelector('[data-testid="not-open"]'))).toContain("Until then, this page doesn't collect anything.")
    const hrefs = [...container.querySelectorAll('a')].map((a) => a.getAttribute('href'))
    expect(hrefs).toContain('/#how-it-works')
    expect(hrefs).not.toContain('/tour')
    expect(hrefs).toContain('/#invitation')
    expect(norm(container)).toContain('See how Splitpost works')
    // The approved pilot disclosure (the same words as beside the homepage's final call to action), not the older list.
    expect(norm(container.querySelector('[data-testid="join-pilot-details"]')).trim()).toBe(PILOT_DISCLOSURES.invitation)
    expect(norm(container)).not.toContain(DISCLOSURES.adsAreDemos)
  })
})

describe('no personal data collection', () => {
  it.each(FORM_FREE_PATHS)('%s renders no form or input of any kind', (path) => {
    const { container } = renderAt(path)
    expect(container.querySelectorAll('form, input, textarea, select, [contenteditable="true"]')).toHaveLength(0)
  })

  it.each(FORM_FREE_PATHS)('%s makes no network requests and stores nothing', (path) => {
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)
    const xhrSpy = vi.spyOn(XMLHttpRequest.prototype, 'open')
    const setItem = vi.spyOn(Storage.prototype, 'setItem')
    const cookie = vi.spyOn(document, 'cookie', 'set')
    renderAt(path)
    expect(fetchSpy).not.toHaveBeenCalled()
    expect(xhrSpy).not.toHaveBeenCalled()
    expect(setItem).not.toHaveBeenCalled()
    expect(cookie).not.toHaveBeenCalled()
    vi.unstubAllGlobals()
  })

  it('the request page says the waitlist opens once the privacy notice is ready', () => {
    const t = textOf('/request-invite')
    expect(t).toContain('The waitlist opens soon.')
    expect(t).toContain('this page collects nothing')
  })

  it('without a connected Supabase project, the sign in page explains it is unavailable and shows no form', () => {
    const { container } = renderAt('/sign-in')
    expect(container.textContent).toContain("Sign-in isn't available here")
    expect(container.querySelectorAll('form, input')).toHaveLength(0)
    cleanup()
  })
})

describe('other pages', () => {
  it('unknown paths show the public not found page', () => {
    expect(textOf('/no-such-page')).toContain('Page not found')
  })
})
