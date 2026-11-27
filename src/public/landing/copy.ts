// The Splitpost homepage copy, in one place. Section components and tests
// both read from here, so the words on the page are exactly these.
//
// SP-BRAND-002 (founder-approved Nov 27, with the marketing positioning
// amendment of the same day): one story for creators and supporters.
//   HOOK         Don't just post. Get your split.
//   WHY          You do the work. Who gets the reward?
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
  split: {
    creatorTag: 'Created by Priya',
    communityTag: 'Grown by her community',
  },

  why: {
    status: 'final' as CopyStatus,
    eyebrow: 'Why Splitpost exists',
    headline: 'You do the work. Who gets the reward?',
    body: [
      'Every day, people create the content that makes social media valuable.',
      'Others watch, comment, share and help that content reach new people.',
      'Together, they build communities, influence decisions and generate value.',
    ],
    question: 'But who benefits the most?',
    body2: [
      'Creators spend hours making content but struggle to turn their passion into a sustainable income.',
      'Followers help their favourite creators grow but rarely receive anything in return.',
      'And somewhere along the way, social media became more about capturing attention than building meaningful connections.',
    ],
    belief: [
      'We believe social media should work differently.',
      'The people who help create the value should have an opportunity to share in it.',
      "That's why we're building Splitpost.",
    ],
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
    /**
     * SP-BRAND-003: each step now opens with a recognizable problem before
     * the approved hook and body. The problem lines are Claude's drafts,
     * NOT founder approved; they are replaced by the founder's final copy
     * before publication, and this flips to 'final' only then.
     */
    problemStatus: 'proposed' as CopyStatus,
    steps: [
      {
        id: 'discover',
        number: '01',
        label: 'Discover',
        title: 'Find your people.',
        problem: 'Endless feeds show you what keeps you scrolling, not who is worth knowing.',
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
        problem: 'The people you care about most get lost in everything else.',
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
        problem: "You post and post, and rarely know what actually brings people back.",
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
        problem: 'Your support helps creators grow, but it usually goes unseen.',
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
        problem: 'On most platforms, the people who help content succeed rarely share in its success.',
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
