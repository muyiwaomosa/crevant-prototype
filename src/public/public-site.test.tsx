// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { PublicRoutes } from './PublicApp'
import { allHomepageText, HOMEPAGE_COPY } from './landing/copy'
import { DISCLOSURES, findMisleadingClaims, mentionsProvisionalAllocation } from './landing/claims'
import { PLACEHOLDER_LABEL } from './landing/ui/HeroVisual'

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
// The five Splitpost sections, in the approved order.
const SECTION_ORDER = ['hero', 'problem', 'solution', 'experience', 'invitation']
// The founder-approved headings, in order. The hero is the Splitpost hero
// (PR 2); the sections after it change in PRs 3 and 4.
const HEADINGS = [
  HOMEPAGE_COPY.hero.headline,
  HOMEPAGE_COPY.problem.headline,
  HOMEPAGE_COPY.solution.headline,
  HOMEPAGE_COPY.experience.headline,
  HOMEPAGE_COPY.invitation.headline,
]
// Approved disclaimers that contain the word "guarantee". They are the only
// allowed uses of it (approved narrow exception).
const APPROVED_GUARANTEE_SENTENCES = [
  DISCLOSURES.noGuarantee,
  DISCLOSURES.invitationOnly,
  // The founder-approved wording on /join (reworded in PR 5).
  "Joining the waitlist doesn't guarantee an invitation to the pilot.",
  'Participation does not guarantee earnings or rewards.',
]
const landing = () => renderAt('/').container
const section = (id: string) => landing().querySelector(`#${id}`)!

describe('structure and approved copy', () => {
  it('has the approved sections, in order', () => {
    expect([...landing().querySelectorAll('section[id]')].map((s) => s.id)).toEqual(SECTION_ORDER)
  })
  it('uses the approved headings, with exactly one main heading', () => {
    const c = landing()
    expect(c.querySelectorAll('h1')).toHaveLength(1)
    expect(norm(c.querySelector('h1'))).toBe(HEADINGS[0])
    SECTION_ORDER.slice(1).forEach((id, i) => expect(norm(c.querySelector(`#${id} h2`))).toBe(HEADINGS[i + 1]))
  })
  it('keeps every approved homepage line word for word', () => {
    const t = norm(landing())
    for (const line of allHomepageText()) expect(t, line).toContain(line)
  })
  it('has no older Crevant homepage sections left', () => {
    for (const id of ['story', 'why', 'who', 'difference', 'fans', 'how', 'founding']) expect(landing().querySelector(`#${id}`), id).toBeNull()
    const main = [...landing().querySelectorAll('section[id]')].map((sec) => norm(sec)).join(' ')
    expect(main).not.toMatch(/Crevant/)
  })
})

describe('hero (Splitpost)', () => {
  const hero = () => section('hero')
  it('shows the approved headline as three stacked lines, with SPLIT. as the split word', () => {
    const h1 = hero().querySelector('h1')!
    expect(norm(h1)).toBe('SUCCESS SHOULD BE SPLIT.')
    expect([...h1.querySelectorAll('span.block')].map((el) => norm(el))).toEqual(['SUCCESS', 'SHOULD BE', 'SPLIT.'])
    expect(norm(hero().querySelector('[data-testid="split-word"]'))).toBe('SPLIT.')
  })
  it('uses the approved tagline, belief and small print word for word', () => {
    const c = HOMEPAGE_COPY.hero
    expect(norm(hero().querySelector('[data-testid="hero-tagline"]'))).toBe('Every Post. A Better Split.')
    expect(norm(hero().querySelector('[data-testid="hero-body"]'))).toBe('Creators make the content. Fans help it grow. Both deserve to benefit from its success.')
    expect(norm(hero().querySelector('[data-testid="hero-small-print"]'))).toBe(c.smallPrint.join(' '))
    expect(norm(hero().querySelector('[data-testid="hero-small-print"]'))).toContain(DISCLOSURES.noFanCash)
  })
  it('offers Join the Waitlist first and Discover Splitpost second, and Sign in in the full app', () => {
    const actions = [...hero().querySelectorAll('[data-testid="hero-actions"] a')].map((a) => [norm(a).trim(), a.getAttribute('href')])
    expect(actions).toEqual([
      ['Join the Waitlist', '/join'],
      ['Discover Splitpost', '/tour'],
    ])
    expect([...hero().querySelectorAll('a')].some((a) => a.getAttribute('href') === '/sign-in')).toBe(true)
  })
  it('labels the visual as placeholder material, not real people, with a concept post', () => {
    const fig = hero().querySelector('figure[data-placeholder="hero"]')!
    expect(norm(fig.querySelector('[data-testid="placeholder-badge"]'))).toBe(PLACEHOLDER_LABEL)
    expect(norm(fig.querySelector('figcaption'))).toMatch(/^Placeholder imagery, not real people/)
    expect(norm(fig)).toContain('Concept · Sample data')
    // Shapes only: no photographs of anyone in the placeholder.
    expect(fig.querySelectorAll('img')).toHaveLength(0)
  })
  it('makes no misleading financial claim (an extra safeguard, not a substitute for review)', () => {
    const blocks = [...hero().querySelectorAll('h1, p, a, span, figcaption')].map((el) => norm(el).trim()).filter(Boolean)
    expect(blocks.length).toBeGreaterThan(10)
    expect(blocks.flatMap((b) => findMisleadingClaims(b))).toEqual([])
  })
  it('leaves no Crevant hero copy behind', () => {
    expect(norm(hero())).not.toMatch(/Crevant|You earned the follow|creator-first|Explore Crevant/)
  })
})

describe('section 2: the problem (Splitpost)', () => {
  const problem = () => section('problem')
  it('keeps the exact headline', () => {
    expect(norm(problem().querySelector('h2'))).toBe("You helped build it. Where's your split?")
  })
  it('tells two stories, creator then fan, each a label and one line', () => {
    const stories = [...problem().querySelectorAll('article[data-story]')]
    expect(stories.map((a) => a.getAttribute('data-story'))).toEqual(['creator', 'fan'])
    expect(stories.map((a) => norm(a.querySelector('h3')))).toEqual(['The creator.', 'The fan.'])
    expect(norm(stories[0].querySelector('h3 + p'))).toBe('More posts. More followers. Not more income.')
    expect(norm(stories[1].querySelector('h3 + p'))).toBe('You shared it. You started the conversation. Nobody noticed.')
  })
  it('keeps the illustrations decorative, with no numbers that read as statistics', () => {
    for (const a of problem().querySelectorAll('article[data-story]')) {
      const art = a.querySelector('[aria-hidden="true"]')!
      expect(art).not.toBeNull()
      expect(art.querySelectorAll('img')).toHaveLength(0)
      // Only the approved chips carry digits ("5 times", "3 friends").
      expect(norm(art).replace(/Posted 5 times this week|Shared it with 3 friends/g, '')).not.toMatch(/\d/)
    }
  })
  it('is short: no paragraphs beyond the two story lines', () => {
    expect(problem().querySelectorAll('p')).toHaveLength(2)
    expect(norm(problem()).length).toBeLessThan(400)
  })
})

describe('section 3: POST. SUPPORT. SPLIT. (Splitpost)', () => {
  const solution = () => section('solution')
  it('uses the approved headline and three steps, in order', () => {
    expect(norm(solution().querySelector('h2'))).toBe('POST. SUPPORT. SPLIT.')
    const steps = [...solution().querySelectorAll('[data-testid="solution-steps"] > li')].map((li) => norm(li).replace(/Step \d: /, ''))
    expect(steps).toEqual([
      'POST.Create something worth sharing.',
      'SUPPORT.Help it reach more people.',
      'SPLIT.Make meaningful contributions count.',
    ])
    expect(solution().querySelector('ol[data-testid="solution-steps"]')).not.toBeNull()
  })
  it('keeps pilot recognition and the future vision apart, both always visible', () => {
    const now = solution().querySelector('[data-panel="now"]')!
    const later = solution().querySelector('[data-panel="later"]')!
    expect(norm(now)).toContain('Now · in the pilot')
    expect(norm(now)).toContain('They have no cash value.')
    expect(norm(later)).toContain('Later · our vision')
    expect(norm(later)).toContain(DISCLOSURES.visionOnly)
    expect(norm(later)).not.toMatch(/\d|[$€£%]/)
    for (const panel of [now, later]) expect(panel.closest('details')).toBeNull()
  })
  it('makes no misleading financial claim (a safeguard alongside human review)', () => {
    for (const id of ['problem', 'solution']) {
      const blocks = [...section(id).querySelectorAll('h2, h3, p, span')].map((el) => norm(el).trim()).filter(Boolean)
      expect(blocks.flatMap((b) => findMisleadingClaims(b)), id).toEqual([])
    }
  })
})





describe('waitlist calls to action', () => {
  it('uses "Join the Waitlist" consistently and never the old labels', () => {
    for (const path of PUBLIC_PATHS) expect(textOf(path)).not.toMatch(/Join the Founding Community|Join the Pilot|Learn About the Creator Pilot|Learn About Joining as a Supporter/)
  })
  it('offers one waitlist for everyone, from the hero and the invitation, with no roles', () => {
    for (const id of ['hero', 'invitation']) {
      const join = [...section(id).querySelectorAll('a')].filter((a) => norm(a).trim() === 'Join the Waitlist')
      expect(join.map((a) => a.getAttribute('href')), id).toEqual(['/join'])
    }
    expect(textOf('/')).not.toMatch(/as a Creator|as a Supporter|apply/i)
  })
  it('has a phone-only waitlist bar that starts hidden and goes to /join', () => {
    const bar = landing().querySelector('[data-testid="mobile-waitlist-bar"]')!
    expect(bar.getAttribute('aria-hidden')).toBe('true')
    expect(bar.className).toContain('md:hidden')
    expect(bar.querySelector('a')!.getAttribute('href')).toBe('/join')
    expect(bar.querySelector('a')!.getAttribute('tabindex')).toBe('-1')
  })
})

describe('section 4: the experience (Splitpost)', () => {
  const exp = () => section('experience')
  it('uses the approved headline, intro and status', () => {
    expect(norm(exp().querySelector('h2'))).toBe('Built for creators. Powered by fans.')
    expect(norm(exp())).toContain(HOMEPAGE_COPY.experience.intro)
    expect(norm(exp().querySelector('[data-status]'))).toBe('Being built for the pilot')
  })
  it('shows the four concept screens, in order, each captioned and labelled concept and sample data', () => {
    const figs = [...exp().querySelectorAll('figure[data-mockup]')]
    expect(figs.map((f) => f.getAttribute('data-mockup'))).toEqual(['Following feed', 'Creator insights', 'Fan recognition', 'Perks'])
    HOMEPAGE_COPY.experience.mockups.forEach((m, i) => {
      expect(norm(figs[i].querySelector('figcaption'))).toContain(`${m.title}${m.line}`)
      // Inside the frame itself, so the label survives cropping, and in the caption for screen readers.
      expect(norm(figs[i].querySelector('[aria-hidden="true"]'))).toContain('Concept · Sample data')
      expect(norm(figs[i].querySelector('figcaption'))).toContain('Concept · Sample data')
      expect(figs[i].querySelectorAll('img')).toHaveLength(0)
    })
  })
  it('shows Connection Points as recognition per creator, with provisional values and no money', () => {
    const rec = exp().querySelector('figure[data-mockup="Fan recognition"]')!
    expect(norm(rec)).toContain('No cash value.')
    expect(norm(rec)).toContain('provisional samples, not yet validated')
    expect(norm(exp())).not.toMatch(/[$€£¥]|\bcash out\b|payout/i)
  })
  it('sends people to the tour rather than explaining every feature, with the reach qualifier beside it', () => {
    const tour = [...exp().querySelectorAll('a')].find((a) => norm(a).trim() === 'Take the guided tour')!
    expect(tour.getAttribute('href')).toBe('/tour')
    expect(norm(exp().querySelector('[data-testid="experience-small-print"]'))).toBe(DISCLOSURES.noGuarantee)
  })
  it('keeps the phone carousel reachable by keyboard', () => {
    const region = exp().querySelector('[role="region"]')!
    expect(region.getAttribute('tabindex')).toBe('0')
    expect(region.getAttribute('aria-label')).toBe('Concept screens with sample data')
  })
})

describe('section 5: the invitation (Splitpost)', () => {
  const inv = () => section('invitation')
  it('uses the approved headline and body', () => {
    expect(norm(inv().querySelector('h2'))).toBe('Be part of a better split.')
    expect(norm(inv().querySelector('[data-testid="invitation-body"]'))).toBe(HOMEPAGE_COPY.invitation.body)
  })
  it('lists every required pilot disclosure, always visible', () => {
    const details = inv().querySelector('[data-testid="pilot-details"]')!
    expect([...details.querySelectorAll('li')].map((li) => norm(li))).toEqual([...HOMEPAGE_COPY.invitation.pilotDetails])
    expect(details.closest('details')).toBeNull()
  })
  it('is signed by the founder, with the founder photo', () => {
    const sign = inv().querySelector('[data-testid="founder-signoff"]')!
    expect(norm(sign)).toBe('Muyiwa Omosa, Founder of Splitpost')
    expect(sign.querySelector('img')!.getAttribute('src')).toBe('/media/landing/founder.jpg')
  })
})

describe('product honesty', () => {
  it('discloses sample data and fictional people discreetly: on the hero visual and in the footer', () => {
    const c = landing()
    expect(norm(c.querySelector('#hero figure[data-placeholder="hero"]'))).toContain('Sample data')
    expect(c.querySelectorAll('[data-testid="demo-note"]')).toHaveLength(0)
    for (const path of PUBLIC_PATHS) {
      const { container } = renderAt(path)
      expect(norm(container.querySelector('footer [data-testid="product-images-note"]')), path).toBe(
        'Product images on this site show the Crevant demo, with sample data and fictional people.',
      )
      cleanup()
    }
    expect(norm(c)).not.toMatch(/\bIllustration\b|From the Crevant tour/)
  })
  it('uses no photographs of people except the founder, and no captured screenshots', () => {
    const srcs = [...landing().querySelectorAll('img')].map((i) => i.getAttribute('src'))
    expect(srcs).toEqual(['/media/landing/founder.jpg'])
  })
  it('only uses the approved status labels', () => {
    const labels = new Set([...landing().querySelectorAll('[data-status]')].map((el) => norm(el)))
    expect([...labels].sort()).toEqual(['Being built for the pilot'])
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

describe('content security', () => {
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
      // Visible at every width: not inside a wrapper that hides it.
      expect(join.closest('.hidden'), path).toBeNull()
      expect(norm(header), path).not.toMatch(/Crevant/)
      cleanup()
    }
  })
  it('uses the approved footer, with no Privacy or Terms links', () => {
    const { container } = renderAt('/')
    const footer = container.querySelector('footer')!
    expect(norm(footer)).toContain('Create value. Build connections. Grow together.')
    expect(norm(footer)).toContain('A creator-first social network.')
    expect(norm(footer)).toContain('© 2026 Crevant. All rights reserved.')
    const links = [...footer.querySelectorAll('a')].map((a) => [norm(a).trim(), a.getAttribute('href')])
    expect(links).toEqual([
      ['Our Story', '/#problem'],
      ['How It Works', '/#solution'],
      ['Join the Waitlist', '/join'],
      ['Explore Crevant', '/tour'],
      ['Sign in', '/sign-in'],
    ])
    expect(norm(footer)).not.toMatch(/privacy|terms/i)
  })
  it('names the tour links "Discover Splitpost" (header, hero), "Take the guided tour" (section 4), and "Explore Crevant" in the footer and /join until PR 5', () => {
    for (const path of PUBLIC_PATHS) {
      const { container } = renderAt(path)
      for (const a of container.querySelectorAll('a[href="/tour"]')) {
        const expected = a.closest('header, #hero') ? 'Discover Splitpost' : a.closest('#experience') ? 'Take the guided tour' : 'Explore Crevant'
        expect(norm(a).trim(), path).toBe(expected)
      }
      cleanup()
    }
  })
})

describe('required disclosures', () => {
  const text = () => textOf('/')
  it.each(Object.entries(DISCLOSURES).filter(([k]) => !['sampleData', 'concept', 'cpCreatorSpecific'].includes(k)))('shows the %s disclosure on the homepage', (_k, sentence) => {
    expect(text()).toContain(sentence)
  })
  it('says fans receive no cash rewards, close to the very first call to action', () => {
    expect(norm(section('hero'))).toContain(DISCLOSURES.noFanCash)
  })
  it('keeps revenue sharing a labelled vision, and never publishes the provisional allocation', () => {
    const t = text()
    expect(t).toContain('Later · our vision')
    expect(mentionsProvisionalAllocation(t)).toBe(false)
  })
  it('makes no misleading financial claim anywhere on the homepage (a safeguard alongside human review)', () => {
    const blocks = [...landing().querySelectorAll('h1, h2, h3, p, li, span, a, figcaption')].map((el) => norm(el).trim()).filter(Boolean)
    expect(blocks.flatMap((b) => findMisleadingClaims(b))).toEqual([])
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
    let text = norm(container)
    for (const s of APPROVED_GUARANTEE_SENTENCES) text = text.split(s).join(' ')
    cleanup()
    return text
  }
  it.each(PUBLIC_PATHS)('%s contains no banned phrases (outside the approved exceptions)', (path) => {
    const t = checkedText(path)
    for (const re of BANNED) expect(t, `matched ${re}`).not.toMatch(re)
  })
  it('no money figures appear on any public page (the founder story with its figures was retired in PR 3)', () => {
    for (const path of PUBLIC_PATHS) expect(textOf(path), path).not.toMatch(/[$£€]\s?\d/)
  })
  it('"guarantee" appears only in the approved disclaimers', () => {
    const t = norm(landing())
    const count = (t.match(/guarantee/gi) || []).length
    const approved = APPROVED_GUARANTEE_SENTENCES.reduce((n, s) => n + t.split(s).length - 1, 0)
    expect(count).toBe(approved)
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
