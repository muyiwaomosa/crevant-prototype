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

  why: {
    status: 'approved-in-principle' as CopyStatus,
    eyebrow: 'Why',
    headline: "You helped build it. Where's your split?",
    intro: 'Follow one post. See who helps it grow, and who gets a chance to benefit.',
    steps: [
      { title: 'Priya posts.', line: 'Her fourth build log this week. Posting is the easy part. Being seen is not.' },
      { title: 'Ana joins in.', line: 'She starts the conversation and carries the post to people Priya couldn’t reach.' },
      { title: 'Leo recommends it.', line: 'A recommendation from a friend. Three new followers who might never have found her.' },
      { title: 'The post takes off.', line: 'It grew because people helped it grow.' },
    ],
    gap: {
      kicker: 'And then?',
      headline: 'They all helped it grow. Not all of them had a way to benefit.',
      people: [
        { name: 'Priya', line: 'Reach went up this week. Her income didn’t follow, and the next post could reach far fewer people.' },
        { name: 'Ana', line: 'Started the conversation and shared it with her team. Her part went unrecognized.' },
        { name: 'Leo', line: 'Brought three new followers. Priya had no way of knowing they came through him.' },
      ],
    },
  },

  who: {
    status: 'approved-in-principle' as CopyStatus,
    eyebrow: 'Who',
    headline: ['The creator who keeps posting.', 'The fan who keeps sharing.'],
    creator: {
      label: 'The creator',
      line: 'More posts. More followers. Not more income.',
      points: [
        'You check the numbers before you check your messages.',
        'One post takes off, the next one disappears, and you never learn why.',
        'Your audience keeps growing. Your income doesn’t keep up.',
      ],
    },
    fan: {
      label: 'The fan',
      line: 'You shared it. You started the conversation. Nobody noticed.',
      points: [
        'You found them early and told everyone you know.',
        'Your comments start the conversations that keep them going.',
        'Your recommendations bring real followers, and nobody sees it.',
      ],
    },
  },

  what: {
    status: 'approved-in-principle' as CopyStatus,
    eyebrow: 'What',
    headline: 'What if every successful post created more winners?',
    intro: 'When a post takes off, the people who made it happen should come out ahead together.',
    outcomes: {
      creator: {
        label: 'For creators',
        points: ['See exactly who helps each post grow.', 'Thank the fans who show up, with perks you choose.', 'Grow with a community that has a reason to stay.'],
      },
      fan: {
        label: 'For fans',
        points: ['Your support is seen, not lost in a count.', 'Recognition with each creator you back.', 'Perks from the creators you help grow.'],
      },
    },
    /** Always shown beside each other, never hidden, and drawn differently: pilot recognition versus the future vision. */
    now: {
      badge: 'Now · in the pilot',
      title: 'Recognition and perks.',
      flows: [
        { to: 'Priya', what: 'Supporter insights', line: 'Who helped this post grow, and who brought new followers.' },
        { to: 'Ana and Leo', what: 'Connection Points with Priya', line: 'Recognition for meaningful support, held with Priya only.' },
        { to: 'Ana and Leo', what: 'Perks from Priya', line: 'Noncash perks she chooses to offer, like an early look at a build.' },
      ],
      note: `${DISCLOSURES.noFanCash} ${DISCLOSURES.cpNoCashValue} ${DISCLOSURES.cpRules}`,
    },
    later: {
      badge: 'Later · our vision',
      title: 'A real share of the value.',
      source: 'Eligible ad revenue, in our future vision',
      flows: [
        { to: 'The creator', line: 'Priya, who made the post.' },
        { to: 'A fan reward pool', line: 'Shared by fans whose support was verified.' },
        { to: 'Splitpost', line: 'To run the platform and keep it growing.' },
      ],
      body: "We're working toward a future where creators and fans can share in advertising revenue from the posts they create and support. Not every post would earn it, and how it would be divided hasn't been decided.",
      note: DISCLOSURES.visionOnly,
    },
  },

  how: {
    status: 'final' as CopyStatus,
    eyebrow: 'How',
    headline: 'POST. SUPPORT. SPLIT.',
    intro: 'The same post, inside Splitpost. Concept screens with sample data, showing what we’re building for the pilot.',
    steps: [
      { word: 'POST.', line: 'Create something worth sharing.' },
      { word: 'SUPPORT.', line: 'Help it reach more people.' },
      { word: 'SPLIT.', line: 'Make meaningful contributions count.' },
    ],
    screens: [
      { step: 'POST.', caption: 'Priya shares her build log with her followers.' },
      { step: 'SUPPORT.', caption: 'Ana comments. Leo recommends Priya with a referral link.' },
      { step: 'SPLIT.', caption: 'Priya sees who helped her post grow.' },
      { step: 'SPLIT.', caption: 'Leo’s support is recognized with Priya, and unlocks a perk she offers.' },
    ],
    mockupLabel: `${DISCLOSURES.concept} · ${DISCLOSURES.sampleData}`,
    pilotNote: 'In the pilot, SPLIT means recognition and perks, not money. Sharing advertising revenue is our future vision and is not part of the pilot.',
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
  peopleNote: 'Photos show models from stock images. Priya, Ana and Leo are sample people, and their post and numbers are illustrations.',
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
