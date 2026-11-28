// The Splitpost homepage copy, in one place. Section components and tests
// both read from here, so the words on the page are exactly these.
//
// SP-BRAND-002 (founder-approved Nov 27, with the marketing positioning
// amendment of the same day): one story for creators and supporters.
//   HOOK         Don't just post. Get your split.
//   WHY          You do the work. Who gets the reward? (replaced verbatim Nov 28, BR-001)
//   WHO          Built for people like you. (creators, supporters)
//   WHAT         Imagine a better kind of social media.
//   HOW          A better split starts with a better connection. (the product, step by step)
//   ONE ACCOUNT  You don't have to choose a side.
//   PILOT        Help shape the future of Splitpost. (the disclosure band)
//   INVITATION   Let's build a better kind of social media.
// The words are the founder's, verbatim. Do not rewrite them without the
// founder's approval: where a sentence meets a legal safeguard, the conflict
// is listed in FOUNDER_REVIEW below and flagged, never silently reworded.

import { DISCLOSURES } from './claims'

export type CopyStatus = 'final' | 'approved-in-principle' | 'proposed'

export const HOMEPAGE_COPY = {
  hero: {
    status: 'final' as CopyStatus,
    /** The signature line is the headline: two lines, the second in the apricot accent. */
    headline: "Don't just post. Get your split.",
    headlineLines: ["Don't just post.", 'Get your split.'],
    body: [
      'The social network where everyone who contributes to the success of content has an opportunity to benefit.',
      'Create what you love. Connect with people you value. Get recognized for the difference you make.',
    ],
    primaryCta: 'Join the Waitlist',
    secondaryCta: 'Discover Splitpost',
    smallPrint: 'Invitation-only pilot for adults 18+. All pilot earnings are simulated. Earnings are not guaranteed.',
    /** The brand line, used in the footer. */
    tagline: 'Every Post. A Better Split.',
    /** The core brand belief. */
    belief: 'Everyone deserves a split.',
  },

  /**
   * The hero's sample post (the split-post illustration, simplified for
   * SP-UAT-001): a fictional creator, labelled SAMPLE, shown as a photo post.
   * No sample text, statistics or comments.
   */
  /** The hero picture (SP-BRAND-003): the founder's signature caption, and a note that the people are illustrative. */
  split: {
    caption: 'Created by one. Grown by many.',
    note: 'Illustrative sample: a fictional creator and stock photos of models, not Splitpost members.',
  },

  why: {
    status: 'final' as CopyStatus,
    /**
     * Founder-approved and locked (Nov 28, SP-BRAND-003 follow-up, BR-001).
     * Verbatim: do not rewrite, paraphrase, shorten or add to it. The
     * paragraph breaks are part of the approval; the emphasis line is shown
     * with greater visual prominence.
     */
    headline: 'You do the work. Who gets the reward?',
    body: [
      'You create the content. Your followers watch, like, comment, save and share it. Together, you generate the attention that platforms turn into billions in advertising revenue.',
      'Yet the platforms decide who sees your content, how much you earn and whether you earn anything at all.',
      'They have built predictable businesses from your creativity, while you are left trying to build a business on unpredictable algorithms.',
      'Your followers help you grow, but rarely share in the financial value they help create.',
    ],
    emphasis: 'Everyone contributes. Not everyone gets a split.',
    closing: "We believe it's time to change that.",
  },


  who: {
    status: 'final' as CopyStatus,
    eyebrow: "Who we're building for",
    headline: 'Built for people like you.',
    groups: [
      {
        id: 'creators',
        tag: 'For creators',
        title: "You've built an audience. Now you want to build a future.",
        body: [
          'You spend hours creating content. Your followers are growing. People value what you have to say.',
          "But you still don't know how many of your followers will see your next post or how much you'll earn next month.",
          'You want to build something sustainable, not spend your life chasing the next viral post.',
        ],
      },
      {
        id: 'supporters',
        tag: 'For supporters',
        title: 'You do more than watch. You help creators grow.',
        body: [
          'You follow the people who inspire you. You share their content, recommend them to friends and keep coming back.',
          'Yet your favourite creators often disappear from your feed, and your contributions go unnoticed.',
          'You deserve an experience where your connections and contributions matter.',
        ],
      },
    ],
  },

  what: {
    status: 'final' as CopyStatus,
    eyebrow: "The future we're building",
    headline: 'Imagine a better kind of social media.',
    body: [
      'A place where creators can spend less time chasing algorithms and more time creating something valuable.',
      'Where the people who choose to follow you can easily find your content.',
      'Where building an audience can become the foundation for building a sustainable business.',
      'Where supporting your favourite creators means more than giving them another view.',
      'A place where your time, your talent and your contributions matter.',
    ],
    closing: ["That's the future we're building at Splitpost.", 'A social network where success is something we can share.'],
    commitmentsTitle: 'Our three commitments',
    commitments: [
      { title: 'Meaningful connections', line: 'People before algorithms.' },
      { title: 'Sustainable growth', line: 'Relationships before virality.' },
      { title: 'Shared success', line: 'Recognize those who contribute.' },
    ],
    disclosure: 'This is our long-term vision, not a promise of income during the pilot.',
  },

  how: {
    status: 'final' as CopyStatus,
    eyebrow: 'How Splitpost works',
    headline: 'A better split starts with a better connection.',
    /** SP-BRAND-003: each step opens with a recognizable problem, then the approved hook and body. Founder-approved wording, Nov 27. */
    problemStatus: 'final' as CopyStatus,
    steps: [
      {
        id: 'discover',
        number: '01',
        label: 'Discover',
        title: 'Find your people.',
        problem: "Creating valuable content doesn't guarantee that the people who need it will ever discover it.",
        body: [
          'Discover creators who share your interests and create content that matters to you.',
          'Find people worth following, not just content worth scrolling past.',
        ],
        screen: '/media/landing/screens/how-discover.webp',
        alt: 'The Splitpost Discover screen: search, three ways in (For you, People, Topics) and a creator worth following.',
        callout: 'Find creators who share your interests.',
      },
      {
        id: 'connect',
        number: '02',
        label: 'Connect',
        title: 'Keep your people close.',
        problem: "You've built an audience, yet you still have to compete for the attention of people who already chose to follow you.",
        body: [
          'Follow the creators you value and add your favourites to your Clique.',
          'Their new posts come first, so you can stay connected to the people who matter most.',
        ],
        screen: '/media/landing/screens/how-connect.webp',
        alt: 'The Splitpost Home feed: the Clique row at the top, then new posts from the people followed, newest first.',
        callout: 'Your Clique, first on Home.',
      },
      {
        id: 'create',
        number: '03',
        label: 'Create',
        title: 'Share what makes you valuable.',
        problem: "You invest your time, knowledge and creativity into content, but turning that effort into a sustainable income remains unpredictable.",
        body: [
          'Teach, inspire, entertain or share what you know.',
          'Build a community around your content and understand what keeps people coming back.',
        ],
        screen: '/media/landing/screens/how-create.webp',
        alt: 'A creator’s Splitpost profile: followers, Your insights (Reach, Connection and simulated Earnings) and published posts.',
        callout: 'Your posts and your insights, together.',
      },
      {
        id: 'contribute',
        number: '04',
        label: 'Contribute',
        title: 'Make your support count.',
        problem: "You help your favourite creators grow by engaging with their content, sharing it and introducing them to others, yet your contributions often go unrecognized.",
        body: [
          'Support the creators you value through meaningful engagement and by helping their communities grow.',
          'Earn Connection Points for eligible contributions and track your progress.',
        ],
        note: 'Connection Points recognize your contributions. They are not money and have no cash value.',
        screen: '/media/landing/screens/how-contribute.webp',
        alt: 'A save on Splitpost recognized: a short message says it counts toward the supporter goals.',
        callout: 'Your contributions, recognized.',
      },
      {
        id: 'earn',
        number: '05',
        label: 'Earn',
        title: 'Get your split.',
        problem: "Creators and their communities work together to make content successful, but the opportunity to benefit financially is rarely shared between them.",
        body: [
          'Whether you create content or help creators grow, work towards qualifying for a future share of eligible content revenue.',
          'During the pilot, you can track your simulated split, see your progress and know what to do next.',
        ],
        source: 'Splitpost is designed to share future eligible revenue from advertising shown with content with the creators and qualifying supporters who help that content succeed.',
        note: 'All pilot earnings are simulated. No cash is paid during the pilot. Eligibility, verification and qualification review requirements apply. Future earnings are not guaranteed.',
        screen: '/media/landing/screens/how-earn.webp',
        alt: 'My Split on Splitpost: your split so far, as a creator and as a supporter, unlocked and locked, marked Simulated, then the next goal.',
        callout: 'Your split, your goals, your next step.',
      },
    ],
    /** Under every product screen. */
    screenLabel: 'The Splitpost app, with illustrative sample people and data. Amounts are simulated.',
  },

  account: {
    status: 'final' as CopyStatus,
    headline: "You don't have to choose a side.",
    body: 'You can be a creator today and a supporter tomorrow. Or you can be both.',
    lines: ['Share what you know.', 'Support what you believe in.', 'Build meaningful connections.', 'Get recognized for the value you contribute.'],
    closing: 'One account. Every opportunity.',
  },

  /**
   * THE PILOT, the one disclosure band (BRD-10), just before the invitation
   * so it sits near signup. /join shows the same list, word for word: the
   * founder's list, then the earlier approved disclosures that still apply.
   */
  pilot: {
    status: 'final' as CopyStatus,
    eyebrow: 'Be part of the beginning',
    headline: 'Help shape the future of Splitpost.',
    body: [
      "We're inviting creators and supporters to help us test a better way for social media to work.",
      "As an early member, you'll have the opportunity to experience Splitpost, build meaningful connections and help shape the platform we're creating together.",
      'Your experience and feedback will help us understand what works, what needs to improve and how we can better serve our community.',
    ],
    listTitle: 'What you should know',
    details: [
      'The initial pilot is invitation-only and available to adults aged 18 and over.',
      'All pilot earnings and financial rewards are simulated.',
      'Connection Points recognize your contributions. They are not money and have no cash value.',
      'No cash payments or payouts will take place during the pilot.',
      'Future financial rewards are subject to eligibility, verification and applicable legal and financial requirements.',
      'Features and experiences are being tested and may evolve.',
      'Earnings are not guaranteed.',
      // Earlier approved disclosures that still apply (retained, SP-BRAND-002 section 7).
      DISCLOSURES.invitationOnly,
      DISCLOSURES.cpNotMoney,
      DISCLOSURES.noGuarantee,
      DISCLOSURES.creatorSupportTest,
      DISCLOSURES.adsAndRevenueTested,
      DISCLOSURES.pilotStart,
    ],
  },

  invitation: {
    status: 'final' as CopyStatus,
    headline: "Let's build a better kind of social media.",
    body: [
      'Better for the people who create.',
      'Better for the people who support them.',
      'Better for everyone who believes valuable content deserves more than just views.',
    ],
    belief: 'Everyone deserves a split.',
    close: 'Be part of the beginning.',
    cta: 'Join the Waitlist',
    disclosure: 'Invitation-only pilot for adults 18+. All earnings are simulated. No cash is paid during the pilot, and future earnings are not guaranteed.',
    signOff: 'Muyiwa Omosa, Founder of Splitpost',
  },

  peopleNote: 'Photos show models from stock images, not Splitpost members. App screens use illustrative sample people and data.',
  /** Shown on a photo placeholder until the founder approves the shortlist. */
  photoPending: 'Photo pending approval',
} as const

/**
 * Founder-locked sentences that a safeguard check flags, kept word for word
 * and listed here instead of being reworded (see the note at the top of this
 * file). Each is excluded from the named checks only, by exact match; every
 * other sentence still goes through every check. Each needs the founder's
 * and counsel's sign-off before publication.
 *
 *   BR-001 (Nov 28): describes how platforms earn from attention today, not
 *   anything Splitpost offers. It trips three checks: "revenue sharing
 *   described as existing today" (the claims checker), "no statistics"
 *   (the word "billions", an unsourced general figure), and "no mention of
 *   advertising in WHY" (it names advertising revenue, but offers nothing to
 *   advertisers). Open question for counsel: is "billions in advertising
 *   revenue" acceptable without a cited source?
 */
export const FOUNDER_LOCKED_EXCEPTIONS: ReadonlyArray<{ sentence: string; checks: readonly string[]; approved: string }> = [
  {
    sentence: 'Together, you generate the attention that platforms turn into billions in advertising revenue.',
    checks: ['revenue sharing described as existing today', 'no statistics', 'no advertising in WHY'],
    approved: 'Founder, Nov 28 (BR-001, locked wording); counsel review pending',
  },
]

/** Text with the founder-locked exception sentences removed, for the checks they are excepted from. */
export function withoutLockedExceptions(text: string): string {
  return FOUNDER_LOCKED_EXCEPTIONS.reduce((t, e) => t.split(e.sentence).join(' '), text)
}

/** Every visitor-facing string in the homepage copy, for the claim checks. */
export function allHomepageText(copy: unknown = HOMEPAGE_COPY): string[] {
  if (typeof copy === 'string') return [copy]
  if (Array.isArray(copy)) return copy.flatMap((c) => allHomepageText(c))
  if (copy && typeof copy === 'object') {
    return Object.entries(copy)
      .filter(([k]) => !['status', 'screen', 'id'].includes(k))
      .flatMap(([, v]) => allHomepageText(v))
  }
  return []
}
