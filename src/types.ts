// Domain types for the Crevant prototype.
// These mirror what a future API would return, so swapping localStorage
// for a real backend should mostly mean replacing the store, not the UI.

export type Category =
  | 'Food'
  | 'Travel'
  | 'Tech'
  | 'Music'
  | 'Art'
  | 'Fitness'
  | 'Books'
  | 'Wellness'

export type ArtworkKind =
  | 'ridge'
  | 'coast'
  | 'bowl'
  | 'citrus'
  | 'vinyl'
  | 'keys'
  | 'track'
  | 'terminal'
  | 'shapes'
  | 'leaves'
  | 'books'
  | 'sunrise'

export interface Creator {
  id: string
  name: string
  handle: string
  category: Category
  bio: string
  location: string
  /** Demo follower count before the visitor's own follow. */
  baseFollowers: number
  /** Hue (0 to 360) used to colour the generated avatar. */
  hue: number
  cover: ArtworkKind
  /** Uploaded profile picture (data URL). Falls back to initials. */
  avatar?: string
  isSelf?: boolean
}

export type PostMedia =
  | { type: 'art'; art: ArtworkKind; alt: string }
  | { type: 'image'; src: string; alt: string }
  | { type: 'video'; src: string; poster: string; alt: string }

export interface Post {
  id: string
  creatorId: string
  createdAt: number
  text: string
  media?: PostMedia
  /** Seeded engagement from the demo audience (not the visitor). */
  baseLikes: number
  baseSaves: number
}

export interface Comment {
  id: string
  postId: string
  authorName: string
  authorHandle: string
  authorHue: number
  isYou?: boolean
  text: string
  createdAt: number
}

export type RewardKind = 'digital' | 'access' | 'recognition' | 'experience'

export interface Reward {
  id: string
  creatorId: string
  title: string
  description: string
  cost: number
  kind: RewardKind
  /** Total quantity available. null means unlimited. */
  stock: number | null
  /** Demo count already claimed by other fans. */
  claimedByOthers: number
  createdAt: number
}

/** Interactions that can earn CP with a specific creator. */
export type EarnAction = 'like' | 'comment' | 'save' | 'follow' | 'watch'

/**
 * Ledger entry kinds.
 * - EarnAction: points granted for an interaction
 * - redeem: points spent on a reward
 * - reversal: a follow bonus taken back after an unfollow
 * - clawback: part of a new grant used to settle an earlier reversal that the
 *   balance could not cover at the time (keeps balances from going negative)
 */
export type LedgerKind = EarnAction | 'redeem' | 'reversal' | 'clawback'

export interface LedgerEntry {
  id: string
  at: number
  /** Positive when earned, negative when spent or reversed. */
  amount: number
  kind: LedgerKind
  label: string
  /** The creator whose CP balance this entry belongs to. */
  creatorId: string
  refId?: string
}

export interface Redemption {
  id: string
  rewardId: string
  at: number
  cost: number
  code: string
  rewardTitle: string
  creatorId: string
  /** Redeemed with the retired universal balance before Release 1. */
  legacy?: boolean
}

/** First run welcome flow. Returning users are never sent through it again. */
export interface OnboardingState {
  status: 'pending' | 'completed' | 'skipped'
  at: number | null
}

export interface Profile {
  name: string
  handle: string
  bio: string
  category: Category
  /** Small square JPEG data URL. Stored only in this browser. */
  avatar?: string
}

/** Shown once after older demo data is migrated to creator specific CP. */
export interface MigrationNotice {
  fromVersion: number
  at: number
  /** The universal balance that was retired rather than converted. */
  retiredBalance: number
  legacyRedemptions: number
  dismissed: boolean
}

/** Everything that is persisted to localStorage. */
export interface PersistedState {
  version: number
  seededAt: number
  onboarding: OnboardingState
  /** One time note for people who used the old Fan and Creator modes. */
  unifiedNotice: 'none' | 'pending' | 'dismissed'
  profile: Profile
  following: string[]
  liked: Record<string, true>
  saved: Record<string, number>
  /** Posts the visitor published. */
  myPosts: Post[]
  /** Comments the visitor wrote. */
  myComments: Comment[]
  /** Rewards the visitor offers to people who engage with them. */
  myRewards: Reward[]
  deletedPostIds: string[]
  ledger: LedgerEntry[]
  redemptions: Redemption[]
  /** Once per item earning keys, e.g. "like:p_amara_1" -> timestamp. */
  earnedKeys: Record<string, number>
  /** Creators whose follow bonus the fan currently holds -> time granted. */
  followBonus: Record<string, number>
  /** Wallet -> CP still owed from a reversal the balance could not cover. */
  clawbacks: Record<string, number>
  migrationNotice: MigrationNotice | null
}
