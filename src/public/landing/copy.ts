// The Splitpost homepage copy, in one place. Section components and tests
// both read from here, so the words on the page are exactly these.
//
// Nine sections, one continuous story around "You Create The Post. You
// Deserve a Split.". The seven founder-approved sections (copy approved
// 2026-11-16) plus the two added by the approved landing page evolution
// (docs/design/SP-DESIGN-002.md section 5):
//   HERO, THE PROBLEM, WHAT WE'RE BUILDING, FIND YOUR PATH,
//   WHO WE'RE BUILDING FOR, A BETTER SPLIT, OUR BIGGER VISION,
//   PILOT DETAILS (the one disclosure band), THE INVITATION.
// Do not rewrite this copy without the founder's approval. Sample people and
// posts are labelled SAMPLE wherever they appear and carry no real results.
// Disclosures come from claims.ts or are the founder's own wording, and sit
// beside the claims they qualify.

import { DISCLOSURES } from './claims'

export type CopyStatus = 'final' | 'approved-in-principle'

export const HOMEPAGE_COPY = {
  hero: {
    status: 'final' as CopyStatus,
    /** States what creators deserve; not a promise of earnings (see the small print). */
    headline: 'You Create The Post. You Deserve a Split.',
    /** Exactly two lines on every screen, one sentence each; the second in gold. */
    headlineLines: ['You Create The Post.', 'You Deserve a Split.'],
    /** The approved signature line, word for word, under the headline with the logo mark. */
    signature: "Don't just post. Get your split.",
    signatureLines: ["Don't just post.", 'Get your split.'],
    /** The brand line, used in the footer. */
    tagline: 'Every Post. A Better Split.',
    body: [
      "You put in the work. You grow your followers. But the money doesn't always follow.",
      "We're building a social platform where your content can help you earn, and your followers can become a real community.",
    ],
    primaryCta: 'Join the Waitlist',
    secondaryCta: 'Discover Splitpost',
    smallPrint: ['Invitation-only pilot.', DISCLOSURES.noGuarantee, DISCLOSURES.noFanCash],
  },

  /**
   * The hero's sample post: a fictional creator frustrated by unpredictable
   * reach. Labelled SAMPLE; the follower numbers are illustrative, not
   * Splitpost data. The community half (likes, comments, reposts and the
   * community line) is unchanged.
   */
  post: {
    author: 'Priya Raman',
    role: 'Content creator',
    time: '2h',
    paragraphs: [
      'I have 10,000 followers. So why do only a few hundred people see my posts?',
      'I spend hours creating content, but I never know if the people who followed me will even see it. One post reaches thousands. The next barely reaches anyone.',
    ],
    /** The graphic inside the post: the gap between followers and the people who saw it. Illustrative numbers. */
    reach: { followers: '10,000', followersLabel: 'followers', seen: 'A few hundred', seenLabel: 'saw this post' },
    likes: '1.2K',
    comments: '86',
    reposts: '214',
  },

  /** Tags on the split-post illustration. */
  split: {
    creatorTag: 'Created by Priya',
    communityTag: 'Grown by her community',
    /** A comment from Priya's community, replying to her post about reach. Sample person. */
    communityComment: { name: 'Ana', text: "Oh wow, I was wondering why I hadn't been seeing your content. I thought you stopped posting!" },
  },

  /** Everyday sample posts for the product screens. All labelled SAMPLE. */
  samplePosts: [
    {
      author: 'Mr. Daniel Osei',
      role: 'Math teacher',
      text: 'Fractions keep tripping up my class, so here is the trick that finally worked: turn both into the same-size pieces first.',
    },
    { author: 'Rosa Jiménez', role: 'Home cook', text: 'Feeding four for under an hour: one-pan rice and beans with whatever vegetables you have left.' },
    {
      author: 'Kwame Asante',
      role: 'Leather maker',
      text: 'From one hide to a wallet: how I cut, stitch and finish every piece by hand in my small workshop.',
    },
    { author: 'Mei Lin', role: 'Tech reviewer', text: 'I tested five free note-taking apps for a month. This is the one I kept, and why.' },
  ],

  problem: {
    status: 'final' as CopyStatus,
    eyebrow: 'The problem',
    headline: 'You Do the Work. Who Gets the Reward?',
    body: [
      'Every day, creators make the videos, stories and posts that keep people coming back to social media.',
      'Platforms earn money when people spend time watching.',
      'But many creators who help build those platforms earn little or nothing.',
    ],
    turn: "And there's another problem.",
    body2: [
      "The apps decide which posts people see. They often reward content that grabs attention, even if it doesn't help creators build lasting relationships.",
      'So one post gets thousands of views. The next barely reaches your followers.',
    ],
    closing: "You can't plan your future around something you can't predict.",
  },

  building: {
    status: 'final' as CopyStatus,
    eyebrow: "What we're building",
    headline: 'A Better Split Starts With a Better Connection.',
    questions: [
      'What if you could spend less time chasing views and more time creating something valuable?',
      'What if the people who chose to follow you could easily find your posts?',
      'What if you could build a community that keeps coming back?',
    ],
    answer: "That's what we're building at Splitpost.",
    body: 'We want to help you reach your followers, build trust and create more ways to earn from your content.',
    goalIntro: 'And our goal is simple:',
    /** The founder's goal statement, verbatim (lowercase, no full stop). Do not edit. */
    goal: 'we want to create a platform that generates sustainable pay for content creators who have something valuable to say',
    /** Beside the screens: what they are, and what they don't promise. */
    note: `${DISCLOSURES.stillTesting} ${DISCLOSURES.noGuarantee}`,
    mockupLabel: `${DISCLOSURES.concept} · ${DISCLOSURES.sampleData}`,
  },

  /**
   * FIND YOUR PATH: what Splitpost offers creators, members and advertisers.
   * One account and one sign up for everyone, so every card's button goes to
   * the same place. Advertising is requested from an account after joining,
   * never through a separate form.
   */
  paths: {
    status: 'approved-in-principle' as CopyStatus,
    eyebrow: 'Find your path',
    headline: 'One Account. Every Way to Take Part.',
    intro: 'Everyone joins Splitpost the same way. Share your own posts, support the people you love, and advertise once your request is approved.',
    cards: [
      {
        id: 'creators',
        tag: 'For creators',
        title: 'Share what you know.',
        body: 'Post for the people who chose to follow you. Your newest posts wait for them in their Following feed, and who looks is always their choice.',
      },
      {
        id: 'members',
        tag: 'For members and fans',
        title: 'Support the creators you value.',
        body: 'Follow the people you care about and help their communities grow. During the pilot, your support can be recognized with perks.',
      },
      {
        id: 'advertisers',
        tag: 'For advertisers',
        title: 'Reach people who care about your topic.',
        body: 'Join like everyone else, then ask to advertise from your account. Every request is reviewed, and every ad is clearly labelled.',
      },
    ],
    note: 'Every account can do all three, so you never have to pick a side.',
  },

  creators: {
    status: 'final' as CopyStatus,
    eyebrow: "Who we're building for",
    headline: 'Different Creators. The Same Problem.',
    groups: [
      {
        title: "You're growing, but not earning.",
        body: "Your followers keep growing. You spend hours making content. But you still can't see much reward for your work.",
        photo: 'A creator editing a video late at night, phone analytics beside the laptop.',
      },
      {
        title: 'You have something worth sharing.',
        body: "You teach, cook, create or share what you know. You don't need to be famous. You just want your work to reach people who value it.",
        photo: 'An older teacher filming a lesson at a whiteboard, or a cook recording in a home kitchen.',
      },
      {
        title: 'You want to make this your career.',
        body: "You dream of creating full-time. But it's hard to leave your job when you don't know what you'll earn next month.",
        photo: 'A maker in a small workshop, recording how a product is made.',
      },
    ],
  },

  betterSplit: {
    status: 'final' as CopyStatus,
    eyebrow: 'A better split',
    headline: 'More Connection. More Ways to Earn.',
    body: [
      'Imagine opening Splitpost and seeing posts from the people you chose to follow, starting with the newest.',
      'Imagine being a creator and knowing your followers have a place to find your latest work, without needing every post to go viral.',
      'Now imagine your biggest supporters being recognized too.',
      'The person who introduces a friend to your content. The person who keeps showing up. The people who help your community grow.',
      'On Splitpost, we want those relationships to matter.',
      'During the pilot, eligible fans can earn Connection Points and receive noncash recognition or perks. In the future, we want eligible fans to share in the money that qualifying content earns.',
    ],
    closing: 'You create the post. Your community helps it grow. A better split gives more people a reason to succeed together.',
    /** The founder's three pilot disclosures, word for word. */
    disclosures: [
      'Connection Points have no cash value.',
      'Fans will not receive cash rewards during the pilot.',
      'Future revenue sharing depends on eligibility, verification and legal and financial requirements.',
    ],
    diagram: { creator: 'Creator', post: 'Post', community: 'Community', creates: 'creates', grows: 'grows', recognizes: 'recognizes' },
  },

  vision: {
    status: 'final' as CopyStatus,
    eyebrow: 'Our bigger vision',
    headline: 'What If Creating Content Could Be a Real Career?',
    body: [
      'Imagine a world where someone who teaches, entertains or shares something useful can build a business around it.',
      "Where creators don't need millions of followers before their work can start to matter.",
      'Where making content is respected as real work.',
      'Some people will create part-time. Others will make it their full-time career.',
      'We want Splitpost to help make both possible.',
    ],
    /** Required: this is a long-term vision, not a promise of income during the pilot. */
    disclosure: 'This is our long-term vision, not a promise of income during the pilot.',
    photo: 'A creator doing meaningful work: a tailor teaching a sewing class on camera, or a woodworker filming a tutorial.',
  },

  invitation: {
    status: 'final' as CopyStatus,
    headline: 'Help Us Build a Better Split.',
    body: [
      'Social media can be better.',
      'Better for people who create.',
      'Better for people who support them.',
      'And better for everyone who believes valuable content deserves more than just views.',
    ],
    shape: "We're building Splitpost, and we'd love you to help shape it.",
    close: 'Join the waitlist. Be part of a better split.',
    /** The same line once registration is authorized (see waitlistCta). */
    closeRegistration: 'Join Splitpost. Be part of a better split.',
    cta: 'Join the Waitlist',
    signOff: 'Muyiwa Omosa, Founder of Splitpost',
  },

  /**
   * PILOT DETAILS, the one disclosure band (BRD-10), just before the
   * invitation so it sits near signup. It gathers the pilot's limits in one
   * place; /join shows the same list, word for word.
   */
  pilot: {
    status: 'approved-in-principle' as CopyStatus,
    eyebrow: 'Pilot details',
    headline: 'What the Pilot Is, Plainly.',
    intro: "Splitpost is still being built and tested with a small group of people. Here's what that means for you.",
    details: [
      DISCLOSURES.invitationOnly,
      DISCLOSURES.cpNotMoney,
      DISCLOSURES.simulated,
      DISCLOSURES.noGuarantee,
      DISCLOSURES.stillTesting,
      DISCLOSURES.creatorSupportTest,
      DISCLOSURES.adsAreDemos,
      DISCLOSURES.pilotStart,
    ],
  },

  /**
   * The three product illustrations (concept, sample data), one benefit each,
   * told from the creator's side. Headlines are the founder's own wording.
   */
  illustrations: {
    tag: `${DISCLOSURES.concept} illustration · ${DISCLOSURES.sampleData}`,
    following: {
      title: 'Your followers can find your posts.',
      callouts: [
        'A Following feed with only the people each follower chose.',
        'Newest first, every time. No algorithm reorders the posts people follow.',
        'Your latest post is waiting where your followers already look.',
      ],
      note: 'Following gives your posts a place to be found. Who looks is still up to your followers.',
    },
    community: {
      title: "Understand the community you're building.",
      callouts: [
        "See who's new, who keeps coming back and who's always there.",
        'Know the supporters behind your community, by name.',
        'Learn what brings people back, not just what got clicks.',
      ],
      note: 'A concept for creator insights. What the pilot will show is still being designed.',
    },
    referral: {
      title: 'Your supporters can help you grow.',
      steps: [
        { title: 'Leo shares Priya’s post with a friend.', detail: 'Sharing on its own earns nothing.' },
        { title: 'Sam creates a verified account.', detail: 'One real person, one account.' },
        { title: 'Sam follows Priya.', detail: 'Because Sam likes what she makes.' },
        { title: 'Leo receives Connection Points with Priya.', detail: 'No cash value. Only for perks Priya offers, during the pilot.' },
      ],
      outcomes: [
        { who: 'Priya', gets: 'A new follower who chose her.' },
        { who: 'Sam', gets: 'A creator worth following.' },
        { who: 'Leo', gets: 'Recognized for helping her grow.' },
      ],
      rule: 'Points count only once the new follow is verified, with daily and monthly caps and fraud review.',
    },
  },
  peopleNote: 'All people and posts in product screens are samples, and their numbers are sample data.',
  /** Shown on every photo placeholder until the founder approves the shortlist. */
  photoPending: 'Photo pending approval',
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
