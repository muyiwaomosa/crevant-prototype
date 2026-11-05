// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { PublicRoutes } from './PublicApp'

const PUBLIC_PATHS = ['/', '/request-invite', '/sign-in', '/no-such-page']

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

describe('landing page content', () => {
  it('leads with the vision and offers the three ways in', () => {
    const { getByRole, getAllByRole } = renderAt('/')
    expect(getByRole('heading', { level: 1 }).textContent).toBe('Turn what you create into something that lasts.')
    expect(getAllByRole('link', { name: /request an invitation/i }).length).toBeGreaterThan(0)
    expect(getAllByRole('link', { name: /take the tour/i }).some((a) => a.getAttribute('href') === '/tour')).toBe(true)
    expect(getAllByRole('link', { name: /sign in/i }).some((a) => a.getAttribute('href') === '/sign-in')).toBe(true)
  })

  it('has every section', () => {
    const { container } = renderAt('/')
    for (const id of ['why', 'pillars', 'how', 'who', 'points', 'pilot', 'faq']) expect(container.querySelector(`#${id}`)).not.toBeNull()
  })

  it('labels every pillar with its real status', () => {
    const { container } = renderAt('/')
    const cards = [...container.querySelectorAll('#pillars li')]
    expect(cards).toHaveLength(4)
    const status = (title: string) => cards.find((c) => c.textContent?.includes(title))?.textContent || ''
    expect(status('Relationships, not just reach')).toContain('In the pilot')
    expect(status('A Following feed in time order')).toContain('In the pilot')
    expect(status('Opportunities to earn')).toContain('In development')
    expect(status('Work that keeps its value')).toContain("Where we're headed")
  })

  it('separates what the pilot includes from what is still being built', () => {
    const { container } = renderAt('/')
    const pilot = container.querySelector('#pilot')!.textContent || ''
    expect(pilot).toContain('What the pilot includes')
    expect(pilot).toContain('Still being built')
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
    expect(t).toContain('Neither is live yet')
    expect(t).toMatch(/won't promise earnings|can't promise anyone earnings/)
  })
  it('describes the feed by its order only, and does not promise reach', () => {
    const t = text()
    expect(t).toContain('newest first')
    expect(t).toMatch(/isn't ranked by likes, comments or any engagement score/)
    expect(t).toContain("we don't promise any particular reach")
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
  // Phrases that would imply guaranteed reach, guaranteed earnings, or
  // invented traction. Checked case-insensitively on every public page.
  const BANNED = [
    /guarantee/i,
    /guaranteed (reach|earnings|income|views)/i,
    /earn money now/i,
    /get paid/i,
    /passive income/i,
    /make money/i,
    /start earning/i,
    /reach everyone/i,
    /reach all (of )?your/i,
    /every(one|body) (will )?sees?/i,
    /all your followers (will )?see/i,
    /organic reach/i,
    /go viral/i,
    /\b\d[\d,.]*\s*(k\+?|\+)?\s*(creators|users|members|fans) (already|have joined|trust)/i,
    /join (thousands|millions)/i,
    /#1|number one|best platform/i,
  ]
  it.each(PUBLIC_PATHS)('%s contains no banned phrases', (path) => {
    const t = textOf(path)
    for (const re of BANNED) expect(t, `matched ${re}`).not.toMatch(re)
  })
})

describe('no personal data collection', () => {
  it.each(PUBLIC_PATHS)('%s renders no form or input of any kind', (path) => {
    const { container } = renderAt(path)
    expect(container.querySelectorAll('form, input, textarea, select, [contenteditable="true"]')).toHaveLength(0)
  })

  it.each(PUBLIC_PATHS)('%s makes no network requests and stores nothing', (path) => {
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
    expect(t).toContain('nothing on this site collects your personal information')
  })

  it('the sign in page has no sign in form yet', () => {
    expect(textOf('/sign-in')).toContain('Sign in opens soon for invited participants.')
  })
})

describe('other pages', () => {
  it('unknown paths show the public not found page', () => {
    expect(textOf('/no-such-page')).toContain('Page not found')
  })
})
