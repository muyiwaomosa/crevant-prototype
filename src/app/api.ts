import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * The members area's data layer (Release 1: the social core).
 *
 * Everything goes through the public.app_* database functions
 * (supabase/migrations/20261117000000_social_core.sql), which check who is
 * calling and enforce the rules (no self-follows, a Clique only of creators
 * you follow, at most 25 of them, only your own posts and comments can be
 * deleted).
 *
 * Members see two relationships: Following (everyone they follow, unlimited)
 * and My Clique (up to 25 of them, chosen; stored in social.clique_members,
 * supabase/migrations/20261120000000_inner_clique.sql). Removing someone from
 * the Clique never unfollows them; unfollowing removes them from both. The browser never reads the social tables directly. The one
 * exception is the member's own profile row, which the Phase 1A own-row
 * policies already allow.
 *
 * Pages use the AppApi interface, so tests can pass an in-memory version.
 */

export interface MemberSummary {
  id: string
  username: string
  displayName: string
}

export interface Post {
  id: string
  author: MemberSummary
  body: string
  createdAt: string
  likeCount: number
  commentCount: number
  likedByMe: boolean
  authorInMyClique: boolean
  isMine: boolean
}

export interface Comment {
  id: string
  postId: string
  author: MemberSummary
  body: string
  createdAt: string
  isMine: boolean
}

export interface Member extends MemberSummary {
  postCount: number
  followerCount: number
  followingCount: number
  followedByMe: boolean
  inMyClique: boolean
  isMe: boolean
}

export interface DiscoverMember extends MemberSummary {
  postCount: number
  followerCount: number
  followedByMe: boolean
  inMyClique: boolean
}

export interface FollowedCreator extends MemberSummary {
  followedAt: string
  inMyClique: boolean
  cliqueAddedAt: string | null
}

export interface Me {
  id: string
  username: string | null
  displayName: string | null
  complete: boolean
  followingCount: number
  followerCount: number
  cliqueCount: number
  postCount: number
}

/** The member's own profile row (Phase 1A own-row read), used to decide whether setup is needed. */
export type OwnProfile = { id: string; createdAt: string; username: string | null; displayName: string | null }

export interface AppApi {
  ownProfile(): Promise<OwnProfile | null>
  saveProfile(input: { username: string; displayName: string }): Promise<void>
  me(): Promise<Me>
  feed(before?: string): Promise<Post[]>
  member(username: string): Promise<Member | null>
  memberPosts(memberId: string, before?: string): Promise<Post[]>
  post(id: string): Promise<Post | null>
  comments(postId: string): Promise<Comment[]>
  discover(query?: string): Promise<DiscoverMember[]>
  following(): Promise<FollowedCreator[]>
  /** requestId: the browser's id for this post, reused on retry, so it's stored once (issue #48). */
  createPost(body: string, requestId?: string): Promise<string>
  deletePost(id: string): Promise<void>
  follow(memberId: string): Promise<void>
  unfollow(memberId: string): Promise<void>
  cliqueAdd(memberId: string): Promise<void>
  cliqueRemove(memberId: string): Promise<void>
  /** Swaps one Clique creator for another followed creator in one step; on failure nothing changes. */
  cliqueReplace(removeId: string, addId: string): Promise<void>
  like(postId: string): Promise<void>
  unlike(postId: string): Promise<void>
  /** requestId: as for createPost. */
  addComment(postId: string, body: string, requestId?: string): Promise<string>
  deleteComment(id: string): Promise<void>
}

/** Limits that match the database, so people hear about problems before sending. */
export const LIMITS = { post: 2000, comment: 1000, clique: 25, username: { min: 3, max: 30 }, displayName: 50 } as const

/** Same reserved names as the profiles table (supabase/migrations/20261107000000_profiles_and_ops.sql). */
const RESERVED_USERNAMES = new Set([
  'admin', 'administrator', 'crevant', 'support', 'help', 'staff', 'moderator', 'official',
  'root', 'system', 'api', 'app', 'auth', 'tour', 'sign_in', 'settings', 'null',
])

export function usernameProblem(raw: string): string | null {
  const u = raw.trim()
  if (!u) return 'Choose a username.'
  if (u.length < LIMITS.username.min || u.length > LIMITS.username.max) return 'Usernames are 3 to 30 characters.'
  if (!/^[a-z0-9_]+$/.test(u)) return 'Use lowercase letters, numbers and underscores only.'
  if (RESERVED_USERNAMES.has(u)) return 'That username is reserved. Please choose another.'
  return null
}

export function displayNameProblem(raw: string): string | null {
  const d = raw.trim()
  if (!d) return 'Add the name people will see.'
  if ([...d].length > LIMITS.displayName) return 'Display names are at most 50 characters.'
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001F\u007F-\u009F]/.test(d)) return 'Remove any special control characters.'
  return null
}

/** An error the database (or the app) explains with a known code. */
export class AppApiError extends Error {
  constructor(public code: string) {
    super(code)
    this.name = 'AppApiError'
  }
}

const MESSAGES: Record<string, string> = {
  not_signed_in: 'Please sign in again.',
  profile_incomplete: 'Choose a username and display name first.',
  empty: 'Write something first.',
  too_long: "That's longer than allowed. Please shorten it.",
  posts_body_valid: 'Remove any special control characters and try again.',
  comments_body_valid: 'Remove any special control characters and try again.',
  cannot_follow_self: "You can't follow yourself.",
  cannot_add_self: "You can't add yourself to your Clique.",
  not_following: 'Follow this creator first. Your Clique only includes people you follow.',
  clique_full: 'Your Clique is full (25). Choose someone to replace.',
  not_in_clique: 'That creator is no longer in your Clique. Nothing was changed.',
  already_in_clique: 'That creator is already in your Clique. Nothing was changed.',
  rate_limited: "You're going a little fast. Please wait a moment and try again.",
  request_reused: 'Something changed while sending. Please try again.',
  not_found: "That's no longer available.",
  username_taken: 'That username is taken. Please choose another.',
  username_invalid: 'Use 3 to 30 lowercase letters, numbers or underscores, and not a reserved name.',
  display_name_invalid: 'Display names are 1 to 50 characters, with no special control characters.',
  network: "We couldn't reach Splitpost. Check your connection and try again.",
  unknown: 'Something went wrong. Please try again.',
}

export function messageFor(error: unknown): string {
  const code = error instanceof AppApiError ? error.code : 'unknown'
  return MESSAGES[code] ?? MESSAGES.unknown
}

type PgError = { message?: string; code?: string; details?: string } | null

/** Turns a Supabase error into a known code (never shows raw database text to people). */
export function toAppError(err: PgError): AppApiError {
  if (!err) return new AppApiError('unknown')
  const msg = err.message ?? ''
  const text = `${msg} ${err.details ?? ''}`
  if (err.code === '23505' && /username/.test(text)) return new AppApiError('username_taken')
  // The app functions raise their code as the whole message.
  if (Object.prototype.hasOwnProperty.call(MESSAGES, msg)) return new AppApiError(msg)
  // Table rules report the constraint's name.
  if (/posts_body_valid/.test(text)) return new AppApiError('posts_body_valid')
  if (/comments_body_valid/.test(text)) return new AppApiError('comments_body_valid')
  if (/profiles_username_(format|not_reserved)/.test(text)) return new AppApiError('username_invalid')
  if (/profiles_display_name_valid/.test(text)) return new AppApiError('display_name_invalid')
  if (/fetch|network/i.test(msg)) return new AppApiError('network')
  return new AppApiError('unknown')
}

type PostRow = {
  id: string
  author_id: string
  author_username: string
  author_display_name: string
  body: string
  created_at: string
  like_count: number | string
  comment_count: number | string
  liked_by_me: boolean
  author_in_my_clique: boolean
  is_mine: boolean
}

const num = (v: number | string | null | undefined) => Number(v ?? 0)

export function toPost(r: PostRow): Post {
  return {
    id: r.id,
    author: { id: r.author_id, username: r.author_username, displayName: r.author_display_name },
    body: r.body,
    createdAt: r.created_at,
    likeCount: num(r.like_count),
    commentCount: num(r.comment_count),
    likedByMe: r.liked_by_me,
    authorInMyClique: r.author_in_my_clique,
    isMine: r.is_mine,
  }
}

/** The real data layer, backed by the signed-in member's Supabase session. */
/**
 * True only when the database definitively doesn't have the request id
 * version of `fn`: PostgREST's "function not found" (PGRST202), naming
 * exactly public.<fn>, with p_request_id among the parameters it looked for.
 * That answer means the call never ran, so retrying with the original
 * version can't make a second post. Anything else (a network failure, a
 * timeout, a server error, or PGRST202 about another function) may mean the
 * first call ran, so it is never retried.
 */
export function isMissingRequestIdVersion(error: { code?: string; message?: string } | null | undefined, fn: string): boolean {
  if (!error || error.code !== 'PGRST202') return false
  const m = /Could not find the function public\.([a-z_]+)\(([^)]*)\)/.exec(error.message ?? '')
  if (!m || m[1] !== fn) return false
  return m[2].split(',').map((p) => p.trim()).includes('p_request_id')
}

export function createSupabaseApi(client: SupabaseClient, userId: string): AppApi {
  async function rpc<T>(fn: string, args?: Record<string, unknown>): Promise<T> {
    const { data, error } = await client.rpc(fn, args)
    if (error) throw toAppError(error)
    return data as T
  }
  /**
   * A write with a request id (issue #48). The server's request id is the
   * protection; this only keeps posting working if the page is newer than
   * the database (the request id version not deployed yet, or rolled back):
   * then, and only then, it sends the original call once, without the id.
   */
  async function writeOnce<T>(fn: string, withId: Record<string, unknown>, original: Record<string, unknown>): Promise<T> {
    const { data, error } = await client.rpc(fn, withId)
    if (!error) return data as T
    if (isMissingRequestIdVersion(error, fn)) return rpc<T>(fn, original)
    throw toAppError(error)
  }
  return {
    async ownProfile() {
      const { data, error } = await client.from('profiles').select('id, created_at, username, display_name').eq('id', userId).maybeSingle()
      if (error) throw toAppError(error)
      if (!data) return null
      const row = data as { id: string; created_at: string; username?: string | null; display_name?: string | null }
      return { id: row.id, createdAt: row.created_at, username: row.username ?? null, displayName: row.display_name ?? null }
    },
    async saveProfile({ username, displayName }) {
      const { error } = await client
        .from('profiles')
        .update({ username: username.trim(), display_name: displayName.trim() })
        .eq('id', userId)
      if (error) throw toAppError(error)
    },
    async me() {
      const rows = await rpc<Array<Record<string, unknown>>>('app_me')
      const r = rows[0]
      if (!r) throw new AppApiError('not_signed_in')
      return {
        id: String(r.id),
        username: (r.username as string | null) ?? null,
        displayName: (r.display_name as string | null) ?? null,
        complete: Boolean(r.complete),
        followingCount: num(r.following_count as number),
        followerCount: num(r.follower_count as number),
        cliqueCount: num(r.clique_count as number),
        postCount: num(r.post_count as number),
      }
    },
    async feed(before) {
      return (await rpc<PostRow[]>('app_feed', { p_before: before ?? null, p_limit: 20 })).map(toPost)
    },
    async member(username) {
      const rows = await rpc<Array<Record<string, unknown>>>('app_member', { p_username: username })
      const r = rows[0]
      if (!r) return null
      return {
        id: String(r.id),
        username: String(r.username),
        displayName: String(r.display_name),
        postCount: num(r.post_count as number),
        followerCount: num(r.follower_count as number),
        followingCount: num(r.following_count as number),
        followedByMe: Boolean(r.followed_by_me),
        inMyClique: Boolean(r.in_my_clique),
        isMe: Boolean(r.is_me),
      }
    },
    async memberPosts(memberId, before) {
      return (await rpc<PostRow[]>('app_member_posts', { p_member: memberId, p_before: before ?? null, p_limit: 20 })).map(toPost)
    },
    async post(id) {
      const rows = await rpc<PostRow[]>('app_post', { p_post: id })
      return rows[0] ? toPost(rows[0]) : null
    },
    async comments(postId) {
      const rows = await rpc<Array<Record<string, unknown>>>('app_comments', { p_post: postId })
      return rows.map((r) => ({
        id: String(r.id),
        postId: String(r.post_id),
        author: { id: String(r.author_id), username: String(r.author_username), displayName: String(r.author_display_name) },
        body: String(r.body),
        createdAt: String(r.created_at),
        isMine: Boolean(r.is_mine),
      }))
    },
    async discover(query) {
      const rows = await rpc<Array<Record<string, unknown>>>('app_discover', { p_query: query?.trim() || null, p_limit: 30 })
      return rows.map((r) => ({
        id: String(r.id),
        username: String(r.username),
        displayName: String(r.display_name),
        postCount: num(r.post_count as number),
        followerCount: num(r.follower_count as number),
        followedByMe: Boolean(r.followed_by_me),
        inMyClique: Boolean(r.in_my_clique),
      }))
    },
    async following() {
      const rows = await rpc<Array<Record<string, unknown>>>('app_following')
      return rows.map((r) => ({
        id: String(r.id),
        username: String(r.username),
        displayName: String(r.display_name),
        followedAt: String(r.followed_at),
        inMyClique: Boolean(r.in_my_clique),
        cliqueAddedAt: (r.clique_added_at as string | null) ?? null,
      }))
    },
    createPost: (body, requestId) =>
      requestId
        ? writeOnce<string>('app_create_post', { p_body: body, p_request_id: requestId }, { p_body: body })
        : rpc<string>('app_create_post', { p_body: body }),
    deletePost: (id) => rpc<void>('app_delete_post', { p_post: id }),
    follow: (id) => rpc<void>('app_follow', { p_creator: id }),
    unfollow: (id) => rpc<void>('app_unfollow', { p_creator: id }),
    cliqueAdd: (id) => rpc<void>('app_clique_add', { p_creator: id }),
    cliqueRemove: (id) => rpc<void>('app_clique_remove', { p_creator: id }),
    cliqueReplace: (removeId, addId) => rpc<void>('app_clique_replace', { p_remove: removeId, p_add: addId }),
    like: (id) => rpc<void>('app_like', { p_post: id }),
    unlike: (id) => rpc<void>('app_unlike', { p_post: id }),
    addComment: (postId, body, requestId) =>
      requestId
        ? writeOnce<string>('app_add_comment', { p_post: postId, p_body: body, p_request_id: requestId }, { p_post: postId, p_body: body })
        : rpc<string>('app_add_comment', { p_post: postId, p_body: body }),
    deleteComment: (id) => rpc<void>('app_delete_comment', { p_comment: id }),
  }
}

/** A steady colour for a member's initials, from their id. */
export function hueFor(id: string): number {
  let h = 0
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0
  return h % 360
}

/**
 * A new request id for a post or comment. The browser makes it once per text
 * and reuses it when the person retries, so the server stores the post once
 * even if an earlier attempt succeeded but its answer was lost.
 */
export function newRequestId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID()
  const b = crypto.getRandomValues(new Uint8Array(16))
  b[6] = (b[6] & 0x0f) | 0x40
  b[8] = (b[8] & 0x3f) | 0x80
  const h = [...b].map((x) => x.toString(16).padStart(2, '0')).join('')
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`
}
