// The Splitpost homepage copy, in one place. Section components and tests
// both read from here, so the words on the page are exactly these.
//
// Source of truth: docs/website-brief.md (the Website Redesign Master
// Implementation Brief, approved 2026-11-18). Every string below is copied
// from it word for word; copy.test.ts checks each section line by line, in
// order. Do not rewrite, shorten or rearrange any of it without the
// founder's approval. Design and layout may change; the words may not.
//
// Seven sections, in order:
//   HERO, THE PROBLEM, THE VISION, HOW SPLITPOST WORKS,
//   THE PEOPLE BEHIND THE POSTS, A BETTER FUTURE FOR CREATORS, THE INVITATION.
//
// The pilot disclosures (PILOT_DISCLOSURES) are the founder's approved
// wording for the 60-day pilot, where fan rewards are simulated.

/** The signature brand line: the hero headline, the closing line and the footer tagline. */
export const BRAND_LINE = "Don't just post. Get your split."

/** The approved pilot disclosures, word for word (founder decision, 2026-11-18). */
export const PILOT_DISCLOSURES = {
  /** Hero, below the call to action. */
  hero: 'Invitation-only pilot for adults 18+. No guaranteed reach, views or earnings.',
  /** Section 4, beside Step 04. */
  step04:
    'During our 60-day pilot, fan rewards will be simulated. Eligible contributions may earn Connection Points, but no cash rewards will be paid to fans during the pilot. Simulated rewards are not redeemable for money.',
  /** Section 7, beside the final call to action. */
  invitation:
    'Splitpost is currently preparing an invitation-only, 60-day pilot. Joining the waitlist does not guarantee participation. Fan rewards and advertising shown during the pilot are simulations, not actual cash earnings. Future monetary rewards will depend on eligibility, available qualifying revenue, and applicable legal and financial requirements.',
  /** Footer, on every public page. */
  footer: 'An invitation-only pilot for adults 18 and older.',
} as const

export const HOMEPAGE_COPY = {
  hero: {
    headline: BRAND_LINE,
    /** The headline's two sentences, one per line on every screen. */
    headlineLines: ["Don't just post.", 'Get your split.'],
    body: [
      'You create the content. You grow the audience. But are you getting your share of the value you create?',
      "We're building a social network where creators have a new opportunity to earn—and the people who help them grow can share in the success.",
    ],
    /** Shown as "Waitlist Opens Soon" while registration is closed (waitlist/status.ts). */
    cta: 'Join the Waitlist',
  },

  problem: {
    headline: 'You make the posts. Who gets the split?',
    body: [
      'You spend hours creating content, growing your audience and keeping people engaged.',
      'Your followers grow. Your views increase. Your content helps platforms attract attention and generate revenue.',
      'But what about you?',
      "More followers don't always mean more income. And even the people who choose to follow you don't consistently see what you post.",
      "You did the work. But the system doesn't always reward it.",
    ],
    /** Visually emphasized (brief): body[2] and body[4]. */
    emphasis: ['But what about you?', "You did the work. But the system doesn't always reward it."],
    transition: 'What if the split worked differently?',
  },

  vision: {
    eyebrow: 'A DIFFERENT WAY TO POST',
    headline: 'What if the split worked differently?',
    body: [
      'Imagine a social network where growing your audience could also grow your opportunity to earn.',
      'Where the people who follow you can actually find your posts.',
      "Where the fans who help you grow aren't just spectators, but have an opportunity to share in the success they help create.",
      "That's the future we're building with Splitpost.",
    ],
    /** The visual journey named in the brief (illustration labels). */
    journey: ['POST', 'CONNECT', 'SPLIT'],
  },

  howItWorks: {
    eyebrow: 'HOW SPLITPOST WORKS',
    headline: 'Post. Connect. Grow. Split.',
    intro: "Your content deserves more than attention. Here's how we're building a different way to post.",
    steps: [
      { number: '01', title: 'Post what you love.', body: 'Create and share content that matters to you and the people who follow you.' },
      {
        number: '02',
        title: 'Connect with your people.',
        body: 'Build a community where your followers can find your posts, stay connected and keep up with what you share.',
      },
      {
        number: '03',
        title: 'Grow together.',
        body: 'Give your supporters a new reason to help you grow. When they bring new people into your community, their contributions can be recognized.',
      },
      {
        number: '04',
        title: 'Share in the success.',
        body: 'When eligible content generates advertising revenue, creators receive a share, and a portion is set aside to reward qualifying fan contributions.',
      },
    ],
    closing: "Because success is better when it's shared.",
  },

  people: {
    eyebrow: 'THE PEOPLE BEHIND THE POSTS',
    headline: 'You keep posting. They keep earning. But what about you?',
    body: [
      'You spend hours creating content.',
      'You show up, even when nobody is watching.',
      'You keep posting, hoping that one day, all your hard work will pay off.',
      'And slowly, people start noticing.',
      'Your views grow. Your followers increase. The platforms benefit from the attention your content brings.',
    ],
    emphasis: "But you're still struggling to make a living doing what you love.",
    pains: [
      { title: "You can't depend on your income.", body: "One month you earn something. The next, you don't know what to expect." },
      { title: "You can't afford to do it full-time.", body: 'You love creating, but you still need another job to pay the bills.' },
      { title: "You can't plan for the future.", body: "How do you build a business when you don't know what you'll earn next month?" },
    ],
    fanTransition: "And you're not the only one being left out.",
    fans: [
      'Your fans believe in you.',
      'They share your posts. Tell their friends about you. Help new people discover your content.',
      'They help you grow, but most of the time, all they get is a thank you.',
    ],
    closing: "If we all help create the value, why shouldn't we share in the success?",
  },

  future: {
    eyebrow: 'A BETTER FUTURE FOR CREATORS',
    headline: 'What if your next post could help build your future?',
    body: [
      "Imagine waking up knowing that creating content isn't just something you love. It's something you can build a life around.",
      "A future where you have more opportunities to earn from your work, more time to focus on what you love, and more confidence to plan what's next.",
    ],
    closing: 'Not just more followers. More freedom to build the life you want.',
  },

  invitation: {
    eyebrow: "BE PART OF WHAT'S NEXT",
    headline: "You've made enough posts for someone else's success.",
    secondaryHeadline: "It's time to build your own.",
    body: [
      "You've put in the work. You've built the audience. You've kept creating, even when the rewards didn't come.",
      "We're building Splitpost for creators like you—and for the people who believe in what you create.",
      'Join us as we build a social network where the people creating the value have an opportunity to share in the success.',
    ],
    cta: 'Join the Waitlist',
    brandLine: BRAND_LINE,
  },
} as const

/** The header and footer links into the homepage (navigation labels, not section copy). */
export const SITE_NAV = {
  discover: 'Discover Splitpost',
  why: 'Why Splitpost',
  how: 'How It Works',
} as const

export type SectionKey = 'hero' | 'problem' | 'vision' | 'howItWorks' | 'people' | 'future' | 'invitation'

/** The section's approved lines, in the brief's order (labels excluded), for the word-for-word check. */
export function briefLines(key: SectionKey): string[] {
  const c = HOMEPAGE_COPY
  switch (key) {
    case 'hero':
      return [c.hero.headline, ...c.hero.body, c.hero.cta]
    case 'problem':
      return [c.problem.headline, ...c.problem.body, c.problem.transition]
    case 'vision':
      return [c.vision.eyebrow, c.vision.headline, ...c.vision.body]
    case 'howItWorks':
      return [c.howItWorks.eyebrow, c.howItWorks.headline, c.howItWorks.intro, ...c.howItWorks.steps.flatMap((s) => [s.title, s.body]), c.howItWorks.closing]
    case 'people':
      return [
        c.people.eyebrow,
        c.people.headline,
        ...c.people.body,
        c.people.emphasis,
        ...c.people.pains.flatMap((p) => [p.title, p.body]),
        c.people.fanTransition,
        ...c.people.fans,
        c.people.closing,
      ]
    case 'future':
      return [c.future.eyebrow, c.future.headline, ...c.future.body, c.future.closing]
    case 'invitation':
      return [c.invitation.eyebrow, c.invitation.headline, c.invitation.secondaryHeadline, ...c.invitation.body, c.invitation.cta, c.invitation.brandLine]
  }
}

/** Every visitor-facing string in the homepage copy and the pilot disclosures, for the claim checks. */
export function allHomepageText(copy: unknown = [HOMEPAGE_COPY, PILOT_DISCLOSURES]): string[] {
  if (typeof copy === 'string') return [copy]
  if (Array.isArray(copy)) return copy.flatMap((c) => allHomepageText(c))
  if (copy && typeof copy === 'object') return Object.values(copy).flatMap((v) => allHomepageText(v))
  return []
}
