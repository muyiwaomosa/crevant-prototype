// The Splitpost homepage copy, in one place. Section components and tests
// both read from here, so the words on the page are exactly these.
//
// The story leads with the creator (founder-approved outline, 2026-11-15):
// HERO, the creator's PROBLEM, the ALTERNATIVE (connection, not attention),
// the fan CONNECTION (recognition that strengthens relationships), the
// VISION (a respected, more sustainable profession), then the invitation.
// Priya, Ana and Leo are sample people; the post and its numbers are
// illustrations, never evidence. Disclosures come from claims.ts so they're
// written once, and each limitation sits beside the claim it qualifies.

import { DISCLOSURES } from './claims'

export type CopyStatus = 'final' | 'approved-in-principle'

export const HOMEPAGE_COPY = {
  hero: {
    status: 'final' as CopyStatus,
    /**
     * Founder-approved headline (2026-11-16), exactly as written. It states
     * what creators deserve; it is not a promise of earnings, which the small
     * print beside it makes clear.
     */
    headline: 'You Create The Post. You Deserve a Split.',
    /** Set as two lines; the second is highlighted in gold. */
    headlineLines: ['You Create The Post.', 'You Deserve a Split.'],
    /** The brand line, used in the footer. */
    tagline: 'Every Post. A Better Split.',
    /** Plain enough for a 12-year-old: the problem, then what we're building. */
    body: [
      "You work hard to make content. You grow your followers. But that doesn't always mean you get paid.",
      "We're building a better way to help you connect with your audience and earn from the value you create.",
    ],
    primaryCta: 'Join the Waitlist',
    secondaryCta: 'Discover Splitpost',
    smallPrint: ['Invitation-only pilot.', DISCLOSURES.noGuarantee, DISCLOSURES.noFanCash],
  },

  /** The one sample post the page follows: Priya, a running coach, teaching. Labelled as sample data wherever it appears. */
  post: {
    author: 'Priya Raman',
    handle: '@priyaruns',
    role: 'Running coach',
    time: '2h',
    text: 'Shin splints on every run? Try this 60-second calf drill before you head out: slow heel raises, toe walks, then ankle circles. Save it for your next run.',
    imageAlt: 'Illustrated card: a 60-second calf drill in three steps',
    likes: '12.4K',
    comments: '1.8K',
    reposts: '3.2K',
  },

  /** Tags on the split-post illustration. */
  split: {
    creatorTag: 'Created by Priya',
    communityTag: 'Grown by her community',
    communityLine: 'Ana tried the drill. Leo shared it with his running club.',
  },

  problem: {
    status: 'final' as CopyStatus,
    eyebrow: 'The problem',
    headline: 'You create the value. The algorithm decides who sees it.',
    body: [
      'You can have thousands of followers and still struggle to reach them. You can create content that changes lives and still struggle to earn a living from it.',
      'Because when attention determines who gets seen, building trust, community and a sustainable career becomes harder than it should be.',
    ],
    points: [
      { title: 'Reach you can’t predict', line: 'The same post can reach many people one day and almost no one the next.' },
      { title: 'Attention over connection', line: 'Feeds reward what grabs attention, not what builds trust.' },
      { title: 'Followers, not a community', line: 'A big following doesn’t mean you can reach the people who chose you.' },
      { title: 'Earnings that don’t reflect the work', line: 'Income stays unpredictable, however valuable the content.' },
    ],
  },

  alternative: {
    status: 'final' as CopyStatus,
    eyebrow: 'The alternative',
    headline: 'A social platform built around connection, not just attention.',
    body: 'Splitpost is designed to help the people who value your work keep seeing it, and to help you get to know them.',
    pillars: [
      { title: 'A Following feed you can count on', line: 'Posts from the people you chose to follow, newest first.' },
      { title: 'Discovery by shared interests', line: 'People find you through what you teach and share, not engagement bait.' },
      { title: 'Know your community', line: 'See who engages with your work and who helps it reach new people.' },
    ],
    pilotLabel: 'Being built for the pilot',
    note: DISCLOSURES.stillTesting,
    mockupLabel: `${DISCLOSURES.concept} · ${DISCLOSURES.sampleData}`,
  },

  connection: {
    status: 'final' as CopyStatus,
    eyebrow: 'The fan connection',
    headline: 'When your community helps you grow, they’re recognized too.',
    body: 'Eligible fans who follow, take part thoughtfully or bring new people to a creator earn Connection Points with that creator. Creators can thank them with perks. Recognition strengthens the relationship. It isn’t a payment.',
    steps: [
      { title: 'A fan takes part', line: 'Ana tries Priya’s drill and leaves a thoughtful comment.' },
      { title: 'A fan brings people in', line: 'Leo shares it with his running club, and new runners follow Priya.' },
      { title: 'The creator says thanks', line: 'They earn Connection Points with Priya, and she offers a perk.' },
    ],
    /** Shown right beside the claim it qualifies. */
    disclosure: `${DISCLOSURES.cpNoCashValue} ${DISCLOSURES.noFanCash}`,
  },

  vision: {
    status: 'final' as CopyStatus,
    eyebrow: 'Our vision',
    headline: 'Content creation deserves to be a respected profession.',
    /** The founder's goal statement, verbatim (lowercase, no full stop). Do not edit. */
    goal: 'we want to create a platform that generates sustainable pay for content creators who have something valuable to say',
    goalLabel: 'Our goal',
    body: 'Whether you create now and then, part-time or as your job, valuable content deserves recognition.',
    stages: ['Now and then', 'Part-time', 'As your job'],
    longTerm: 'In the long term, we want creators and the fans who help them grow to share in the value their posts create.',
    /** Shown right beside the vision it qualifies. */
    disclosure: `${DISCLOSURES.visionOnly} ${DISCLOSURES.noGuarantee}`,
  },

  invitation: {
    status: 'approved-in-principle' as CopyStatus,
    headline: 'Be part of a better split.',
    body: "We're opening Splitpost to a small group of creators and fans for a 60-day pilot. One waitlist, for everyone.",
    audience: 'For creators just starting out, creating part-time or building a full-time career, and the people who support them.',
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

  /** Shown on the page so no one mistakes a sample for a real member. */
  peopleNote: 'Priya, Ana and Leo are sample people, and their post and its numbers are sample data.',
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
