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
const SUPPORTING = "Your content should build your future. Not just someone else's platform."
const HYPOTHESIS_NOTE = "This is the idea we're testing in our pilot, not a promise of earnings."
const SECTION_ORDER = ['hero', 'why', 'vision', 'who', 'building', 'how', 'pilot', 'faq', 'cta']
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

  it('uses the approved supporting headline and hero copy', () => {
    const { container } = renderAt('/')
    const hero = container.querySelector('#hero')!
    expect(norm(hero.querySelector('[data-testid="supporting-headline"]'))).toBe(SUPPORTING)
    expect(norm(hero)).toContain("But here's the question: what are you actually building for yourself?")
    expect(norm(hero)).toContain("That's the future we're building at Crevant.")
    expect(norm(hero)).toContain('An invitation-only platform being built with creators and supporters. Free to join during our pilot. Ages 18+.')
  })

  it('keeps the pilot disclaimer right next to the headline', () => {
    const { container } = renderAt('/')
    const hero = container.querySelector('#hero')!
    const note = hero.querySelector('[data-testid="hypothesis-note"]')!
    expect(note.textContent).toContain(HYPOTHESIS_NOTE)
    expect(note.textContent).toContain('No money changes hands on Crevant yet.')
    expect(hero.querySelector('h1')!.nextElementSibling).toBe(note)
    const faq = norm(container.querySelector('#faq'))
    expect(faq).toContain('Is 1,000 a magic number?')
    expect(faq).toContain("we can't promise what any community will earn")
  })

  it('uses the headline once, and explains relationships in different words in Why', () => {
    const t = textOf('/')
    expect(t.split('You need the right 1,000').length - 1).toBe(1)
    const { container } = renderAt('/')
    const why = norm(container.querySelector('#why'))
    expect(why).toContain("A creator's future shouldn't depend only on how many people watch.")
    expect(why).toContain('the relationships they build')
  })

  it('shows attention and relationships side by side without comparing income', () => {
    const { container } = renderAt('/')
    const diagram = container.querySelector('#why [data-testid="attention-diagram"]')!
    const d = norm(diagram)
    expect(d).toContain('100,000 views')
    expect(d).toContain('100 people who value your work')
    expect(d).toContain('neither one is a promise of income')
    expect(d).toContain('Illustration')
    expect(d).not.toMatch(/income than|earn(s)? more|more (money|income)|[$£€]/i)
  })

  it('has every section in the approved order', () => {
    const { container } = renderAt('/')
    const ids = [...container.querySelectorAll('section[id]')].map((s) => s.id)
    expect(ids).toEqual(SECTION_ORDER)
  })

  it('never suggests supporters share financially in a creator\'s success', () => {
    const t = textOf('/')
    expect(t).not.toMatch(/participate in their success/i)
    expect(t).toContain('be part of their journey')
    expect(t).toContain("they don't receive ownership, profits or financial returns")
  })

  it('never suggests creators own their followers', () => {
    expect(textOf('/')).not.toMatch(/own (your|their) (followers|audience|fans|supporters)/i)
  })
})

describe('status of every feature claim', () => {
  const card = (title: string) => {
    const { container } = renderAt('/')
    const li = [...container.querySelectorAll('#building li')].find((el) => (el.textContent || '').includes(title))
    return norm(li || null)
  }

  it('shows the four ideas, each with its real status', () => {
    const { container } = renderAt('/')
    expect(container.querySelectorAll('#building ol > li')).toHaveLength(4)
    expect(card('Build relationships, not just followers')).toContain('In the pilot')
    expect(card('Make meaningful participation count')).toContain('Testing in the pilot')
    expect(card('Create more opportunities to earn')).toContain("Where we're headed")
    expect(card('Build something that lasts')).toContain("Where we're headed")
  })
  it('says Connection Points are not money where they are introduced', () => {
    expect(card('Make meaningful participation count')).toContain("Connection Points aren't money, and they don't promise financial returns.")
  })
  it('says earning tools are a longer-term direction, not a pilot promise', () => {
    expect(card('Create more opportunities to earn')).toContain('not a promise that every creator will earn money during the pilot')
  })
  it('marks each journey step with its status, ending with where we are headed', () => {
    const { container } = renderAt('/')
    const steps = [...container.querySelectorAll('#how [data-testid="journey-diagram"] li')].map((li) => li.querySelector('[data-status]')?.getAttribute('data-status'))
    expect(steps).toEqual(['pilot', 'pilot', 'testing', 'vision'])
    expect(norm(container.querySelector('#how'))).toContain('Additional earning capabilities are planned and will be introduced only when ready.')
  })
  it('labels the vision as a long-term aim', () => {
    const { container } = renderAt('/')
    expect(norm(container.querySelector('#vision'))).toContain("Where we're headed")
    expect(norm(container.querySelector('#vision'))).toContain('A long-term aim, not something Crevant does today.')
  })
  it('separates what the pilot includes from what is still being built', () => {
    const { container } = renderAt('/')
    const pilot = norm(container.querySelector('#pilot'))
    expect(pilot).toContain('What the pilot includes')
    const built = pilot.slice(pilot.indexOf('Still being built'))
    expect(built).toContain('Direct, voluntary support')
    expect(built).toContain('Advertising on eligible creator content')
  })
  it('gives pilot numbers as planning targets only', () => {
    const { container } = renderAt('/')
    const targets = norm(container.querySelector('[data-testid="pilot-targets"]'))
    expect(targets).toContain('approximately 10–20 creators and 200–300 supporters')
    expect(targets).toContain('These are planning targets, not promises about how many people will take part.')
  })
})

describe('interface images', () => {
  it('are genuine tour screenshots, each labelled as sample data', () => {
    const { container } = renderAt('/')
    const figures = [...container.querySelectorAll('figure[data-screenshot]')]
    expect(figures.length).toBe(3)
    for (const f of figures) {
      expect(f.querySelector('img')!.getAttribute('src')).toMatch(/^\/media\/landing\/tour-[a-z-]+\.jpg$/)
      expect(f.querySelector('img')!.getAttribute('alt')!.length).toBeGreaterThan(40)
      expect(norm(f)).toContain('From the Crevant tour, with sample data.')
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
  // The one approved exception: the Why section's heading describes the
  // problem creators face ("...still struggle to make a living from what you
  // create"). It is allowed only as that exact heading, only in #why, and the
  // rest of the page is still checked against every banned phrase.
  const PROBLEM_STATEMENT = 'You can have thousands of followers and still struggle to make a living from what you create.'
  const pageTextWithoutProblemStatement = (path: string) => {
    const { container } = renderAt(path)
    for (const h of container.querySelectorAll('#why > div > h2')) {
      if (norm(h) === PROBLEM_STATEMENT) h.remove()
    }
    const text = norm(container)
    cleanup()
    return text
  }

  it.each(PUBLIC_PATHS)('%s contains no banned phrases', (path) => {
    const t = pageTextWithoutProblemStatement(path)
    for (const re of BANNED) expect(t, `matched ${re}`).not.toMatch(re)
  })

  it('allows the problem statement only as the Why heading', () => {
    const { container } = renderAt('/')
    expect(norm(container.querySelector('#why-title'))).toBe(PROBLEM_STATEMENT)
    expect(norm(container).split('make a living').length - 1).toBe(1)
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
