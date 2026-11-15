// The approved Splitpost homepage copy, in one place.
//
// Nothing renders from this file yet: the current homepage is unchanged until
// the section PRs (2 to 4) switch it over. Section components and tests will
// both read from here, so the words on the page are exactly the approved ones.
//
// Status: the hero and section 3 are final as approved by the founder. The
// other sections are approved in principle and may still change in review.
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
    visualLabel: DISCLOSURES.concept,
  },

  why: {
    status: 'approved-in-principle' as CopyStatus,
    eyebrow: 'Why · The problem',
    headline: "You helped build it. Where's your split?",
    intro: 'Follow one post. See who helps it grow, and who gets a chance to benefit.',
    samplePeople: 'Priya, Ana and Leo are sample people. The post and its numbers are illustrations.',
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
    researchTitle: 'The bigger picture',
  },

  who: {
    status: 'approved-in-principle' as CopyStatus,
    eyebrow: 'Who · Our audience',
    headline: ['The creator who keeps posting.', 'The fan who keeps sharing.'],
    creator: {
      label: 'The creator',
      line: 'More posts. More followers. Not more income.',
      points: [
        'Reach rises and falls without warning.',
        'A good month says little about the next one.',
        'A growing audience still doesn’t add up to a steady living.',
      ],
    },
    fan: {
      label: 'The fan',
      line: 'You shared it. You started the conversation. Nobody noticed.',
      points: [
        'You found them early and told your friends.',
        'Your comments and recommendations help them grow.',
        'Your referrals bring real followers, and go unseen.',
      ],
    },
    samplePeople: 'Priya is a creator like this. Ana and Leo are fans like this. They’re sample people, here to show how Splitpost works.',
  },

  solution: {
    status: 'final' as CopyStatus,
    headline: 'POST. SUPPORT. SPLIT.',
    steps: [
      { word: 'POST.', line: 'Create something worth sharing.' },
      { word: 'SUPPORT.', line: 'Help it reach more people.' },
      { word: 'SPLIT.', line: 'Make meaningful contributions count.' },
    ],
    /** Always shown beside each other, never hidden: pilot recognition versus the future vision. */
    now: {
      badge: 'Now · in the pilot',
      title: 'Recognition, not money.',
      body: `Connection Points recognize your support for each creator and unlock perks they offer. ${DISCLOSURES.cpNoCashValue.replace('Connection Points have', 'They have')}`,
    },
    later: {
      badge: 'Later · our vision',
      title: 'A real share of the value.',
      body: `We're working toward a future where creators and fans can share in advertising revenue from the posts they create and support. ${DISCLOSURES.visionOnly}`,
    },
  },

  experience: {
    status: 'approved-in-principle' as CopyStatus,
    headline: 'Built for creators. Powered by fans.',
    intro: "A first look at what we're building for the pilot.",
    badge: 'Being built for the pilot',
    mockups: [
      { title: 'Following feed', line: 'Posts from people you follow, newest first.' },
      { title: 'Creator insights', line: 'See who supports your work and who brings new followers.' },
      { title: 'Fan recognition', line: 'Earn Connection Points with each creator for meaningful support.' },
      { title: 'Perks', line: 'Unlock perks creators choose to offer.' },
    ],
    mockupLabel: `${DISCLOSURES.concept} · ${DISCLOSURES.sampleData}`,
    cta: 'Take the guided tour',
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
