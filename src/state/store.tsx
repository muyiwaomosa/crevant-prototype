import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type {
  Comment,
  Creator,
  EarnAction,
  PersistedState,
  Post,
  PostMedia,
  Redemption,
  Reward,
  RewardKind,
} from '../types'
import {
  CREATORS,
  SELF_BASE_FOLLOWERS,
  SELF_ID,
  buildSeedComments,
  buildSeedPosts,
  buildSeedRewards,
} from '../data/seed'
import { EARN_RULES, MIN_COMMENT_LENGTH, balanceOf, evaluateEarn, explainNoEarn } from '../lib/points'
import { demoCode, uid } from '../lib/format'
import { simulatedEngagement } from '../lib/simulate'
import { dayKey } from '../lib/time'
import { clearState, createInitialState, loadState, saveState } from './storage'

// ---------------------------------------------------------------------------
// Toasts (ephemeral, not persisted)

export type ToastTone = 'earn' | 'info' | 'success' | 'warn'
export interface Toast {
  id: string
  tone: ToastTone
  title: string
  body?: string
  points?: number
}

// ---------------------------------------------------------------------------
// A ticking clock so relative timestamps and simulated numbers stay current.

const NowContext = createContext<number>(Date.now())

function useTicker(intervalMs: number) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), intervalMs)
    return () => window.clearInterval(id)
  }, [intervalMs])
  return now
}

export const useNow = () => useContext(NowContext)

// ---------------------------------------------------------------------------

export interface PostStats {
  likes: number
  saves: number
  comments: number
}

export type RewardStatus =
  | { canRedeem: true }
  | { canRedeem: false; reason: 'own' | 'follow' | 'soldOut' | 'redeemed' | 'points'; needed?: number }

interface Store {
  state: PersistedState
  balance: number
  creators: Creator[]
  creatorById: (id: string) => Creator | undefined
  followerCount: (creatorId: string) => number
  posts: Post[]
  postById: (id: string) => Post | undefined
  commentsFor: (postId: string) => Comment[]
  statsFor: (post: Post) => PostStats
  rewards: Reward[]
  rewardStatus: (reward: Reward) => RewardStatus
  remainingStock: (reward: Reward) => number | null
  checkedInToday: boolean
  toasts: Toast[]

  toggleFollow: (creatorId: string) => void
  toggleLike: (postId: string) => void
  toggleSave: (postId: string) => void
  addComment: (postId: string, text: string) => void
  markWatched: (postId: string) => void
  checkIn: () => void
  redeem: (rewardId: string) => Redemption | null
  setMode: (mode: PersistedState['mode']) => void
  publishPost: (input: { text: string; media?: PostMedia }) => Post | null
  deletePost: (postId: string) => void
  createReward: (input: { title: string; description: string; cost: number; kind: RewardKind; stock: number | null }) => Reward
  deleteReward: (rewardId: string) => void
  updateProfile: (patch: Partial<PersistedState['profile']>) => void
  resetDemo: () => void
  pushToast: (toast: Omit<Toast, 'id'>) => void
  dismissToast: (id: string) => void
}

const StoreContext = createContext<Store | null>(null)

export function useStore(): Store {
  const ctx = useContext(StoreContext)
  if (!ctx) throw new Error('useStore must be used inside <StoreProvider>')
  return ctx
}

export function StoreProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<PersistedState>(loadState)
  const stateRef = useRef(state)
  const [toasts, setToasts] = useState<Toast[]>([])
  const now = useTicker(30_000)
  const storageWarned = useRef(false)

  // Apply an update synchronously to the ref so several actions in one tick stay consistent.
  const commit = useCallback((fn: (s: PersistedState) => PersistedState) => {
    const next = fn(stateRef.current)
    stateRef.current = next
    setState(next)
  }, [])

  const pushToast = useCallback((toast: Omit<Toast, 'id'>) => {
    const id = uid('t')
    setToasts((ts) => [...ts.slice(-2), { ...toast, id }])
    window.setTimeout(() => setToasts((ts) => ts.filter((t) => t.id !== id)), toast.tone === 'earn' ? 3200 : 4200)
  }, [])

  const dismissToast = useCallback((id: string) => setToasts((ts) => ts.filter((t) => t.id !== id)), [])

  useEffect(() => {
    const ok = saveState(state)
    if (!ok && !storageWarned.current) {
      storageWarned.current = true
      pushToast({
        tone: 'warn',
        title: 'Could not save to this browser',
        body: 'Your changes work for now but may not survive a refresh. Try removing large images.',
      })
    }
  }, [state, pushToast])

  // ---- Derived data --------------------------------------------------------

  const selfCreator: Creator = useMemo(
    () => ({
      id: SELF_ID,
      name: state.profile.name,
      handle: state.profile.handle,
      category: state.profile.category,
      bio: state.profile.bio,
      location: 'Your creator page',
      baseFollowers: SELF_BASE_FOLLOWERS,
      hue: 168,
      cover: 'sunrise',
      isSelf: true,
    }),
    [state.profile],
  )

  const creators = useMemo(() => [...CREATORS, selfCreator], [selfCreator])
  const creatorMap = useMemo(() => new Map(creators.map((c) => [c.id, c])), [creators])
  const seedPosts = useMemo(() => buildSeedPosts(state.seededAt), [state.seededAt])
  const seedComments = useMemo(() => buildSeedComments(state.seededAt), [state.seededAt])
  const seedRewards = useMemo(() => buildSeedRewards(state.seededAt), [state.seededAt])

  const posts = useMemo(() => {
    const deleted = new Set(state.deletedPostIds)
    return [...state.myPosts, ...seedPosts]
      .filter((p) => !deleted.has(p.id))
      .sort((a, b) => b.createdAt - a.createdAt)
  }, [seedPosts, state.myPosts, state.deletedPostIds])

  const postMap = useMemo(() => new Map(posts.map((p) => [p.id, p])), [posts])

  const commentsByPost = useMemo(() => {
    const map = new Map<string, Comment[]>()
    for (const c of [...seedComments, ...state.myComments]) {
      const list = map.get(c.postId) ?? []
      list.push(c)
      map.set(c.postId, list)
    }
    for (const list of map.values()) list.sort((a, b) => a.createdAt - b.createdAt)
    return map
  }, [seedComments, state.myComments])

  const rewards = useMemo(
    () => [...state.myRewards, ...seedRewards].sort((a, b) => a.cost - b.cost),
    [seedRewards, state.myRewards],
  )

  const balance = useMemo(() => balanceOf(state.ledger), [state.ledger])
  const checkedInToday = Boolean(state.earnedKeys[`checkin:${dayKey(now)}`])

  const followerCount = useCallback(
    (creatorId: string) => {
      const c = creatorMap.get(creatorId)
      if (!c) return 0
      return c.baseFollowers + (state.following.includes(creatorId) ? 1 : 0)
    },
    [creatorMap, state.following],
  )

  const statsFor = useCallback(
    (post: Post): PostStats => {
      const sim =
        post.creatorId === SELF_ID && post.baseLikes === 0
          ? simulatedEngagement(post, now, SELF_BASE_FOLLOWERS)
          : { likes: 0, saves: 0 }
      return {
        likes: post.baseLikes + sim.likes + (state.liked[post.id] ? 1 : 0),
        saves: post.baseSaves + sim.saves + (state.saved[post.id] ? 1 : 0),
        comments: commentsByPost.get(post.id)?.length ?? 0,
      }
    },
    [commentsByPost, now, state.liked, state.saved],
  )

  const remainingStock = useCallback(
    (reward: Reward) => {
      if (reward.stock === null) return null
      const mine = state.redemptions.filter((r) => r.rewardId === reward.id).length
      return Math.max(0, reward.stock - reward.claimedByOthers - mine)
    },
    [state.redemptions],
  )

  const rewardStatus = useCallback(
    (reward: Reward): RewardStatus => {
      if (reward.creatorId === SELF_ID) return { canRedeem: false, reason: 'own' }
      if (state.redemptions.some((r) => r.rewardId === reward.id)) return { canRedeem: false, reason: 'redeemed' }
      const left = remainingStock(reward)
      if (left !== null && left <= 0) return { canRedeem: false, reason: 'soldOut' }
      if (!state.following.includes(reward.creatorId)) return { canRedeem: false, reason: 'follow' }
      if (balance < reward.cost) return { canRedeem: false, reason: 'points', needed: reward.cost - balance }
      return { canRedeem: true }
    },
    [balance, remainingStock, state.following, state.redemptions],
  )

  // ---- Points helper -------------------------------------------------------

  /**
   * Try to award CP for an action. Returns the next state.
   * `quiet` suppresses the "no points" explanation for actions where it would be noise.
   */
  const earn = useCallback(
    (
      s: PersistedState,
      action: EarnAction,
      refId: string,
      creatorId: string | undefined,
      opts: { quiet?: boolean; tooShort?: boolean } = {},
    ): PersistedState => {
      const at = Date.now()
      if (opts.tooShort) {
        if (!opts.quiet) pushToast({ tone: 'info', title: 'Comment posted', body: explainNoEarn(action, 'tooShort') })
        return s
      }
      const decision = evaluateEarn(s, action, refId, { now: at, isOwnContent: creatorId === SELF_ID })
      if (!decision.ok) {
        if (!opts.quiet && decision.reason !== 'own') {
          pushToast({ tone: 'info', title: 'No CP this time', body: explainNoEarn(action, decision.reason) })
        }
        return s
      }
      const creator = creatorId ? creatorMap.get(creatorId) : undefined
      const rule = EARN_RULES[action]
      const label = creator ? `${rule.label} ${creator.name}` : rule.label
      pushToast({ tone: 'earn', title: `+${decision.points} CP`, body: label, points: decision.points })
      return {
        ...s,
        earnedKeys: { ...s.earnedKeys, [decision.key]: at },
        ledger: [
          { id: uid('l'), at, amount: decision.points, kind: action, label, creatorId, refId },
          ...s.ledger,
        ],
      }
    },
    [creatorMap, pushToast],
  )

  // ---- Actions -------------------------------------------------------------

  const toggleFollow = useCallback(
    (creatorId: string) => {
      if (creatorId === SELF_ID) return
      commit((s) => {
        const isFollowing = s.following.includes(creatorId)
        if (isFollowing) {
          const name = creatorMap.get(creatorId)?.name ?? 'this creator'
          pushToast({ tone: 'info', title: `Unfollowed ${name}`, body: 'Their posts are no longer in your Home feed.' })
          return { ...s, following: s.following.filter((id) => id !== creatorId) }
        }
        const next = { ...s, following: [...s.following, creatorId] }
        // Following quietly skips the "already earned" note; the feed update is the main feedback.
        const alreadyEarned = Boolean(s.earnedKeys[`follow:${creatorId}`])
        if (alreadyEarned) {
          const name = creatorMap.get(creatorId)?.name ?? 'this creator'
          pushToast({ tone: 'success', title: `Following ${name}`, body: 'Their posts are back in your Home feed.' })
        }
        return earn(next, 'follow', creatorId, creatorId, { quiet: true })
      })
    },
    [commit, creatorMap, earn, pushToast],
  )

  const toggleLike = useCallback(
    (postId: string) => {
      commit((s) => {
        const post = postMap.get(postId)
        if (s.liked[postId]) {
          const liked = { ...s.liked }
          delete liked[postId]
          return { ...s, liked }
        }
        const next = { ...s, liked: { ...s.liked, [postId]: true as const } }
        return earn(next, 'like', postId, post?.creatorId)
      })
    },
    [commit, earn, postMap],
  )

  const toggleSave = useCallback(
    (postId: string) => {
      commit((s) => {
        const post = postMap.get(postId)
        if (s.saved[postId]) {
          const saved = { ...s.saved }
          delete saved[postId]
          pushToast({ tone: 'info', title: 'Removed from saved' })
          return { ...s, saved }
        }
        const next = { ...s, saved: { ...s.saved, [postId]: Date.now() } }
        return earn(next, 'save', postId, post?.creatorId)
      })
    },
    [commit, earn, postMap, pushToast],
  )

  const addComment = useCallback(
    (postId: string, text: string) => {
      const trimmed = text.trim()
      if (!trimmed) return
      commit((s) => {
        const post = postMap.get(postId)
        const comment: Comment = {
          id: uid('c'),
          postId,
          authorName: s.profile.name,
          authorHandle: s.profile.handle,
          authorHue: 168,
          isYou: true,
          text: trimmed,
          createdAt: Date.now(),
        }
        const next = { ...s, myComments: [...s.myComments, comment] }
        return earn(next, 'comment', postId, post?.creatorId, { tooShort: trimmed.length < MIN_COMMENT_LENGTH })
      })
    },
    [commit, earn, postMap],
  )

  const markWatched = useCallback(
    (postId: string) => {
      commit((s) => earn(s, 'watch', postId, postMap.get(postId)?.creatorId, { quiet: true }))
    },
    [commit, earn, postMap],
  )

  const checkIn = useCallback(() => {
    commit((s) => earn(s, 'checkin', dayKey(Date.now()), undefined))
  }, [commit, earn])

  const redeem = useCallback(
    (rewardId: string): Redemption | null => {
      const reward = rewards.find((r) => r.id === rewardId)
      if (!reward) return null
      const status = rewardStatus(reward)
      if (!status.canRedeem) return null
      const redemption: Redemption = {
        id: uid('rd'),
        rewardId,
        at: Date.now(),
        cost: reward.cost,
        code: demoCode(),
        rewardTitle: reward.title,
        creatorId: reward.creatorId,
      }
      commit((s) => ({
        ...s,
        redemptions: [redemption, ...s.redemptions],
        ledger: [
          {
            id: uid('l'),
            at: redemption.at,
            amount: -reward.cost,
            kind: 'redeem',
            label: `Redeemed “${reward.title}”`,
            creatorId: reward.creatorId,
            refId: redemption.id,
          },
          ...s.ledger,
        ],
      }))
      return redemption
    },
    [commit, rewardStatus, rewards],
  )

  const setMode = useCallback((mode: PersistedState['mode']) => commit((s) => ({ ...s, mode })), [commit])

  const publishPost = useCallback(
    (input: { text: string; media?: PostMedia }): Post | null => {
      const text = input.text.trim()
      if (!text && !input.media) return null
      const post: Post = {
        id: uid('p_me'),
        creatorId: SELF_ID,
        createdAt: Date.now(),
        text,
        media: input.media,
        baseLikes: 0,
        baseSaves: 0,
      }
      commit((s) => ({ ...s, myPosts: [post, ...s.myPosts] }))
      return post
    },
    [commit],
  )

  const deletePost = useCallback(
    (postId: string) => {
      commit((s) => ({
        ...s,
        myPosts: s.myPosts.filter((p) => p.id !== postId),
        deletedPostIds: s.myPosts.some((p) => p.id === postId) ? s.deletedPostIds : [...s.deletedPostIds, postId],
      }))
      pushToast({ tone: 'info', title: 'Post deleted' })
    },
    [commit, pushToast],
  )

  const createReward = useCallback(
    (input: { title: string; description: string; cost: number; kind: RewardKind; stock: number | null }) => {
      const reward: Reward = {
        id: uid('r_me'),
        creatorId: SELF_ID,
        title: input.title.trim(),
        description: input.description.trim(),
        cost: input.cost,
        kind: input.kind,
        stock: input.stock,
        claimedByOthers: 0,
        createdAt: Date.now(),
      }
      commit((s) => ({ ...s, myRewards: [reward, ...s.myRewards] }))
      return reward
    },
    [commit],
  )

  const deleteReward = useCallback(
    (rewardId: string) => commit((s) => ({ ...s, myRewards: s.myRewards.filter((r) => r.id !== rewardId) })),
    [commit],
  )

  const updateProfile = useCallback(
    (patch: Partial<PersistedState['profile']>) => commit((s) => ({ ...s, profile: { ...s.profile, ...patch } })),
    [commit],
  )

  const resetDemo = useCallback(() => {
    clearState()
    commit(() => createInitialState())
    setToasts([])
    pushToast({ tone: 'success', title: 'Demo reset', body: 'Everything is back to the starting state.' })
  }, [commit, pushToast])

  const value: Store = {
    state,
    balance,
    creators,
    creatorById: (id) => creatorMap.get(id),
    followerCount,
    posts,
    postById: (id) => postMap.get(id),
    commentsFor: (id) => commentsByPost.get(id) ?? [],
    statsFor,
    rewards,
    rewardStatus,
    remainingStock,
    checkedInToday,
    toasts,
    toggleFollow,
    toggleLike,
    toggleSave,
    addComment,
    markWatched,
    checkIn,
    redeem,
    setMode,
    publishPost,
    deletePost,
    createReward,
    deleteReward,
    updateProfile,
    resetDemo,
    pushToast,
    dismissToast,
  }

  return (
    <NowContext.Provider value={now}>
      <StoreContext.Provider value={value}>{children}</StoreContext.Provider>
    </NowContext.Provider>
  )
}
