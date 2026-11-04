// Points model: decides which wallet an earned or spent point belongs to.
//
// Release 1 tests the hypothesis that creator specific CP builds more
// meaningful relationships than one universal balance. Keeping the choice in
// this one object means a universal or hybrid model can be compared later
// without touching the earning rules or the UI.

import type { Reward } from '../types'

export interface PointsModel {
  id: 'creator' | 'universal'
  /** Wallet that receives CP earned from interacting with this creator. */
  walletForCreator: (creatorId: string) => string
  /** Wallet that pays for this reward. */
  walletForReward: (reward: Pick<Reward, 'creatorId'>) => string
}

/** Release 1: CP earned with a creator can only be spent on that creator's rewards. */
export const CREATOR_SCOPED: PointsModel = {
  id: 'creator',
  walletForCreator: (creatorId) => creatorId,
  walletForReward: (reward) => reward.creatorId,
}

/** The pre Release 1 behaviour, kept for comparison and tests. Not used in the UI. */
export const UNIVERSAL: PointsModel = {
  id: 'universal',
  walletForCreator: () => '*',
  walletForReward: () => '*',
}

export const ACTIVE_MODEL: PointsModel = CREATOR_SCOPED
