// Connection Points (CP) rules engine.
//
// This module is pure: it only reads state and returns a decision.
// In a production version these same rules would run on the server so
// that the client cannot award itself points.

import type { EarnAction, LedgerEntry, PersistedState } from '../types'
import { dayKey } from './time'

export interface EarnRule {
  points: number
  /** Name of the action, e.g. "Like a post". */
  title: string
  /** How many times per day this action can earn CP. */
  dailyLimit: number
  /** Short label used in the activity history. */
  label: string
  /** Explanation shown on the Points page. */
  description: string
}

export const EARN_RULES: Record<EarnAction, EarnRule> = {
  checkin: {
    title: 'Daily check in',
    points: 5,
    dailyLimit: 1,
    label: 'Daily check in',
    description: 'Open Crevant and check in once a day.',
  },
  follow: {
    title: 'Follow a creator',
    points: 10,
    dailyLimit: 5,
    label: 'Followed',
    description: 'Follow a creator. Earned once per creator, even if you unfollow and follow again.',
  },
  comment: {
    title: 'Comment on a post',
    points: 5,
    dailyLimit: 6,
    label: 'Commented on a post by',
    description: 'Leave a comment of at least 12 characters. Earned once per post.',
  },
  watch: {
    title: 'Watch a video',
    points: 3,
    dailyLimit: 5,
    label: 'Watched a video by',
    description: 'Watch a video all the way to the end. Earned once per video.',
  },
  like: {
    title: 'Like a post',
    points: 2,
    dailyLimit: 10,
    label: 'Liked a post by',
    description: 'Like a post. Earned once per post, so unliking and liking again earns nothing.',
  },
  save: {
    title: 'Save a post',
    points: 1,
    dailyLimit: 10,
    label: 'Saved a post by',
    description: 'Save a post to come back to. Earned once per post.',
  },
}

export const WELCOME_BONUS = 50
export const MIN_COMMENT_LENGTH = 12

export type EarnDecision =
  | { ok: true; points: number; key: string }
  | { ok: false; reason: 'already' | 'limit' | 'own' | 'tooShort'; key: string }

export function earnKey(action: EarnAction, refId: string): string {
  return `${action}:${refId}`
}

export function earnedTodayCount(ledger: LedgerEntry[], action: EarnAction, now: number): number {
  const today = dayKey(now)
  let count = 0
  for (const entry of ledger) {
    if (entry.kind === action && dayKey(entry.at) === today) count++
  }
  return count
}

export function evaluateEarn(
  state: Pick<PersistedState, 'earnedKeys' | 'ledger'>,
  action: EarnAction,
  refId: string,
  opts: { now: number; isOwnContent?: boolean },
): EarnDecision {
  const key = earnKey(action, refId)
  if (opts.isOwnContent) return { ok: false, reason: 'own', key }
  if (state.earnedKeys[key]) return { ok: false, reason: 'already', key }
  const rule = EARN_RULES[action]
  if (earnedTodayCount(state.ledger, action, opts.now) >= rule.dailyLimit) {
    return { ok: false, reason: 'limit', key }
  }
  return { ok: true, points: rule.points, key }
}

export function balanceOf(ledger: LedgerEntry[]): number {
  return ledger.reduce((sum, e) => sum + e.amount, 0)
}

export function lifetimeEarned(ledger: LedgerEntry[]): number {
  return ledger.reduce((sum, e) => (e.amount > 0 ? sum + e.amount : sum), 0)
}

/** Explain why an action did not earn points, in plain language. */
export function explainNoEarn(action: EarnAction, reason: 'already' | 'limit' | 'own' | 'tooShort'): string {
  const rule = EARN_RULES[action]
  switch (reason) {
    case 'already':
      return 'You already earned CP for this one. Points are earned once per item.'
    case 'limit':
      return `Daily limit reached for this action (${rule.dailyLimit} per day). It still counts, just without CP.`
    case 'own':
      return 'Engaging with your own posts does not earn CP.'
    case 'tooShort':
      return `Comments need at least ${MIN_COMMENT_LENGTH} characters to earn CP.`
  }
}
