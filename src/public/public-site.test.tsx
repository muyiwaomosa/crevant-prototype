// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { PublicRoutes } from './PublicApp'
import { HOMEPAGE_COPY } from './landing/copy'
import { DISCLOSURES, findMisleadingClaims } from './landing/claims'
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
// Splitpost sections 1 to 3 (PRs 2 and 3), then the remaining older sections until PR 4.
const SECTION_ORDER = ['hero', 'problem', 'solution', 'difference', 'fans', 'how', 'founding']
// The founder-approved headings, in order. The hero is the Splitpost hero
// (PR 2); the sections after it change in PRs 3 and 4.
const HEADINGS = [
  HOMEPAGE_COPY.hero.headline,
  HOMEPAGE_COPY.problem.headline,
  HOMEPAGE_COPY.solution.headline,
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
  // The founder-approved waitlist introduction on /join.
  "Joining the waitlist doesn't guarantee an invitation to the pilot.",
]
const POINTS_DISCLAIMER = 'Connection Points are not cash and have no guaranteed monetary value. Rewards depend on what each creator offers.'
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
  it('keeps key approved passages word for word', () => {
    const t = norm(landing())
    for (const passage of [
      'When someone follows you on Crevant, your new posts appear in their chronological Following feed.',
      'Crevant is developing Connection Points, a way to recognize supporters for participating with creators they care about.',
      "It's to help you build something valuable enough to last.",
      "It's built by the people who believe in them.",
      'Your content starts the conversation.',
      'Your relationships build the future.',
      "Joining the waitlist doesn't secure a place in the pilot. We invite people in small groups and improve the experience together. Participation does not guarantee earnings or rewards.",
    ]) expect(t, passage).toContain(passage)
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
  it('shows Discover and the fan journey, with the disclaimer and status beside the claim', () => {
    const f = section('fans')
    expect(f.querySelector('figure[data-screenshot="discover"]')).not.toBeNull()
    expect(f.querySelector('[data-testid="fan-journey"]')).not.toBeNull()
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
    expect(norm(steps[1].querySelector('[data-testid="step2-concept"]'))).toContain('Concept · Planned')
    expect(steps[1].querySelectorAll('figure[data-screenshot]')).toHaveLength(0)
  })
  it('ends with Join the Waitlist', () => {
    expect([...section('how').querySelectorAll('a')].some((a) => a.getAttribute('href') === '#founding')).toBe(true)
  })
})

describe('founding community', () => {
  it('offers one waitlist, not applications or roles', () => {
    const f = section('founding')
    const links = [...f.querySelectorAll('a')].map((a) => [norm(a).trim(), a.getAttribute('href')])
    expect(links).toEqual([['Join the Waitlist', '/join']])
    expect(norm(f)).toContain("Joining the waitlist doesn't secure a place in the pilot.")
    expect(norm(f)).not.toMatch(/apply to join|join as a supporter/i)
  })
  it('offers the two approved opportunities, word for word', () => {
    const tiles = [...section('founding').querySelectorAll('[data-testid="founding-opportunities"] li')].map((li) => norm(li).trim())
    expect(tiles).toEqual([
      "Experience Crevant early.Be among the first to use Crevant while it's being built, and see what a creator-first social network feels like.",
      "Help shape its future.Test new ideas, tell us what works and what doesn't, and help decide what Crevant becomes.",
    ])
  })
  it('is signed by the founder, with the founder photo', () => {
    const sign = section('founding').querySelector('[data-testid="founder-signoff"]')!
    expect(norm(sign).trim()).toBe('Muyiwa Omosa, Founder of Crevant.')
    expect(sign.querySelector('img')!.getAttribute('src')).toBe('/media/landing/founder.jpg')
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

describe('waitlist calls to action', () => {
  it('uses "Join the Waitlist" consistently and never the old labels', () => {
    for (const path of PUBLIC_PATHS) expect(textOf(path)).not.toMatch(/Join the Founding Community|Join the Pilot|Learn About the Creator Pilot|Learn About Joining as a Supporter/)
  })
  it('places the one waitlist link after the Crevant difference and after For the fans, with no roles', () => {
    for (const id of ['difference', 'fans']) {
      const a = section(id).querySelector('[data-cta="waitlist"] a')!
      expect(norm(a).trim()).toBe('Join the Waitlist')
      expect(a.getAttribute('href')).toBe('/join')
    }
    expect(textOf('/')).not.toMatch(/as a Creator|as a Supporter/)
    for (const id of ['difference', 'fans']) expect(norm(section(id))).toContain("Joining the waitlist doesn't secure a place in the pilot.")
  })
  it('has a phone-only waitlist bar that starts hidden', () => {
    const bar = landing().querySelector('[data-testid="mobile-waitlist-bar"]')!
    expect(bar.getAttribute('aria-hidden')).toBe('true')
    expect(bar.className).toContain('md:hidden')
    expect(bar.querySelector('a')!.getAttribute('href')).toBe('#founding')
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
  it('uses genuine, described tour screenshots', () => {
    const figures = [...landing().querySelectorAll('figure[data-screenshot]')]
    // The hero's screenshot gave way to the placeholder visual (PR 2), and the
    // old problem section's feed screenshot left with that section (PR 3).
    expect(figures.length).toBe(6)
    expect(new Set(figures.map((f) => f.getAttribute('data-screenshot'))).size).toBe(6)
    for (const f of figures) {
      expect(f.querySelector('img')!.getAttribute('src')).toMatch(/^\/media\/landing\/tour-[a-z-]+\.jpg$/)
      expect(f.querySelector('img')!.getAttribute('alt')!.length).toBeGreaterThan(40)
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
    expect(hrefs).toContain('/#founding')
    expect(norm(container)).toContain('demonstration with sample data')
  })
})

describe('explanatory visuals', () => {
  it('keeps "the right 1,000" about relationships, never money', () => {
    const t = norm(section('difference').querySelector('[data-testid="right-thousand"]'))
    expect(t).toContain('The lines are relationships')
    expect(t).not.toMatch(/earn|income|money|pay|support|[$£€]|\bCP\b/i)
    expect(section('difference').querySelectorAll('[data-testid="right-thousand"] circle').length).toBeGreaterThan(950)
  })
  it('draws planned features only as labelled concepts', () => {
    expect(norm(section('difference').querySelector('[data-testid="planned-panel"]'))).toContain('Concept sketch.')
    expect(norm(section('how').querySelector('[data-testid="step2-concept"]'))).toContain('Concept · Planned')
  })
  it('adds no inline <style> blocks, which the Content Security Policy would block', () => {
    for (const path of PUBLIC_PATHS) {
      const { container } = renderAt(path)
      expect(container.querySelectorAll('style'), path).toHaveLength(0)
      cleanup()
    }
  })
  it('only calls out words the tour itself shows', () => {
    const callouts = [...landing().querySelectorAll('[data-callout]')].map((el) => norm(el).trim())
    expect(callouts).toEqual(['10 CP with Amara', 'Only CP earned with Amara counts here.'])
  })
  it("shows a fan's journey in four real tour crops", () => {
    const j = section('fans').querySelector('[data-testid="fan-journey"]')!
    const imgs = [...j.querySelectorAll('img')]
    expect(imgs.map((i) => i.getAttribute('src'))).toEqual(['follow', 'comment', 'points', 'reward'].map((n) => `/media/landing/tour-journey-${n}.jpg`))
    for (const i of imgs) expect(i.getAttribute('alt')!.length).toBeGreaterThan(40)
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
      ['Our Story', '/#story'],
      ['How It Works', '/#how'],
      ['Join the Waitlist', '/#founding'],
      ['Explore Crevant', '/tour'],
      ['Sign in', '/sign-in'],
    ])
    expect(norm(footer)).not.toMatch(/privacy|terms/i)
  })
  it('names every link to the tour "Discover Splitpost" in the header and hero, and "Explore Crevant" elsewhere until PR 5', () => {
    for (const path of PUBLIC_PATHS) {
      const { container } = renderAt(path)
      for (const a of container.querySelectorAll('a[href="/tour"]')) {
        const inNewParts = Boolean(a.closest('header, #hero'))
        expect(norm(a).trim(), path).toBe(inNewParts ? 'Discover Splitpost' : 'Explore Crevant')
      }
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
  it('no money figures appear on any public page (the founder story with its figures was retired in PR 3)', () => {
    for (const path of PUBLIC_PATHS) expect(textOf(path), path).not.toMatch(/[$£€]\s?\d/)
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
