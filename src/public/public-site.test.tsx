// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { PublicRoutes } from './PublicApp'
import { HOMEPAGE_COPY } from './landing/copy'
import { DISCLOSURES, findMisleadingClaims, mentionsProvisionalAllocation, PROVISIONAL_LABEL } from './landing/claims'
import { PHOTOS } from './landing/photos'
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
const SECTION_ORDER = ['hero', 'why', 'who', 'what', 'how', 'invitation']
const HEADINGS = [
  'SUCCESS SHOULD BE SPLIT.',
  "You helped build it. Where's your split?",
  'The creator who keeps posting. The fan who keeps sharing.',
  'What if every successful post created more winners?',
  'POST. SUPPORT. SPLIT.',
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
  it('leaves nothing of Crevant on the page: no old copy, sections, screenshots or brand', () => {
    const c = landing()
    expect(norm(c)).not.toMatch(/Crevant|the right 1,000|Founding community|Create value\. Build connections|creator-first social network|You earned the follow/i)
    expect(c.querySelectorAll('#story, #problem, #difference, #fans, #founding, [data-screenshot], [data-status]')).toHaveLength(0)
    expect([...c.querySelectorAll('img')].map((i) => i.getAttribute('src')).filter((s) => /tour-|who-/.test(s || ''))).toEqual([])
  })
  it('shows no external research or statistics', () => {
    const t = norm(landing())
    expect(t).not.toMatch(/Goldman|Nielsen|Linktree|\bstudy\b|survey|respondents|\d+(\.\d+)?\s?%|million|billion/i)
    expect(landing().querySelectorAll('[data-research]')).toHaveLength(0)
  })
  it('follows the same sample post, Priya’s, from the hero to HOW', () => {
    for (const id of ['hero', 'why', 'what', 'how']) expect(norm(section(id)), id).toContain('Shipped the offline mode.')
  })
})

describe('HERO', () => {
  const hero = () => section('hero')
  it('shows the approved headline as three lines, with SPLIT. as the split word', () => {
    const h1 = hero().querySelector('h1')!
    expect([...h1.querySelectorAll('span.block')].map((el) => norm(el))).toEqual(['SUCCESS', 'SHOULD BE', 'SPLIT.'])
    expect(norm(hero().querySelector('[data-testid="split-word"]'))).toBe('SPLIT.')
  })
  it('uses the approved tagline, belief and small print word for word', () => {
    expect(norm(hero().querySelector('[data-testid="hero-tagline"]'))).toBe('Every Post. A Better Split.')
    expect(norm(hero().querySelector('[data-testid="hero-body"]'))).toBe('Creators make the content. Fans help it grow. Both deserve to benefit from its success.')
    expect(norm(hero().querySelector('[data-testid="hero-small-print"]'))).toBe(`Invitation-only pilot. ${DISCLOSURES.noFanCash}`)
  })
  it('offers Join the Waitlist first and Discover Splitpost second, and Sign in in the full app', () => {
    const actions = [...hero().querySelectorAll('[data-testid="hero-actions"] a')].map((a) => [norm(a).trim(), a.getAttribute('href')])
    expect(actions).toEqual([
      ['Join the Waitlist', '/join'],
      ['Discover Splitpost', '/tour'],
    ])
    expect([...hero().querySelectorAll('a')].some((a) => a.getAttribute('href') === '/sign-in')).toBe(true)
  })
  it('pictures a creator, a fan and a recognisable post between them', () => {
    const scene = hero().querySelector('[data-testid="hero-scene"]')!
    expect([...scene.querySelectorAll('img')].map((i) => i.getAttribute('data-photo'))).toEqual(['creator-at-work', 'fan-on-phone'])
    expect(norm(scene)).toContain('Priya Raman')
    expect(norm(scene)).toContain('Sample')
    expect(norm(scene.querySelector('figcaption'))).toContain('stock images')
  })
})

describe('WHY', () => {
  const why = () => section('why')
  it("follows Priya's post through four steps, as an ordered list", () => {
    const steps = [...why().querySelectorAll('ol[data-testid="post-journey"] > li')]
    expect(steps.map((li) => norm(li.querySelector('h3')))).toEqual(['Priya posts.', 'Ana joins in.', 'Leo recommends it.', 'The post takes off.'])
    for (const [i, li] of steps.entries()) expect(norm(li.querySelector(':scope > p'))).toBe(HOMEPAGE_COPY.why.steps[i].line)
  })
  it('describes the gap between contributing and benefiting accurately', () => {
    const gap = why().querySelector('[data-testid="contribution-gap"]')!
    expect(norm(gap.querySelector('h3'))).toBe('They all helped it grow. Not all of them had a way to benefit.')
    expect([...gap.querySelectorAll('li[data-person]')].map((li) => li.getAttribute('data-person'))).toEqual(['Priya', 'Ana', 'Leo'])
  })
})

describe('WHO', () => {
  const who = () => section('who')
  it('shows the creator then the fan, each with a photo scene, one line and three frustrations', () => {
    const people = [...who().querySelectorAll('article[data-audience]')]
    expect(people.map((a) => a.getAttribute('data-audience'))).toEqual(['creator', 'fan'])
    expect(norm(people[0])).toContain('More posts. More followers. Not more income.')
    expect(norm(people[1])).toContain('You shared it. You started the conversation. Nobody noticed.')
    expect([...people[0].querySelectorAll('li')].map((li) => norm(li).trim())).toEqual(HOMEPAGE_COPY.who.creator.points)
    expect([...people[1].querySelectorAll('li')].map((li) => norm(li).trim())).toEqual(HOMEPAGE_COPY.who.fan.points)
    expect(people[0].querySelector('img[data-photo="creator-frustrated"]')).not.toBeNull()
    expect(people[1].querySelector('img[data-photo="fans-together"]')).not.toBeNull()
  })
})

describe('WHAT', () => {
  const what = () => section('what')
  it('shows the outcomes for creators and fans', () => {
    const o = norm(what().querySelector('[data-testid="outcomes"]'))
    for (const p of [...HOMEPAGE_COPY.what.outcomes.creator.points, ...HOMEPAGE_COPY.what.outcomes.fan.points]) expect(o).toContain(p)
  })
  it('shows the pilot and the vision side by side, always visible, never behind tabs or toggles', () => {
    const now = what().querySelector('[data-panel="now"]')!
    const later = what().querySelector('[data-panel="later"]')!
    for (const panel of [now, later]) {
      expect(panel.closest('details, [role="tabpanel"], [hidden]')).toBeNull()
      expect(panel.querySelectorAll('button, [role="tab"]')).toHaveLength(0)
    }
  })
  it('draws them differently: the pilot solid and orange, the vision dashed and badged as a vision', () => {
    const now = what().querySelector('[data-panel="now"]')!
    const later = what().querySelector('[data-panel="later"]')!
    expect(now.className).not.toMatch(/dashed/)
    expect(later.className).toMatch(/border-dashed/)
    expect(later.querySelector('ul')!.className).toMatch(/border-dashed/)
    expect(now.querySelector('ul')!.className).not.toMatch(/dashed/)
    expect(norm(now)).toContain('Now · in the pilot')
    expect(norm(later)).toContain('Later · our vision')
  })
  it('shows the pilot split as recognition and perks, with the no-cash disclosures beside it', () => {
    const now = what().querySelector('[data-panel="now"]')!
    expect([...now.querySelectorAll(':scope > ul > li')]).toHaveLength(3)
    expect(norm(now)).toContain('Connection Points with Priya')
    expect(norm(now)).toContain('Perks from Priya')
    expect(norm(now.querySelector('[data-testid="pilot-note"]'))).toBe(`${DISCLOSURES.noFanCash} ${DISCLOSURES.cpNoCashValue} ${DISCLOSURES.cpRules}`)
    expect(norm(now)).not.toMatch(/revenue|payout|\bpaid\b/i)
  })
  it('shows the vision split three ways with no numbers, percentages or proportions', () => {
    const later = what().querySelector('[data-panel="later"]')!
    expect([...later.querySelectorAll(':scope > ul > li')].map((li) => norm(li.querySelector('p')).trim())).toEqual(['The creator', 'A fan reward pool', 'Splitpost'])
    expect(norm(later)).not.toMatch(/\d|[$€£%]/)
    expect(later.querySelectorAll('[style*="width"]')).toHaveLength(0)
    expect(norm(later.querySelector('[data-testid="vision-note"]'))).toBe(DISCLOSURES.visionOnly)
    expect(norm(later)).toContain('Not every post would earn it')
    expect(mentionsProvisionalAllocation(norm(what()))).toBe(false)
  })
})

describe('HOW', () => {
  const how = () => section('how')
  it('uses the approved three steps, in order', () => {
    const steps = [...how().querySelectorAll('[data-testid="how-steps"] > li')].map((li) => norm(li))
    expect(steps).toEqual(['POST.Create something worth sharing.', 'SUPPORT.Help it reach more people.', 'SPLIT.Make meaningful contributions count.'])
  })
  it('walks the post through four concept phone screens, each labelled concept and sample data inside the frame', () => {
    const screens = [...how().querySelectorAll('[data-testid="how-screens"] > li')]
    expect(screens).toHaveLength(4)
    for (const s of screens) expect(norm(s.querySelector('[data-testid="mockup-label"]'))).toBe('Concept · Sample data')
    expect(norm(screens[0])).toContain('Shipped the offline mode.')
    expect(norm(screens[1])).toContain('Recommend Priya with your link')
    expect(norm(screens[2])).toContain('Who helped')
    expect(norm(screens[3])).toContain('Connection Points with Priya')
    expect(norm(screens[3])).toContain('No cash value.')
    expect(norm(screens[3])).toContain(PROVISIONAL_LABEL)
  })
  it('lets keyboard users scroll the screens, and says what SPLIT means in the pilot', () => {
    expect(how().querySelector('[role="region"][tabindex="0"][aria-label]')).not.toBeNull()
    expect(norm(how().querySelector('[data-testid="how-pilot-note"]'))).toBe(HOMEPAGE_COPY.how.pilotNote)
    expect(norm(how())).toContain(DISCLOSURES.noGuarantee)
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
  it('is signed by the founder, with the founder photo', () => {
    const sign = inv().querySelector('[data-testid="founder-signoff"]')!
    expect(norm(sign).trim()).toBe('Muyiwa Omosa, Founder of Splitpost')
    expect(sign.querySelector('img')!.getAttribute('src')).toBe('/media/landing/founder.jpg')
  })
  it('says the photos show models and the story uses sample people', () => {
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
  it('uses only recorded stock photos, each with its real size and lazy loading below the hero', () => {
    const imgs = [...landing().querySelectorAll('img[data-photo]')]
    expect(imgs.length).toBeGreaterThanOrEqual(8)
    const byId = Object.fromEntries(Object.values(PHOTOS).map((p) => [p.id, p]))
    for (const img of imgs) {
      const p = byId[img.getAttribute('data-photo')!]
      expect(p, img.getAttribute('data-photo')!).toBeTruthy()
      expect(img.getAttribute('src')).toBe(p.src)
      expect(img.getAttribute('width')).toBe(String(p.width))
      expect(img.getAttribute('alt')).toBe(p.alt)
      if (!img.closest('#hero')) expect(img.getAttribute('loading')).toBe('lazy')
    }
  })
  it('never presents a person in a photo as a member or a testimonial', () => {
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
      ['Why Splitpost', '/#why'],
      ['How It Works', '/#how'],
      ['Join the Waitlist', '/join'],
      ['Discover Splitpost', '/tour'],
      ['Sign in', '/sign-in'],
    ])
  })
  it('names every link to the tour on the home page "Discover Splitpost"', () => {
    const c = landing()
    const tour = [...c.querySelectorAll('a[href="/tour"]')]
    expect(tour.length).toBeGreaterThanOrEqual(3)
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
    for (const s of APPROVED_GUARANTEE_SENTENCES) text = text.split(s).join(' ')
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
    'Be among the first to experience a social network designed to help creators build meaningful relationships with their communities.',
    "Whether you create content or support the people who do, there's a place for you on Crevant.",
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
