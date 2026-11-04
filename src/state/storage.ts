import type { PersistedState } from '../types'
import { DEFAULT_FOLLOWING, DEFAULT_PROFILE } from '../data/seed'
import { WELCOME_BONUS } from '../lib/points'

// Bump this when the persisted shape changes; older saves are discarded.
export const STORAGE_VERSION = 1
const STORAGE_KEY = 'crevant-demo-state'

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
    ledger: [
      {
        id: 'l_welcome',
        at: now,
        amount: WELCOME_BONUS,
        kind: 'welcome',
        label: 'Welcome bonus for trying the demo',
      },
    ],
    redemptions: [],
    // Creators you follow at the start count as already rewarded,
    // so unfollowing and refollowing them does not mint points.
    earnedKeys: Object.fromEntries(DEFAULT_FOLLOWING.map((id) => [`follow:${id}`, now])),
  }
}

export function loadState(): PersistedState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return createInitialState()
    const parsed = JSON.parse(raw) as PersistedState
    if (parsed?.version !== STORAGE_VERSION) return createInitialState()
    return { ...createInitialState(parsed.seededAt), ...parsed }
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
