// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { PublicRoutes } from './PublicApp'
import { HOMEPAGE_COPY } from './landing/copy'
import { DISCLOSURES, findMisleadingClaims, mentionsProvisionalAllocation, PROVISIONAL_LABEL } from './landing/claims'
import { PRODUCT_IMAGES_DISCLOSURE } from './landing/shared'

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
const SECTION_ORDER = ['hero', 'problem', 'alternative', 'connection', 'vision', 'invitation']
const HEADINGS = [
  'You Create The Post. You Deserve a Split.',
  'You create the value. The algorithm decides who sees it.',
  'A social platform built around connection, not just attention.',
  'When your community helps you grow, they’re recognized too.',
  'Content creation deserves to be a respected profession.',
  'Be part of a better split.',
]
// The only allowed uses of "guarantee": these exact disclaimers.
const APPROVED_GUARANTEE_SENTENCES = [
  DISCLOSURES.invitationOnly,
  DISCLOSURES.noGuarantee,
  // The founder-approved wording on /join, unchanged.
  "Joining the waitlist doesn't guarantee an invitation to the pilot.",
  'Participation does not guarantee earnings or rewards.',
]
// The hero's plain statement of today's problem, approved by the founder. It
// describes what happens on other platforms; it is not a promise.
const APPROVED_PROBLEM_SENTENCES = ["You work hard to make content. You grow your followers. But that doesn't always mean you get paid."]
/** Every block of visible text in an element, for the claims checker. */
const blocks = (el: Element) => [...el.querySelectorAll('h1, h2, h3, p, li, span, a, figcaption')].map((e) => norm(e).trim()).filter(Boolean)

describe('one Splitpost story, top to bottom', () => {
  it('has the six sections, in order', () => {
    expect([...landing().querySelectorAll('main section[id]')].map((s) => s.id)).toEqual(SECTION_ORDER)
  })
  it('uses the approved headlines, with exactly one main heading', () => {
    const c = landing()
    expect(c.querySelectorAll('h1')).toHaveLength(1)
    SECTION_ORDER.forEach((id, i) => expect(norm(c.querySelector(`#${id} ${i === 0 ? 'h1' : 'h2'}`))).toBe(HEADINGS[i]))
  })
  it('leaves nothing of Crevant or the retired sections on the page', () => {
    const c = landing()
    expect(norm(c)).not.toMatch(/Crevant|the right 1,000|Founding community|creator-first social network|You earned the follow|first 10K|Where's your split/i)
    expect(c.querySelectorAll('#story, #why, #who, #what, #how, #difference, #fans, #founding, [data-screenshot], [data-status]')).toHaveLength(0)
  })
  it('shows no external research or statistics', () => {
    const t = norm(landing())
    expect(t).not.toMatch(/Goldman|Nielsen|Linktree|\bstudy\b|survey|respondents|\d+(\.\d+)?\s?%|million|billion/i)
    expect(landing().querySelectorAll('[data-research]')).toHaveLength(0)
  })
  it('follows one sample post, Priya teaching a running drill, labelled as sample data', () => {
    expect(norm(section('hero'))).toContain(HOMEPAGE_COPY.post.text)
    expect(norm(section('alternative'))).toContain(HOMEPAGE_COPY.post.text)
    expect(norm(landing())).toContain(HOMEPAGE_COPY.peopleNote)
  })
  it('leads with the creator: the fan reward mechanism appears only after the problem and the alternative', () => {
    const c = landing()
    const ids = [...c.querySelectorAll('main section[id]')].map((sec) => sec.id)
    const firstCp = ids.findIndex((id) => /Connection Points/.test(norm(c.querySelector(`#${id}`))))
    expect(ids[firstCp]).toBe('connection')
    // The hero's only mention of rewards is the pilot disclosure itself.
    expect(norm(section('hero')).split(DISCLOSURES.noFanCash).join(' ')).not.toMatch(/Connection Points|reward/i)
    expect(norm(section('problem'))).not.toMatch(/\bfans?\b|Connection Points/i)
  })
})

describe('HERO', () => {
  const hero = () => section('hero')
  it('shows the approved headline exactly, with "You Deserve a Split." highlighted in gold', () => {
    const h1 = hero().querySelector('h1')!
    expect(norm(h1)).toBe('You Create The Post. You Deserve a Split.')
    expect([...h1.querySelectorAll('span.block')].map((el) => norm(el))).toEqual(['You Create The Post.', 'You Deserve a Split.'])
    const emphasis = hero().querySelector('[data-testid="headline-emphasis"]')!
    expect(norm(emphasis)).toBe('You Deserve a Split.')
    expect(emphasis.className).toContain('text-sp-gold')
    expect(h1.className).not.toContain('uppercase')
  })
  it('uses the approved supporting copy, and says beside it that nothing is guaranteed', () => {
    expect([...hero().querySelectorAll('[data-testid="hero-body"] p')].map((p) => norm(p))).toEqual([...HOMEPAGE_COPY.hero.body])
    expect(norm(hero().querySelector('[data-testid="hero-small-print"]'))).toBe(`Invitation-only pilot. ${DISCLOSURES.noGuarantee} ${DISCLOSURES.noFanCash}`)
  })
  it('offers Join the Waitlist first and Discover Splitpost second, and Sign in in the full app', () => {
    const actions = [...hero().querySelectorAll('[data-testid="hero-actions"] a')].map((a) => [norm(a).trim(), a.getAttribute('href')])
    expect(actions).toEqual([
      ['Join the Waitlist', '/join'],
      ['Discover Splitpost', '/tour'],
    ])
    expect([...hero().querySelectorAll('a')].some((a) => a.getAttribute('href') === '/sign-in')).toBe(true)
  })
  it('pictures one post split into what the creator created and what her community grew, joined by a gold seam', () => {
    const scene = hero().querySelector('[data-testid="hero-scene"]')!
    expect(norm(scene)).toContain('Priya Raman')
    expect(norm(scene)).toContain('Running coach')
    expect(norm(scene)).toContain('Sample')
    expect(norm(scene)).toContain('Created by Priya')
    expect(norm(scene)).toContain('Grown by her community')
    expect(scene.querySelector('[data-testid="gold-seam"]')).toBeTruthy()
    expect(scene.querySelectorAll('img')).toHaveLength(0)
    expect(norm(scene.querySelector('figcaption'))).toMatch(/split into two pieces/)
    expect(norm(scene)).not.toMatch(/[$£€%]|earn|cash|payout/i)
  })
  it('puts the picture straight after the headline, before the tagline and actions', () => {
    const order = [...hero().querySelectorAll('h1, [data-testid="hero-scene"], [data-testid="hero-body"], [data-testid="hero-actions"], [data-testid="hero-small-print"]')].map(
      (el) => el.getAttribute('data-testid') ?? el.tagName,
    )
    expect(order).toEqual(['H1', 'hero-scene', 'hero-body', 'hero-actions', 'hero-small-print'])
  })
})

describe('PROBLEM', () => {
  const problem = () => section('problem')
  it('uses the approved copy: access to an audience, not just views', () => {
    expect([...problem().querySelectorAll('[data-testid="problem-body"] p')].map((p) => norm(p))).toEqual([...HOMEPAGE_COPY.problem.body])
    expect(norm(problem())).toContain('You can have thousands of followers and still struggle to reach them.')
  })
  it('names the four creator problems', () => {
    expect([...problem().querySelectorAll('[data-testid="problem-points"] h3')].map((h) => norm(h))).toEqual([
      'Reach you can’t predict',
      'Attention over connection',
      'Followers, not a community',
      'Earnings that don’t reflect the work',
    ])
  })
})

describe('ALTERNATIVE', () => {
  const alt = () => section('alternative')
  it('shows three pillars, each on a concept screen labelled concept and sample data inside the frame', () => {
    const items = [...alt().querySelectorAll('[data-testid="alternative-pillars"] > li')]
    expect(items.map((li) => norm(li.querySelector('h3')))).toEqual(HOMEPAGE_COPY.alternative.pillars.map((p) => p.title))
    for (const li of items) expect(norm(li.querySelector('[data-testid="mockup-label"]'))).toBe(`${DISCLOSURES.concept} · ${DISCLOSURES.sampleData}`)
  })
  it('says it is being built for the pilot, beside the claims', () => {
    expect(norm(alt().querySelector('[data-testid="alternative-pilot-label"]'))).toBe('Being built for the pilot')
    expect(norm(alt().querySelector('[data-testid="alternative-note"]'))).toBe(DISCLOSURES.stillTesting)
  })
  it('lets keyboard users scroll the screens', () => {
    const region = alt().querySelector('[role="region"]')!
    expect(region.getAttribute('tabindex')).toBe('0')
    expect(region.getAttribute('aria-label')).toMatch(/concept screens/)
  })
})

describe('CONNECTION', () => {
  const con = () => section('connection')
  it('presents fan recognition as strengthening the relationship, not as payment', () => {
    expect(norm(con().querySelector('[data-testid="connection-body"]'))).toBe(HOMEPAGE_COPY.connection.body)
    expect(HOMEPAGE_COPY.connection.body).toMatch(/It isn’t a payment\./)
    expect([...con().querySelectorAll('[data-testid="connection-steps"] h3')]).toHaveLength(3)
  })
  it('keeps the Connection Points limits right beside the claim', () => {
    const d = norm(con().querySelector('[data-testid="connection-disclosure"]'))
    expect(d).toContain(DISCLOSURES.cpNoCashValue)
    expect(d).toContain(DISCLOSURES.noFanCash)
    expect(norm(con())).toContain(PROVISIONAL_LABEL)
  })
})

describe('VISION', () => {
  const vision = () => section('vision')
  it('gives the founder’s goal statement a prominent place, verbatim', () => {
    const goal = vision().querySelector('[data-testid="vision-goal-text"]')!
    expect(goal.textContent).toBe('we want to create a platform that generates sustainable pay for content creators who have something valuable to say')
    expect(goal.closest('blockquote')).toBeTruthy()
    expect(goal.className).not.toMatch(/uppercase|capitalize/)
  })
  it('uses the approved headline and covers every stage of the creator journey', () => {
    expect(norm(vision().querySelector('[data-testid="vision-body"]'))).toBe(HOMEPAGE_COPY.vision.body)
    expect([...vision().querySelectorAll('[data-testid="vision-stages"] li')].map((li) => norm(li))).toEqual([...HOMEPAGE_COPY.vision.stages])
  })
  it('labels the long-term idea as not part of the pilot, with no guarantee, right beside it', () => {
    const lt = vision().querySelector('[data-testid="vision-long-term"]')!
    expect(norm(lt)).toMatch(/not part of the pilot/i)
    expect(norm(lt.querySelector('[data-testid="vision-disclosure"]'))).toBe(`${DISCLOSURES.visionOnly} ${DISCLOSURES.noGuarantee}`)
    expect(norm(vision())).not.toMatch(/\d|[$€£¥%]|revenue/i)
  })
})

describe('CLOSE: the invitation', () => {
  const inv = () => section('invitation')
  it('offers the one waitlist, with every pilot disclosure always visible beside it', () => {
    const links = [...inv().querySelectorAll('a')].map((a) => [norm(a).trim(), a.getAttribute('href')])
    expect(links).toEqual([['Join the Waitlist', '/join']])
    const d = inv().querySelector('[data-testid="pilot-details"]')!
    expect(d.closest('details')).toBeNull()
    expect([...d.querySelectorAll('li')].map((li) => norm(li).trim())).toEqual([...HOMEPAGE_COPY.invitation.pilotDetails])
  })
  it('speaks to creators at every stage, and the people who support them', () => {
    expect(norm(inv().querySelector('[data-testid="invitation-audience"]'))).toBe(HOMEPAGE_COPY.invitation.audience)
  })
  it('is signed by the founder, with the founder photo', () => {
    const sign = inv().querySelector('[data-testid="founder-signoff"]')!
    expect(norm(sign).trim()).toBe('Muyiwa Omosa, Founder of Splitpost')
    expect(sign.querySelector('img')!.getAttribute('src')).toBe('/media/landing/founder.jpg')
  })
  it('says the story uses sample people and sample data', () => {
    expect(norm(inv().querySelector('[data-testid="people-note"]'))).toBe(HOMEPAGE_COPY.peopleNote)
  })
  it('has a phone-only waitlist bar that starts hidden', () => {
    const bar = landing().querySelector('[data-testid="mobile-waitlist-bar"]')!
    expect(bar.getAttribute('aria-hidden')).toBe('true')
    expect(bar.className).toContain('md:hidden')
    expect(bar.querySelector('a')!.getAttribute('href')).toBe('/join')
  })
})

describe('photos', () => {
  it('shows no stock photos of people until the new shortlist is approved', () => {
    expect(landing().querySelectorAll('img[data-photo]')).toHaveLength(0)
  })
  it('never presents a person as a member or a testimonial', () => {
    const t = norm(landing())
    expect(t).not.toMatch(/testimonial|[“”]|\b(said|says):/i)
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
      expect([...header.querySelectorAll('a')].some((a) => norm(a).trim() === 'Discover Splitpost' && a.getAttribute('href') === '/tour'), path).toBe(true)
      const join = [...header.querySelectorAll('a')].find((a) => norm(a).trim() === 'Join the Waitlist')!
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
      expect(norm(footer), path).toContain('Every Post. A Better Split.')
      expect(norm(footer), path).toContain('© 2026 Splitpost. All rights reserved.')
      expect(norm(footer.querySelector('[data-testid="product-images-note"]')), path).toBe(PRODUCT_IMAGES_DISCLOSURE)
      expect(norm(footer), path).not.toMatch(/Crevant|privacy|terms/i)
      cleanup()
    }
    const { container } = renderAt('/')
    const links = [...container.querySelectorAll('footer a')].map((a) => [norm(a).trim(), a.getAttribute('href')])
    expect(links).toEqual([
      ['Why Splitpost', '/#problem'],
      ['How It Works', '/#alternative'],
      ['Join the Waitlist', '/join'],
      ['Discover Splitpost', '/tour'],
      ['Sign in', '/sign-in'],
    ])
  })
  it('names every link to the tour on the home page "Discover Splitpost"', () => {
    const c = landing()
    const tour = [...c.querySelectorAll('a[href="/tour"]')]
    expect(tour.length).toBeGreaterThanOrEqual(2)
    for (const a of tour) expect(norm(a).trim()).toBe('Discover Splitpost')
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
    const t = norm(landing())
    const count = (t.match(/guarantee/gi) || []).length
    const approved = APPROVED_GUARANTEE_SENTENCES.reduce((n, s) => n + t.split(s).length - 1, 0)
    expect(count).toBe(approved)
  })
})

describe('the waitlist page', () => {
  const INTRO = [
    'Be among the first to try Splitpost, where creators make the content, fans help it grow, and both deserve to benefit from its success.',
    "Whether you create content or support the people who do, there's a place for you on Splitpost.",
    "We're inviting people in small groups as we build and test the platform. Joining the waitlist doesn't guarantee an invitation to the pilot.",
  ]
  it.each(['/join', '/join/creator', '/join/supporter'])('%s shows the one waitlist, says it is not open, and links back and to the tour', (path) => {
    const { container } = renderAt(path)
    expect(norm(container.querySelector('h1'))).toBe('Join the Waitlist')
    expect([...container.querySelectorAll('[data-testid="join-intro"] p')].map((p) => norm(p))).toEqual(INTRO)
    expect(norm(container.querySelector('[data-testid="not-open"]'))).toContain('The waitlist opens once our privacy notice is published.')
    expect(norm(container)).not.toMatch(/as a creator|as a supporter/i)
    expect(container.querySelector('form, input, textarea, select')).toBeNull()
    expect(norm(container.querySelector('[data-testid="not-open"]'))).toContain('This page collects nothing.')
    const hrefs = [...container.querySelectorAll('a')].map((a) => a.getAttribute('href'))
    expect(hrefs).toContain('/tour')
    expect(hrefs).toContain('/#invitation')
    expect(norm(container)).toContain('demonstration with sample data')
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
