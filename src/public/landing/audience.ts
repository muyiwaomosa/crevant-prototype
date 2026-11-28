// Who Splitpost is for, in more detail (SP-BRAND-003 follow-up, Nov 28:
// BR-003, BR-004 and BR-005). The layout is built; the words are NOT.
//
// The founder writes and approves every line that goes here. Until then the
// lists stay empty and the homepage renders nothing for them: no placeholder,
// no sample text. To publish, add the approved entries exactly as approved,
// then update the tests in public-site.test.tsx that pin these lists.
//
//   PAIN_POINTS       BR-003: the situations ideal creators and supporters
//                     recognize themselves in. `audience` says who it is for.
//   USE_CASES         BR-004: relatable creators beyond influencers, each in
//                     one launch category.
//   PROBLEM_SOLUTION  BR-005: each pain point and the Splitpost answer to it.
//
// Safeguards (BR-006): no guaranteed earnings, no automatic qualification,
// and never a claim that every follower sees every post. Pilot rewards are
// simulated; the disclosures elsewhere on the page stay as they are.

/** The three launch categories (BR-004). */
export const LAUNCH_CATEGORIES = ['Faith & Spirituality', 'Personal Development', 'Business & Entrepreneurship'] as const
export type LaunchCategory = (typeof LAUNCH_CATEGORIES)[number]

export type PainPoint = { id: string; audience: 'creator' | 'supporter'; text: string }
export type UseCase = { id: string; category: LaunchCategory; title: string; body: string }
export type ProblemSolution = { id: string; problem: string; solution: string }

/** Founder-approved entries only. Empty until the wording is approved. */
export const PAIN_POINTS: readonly PainPoint[] = []
export const USE_CASES: readonly UseCase[] = []
export const PROBLEM_SOLUTION: readonly ProblemSolution[] = []

/** Optional headings for each block, also founder-approved; a block shows only when it has entries. */
export const AUDIENCE_HEADINGS: { painPoints?: string; useCases?: string; problemSolution?: string } = {}
