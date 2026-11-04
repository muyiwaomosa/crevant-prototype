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

export type EarnAction = 'like' | 'comment' | 'save' | 'follow' | 'watch' | 'checkin'

export interface LedgerEntry {
  id: string
  at: number
  amount: number
  kind: EarnAction | 'redeem' | 'welcome'
  label: string
  creatorId?: string
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
}

export type Mode = 'fan' | 'creator'

export interface Profile {
  name: string
  handle: string
  bio: string
  category: Category
}

/** Everything that is persisted to localStorage. */
export interface PersistedState {
  version: number
  seededAt: number
  mode: Mode
  profile: Profile
  following: string[]
  liked: Record<string, true>
  saved: Record<string, number>
  /** Posts the visitor created in creator mode. */
  myPosts: Post[]
  /** Comments the visitor wrote. */
  myComments: Comment[]
  /** Rewards the visitor created in creator mode. */
  myRewards: Reward[]
  deletedPostIds: string[]
  ledger: LedgerEntry[]
  redemptions: Redemption[]
  /** Keys of actions that have already earned CP, e.g. "like:post_12". */
  earnedKeys: Record<string, number>
}
