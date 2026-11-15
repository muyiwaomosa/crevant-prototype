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
  'SOCIAL MEDIA NEEDS A BETTER SPLIT.',
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
  // WHAT: the future vision is not guaranteed.
  "It isn't guaranteed.",
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
  it('follows the same relatable sample post, Priya’s first 10K, from the hero to HOW', () => {
    for (const id of ['hero', 'why', 'what', 'how']) expect(norm(section(id)), id).toContain(HOMEPAGE_COPY.post.text)
    expect(norm(landing())).not.toMatch(/offline mode|build log/i)
  })
  it('labels every sample engagement number as sample data', () => {
    for (const p of landing().querySelectorAll('[data-testid="sample-post"]')) expect(norm(p)).toMatch(/Sample/)
    expect(norm(section('why'))).toMatch(/Sample data/)
  })
})

describe('HERO', () => {
  const hero = () => section('hero')
  it('shows the approved headline as three lines, with SPLIT. as the split word', () => {
    const h1 = hero().querySelector('h1')!
    expect([...h1.querySelectorAll('span.block')].map((el) => norm(el))).toEqual(['SOCIAL MEDIA', 'NEEDS A', 'BETTER SPLIT.'])
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
    expect([...scene.querySelectorAll('img')].map((i) => i.getAttribute('data-photo'))).toEqual(['studio-room', 'ring-light', 'creator-smiling', 'fan-on-phone'])
    expect(norm(scene)).toContain('Priya Raman')
    expect(norm(scene)).toContain('Sample')
    expect(norm(scene.querySelector('figcaption'))).toContain('stock images')
  })
})

describe('WHY', () => {
  const why = () => section('why')
  it('keeps the exact headline and uses the approved introduction', () => {
    expect(norm(why().querySelector('h2'))).toBe("You helped build it. Where's your split?")
    const intro = why().querySelector('[data-testid="why-intro"]')!
    expect([...intro.querySelectorAll(':scope > p')].map((p) => norm(p))).toEqual([
      'One post goes viral. Thousands help it spread. The creator makes the content. Fans make it popular.',
      'But too often, the platform captures the value while the people behind the success see little of it.',
      'We believe the people creating the value deserve a better split of it.',
    ])
  })
  it('gives the challenge the strongest emphasis, with its key phrase highlighted', () => {
    const challenge = why().querySelector('[data-testid="why-challenge"]')!
    expect(challenge.className).toMatch(/font-black/)
    expect(norm(challenge.querySelector('span.text-sp-orange'))).toBe('the platform captures the value')
  })
  it('tells the simple four-step story, as an ordered list', () => {
    const steps = [...why().querySelectorAll('ol[data-testid="post-journey"] > li')]
    expect(steps.map((li) => norm(li.querySelector('h3')))).toEqual([
      'Priya creates a relatable post.',
      'Ana comments and shares it with friends.',
      'Leo reposts it and introduces new people.',
      'The post takes off because people helped it spread.',
    ])
    expect(norm(steps[1])).toContain('Replying to')
    expect(norm(steps[2])).toContain('Leo reposted')
  })
  it('ends with the question', () => {
    expect(norm(why().querySelector('[data-testid="split-question"] p')).trim()).toBe(HOMEPAGE_COPY.why.question.replace("'", '’'))
  })
})

describe('WHO', () => {
  const who = () => section('who')
  it('focuses on the real frustrations, with split central for fans', () => {
    const people = [...who().querySelectorAll('article[data-audience]')]
    expect(people.map((a) => a.getAttribute('data-audience'))).toEqual(['creator', 'fan'])
    expect(norm(people[0])).toContain('You’re creating content people love. But the money doesn’t reflect the work.')
    expect(norm(people[1])).toContain("You helped make that post successful. But where's your split?")
    expect([...people[0].querySelectorAll('li')].map((li) => norm(li).trim())).toEqual(HOMEPAGE_COPY.who.creator.points)
    expect([...people[1].querySelectorAll('li')].map((li) => norm(li).trim())).toEqual(HOMEPAGE_COPY.who.fan.points)
    expect(norm(who())).not.toMatch(/nobody noticed|no one noticed/i)
  })
  it('shows each in a photo scene', () => {
    const people = [...who().querySelectorAll('article[data-audience]')]
    expect(people[0].querySelector('img[data-photo="creator-frustrated"]')).not.toBeNull()
    expect(people[1].querySelector('img[data-photo="fans-together"]')).not.toBeNull()
  })
})

describe('WHAT', () => {
  const what = () => section('what')
  it('leads with the value proposition for creators and fans', () => {
    const cards = [...what().querySelectorAll('article[data-value]')]
    expect(cards.map((c) => c.getAttribute('data-value'))).toEqual(['creator', 'fan'])
    expect(norm(cards[0])).toContain('Create what matters. Earn a better split.')
    expect(norm(cards[1])).toContain("Don't just share the post. Share in its success.")
    expect(norm(what().querySelector('[data-testid="value-split"]'))).toContain(HOMEPAGE_COPY.post.text)
  })
  it('has no prominent pilot or vision panels, but keeps both disclosures visible and accurate', () => {
    expect(what().querySelectorAll('[data-panel]')).toHaveLength(0)
    const today = what().querySelector('[data-testid="what-today"]')!
    const vision = what().querySelector('[data-testid="what-vision"]')!
    for (const el of [today, vision]) expect(el.closest('details, [hidden], [role="tabpanel"]')).toBeNull()
    for (const k of ['noFanCash', 'cpNoCashValue'] as const) expect(norm(today)).toContain(DISCLOSURES[k])
    expect(norm(today)).not.toMatch(/revenue|payout|\bpaid\b/i)
    expect(norm(vision)).toContain('future vision')
    expect(norm(vision)).toContain("It isn't guaranteed.")
    expect(norm(vision)).toContain(DISCLOSURES.visionOnly)
  })
  it('shows no numbers, percentages or proportions for the split itself', () => {
    const cards = norm(what().querySelector('[data-testid="value-split"]')).replace(norm(what().querySelector('[data-testid="sample-post"]')), '')
    expect(cards).not.toMatch(/\d|[$€£%]/)
    expect(mentionsProvisionalAllocation(norm(what()))).toBe(false)
  })
})

describe('HOW', () => {
  const how = () => section('how')
  it('leads straight with the product screens, under the approved headline', () => {
    expect(norm(how().querySelector('h2'))).toBe('POST. SUPPORT. SPLIT.')
    expect(how().querySelector('[data-testid="how-steps"]')).toBeNull()
    expect(how().querySelectorAll('h2 ~ p')).toHaveLength(0)
  })
  it('walks the post through four concept phone screens, each labelled concept and sample data inside the frame', () => {
    const screens = [...how().querySelectorAll('[data-testid="how-screens"] > li')]
    expect(screens).toHaveLength(4)
    for (const s of screens) expect(norm(s.querySelector('[data-testid="mockup-label"]'))).toBe('Concept · Sample data')
    expect(norm(screens[0])).toContain(HOMEPAGE_COPY.post.text)
    expect(norm(screens[1])).toContain('Repost with your link')
    expect(norm(screens[2])).toContain('Top supporters')
    expect(norm(screens[3])).toContain('Connection Points with Priya')
    expect(norm(screens[3])).toContain('No cash value.')
    expect(norm(screens[3])).toContain('Perk unlocked')
    expect(norm(screens[3])).toContain(PROVISIONAL_LABEL)
    expect(norm(how())).not.toMatch(/[$€£]|cash out|withdraw|payout/i)
  })
  it('lets keyboard users scroll the screens, and says what the split means in the pilot', () => {
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
