// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { PublicRoutes } from './PublicApp'
import { HERO_POST } from './landing/photos'
import { FOUNDER_LOCKED_EXCEPTIONS, HOMEPAGE_COPY, withoutLockedExceptions } from './landing/copy'
import { DISCLOSURES, findMisleadingClaims, mentionsProvisionalAllocation } from './landing/claims'
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
const SECTION_ORDER = ['hero', 'why', 'who', 'what', 'how', 'account', 'pilot', 'invitation']
const HEADINGS = [
  "Don't just post. Get your split.",
  'You do the work. Who gets the reward?',
  'Built for people like you.',
  'Imagine a better kind of social media.',
  'A better split starts with a better connection.',
  "You don't have to choose a side.",
  'Help shape the future of Splitpost.',
  "Let's build a better kind of social media.",
]
// The only allowed uses of "guarantee": these exact disclaimers.
const APPROVED_GUARANTEE_SENTENCES = [
  DISCLOSURES.invitationOnly,
  DISCLOSURES.noGuarantee,
  // SP-BRAND-002 disclosures, the founder's wording.
  'Earnings are not guaranteed.',
  'Future earnings are not guaranteed.',
  'No cash is paid during the pilot, and future earnings are not guaranteed.',
  // The founder-approved wording on /join, unchanged.
  "Joining the waitlist doesn't guarantee an invitation to the pilot.",
  'Participation does not guarantee earnings or rewards.',
]
// Founder-approved problem lines that use a word the copy rules otherwise ban, exact sentence only.
// SP-BRAND-003 (Nov 27): the HOW Discover problem. It says discovery isn't guaranteed; it promises nothing.
const APPROVED_PROBLEM_SENTENCES: string[] = ["Creating valuable content doesn't guarantee that the people who need it will ever discover it."]
/** Every block of visible text in an element, for the claims checker. */
const blocks = (el: Element) => [...el.querySelectorAll('h1, h2, h3, p, li, span, a, figcaption')].map((e) => norm(e).trim()).filter(Boolean)

describe('one Splitpost story, top to bottom (SP-BRAND-002)', () => {
  it('has the eight sections, in order', () => {
    expect([...landing().querySelectorAll('main section[id]')].map((s) => s.id)).toEqual(SECTION_ORDER)
  })
  it('uses the approved headlines, with exactly one main heading', () => {
    const c = landing()
    expect(c.querySelectorAll('h1')).toHaveLength(1)
    SECTION_ORDER.forEach((id, i) => expect(norm(c.querySelector(`#${id} ${i === 0 ? 'h1' : 'h2'}`))).toBe(HEADINGS[i]))
  })
  it('leaves nothing of Crevant or the retired sections on the page', () => {
    const c = landing()
    expect(norm(c)).not.toMatch(/Crevant|the right 1,000|Founding community|SOCIAL MEDIA NEEDS A BETTER SPLIT|first 10K|Where's your split|You Create The Post|Following feed/i)
    expect(c.querySelectorAll('#problem, #building, #paths, #creators, #split, #vision, [data-status]')).toHaveLength(0)
  })
  it('shows no external research, percentages or statistics', () => {
    // The founder-locked BR-001 sentence ("billions in advertising revenue") is the only exception, by exact match.
    const t = withoutLockedExceptions(norm(landing()))
    expect(t).not.toMatch(/Goldman|Nielsen|Linktree|\bstudy\b|survey|respondents|\d+(\.\d+)?\s?%|billion|million/i)
  })
  it('joins the eight sections with the split-post seam, so they read as one story', () => {
    expect(landing().querySelectorAll('[data-testid="seam"]')).toHaveLength(7)
  })
  it('speaks to creators and supporters only: no advertiser proposition (amendment)', () => {
    const c = landing()
    // Nowhere is advertising offered to visitors.
    expect(norm(c)).not.toMatch(/for advertisers|for businesses|advertise with|advertise on|reach the right people|customers, not just clicks|run (an? )?ads?/i)
    // WHY's founder-locked sentence names platforms' advertising revenue (not a proposition); it is the only exception.
    for (const id of ['hero', 'why', 'who', 'what', 'account', 'invitation']) expect(withoutLockedExceptions(norm(c.querySelector(`#${id}`))), id).not.toMatch(/advertis/i)
    // HOW names advertising once, as the source of eligible revenue (decision 4: transparency, not a proposition).
    const how = c.querySelector('#how')!
    const lines = [...how.querySelectorAll('p')].map((p) => norm(p)).filter((t) => /advertis/i.test(t))
    expect(lines).toEqual([HOMEPAGE_COPY.how.steps[4].source])
  })
})

describe('HOOK', () => {
  const hero = () => section('hero')
  it('shows the signature line as the headline, two lines, with "Get your split." in the apricot accent', () => {
    const h1 = hero().querySelector('h1')!
    expect(norm(h1)).toBe("Don't just post. Get your split.")
    const lines = [...h1.querySelectorAll('span.block')]
    expect(lines.map((el) => norm(el))).toEqual(["Don't just post.", 'Get your split.'])
    for (const line of lines) expect(line.className).toMatch(/(^| )whitespace-nowrap( |$)/)
    expect(hero().querySelector('[data-testid="headline-emphasis"]')!.className).toContain('text-sp-accent')
  })
  it('uses the approved body and disclosure', () => {
    expect(norm(hero().querySelector('[data-testid="hero-value"]'))).toBe(HOMEPAGE_COPY.hero.body[0])
    expect(norm(hero().querySelector('[data-testid="hero-support"]'))).toBe(HOMEPAGE_COPY.hero.body[1])
    expect(norm(hero().querySelector('[data-testid="hero-small-print"]'))).toBe(
      'Invitation-only pilot for adults 18+. All pilot earnings are simulated. Earnings are not guaranteed.',
    )
  })
  it('offers Join the Waitlist first, then Discover Splitpost, and Sign in in the full app', () => {
    const actions = [...hero().querySelectorAll('[data-testid="hero-actions"] a')].map((a) => [norm(a).trim(), a.getAttribute('href')])
    expect(actions).toEqual([
      ['Waitlist Opens Soon', '/join'],
      ['Discover Splitpost', '/#why'],
    ])
    expect([...hero().querySelectorAll('a')].some((a) => a.getAttribute('href') === '/sign-in')).toBe(true)
  })
  it('pictures shared value: a sample creator post above, the community below, with no money (SP-BRAND-003)', () => {
    const scene = hero().querySelector('[data-testid="hero-scene"]')!
    expect(norm(scene)).toContain(HERO_POST.creator.name)
    expect(norm(scene.querySelector('[data-testid="hero-caption"]'))).toBe('Created by one. Grown by many.')
    expect(norm(scene)).toContain('Sample')
    expect(norm(scene)).not.toMatch(/[$£€%]|earn|cash|payout/i)
  })
  it('draws the post as the logo: a photo post above, followers engaging with it below, cut on the diagonal, no statistics (SP-BRAND-003, Nov 28)', () => {
    const scene = hero().querySelector('[data-testid="hero-scene"]')!
    const creator = scene.querySelector('[data-testid="split-creator-piece"]')!
    const community = scene.querySelector('[data-testid="split-community-piece"]')!
    expect(creator.querySelector(`img[data-photo="${HERO_POST.media.id}"]`)).not.toBeNull()
    expect(community.querySelectorAll('img[data-photo]')).toHaveLength(HERO_POST.community.length)
    // The lower half shows engagement with that post: comments (drawn, no words), a like, a save, a share and a follow.
    expect(norm(community)).toBe('LikeSaveShareFollow')
    expect(community.querySelectorAll('.lucide-message-circle').length).toBeGreaterThanOrEqual(2)
    for (const icon of ['heart', 'bookmark', 'share-2', 'user-plus']) expect(community.querySelector(`.lucide-${icon}`), icon).not.toBeNull()
    // The cut is diagonal (the logo), never a rectangle or a horizontal divider.
    const clips = [...scene.querySelectorAll<HTMLElement>('[style*="clip-path"]')].map((el) => el.style.clipPath)
    expect(clips).toHaveLength(2)
    for (const c of clips) expect(c).toMatch(/polygon\(/)
    expect(scene.querySelector('[data-testid="gold-seam"] line')!.getAttribute('y1')).not.toBe(scene.querySelector('[data-testid="gold-seam"] line')!.getAttribute('y2'))
    // Only the name, role, sample tag, short title and plain interface labels carry words; no counts, nothing about money.
    const visible = norm(scene.querySelector('[aria-hidden="true"]'))
    const words = [HERO_POST.creator.name, HERO_POST.creator.role, 'Sample', HERO_POST.title, 'Like', 'Save', 'Share', 'Follow']
    expect(words.reduce((v, w) => v.replace(w, ''), visible).trim()).toBe('')
    expect(visible.replace(HERO_POST.title, '')).not.toMatch(/\d/)
    // A distinct photo: never the WHY section's.
    expect(scene.querySelector('img[data-photo="creator-editing"]')).toBeNull()
  })
  it('captions the picture once with the signature line, and says the people are illustrative (SP-BRAND-003)', () => {
    const page = norm(landing())
    expect(page.split('Created by one. Grown by many.').length - 1).toBe(1)
    expect(norm(hero().querySelector('[data-testid="hero-illustrative"]'))).toBe(
      'Illustrative sample: a fictional creator and stock photos of models, not Splitpost members.',
    )
    // The caption is visible text, not only for screen readers, and the drawing itself repeats none of it.
    expect(hero().querySelector('[data-testid="hero-caption"]')!.closest('.sr-only')).toBeNull()
    expect(norm(hero().querySelector('[data-testid="hero-scene"] [aria-hidden="true"]'))).not.toMatch(/grown|created by/i)
  })
  it('puts the value proposition after the headline, then the picture, the supporting message, the actions and the disclosure (SP-BRAND-003)', () => {
    const order = [
      ...hero().querySelectorAll(
        'h1, [data-testid="hero-value"], [data-testid="hero-scene"], [data-testid="hero-support"], [data-testid="hero-actions"], [data-testid="hero-small-print"]',
      ),
    ].map((el) => el.getAttribute('data-testid') ?? el.tagName)
    expect(order).toEqual(['H1', 'hero-value', 'hero-scene', 'hero-support', 'hero-actions', 'hero-small-print'])
  })
})

describe('WHY', () => {
  const sec = () => section('why')
  it('shows the founder-approved wording verbatim, one paragraph each, with nothing added (BR-001)', () => {
    expect(norm(sec().querySelector('h2'))).toBe('You do the work. Who gets the reward?')
    expect([...sec().querySelectorAll('[data-testid="why-copy"] p')].map((p) => norm(p))).toEqual([
      'You create the content. Your followers watch, like, comment, save and share it. Together, you generate the attention that platforms turn into billions in advertising revenue.',
      'Yet the platforms decide who sees your content, how much you earn and whether you earn anything at all.',
      'They have built predictable businesses from your creativity, while you are left trying to build a business on unpredictable algorithms.',
      'Your followers help you grow, but rarely share in the financial value they help create.',
      'Everyone contributes. Not everyone gets a split.',
      "We believe it's time to change that.",
    ])
    // The text column holds only the heading and those paragraphs (the picture's sample dashboard is decorative).
    const column = sec().querySelector('h2')!.parentElement!
    expect(norm(column)).toBe(norm(sec().querySelector('h2')) + norm(sec().querySelector('[data-testid="why-copy"]')))
  })
  it('gives "Everyone contributes. Not everyone gets a split." more visual weight than the paragraphs around it (BR-001)', () => {
    const emphasis = sec().querySelector('[data-testid="why-emphasis"]')!
    expect(norm(emphasis)).toBe('Everyone contributes. Not everyone gets a split.')
    expect(emphasis.tagName).toBe('P')
    expect(emphasis.className).toMatch(/font-black/)
    expect(emphasis.className).toMatch(/text-\[clamp\(/)
  })
  it('shows a creator at work and a sample dashboard with no figures, and names no company', () => {
    const v = sec().querySelector('[data-testid="why-visual"]')!
    expect(v.querySelector('img[data-photo="creator-editing"]')).toBeTruthy()
    expect(norm(v)).toMatch(/Sample/)
    expect(norm(v)).not.toMatch(/\d/)
    expect(norm(sec())).not.toMatch(/facebook|instagram|tiktok|youtube|meta\b|twitter|\bx\.com/i)
  })
})

describe('WHO', () => {
  const sec = () => section('who')
  it('shows creators and supporters, each with a licensed photo and the approved words', () => {
    for (const [i, id] of ['creators', 'supporters'].entries()) {
      const card = sec().querySelector(`[data-testid="who-${id}"]`)!
      const g = HOMEPAGE_COPY.who.groups[i]
      expect(norm(card.querySelector('h3'))).toBe(g.title)
      expect([...card.querySelectorAll('p')].map((p) => norm(p))).toEqual([g.tag, ...g.body])
    }
    expect([...sec().querySelectorAll('img[data-photo]')].map((i) => i.getAttribute('data-photo'))).toEqual(['teacher-recording', 'supporter-phone'])
    expect(sec().querySelectorAll('article')).toHaveLength(2)
  })
})

describe('WHAT', () => {
  const sec = () => section('what')
  it('uses the approved vision, three commitments, and says it is a long-term vision, not income in the pilot', () => {
    const c = HOMEPAGE_COPY.what
    expect([...sec().querySelectorAll('[data-testid="what-copy"] p')].map((p) => norm(p).trim())).toEqual([...c.body, ...c.closing])
    expect([...sec().querySelectorAll('[data-testid="what-commitments"] li')].map((li) => norm(li))).toEqual(c.commitments.map((x) => `${x.title}${x.line}`))
    expect(norm(sec().querySelector('[data-testid="what-disclosure"]'))).toBe('This is our long-term vision, not a promise of income during the pilot.')
    expect(sec().querySelector('img[data-photo="community-table"]')).toBeTruthy()
  })
})

describe('HOW (the product demonstration)', () => {
  const sec = () => section('how')
  it('walks through five steps, each with a different screen from the app, labelled as sample data', () => {
    const steps = HOMEPAGE_COPY.how.steps
    for (const s of steps) {
      const li = sec().querySelector(`[data-testid="how-${s.id}"]`)!
      expect(norm(li.querySelector('h3'))).toBe(s.title)
      const img = li.querySelector('img')!
      expect(img.getAttribute('src')).toBe(s.screen)
      expect(img.getAttribute('alt')).toBe(s.alt)
      expect(img.getAttribute('loading')).toBe('lazy')
      expect(norm(li.querySelector('[data-testid="screen-label"]'))).toBe(HOMEPAGE_COPY.how.screenLabel)
    }
    expect(new Set([...sec().querySelectorAll('img')].map((i) => i.getAttribute('src'))).size).toBe(5)
  })
  it('opens each step with its hook, then a recognizable problem, then how Splitpost answers it (SP-BRAND-003)', () => {
    for (const s of HOMEPAGE_COPY.how.steps) {
      const li = sec().querySelector(`[data-testid="how-${s.id}"]`)!
      const order = [...li.querySelectorAll(`h3, [data-testid="how-${s.id}-problem"], [data-testid="how-${s.id}-solution"], img`)].map(
        (el) => el.getAttribute('data-testid') ?? el.tagName,
      )
      expect(order, s.id).toEqual(['H3', `how-${s.id}-problem`, `how-${s.id}-solution`, 'IMG'])
      expect(norm(li.querySelector(`[data-testid="how-${s.id}-problem"]`))).toBe(s.problem)
    }
  })
  it("uses the founder's approved problem lines, word for word (SP-BRAND-003)", () => {
    expect(HOMEPAGE_COPY.how.problemStatus).toBe('final')
    expect(HOMEPAGE_COPY.how.steps.map((s) => s.problem)).toEqual([
      "Creating valuable content doesn't guarantee that the people who need it will ever discover it.",
      "You've built an audience, yet you still have to compete for the attention of people who already chose to follow you.",
      'You invest your time, knowledge and creativity into content, but turning that effort into a sustainable income remains unpredictable.',
      'You help your favourite creators grow by engaging with their content, sharing it and introducing them to others, yet your contributions often go unrecognized.',
      'Creators and their communities work together to make content successful, but the opportunity to benefit financially is rarely shared between them.',
    ])
  })
  it('says beside Contribute that Connection Points are not money, and beside Earn that every amount is simulated', () => {
    expect(norm(sec().querySelector('[data-testid="how-contribute-note"]'))).toBe('Connection Points recognize your contributions. They are not money and have no cash value.')
    expect(norm(sec().querySelector('[data-testid="how-earn-source"]'))).toBe(
      'Splitpost is designed to share future eligible revenue from advertising shown with content with the creators and qualifying supporters who help that content succeed.',
    )
    expect(norm(sec().querySelector('[data-testid="how-earn-note"]'))).toBe(
      'All pilot earnings are simulated. No cash is paid during the pilot. Eligibility, verification and qualification review requirements apply. Future earnings are not guaranteed.',
    )
  })
  it('shows no retired feed tabs and no video publishing', () => {
    expect(norm(sec())).not.toMatch(/Following tab|My Clique tab|\bvideo\b/i)
  })
})

describe('ONE ACCOUNT', () => {
  it('uses the amended copy, with no separate sign up or business proposition', () => {
    const s = section('account')
    expect([...s.querySelectorAll('[data-testid="account-lines"] li')].map((li) => norm(li))).toEqual([...HOMEPAGE_COPY.account.lines])
    expect(norm(s.querySelector('[data-testid="account-closing"]'))).toBe('One account. Every opportunity.')
    expect(s.querySelectorAll('a')).toHaveLength(0)
  })
})

describe('THE PILOT (the one disclosure band)', () => {
  const sec = () => section('pilot')
  it('lists every pilot limit in one place, always visible, just before the invitation', () => {
    const band = sec()
    const d = band.querySelector('[data-testid="pilot-details"]')!
    expect(d.closest('details')).toBeNull()
    expect([...d.querySelectorAll('li')].map((li) => norm(li).trim())).toEqual([...HOMEPAGE_COPY.pilot.details])
    const t = norm(d)
    expect(t).toContain('adults aged 18 and over')
    expect(t).toContain('Connection Points are not money')
    expect(t).toContain('All pilot earnings and financial rewards are simulated.')
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
  it('uses the amended copy and disclosure, and keeps the one sign up', () => {
    expect([...inv().querySelectorAll('[data-testid="invitation-body"] p')].map((p) => norm(p))).toEqual([...HOMEPAGE_COPY.invitation.body])
    expect(norm(inv().querySelector('[data-testid="invitation-belief"]'))).toBe('Everyone deserves a split.')
    expect(norm(inv().querySelector('[data-testid="invitation-close"]'))).toBe('Be part of the beginning.')
    expect(norm(inv().querySelector('[data-testid="invitation-disclosure"]'))).toBe(HOMEPAGE_COPY.invitation.disclosure)
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
    // The hero's picture reuses the creator photo as Priya's sample post (decorative, loaded eagerly): checked in HOOK.
    const imgs = [...landing().querySelectorAll('img[data-photo]')].filter((i) => !i.closest('[data-testid="hero-scene"]'))
    expect(imgs.map((i) => i.getAttribute('data-photo')).filter((id) => id !== 'priya-avatar')).toEqual([
      'creator-editing',
      'teacher-recording',
      'supporter-phone',
      'community-table',
    ])
    for (const i of imgs.filter((i) => i.getAttribute('data-photo') !== 'priya-avatar')) {
      expect(i.getAttribute('srcset')).toMatch(/\.webp \d+w, .+\.webp \d+w/)
      expect(i.getAttribute('sizes')).toBeTruthy()
      expect(i.getAttribute('loading')).toBe('lazy')
      expect(i.getAttribute('alt')!.length).toBeGreaterThan(30)
    }
    expect(landing().querySelectorAll('[data-testid="photo-slot"]')).toHaveLength(0)
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
    // Only the founder-locked sentence (copy.ts, FOUNDER_LOCKED_EXCEPTIONS) is excepted, by exact match.
    expect(b.flatMap((x) => findMisleadingClaims(withoutLockedExceptions(x)))).toEqual([])
    expect(b.flatMap((x) => findMisleadingClaims(x)).map((f) => f.sentence)).toEqual([FOUNDER_LOCKED_EXCEPTIONS[0].sentence])
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
        [...header.querySelectorAll('a')].some((a) => norm(a).trim() === 'Discover Splitpost' && a.getAttribute('href') === '/#why'),
        path,
      ).toBe(true)
      const join = [...header.querySelectorAll('a')].find((a) => a.getAttribute('aria-label') === 'Waitlist Opens Soon')!
      expect(join.getAttribute('href'), path).toBe('/join')
      expect(join.closest('.hidden'), path).toBeNull()
      // Wide screens also link to the homepage's product walkthrough.
      expect(
        [...header.querySelectorAll('a')].some((a) => norm(a).trim() === 'How it works' && a.getAttribute('href') === '/#how'),
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
      ['Why Splitpost', '/#why'],
      ['How It Works', '/#how'],
      ['The Pilot', '/#pilot'],
      ['Waitlist Opens Soon', '/join'],
      ['Sign In', '/sign-in'],
    ])
  })
  it('sends every "Discover Splitpost" link to the homepage introduction, and nothing on a public page to the old sample tour', () => {
    const c = landing()
    const discover = [...c.querySelectorAll('a')].filter((a) => norm(a).trim() === 'Discover Splitpost')
    expect(discover.length).toBeGreaterThanOrEqual(2)
    for (const a of discover) expect(a.getAttribute('href')).toBe('/#why')
    expect(c.querySelector('#why')).toBeTruthy()
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
    const approved = [...APPROVED_GUARANTEE_SENTENCES, ...APPROVED_PROBLEM_SENTENCES].reduce((n, s) => n + t.split(s).length - 1, 0)
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
      expect(hrefs).toContain('/#why')
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
