import type { PersistedState, Reward } from '../types'
import { createInitialState } from '../state/storage'
import type { Ctx } from '../lib/points'

export const NOW = new Date(2026, 10, 4, 12, 0, 0).getTime()
export const DAY = 86_400_000

export function makeCtx(now = NOW): Ctx {
  let n = 0
  return { now, id: () => `id_${++n}` }
}

export function freshState(overrides: Partial<PersistedState> = {}): PersistedState {
  return { ...createInitialState(NOW), following: [], ...overrides }
}

export function reward(over: Partial<Reward> = {}): Reward {
  return {
    id: 'r_a',
    creatorId: 'a',
    title: 'A reward',
    description: 'desc',
    cost: 15,
    kind: 'digital',
    stock: null,
    claimedByOthers: 0,
    createdAt: NOW,
    ...over,
  }
}

export const like = (postId: string, creatorId = 'a') => ({
  action: 'like' as const,
  refId: postId,
  creatorId,
  creatorName: creatorId.toUpperCase(),
  isOwnContent: false,
})
