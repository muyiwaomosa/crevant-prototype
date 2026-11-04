// Connection Points (CP) engine.
//
// Every function here is pure: it takes the persisted state and returns a new
// state plus an outcome. The React store only calls these, which keeps the
// rules testable and ready to move to a server. Running on the client, they
// cannot stop someone who edits localStorage directly.

import type { EarnAction, LedgerEntry, PersistedState, Redemption, Reward } from '../types'
import { dayKey } from './time'
import { ACTIVE_MODEL, type PointsModel } from './wallets'
import { assessComment, COMMENT_ISSUE_TEXT, type CommentIssue } from './commentQuality'

export interface EarnRule {
  title: string
  points: number
  /** How many times per day this action can earn CP, across all creators. */
  dailyLimit: number
  /** Ledger label, followed by the creator's name. */
  label: string
  description: string
}

export const EARN_RULES: Record<EarnAction, EarnRule> = {
  follow: {
    title: 'Follow a creator',
    points: 10,
    dailyLimit: 5,
    label: 'Followed',
    description: 'Held while you follow them. Unfollowing takes these 10 CP back.',
  },
  comment: {
    title: 'Comment on a post',
    points: 5,
    dailyLimit: 6,
    label: 'Commented on a post by',
    description: 'Once per post. Needs 12+ characters, 3+ different words, no links, and no copy of an earlier comment.',
  },
  watch: {
    title: 'Watch a video',
    points: 3,
    dailyLimit: 5,
    label: 'Watched a video by',
    description: 'Once per video. Play at least 85% of it; skipping to the end does not count.',
  },
  like: {
    title: 'Like a post',
    points: 2,
    dailyLimit: 10,
    label: 'Liked a post by',
    description: 'Once per post. Unliking and liking again earns nothing.',
  },
  save: {
    title: 'Save a post',
    points: 1,
    dailyLimit: 10,
    label: 'Saved a post by',
    description: 'Once per post.',
  },
}

export const EARN_ORDER: EarnAction[] = ['follow', 'comment', 'watch', 'like', 'save']

export type NoEarnReason = 'own' | 'already' | 'limit' | CommentIssue

export type EarnOutcome =
  | { earned: true; points: number; settled: number; balance: number }
  | { earned: false; reason: NoEarnReason }

export interface Ctx {
  now: number
  id: () => string
  model?: PointsModel
}

// ---------------------------------------------------------------------------
// Balances

/** Spendable balance per wallet. In the creator model the wallet is the creator id. */
export function balancesByWallet(ledger: LedgerEntry[], model: PointsModel = ACTIVE_MODEL): Record<string, number> {
  const out: Record<string, number> = {}
  for (const e of ledger) {
    const w = model.walletForCreator(e.creatorId)
    out[w] = (out[w] ?? 0) + e.amount
  }
  return out
}

export function balanceWith(ledger: LedgerEntry[], creatorId: string, model: PointsModel = ACTIVE_MODEL): number {
  const wallet = model.walletForCreator(creatorId)
  let sum = 0
  for (const e of ledger) if (model.walletForCreator(e.creatorId) === wallet) sum += e.amount
  return sum
}

/** Total CP ever granted for interactions, across all creators. Not spendable. */
export function lifetimeEarned(ledger: LedgerEntry[]): number {
  return ledger.reduce((sum, e) => (e.kind in EARN_RULES && e.amount > 0 ? sum + e.amount : sum), 0)
}

export function earnedTodayCount(ledger: LedgerEntry[], action: EarnAction, now: number): number {
  const today = dayKey(now)
  let count = 0
  for (const e of ledger) if (e.kind === action && e.amount > 0 && dayKey(e.at) === today) count++
  return count
}

// ---------------------------------------------------------------------------
// Earning

/**
 * Add a grant to the ledger. If the wallet owes CP from an earlier follow
 * reversal, part of the grant settles that debt first, recorded as its own entry.
 */
function grant(
  state: PersistedState,
  action: EarnAction,
  creatorId: string,
  creatorName: string,
  refId: string,
  ctx: Ctx,
): { state: PersistedState; points: number; settled: number } {
  const model = ctx.model ?? ACTIVE_MODEL
  const rule = EARN_RULES[action]
  const wallet = model.walletForCreator(creatorId)
  const owed = state.clawbacks[wallet] ?? 0
  const settled = Math.min(owed, rule.points)
  const entries: LedgerEntry[] = [
    { id: ctx.id(), at: ctx.now, amount: rule.points, kind: action, label: `${rule.label} ${creatorName}`, creatorId, refId },
  ]
  if (settled > 0) {
    entries.unshift({
      id: ctx.id(),
      at: ctx.now,
      amount: -settled,
      kind: 'clawback',
      label: `Settled ${settled} CP owed from an earlier unfollow of ${creatorName}`,
      creatorId,
      refId,
    })
  }
  const clawbacks = { ...state.clawbacks }
  if (owed - settled > 0) clawbacks[wallet] = owed - settled
  else delete clawbacks[wallet]
  return { state: { ...state, ledger: [...entries, ...state.ledger], clawbacks }, points: rule.points, settled }
}

export interface InteractionInput {
  action: Exclude<EarnAction, 'follow'>
  /** The post (or other item) the interaction was with. */
  refId: string
  creatorId: string
  creatorName: string
  isOwnContent: boolean
  /** Required for comments: the new comment and the fan's earlier comments. */
  comment?: { text: string; previous: string[] }
}

/** Like, save, comment, or watch. Each earns at most once per item. */
export function earnForInteraction(state: PersistedState, input: InteractionInput, ctx: Ctx): { state: PersistedState; outcome: EarnOutcome } {
  if (input.isOwnContent) return { state, outcome: { earned: false, reason: 'own' } }
  const key = `${input.action}:${input.refId}`
  if (state.earnedKeys[key]) return { state, outcome: { earned: false, reason: 'already' } }
  if (input.action === 'comment') {
    const issue = assessComment(input.comment?.text ?? '', input.comment?.previous ?? [])
    if (issue) return { state, outcome: { earned: false, reason: issue } }
  }
  if (earnedTodayCount(state.ledger, input.action, ctx.now) >= EARN_RULES[input.action].dailyLimit) {
    return { state, outcome: { earned: false, reason: 'limit' } }
  }
  const g = grant(state, input.action, input.creatorId, input.creatorName, input.refId, ctx)
  const next = { ...g.state, earnedKeys: { ...g.state.earnedKeys, [key]: ctx.now } }
  return { state: next, outcome: { earned: true, points: g.points, settled: g.settled, balance: balanceWith(next.ledger, input.creatorId, ctx.model) } }
}

/**
 * Following grants a follow bonus that is held only while the fan keeps following.
 * Following, unfollowing and following again therefore nets zero.
 */
export function earnForFollow(
  state: PersistedState,
  input: { creatorId: string; creatorName: string; isSelf: boolean },
  ctx: Ctx,
): { state: PersistedState; outcome: EarnOutcome } {
  if (input.isSelf) return { state, outcome: { earned: false, reason: 'own' } }
  if (state.followBonus[input.creatorId]) return { state, outcome: { earned: false, reason: 'already' } }
  if (earnedTodayCount(state.ledger, 'follow', ctx.now) >= EARN_RULES.follow.dailyLimit) {
    return { state, outcome: { earned: false, reason: 'limit' } }
  }
  const g = grant(state, 'follow', input.creatorId, input.creatorName, input.creatorId, ctx)
  const next = { ...g.state, followBonus: { ...g.state.followBonus, [input.creatorId]: ctx.now } }
  return { state: next, outcome: { earned: true, points: g.points, settled: g.settled, balance: balanceWith(next.ledger, input.creatorId, ctx.model) } }
}

export interface ReversalOutcome {
  /** CP removed from the balance now. */
  reversed: number
  /** CP the balance could not cover, settled from future grants with this creator. */
  owed: number
}

/** Take back a held follow bonus. Never makes a balance negative. */
export function reverseFollow(
  state: PersistedState,
  input: { creatorId: string; creatorName: string },
  ctx: Ctx,
): { state: PersistedState; outcome: ReversalOutcome } {
  if (!state.followBonus[input.creatorId]) return { state, outcome: { reversed: 0, owed: 0 } }
  const model = ctx.model ?? ACTIVE_MODEL
  const wallet = model.walletForCreator(input.creatorId)
  const bonus = EARN_RULES.follow.points
  const available = Math.max(0, balanceWith(state.ledger, input.creatorId, model))
  const reversed = Math.min(bonus, available)
  const owed = bonus - reversed
  const followBonus = { ...state.followBonus }
  delete followBonus[input.creatorId]
  const ledger =
    reversed > 0
      ? [
          {
            id: ctx.id(),
            at: ctx.now,
            amount: -reversed,
            kind: 'reversal' as const,
            label: `Follow bonus returned after unfollowing ${input.creatorName}`,
            creatorId: input.creatorId,
            refId: input.creatorId,
          },
          ...state.ledger,
        ]
      : state.ledger
  const clawbacks = { ...state.clawbacks }
  if (owed > 0) clawbacks[wallet] = (clawbacks[wallet] ?? 0) + owed
  return { state: { ...state, ledger, followBonus, clawbacks }, outcome: { reversed, owed } }
}

// ---------------------------------------------------------------------------
// Rewards

export type Eligibility =
  | { ok: true; balance: number }
  | { ok: false; reason: 'own'; balance: number }
  | { ok: false; reason: 'redeemed'; balance: number }
  | { ok: false; reason: 'soldOut'; balance: number }
  | { ok: false; reason: 'follow'; balance: number; needed: number }
  | { ok: false; reason: 'points'; balance: number; needed: number }

export function remainingStock(state: Pick<PersistedState, 'redemptions'>, reward: Reward): number | null {
  if (reward.stock === null) return null
  const mine = state.redemptions.filter((r) => r.rewardId === reward.id).length
  return Math.max(0, reward.stock - reward.claimedByOthers - mine)
}

export function rewardEligibility(
  state: PersistedState,
  reward: Reward,
  opts: { selfId: string; model?: PointsModel },
): Eligibility {
  const model = opts.model ?? ACTIVE_MODEL
  const wallet = model.walletForReward(reward)
  const balance = Math.max(0, balancesByWallet(state.ledger, model)[wallet] ?? 0)
  const needed = Math.max(0, reward.cost - balance)
  if (reward.creatorId === opts.selfId) return { ok: false, reason: 'own', balance }
  if (state.redemptions.some((r) => r.rewardId === reward.id)) return { ok: false, reason: 'redeemed', balance }
  const left = remainingStock(state, reward)
  if (left !== null && left <= 0) return { ok: false, reason: 'soldOut', balance }
  if (!state.following.includes(reward.creatorId)) return { ok: false, reason: 'follow', balance, needed }
  if (balance < reward.cost) return { ok: false, reason: 'points', balance, needed }
  return { ok: true, balance }
}

/** Progress from 0 to 1 toward a reward using only that creator's balance. */
export function rewardProgress(balance: number, cost: number): number {
  if (cost <= 0) return 1
  return Math.min(1, Math.max(0, balance) / cost)
}

/**
 * Redeem a reward. Re-checks eligibility against the state passed in, so
 * calling it twice in a row on the latest state can never spend twice.
 */
export function redeemReward(
  state: PersistedState,
  reward: Reward,
  input: { creatorName: string; code: string; selfId: string },
  ctx: Ctx,
): { state: PersistedState; redemption: Redemption } | { state: PersistedState; error: Exclude<Eligibility, { ok: true }>['reason'] } {
  const status = rewardEligibility(state, reward, { selfId: input.selfId, model: ctx.model })
  if (!status.ok) return { state, error: status.reason }
  const redemption: Redemption = {
    id: ctx.id(),
    rewardId: reward.id,
    at: ctx.now,
    cost: reward.cost,
    code: input.code,
    rewardTitle: reward.title,
    creatorId: reward.creatorId,
  }
  const entry: LedgerEntry = {
    id: ctx.id(),
    at: ctx.now,
    amount: -reward.cost,
    kind: 'redeem',
    label: `Redeemed “${reward.title}” from ${input.creatorName}`,
    creatorId: reward.creatorId,
    refId: redemption.id,
  }
  return { state: { ...state, redemptions: [redemption, ...state.redemptions], ledger: [entry, ...state.ledger] }, redemption }
}

// ---------------------------------------------------------------------------
// Copy

export function explainNoEarn(action: EarnAction, reason: NoEarnReason): string {
  switch (reason) {
    case 'already':
      return action === 'follow'
        ? 'You already hold the follow bonus for this creator.'
        : 'You already earned CP for this one. Points are earned once per item.'
    case 'limit':
      return `Daily limit reached for this action (${EARN_RULES[action].dailyLimit} per day). It still counts, just without CP.`
    case 'own':
      return 'Engaging with your own posts does not earn CP.'
    default:
      return COMMENT_ISSUE_TEXT[reason]
  }
}
