// The Splitpost homepage copy, in one place. Section components and tests
// both read from here, so the words on the page are exactly these.
//
// The story runs HERO, WHY, WHO, WHAT, HOW, then the invitation, and follows
// one sample post (Priya's) the whole way. Priya, Ana and Leo are sample
// people; the post and its numbers are illustrations, never evidence.
// Disclosures come from claims.ts so they're written once.

import { DISCLOSURES } from './claims'

export type CopyStatus = 'final' | 'approved-in-principle'

export const HOMEPAGE_COPY = {
  hero: {
    status: 'final' as CopyStatus,
    headline: 'SUCCESS SHOULD BE SPLIT.',
    tagline: 'Every Post. A Better Split.',
    body: ['Creators make the content.', 'Fans help it grow.', 'Both deserve to benefit from its success.'],
    primaryCta: 'Join the Waitlist',
    secondaryCta: 'Discover Splitpost',
    smallPrint: ['Invitation-only pilot.', DISCLOSURES.noFanCash],
  },

  /** The one sample post the whole page follows. Fictional, and labelled as sample data wherever it appears. */
  post: {
    author: 'Priya Raman',
    handle: '@priyaruns',
    time: '2h',
    text: 'A year ago I couldn’t run to the end of my street. This morning I finished my first 10K. If you’re starting something hard, start slow. Just start.',
    imageAlt: 'Finish line at sunrise',
    likes: '12.4K',
    comments: '1.8K',
    reposts: '3.2K',
  },

  why: {
    status: 'approved-in-principle' as CopyStatus,
    eyebrow: 'Why',
    headline: "You helped build it. Where's your split?",
    intro: 'One post goes viral. Thousands help it spread. But who gets a piece of its success?',
    steps: [
      { title: 'Priya creates a relatable post.', line: 'Her first 10K, and the year it took to get there.' },
      { title: 'Ana comments and shares it with friends.', line: 'Her comment starts the conversation. Her group chat does the rest.' },
      { title: 'Leo reposts it and introduces new people.', line: 'His followers have never heard of Priya. Now they follow her.' },
      { title: 'The post takes off because people helped it spread.', line: 'Thousands of likes, comments and reposts. Sample numbers, for illustration.' },
    ],
    question: "So where's their split?",
  },

  who: {
    status: 'approved-in-principle' as CopyStatus,
    eyebrow: 'Who',
    headline: ['The creator who keeps posting.', 'The fan who keeps sharing.'],
    creator: {
      label: 'The creator',
      line: 'You’re creating content people love. But the money doesn’t reflect the work.',
      points: [
        'You publish week after week, because your audience counts on you.',
        'Your audience keeps growing. Turning that into a steady living still feels out of reach.',
        'One good month never tells you what the next one will bring.',
      ],
    },
    fan: {
      label: 'The fan',
      line: "You helped make that post successful. But where's your split?",
      points: [
        'Your comment started the conversation that kept it going.',
        'Your reposts and recommendations brought in people who’d never have found it.',
        'You helped create that success, with no way to share in what it’s worth.',
      ],
    },
  },

  what: {
    status: 'approved-in-principle' as CopyStatus,
    eyebrow: 'What',
    headline: 'What if every successful post created more winners?',
    creator: {
      label: 'For creators',
      headline: 'Create what matters. Earn a better split.',
      body: 'Our goal: when your posts create value, you get a fairer split of it, and a more sustainable way to keep creating the work people love.',
    },
    fan: {
      label: 'For fans',
      headline: "Don't just share the post. Share in its success.",
      body: 'Our goal: when you help a post and its creator succeed, you get a split of that success too.',
    },
    /** Concise, always visible: what the pilot does today, and what is still only a vision. */
    today: {
      label: 'Today, in the pilot',
      body: `Creators see who helps their posts grow. Fans earn Connection Points and perks from the creators they support. ${DISCLOSURES.noFanCash} ${DISCLOSURES.cpNoCashValue}`,
    },
    vision: {
      label: 'Our vision',
      body: `Sharing advertising revenue from eligible posts with creators and fans is our future vision. It isn't guaranteed. ${DISCLOSURES.visionOnly}`,
    },
  },

  how: {
    status: 'final' as CopyStatus,
    eyebrow: 'How',
    headline: 'POST. SUPPORT. SPLIT.',
    screens: [
      { step: 'POST.', caption: 'Priya posts her first 10K.' },
      { step: 'SUPPORT.', caption: 'Ana comments and shares. Leo reposts it with his referral link.' },
      { step: 'SPLIT.', caption: 'Priya sees exactly who helped her post spread.' },
      { step: 'SPLIT.', caption: 'Leo earns Connection Points with Priya, and unlocks a perk she offers.' },
    ],
    mockupLabel: `${DISCLOSURES.concept} · ${DISCLOSURES.sampleData}`,
    pilotNote: 'In the pilot, the split is Connection Points and perks, not money. Sharing advertising revenue is our future vision and is not part of the pilot.',
    smallPrint: DISCLOSURES.noGuarantee,
  },

  invitation: {
    status: 'approved-in-principle' as CopyStatus,
    headline: 'Be part of a better split.',
    body: "We're opening Splitpost to a small group of creators and fans for a 60-day pilot. One waitlist, for everyone.",
    cta: 'Join the Waitlist',
    pilotDetailsTitle: 'Pilot details',
    pilotDetails: [
      DISCLOSURES.invitationOnly,
      DISCLOSURES.stillTesting,
      DISCLOSURES.noFanCash,
      `${DISCLOSURES.cpNoCashValue} ${DISCLOSURES.cpRules}`,
      DISCLOSURES.creatorSupportTest,
      DISCLOSURES.adsAreDemos,
      DISCLOSURES.pilotStart,
    ],
    signOff: 'Muyiwa Omosa, Founder of Splitpost',
  },

  /** Shown on the page so no one mistakes a model or a sample for a real member. */
  peopleNote: 'Photos show models from stock images. Priya, Ana and Leo are sample people, and their post and its numbers are sample data.',
} as const

/** Every visitor-facing string in the homepage copy, for the claim checks. */
export function allHomepageText(copy: unknown = HOMEPAGE_COPY): string[] {
  if (typeof copy === 'string') return [copy]
  if (Array.isArray(copy)) return copy.flatMap((c) => allHomepageText(c))
  if (copy && typeof copy === 'object') {
    return Object.entries(copy)
      .filter(([k]) => k !== 'status')
      .flatMap(([, v]) => allHomepageText(v))
  }
  return []
}
