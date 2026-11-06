// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { PublicRoutes } from './PublicApp'

const PUBLIC_PATHS = ['/', '/request-invite', '/sign-in', '/forgot-password', '/auth/confirm', '/no-such-page']
// Pages that must never collect anything until the privacy notice is approved.
// (Sign-in and password reset are for invited members and are tested in src/public/auth.)
const FORM_FREE_PATHS = ['/', '/request-invite', '/no-such-page']

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

const HEADLINE = "You don't need a million followers. You need the right 1,000."
const MISSION = 'Our mission is to help content creators who have something valuable to say build sustainable income.'
const MISSION_NOTE = 'This is our long-term mission, not a promise of earnings during the pilot.'
const SECTION_ORDER = ['hero', 'why', 'who', 'what', 'how', 'cta']
const norm = (el: Element | null) => (el?.textContent || '').replace(/\s+/g, ' ')

describe('positioning', () => {
  it('leads with the right 1,000 and offers the ways in', () => {
    const { getByRole, getAllByRole } = renderAt('/')
    expect(getByRole('heading', { level: 1 }).textContent).toBe(HEADLINE)
    expect(getAllByRole('link', { name: /explore crevant/i }).every((a) => a.getAttribute('href') === '/tour')).toBe(true)
    expect(getAllByRole('link', { name: /explore crevant/i }).length).toBeGreaterThanOrEqual(2)
    expect(getAllByRole('link', { name: /join the invitation list|request an invitation/i }).every((a) => a.getAttribute('href') === '/request-invite')).toBe(true)
    expect(getAllByRole('link', { name: /sign in/i }).some((a) => a.getAttribute('href') === '/sign-in')).toBe(true)
  })

  it('puts the mission directly under the headline, then the note that it is not a pilot promise', () => {
    const { container } = renderAt('/')
    const hero = container.querySelector('#hero')!
    const mission = hero.querySelector('[data-testid="mission"]')!
    const note = hero.querySelector('[data-testid="hypothesis-note"]')!
    expect(norm(mission)).toBe(MISSION)
    expect(hero.querySelector('h1')!.nextElementSibling).toBe(mission)
    expect(mission.nextElementSibling).toBe(note)
    expect(note.textContent).toContain(MISSION_NOTE)
    expect(note.textContent).toContain('No money changes hands on Crevant yet.')
    const faq = norm(container.querySelector('#faq'))
    expect(faq).toContain('Is 1,000 a magic number?')
    expect(faq).toContain("we can't promise what any community will earn")
  })

  it('uses the headline once', () => {
    expect(textOf('/').split('You need the right 1,000').length - 1).toBe(1)
  })

  it('has exactly six sections, in the approved order', () => {
    const { container } = renderAt('/')
    const ids = [...container.querySelectorAll('section[id]')].map((s) => s.id)
    expect(ids).toEqual(SECTION_ORDER)
  })

  it('never suggests supporters share financially in a creator\'s success', () => {
    const t = textOf('/')
    expect(t).not.toMatch(/participate in their success/i)
    expect(t).toContain("they don't receive ownership, profits or financial returns")
  })

  it('never suggests creators own their followers', () => {
    expect(textOf('/')).not.toMatch(/own (your|their) (followers|audience|fans|supporters)/i)
  })
})

describe('why: distribution', () => {
  const why = () => {
    const { container } = renderAt('/')
    return container.querySelector('#why')!
  }
  it('names the problem: you build the audience, the platform controls distribution', () => {
    const w = why()
    expect(norm(w.querySelector('h2'))).toBe('You build the audience. The platform controls the distribution.')
    expect(norm(w)).toContain('still struggle to reach the people who explicitly chose to follow them')
    expect(norm(w)).toContain('Recommendation algorithms often prioritize predicted engagement rather than the relationships people have deliberately chosen.')
  })
  it('describes the Following feed by its order only, and never promises every follower sees every post', () => {
    const w = norm(why())
    expect(w).toContain('the Following feed is chronological: newest first, not ranked by predicted engagement')
    expect(w).toContain("It isn't a promise that each post reaches each follower.")
    expect(textOf('/')).not.toMatch(/(every|all) (of your |your )?followers? (will )?(see|sees)|see every post you|never miss a post/i)
  })
})

describe('who: four audiences', () => {
  it('shows the four audience examples', () => {
    const { container } = renderAt('/')
    const items = [...container.querySelectorAll('#who li')].map(norm)
    expect(items).toHaveLength(4)
    expect(items[0]).toContain('500 followers')
    expect(items[0]).toContain('struggling to get discovered')
    expect(items[1]).toContain('100,000 followers')
    expect(items[1]).toContain("can't consistently reach it or build sustainable income")
    expect(items[2]).toContain('Teachers, artists, experts, storytellers')
    expect(items[2]).toContain('respected profession')
    expect(items[3]).toContain('Supporters')
    expect(items[3]).toContain('see posts from the creators they follow')
  })
})

describe('what: the pyramid', () => {
  const what = () => {
    const { container } = renderAt('/')
    return container.querySelector('#what')!
  }
  it('uses the approved headline and message', () => {
    const w = what()
    expect(norm(w.querySelector('h2'))).toBe('The creator economy looks a lot like a pyramid scheme. We\'re building Crevant to flip it.')
    expect(norm(w)).toContain('sustainable earning opportunities are concentrated among relatively few')
    expect(norm(w)).toContain("Our goal isn't to create a few more millionaires at the top. It's to help more creators earn enough to keep creating.")
  })
  it('says the pyramid is a metaphor, not an allegation', () => {
    expect(norm(what().querySelector('[data-testid="metaphor-note"]'))).toContain("We're not saying any company runs an illegal scheme.")
  })
  it('shows today upright and the vision inverted, labelled as a conceptual vision, not data or a promise', () => {
    const fig = what().querySelector('[data-testid="pyramid-comparison"]')!
    const today = fig.querySelector('[data-pyramid="today"] polygon')!.getAttribute('points')!
    const vision = fig.querySelector('[data-pyramid="vision"] polygon')!.getAttribute('points')!
    // Today: the first shape is the narrow tip at the top (apex y < base y).
    const ys = (pts: string) => pts.split(' ').map((p) => Number(p.split(',')[1]))
    expect(Math.min(...ys(today))).toBeLessThan(10)
    expect(new Set(ys(today).filter((y) => y < 10)).size).toBe(1)
    // Vision: the first shape is the wide band at the top (two corners at the top edge).
    expect(ys(vision).filter((y) => y < 10)).toHaveLength(2)
    expect(norm(fig)).toContain("Today's creator economy")
    expect(norm(fig)).toContain("Crevant's vision")
    expect(norm(fig)).toContain('Conceptual vision')
    expect(norm(fig)).toContain('Not measured income data, and not a promise of any outcome.')
    expect(fig.querySelectorAll('svg[role="img"] title')).toHaveLength(2)
  })
})

describe('how: status of every feature claim', () => {
  const point = (title: string) => {
    const { container } = renderAt('/')
    const li = [...container.querySelectorAll('#how ol > li')].find((el) => (el.textContent || '').includes(title))
    return norm(li || null)
  }
  it('shows the four points, each with its real status', () => {
    const { container } = renderAt('/')
    expect(container.querySelectorAll('#how ol > li')).toHaveLength(4)
    expect(point('Follow means follow.')).toContain('In the pilot')
    expect(point('Build meaningful connections.')).toContain('In the pilot')
    expect(point('Recognize loyal supporters.')).toContain('Testing in the pilot')
    expect(point('Build toward sustainable income.')).toContain("Where we're headed")
  })
  it('says Connection Points are not money where they are introduced', () => {
    expect(point('Recognize loyal supporters.')).toContain('They are not money.')
  })
  it('keeps earning and advertising as future plans, with advertising as a supplement', () => {
    const p = point('Build toward sustainable income.')
    expect(p).toContain('planned, not currently live')
    expect(p).toContain('Advertising should supplement creator opportunities rather than dominate the model.')
    // Advertising is only ever mentioned in that future-status point.
    const { container } = renderAt('/')
    const mentions = [...container.querySelectorAll('main p, main li, main h3')].filter((el) => /advertis/i.test(el.textContent || '') && !el.querySelector('p, li'))
    for (const el of mentions) expect(norm(el.closest('li'))).toContain("Where we're headed")
  })
  it('gives pilot numbers as planning targets only, with the clock rule', () => {
    const { container } = renderAt('/')
    const targets = norm(container.querySelector('[data-testid="pilot-targets"]'))
    expect(targets).toContain('approximately 10–20 creators and 200–300 supporters')
    expect(targets).toContain('These are planning targets, not promises about how many people will take part.')
  })
})

describe('layout', () => {
  it('keeps the final call to action short and focused on exploring', () => {
    const { container } = renderAt('/')
    const cta = container.querySelector('#cta')!
    expect(norm(cta.querySelector('h2'))).toBe("You have something valuable to say. We're building a better way for people to hear it.")
    expect(norm(cta)).toContain("You shouldn't need a million followers to have a meaningful opportunity to build a career from what you create.")
    expect(cta.querySelector('a[href="/tour"]')!.textContent).toContain('Explore Crevant')
    expect(norm(cta).length).toBeLessThan(500)
  })
  it('keeps the FAQ compact', () => {
    const { container } = renderAt('/')
    expect(container.querySelectorAll('#faq details').length).toBeLessThanOrEqual(6)
  })
  it('uses "Explore Crevant" for every link to the tour', () => {
    for (const path of PUBLIC_PATHS) {
      const { container } = renderAt(path)
      for (const a of container.querySelectorAll('a[href="/tour"]')) expect(norm(a).trim()).toBe('Explore Crevant')
      expect(norm(container)).not.toMatch(/take the tour/i)
      cleanup()
    }
  })
})

describe('required disclosures', () => {
  const text = () => textOf('/')
  it('says Connection Points are not money and cannot be traded', () => {
    expect(text()).toMatch(/They're not money\. They can't be bought, sold, cashed out or moved to another creator/)
  })
  it('says earning is not live and earnings are not promised', () => {
    const t = text()
    expect(t).toContain('No money changes hands on Crevant')
    expect(t).toMatch(/can't promise anyone earnings/)
  })
  it('describes the feed by its order only, and does not promise reach', () => {
    const t = text()
    expect(t).toContain('newest first')
    expect(t).toMatch(/isn't ranked by likes, comments or any engagement score/)
    expect(t).toContain("we don't promise any particular reach")
  })
  it('keeps follower counts and says so', () => {
    expect(text()).toContain("Follower counts aren't going away.")
  })
  it('states the age limit, the invitation, and when the pilot clock starts', () => {
    const t = text()
    expect(t).toContain('18+')
    expect(t).toContain('Invitation-only pilot')
    expect(t).toContain('The 60 days begin when invited participants can actually use Crevant')
  })
  it('says nothing involving money is live', () => {
    expect(text()).toContain("It isn't available yet. Before anything involving money goes live")
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
    /organic reach/i,
    /go viral/i,
    // A money figure anywhere near an audience number, in either order.
    /[$£€]\s?\d[\d,.]*\s?k?[^.]{0,60}\b\d[\d,.]*\s?k?\s*(fans|supporters|followers|people)\b/i,
    /\b\d[\d,.]*\s?k?\s*(fans|supporters|followers|people)\b[^.]{0,60}[$£€]\s?\d/i,
    /\b\d[\d,.]*\s*(dollars|usd|cad)\b/i,
    /\b\d[\d,.]*\s*(k\+?|\+)?\s*(creators|users|members|fans) (already|have joined|trust)/i,
    /join (thousands|millions)/i,
    /#1|number one|best platform/i,
  ]
  it.each(PUBLIC_PATHS)('%s contains no banned phrases', (path) => {
    const t = textOf(path)
    for (const re of BANNED) expect(t, `matched ${re}`).not.toMatch(re)
  })


  it('every mention of "1,000" sits on the landing page next to its hypothesis label or in the FAQ that explains it', () => {
    const { container } = renderAt('/')
    const hits = [...container.querySelectorAll('h1, h2, h3, p, li, summary, span')].filter(
      (el) => /1,000/.test(el.textContent || '') && ![...el.children].some((c) => /1,000/.test(c.textContent || '')),
    )
    expect(hits.length).toBeGreaterThan(0)
    for (const el of hits) {
      const ok = el.closest('#hero')?.querySelector('[data-testid="hypothesis-note"]') || el.closest('#faq')
      expect(ok, `"${el.textContent}" appears without its hypothesis label`).toBeTruthy()
    }
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

  it('the request page says requests are closed until the privacy notice is ready', () => {
    const t = textOf('/request-invite')
    expect(t).toContain('Invitation requests open soon.')
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
