// Splitpost claim safeguards: the required disclosures, the provisional
// Connection Points values, and a checker that flags misleading money claims.
//
// Nothing renders from this file yet. The homepage (src/public/landing) and
// the guided tour will import these, and their tests will run
// findMisleadingClaims over every rendered word (later PRs). The rules:
//  * no promise of money, earnings, payouts or income;
//  * Connection Points are never money and never convert to it;
//  * future revenue sharing is always described as a vision, never as
//    something that exists today;
//  * the provisional advertising allocation is never published.

import { EARN_RULES } from '../../lib/points'

/** Disclosures every Splitpost surface must be able to show, word for word. */
export const DISCLOSURES = {
  noFanCash: 'Fans receive no cash rewards during the pilot.',
  cpNoCashValue: 'Connection Points have no cash value.',
  cpRules: "They can't be bought, sold, transferred or converted to cash.",
  cpNotMoney: "Connection Points are not money. They have no cash value and can't be bought, sold, transferred or converted to cash.",
  simulated: 'Rewards and earnings are simulated during the pilot. Nothing is paid to anyone.',
  cpCreatorSpecific: 'Connection Points belong to your relationship with one creator.',
  visionOnly: "It's not part of the pilot, and it will depend on eligibility, verification, and legal and financial requirements.",
  noGuarantee: 'No guaranteed reach, views or earnings.',
  invitationOnly: "Invitation-only, for adults 18 and older. Joining doesn't guarantee a place.",
  stillTesting: 'Features are still being built and tested.',
  creatorSupportTest: 'A few selected creators are testing direct support from their fans.',
  adsAreDemos: 'Any ads you see are labelled demonstrations.',
  pilotStart: 'The 60 days begin when invited people can use Splitpost.',
  sampleData: 'Sample data',
  concept: 'Concept',
} as const

export type Disclosure = keyof typeof DISCLOSURES

/** The label every provisional value carries wherever it's shown. */
export const PROVISIONAL_LABEL = 'Provisional sample value, not yet validated'

export interface ProvisionalCpRule {
  action: 'follow' | 'comment' | 'watch' | 'like' | 'save' | 'verified_referral' | 'share'
  title: string
  points: number
  limit: string
  /** Always false until pilot data has been reviewed and the founder approves final values. */
  validated: false
  label: typeof PROVISIONAL_LABEL
}

const provisional = (action: ProvisionalCpRule['action'], title: string, points: number, limit: string): ProvisionalCpRule => ({
  action,
  title,
  points,
  limit,
  validated: false,
  label: PROVISIONAL_LABEL,
})

/**
 * The qualifying participation Connection Points can recognize. A verified
 * referral is one of several. Values and limits are provisional samples
 * pending pilot validation. The first five match the sample tour's rules
 * engine (src/lib/points.ts), which a test checks; the referral is new.
 * Sharing on its own earns nothing, to discourage spam.
 */
export const PROVISIONAL_CP_RULES: readonly ProvisionalCpRule[] = [
  provisional('follow', 'Follow a creator', EARN_RULES.follow.points, 'Once per creator, held while you follow'),
  provisional('comment', 'Meaningful comment', EARN_RULES.comment.points, 'Once per post, with a daily cap'),
  provisional('watch', 'Watch a video', EARN_RULES.watch.points, 'Once per video, with a daily cap'),
  provisional('like', 'Like a post', EARN_RULES.like.points, 'Once per post, with a daily cap'),
  provisional('save', 'Save a post', EARN_RULES.save.points, 'Once per post, with a daily cap'),
  provisional('verified_referral', 'Verified referral', 25, 'Daily and monthly caps, with fraud review'),
  provisional('share', 'Share a post', 0, 'Sharing alone earns nothing'),
]

// ---------------------------------------------------------------------------
// The misleading claims checker.

export interface ClaimFinding {
  rule: string
  sentence: string
}

/** Words that turn a money phrase into a denial ("no cash rewards"). */
const NEGATION = /\b(no|not|never|none|without|can't|cannot|can not|don't|doesn't|won't|isn't|aren't|nor)\b|n't\b/i
/** Words that mark a sentence as describing the future vision. */
const FUTURE = /\b(vision|future|working toward|long-term|someday|one day|would|plan|planned|goal|aim)\b/i

/** The provisional allocation, in any of the ways it could be written. */
const ALLOCATION: RegExp[] = [
  /\b40\s*\/\s*20\s*\/\s*40\b/,
  /\b40\s*-\s*20\s*-\s*40\b/,
  /\b(40|20)\s*(%|percent)[^.]{0,60}\b(creators?|fans?|fan pool|pool|splitpost|ad(vertising)? revenue|revenue)\b/i,
  /\b(creators?|fans?|fan pool|pool|splitpost|ad(vertising)? revenue|revenue)\b[^.]{0,60}\b(40|20)\s*(%|percent)/i,
]

/**
 * True when the money phrase is denied: a negative word comes before it or
 * inside it ("receive no cash", "No guaranteed earnings"). A negative word
 * after it doesn't count, and neither does "not only".
 */
function denied(sentence: string, match: RegExpExecArray): boolean {
  const upToEnd = sentence.slice(0, match.index + match[0].length).replace(/\bnot only\b/gi, '')
  return NEGATION.test(upToEnd)
}

interface Rule {
  name: string
  pattern: RegExp
  /** True when the sentence is allowed despite matching. */
  allowed?: (sentence: string, match: RegExpExecArray) => boolean
}

const RULES: Rule[] = [
  { name: 'a currency amount', pattern: /[$€£¥₦]\s?\d|\b\d[\d,.]*\s?(usd|cad|eur|gbp|dollars?|euros?|pounds?)\b/i },
  { name: 'the provisional revenue allocation', pattern: new RegExp(ALLOCATION.map((r) => r.source).join('|'), 'i') },
  {
    name: 'a promise of money, pay or income',
    pattern:
      /\b(earn|earns|earning|make|makes|get|gets|receive|receives|win|wins)\b[^.]{0,30}\b(money|cash|paid|income|payouts?|dollars?)\b|\bget paid\b|\bpaid out\b|\bpayouts?\b/i,
    // Also allowed: a sentence about how platforms make money today ("Platforms earn money when…"), which promises nothing to anyone.
    allowed: (s, m) => denied(s, m) || /^Platforms\b/.test(s),
  },
  {
    name: 'a guarantee of earnings, reach or rewards',
    pattern:
      /\bguarante\w*\b[^.]{0,40}\b(earn\w*|income|money|cash|pay\w*|rewards?|reach|views|growth|followers)\b|\b(earn\w*|income|money|cash|rewards?)\b[^.]{0,40}\bguarante\w*\b/i,
    allowed: denied,
  },
  {
    name: 'Connection Points described as money',
    pattern:
      /\b(connection points|cp)\b[^.]{0,60}\b(cash|money|worth|withdraw\w*|cash(ed)? out|redeem\w* for (cash|money)|convert\w*|exchange\w*|sell|sold|buy|bought|transfer\w*)\b|\b(sell|buy|purchase|transfer|trade|exchange|convert|cash out|withdraw)\b[^.]{0,30}\b(connection points|cp)\b/i,
    allowed: denied,
  },
  {
    name: 'revenue sharing described as existing today',
    pattern: /\b(revenue|ad(vertising)? (revenue|income)|profits?)\b/i,
    // A vision marker or a denial anywhere in the sentence: "Revenue sharing is not part of the pilot."
    allowed: (s) => FUTURE.test(s) || NEGATION.test(s.replace(/\bnot only\b/gi, '')),
  },
]

/** Splits text into sentences, keeping list items and lines apart. */
export function sentences(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+|\n+/)
    .map((s) => s.trim())
    .filter(Boolean)
}

/** Every sentence that breaks a claim rule. Empty means the text is safe to publish. */
export function findMisleadingClaims(text: string): ClaimFinding[] {
  const out: ClaimFinding[] = []
  for (const sentence of sentences(text)) {
    for (const rule of RULES) {
      const match = rule.pattern.exec(sentence)
      if (match && !rule.allowed?.(sentence, match)) out.push({ rule: rule.name, sentence })
    }
  }
  return out
}

/** True if the text contains the provisional allocation in any form. */
export function mentionsProvisionalAllocation(text: string): boolean {
  return ALLOCATION.some((r) => r.test(text))
}
