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
  /** Profile details (20261123000000). Absent on a database without them. */
  details?: ProfileDetails
  /** How many of the signed-in member's interests they share. */
  sharedTopics?: number
}

/**
 * How a member expects to use Splitpost. DESCRIPTIVE ONLY: it grants and
 * restricts nothing (membership comes only from ops.member_access, and every
 * member can post, follow and build a Clique whatever they choose).
 */
export type Identity = 'creator' | 'fan' | 'both'
export const IDENTITIES: Identity[] = ['creator', 'fan', 'both']

/** One interest a member can choose, from the database's topic list. */
export interface Topic {
  slug: string
  label: string
}

/** Optional profile details (20261123000000_profile_details). Each may be empty. */
export interface ProfileDetails {
  identity: Identity | null
  bio: string | null
  followReason: string | null
  /** Topic slugs, at most 5, in the topic list's order. */
  topics: string[]
}

/** The member's own details, and whether they've finished first-time setup. */
export interface MyDetails extends ProfileDetails {
  onboarded: boolean
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

/** A followed creator with posts the member hasn't seen (the Unseen-first strip). */
export interface UnseenCreator extends MemberSummary {
  inMyClique: boolean
  /** Capped at 10 by the server: 10 means "more than 9" (shown as 9+). */
  unseenCount: number
  latestUnseenAt: string
}

/** How a view was observed: text and images 50% visible for 2 s; video 3 s of playback or completion. */
export type ViewBasis = 'visible' | 'played'

/**
 * The signed-in account's own pilot membership (20261122000000_member_access).
 * Only 'active' may use the member app; the database enforces it for every
 * member function, so this is for explaining, not for protecting.
 */
export type AccessStatus = 'active' | 'none' | 'revoked' | 'expired'
/**
 * preGate: true only when the database has no membership gate yet (before
 * 20261122000000 is applied), so every signed-in account is a member exactly
 * as before. Never set for any other reason.
 */
export type AccessState = { status: AccessStatus; expiresAt: string | null; preGate?: true }

/** The member's own profile row (Phase 1A own-row read), used to decide whether setup is needed. */
export type OwnProfile = { id: string; createdAt: string; username: string | null; displayName: string | null }

/**
 * Reporting and moderation (20261124000000_moderation). Reports never hide
 * anything by themselves, and no member function returns who reported.
 */
export type ReportTarget = 'post' | 'profile'
export type ReportReason = 'spam' | 'harassment' | 'hate' | 'sexual' | 'violence' | 'self_harm' | 'impersonation' | 'other'
export const REPORT_REASONS: Array<{ value: ReportReason; label: string }> = [
  { value: 'spam', label: 'Spam or scam' },
  { value: 'harassment', label: 'Harassment or bullying' },
  { value: 'hate', label: 'Hate or discrimination' },
  { value: 'sexual', label: 'Nudity or sexual content' },
  { value: 'violence', label: 'Violence or threats' },
  { value: 'self_harm', label: 'Self-harm' },
  { value: 'impersonation', label: 'Impersonation' },
  { value: 'other', label: 'Something else' },
]
/** Threats and self-harm are reviewed first (never around the clock). */
export const PRIORITY_REASONS: ReportReason[] = ['violence', 'self_harm']
export const reasonLabel = (r: string) => REPORT_REASONS.find((x) => x.value === r)?.label ?? r

/** Whether reporting exists on this database, and whether the member moderates. */
export type ModerationAccess = { available: boolean; moderator: boolean }
export type ReportStatus = 'open' | 'hidden' | 'dismissed' | 'restored'

export interface ModQueueItem {
  id: string
  targetType: ReportTarget
  targetId: string
  reason: ReportReason
  priority: boolean
  hasDetails: boolean
  excerpt: string
  targetUsername: string | null
  openReportsForTarget: number
  status: ReportStatus
  createdAt: string
  resolvedAt: string | null
}

export interface ModReport extends Omit<ModQueueItem, 'excerpt' | 'targetUsername' | 'hasDetails'> {
  details: string | null
  /** What was reported, as it was then (erased 90 days after resolution unless held). */
  snapshot: Record<string, string | null> | null
  dataPurged: boolean
  targetState: 'live' | 'hidden' | 'deleted_by_author' | 'gone'
  currentBody: string | null
}

/** A member's current picture: a signed link (valid for an hour) and when it changed. */
export type AvatarLink = { url: string; updatedAt: string | null }
/** A storage cleanup dry run (moderators only), valid for 15 minutes. */
export type StoragePlan = { planId: string; fileCount: number; totalBytes: number; confirmPhrase: string; expiresAt: string }

export interface AppApi {
  /** The signed-in account's own pilot membership state (needs no membership itself). */
  accessState(): Promise<AccessState>
  ownProfile(): Promise<OwnProfile | null>
  saveProfile(input: { username: string; displayName: string }): Promise<void>
  me(): Promise<Me>
  feed(before?: string): Promise<Post[]>
  member(username: string): Promise<Member | null>
  memberPosts(memberId: string, before?: string): Promise<Post[]>
  post(id: string): Promise<Post | null>
  comments(postId: string): Promise<Comment[]>
  /** Other members by name and (when the database has profile details) one interest, shared interests first. */
  discover(query?: string, topic?: string): Promise<DiscoverMember[]>
  /**
   * Profile details (20261123000000). Each returns null (or an empty list)
   * when the database doesn't have them yet, so the app works unchanged
   * before that migration is applied.
   */
  topics(): Promise<Topic[] | null>
  myDetails(): Promise<MyDetails | null>
  /** Saves all of the member's details at once and marks first-time setup done. */
  saveDetails(details: ProfileDetails): Promise<void>
  memberDetails(memberId: string): Promise<ProfileDetails | null>
  /** People the member doesn't follow yet, shared interests first. */
  suggested(): Promise<DiscoverMember[]>
  /** Moderation (20261124000000): unavailable (and never a moderator) on a database without it. */
  moderationAccess(): Promise<ModerationAccess>
  report(target: ReportTarget, targetId: string, reason: ReportReason, details?: string): Promise<void>
  modQueue(status: 'open' | 'resolved'): Promise<ModQueueItem[]>
  modReport(id: string): Promise<ModReport | null>
  modHide(id: string, note?: string): Promise<void>
  modRestore(id: string, note?: string): Promise<void>
  modDismiss(id: string, note?: string): Promise<void>
  /**
   * Profile pictures (20261125000000 and the avatar Edge Function). The
   * browser sends only the cropped 512 x 512 JPEG; the server chooses the
   * path, checks everything and re-encodes it. Links for members without a
   * picture (or not visible) are simply absent; with no function, all are.
   */
  avatarLinks(memberIds: string[]): Promise<Record<string, AvatarLink>>
  uploadAvatar(jpeg: Blob): Promise<void>
  removeAvatar(): Promise<void>
  modStoragePreview(): Promise<StoragePlan>
  modStorageCleanup(planId: string, confirm: string): Promise<{ deleted: number; confirmed: number }>
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
  /** Unseen-first strip: followed creators with unseen posts, My Clique first. */
  unseenCreators(): Promise<UnseenCreator[]>
  /** Up to 20 of a creator's most recent unseen posts, oldest first. `before` pages to older ones. */
  catchUp(creatorId: string, before?: { createdAt: string; id: string }): Promise<Post[]>
  /** Records posts the member has viewed (at most 50 per call). A UX signal only, never a reward. */
  markViewed(postIds: string[], basis: ViewBasis): Promise<number>
}

/** Limits that match the database, so people hear about problems before sending. */
export const LIMITS = {
  post: 2000,
  comment: 1000,
  clique: 25,
  username: { min: 3, max: 30 },
  displayName: 50,
  bio: 160,
  followReason: 140,
  topics: 5,
  reportDetails: 500,
  moderationNote: 500,
} as const

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

// eslint-disable-next-line no-control-regex
const CONTROL = /[\u0000-\u001F\u007F-\u009F]/

/** A bio or follow statement: optional, one paragraph, within its limit. */
export function shortTextProblem(raw: string, max: number, what: string): string | null {
  const t = raw.trim()
  if (!t) return null
  if ([...t].length > max) return `Keep ${what} to ${max} characters.`
  if (CONTROL.test(t)) return 'Use a single paragraph, without line breaks or special characters.'
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
  too_many: 'Something went wrong. Please try again.',
  invalid_request: 'Something went wrong. Please try again.',
  request_reused: 'Something changed while sending. Please try again.',
  not_found: "That's no longer available.",
  no_pilot_access: "Your pilot access isn't active, so this isn't available.",
  username_taken: 'That username is taken. Please choose another.',
  username_invalid: 'Use 3 to 30 lowercase letters, numbers or underscores, and not a reserved name.',
  display_name_invalid: 'Display names are 1 to 50 characters, with no special control characters.',
  invalid_identity: 'Choose creator, fan or both.',
  bio_too_long: 'Keep your bio to 160 characters.',
  follow_reason_too_long: 'Keep this to 140 characters.',
  invalid_text: 'Use a single paragraph, without line breaks or special characters.',
  too_many_topics: 'Choose up to 5 interests.',
  unknown_topic: "One of those interests isn't available any more. Please choose again.",
  not_available: "This isn't available yet. Please try again later.",
  already_reported: "You've already reported this. We'll review it.",
  cannot_report_self: "You can't report yourself.",
  invalid_reason: 'Choose a reason from the list.',
  not_moderator: 'Only moderators can do this.',
  not_live: 'This is already hidden or was deleted by its author. Nothing was changed.',
  not_hidden: "This isn't hidden by a moderator, so there's nothing to restore.",
  not_open: 'This report was already resolved. Nothing was changed.',
  not_jpeg: "That photo couldn't be used. Please choose another one.",
  wrong_size: "That photo couldn't be used. Please choose another one.",
  not_decodable: "That photo couldn't be read. Please choose another one.",
  photo_too_large: 'That photo is too large. Please choose one under 15 MB.',
  photo_type: 'Please choose a photo (JPEG, PNG, WebP or HEIC).',
  storage_unavailable: "We couldn't save your picture right now. Please try again.",
  plan_expired: 'That check is more than 15 minutes old. Run it again.',
  confirmation_mismatch: 'Type the confirmation exactly as shown.',
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

/**
 * True only when PostgREST answers that this exact public function does not
 * exist (PGRST202, "Could not find the function public.<fn>..."), which is
 * what a database without the pilot membership migration returns. Any other
 * answer (an authorization error, a database failure, a timeout, a different
 * function, a malformed reply) is false, so it can never be mistaken for
 * "the gate isn't there".
 */
export function isMissingFunction(error: { code?: string; message?: string } | null | undefined, fn: string): boolean {
  if (!error || error.code !== 'PGRST202') return false
  const m = /^Could not find the function public\.([a-z_]+)(?:\(| without parameters)/.exec(error.message ?? '')
  return !!m && m[1] === fn
}

const asIdentity = (v: unknown): Identity | null => (IDENTITIES as unknown[]).includes(v) ? (v as Identity) : null
const asText = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v : null)
const asTopics = (v: unknown): string[] => (Array.isArray(v) ? v.filter((t): t is string => typeof t === 'string') : [])

export function toDetails(r: Record<string, unknown> | undefined): ProfileDetails {
  return { identity: asIdentity(r?.identity), bio: asText(r?.bio), followReason: asText(r?.follow_reason), topics: asTopics(r?.topics) }
}

function toDiscoverMember(r: Record<string, unknown>, withDetails: boolean): DiscoverMember {
  return {
    id: String(r.id),
    username: String(r.username),
    displayName: String(r.display_name),
    postCount: num(r.post_count as number),
    followerCount: num(r.follower_count as number),
    followedByMe: Boolean(r.followed_by_me),
    inMyClique: Boolean(r.in_my_clique),
    ...(withDetails ? { details: toDetails(r), sharedTopics: num(r.shared_topics as number) } : {}),
  }
}

/** Reads the avatar function's error code from a failed invoke (never raw text). */
async function functionError(error: unknown): Promise<AppApiError> {
  const ctx = (error as { context?: unknown })?.context
  if (ctx instanceof Response) {
    if (ctx.status === 404) return new AppApiError('not_available')
    try {
      const body = (await ctx.json()) as { error?: unknown }
      if (typeof body.error === 'string') {
        if (body.error === 'too_large') return new AppApiError('photo_too_large')
        if (body.error === 'unavailable') return new AppApiError('not_available')
        if (Object.prototype.hasOwnProperty.call(MESSAGES, body.error)) return new AppApiError(body.error)
      }
    } catch {
      /* not JSON */
    }
    return new AppApiError(ctx.status >= 500 ? 'storage_unavailable' : 'unknown')
  }
  return new AppApiError('network')
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
    async accessState() {
      const { data, error } = await client.rpc('app_access_state')
      if (error) {
        // Before 20261122000000 there is no gate: every signed-in account is a
        // member, as the database itself still treats it. Only a definite
        // "function not found" means that; every other error is a failure.
        if (isMissingFunction(error, 'app_access_state')) return { status: 'active', expiresAt: null, preGate: true }
        throw toAppError(error)
      }
      // An unexpected reply is never treated as access.
      const r = Array.isArray(data) ? (data[0] as { status?: unknown; expires_at?: unknown } | undefined) : undefined
      const status = (['active', 'none', 'revoked', 'expired'] as const).find((s) => s === r?.status) ?? 'none'
      const expiresAt = status === 'active' && typeof r?.expires_at === 'string' ? r.expires_at : null
      return { status, expiresAt }
    },
    async ownProfile() {
      const { data, error } = await client.from('profiles').select('id, created_at, username, display_name').eq('id', userId).maybeSingle()
      if (error) throw toAppError(error)
      if (!data) return null
      const row = data as { id: string; created_at: string; username?: string | null; display_name?: string | null }
      return { id: row.id, createdAt: row.created_at, username: row.username ?? null, displayName: row.display_name ?? null }
    },
    async saveProfile({ username, displayName }) {
      const values = { username: username.trim(), displayName: displayName.trim() }
      // Through the database function, which checks pilot membership (members
      // no longer update the profiles table directly).
      const { error } = await client.rpc('app_set_profile', { p_username: values.username, p_display_name: values.displayName })
      if (!error) return
      if (!isMissingFunction(error, 'app_set_profile')) throw toAppError(error)
      // Before 20261122000000 only: the own-row update that database allows.
      // Once the gate exists this path is never taken, and the database
      // refuses direct profile updates anyway.
      const { error: legacy } = await client.from('profiles').update({ username: values.username, display_name: values.displayName }).eq('id', userId)
      if (legacy) throw toAppError(legacy)
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
    async discover(query, topic) {
      const p_query = query?.trim() || null
      const { data, error } = await client.rpc('app_discover_people', { p_query, p_topic: topic || null, p_limit: 30 })
      if (!error) return (data as Array<Record<string, unknown>>).map((r) => toDiscoverMember(r, true))
      // Before 20261123000000 only: the original Discover (no interests).
      if (!isMissingFunction(error, 'app_discover_people')) throw toAppError(error)
      const rows = await rpc<Array<Record<string, unknown>>>('app_discover', { p_query, p_limit: 30 })
      return rows.map((r) => toDiscoverMember(r, false))
    },
    async topics() {
      const { data, error } = await client.rpc('app_topics')
      if (error) {
        if (isMissingFunction(error, 'app_topics')) return null
        throw toAppError(error)
      }
      return (data as Array<Record<string, unknown>>).map((r) => ({ slug: String(r.slug), label: String(r.label) }))
    },
    async myDetails() {
      const { data, error } = await client.rpc('app_my_details')
      if (error) {
        if (isMissingFunction(error, 'app_my_details')) return null
        throw toAppError(error)
      }
      const r = (data as Array<Record<string, unknown>>)[0]
      return { ...toDetails(r), onboarded: Boolean(r?.onboarded) }
    },
    async saveDetails(d) {
      const { error } = await client.rpc('app_set_profile_details', {
        p_identity: d.identity,
        p_bio: d.bio?.trim() || null,
        p_follow_reason: d.followReason?.trim() || null,
        p_topics: d.topics,
      })
      if (!error) return
      if (isMissingFunction(error, 'app_set_profile_details')) throw new AppApiError('not_available')
      throw toAppError(error)
    },
    async memberDetails(memberId) {
      const { data, error } = await client.rpc('app_member_details', { p_member: memberId })
      if (error) {
        if (isMissingFunction(error, 'app_member_details')) return null
        throw toAppError(error)
      }
      const r = (data as Array<Record<string, unknown>>)[0]
      return r ? toDetails(r) : null
    },
    async moderationAccess() {
      const { data, error } = await client.rpc('app_is_moderator')
      if (error) {
        if (isMissingFunction(error, 'app_is_moderator')) return { available: false, moderator: false }
        throw toAppError(error)
      }
      return { available: true, moderator: data === true }
    },
    async report(target, targetId, reason, details) {
      const { error } = await client.rpc('app_report', { p_target_type: target, p_target_id: targetId, p_reason: reason, p_details: details?.trim() || null })
      if (!error) return
      if (isMissingFunction(error, 'app_report')) throw new AppApiError('not_available')
      throw toAppError(error)
    },
    async modQueue(status) {
      const rows = await rpc<Array<Record<string, unknown>>>('app_mod_queue', { p_status: status })
      return rows.map((r) => ({
        id: String(r.id),
        targetType: r.target_type as ReportTarget,
        targetId: String(r.target_id),
        reason: r.reason as ReportReason,
        priority: Boolean(r.priority),
        hasDetails: Boolean(r.has_details),
        excerpt: String(r.excerpt ?? ''),
        targetUsername: (r.target_username as string | null) ?? null,
        openReportsForTarget: num(r.open_reports_for_target as number),
        status: r.status as ReportStatus,
        createdAt: String(r.created_at),
        resolvedAt: (r.resolved_at as string | null) ?? null,
      }))
    },
    async modReport(id) {
      const rows = await rpc<Array<Record<string, unknown>>>('app_mod_report', { p_report: id })
      const r = rows[0]
      if (!r) return null
      return {
        id: String(r.id),
        targetType: r.target_type as ReportTarget,
        targetId: String(r.target_id),
        reason: r.reason as ReportReason,
        priority: Boolean(r.priority),
        details: (r.details as string | null) ?? null,
        snapshot: (r.snapshot as Record<string, string | null> | null) ?? null,
        status: r.status as ReportStatus,
        createdAt: String(r.created_at),
        resolvedAt: (r.resolved_at as string | null) ?? null,
        dataPurged: Boolean(r.data_purged),
        targetState: r.target_state as ModReport['targetState'],
        currentBody: (r.current_body as string | null) ?? null,
        openReportsForTarget: num(r.open_reports_for_target as number),
      }
    },
    async avatarLinks(memberIds) {
      const ids = [...new Set(memberIds)].slice(0, 100)
      if (ids.length === 0) return {}
      const { data, error } = await client.functions.invoke('avatar/urls', { body: { ids } })
      // No function yet (or any failure): everyone shows initials.
      if (error || !data || typeof data !== 'object') return {}
      const avatars = (data as { avatars?: Record<string, { url?: unknown; updatedAt?: unknown }> }).avatars ?? {}
      const base = client.storage.from('avatars').getPublicUrl('x').data.publicUrl.split('/object/')[0]
      const out: Record<string, AvatarLink> = {}
      for (const [id, v] of Object.entries(avatars)) {
        if (typeof v?.url === 'string' && v.url.startsWith('/object/sign/avatars/')) {
          out[id] = { url: `${base}${v.url}`, updatedAt: typeof v.updatedAt === 'string' ? v.updatedAt : null }
        }
      }
      return out
    },
    async uploadAvatar(jpeg) {
      const { error } = await client.functions.invoke('avatar/upload', { body: jpeg, headers: { 'Content-Type': 'image/jpeg' } })
      if (error) throw await functionError(error)
    },
    async removeAvatar() {
      const { error } = await client.functions.invoke('avatar/remove', { body: {} })
      if (error) throw await functionError(error)
    },
    async modStoragePreview() {
      const rows = await rpc<Array<Record<string, unknown>>>('app_mod_storage_preview')
      const r = rows[0] ?? {}
      return {
        planId: String(r.plan_id),
        fileCount: num(r.file_count as number),
        totalBytes: num(r.total_bytes as number),
        confirmPhrase: String(r.confirm_phrase),
        expiresAt: String(r.expires_at),
      }
    },
    async modStorageCleanup(planId, confirm) {
      const { data, error } = await client.functions.invoke('avatar/cleanup', { body: { plan: planId, confirm } })
      if (error) throw await functionError(error)
      const d = data as { deleted?: unknown; confirmed?: unknown }
      return { deleted: num(d?.deleted as number), confirmed: num(d?.confirmed as number) }
    },
    modHide: (id, note) => rpc<void>('app_mod_hide', { p_report: id, p_note: note?.trim() || null }),
    modRestore: (id, note) => rpc<void>('app_mod_restore', { p_report: id, p_note: note?.trim() || null }),
    modDismiss: (id, note) => rpc<void>('app_mod_dismiss', { p_report: id, p_note: note?.trim() || null }),
    async suggested() {
      const { data, error } = await client.rpc('app_suggested_creators', { p_limit: 10 })
      if (error) {
        if (isMissingFunction(error, 'app_suggested_creators')) return []
        throw toAppError(error)
      }
      return (data as Array<Record<string, unknown>>).map((r) => toDiscoverMember(r, true))
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
    async unseenCreators() {
      const rows = await rpc<Array<Record<string, unknown>>>('app_unseen_creators')
      return rows.map((r) => ({
        id: String(r.id),
        username: String(r.username),
        displayName: String(r.display_name),
        inMyClique: Boolean(r.in_my_clique),
        unseenCount: num(r.unseen_count as number),
        latestUnseenAt: String(r.latest_unseen_at),
      }))
    },
    async catchUp(creatorId, before) {
      const rows = await rpc<PostRow[]>('app_catch_up', {
        p_creator: creatorId,
        p_before_at: before?.createdAt ?? null,
        p_before_id: before?.id ?? null,
      })
      return rows.map(toPost)
    },
    markViewed: (postIds, basis) => rpc<number>('app_mark_viewed', { p_posts: postIds, p_basis: basis }),
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
