// The Splitpost homepage copy, in one place. Section components and tests
// both read from here, so the words on the page are exactly these.
//
// Source of truth: docs/website-brief.md (the Website Redesign Master
// Implementation Brief, approved 2026-11-18). Every string below is copied
// from it word for word; copy.test.ts checks each section line by line, in
// order. Do not rewrite, shorten or rearrange any of it without the
// founder's approval. Design and layout may change; the words may not.
//
// Six sections, in order:
//   HERO (HOOK), THE PROBLEM (WHY), THE PEOPLE BEHIND THE POSTS (WHO),
//   A BETTER FUTURE FOR CREATORS (WHERE), HOW SPLITPOST WORKS (HOW),
//   THE INVITATION (CTA).
//
// Revision history (all founder-approved, 2026-11-18): The Vision was merged
// into How Splitpost Works ("modified Option B"); then Sections 2 to 5 were
// replaced with the founder's revised wording, with the specific removals
// the founder decided. Then (2026-11-19) the sections were put in story
// order, HOOK, WHY, WHO, WHERE, HOW, CTA, and the transition line "What if
// the split worked differently?" moved from the end of The Problem to the
// end of A Better Future for Creators, just before How Splitpost Works.
// Later the same day: WHY was shortened so the platform problem comes first,
// and every line about fans now says they get their split through Connection
// Points, not a share of revenue (founder decision, 2026-11-19).
// docs/website-brief.md records every change.
//
// The pilot disclosures (PILOT_DISCLOSURES) are the founder's approved
// wording for the 60-day pilot, where fan rewards are simulated.

/** The signature brand line: the hero headline, the closing line and the footer tagline. */
export const BRAND_LINE = "Don't just post. Get your split."

/** The approved pilot disclosures, word for word (founder decision, 2026-11-18). */
export const PILOT_DISCLOSURES = {
  /** Hero, below the call to action. */
  hero: 'Invitation-only pilot for adults 18+. No guaranteed reach, views or earnings.',
  /** Section 4, beside Step 04: inline, discreet (founder decision, 2026-11-18; replaces the earlier card). */
  step04:
    '60-day pilot: Fans can earn and accumulate Connection Points for qualifying contributions. Reward fulfillment is simulated, and Connection Points have no cash value. Full details will be shared by email.',
  /** Section 7, beside the final call to action. */
  invitation:
    'Splitpost is currently preparing an invitation-only, 60-day pilot. Joining the waitlist does not guarantee participation. During the pilot, fans can earn and accumulate Connection Points for qualifying contributions. Reward fulfillment and advertising shown during the pilot are simulated, and Connection Points have no cash value. Future creator earnings will depend on eligibility, available qualifying revenue, and applicable legal and financial requirements.',
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
      "We're building a social network where creators have a new opportunity to earn—and the people who help them grow can be recognized and rewarded.",
    ],
    /** Shown as "Waitlist Opens Soon" while registration is closed (waitlist/status.ts). */
    cta: 'Join the Waitlist',
  },

  problem: {
    headline: 'Your content makes platforms money. But what about you?',
    /** Shortened WHY (founder approval, 2026-11-19): the platform problem comes in the opening three lines. */
    body: [
      'Think about how much time you spend creating content.',
      'Planning. Recording. Editing. Posting.',
      'You create the content. Your fans help it grow. The platforms make money.',
      'Your followers grow. Your views increase. People like, comment and share your posts.',
      'Every interaction brings more attention to the platforms. More engagement. More opportunities for them to make money.',
      'And what about the fans who help you grow?',
      'They share your content, recommend you to friends and bring new people into your community.',
      "They're helping you grow. But where's their split?",
      "But shouldn't more of that value come back to the people who helped create it?",
    ],
    /** Visually emphasized (layout only), in page order: the imbalance, the fans' question, and the final question. */
    emphasis: [
      'You create the content. Your fans help it grow. The platforms make money.',
      'And what about the fans who help you grow?',
      "But shouldn't more of that value come back to the people who helped create it?",
    ],
  },

  /** How Splitpost Works (founder-approved revision, 2026-11-18). */
  howItWorks: {
    eyebrow: 'HOW SPLITPOST WORKS',
    headline: 'Post. Connect. Grow. Split.',
    steps: [
      {
        number: '01',
        label: 'STEP 01 — POST',
        title: 'Create content worth sharing.',
        body: "You've got something to say, teach, show or create. Splitpost gives you a place to publish your content and build an audience around what matters to you.",
      },
      {
        number: '02',
        label: 'STEP 02 — CONNECT',
        title: "Your followers shouldn't have to search for you.",
        body: "People followed you because they want to see what you create. Splitpost is building a better way for them to find your posts, catch up on what they've missed and stay connected.",
      },
      {
        number: '03',
        label: 'STEP 03 — GROW',
        title: 'Your biggest supporters deserve recognition.',
        body: 'Your fans already help you grow. They share your content, recommend you to friends and introduce new people to your work. Splitpost is building a way to recognize qualifying contributions, starting with verified referrals.',
      },
      {
        number: '04',
        label: 'STEP 04 — SPLIT',
        title: 'When your content creates value, you deserve a share.',
        body: 'Our planned model gives creators a share of net eligible advertising revenue generated around their content, while fans get their split through Connection Points earned for qualifying contributions.',
      },
    ],
    closing: "Because success is better when it's shared.",
  },

  people: {
    eyebrow: 'THE PEOPLE BEHIND THE POSTS',
    headline: 'You built an audience. But can you build a future on it?',
    /** The approved body, in order, split only where the layout changes (no words added). */
    intro: [
      'You did everything they told you to do.',
      'You created content. You showed up consistently. You learned how the algorithm works. You kept posting, even when nobody was watching.',
      'And eventually, people started following you.',
      'Thousands of them. Maybe even hundreds of thousands.',
      "But there's something nobody prepared you for.",
    ],
    emphasis: "Having an audience doesn't mean you can depend on it.",
    /**
     * The three challenge cards, each holding its approved lines in order:
     * inconsistent reach, unpredictable earnings, a sustainable business.
     */
    challenges: [
      [
        'One post reaches thousands of people. The next barely reaches anyone.',
        "People follow you because they want your content, but you can't be sure they'll see it.",
      ],
      ["One month, your content earns something. The next, you're wondering what changed."],
      ["How do you build a business when you can't predict who will see your work—or what you'll earn from it?"],
    ],
    after: [
      'So you keep creating.',
      'You keep working another job to pay the bills.',
      'You keep hoping the next post will finally change things.',
      'And meanwhile, the platforms continue to benefit from the content you create and the attention you bring.',
      "You shouldn't have to keep creating without a clearer path to building something sustainable.",
    ],
    fanTransition: 'And what about the people who helped you get here?',
    fans: [
      'Your fans have been sharing your posts, recommending your content and introducing new people to your work.',
      "They've helped you grow.",
      'But when their contributions help create value, they rarely get recognized or rewarded for it.',
    ],
    closing: 'What if creators and their biggest supporters could grow together—and benefit together?',
  },

  future: {
    eyebrow: 'A BETTER FUTURE FOR CREATORS',
    headline: 'What if your next post could help build your future?',
    body: [
      'Imagine waking up excited to create.',
      "Not because you're hoping the algorithm finally notices you.",
      "But because you're building something meaningful around what you love.",
      'A community that chooses to stay connected.',
      'Supporters who have a reason to help you grow.',
      'And new opportunities to earn from the value your content creates.',
    ],
    closing: 'More than followers. More opportunities to build a future doing what you love.',
    /** The last line, after the closing. */
    signal: 'This is the future Splitpost is working toward.',
    /** The transition into How Splitpost Works, after the signal (moved from The Problem, founder decision 2026-11-19). */
    transition: 'What if the split worked differently?',
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
    /** The founder's sign-off beside the call to action, restored from the original site (founder decision). */
    signOff: 'Muyiwa Omosa, Founder of Splitpost',
  },

  /**
   * The hero's sample post, restored from the original site: a fictional
   * creator frustrated by unpredictable reach. Illustrative numbers, labelled
   * SAMPLE on the card. Never presented as a real person or a real result.
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
  split: {
    creatorTag: 'Created by Priya',
    communityTag: 'Grown by her community',
    /** A comment from Priya's community, replying to her post about reach. Sample person. */
    communityComment: { name: 'Ana', text: "Oh wow, I was wondering why I hadn't been seeing your content. I thought you stopped posting!" },
  },
} as const

/**
 * The footer note on every public page, restored word for word from the
 * original site (founder decision): the hero post is a sample, and the
 * photographs are stock images of models.
 */
export const PRODUCT_IMAGES_DISCLOSURE =
  'Product screens on this site are concepts with sample data. Photos show models from stock images, not Splitpost members.'

/** The header and footer links into the homepage (navigation labels, not section copy). */
export const SITE_NAV = {
  discover: 'Discover Splitpost',
  why: 'Why Splitpost',
  how: 'How It Works',
} as const

export type SectionKey = 'hero' | 'problem' | 'people' | 'future' | 'howItWorks' | 'invitation'

/** The section's approved lines, in the brief's order (labels excluded), for the word-for-word check. */
export function briefLines(key: SectionKey): string[] {
  const c = HOMEPAGE_COPY
  switch (key) {
    case 'hero':
      return [c.hero.headline, ...c.hero.body, c.hero.cta]
    case 'problem':
      return [c.problem.headline, ...c.problem.body]
    case 'howItWorks':
      return [c.howItWorks.eyebrow, c.howItWorks.headline, ...c.howItWorks.steps.flatMap((s) => [s.label, s.title, s.body]), c.howItWorks.closing]
    case 'people':
      return [
        c.people.eyebrow,
        c.people.headline,
        ...c.people.intro,
        c.people.emphasis,
        ...c.people.challenges.flat(),
        ...c.people.after,
        c.people.fanTransition,
        ...c.people.fans,
        c.people.closing,
      ]
    case 'future':
      return [c.future.eyebrow, c.future.headline, ...c.future.body, c.future.closing, c.future.signal, c.future.transition]
    case 'invitation':
      return [c.invitation.eyebrow, c.invitation.headline, c.invitation.secondaryHeadline, ...c.invitation.body, c.invitation.cta, c.invitation.brandLine]
  }
}

/** Every visitor-facing string in the homepage copy and the pilot disclosures, for the claim checks. */
export function allHomepageText(copy: unknown = [HOMEPAGE_COPY, PILOT_DISCLOSURES, PRODUCT_IMAGES_DISCLOSURE]): string[] {
  if (typeof copy === 'string') return [copy]
  if (Array.isArray(copy)) return copy.flatMap((c) => allHomepageText(c))
  if (copy && typeof copy === 'object') return Object.values(copy).flatMap((v) => allHomepageText(v))
  return []
}
