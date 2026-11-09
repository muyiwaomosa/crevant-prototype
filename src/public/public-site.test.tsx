// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { PublicRoutes } from './PublicApp'

const PUBLIC_PATHS = ['/', '/join/creator', '/join/supporter', '/request-invite', '/sign-in', '/forgot-password', '/auth/confirm', '/no-such-page']
// Pages that must never collect anything until the privacy notice is approved.
// (Sign-in and password reset are for invited members and are tested in src/public/auth.)
const FORM_FREE_PATHS = ['/', '/join/creator', '/join/supporter', '/request-invite', '/no-such-page']

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
const SECTION_ORDER = ['hero', 'story', 'problem', 'why', 'who', 'difference', 'fans', 'how', 'founding']
// The founder-approved headings, in order.
const HEADINGS = [
  'You earned the follow. You deserve the reach.',
  'My audience tripled. My income dropped by 60%.',
  'You can have a million followers and still struggle to make a living.',
  'What if social media worked for the people creating the value?',
  'For creators who want more than views.',
  "You don't need a million followers. You need the right 1,000.",
  "You're more than a follower. You're part of their success.",
  'Start building something that lasts.',
  'The future of content creation should be built by creators.',
]
// Approved disclaimers that contain the word "guarantee". They are the only
// allowed uses of it (approved narrow exception).
const APPROVED_GUARANTEE_SENTENCES = [
  'Connection Points are not cash and have no guaranteed monetary value.',
  'Participation does not guarantee earnings or rewards.',
  'No guaranteed income, views or engagement.',
]
const POINTS_DISCLAIMER = 'Connection Points are not cash and have no guaranteed monetary value. Rewards depend on what each creator offers.'
const landing = () => renderAt('/').container
const section = (id: string) => landing().querySelector(`#${id}`)!

describe('structure and approved copy', () => {
  it('has the nine approved sections, in order', () => {
    expect([...landing().querySelectorAll('section[id]')].map((s) => s.id)).toEqual(SECTION_ORDER)
  })
  it('uses the approved headings, with exactly one main heading', () => {
    const c = landing()
    expect(c.querySelectorAll('h1')).toHaveLength(1)
    expect(norm(c.querySelector('h1'))).toBe(HEADINGS[0])
    SECTION_ORDER.slice(1).forEach((id, i) => expect(norm(c.querySelector(`#${id} h2`))).toBe(HEADINGS[i + 1]))
  })
  it('keeps key approved passages word for word', () => {
    const t = norm(landing())
    for (const passage of [
      'A creator-first social network where the people who choose to follow you can see your content in their Following feed',
      'An invitation-only platform being built for creators and their supporters.',
      "What's the point of building an audience if you can't reliably reach the people who chose to follow you?",
      'How do you build trust when you can\'t consistently connect with your audience?',
      'When someone chooses to follow you, your content should have a reliable place in their feed.',
      "If any of these sound familiar, we're building Crevant with people like you in mind.",
      'When someone follows you on Crevant, your new posts appear in their chronological Following feed.',
      'Crevant is developing Connection Points, a way to recognize supporters for participating with creators they care about.',
      "It's to help you build something valuable enough to last.",
      "It's built by the people who believe in them.",
      'Your content starts the conversation.',
      'Your relationships build the future.',
      'Limited pilot access. We\'re testing and improving the experience together. Participation does not guarantee earnings or rewards.',
    ]) expect(t, passage).toContain(passage)
  })
})

describe('hero', () => {
  it('offers Join the Founding Community (to section 9) and Explore Crevant (the sample tour)', () => {
    const hero = section('hero')
    const join = [...hero.querySelectorAll('a')].find((a) => norm(a).trim() === 'Join the Founding Community')!
    expect(join.getAttribute('href')).toBe('#founding')
    const tour = [...hero.querySelectorAll('a')].find((a) => norm(a).trim() === 'Explore Crevant')!
    expect(tour.getAttribute('href')).toBe('/tour')
    expect(norm(hero)).toContain('A demonstration with sample data')
    expect([...hero.querySelectorAll('a')].some((a) => a.getAttribute('href') === '/sign-in')).toBe(true)
  })
  it('qualifies the reach claim right beside it', () => {
    expect(norm(section('hero').querySelector('[data-testid="hero-note"]'))).toContain("It isn't a promise that each post reaches each follower.")
  })
})

describe('founder story', () => {
  it('shows a short version, with the rest behind "Read the full story"', () => {
    const story = section('story')
    const details = story.querySelector('details[data-testid="full-story"]')!
    const summary = details.querySelector('summary')!.cloneNode(true) as Element
    summary.querySelectorAll('[aria-hidden="true"]').forEach((n) => n.remove())
    expect(norm(summary).trim()).toBe('Read the full story')
    expect(details.hasAttribute('open')).toBe(false)
    const outside = norm(story).replace(norm(details), '')
    expect(outside).toContain('Two years ago, I made my wife a promise. I told her she\'d be able to retire by her 40th birthday.')
    expect(norm(details)).toContain('I reached 12,000 subscribers and finally got monetized. My first earnings were about $500.')
    expect(norm(details)).toContain('But instead of earning more, I earned about $200.')
    expect(norm(details)).toContain('My audience had grown by 200%. My income had fallen by 60%.')
    expect(norm(details)).toContain("And I wasn't the only one experiencing this.")
  })
  it('shows the confirmed earnings contrast', () => {
    const c = norm(section('story').querySelector('[data-testid="earnings-contrast"]'))
    for (const v of ['12,000', '~$500', '36,000', '(+200%)', '~$200', '(−60%)']) expect(c).toContain(v)
  })
  it("uses the founder's own photograph, nothing generated or stock", () => {
    const img = section('story').querySelector('img')!
    expect(img.getAttribute('src')).toBe('/media/landing/founder.jpg')
    expect(img.getAttribute('alt')).toBe("Portrait of Crevant's founder")
  })
})

describe('the Crevant difference', () => {
  const block = (n: number) => section('difference').querySelector(`[data-block="${n}"]`)!
  it('qualifies "the right 1,000" right under the heading', () => {
    expect(norm(section('difference').querySelector('[data-testid="thousand-note"]'))).toContain(
      "Every creator's right number is different, and we can't promise what any community will earn.",
    )
  })
  it('tells one story: reach, then loyalty, then income opportunities', () => {
    expect(norm(section('difference').querySelector('ol[aria-label]'))).toContain('Reach')
    expect([1, 2, 3].map((n) => norm(block(n).querySelector('h3')))).toEqual([
      '1. Reach the people who follow you.',
      '2. Give your supporters a reason to keep coming back.',
      '3. Build relationships that can support your livelihood.',
    ])
  })
  it('6.1 shows the genuine feed, being built, without promising views', () => {
    const b = block(1)
    expect(b.querySelector('[data-status]')!.getAttribute('data-status')).toBe('building')
    expect(b.querySelector('figure[data-screenshot="feedPosts"]')).not.toBeNull()
    expect(norm(b.querySelector('[data-testid="feed-note"]'))).toContain("It isn't a promise that each follower will open, view or engage with every post.")
  })
  it('6.2 shows Connection Points and rewards with the not-money disclaimer beside them', () => {
    const b = block(2)
    expect(b.querySelector('[data-status]')!.getAttribute('data-status')).toBe('building')
    expect(b.querySelector('figure[data-screenshot="creator"]')).not.toBeNull()
    expect(b.querySelector('figure[data-screenshot="rewards"]')).not.toBeNull()
    expect(norm(b.querySelector('[data-testid="points-note"]'))).toContain(POINTS_DISCLAIMER)
  })
  it('6.3 is Planned, shows no screenshot, and says income is an ambition', () => {
    const b = block(3)
    expect(b.querySelector('[data-status]')!.getAttribute('data-status')).toBe('planned')
    expect(b.querySelectorAll('figure[data-screenshot], img')).toHaveLength(0)
    expect(norm(b.querySelector('[data-testid="planned-panel"]'))).toContain('No payments are enabled')
    expect(norm(b.querySelector('[data-testid="income-note"]'))).toContain('Sustainable income is our ambition for creators, not a promise.')
  })
})

describe('for the fans', () => {
  it('shows Discover and the fan points view, with the disclaimer and status beside the claim', () => {
    const f = section('fans')
    expect(f.querySelector('figure[data-screenshot="discover"]')).not.toBeNull()
    expect(f.querySelector('figure[data-screenshot="myPoints"]')).not.toBeNull()
    expect(norm(f.querySelector('[data-testid="fans-points-note"]'))).toContain(POINTS_DISCLAIMER)
    expect(norm(f.querySelector('[data-testid="fans-status"]'))).toContain('Not yet available to real members.')
    expect(f.querySelector('[data-status="building"]')).not.toBeNull()
  })
})

describe('how it works', () => {
  it('labels each step with its real status', () => {
    const steps = [...section('how').querySelectorAll('[data-step]')]
    expect(steps.map((s) => s.querySelector('[data-status]')!.getAttribute('data-status'))).toEqual(['building', 'planned', 'building'])
    expect(norm(steps[1])).toContain('Creator invite links are planned and not built yet.')
    expect(steps[1].querySelectorAll('figure[data-screenshot]')).toHaveLength(0)
  })
  it('ends with Join the Founding Community', () => {
    expect([...section('how').querySelectorAll('a')].some((a) => a.getAttribute('href') === '#founding')).toBe(true)
  })
})

describe('founding community', () => {
  it('offers the two audience pages, not applications', () => {
    const f = section('founding')
    const links = [...f.querySelectorAll('a')].map((a) => [norm(a).trim(), a.getAttribute('href')])
    expect(links).toEqual([
      ['Learn About the Creator Pilot', '/join/creator'],
      ['Learn About Joining as a Supporter', '/join/supporter'],
    ])
    expect(norm(f)).not.toMatch(/apply to join|join as a supporter/i)
  })
  it('keeps the pilot details compact and complete', () => {
    const d = section('founding').querySelector('details#pilot-details')!
    expect(d.hasAttribute('open')).toBe(false)
    const t = norm(d)
    for (const s of [
      'Invitation-only pilot for adults 18 and older.',
      'An intended 60-day testing period.',
      'No real payments yet.',
      'No guaranteed income, views or engagement.',
      'Features are still being developed and tested.',
    ]) expect(t).toContain(s)
  })
})

describe('product honesty', () => {
  it('labels every screenshot as sample tour data', () => {
    const figures = [...landing().querySelectorAll('figure[data-screenshot]')]
    expect(figures.length).toBe(8)
    for (const f of figures) {
      expect(f.querySelector('img')!.getAttribute('src')).toMatch(/^\/media\/landing\/tour-[a-z-]+\.jpg$/)
      expect(f.querySelector('img')!.getAttribute('alt')!.length).toBeGreaterThan(40)
      expect(norm(f)).toContain('From the Crevant tour, with sample data and fictional people.')
    }
  })
  it('only uses the approved status labels', () => {
    const labels = new Set([...landing().querySelectorAll('[data-status]')].map((el) => norm(el)))
    expect([...labels].sort()).toEqual(['Being built for the pilot', 'Planned'])
  })
  it('never describes anything as live or available now', () => {
    for (const path of PUBLIC_PATHS) expect(textOf(path)).not.toMatch(/\b(now live|live now|available now|is live)\b/i)
  })
  it('never suggests supporters share financially, or that creators own their followers', () => {
    const t = textOf('/')
    expect(t).not.toMatch(/participate in their success|financial returns? for (fans|supporters)/i)
    expect(t).not.toMatch(/own (your|their) (followers|audience|fans|supporters)/i)
  })
})

describe('join pages', () => {
  it.each([
    ['/join/creator', 'Learn about the creator pilot', 'Creator applications are not open yet.'],
    ['/join/supporter', 'Learn about joining as a supporter', 'Joining as a supporter is not open yet.'],
  ])('%s informs, says it is not open, and links back and to the tour', (path, title, notOpen) => {
    const { container } = renderAt(path)
    expect(norm(container.querySelector('h1'))).toBe(title)
    expect(norm(container.querySelector('[data-testid="not-open"]'))).toContain(notOpen)
    expect(norm(container.querySelector('[data-testid="not-open"]'))).toContain('This page collects nothing.')
    const hrefs = [...container.querySelectorAll('a')].map((a) => a.getAttribute('href'))
    expect(hrefs).toContain('/tour')
    expect(hrefs).toContain('/#founding')
    expect(norm(container)).toContain('demonstration with sample data')
  })
  it('the supporter page carries the Connection Points disclaimer', () => {
    expect(textOf('/join/supporter')).toContain(POINTS_DISCLAIMER)
  })
})

describe('header and footer', () => {
  it('keeps Explore Crevant in the header and links Join to section 9', () => {
    const { container } = renderAt('/')
    const header = container.querySelector('header')!
    expect([...header.querySelectorAll('a')].some((a) => norm(a).trim() === 'Explore Crevant' && a.getAttribute('href') === '/tour')).toBe(true)
    expect([...header.querySelectorAll('a')].some((a) => norm(a).trim() === 'Join the Founding Community' && a.getAttribute('href') === '/#founding')).toBe(true)
  })
  it('uses the approved footer, with no Privacy or Terms links', () => {
    const { container } = renderAt('/')
    const footer = container.querySelector('footer')!
    expect(norm(footer)).toContain('Create value. Build connections. Grow together.')
    expect(norm(footer)).toContain('A creator-first social network.')
    expect(norm(footer)).toContain('© 2026 Crevant. All rights reserved.')
    const links = [...footer.querySelectorAll('a')].map((a) => [norm(a).trim(), a.getAttribute('href')])
    expect(links).toEqual([
      ['Our Story', '/#story'],
      ['How It Works', '/#how'],
      ['Join the Pilot', '/#founding'],
      ['Explore Crevant', '/tour'],
      ['Sign in', '/sign-in'],
    ])
    expect(norm(footer)).not.toMatch(/privacy|terms/i)
  })
  it('uses "Explore Crevant" for every link to the tour, on every page', () => {
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
  it('says no money changes hands and earnings are not promised', () => {
    const t = text()
    expect(t).toContain('No money changes hands on Crevant')
    expect(t).toContain("we can't promise what any community will earn")
  })
  it('describes the feed by its order only, and does not promise reach', () => {
    const t = text()
    expect(t).toContain('newest first')
    expect(t).toMatch(/isn't ranked by likes, comments or any engagement score/)
    expect(t).toContain("we don't promise any particular reach")
  })
  it('states the age limit, the invitation, and when the pilot clock starts', () => {
    const t = text()
    expect(t).toContain('adults 18 and older')
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
    /(every|all) (of your |your )?followers? (will )?(see|sees)/i,
    /organic reach/i,
    /go viral/i,
    // A money figure anywhere near an audience number, in either order.
    /[$£€]\s?\d[\d,.]*\s?k?[^.]{0,60}\b\d[\d,.]*\s?k?\s*(fans|supporters|followers|people|subscribers)\b/i,
    /\b\d[\d,.]*\s?k?\s*(fans|supporters|followers|people|subscribers)\b[^.]{0,60}[$£€]\s?\d/i,
    /\b\d[\d,.]*\s*(dollars|usd|cad)\b/i,
    /\b\d[\d,.]*\s*(k\+?|\+)?\s*(creators|users|members|fans) (already|have joined|trust)/i,
    /join (thousands|millions)/i,
    /#1|number one|best platform/i,
  ]
  // Narrow exceptions approved by the founder: the exact disclaimers above
  // (the only allowed "guarantee"), and the founder's confirmed earnings figures,
  // which may appear in the founder story section only.
  const checkedText = (path: string) => {
    const { container } = renderAt(path)
    container.querySelector('#story')?.remove()
    let text = norm(container)
    for (const s of APPROVED_GUARANTEE_SENTENCES) text = text.split(s).join(' ')
    cleanup()
    return text
  }
  it.each(PUBLIC_PATHS)('%s contains no banned phrases (outside the approved exceptions)', (path) => {
    const t = checkedText(path)
    for (const re of BANNED) expect(t, `matched ${re}`).not.toMatch(re)
  })
  it('money figures appear only in the founder story', () => {
    const c = landing()
    const hits = [...c.querySelectorAll('p, li, span, h2, h3')].filter((el) => /[$£€]\s?\d/.test(el.textContent || '') && ![...el.children].some((ch) => /[$£€]\s?\d/.test(ch.textContent || '')))
    expect(hits.length).toBeGreaterThan(0)
    for (const el of hits) expect(el.closest('#story'), `"${el.textContent}" is outside the founder story`).not.toBeNull()
    for (const path of PUBLIC_PATHS.filter((p) => p !== '/')) expect(textOf(path)).not.toMatch(/[$£€]\s?\d/)
  })
  it('the founder story itself still avoids every other banned phrase', () => {
    let t = norm(section('story'))
    for (const s of APPROVED_GUARANTEE_SENTENCES) t = t.split(s).join(' ')
    for (const re of BANNED.filter((r) => !String(r).includes('[$£€]'))) expect(t, `matched ${re}`).not.toMatch(re)
  })
  it('"guarantee" appears only in the approved disclaimers', () => {
    const t = norm(landing())
    const count = (t.match(/guarantee/gi) || []).length
    const approved = APPROVED_GUARANTEE_SENTENCES.reduce((n, s) => n + t.split(s).length - 1, 0)
    expect(count).toBe(approved)
  })
  it('every mention of "1,000" sits in the Crevant difference section, next to its qualification', () => {
    const c = landing()
    const hits = [...c.querySelectorAll('h1, h2, h3, p, li, summary, span')].filter(
      (el) => /1,000/.test(el.textContent || '') && ![...el.children].some((ch) => /1,000/.test(ch.textContent || '')),
    )
    expect(hits.length).toBeGreaterThan(0)
    for (const el of hits) {
      expect(el.closest('#difference')?.querySelector('[data-testid="thousand-note"]'), `"${el.textContent}" appears without its qualification`).toBeTruthy()
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
