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
const HYPOTHESIS_NOTE = "This is the idea we're testing in our pilot, not a promise of earnings."

describe('positioning', () => {
  it('leads with the right 1,000 and offers the three ways in', () => {
    const { getByRole, getAllByRole } = renderAt('/')
    expect(getByRole('heading', { level: 1 }).textContent).toBe(HEADLINE)
    expect(getAllByRole('link', { name: /request an invitation/i }).length).toBeGreaterThan(0)
    expect(getAllByRole('link', { name: /take the tour/i }).some((a) => a.getAttribute('href') === '/tour')).toBe(true)
    expect(getAllByRole('link', { name: /sign in/i }).some((a) => a.getAttribute('href') === '/sign-in')).toBe(true)
  })

  it('uses the approved supporting copy in the hero', () => {
    const { container } = renderAt('/')
    const hero = (container.querySelector('#hero')!.textContent || '').replace(/\s+/g, ' ')
    expect(hero).toContain(
      "What if your success as a creator wasn't determined by how many people followed you, but by how many people genuinely valued what you created?",
    )
    expect(hero).toContain(
      'Crevant is building a social network where meaningful connections matter, loyal supporters are recognized, and creators have more opportunities to turn their work into sustainable income.',
    )
  })

  it('labels the right 1,000 as a hypothesis, right where it appears', () => {
    const { container } = renderAt('/')
    const hero = container.querySelector('#hero')!
    expect(hero.querySelector('[data-testid="hypothesis-note"]')?.textContent).toContain(HYPOTHESIS_NOTE)
    expect(hero.textContent).toContain('No money changes hands on Crevant yet.')
    // The FAQ says 1,000 is not a magic number and nothing is promised.
    const faq = container.querySelector('#faq')!.textContent || ''
    expect(faq).toContain('Is 1,000 a magic number?')
    expect(faq).toContain("we can't promise what any community will earn")
  })

  it('makes the contrast between audience size and relationship depth explicit', () => {
    const { container } = renderAt('/')
    const why = container.querySelector('#why')!
    expect(why.textContent).toContain("A big audience isn't the same as a committed one.")
    const rows = [...why.querySelectorAll('ul[aria-label="Chasing size compared with building depth"] li')]
    expect(rows.length).toBeGreaterThanOrEqual(4)
    expect(why.textContent).toContain('Chasing size')
    expect(why.textContent).toContain('Building depth')
    expect(container.querySelector('#success')!.textContent).toContain('Measured by the people who show up, not just the people who follow.')
  })

  it('has every section in the approved order', () => {
    const { container } = renderAt('/')
    const ids = [...container.querySelectorAll('main section[id], section[id]')].map((s) => s.id)
    expect(ids).toEqual(['hero', 'why', 'building-blocks', 'success', 'how', 'who', 'points', 'pilot', 'faq'])
  })
})

describe('building blocks', () => {
  const blocks = () => {
    const { container } = renderAt('/')
    return [...container.querySelectorAll('#building-blocks li')].map((li) => li.textContent || '')
  }
  const find = (title: string) => blocks().find((t) => t.includes(title)) || ''

  it('shows all five, each tied to the vision', () => {
    expect(blocks()).toHaveLength(5)
  })
  it('marks the feed, Connection Points and rewards as in the pilot', () => {
    for (const t of ['A Following feed in time order', 'Connection Points', 'Creator rewards']) expect(find(t)).toContain('In the pilot')
  })
  it('marks voluntary support and advertising as in development, and says they are not live', () => {
    for (const t of ['Voluntary support', 'Creator-content advertising']) {
      expect(find(t)).toContain('In development')
      expect(find(t)).toContain("isn't live yet")
    }
  })
  it('keeps advertising as a supplement, not the centre of the model', () => {
    expect(find('Creator-content advertising')).toContain('not the centre of the model')
  })
  it('separates what the pilot includes from what is still being built', () => {
    const { container } = renderAt('/')
    const pilot = container.querySelector('#pilot')!.textContent || ''
    expect(pilot).toContain('What the pilot includes')
    const built = pilot.slice(pilot.indexOf('Still being built'))
    expect(built).toContain('Direct, voluntary support')
    expect(built).toContain('Advertising on eligible creator content')
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
    expect(t).toContain("That's what we're working toward, not something we can promise.")
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
