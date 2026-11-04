import type { Comment, PersistedState, Post, Profile, Redemption, Reward } from '../types'
import { DEFAULT_FOLLOWING, DEFAULT_PROFILE } from '../data/seed'

// Version 1: MVP with one universal CP balance.
// Version 2: Release 1, CP balances belong to individual creators.
export const STORAGE_VERSION = 2
export const STORAGE_KEY = 'crevant-demo-state'

export function createInitialState(now = Date.now()): PersistedState {
  return {
    version: STORAGE_VERSION,
    seededAt: now,
    mode: 'fan',
    profile: { ...DEFAULT_PROFILE },
    following: [...DEFAULT_FOLLOWING],
    liked: {},
    saved: {},
    myPosts: [],
    myComments: [],
    myRewards: [],
    deletedPostIds: [],
    ledger: [],
    redemptions: [],
    earnedKeys: {},
    followBonus: {},
    clawbacks: {},
    migrationNotice: null,
  }
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
const arr = <T>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : [])
const rec = <T>(v: unknown): Record<string, T> => (isObj(v) ? (v as Record<string, T>) : {})

/**
 * Migrate version 1 data.
 *
 * Attribution rule: the universal balance cannot be split between creators
 * defensibly, because spending came out of a shared pool. So the old balance is
 * retired rather than converted, and the fan is told so. Everything that is
 * not points (follows, likes, saves, comments, posts, created rewards, profile)
 * is kept. Old redemptions stay in history, marked as legacy, and still count
 * toward each reward's one per fan limit. Earning history is cleared so the
 * fan can earn again under the new, stricter rules.
 */
export function migrateV1(v1: Record<string, unknown>, now = Date.now()): PersistedState {
  const base = createInitialState(typeof v1.seededAt === 'number' ? v1.seededAt : now)
  const oldLedger = arr<{ amount?: unknown }>(v1.ledger)
  const retiredBalance = Math.max(0, oldLedger.reduce((s, e) => s + (typeof e.amount === 'number' ? e.amount : 0), 0))
  const redemptions = arr<Redemption>(v1.redemptions)
    .filter((r) => isObj(r) && typeof r.rewardId === 'string')
    .map((r) => ({ ...r, legacy: true }))
  const profile = isObj(v1.profile) ? { ...base.profile, ...(v1.profile as Partial<Profile>) } : base.profile
  return {
    ...base,
    mode: v1.mode === 'creator' ? 'creator' : 'fan',
    profile,
    following: arr<string>(v1.following).filter((x) => typeof x === 'string'),
    liked: rec<true>(v1.liked),
    saved: rec<number>(v1.saved),
    myPosts: arr<Post>(v1.myPosts),
    myComments: arr<Comment>(v1.myComments),
    myRewards: arr<Reward>(v1.myRewards),
    deletedPostIds: arr<string>(v1.deletedPostIds),
    redemptions,
    migrationNotice: {
      fromVersion: 1,
      at: now,
      retiredBalance,
      legacyRedemptions: redemptions.length,
      dismissed: false,
    },
  }
}

/** Turn whatever is in storage into a valid current state. Never throws. */
export function migrate(raw: unknown, now = Date.now()): PersistedState {
  if (!isObj(raw)) return createInitialState(now)
  if (raw.version === STORAGE_VERSION) {
    // Fill in any fields a newer build added, keeping saved values.
    return { ...createInitialState(typeof raw.seededAt === 'number' ? raw.seededAt : now), ...(raw as Partial<PersistedState>) } as PersistedState
  }
  if (raw.version === 1) return migrateV1(raw, now)
  return createInitialState(now)
}

export function loadState(): PersistedState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return createInitialState()
    return migrate(JSON.parse(raw))
  } catch {
    return createInitialState()
  }
}

/** Returns false when the browser refused to save (quota or privacy mode). */
export function saveState(state: PersistedState): boolean {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
    return true
  } catch {
    return false
  }
}

export function clearState() {
  try {
    localStorage.removeItem(STORAGE_KEY)
  } catch {
    // Nothing to clear if storage is unavailable.
  }
}
