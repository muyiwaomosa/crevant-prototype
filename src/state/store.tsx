import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type { Comment, Creator, PersistedState, Post, PostMedia, Redemption, Reward, RewardKind } from '../types'
import {
  CREATORS,
  SELF_BASE_FOLLOWERS,
  SELF_ID,
  buildSeedComments,
  buildSeedPosts,
  buildSeedRewards,
} from '../data/seed'
import {
  EARN_RULES,
  balancesByWallet,
  earnForFollow,
  earnForInteraction,
  explainNoEarn,
  lifetimeEarned,
  redeemReward,
  remainingStock as remainingStockOf,
  reverseFollow,
  rewardEligibility,
  type Ctx,
  type EarnOutcome,
  type Eligibility,
  type InteractionInput,
} from '../lib/points'
import { ACTIVE_MODEL } from '../lib/wallets'
import { demoCode, uid } from '../lib/format'
import { simulatedEngagement } from '../lib/simulate'
import { AVATAR_ERROR_TEXT } from '../lib/avatar'
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

export type RedeemResult = { ok: true; redemption: Redemption } | { ok: false; reason: string }

interface Store {
  state: PersistedState
  creators: Creator[]
  creatorById: (id: string) => Creator | undefined
  followerCount: (creatorId: string) => number
  posts: Post[]
  postById: (id: string) => Post | undefined
  commentsFor: (postId: string) => Comment[]
  statsFor: (post: Post) => PostStats
  rewards: Reward[]
  /** Spendable CP with one creator. */
  balanceWith: (creatorId: string) => number
  /** Creator id -> spendable CP, for creators with any activity. */
  balances: Record<string, number>
  /** Total CP ever earned across creators. Not spendable. */
  lifetime: number
  eligibility: (reward: Reward) => Eligibility
  remainingStock: (reward: Reward) => number | null
  toasts: Toast[]

  toggleFollow: (creatorId: string) => void
  toggleLike: (postId: string) => void
  toggleSave: (postId: string) => void
  addComment: (postId: string, text: string) => void
  /** Call only after genuine playback has been verified. */
  markWatched: (postId: string) => void
  redeem: (rewardId: string) => RedeemResult
  setMode: (mode: PersistedState['mode']) => void
  publishPost: (input: { text: string; media?: PostMedia }) => Post | null
  deletePost: (postId: string) => void
  createReward: (input: { title: string; description: string; cost: number; kind: RewardKind; stock: number | null }) => Reward
  deleteReward: (rewardId: string) => void
  updateProfile: (patch: Partial<Omit<PersistedState['profile'], 'avatar'>>) => void
  /** Save or remove (null) the profile picture. Fails cleanly if storage is full. */
  setAvatar: (dataUrl: string | null) => { ok: true } | { ok: false; error: string }
  dismissMigrationNotice: () => void
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

const firstName = (name: string) => name.split(' ')[0]

export function StoreProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<PersistedState>(loadState)
  const stateRef = useRef(state)
  const [toasts, setToasts] = useState<Toast[]>([])
  const now = useTicker(30_000)
  const storageWarned = useRef(false)

  /**
   * Apply an update synchronously to the ref, then to React state.
   * Every action reads stateRef.current, so a second rapid click sees the result
   * of the first one. This is what prevents double spending on redemption.
   */
  const commit = useCallback((fn: (s: PersistedState) => PersistedState) => {
    const next = fn(stateRef.current)
    if (next === stateRef.current) return
    stateRef.current = next
    setState(next)
  }, [])

  const pushToast = useCallback((toast: Omit<Toast, 'id'>) => {
    const id = uid('t')
    setToasts((ts) => [...ts.slice(-2), { ...toast, id }])
    window.setTimeout(() => setToasts((ts) => ts.filter((t) => t.id !== id)), toast.tone === 'earn' ? 4000 : 5000)
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

  const ctx = (): Ctx => ({ now: Date.now(), id: () => uid('l'), model: ACTIVE_MODEL })

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
      avatar: state.profile.avatar,
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
    return [...state.myPosts, ...seedPosts].filter((p) => !deleted.has(p.id)).sort((a, b) => b.createdAt - a.createdAt)
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

  const rewards = useMemo(() => [...state.myRewards, ...seedRewards].sort((a, b) => a.cost - b.cost), [seedRewards, state.myRewards])
  const rewardMap = useMemo(() => new Map(rewards.map((r) => [r.id, r])), [rewards])

  const balances = useMemo(() => balancesByWallet(state.ledger, ACTIVE_MODEL), [state.ledger])
  const lifetime = useMemo(() => lifetimeEarned(state.ledger), [state.ledger])
  const balanceWith = useCallback((creatorId: string) => Math.max(0, balances[ACTIVE_MODEL.walletForCreator(creatorId)] ?? 0), [balances])

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
      const sim = post.creatorId === SELF_ID && post.baseLikes === 0 ? simulatedEngagement(post, now, SELF_BASE_FOLLOWERS) : { likes: 0, saves: 0 }
      return {
        likes: post.baseLikes + sim.likes + (state.liked[post.id] ? 1 : 0),
        saves: post.baseSaves + sim.saves + (state.saved[post.id] ? 1 : 0),
        comments: commentsByPost.get(post.id)?.length ?? 0,
      }
    },
    [commentsByPost, now, state.liked, state.saved],
  )

  const remainingStock = useCallback((reward: Reward) => remainingStockOf(state, reward), [state])
  const eligibility = useCallback((reward: Reward) => rewardEligibility(state, reward, { selfId: SELF_ID, model: ACTIVE_MODEL }), [state])

  // ---- Feedback ------------------------------------------------------------

  const announce = useCallback(
    (outcome: EarnOutcome, action: keyof typeof EARN_RULES, creatorId: string, quiet = false) => {
      const creator = creatorMap.get(creatorId)
      const name = creator?.name ?? 'this creator'
      if (outcome.earned) {
        const settledNote = outcome.settled > 0 ? ` ${outcome.settled} CP settled what you owed from an earlier unfollow.` : ''
        pushToast({
          tone: 'earn',
          title: `+${outcome.points} CP with ${name}`,
          body: `${EARN_RULES[action].title}. Your ${firstName(name)} balance is now ${outcome.balance} CP.${settledNote}`,
          points: outcome.points,
        })
      } else if (!quiet && outcome.reason !== 'own') {
        pushToast({ tone: 'info', title: 'No CP this time', body: explainNoEarn(action, outcome.reason) })
      }
    },
    [creatorMap, pushToast],
  )

  // ---- Actions -------------------------------------------------------------

  const toggleFollow = useCallback(
    (creatorId: string) => {
      const creator = creatorMap.get(creatorId)
      if (!creator || creator.isSelf) return
      commit((s) => {
        if (s.following.includes(creatorId)) {
          const unfollowed = { ...s, following: s.following.filter((id) => id !== creatorId) }
          const rev = reverseFollow(unfollowed, { creatorId, creatorName: creator.name }, ctx())
          let body = 'Their posts are no longer in your Home feed.'
          if (rev.outcome.reversed > 0 || rev.outcome.owed > 0) {
            body += ` Your ${EARN_RULES.follow.points} CP follow bonus with ${firstName(creator.name)} was returned.`
            if (rev.outcome.owed > 0) {
              body += ` Your balance only had ${rev.outcome.reversed} CP, so the other ${rev.outcome.owed} CP will come out of what you earn with them next.`
            }
          }
          pushToast({ tone: 'info', title: `Unfollowed ${creator.name}`, body })
          return rev.state
        }
        const followed = { ...s, following: [...s.following, creatorId] }
        const res = earnForFollow(followed, { creatorId, creatorName: creator.name, isSelf: false }, ctx())
        if (res.outcome.earned) announce(res.outcome, 'follow', creatorId)
        else {
          pushToast({
            tone: 'success',
            title: `Following ${creator.name}`,
            body: res.outcome.reason === 'limit' ? explainNoEarn('follow', 'limit') : 'Their posts are now in your Home feed.',
          })
        }
        return res.state
      })
    },
    [announce, commit, creatorMap, pushToast],
  )

  const interaction = useCallback(
    (s: PersistedState, input: Omit<InteractionInput, 'creatorName' | 'isOwnContent'>, quiet = false) => {
      const creator = creatorMap.get(input.creatorId)
      const res = earnForInteraction(
        s,
        { ...input, creatorName: creator?.name ?? 'a creator', isOwnContent: input.creatorId === SELF_ID },
        ctx(),
      )
      announce(res.outcome, input.action, input.creatorId, quiet)
      return res.state
    },
    [announce, creatorMap],
  )

  const toggleLike = useCallback(
    (postId: string) => {
      const post = postMap.get(postId)
      if (!post) return
      commit((s) => {
        if (s.liked[postId]) {
          const liked = { ...s.liked }
          delete liked[postId]
          return { ...s, liked }
        }
        return interaction({ ...s, liked: { ...s.liked, [postId]: true as const } }, { action: 'like', refId: postId, creatorId: post.creatorId })
      })
    },
    [commit, interaction, postMap],
  )

  const toggleSave = useCallback(
    (postId: string) => {
      const post = postMap.get(postId)
      if (!post) return
      commit((s) => {
        if (s.saved[postId]) {
          const saved = { ...s.saved }
          delete saved[postId]
          pushToast({ tone: 'info', title: 'Removed from saved' })
          return { ...s, saved }
        }
        return interaction({ ...s, saved: { ...s.saved, [postId]: Date.now() } }, { action: 'save', refId: postId, creatorId: post.creatorId })
      })
    },
    [commit, interaction, postMap, pushToast],
  )

  const addComment = useCallback(
    (postId: string, text: string) => {
      const trimmed = text.trim()
      const post = postMap.get(postId)
      if (!trimmed || !post) return
      commit((s) => {
        const previous = s.myComments.map((c) => c.text)
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
        return interaction(next, { action: 'comment', refId: postId, creatorId: post.creatorId, comment: { text: trimmed, previous } })
      })
    },
    [commit, interaction, postMap],
  )

  const markWatched = useCallback(
    (postId: string) => {
      const post = postMap.get(postId)
      if (!post) return
      commit((s) => interaction(s, { action: 'watch', refId: postId, creatorId: post.creatorId }))
    },
    [commit, interaction, postMap],
  )

  const redeem = useCallback(
    (rewardId: string): RedeemResult => {
      const reward = rewardMap.get(rewardId)
      if (!reward) return { ok: false, reason: 'missing' }
      const creatorName = creatorMap.get(reward.creatorId)?.name ?? 'the creator'
      // Evaluated against the live state inside commit, never a render snapshot.
      let result: RedeemResult = { ok: false, reason: 'unknown' }
      commit((s) => {
        const r = redeemReward(s, reward, { creatorName, code: demoCode(), selfId: SELF_ID }, ctx())
        result = 'redemption' in r ? { ok: true, redemption: r.redemption } : { ok: false, reason: r.error }
        return r.state
      })
      return result
    },
    [commit, creatorMap, rewardMap],
  )

  const setMode = useCallback((mode: PersistedState['mode']) => commit((s) => (s.mode === mode ? s : { ...s, mode })), [commit])

  const publishPost = useCallback(
    (input: { text: string; media?: PostMedia }): Post | null => {
      const text = input.text.trim()
      if (!text && !input.media) return null
      const post: Post = { id: uid('p_me'), creatorId: SELF_ID, createdAt: Date.now(), text, media: input.media, baseLikes: 0, baseSaves: 0 }
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

  const deleteReward = useCallback((rewardId: string) => commit((s) => ({ ...s, myRewards: s.myRewards.filter((r) => r.id !== rewardId) })), [commit])

  const updateProfile = useCallback(
    (patch: Partial<Omit<PersistedState['profile'], 'avatar'>>) => commit((s) => ({ ...s, profile: { ...s.profile, ...patch } })),
    [commit],
  )

  const setAvatar = useCallback(
    (dataUrl: string | null): { ok: true } | { ok: false; error: string } => {
      const profile = { ...stateRef.current.profile }
      if (dataUrl) profile.avatar = dataUrl
      else delete profile.avatar
      const next = { ...stateRef.current, profile }
      // Save first, synchronously, so a full storage quota is reported instead of silently lost.
      if (!saveState(next)) return { ok: false, error: AVATAR_ERROR_TEXT.storage }
      commit(() => next)
      return { ok: true }
    },
    [commit],
  )

  const dismissMigrationNotice = useCallback(
    () => commit((s) => (s.migrationNotice ? { ...s, migrationNotice: { ...s.migrationNotice, dismissed: true } } : s)),
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
    creators,
    creatorById: (id) => creatorMap.get(id),
    followerCount,
    posts,
    postById: (id) => postMap.get(id),
    commentsFor: (id) => commentsByPost.get(id) ?? [],
    statsFor,
    rewards,
    balanceWith,
    balances,
    lifetime,
    eligibility,
    remainingStock,
    toasts,
    toggleFollow,
    toggleLike,
    toggleSave,
    addComment,
    markWatched,
    redeem,
    setMode,
    publishPost,
    deletePost,
    createReward,
    deleteReward,
    updateProfile,
    setAvatar,
    dismissMigrationNotice,
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
