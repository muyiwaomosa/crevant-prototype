// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { PublicRoutes } from './PublicApp'
import { HOMEPAGE_COPY } from './landing/copy'
import { DISCLOSURES, findMisleadingClaims, mentionsProvisionalAllocation, PROVISIONAL_CP_RULES, PROVISIONAL_LABEL } from './landing/claims'
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
const SECTION_ORDER = ['hero', 'problem', 'building', 'paths', 'creators', 'split', 'vision', 'pilot', 'invitation']
const HEADINGS = [
  'You Create The Post. You Deserve a Split.',
  'You Do the Work. Who Gets the Reward?',
  'A Better Split Starts With a Better Connection.',
  'One Account. Every Way to Take Part.',
  'Different Creators. The Same Problem.',
  'More Connection. More Ways to Earn.',
  'What If Creating Content Could Be a Real Career?',
  'What the Pilot Is, Plainly.',
  'Help Us Build a Better Split.',
]
// The only allowed uses of "guarantee": these exact disclaimers.
const APPROVED_GUARANTEE_SENTENCES = [
  DISCLOSURES.invitationOnly,
  DISCLOSURES.noGuarantee,
  // The founder-approved wording on /join, unchanged.
  "Joining the waitlist doesn't guarantee an invitation to the pilot.",
  'Participation does not guarantee earnings or rewards.',
]
// The hero's plain statement of today's problem, approved by the founder. It
// describes what happens on other platforms; it is not a promise.
const APPROVED_PROBLEM_SENTENCES = [
  // THE PROBLEM, describing how platforms work today, not a promise.
  'Platforms earn money when people spend time watching.',
  // A BETTER SPLIT: the founder's wording, saying a post should NOT need to go viral.
  'Imagine being a creator and knowing your followers have a place to find your latest work, without needing every post to go viral.',
]
/** Every block of visible text in an element, for the claims checker. */
const blocks = (el: Element) => [...el.querySelectorAll('h1, h2, h3, p, li, span, a, figcaption')].map((e) => norm(e).trim()).filter(Boolean)

describe('one Splitpost story, top to bottom', () => {
  it('has the nine sections, in order', () => {
    expect([...landing().querySelectorAll('main section[id]')].map((s) => s.id)).toEqual(SECTION_ORDER)
  })
  it('uses the approved headlines, with exactly one main heading', () => {
    const c = landing()
    expect(c.querySelectorAll('h1')).toHaveLength(1)
    SECTION_ORDER.forEach((id, i) => expect(norm(c.querySelector(`#${id} ${i === 0 ? 'h1' : 'h2'}`))).toBe(HEADINGS[i]))
  })
  it('leaves nothing of Crevant or the retired sections on the page', () => {
    const c = landing()
    expect(norm(c)).not.toMatch(/Crevant|the right 1,000|Founding community|SOCIAL MEDIA NEEDS A BETTER SPLIT|first 10K|Where's your split/i)
    expect(c.querySelectorAll('#why, #who, #what, #how, #alternative, #connection, [data-screenshot], [data-status]')).toHaveLength(0)
  })
  it('shows no external research or statistics', () => {
    const t = norm(landing())
    expect(t).not.toMatch(/Goldman|Nielsen|Linktree|\bstudy\b|survey|respondents|\d+(\.\d+)?\s?%|billion/i)
    expect(landing().querySelectorAll('[data-research]')).toHaveLength(0)
  })
  it('joins the nine sections with the split-post seam, so they read as one story', () => {
    expect(landing().querySelectorAll('[data-testid="seam"]')).toHaveLength(8)
  })
  it('labels every sample post and screen as a sample', () => {
    const c = landing()
    expect(norm(c)).toContain(HOMEPAGE_COPY.peopleNote)
    for (const label of c.querySelectorAll('[data-testid="mockup-label"]')) expect(norm(label)).toBe(`${DISCLOSURES.concept} · ${DISCLOSURES.sampleData}`)
  })
  it('leads with the creator: Connection Points appear only in A BETTER SPLIT and the pilot details', () => {
    const c = landing()
    for (const id of ['hero', 'problem', 'building', 'paths', 'creators', 'vision', 'invitation'])
      expect(norm(c.querySelector(`#${id}`)), id).not.toMatch(/Connection Points/)
    expect(norm(section('split'))).toMatch(/Connection Points/)
  })
})

describe('HERO', () => {
  const hero = () => section('hero')
  it('shows the approved headline exactly, as two lines, with "You Deserve a Split." in the apricot accent', () => {
    const h1 = hero().querySelector('h1')!
    expect(norm(h1)).toBe('You Create The Post. You Deserve a Split.')
    const lines = [...h1.querySelectorAll('span.block')]
    expect(lines.map((el) => norm(el))).toEqual(['You Create The Post.', 'You Deserve a Split.'])
    // Each sentence is kept whole on one line on phones and tablets.
    for (const line of lines) expect(line.className).toMatch(/(^| )whitespace-nowrap( |$)/)
    expect(hero().querySelector('[data-testid="headline-emphasis"]')!.className).toContain('text-sp-accent')
  })
  it('shows the approved signature line right under the headline, with the logo mark', () => {
    const h = hero()
    const h1 = h.querySelector('h1')!
    const sig = h.querySelector('[data-testid="hero-signature"]')!
    expect(norm(sig).trim()).toBe("Don't just post. Get your split.")
    expect(h1.nextElementSibling).toBe(sig)
    const logo = sig.querySelector('img[data-testid="splitpost-logo"]')!
    expect(logo.getAttribute('alt')).toBe('')
  })
  it('uses the approved supporting copy, and says beside it that nothing is guaranteed', () => {
    expect([...hero().querySelectorAll('[data-testid="hero-body"] p')].map((p) => norm(p))).toEqual([
      "You put in the work. You grow your followers. But the money doesn't always follow.",
      "We're building a social platform where your content can help you earn, and your followers can become a real community.",
    ])
    expect(norm(hero().querySelector('[data-testid="hero-small-print"]'))).toBe(`Invitation-only pilot. ${DISCLOSURES.noGuarantee} ${DISCLOSURES.noFanCash}`)
  })
  it('offers Join the Waitlist first, and Sign in in the full app', () => {
    const actions = [...hero().querySelectorAll('[data-testid="hero-actions"] a')].map((a) => [norm(a).trim(), a.getAttribute('href')])
    expect(actions[0]).toEqual(['Waitlist Opens Soon', '/join'])
    expect([...hero().querySelectorAll('a')].some((a) => a.getAttribute('href') === '/sign-in')).toBe(true)
  })
  it('pictures one post in two separate pieces, with the accent only in the gap between them', () => {
    const scene = hero().querySelector('[data-testid="hero-scene"]')!
    expect(norm(scene)).toContain('Created by Priya')
    expect(norm(scene)).toContain('Grown by her community')
    expect(norm(scene)).toContain('Sample')
    const creator = scene.querySelector('[data-testid="split-creator-piece"]')!
    const community = scene.querySelector('[data-testid="split-community-piece"]')!
    const seam = scene.querySelector('[data-testid="gold-seam"]')!
    // The accent line sits behind the pieces (never inside either piece) and is drawn under them.
    expect(creator.contains(seam) || community.contains(seam)).toBe(false)
    expect(seam.getAttribute('class')).toContain('-z-10')
    // The only image is the sample creator's small profile photo, decorative, in the creator piece and its tag.
    const imgs = [...scene.querySelectorAll('img')]
    expect(new Set(imgs.map((i) => i.getAttribute('data-photo')))).toEqual(new Set(['priya-avatar']))
    for (const i of imgs) expect(i.getAttribute('alt')).toBe('')
    expect(norm(scene.querySelector('figcaption'))).toMatch(/two separate pieces with a gap/)
    expect(norm(scene.querySelector('figcaption'))).toContain('Priya is a fictional sample creator; her profile photo is a stock image of a model')
    expect(norm(scene)).not.toMatch(/[$£€%]|earn|cash|payout/i)
  })
  it("shows Priya's post about unpredictable reach, labelled SAMPLE, and keeps the community piece's figures", () => {
    const scene = hero().querySelector('[data-testid="hero-scene"]')!
    const creator = scene.querySelector('[data-testid="split-creator-piece"]')!
    expect(norm(creator)).toContain('Priya Raman')
    expect(norm(creator)).toContain('Content creator · 2h')
    expect(norm(creator)).toContain('Sample')
    expect([...creator.querySelectorAll('[data-testid="hero-post-text"] p')].map((p) => norm(p))).toEqual([
      'I have 10,000 followers. So why do only a few hundred people see my posts?',
      'I spend hours creating content, but I never know if the people who followed me will even see it. One post reaches thousands. The next barely reaches anyone.',
    ])
    expect(norm(creator)).not.toMatch(/calf drill|shin splints/i)
    const community = norm(scene.querySelector('[data-testid="split-community-piece"]'))
    for (const t of ['1.2K', '86', '214', 'Grown by her community']) expect(community).toContain(t)
    expect(norm(scene.querySelector('[data-testid="hero-community-comment"]'))).toBe(
      "Ana Oh wow, I was wondering why I hadn't been seeing your content. I thought you stopped posting!",
    )
  })
  it('puts the picture straight after the headline, before the copy and actions', () => {
    const order = [
      ...hero().querySelectorAll('h1, [data-testid="hero-scene"], [data-testid="hero-body"], [data-testid="hero-actions"], [data-testid="hero-small-print"]'),
    ].map((el) => el.getAttribute('data-testid') ?? el.tagName)
    expect(order).toEqual(['H1', 'hero-scene', 'hero-body', 'hero-actions', 'hero-small-print'])
  })
})

describe('THE PROBLEM', () => {
  const sec = () => section('problem')
  it('uses the approved copy, in order', () => {
    const c = HOMEPAGE_COPY.problem
    expect([...sec().querySelectorAll('[data-testid="problem-copy"] p')].map((p) => norm(p))).toEqual([...c.body, c.turn, ...c.body2, c.closing])
  })
  it('says many creators earn little, never that every platform keeps everything', () => {
    expect(norm(sec())).toContain('But many creators who help build those platforms earn little or nothing.')
    expect(norm(sec())).not.toMatch(/keep(s)? (all|every)|all (the|of the) (money|revenue)/i)
  })
  it('shows a sample creator dashboard with no figures', () => {
    const v = sec().querySelector('[data-testid="problem-visual"]')!
    expect(norm(v)).toMatch(/Sample/)
    expect(norm(v)).not.toMatch(/\d/)
  })
})

describe("WHAT WE'RE BUILDING", () => {
  const sec = () => section('building')
  it('uses the approved questions and answer', () => {
    expect([...sec().querySelectorAll('[data-testid="building-questions"] li')].map((li) => norm(li))).toEqual([...HOMEPAGE_COPY.building.questions])
    expect(norm(sec())).toContain("That's what we're building at Splitpost.")
  })
  it('shows the founder’s goal statement verbatim', () => {
    const goal = sec().querySelector('[data-testid="building-goal-text"]')!
    expect(goal.textContent).toBe('we want to create a platform that generates sustainable pay for content creators who have something valuable to say')
    expect(goal.closest('blockquote')).toBeTruthy()
  })
  it('tells two benefits with labelled concept illustrations: followers can find your posts, and understand your community', () => {
    const cards = [...sec().querySelectorAll('[data-testid="building-illustrations"] > figure')]
    expect(cards.map((f) => norm(f.querySelector('h3')))).toEqual(['Your followers can find your posts.', "Understand the community you're building."])
    for (const f of cards) {
      expect(norm(f.querySelector('[data-testid="concept-tag"]'))).toBe('Concept illustration · Sample data')
      expect(f.querySelector('[data-testid="mockup-label"]')).toBeTruthy()
      expect(f.querySelectorAll('[data-testid="callouts"] > li')).toHaveLength(3)
    }
    expect(norm(sec().querySelector('[data-testid="building-note"]'))).toBe(`${DISCLOSURES.stillTesting} ${DISCLOSURES.noGuarantee}`)
    expect(norm(sec())).toContain('Who looks is still up to your followers.')
    expect(norm(sec())).not.toMatch(/every follower (will )?see|see every post/i)
  })
  it('shows no views, likes or earnings figures in the community illustration', () => {
    const t = norm(sec().querySelector('[data-testid="illustration-community"]'))
    expect(t).not.toMatch(/\bviews?\b|\blikes?\b|\$|€|£|\bearn/i)
  })
})

describe("WHO WE'RE BUILDING FOR", () => {
  const sec = () => section('creators')
  it('shows the three approved creator groups, each with a licensed photo of a creator at work', () => {
    const groups = [...sec().querySelectorAll('[data-testid="creator-groups"] > li')]
    expect(groups.map((g) => norm(g.querySelector('h3')))).toEqual(HOMEPAGE_COPY.creators.groups.map((g) => g.title))
    expect(groups.map((g) => g.querySelector('img[data-photo]')?.getAttribute('data-photo'))).toEqual(['creator-editing', 'teacher-recording', 'metalworker'])
  })
})

describe('FIND YOUR PATH', () => {
  const sec = () => section('paths')
  it('shows three short benefit cards: creators, members (fans) and advertisers', () => {
    const cards = [...sec().querySelectorAll('[data-testid="paths-cards"] > li')]
    expect(cards.map((c) => c.getAttribute('data-testid'))).toEqual(['path-creators', 'path-members', 'path-advertisers'])
    expect(cards.map((c) => norm(c.querySelector('h3')))).toEqual(HOMEPAGE_COPY.paths.cards.map((c) => c.title))
    expect(norm(sec())).toContain(HOMEPAGE_COPY.paths.note)
  })
  it('sends every card to the same one sign up, with the same call to action', () => {
    const s = sec()
    const links = [...s.querySelectorAll('a')].map((a) => [norm(a).trim(), a.getAttribute('href')])
    expect(links).toEqual([
      ['Waitlist Opens Soon', '/join'],
      ['Waitlist Opens Soon', '/join'],
      ['Waitlist Opens Soon', '/join'],
    ])
    // Each button names its card for screen readers.
    for (const a of s.querySelectorAll('a')) expect(s.querySelector(`#${a.getAttribute('aria-describedby')}`)?.tagName).toBe('H3')
  })
  it('has no separate creator application or advertiser form', () => {
    const s = sec()
    expect(norm(s)).not.toMatch(/apply as|application|talk to us|contact sales|advertiser form/i)
    expect(norm(s.querySelector('[data-testid="path-advertisers"]'))).toContain('ask to advertise from your account')
  })
})

describe('A BETTER SPLIT', () => {
  const sec = () => section('split')
  it('uses the approved copy and closing line', () => {
    expect([...sec().querySelectorAll('[data-testid="split-copy"] p')].map((p) => norm(p))).toEqual([...HOMEPAGE_COPY.betterSplit.body])
    expect(norm(sec().querySelector('[data-testid="split-closing"]'))).toBe(HOMEPAGE_COPY.betterSplit.closing)
  })
  it('shows the founder’s three pilot disclosures beside the claims', () => {
    expect([...sec().querySelectorAll('[data-testid="split-disclosures"] li')].map((li) => norm(li))).toEqual([
      'Connection Points have no cash value.',
      'Fans will not receive cash rewards during the pilot.',
      'Future revenue sharing depends on eligibility, verification and legal and financial requirements.',
    ])
  })
  it('walks through one qualified referral, using only the approved pilot rules', () => {
    const fig = sec().querySelector('[data-testid="illustration-referral"]')!
    expect(norm(fig.querySelector('h3'))).toBe('Your supporters can help you grow.')
    expect(norm(fig.querySelector('[data-testid="concept-tag"]'))).toBe('Concept illustration · Sample data')
    const steps = [...fig.querySelectorAll('[data-testid="referral-steps"] > li p:first-child')].map((p) => norm(p))
    expect(steps).toEqual([
      'Leo shares Priya’s post with a friend.',
      'Sam creates a verified account.',
      'Sam follows Priya.',
      'Leo receives Connection Points with Priya.',
    ])
    const t = norm(fig)
    expect(t).toContain('Sharing on its own earns nothing.')
    expect(t).toContain('No cash value.')
    expect(t).toContain('only once the new follow is verified')
    expect(t).toContain(PROVISIONAL_LABEL)
    expect(t).toContain(`+${PROVISIONAL_CP_RULES.find((r) => r.action === 'verified_referral')!.points}`)
    expect(t).not.toMatch(/\$|€|£|cash reward|paid|payout/i)
  })
})

describe('OUR BIGGER VISION', () => {
  const sec = () => section('vision')
  it('uses the approved copy, labelled as a long-term vision, not a promise of income', () => {
    expect([...sec().querySelectorAll('[data-testid="vision-copy"] p')].map((p) => norm(p))).toEqual([...HOMEPAGE_COPY.vision.body])
    expect(norm(sec().querySelector('[data-testid="vision-disclosure"]'))).toBe('This is our long-term vision, not a promise of income during the pilot.')
    expect(sec().querySelector('img[data-photo="filmmaker"]')).toBeTruthy()
  })
})

describe('PILOT DETAILS (the one disclosure band)', () => {
  const sec = () => section('pilot')
  it('lists every pilot limit in one place, always visible, just before the invitation', () => {
    const band = sec()
    const d = band.querySelector('[data-testid="pilot-details"]')!
    expect(d.closest('details')).toBeNull()
    expect([...d.querySelectorAll('li')].map((li) => norm(li).trim())).toEqual([...HOMEPAGE_COPY.pilot.details])
    const t = norm(d)
    expect(t).toContain('adults 18 and older')
    expect(t).toContain('Connection Points are not money.')
    expect(t).toContain('Rewards and earnings are simulated during the pilot. Nothing is paid to anyone.')
    expect(t).toContain(DISCLOSURES.noGuarantee)
    expect(band.nextElementSibling?.getAttribute('data-testid')).toBe('seam')
    expect(band.nextElementSibling?.nextElementSibling?.id).toBe('invitation')
  })
  it('is the only place on the page with the full list', () => {
    expect(landing().querySelectorAll('[data-testid="pilot-details"]')).toHaveLength(1)
  })
})

describe('THE INVITATION', () => {
  const inv = () => section('invitation')
  it('uses the approved copy, and keeps the one sign up', () => {
    expect([...inv().querySelectorAll('[data-testid="invitation-body"] p')].map((p) => norm(p))).toEqual([...HOMEPAGE_COPY.invitation.body])
    expect(norm(inv().querySelector('[data-testid="invitation-close"]'))).toBe('The waitlist opens soon. Be part of a better split.')
    const links = [...inv().querySelectorAll('a')].map((a) => [norm(a).trim(), a.getAttribute('href')])
    expect(links).toEqual([['Waitlist Opens Soon', '/join']])
  })
  it('is signed by the founder, with the founder photo', () => {
    const sign = inv().querySelector('[data-testid="founder-signoff"]')!
    expect(norm(sign).trim()).toBe('Muyiwa Omosa, Founder of Splitpost')
    expect(sign.querySelector('img')!.getAttribute('src')).toBe('/media/landing/founder.jpg')
  })
  it('has a phone-only waitlist bar that starts hidden', () => {
    const bar = landing().querySelector('[data-testid="mobile-waitlist-bar"]')!
    expect(bar.getAttribute('aria-hidden')).toBe('true')
    expect(bar.className).toContain('md:hidden')
    expect(bar.querySelector('a')!.getAttribute('href')).toBe('/join')
  })
})

describe('photos', () => {
  it('shows the four licensed photos, lazy-loaded at responsive sizes, with no placeholders left', () => {
    const imgs = [...landing().querySelectorAll('img[data-photo]')]
    expect(imgs.map((i) => i.getAttribute('data-photo')).filter((id) => id !== 'priya-avatar')).toEqual([
      'creator-editing',
      'teacher-recording',
      'metalworker',
      'filmmaker',
    ])
    for (const i of imgs.filter((i) => i.getAttribute('data-photo') !== 'priya-avatar')) {
      expect(i.getAttribute('srcset')).toMatch(/\.webp \d+w, .+\.webp \d+w/)
      expect(i.getAttribute('sizes')).toBeTruthy()
      expect(i.getAttribute('loading')).toBe('lazy')
      expect(i.getAttribute('alt')!.length).toBeGreaterThan(30)
    }
    expect(landing().querySelectorAll('[data-testid="photo-slot"]')).toHaveLength(0)
    // The page says the people pictured are models, not members.
    expect(norm(landing())).toContain(HOMEPAGE_COPY.peopleNote)
  })
  it('never presents a person as a member or a testimonial', () => {
    expect(norm(landing())).not.toMatch(/testimonial|[“”]|\b(said|says):/i)
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
      expect(
        [...header.querySelectorAll('a')].some((a) => norm(a).trim() === 'Discover Splitpost' && a.getAttribute('href') === '/#building'),
        path,
      ).toBe(true)
      const join = [...header.querySelectorAll('a')].find((a) => a.getAttribute('aria-label') === 'Waitlist Opens Soon')!
      expect(join.getAttribute('href'), path).toBe('/join')
      expect(join.closest('.hidden'), path).toBeNull()
      // Wide screens also link to the homepage's Find your path cards.
      expect(
        [...header.querySelectorAll('a')].some((a) => norm(a).trim() === 'Find your path' && a.getAttribute('href') === '/#paths'),
        path,
      ).toBe(true)
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
      ['Why Splitpost', '/#problem'],
      ['How It Works', '/#building'],
      ['Find Your Path', '/#paths'],
      ['Waitlist Opens Soon', '/join'],
      ['Sign In', '/sign-in'],
    ])
  })
  it('sends every "Discover Splitpost" link to the homepage introduction, and nothing on a public page to the old sample tour', () => {
    const c = landing()
    const discover = [...c.querySelectorAll('a')].filter((a) => norm(a).trim() === 'Discover Splitpost')
    expect(discover.length).toBeGreaterThanOrEqual(2)
    for (const a of discover) expect(a.getAttribute('href')).toBe('/#building')
    expect(c.querySelector('#building')).toBeTruthy()
    cleanup()
    for (const path of PUBLIC_PATHS) {
      const { container } = renderAt(path)
      const tour = [...container.querySelectorAll('a')].map((a) => a.getAttribute('href') ?? '').filter((h) => h === '/tour' || h.startsWith('/tour/'))
      expect(tour, path).toEqual([])
      cleanup()
    }
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
    for (const s of [...APPROVED_GUARANTEE_SENTENCES, ...APPROVED_PROBLEM_SENTENCES]) text = text.split(s).join(' ')
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
  it.each(['/join', '/join/creator', '/join/supporter'])(
    '%s shows the one waitlist, says it is not open, and links back and to how Splitpost works',
    (path) => {
      const { container } = renderAt(path)
      expect(norm(container.querySelector('h1'))).toBe('The Waitlist Opens Soon')
      expect([...container.querySelectorAll('[data-testid="join-intro"] p')].map((p) => norm(p))).toEqual(INTRO)
      expect(norm(container.querySelector('[data-testid="not-open"]'))).toContain("You can't sign up just yet.")
      expect(norm(container.querySelector('[data-testid="not-open"]'))).toContain('as soon as our privacy notice is published')
      expect(norm(container)).not.toMatch(/as a creator|as a supporter/i)
      expect(container.querySelector('form, input, textarea, select')).toBeNull()
      expect(norm(container.querySelector('[data-testid="not-open"]'))).toContain("Until then, this page doesn't collect anything.")
      const hrefs = [...container.querySelectorAll('a')].map((a) => a.getAttribute('href'))
      expect(hrefs).toContain('/#building')
      expect(hrefs).not.toContain('/tour')
      expect(hrefs).toContain('/#invitation')
      expect(norm(container)).toContain('See how Splitpost works')
    },
  )
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
