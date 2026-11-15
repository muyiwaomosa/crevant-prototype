// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { PublicRoutes } from './PublicApp'
import { HOMEPAGE_COPY } from './landing/copy'
import { DISCLOSURES, findMisleadingClaims } from './landing/claims'
import { PLACEHOLDER_LABEL } from './landing/ui/HeroVisual'
import { citedStatements, RESEARCH } from './landing/research'
import { AI_PHOTO_LABEL, PHOTOS } from './landing/photos'

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
// Splitpost sections 1 to 3 (PRs 2 and A), then the older sections until PRs B and C.
const SECTION_ORDER = ['hero', 'why', 'who', 'difference', 'fans', 'how', 'founding']
// The founder-approved headings, in order. The hero is the Splitpost hero
// (PR 2), WHY and WHO are PR A; the sections after them change in PRs B and C.
const HEADINGS = [
  HOMEPAGE_COPY.hero.headline,
  "You helped build it. Where's your split?",
  'The creator who keeps posting. The fan who keeps sharing.',
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

describe('section 2: WHY (Splitpost)', () => {
  const why = () => section('why')
  it('keeps the exact headline, with the question set apart', () => {
    expect(norm(why().querySelector('h2'))).toBe("You helped build it. Where's your split?")
    expect(norm(why().querySelector('h2 span.text-sp-orange-text'))).toBe("Where's your split?")
  })
  it("follows Priya's sample post through four steps, in order, as an ordered list", () => {
    const steps = [...why().querySelectorAll('ol[data-testid="post-journey"] > li')]
    expect(steps.map((li) => norm(li.querySelector('h3')))).toEqual(['Priya posts.', 'Ana joins in.', 'Leo recommends it.', 'The post takes off.'])
    for (const [i, li] of steps.entries()) expect(norm(li.querySelector(':scope > p')), `step ${i + 1}`).toBe(HOMEPAGE_COPY.why.steps[i].line)
  })
  it('keeps each step drawing decorative, so the written line carries the meaning', () => {
    for (const li of why().querySelectorAll('ol[data-testid="post-journey"] > li')) {
      expect(li.querySelector('[aria-hidden="true"].rounded-2xl')).not.toBeNull()
      expect(li.querySelectorAll('img')).toHaveLength(0)
    }
  })
  it('describes the gap between contributing and benefiting accurately, not absolutely', () => {
    const gap = why().querySelector('[data-testid="contribution-gap"]')!
    expect(norm(gap.querySelector('h3'))).toBe('They all helped it grow. Not all of them had a way to benefit.')
    expect(norm(why())).not.toMatch(/Nobody shared in its success|Everyone helped it grow/)
    expect([...gap.querySelectorAll('li[data-person]')].map((li) => li.getAttribute('data-person'))).toEqual(['Priya', 'Ana', 'Leo'])
  })
  it('says Priya, Ana and Leo are sample people', () => {
    expect(norm(why().querySelector('[data-testid="why-sample-note"]'))).toBe(HOMEPAGE_COPY.why.samplePeople)
  })
  it('shows exactly the two verified research figures, each with its statement, context, linked source and date', () => {
    const figs = [...why().querySelectorAll('figure[data-research]')]
    expect(figs.map((f) => f.getAttribute('data-research'))).toEqual(['goldman-professional-creators', 'nielsen-recommendations'])
    for (const [i, f] of figs.entries()) {
      const r = RESEARCH[i]
      expect(norm(f.querySelector('[data-testid="research-statement"]'))).toBe(r.statement)
      expect(norm(f)).toContain(r.context)
      const a = f.querySelector('figcaption a')!
      expect(a.getAttribute('href')).toBe(r.source.url)
      expect(a.getAttribute('target')).toBe('_blank')
      expect(a.getAttribute('rel')).toContain('noopener')
      expect(norm(a)).toContain(`${r.source.publisher}, “${r.source.title}”, ${r.source.date}`)
      expect(norm(f.querySelector('[data-testid="research-note"]'))).toBe(r.source.note)
    }
  })
  it('cites Goldman Sachs from April 2023 with its professional-creator definition, as historical figures', () => {
    const g = why().querySelector('figure[data-research="goldman-professional-creators"]')!
    expect(norm(g)).toContain('About 4%')
    expect(norm(g)).toContain('50 million creators')
    expect(norm(g)).toContain('which Goldman Sachs defined as creators earning more than $100,000 a year')
    expect(norm(g)).toContain('April 2023')
    expect(norm(g)).toContain('Historical estimates')
  })
  it('uses Nielsen only for the value of recommendations, never for paying fans', () => {
    const n = norm(why().querySelector('figure[data-research="nielsen-recommendations"]'))
    expect(n).toContain('trust recommendations from people they know')
    expect(n).not.toMatch(/pay|paid|cash|money|reward|compensat|earn/i)
  })
  it('makes no misleading financial claim, with the cited figures as the only exception', () => {
    const blocks = [...why().querySelectorAll('h2, h3, p, li, span, figcaption')].map((el) => norm(el).trim()).filter(Boolean)
    expect(blocks.length).toBeGreaterThan(20)
    expect(blocks.flatMap((b) => findMisleadingClaims(b, { citedResearch: citedStatements() }))).toEqual([])
    // Without the exception, the checker does flag the Goldman figure: the exception is doing real work.
    expect(blocks.flatMap((b) => findMisleadingClaims(b)).map((f) => f.rule)).toContain('a currency amount')
  })
})

describe('section 3: WHO (Splitpost)', () => {
  const who = () => section('who')
  it('uses the approved headline, creator first and fan second', () => {
    expect(norm(who().querySelector('h2'))).toBe('The creator who keeps posting. The fan who keeps sharing.')
    const people = [...who().querySelectorAll('article[data-audience]')]
    expect(people.map((a) => a.getAttribute('data-audience'))).toEqual(['creator', 'fan'])
    expect(people.map((a) => norm(a.querySelector('h3')))).toEqual(['The creator', 'The fan'])
    expect(norm(people[0])).toContain('More posts. More followers. Not more income.')
    expect(norm(people[1])).toContain('You shared it. You started the conversation. Nobody noticed.')
  })
  it('names what each of them will recognise: three points each', () => {
    const [creator, fan] = who().querySelectorAll('article[data-audience]')
    expect([...creator.querySelectorAll('li')].map((li) => norm(li).trim())).toEqual(HOMEPAGE_COPY.who.creator.points)
    expect([...fan.querySelectorAll('li')].map((li) => norm(li).trim())).toEqual(HOMEPAGE_COPY.who.fan.points)
  })
  it('shows each concept photo with its AI disclosure on the image, sized responsively', () => {
    const figs = [...who().querySelectorAll('figure[data-photo]')]
    expect(figs.map((f) => f.getAttribute('data-photo'))).toEqual(['creator', 'fan'])
    for (const f of figs) {
      const p = PHOTOS[f.getAttribute('data-photo') as keyof typeof PHOTOS]
      expect(f.getAttribute('data-origin')).toBe('ai-generated')
      expect(norm(f.querySelector('figcaption'))).toBe(AI_PHOTO_LABEL)
      const img = f.querySelector('img')!
      expect(img.getAttribute('alt')).toBe(p.alt)
      expect(img.getAttribute('srcset')).toBe(p.sources.map((s) => `${s.src} ${s.width}w`).join(', '))
      expect(img.getAttribute('sizes')).toBeTruthy()
      expect(img.getAttribute('width')).toBe(String(p.width))
      expect(img.getAttribute('height')).toBe(String(p.height))
    }
  })
  it('never presents a generated person as a user or a testimonial', () => {
    const t = norm(who())
    // No quotes, no attributed words, no claim to be a real user.
    expect(t).not.toMatch(/testimonial|[“”"]|\b(said|says):|\breal (users?|members?|customers?)\b/i)
    expect(norm(who().querySelector('[data-testid="who-sample-note"]'))).toContain('They’re sample people')
  })
  it('makes no misleading financial claim (a safeguard alongside human review)', () => {
    const blocks = [...who().querySelectorAll('h2, h3, p, li, span, figcaption')].map((el) => norm(el).trim()).filter(Boolean)
    expect(blocks.flatMap((b) => findMisleadingClaims(b))).toEqual([])
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
    // old problem section's feed screenshot left with that section (PR A).
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
      ['Our Story', '/#why'],
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
  // (the only allowed "guarantee"), and the cited research statements from
  // research.ts, which may carry a figure only word for word.
  const checkedText = (path: string) => {
    const { container } = renderAt(path)
    let text = norm(container)
    for (const s of citedStatements()) text = text.split(s).join(' ')
    for (const s of APPROVED_GUARANTEE_SENTENCES) text = text.split(s).join(' ')
    cleanup()
    return text
  }
  it.each(PUBLIC_PATHS)('%s contains no banned phrases (outside the approved exceptions)', (path) => {
    const t = checkedText(path)
    for (const re of BANNED) expect(t, `matched ${re}`).not.toMatch(re)
  })
  it('money figures appear only in cited research statements, word for word, beside their source', () => {
    const c = landing()
    const hits = [...c.querySelectorAll('p, li, span, h2, h3, figcaption')].filter((el) => /[$£€]\s?\d/.test(el.textContent || '') && ![...el.children].some((ch) => /[$£€]\s?\d/.test(ch.textContent || '')))
    expect(hits.length).toBeGreaterThan(0)
    for (const el of hits) {
      expect(citedStatements(), `"${el.textContent}" is not a cited research statement`).toContain(norm(el).trim())
      expect(el.closest('figure[data-research]')?.querySelector('figcaption a[href^="https://"]'), 'sits beside its source').toBeTruthy()
    }
    for (const path of PUBLIC_PATHS.filter((p) => p !== '/')) expect(textOf(path)).not.toMatch(/[$£€]\s?\d/)
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
