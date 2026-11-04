import { describe, expect, it } from 'vitest'
import {
  balanceWith,
  balancesByWallet,
  earnForFollow,
  earnForInteraction,
  EARN_RULES,
  lifetimeEarned,
  redeemReward,
  reverseFollow,
  rewardEligibility,
  rewardProgress,
} from './points'
import { UNIVERSAL } from './wallets'
import { DAY, NOW, freshState, like, makeCtx, reward } from '../test/helpers'
import type { PersistedState } from '../types'

const follow = (creatorId: string) => ({ creatorId, creatorName: creatorId.toUpperCase(), isSelf: false })
const SELF = 'me'

/** Earn n likes on distinct posts with a creator. */
function likeMany(state: PersistedState, creatorId: string, n: number, ctx = makeCtx()) {
  let s = state
  for (let i = 0; i < n; i++) s = earnForInteraction(s, like(`${creatorId}_p${i}`, creatorId), ctx).state
  return s
}

describe('creator specific balances', () => {
  it('earning with creator A only increases A', () => {
    const ctx = makeCtx()
    let s = freshState()
    s = earnForFollow(s, follow('a'), ctx).state // +10
    expect(balanceWith(s.ledger, 'a')).toBe(10)
    expect(balanceWith(s.ledger, 'b')).toBe(0)
  })

  it('redeeming B’s reward never touches A’s CP', () => {
    const ctx = makeCtx()
    let s = freshState({ following: ['a', 'b'] })
    s = earnForFollow(s, follow('a'), ctx).state
    s = earnForFollow(s, follow('b'), ctx).state
    s = likeMany(s, 'b', 3, ctx) // b = 16
    const r = redeemReward(s, reward({ id: 'rb', creatorId: 'b', cost: 15 }), { creatorName: 'B', code: 'X', selfId: SELF }, ctx)
    expect('redemption' in r).toBe(true)
    expect(balanceWith(r.state.ledger, 'a')).toBe(10)
    expect(balanceWith(r.state.ledger, 'b')).toBe(1)
  })

  it('CP earned with A cannot pay for B’s reward', () => {
    const ctx = makeCtx()
    let s = freshState({ following: ['a', 'b'] })
    s = likeMany(s, 'a', 9, ctx) // a = 18
    const elig = rewardEligibility(s, reward({ creatorId: 'b', cost: 15 }), { selfId: SELF })
    expect(elig).toMatchObject({ ok: false, reason: 'points', balance: 0, needed: 15 })
  })

  it('lifetime earned sums grants across creators but is separate from balances', () => {
    const ctx = makeCtx()
    let s = freshState({ following: ['a'] })
    s = likeMany(s, 'a', 5, ctx) // 10
    s = likeMany(s, 'b', 2, ctx) // 4
    s = redeemReward(s, reward({ cost: 10 }), { creatorName: 'A', code: 'X', selfId: SELF }, ctx).state
    expect(lifetimeEarned(s.ledger)).toBe(14)
    expect(balancesByWallet(s.ledger)).toEqual({ a: 0, b: 4 })
  })

  it('the same rules work under a universal model (modularity check)', () => {
    const ctx = { ...makeCtx(), model: UNIVERSAL }
    let s = freshState({ following: ['b'] })
    s = likeMany(s, 'a', 8, ctx) // 16 in the shared wallet
    expect(rewardEligibility(s, reward({ creatorId: 'b', cost: 15 }), { selfId: SELF, model: UNIVERSAL }).ok).toBe(true)
  })
})

describe('once per item and daily limits', () => {
  it('a post earns like CP only once, even after unlike and relike', () => {
    const ctx = makeCtx()
    let s = freshState()
    const first = earnForInteraction(s, like('p1'), ctx)
    s = first.state
    const second = earnForInteraction(s, like('p1'), ctx)
    expect(first.outcome).toMatchObject({ earned: true, points: 2 })
    expect(second.outcome).toEqual({ earned: false, reason: 'already' })
    expect(balanceWith(second.state.ledger, 'a')).toBe(2)
  })

  it('stops at the daily limit and resumes the next day', () => {
    let s = likeMany(freshState(), 'a', EARN_RULES.like.dailyLimit)
    const blocked = earnForInteraction(s, like('extra'), makeCtx())
    expect(blocked.outcome).toEqual({ earned: false, reason: 'limit' })
    const tomorrow = earnForInteraction(s, like('extra'), makeCtx(NOW + DAY))
    expect(tomorrow.outcome).toMatchObject({ earned: true })
    s = tomorrow.state
    expect(balanceWith(s.ledger, 'a')).toBe(2 * (EARN_RULES.like.dailyLimit + 1))
  })

  it('daily limits count across creators', () => {
    let s = likeMany(freshState(), 'a', 6)
    s = likeMany(s, 'b', 4)
    expect(earnForInteraction(s, like('c1', 'c'), makeCtx()).outcome).toEqual({ earned: false, reason: 'limit' })
  })

  it('self engagement never earns', () => {
    const r = earnForInteraction(freshState(), { ...like('mine'), isOwnContent: true }, makeCtx())
    expect(r.outcome).toEqual({ earned: false, reason: 'own' })
    expect(earnForFollow(freshState(), { ...follow('me'), isSelf: true }, makeCtx()).outcome).toEqual({ earned: false, reason: 'own' })
  })
})

describe('comment earning', () => {
  const comment = (text: string, previous: string[] = [], refId = 'p1') => ({
    action: 'comment' as const,
    refId,
    creatorId: 'a',
    creatorName: 'A',
    isOwnContent: false,
    comment: { text, previous },
  })

  it('a genuine comment earns 5', () => {
    expect(earnForInteraction(freshState(), comment('Trying this recipe tonight, thank you!'), makeCtx()).outcome).toMatchObject({ earned: true, points: 5 })
  })

  it('repeated characters earn nothing', () => {
    expect(earnForInteraction(freshState(), comment('aaaaaaaaaaaa'), makeCtx()).outcome).toEqual({ earned: false, reason: 'repeatedChars' })
  })

  it('a duplicate comment on another post earns nothing', () => {
    const text = 'Love the colours in this one'
    expect(earnForInteraction(freshState(), comment(text, [text], 'p2'), makeCtx()).outcome).toEqual({ earned: false, reason: 'duplicate' })
  })

  it('only one comment per post can earn', () => {
    const s = earnForInteraction(freshState(), comment('First thoughtful comment here'), makeCtx()).state
    expect(earnForInteraction(s, comment('A different second thought'), makeCtx()).outcome).toEqual({ earned: false, reason: 'already' })
  })
})

describe('follow bonus and reversal', () => {
  it('follow then unfollow returns the balance to where it was', () => {
    const ctx = makeCtx()
    let s = freshState()
    s = earnForFollow(s, follow('a'), ctx).state
    const r = reverseFollow(s, { creatorId: 'a', creatorName: 'A' }, ctx)
    expect(r.outcome).toEqual({ reversed: 10, owed: 0 })
    expect(balanceWith(r.state.ledger, 'a')).toBe(0)
  })

  it('repeated follow and unfollow cycles never farm CP', () => {
    const ctx = makeCtx()
    let s = freshState()
    for (let i = 0; i < 20; i++) {
      s = earnForFollow(s, follow('a'), ctx).state
      s = reverseFollow(s, { creatorId: 'a', creatorName: 'A' }, ctx).state
    }
    expect(balanceWith(s.ledger, 'a')).toBe(0)
  })

  it('following twice does not grant twice', () => {
    const ctx = makeCtx()
    const s = earnForFollow(freshState(), follow('a'), ctx).state
    expect(earnForFollow(s, follow('a'), ctx).outcome).toEqual({ earned: false, reason: 'already' })
  })

  it('unfollowing a creator without a held bonus changes nothing', () => {
    const s = likeMany(freshState(), 'a', 2)
    const r = reverseFollow(s, { creatorId: 'a', creatorName: 'A' }, makeCtx())
    expect(r.outcome).toEqual({ reversed: 0, owed: 0 })
    expect(r.state.ledger).toBe(s.ledger)
  })

  it('reversal after spending never goes negative; the rest is settled from later earnings', () => {
    const ctx = makeCtx()
    let s = freshState({ following: ['a'] })
    s = earnForFollow(s, follow('a'), ctx).state // 10
    s = likeMany(s, 'a', 3, ctx) // 16
    s = redeemReward(s, reward({ cost: 15 }), { creatorName: 'A', code: 'X', selfId: SELF }, ctx).state // 1
    const rev = reverseFollow(s, { creatorId: 'a', creatorName: 'A' }, ctx)
    expect(rev.outcome).toEqual({ reversed: 1, owed: 9 })
    s = rev.state
    expect(balanceWith(s.ledger, 'a')).toBe(0)
    expect(s.clawbacks.a).toBe(9)
    // Next grants settle the debt first.
    const comment = earnForInteraction(
      s,
      { action: 'comment', refId: 'a_new', creatorId: 'a', creatorName: 'A', isOwnContent: false, comment: { text: 'Really enjoyed this update today', previous: [] } },
      ctx,
    )
    expect(comment.outcome).toMatchObject({ earned: true, points: 5, settled: 5, balance: 0 })
    s = comment.state
    expect(s.clawbacks.a).toBe(4)
    const later = makeCtx(NOW + DAY)
    for (const id of ['fresh1', 'fresh2', 'fresh3']) s = earnForInteraction(s, like(id), later).state // +6, settles 4
    expect(s.clawbacks.a).toBeUndefined()
    expect(balanceWith(s.ledger, 'a')).toBe(2)
  })
})

describe('redemption', () => {
  const ready = () => likeMany(freshState({ following: ['a'] }), 'a', 9) // 18 CP with a

  it('deducts exactly the cost', () => {
    const r = redeemReward(ready(), reward({ cost: 15 }), { creatorName: 'A', code: 'X', selfId: SELF }, makeCtx())
    expect(balanceWith(r.state.ledger, 'a')).toBe(3)
    expect(r.state.redemptions).toHaveLength(1)
  })

  it('a second redeem on the updated state is refused (double click)', () => {
    const ctx = makeCtx()
    const first = redeemReward(ready(), reward({ cost: 5 }), { creatorName: 'A', code: 'X', selfId: SELF }, ctx)
    const second = redeemReward(first.state, reward({ cost: 5 }), { creatorName: 'A', code: 'Y', selfId: SELF }, ctx)
    expect(second).toMatchObject({ error: 'redeemed' })
    expect(balanceWith(second.state.ledger, 'a')).toBe(13)
    expect(second.state.redemptions).toHaveLength(1)
  })

  it('refuses when the creator balance is one short (boundary)', () => {
    const s = ready() // 18
    expect(redeemReward(s, reward({ cost: 19 }), { creatorName: 'A', code: 'X', selfId: SELF }, makeCtx())).toMatchObject({ error: 'points' })
    const exact = redeemReward(s, reward({ cost: 18 }), { creatorName: 'A', code: 'X', selfId: SELF }, makeCtx())
    expect(balanceWith(exact.state.ledger, 'a')).toBe(0)
  })

  it('requires following the creator', () => {
    const s = { ...ready(), following: [] }
    expect(rewardEligibility(s, reward(), { selfId: SELF })).toMatchObject({ ok: false, reason: 'follow' })
  })

  it('respects stock and refuses own rewards', () => {
    const s = ready()
    expect(rewardEligibility(s, reward({ stock: 3, claimedByOthers: 3 }), { selfId: SELF })).toMatchObject({ reason: 'soldOut' })
    expect(rewardEligibility(s, reward({ creatorId: SELF }), { selfId: SELF })).toMatchObject({ reason: 'own' })
  })

  it('legacy redemptions still count toward the one per fan limit', () => {
    const s = { ...ready(), redemptions: [{ id: 'old', rewardId: 'r_a', at: NOW, cost: 40, code: 'OLD', rewardTitle: 'A reward', creatorId: 'a', legacy: true }] }
    expect(rewardEligibility(s, reward(), { selfId: SELF })).toMatchObject({ reason: 'redeemed' })
  })

  it('progress is the creator balance over the cost, clamped to 0 to 1', () => {
    expect(rewardProgress(6, 15)).toBeCloseTo(0.4)
    expect(rewardProgress(15, 15)).toBe(1)
    expect(rewardProgress(40, 15)).toBe(1)
    expect(rewardProgress(-5, 15)).toBe(0)
  })
})

describe('invariant: balances never go negative', () => {
  it('holds across a long random sequence of actions', () => {
    let seed = 7
    const rand = () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31)
    const creators = ['a', 'b', 'c']
    let s = freshState({ following: [...creators] })
    for (let i = 0; i < 2000; i++) {
      const ctx = makeCtx(NOW + Math.floor(i / 40) * DAY)
      const c = creators[Math.floor(rand() * creators.length)]
      const roll = rand()
      if (roll < 0.35) s = earnForInteraction(s, like(`${c}_${Math.floor(rand() * 50)}`, c), ctx).state
      else if (roll < 0.55) s = earnForFollow(s, follow(c), ctx).state
      else if (roll < 0.75) s = reverseFollow(s, { creatorId: c, creatorName: c }, ctx).state
      else {
        const r = reward({ id: `r_${c}_${i}`, creatorId: c, cost: 1 + Math.floor(rand() * 20) })
        s = redeemReward(s, r, { creatorName: c, code: 'X', selfId: SELF }, ctx).state
      }
      for (const v of Object.values(balancesByWallet(s.ledger))) expect(v).toBeGreaterThanOrEqual(0)
      for (const v of Object.values(s.clawbacks)) expect(v).toBeGreaterThan(0)
    }
  })
})
