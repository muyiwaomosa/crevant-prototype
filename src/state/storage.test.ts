import { describe, expect, it } from 'vitest'
import { createInitialState, migrate, STORAGE_VERSION } from './storage'
import { balancesByWallet, lifetimeEarned } from '../lib/points'
import { NOW } from '../test/helpers'

// A realistic snapshot of version 1 data written by the MVP.
const v1 = {
  version: 1,
  seededAt: NOW - 3 * 86_400_000,
  mode: 'creator',
  profile: { name: 'Sam Fan', handle: 'samfan', bio: 'hi', category: 'Music' },
  following: ['amara', 'theo', 'marcus'],
  liked: { p_amara_1: true },
  saved: { p_theo_1: NOW },
  myPosts: [{ id: 'p_me_x', creatorId: 'me', createdAt: NOW, text: 'hello', baseLikes: 0, baseSaves: 0 }],
  myComments: [{ id: 'c1', postId: 'p_amara_1', authorName: 'Sam', authorHandle: 'samfan', authorHue: 1, text: 'Lovely soup recipe!', createdAt: NOW, isYou: true }],
  myRewards: [],
  deletedPostIds: [],
  ledger: [
    { id: 'l3', at: NOW, amount: -40, kind: 'redeem', label: 'Redeemed', creatorId: 'theo' },
    { id: 'l2', at: NOW, amount: 10, kind: 'follow', label: 'Followed Marcus', creatorId: 'marcus' },
    { id: 'l1', at: NOW, amount: 5, kind: 'checkin', label: 'Daily check in' },
    { id: 'l0', at: NOW, amount: 50, kind: 'welcome', label: 'Welcome bonus' },
  ],
  redemptions: [{ id: 'rd1', rewardId: 'r_theo_wall', at: NOW, cost: 40, code: 'DEMO-AAAA-BBBB', rewardTitle: 'Arctic wallpaper pack', creatorId: 'theo' }],
  earnedKeys: { 'follow:marcus': NOW, 'like:p_amara_1': NOW },
}

describe('migration from version 1', () => {
  const s = migrate(JSON.parse(JSON.stringify(v1)), NOW)

  it('upgrades to the current version', () => {
    expect(s.version).toBe(STORAGE_VERSION)
  })

  it('retires the universal balance instead of converting it', () => {
    expect(s.ledger).toEqual([])
    expect(balancesByWallet(s.ledger)).toEqual({})
    expect(lifetimeEarned(s.ledger)).toBe(0)
    expect(s.migrationNotice).toMatchObject({ fromVersion: 1, retiredBalance: 25, legacyRedemptions: 1, dismissed: false })
  })

  it('keeps everything that is not points', () => {
    expect(s.following).toEqual(['amara', 'theo', 'marcus'])
    expect(s.liked).toEqual({ p_amara_1: true })
    expect(s.saved).toEqual(v1.saved)
    expect(s.myPosts).toHaveLength(1)
    expect(s.myComments).toHaveLength(1)
    expect(s.profile.name).toBe('Sam Fan')
    expect(s.mode).toBe('creator')
    expect(s.seededAt).toBe(v1.seededAt)
  })

  it('keeps redemption history, marked as legacy', () => {
    expect(s.redemptions).toHaveLength(1)
    expect(s.redemptions[0]).toMatchObject({ rewardId: 'r_theo_wall', legacy: true })
  })

  it('clears earning history and follow bonuses so the new rules start clean', () => {
    expect(s.earnedKeys).toEqual({})
    expect(s.followBonus).toEqual({})
    expect(s.clawbacks).toEqual({})
  })
})

describe('loading other data', () => {
  it('a current version state round trips unchanged', () => {
    const fresh = createInitialState(NOW)
    expect(migrate(JSON.parse(JSON.stringify(fresh)), NOW)).toEqual(fresh)
  })

  it('fills in fields a newer build added', () => {
    const partial = { ...createInitialState(NOW) } as Record<string, unknown>
    delete partial.clawbacks
    expect(migrate(partial, NOW).clawbacks).toEqual({})
  })

  it.each([null, 'garbage', 42, [], { version: 99 }])('unknown data %s resets to a fresh state', (raw) => {
    const s = migrate(raw, NOW)
    expect(s.version).toBe(STORAGE_VERSION)
    expect(s.ledger).toEqual([])
    expect(s.migrationNotice).toBeNull()
  })

  it('migration notice retired balance never goes below zero', () => {
    const s = migrate({ version: 1, ledger: [{ amount: -10 }] }, NOW)
    expect(s.migrationNotice?.retiredBalance).toBe(0)
  })
})
