import type { SupabaseClient } from '@supabase/supabase-js'
import { forgetRegistrationCode, storedRegistrationCode } from './registration'

/**
 * The members area's data layer (Release 1: the social core).
 *
 * Everything goes through the public.app_* database functions
 * (supabase/migrations/20261117000000_social_core.sql), which check who is
 * calling and enforce the rules (no self-follows, a Clique only of creators
 * you follow (no limit since 20261201000000), only your own posts and comments can be
 * deleted).
 *
 * Members see two relationships: Following (everyone they follow, unlimited)
 * and My Clique (the ones they choose; stored in social.clique_members,
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
  /** Photo posts (20261127000000): the photo's shape and description; null or absent for text posts. */
  media?: PostMedia | null
  /** Home with reposts (20261202000000): when this item reached the feed (the repost time for a repost). */
  activityAt?: string
  /** Who reposted it to this member, when it reached Home as a repost. */
  repostedBy?: MemberSummary | null
  /** Discovery (20261203000000): why this post was suggested. */
  reason?: string
}

/** Connection Points (20261205000000). All values are SIMULATED during the pilot: never money. */
export interface MyPoints {
  /** Recognized contribution: counts toward recognition, never redeemable. */
  recognized: number
  /** Qualified referrals waiting for review (redeemable once approved). */
  redeemablePending: number
  /** Approved redeemable points not yet settled. */
  redeemableApproved: number
  /** Points already allocated in a simulated month close. */
  settled: number
  /** Simulated value of one approved redeemable point, in cents. */
  simulatedPointValueCents: number
  /** Simulated value of the member's approved redeemable points, in cents. */
  simulatedValueCents: number
}
export type PointsEntry = {
  id: number
  action: string
  points: number
  redeemable: boolean
  status: string
  createdAt: string
  creator: { username: string; displayName: string } | null
  postId: string | null
}
export type ReferralReview = { awardId: number; referrer: string | null; referred: string | null; firstFollow: string | null; createdAt: string }
export type RewardsOverview = {
  recognized: number
  redeemablePending: number
  redeemableApproved: number
  settled: number
  revenueCents: number
  creatorCents: number
  poolCents: number
  splitpostCents: number
  openPoolCents: number
  paused: boolean
  ruleVersion: string
}

/** Card details (20261202000000), fetched for many posts at once. */
export interface PostMeta {
  topic: string | null
  topicLabel: string | null
  editedAt: string | null
  savedByMe: boolean
  repostCount: number
  repostedByMe: boolean
}
export type PostEdit = { previousBody: string; previousTopic: string | null; editedAt: string }

export type PostMedia = { kind: 'photo'; width: number; height: number; description: string | null }
/** Signed links (valid for an hour) to a post's photo: the 800 px feed copy and the full 1600 px one. */
export type PhotoLinks = { feed: string; full: string }
/** Photo storage at a glance (moderators). */
export interface MediaStatus {
  photosEnabled: boolean
  capBytes: number | null
  usedBytes: number
  photoPosts: number
  queued: number
  oldestQueuedAt: string | null
  failing: number
  gaveUp: number
  held: number
  heldOpenOver30Days: number
  lastScheduledAt: string | null
  lastRunAt: string | null
  lastRunFailed: boolean
  egressReviewGb: number | null
  egressPauseGb: number | null
  checks: Array<{ ok: boolean; ms: number; at: string }>
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
  /** Relationships (20261201000000). Absent on a database without it. */
  cliqueCount?: number
  activeSupporterCount?: number
  iAmActiveSupporter?: boolean
  mutedByMe?: boolean
}

/** Where a follow started: a journey source, never a relationship stage. */
export type FollowSource = 'profile' | 'discover' | 'post' | 'catch_up' | 'comment' | 'search' | 'other'
/** A non-binding Support Intent: what a member says they would be willing to support each month. Never a payment. */
export type SupportChoice = 'usd_3' | 'usd_5' | 'usd_10' | 'not_sure'
/** The wording a member agrees to when allowing public previews (recorded with their choice). */
export const PREVIEW_WORDING_VERSION = 'previews-v1'
export const SUPPORT_CHOICES: Array<{ value: SupportChoice; label: string }> = [
  { value: 'usd_3', label: '$3 a month' },
  { value: 'usd_5', label: '$5 a month' },
  { value: 'usd_10', label: '$10 a month' },
  { value: 'not_sure', label: 'Not sure yet' },
]

/** Someone the member follows, with the relationship stage (Following, Clique Connection, Active Supporter). */
export interface Relationship extends FollowedCreator {
  activeSupporter: boolean
  muted: boolean
  supportChoice: SupportChoice | null
  latestPostAt: string | null
}

/** The member's own audience as a creator. Aggregates only, never who. */
export interface Audience {
  followerCount: number
  cliqueCount: number
  activeSupporterCount: number
  newFollowers7d: number
  newFollowersPrev7d: number
  /** Follows in the last 28 days by where they started. */
  followSources: Record<string, number>
  supportIntentCount: number
  supportByChoice: Partial<Record<SupportChoice, number>>
  posts28d: number
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
export type AccessStatus = 'active' | 'none' | 'revoked' | 'expired' | 'attestation_required'
/**
 * preGate: true only when the database has no membership gate yet (before
 * 20261122000000 is applied), so every signed-in account is a member exactly
 * as before. Never set for any other reason.
 */
/**
 * registration (foundation v2, 20261130000000) explains a 'none' state after
 * the automatic claim through a registration link: why the account has no
 * membership yet. 'retry' means the claim itself failed; the next load tries again.
 */
export type RegistrationOutcome = 'link_required' | 'not_confirmed' | 'invalid' | 'paused' | 'closed' | 'full' | 'referrer_limit' | 'retry'
export type AccessState = { status: AccessStatus; expiresAt: string | null; preGate?: true; registration?: RegistrationOutcome }

/** The wording version of the 18+ confirmation shown in the app and at registration. */
export const ADULT_WORDING_VERSION = 'adult-v1'

/** Where a page of posts ends: the next page starts strictly after it (20261130000000 pages on both). */
export type PostCursor = { createdAt: string; id: string }
/** Home faces: everyone followed (and your own posts), or only My Clique. */
export type FeedFilter = 'all' | 'clique'

/** The member's own profile row (Phase 1A own-row read), used to decide whether setup is needed. */
export type OwnProfile = { id: string; createdAt: string; username: string | null; displayName: string | null }

/**
 * Reporting and moderation (20261124000000_moderation). Reports never hide
 * anything by themselves, and no member function returns who reported.
 */
export type ReportTarget = 'post' | 'profile' | 'comment'
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
  /** Whose content it is (governance, 20261206000000); null before it or if the account is gone. */
  targetOwnerId: string | null
}

/** Governance (20261206000000). */
export type EnforcementLevel = 'warning' | 'restriction' | 'suspension'
export type Standing = { standing: 'restricted' | 'suspended'; endsAt: string | null }
export type NoticeKind = 'content_hidden' | 'content_restored' | EnforcementLevel | 'enforcement_lifted' | 'appeal_upheld' | 'appeal_reversed'
export interface MemberNotice {
  id: number
  kind: NoticeKind
  targetType: ReportTarget | null
  targetId: string | null
  reason: string | null
  excerpt: string | null
  endsAt: string | null
  createdAt: string
  read: boolean
  appealStatus: 'open' | 'upheld' | 'reversed' | null
  canAppeal: boolean
}
export interface BlockedMember {
  id: string
  username: string
  displayName: string
  blockedAt: string
}
export interface MemberRecord {
  username: string
  displayName: string
  standing: 'restricted' | 'suspended' | null
  hiddenContent: number
  enforcements: Array<{ id: number; level: EnforcementLevel; reason: string; startsAt: string; endsAt: string | null; liftedAt: string | null; liftedVia: string | null; active: boolean }>
}
export interface ModAppeal {
  id: string
  memberId: string
  memberUsername: string | null
  kind: NoticeKind
  targetType: ReportTarget | null
  targetId: string | null
  reason: string | null
  excerpt: string | null
  body: string
  status: 'open' | 'upheld' | 'reversed'
  createdAt: string
  decidedAt: string | null
  decisionNote: string | null
  /** The caller took the original action (another moderator decides when one exists). */
  decidedOriginal: boolean
}

/** A member's current picture: a signed link (valid for an hour) and when it changed. */
export type AvatarLink = { url: string; updatedAt: string | null }
/** A storage cleanup dry run (moderators only), valid for 15 minutes. */
export type StoragePlan = { planId: string; fileCount: number; totalBytes: number; confirmPhrase: string; expiresAt: string }

/** Feedback (20261126000000). */
export type FeedbackCategory = 'problem' | 'improvement' | 'praise'
/** Where the member was when they opened the form: a fixed list, never a URL or an id. */
export type FeedbackFeature = 'home' | 'discover' | 'profile' | 'clique' | 'post' | 'create' | 'catch_up' | 'other'
export type FeedbackStatus = 'new' | 'reviewing' | 'planned' | 'resolved' | 'closed'
export type Cohort = 'founder' | 'creator' | 'fan' | 'tester'
/** Whether feedback exists on this database, and whether the member is the founder (sees the inbox). */
export type FeedbackAccess = { available: boolean; founder: boolean }
export interface FeedbackItem {
  id: string
  category: FeedbackCategory
  feature: FeedbackFeature
  body: string
  status: FeedbackStatus
  cohort: Cohort | null
  submitterUsername: string | null
  submitterName: string | null
  noteCount: number
  createdAt: string
  updatedAt: string
}
export interface FeedbackEntry extends Omit<FeedbackItem, 'noteCount'> {
  notes: Array<{ body: string; author: string; createdAt: string }>
  history: Array<{ action: 'status_changed' | 'note_added'; from: FeedbackStatus | null; to: FeedbackStatus | null; by: string; at: string }>
}
export type FeedbackFilters = { category?: FeedbackCategory; status?: FeedbackStatus; cohort?: Cohort }

export interface AppApi {
  /** The signed-in account's own pilot membership state (needs no membership itself). */
  accessState(): Promise<AccessState>
  /** Confirms the signed-in member is 18 or older (once; needs active membership). */
  attestAdult(): Promise<void>
  /** The member's personal referral link code (created on first request), or null before 20261130000000. */
  myReferralCode(): Promise<string | null>
  ownProfile(): Promise<OwnProfile | null>
  saveProfile(input: { username: string; displayName: string }): Promise<void>
  me(): Promise<Me>
  feed(before?: PostCursor, filter?: FeedFilter): Promise<Post[]>
  member(username: string): Promise<Member | null>
  memberPosts(memberId: string, before?: PostCursor): Promise<Post[]>
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
  /**
   * Feedback (20261126000000). Sending needs pilot membership; the inbox
   * needs the founder cohort. Both are enforced by the database.
   */
  feedbackAccess(): Promise<FeedbackAccess>
  /** requestId: the form's id for this message, reused on retry, so it's stored once. */
  sendFeedback(input: { category: FeedbackCategory; feature: FeedbackFeature; body: string }, requestId: string): Promise<string>
  feedbackInbox(filters: FeedbackFilters, before?: { createdAt: string; id: string }): Promise<FeedbackItem[]>
  feedbackEntry(id: string): Promise<FeedbackEntry | null>
  setFeedbackStatus(id: string, status: FeedbackStatus): Promise<void>
  addFeedbackNote(id: string, note: string): Promise<void>
  /**
   * Photo posts (20261127000000 and the post-media Edge Function). The browser
   * sends only its resized JPEG; the server checks it, makes both stored
   * copies and stores them. Off (false) until the founder turns photos on,
   * and on a database without them.
   */
  photoStatus(): Promise<boolean>
  uploadPhoto(jpeg: Blob): Promise<{ uploadId: string; width: number; height: number }>
  /** Publishes a post with a stored photo (caption optional). requestId as for createPost. */
  createPhotoPost(body: string, requestId: string, uploadId: string, description?: string): Promise<string>
  photoLinks(postIds: string[]): Promise<Record<string, PhotoLinks>>
  /** After deleting a photo post: asks the server to work through the deletion queue now (the schedule guarantees it anyway). */
  requestPhotoCleanup(): Promise<void>
  modReportPhoto(reportId: string): Promise<(PhotoLinks & { description: string | null }) | null>
  mediaStatus(): Promise<MediaStatus>
  modMediaDrain(): Promise<{ deleted: number; failed: number }>
  /** The founder's hosted processing check (one of six). */
  runPhotoCheck(seed: number): Promise<{ ms: number; ok: boolean }>
  following(): Promise<FollowedCreator[]>
  /** requestId: the browser's id for this post, reused on retry, so it's stored once (issue #48). */
  createPost(body: string, requestId?: string): Promise<string>
  deletePost(id: string): Promise<void>
  follow(memberId: string, source?: FollowSource): Promise<void>
  unfollow(memberId: string): Promise<void>
  cliqueAdd(memberId: string): Promise<void>
  cliqueRemove(memberId: string): Promise<void>
  /** Swaps one Clique creator for another followed creator in one step; on failure nothing changes. */
  cliqueReplace(removeId: string, addId: string): Promise<void>
  /** Relationships (20261201000000). A muted creator leaves the member's Home; nothing else changes. */
  mute(memberId: string): Promise<void>
  unmute(memberId: string): Promise<void>
  /** Clique first: unseen recent posts from the member's Clique, newest first. Empty before 20261201000000. */
  homePriority(): Promise<Post[]>
  /** Everyone followed, with stage, mute and Support Intent; null before 20261201000000 (use following()). */
  relationships(): Promise<Relationship[] | null>
  /** The member's own audience insight; null before 20261201000000. */
  audience(): Promise<Audience | null>
  /** The member's own current Support Intent for a creator (null: none). undefined before 20261201000000. */
  supportIntent(creatorId: string): Promise<SupportChoice | null | undefined>
  recordSupportIntent(creatorId: string, choice: SupportChoice | 'withdrawn'): Promise<void>
  /** Content (20261202000000). Card details for posts; null before the migration. */
  postMeta(postIds: string[]): Promise<Record<string, PostMeta> | null>
  /** Gives a just-published post its topic (once). */
  setPostTopic(postId: string, topic: string): Promise<void>
  editPost(postId: string, body: string, topic: string | null): Promise<void>
  postEdits(postId: string): Promise<PostEdit[]>
  save(postId: string): Promise<void>
  unsave(postId: string): Promise<void>
  /** Saved posts, most recently saved first; null before the migration. */
  savedPosts(before?: PostCursor): Promise<Post[] | null>
  repost(postId: string): Promise<void>
  unrepost(postId: string): Promise<void>
  /** Discovery (20261203000000): posts in the member's interests (or one topic) from people they don't follow; null before it. */
  discoverPosts(topic?: string): Promise<Post[] | null>
  /** Posts matching words or a topic name; null before the migration. Nothing about a search is stored. */
  searchPosts(query: string): Promise<Post[] | null>
  /** Records a share (copy link or share sheet). Best effort: sharing still works if this fails. */
  recordShare(postId: string, channel: 'copy_link' | 'share_sheet'): Promise<void>
  /** Search measurement (20261204000000): daily counts only, never the words or the member. Best effort. */
  noteSearch(surface: 'search' | 'focus', hadResults: boolean, topic?: string): Promise<void>
  noteSearchSelection(surface: 'search' | 'focus', topic?: string): Promise<void>
  /** Whether the member has opted in to public previews of their posts (off until they choose); null before 20261204000000. */
  publicPreviewsAllowed(): Promise<boolean | null>
  setPublicPreviews(allowed: boolean): Promise<void>
  /** Rewards (20261205000000), all simulated; null before the migration. */
  myPoints(): Promise<MyPoints | null>
  myPointsHistory(before?: number): Promise<PointsEntry[]>
  mySimulatedEarnings(): Promise<Array<{ month: string; creatorCents: number }> | null>
  founderReferralQueue(): Promise<ReferralReview[]>
  founderReviewReferral(awardId: number, approve: boolean): Promise<void>
  founderRewardsOverview(): Promise<RewardsOverview | null>
  /** Governance (20261206000000). Blocks: two way, never shown to the blocked member. */
  block(memberId: string): Promise<void>
  unblock(memberId: string): Promise<void>
  /** The members the caller blocked; null before the migration. */
  myBlocks(): Promise<BlockedMember[] | null>
  /** The caller's own restriction or suspension (null: none, or before the migration). */
  myStanding(): Promise<Standing | null>
  /** The caller's moderation notices, newest first; null before the migration. */
  myNotices(): Promise<MemberNotice[] | null>
  markNoticesRead(): Promise<void>
  appeal(noticeId: number, body: string): Promise<void>
  modEnforce(memberId: string, level: EnforcementLevel, reason: ReportReason, reportId?: string | null, days?: number | null, note?: string): Promise<void>
  modLift(enforcementId: number, note?: string): Promise<void>
  modMemberRecord(memberId: string): Promise<MemberRecord | null>
  modAppeals(status: 'open' | 'decided'): Promise<ModAppeal[] | null>
  modDecideAppeal(appealId: string, reverse: boolean, note?: string): Promise<void>
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
  feedbackMin: 10,
  feedbackMax: 1000,
  feedbackNote: 1000,
  post: 2000,
  comment: 1000,
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
  clique_full: 'Your Clique is full for now. Remove someone from it, then try again.',
  not_in_clique: 'That creator is no longer in your Clique. Nothing was changed.',
  already_in_clique: 'That creator is already in your Clique. Nothing was changed.',
  cannot_repost_own: "You can't repost your own post.",
  month_not_over: 'That month is not over yet.',
  already_closed: 'That month is already closed.',
  does_not_reconcile: "The month didn't add up, so nothing was closed. Please tell the team.",
  invalid_query: 'Type at least two letters to search.',
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
  avatar_limit: 'You can change your picture 10 times a day. Please try again tomorrow.',
  plan_expired: 'That check is more than 15 minutes old. Run it again.',
  confirmation_mismatch: 'Type the confirmation exactly as shown.',
  photos_unavailable: "Photo posts aren't available right now. You can still post text.",
  photo_limit: 'You can post 10 photos a day. Please try again tomorrow.',
  storage_full: "Photo storage is full for now. You can still post text, and we're on it.",
  upload_not_ready: 'Something went wrong with that photo. Please add it again.',
  upload_expired: 'That photo took too long to post. Please add it again.',
  invalid_description: 'Keep the photo description to 250 characters on one line.',
  photo_not_usable: "That photo couldn't be used. Please choose another one.",
  photo_original_too_large: 'That photo is too large. Please choose one under 25 MB.',
  photo_upload_failed: "We couldn't upload your photo right now. Please try again.",
  feedback_too_short: 'Please write at least 10 characters.',
  invalid_category: 'Choose what kind of feedback this is.',
  invalid_status: 'Choose a status from the list.',
  note_required: 'Write a note first.',
  not_founder: 'Only the founder can see this.',
  cannot_block_self: "You can't block yourself.",
  restricted: "You can't post, comment or repost while a restriction is in place. Your notices say when it ends.",
  suspended: 'Your account is suspended. You can still read your notices and appeal.',
  ladder_step_required: 'Take the earlier step first: a warning before a restriction, a restriction before a suspension (threats, self-harm and hate excepted).',
  cannot_enforce_self: "You can't take action on your own account.",
  not_active: 'This has already ended. Nothing was changed.',
  not_appealable: "This notice can't be appealed.",
  appeal_window_closed: 'Appeals can be made within 30 days, and this one is older.',
  already_appealed: "You've already appealed this. We'll let you know the decision.",
  needs_another_moderator: 'Another moderator decides appeals on your own actions.',
  cannot_decide_own_appeal: "You can't decide your own appeal.",
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
  media?: unknown
  activity_at?: string
  reason?: string | null
  reposted_by_id?: string | null
  reposted_by_username?: string | null
  reposted_by_display_name?: string | null
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
    media: toMedia(r.media),
    ...(r.activity_at ? { activityAt: r.activity_at } : {}),
    ...(r.reason ? { reason: r.reason } : {}),
    ...(r.reposted_by_id
      ? { repostedBy: { id: r.reposted_by_id, username: String(r.reposted_by_username), displayName: String(r.reposted_by_display_name) } }
      : {}),
  }
}

/** Where the next page of a list starts: after the last item's activity (a repost's time), then its id. */
export function cursorOf(p: Post): PostCursor {
  return { createdAt: p.activityAt ?? p.createdAt, id: p.id }
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

const asSupportChoice = (v: unknown): SupportChoice | null =>
  SUPPORT_CHOICES.some((c) => c.value === v) ? (v as SupportChoice) : null
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
        if (body.error === 'rate_limited') return new AppApiError('avatar_limit')
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

/** The post-media function's refusals, in the app's words. */
async function photoFunctionError(error: unknown): Promise<AppApiError> {
  const ctx = (error as { context?: unknown })?.context
  if (ctx instanceof Response) {
    if (ctx.status === 404) return new AppApiError('photos_unavailable')
    try {
      const body = (await ctx.json()) as { error?: unknown }
      if (typeof body.error === 'string') {
        if (['not_jpeg', 'wrong_size', 'not_decodable', 'too_large'].includes(body.error)) return new AppApiError('photo_not_usable')
        if (body.error === 'unavailable') return new AppApiError('photos_unavailable')
        if (body.error === 'storage_unavailable') return new AppApiError('photo_upload_failed')
        if (Object.prototype.hasOwnProperty.call(MESSAGES, body.error)) return new AppApiError(body.error)
      }
    } catch {
      /* not JSON */
    }
    return new AppApiError(ctx.status >= 500 ? 'photo_upload_failed' : 'unknown')
  }
  return new AppApiError('network')
}

function toMedia(v: unknown): PostMedia | null {
  if (!v || typeof v !== 'object') return null
  const m = v as Record<string, unknown>
  if (m.kind !== 'photo' || typeof m.width !== 'number' || typeof m.height !== 'number' || m.width < 1 || m.height < 1) return null
  return { kind: 'photo', width: m.width, height: m.height, description: typeof m.description === 'string' ? m.description : null }
}

function toFeedbackItem(r: Record<string, unknown>): FeedbackItem {
  return {
    id: String(r.id),
    category: r.category as FeedbackCategory,
    feature: r.feature as FeedbackFeature,
    body: String(r.body ?? ''),
    status: r.status as FeedbackStatus,
    cohort: (r.cohort as Cohort | null) ?? null,
    submitterUsername: (r.submitter_username as string | null) ?? null,
    submitterName: (r.submitter_display_name as string | null) ?? null,
    noteCount: num(r.note_count as number),
    createdAt: String(r.created_at),
    updatedAt: String(r.updated_at),
  }
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
      const status = (['active', 'none', 'revoked', 'expired', 'attestation_required'] as const).find((s) => s === r?.status) ?? 'none'
      const expiresAt = (status === 'active' || status === 'attestation_required') && typeof r?.expires_at === 'string' ? r.expires_at : null
      if (status !== 'none') return { status, expiresAt }
      // Foundation v2 (20261130000000): an account with no membership at all
      // claims it through the registration link it signed up with. The
      // database grants it only with a verified email, a valid link within the
      // limits, and the 18+ confirmation given at sign-up; it never reopens a
      // revoked or expired membership. Idempotent: a failed claim is made again
      // on the next load.
      let meta: { registration_code?: unknown; adult_attested?: unknown } = {}
      try {
        const { data: auth } = await client.auth.getUser()
        meta = (auth?.user?.user_metadata ?? {}) as typeof meta
      } catch {
        // Not readable now: the database falls back to the code stored with the account.
      }
      const code = typeof meta.registration_code === 'string' ? meta.registration_code : storedRegistrationCode()
      const claim = await client.rpc('app_claim_access', {
        p_code: code,
        p_adult_attested: meta.adult_attested === true || meta.adult_attested === 'true',
        p_wording_version: ADULT_WORDING_VERSION,
      })
      if (claim.error) {
        // Before that migration there is nothing to claim: as before.
        if (isMissingFunction(claim.error, 'app_claim_access')) return { status, expiresAt }
        return { status, expiresAt, registration: 'retry' }
      }
      if (claim.data === 'active') {
        forgetRegistrationCode()
        return { status: 'active', expiresAt: null }
      }
      if (claim.data === 'revoked' || claim.data === 'expired') return { status: claim.data, expiresAt: null }
      const outcomes: RegistrationOutcome[] = ['link_required', 'not_confirmed', 'invalid', 'paused', 'closed', 'full', 'referrer_limit']
      const outcome = outcomes.find((o) => o === claim.data)
      // An adult_required answer means sign-up skipped the confirmation: ask for a new link.
      return { status, expiresAt, registration: outcome ?? 'link_required' }
    },
    async attestAdult() {
      const { error } = await client.rpc('app_attest_adult', { p_wording_version: ADULT_WORDING_VERSION })
      if (error) throw toAppError(error)
    },
    async myReferralCode() {
      const { data, error } = await client.rpc('app_my_referral_link')
      if (error) {
        if (isMissingFunction(error, 'app_my_referral_link')) return null
        throw toAppError(error)
      }
      return typeof data === 'string' ? data : null
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
    async feed(before, filter = 'all') {
      // Home with reposts (20261202000000), paged on (activity, id); before it, the plain feed.
      const items = await client.rpc('app_feed_items_page', {
        p_before_at: before?.createdAt ?? null,
        p_before_id: before?.id ?? null,
        p_limit: 20,
        p_filter: filter,
      })
      if (!items.error) return ((items.data ?? []) as PostRow[]).map(toPost)
      if (!isMissingFunction(items.error, 'app_feed_items_page')) throw toAppError(items.error)
      // Pages on (created_at, id), so posts with the same time are never skipped (20261130000000).
      const { data, error } = await client.rpc('app_feed_page', {
        p_before_at: before?.createdAt ?? null,
        p_before_id: before?.id ?? null,
        p_limit: 20,
        p_filter: filter,
      })
      if (!error) return ((data ?? []) as PostRow[]).map(toPost)
      if (!isMissingFunction(error, 'app_feed_page')) throw toAppError(error)
      // Before that migration: the earlier time-only paging, filtered here for My Clique.
      const posts = (await rpc<PostRow[]>('app_feed', { p_before: before?.createdAt ?? null, p_limit: 20 })).map(toPost)
      return filter === 'clique' ? posts.filter((p) => p.authorInMyClique) : posts
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
        ...('active_supporter_count' in r
          ? {
              cliqueCount: num(r.clique_count as number),
              activeSupporterCount: num(r.active_supporter_count as number),
              iAmActiveSupporter: Boolean(r.i_am_active_supporter),
              mutedByMe: Boolean(r.muted_by_me),
            }
          : {}),
      }
    },
    async memberPosts(memberId, before) {
      const { data, error } = await client.rpc('app_member_posts_page', {
        p_member: memberId,
        p_before_at: before?.createdAt ?? null,
        p_before_id: before?.id ?? null,
        p_limit: 20,
      })
      if (!error) return ((data ?? []) as PostRow[]).map(toPost)
      if (!isMissingFunction(error, 'app_member_posts_page')) throw toAppError(error)
      return (await rpc<PostRow[]>('app_member_posts', { p_member: memberId, p_before: before?.createdAt ?? null, p_limit: 20 })).map(toPost)
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
    async feedbackAccess() {
      const { data, error } = await client.rpc('app_is_founder')
      if (error) {
        if (isMissingFunction(error, 'app_is_founder')) return { available: false, founder: false }
        throw toAppError(error)
      }
      return { available: true, founder: data === true }
    },
    async sendFeedback(input, requestId) {
      const { data, error } = await client.rpc('app_feedback_submit', {
        p_category: input.category,
        p_feature: input.feature,
        p_body: input.body,
        p_request_id: requestId,
      })
      if (!error) return String(data)
      if (isMissingFunction(error, 'app_feedback_submit')) throw new AppApiError('not_available')
      throw toAppError(error)
    },
    async feedbackInbox(filters, before) {
      const rows = await rpc<Array<Record<string, unknown>>>('app_founder_feedback_list', {
        p_category: filters.category ?? null,
        p_status: filters.status ?? null,
        p_cohort: filters.cohort ?? null,
        p_before: before?.createdAt ?? null,
        p_before_id: before?.id ?? null,
        p_limit: 50,
      })
      return rows.map(toFeedbackItem)
    },
    async feedbackEntry(id) {
      const rows = await rpc<Array<Record<string, unknown>>>('app_founder_feedback', { p_id: id })
      const r = rows[0]
      if (!r) return null
      const notes = Array.isArray(r.notes) ? (r.notes as Array<Record<string, unknown>>) : []
      const history = Array.isArray(r.history) ? (r.history as Array<Record<string, unknown>>) : []
      const { noteCount: _ignored, ...item } = toFeedbackItem({ ...r, note_count: notes.length })
      return {
        ...item,
        notes: notes.map((n) => ({ body: String(n.body), author: String(n.author), createdAt: String(n.created_at) })),
        history: history.map((h) => ({
          action: h.action as 'status_changed' | 'note_added',
          from: (h.from as FeedbackStatus | null) ?? null,
          to: (h.to as FeedbackStatus | null) ?? null,
          by: String(h.by),
          at: String(h.at),
        })),
      }
    },
    async setFeedbackStatus(id, status) {
      await rpc('app_founder_feedback_set_status', { p_id: id, p_status: status })
    },
    async addFeedbackNote(id, note) {
      await rpc('app_founder_feedback_add_note', { p_id: id, p_note: note })
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
        targetOwnerId: (r.target_owner_id as string | null | undefined) ?? null,
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
    async photoStatus() {
      const { data, error } = await client.rpc('app_photo_status')
      if (error) {
        if (isMissingFunction(error, 'app_photo_status')) return false
        throw toAppError(error)
      }
      return data === true
    },
    async uploadPhoto(jpeg) {
      const { data, error } = await client.functions.invoke('post-media/photo', { body: jpeg, headers: { 'Content-Type': 'image/jpeg' } })
      if (error) throw await photoFunctionError(error)
      const d = (data ?? {}) as { uploadId?: unknown; width?: unknown; height?: unknown }
      if (typeof d.uploadId !== 'string' || typeof d.width !== 'number' || typeof d.height !== 'number') throw new AppApiError('photo_upload_failed')
      return { uploadId: d.uploadId, width: d.width, height: d.height }
    },
    createPhotoPost: (body, requestId, uploadId, description) =>
      rpc<string>('app_create_post', { p_body: body, p_request_id: requestId, p_media: uploadId, p_media_description: description?.trim() || null }),
    async photoLinks(postIds) {
      const ids = [...new Set(postIds)].slice(0, 100)
      if (ids.length === 0) return {}
      const { data, error } = await client.functions.invoke('post-media/links', { body: { ids } })
      // No function yet (or any failure): the post shows "couldn't load" with a retry.
      if (error || !data || typeof data !== 'object') return {}
      const photos = (data as { photos?: Record<string, { feed?: unknown; full?: unknown }> }).photos ?? {}
      const base = client.storage.from('post-photos').getPublicUrl('x').data.publicUrl.split('/object/')[0]
      const out: Record<string, PhotoLinks> = {}
      for (const [id, v] of Object.entries(photos)) {
        if (typeof v?.feed === 'string' && typeof v?.full === 'string' && v.feed.startsWith('/object/sign/post-photos/') && v.full.startsWith('/object/sign/post-photos/')) {
          out[id] = { feed: `${base}${v.feed}`, full: `${base}${v.full}` }
        }
      }
      return out
    },
    async requestPhotoCleanup() {
      await client.functions.invoke('post-media/cleanup', { body: {} })
    },
    async modReportPhoto(reportId) {
      const { data, error } = await client.functions.invoke('post-media/mod-photo', { body: { report: reportId } })
      if (error) throw await photoFunctionError(error)
      const p = (data as { photo?: { feed?: unknown; full?: unknown; description?: unknown } | null })?.photo
      if (!p || typeof p.feed !== 'string' || typeof p.full !== 'string' || !p.feed.startsWith('/object/sign/post-photos/') || !p.full.startsWith('/object/sign/post-photos/')) return null
      const base = client.storage.from('post-photos').getPublicUrl('x').data.publicUrl.split('/object/')[0]
      return { feed: `${base}${p.feed}`, full: `${base}${p.full}`, description: typeof p.description === 'string' ? p.description : null }
    },
    async mediaStatus() {
      const s = await rpc<Record<string, unknown>>('app_mod_media_status')
      const n = (v: unknown) => (v === null || v === undefined ? null : Number(v))
      return {
        photosEnabled: s.photos_enabled === true,
        capBytes: n(s.cap_bytes),
        usedBytes: Number(s.used_bytes ?? 0),
        photoPosts: Number(s.photo_posts ?? 0),
        queued: Number(s.queued ?? 0),
        oldestQueuedAt: (s.oldest_queued_at as string | null) ?? null,
        failing: Number(s.failing ?? 0),
        gaveUp: Number(s.gave_up ?? 0),
        held: Number(s.held ?? 0),
        heldOpenOver30Days: Number(s.held_open_over_30_days ?? 0),
        lastScheduledAt: (s.last_scheduled_at as string | null) ?? null,
        lastRunAt: (s.last_run_at as string | null) ?? null,
        lastRunFailed: s.last_run_failed === true,
        egressReviewGb: n(s.egress_review_gb),
        egressPauseGb: n(s.egress_pause_gb),
        checks: Array.isArray(s.checks) ? (s.checks as Array<Record<string, unknown>>).map((c) => ({ ok: c.ok === true, ms: Number(c.ms ?? 0), at: String(c.at) })) : [],
      }
    },
    async modMediaDrain() {
      const { data, error } = await client.functions.invoke('post-media/mod-drain', { body: {} })
      if (error) throw await photoFunctionError(error)
      const d = (data ?? {}) as { deleted?: unknown; failed?: unknown }
      return { deleted: Number(d.deleted ?? 0), failed: Number(d.failed ?? 0) }
    },
    async runPhotoCheck(seed) {
      const { data, error } = await client.functions.invoke('post-media/check', { body: { seed } })
      if (error) throw await photoFunctionError(error)
      const d = (data ?? {}) as { ms?: unknown; ok?: unknown }
      return { ms: Number(d.ms ?? 0), ok: d.ok === true }
    },
    async follow(id, source) {
      // The source is recorded since 20261201000000; an older database follows without it.
      const { error } = await client.rpc('app_follow', { p_creator: id, p_source: source ?? null })
      if (!error) return
      if (isMissingFunction(error, 'app_follow')) return rpc<void>('app_follow', { p_creator: id })
      throw toAppError(error)
    },
    mute: (id) => rpc<void>('app_mute', { p_creator: id }),
    unmute: (id) => rpc<void>('app_unmute', { p_creator: id }),
    async homePriority() {
      const { data, error } = await client.rpc('app_home_priority', { p_limit: 10 })
      if (!error) return ((data ?? []) as PostRow[]).map(toPost)
      if (isMissingFunction(error, 'app_home_priority')) return []
      throw toAppError(error)
    },
    async relationships() {
      const { data, error } = await client.rpc('app_my_relationships')
      if (error) {
        if (isMissingFunction(error, 'app_my_relationships')) return null
        throw toAppError(error)
      }
      return ((data ?? []) as Array<Record<string, unknown>>).map((r) => ({
        id: String(r.id),
        username: String(r.username),
        displayName: String(r.display_name),
        followedAt: String(r.followed_at),
        inMyClique: Boolean(r.in_my_clique),
        cliqueAddedAt: (r.clique_added_at as string | null) ?? null,
        activeSupporter: Boolean(r.active_supporter),
        muted: Boolean(r.muted),
        supportChoice: asSupportChoice(r.support_choice),
        latestPostAt: (r.latest_post_at as string | null) ?? null,
      }))
    },
    async audience() {
      const { data, error } = await client.rpc('app_my_audience')
      if (error) {
        if (isMissingFunction(error, 'app_my_audience')) return null
        throw toAppError(error)
      }
      const r = (Array.isArray(data) ? data[0] : null) as Record<string, unknown> | null
      if (!r) return null
      const counts = (v: unknown) =>
        Object.fromEntries(Object.entries((v && typeof v === 'object' ? v : {}) as Record<string, unknown>).map(([k, n]) => [k, num(n as number)]))
      return {
        followerCount: num(r.follower_count as number),
        cliqueCount: num(r.clique_count as number),
        activeSupporterCount: num(r.active_supporter_count as number),
        newFollowers7d: num(r.new_followers_7d as number),
        newFollowersPrev7d: num(r.new_followers_prev_7d as number),
        followSources: counts(r.follow_sources_28d),
        supportIntentCount: num(r.support_intent_count as number),
        supportByChoice: counts(r.support_by_choice) as Partial<Record<SupportChoice, number>>,
        posts28d: num(r.posts_28d as number),
      }
    },
    async supportIntent(creatorId) {
      const { data, error } = await client.rpc('app_support_intent', { p_creator: creatorId })
      if (error) {
        if (isMissingFunction(error, 'app_support_intent')) return undefined
        throw toAppError(error)
      }
      const r = (Array.isArray(data) ? data[0] : null) as { choice?: unknown } | null
      return asSupportChoice(r?.choice)
    },
    recordSupportIntent: (creatorId, choice) => rpc<void>('app_record_support_intent', { p_creator: creatorId, p_choice: choice }),
    async postMeta(postIds) {
      const out: Record<string, PostMeta> = {}
      for (let i = 0; i < postIds.length; i += 100) {
        const { data, error } = await client.rpc('app_post_meta', { p_posts: postIds.slice(i, i + 100) })
        if (error) {
          if (isMissingFunction(error, 'app_post_meta')) return null
          throw toAppError(error)
        }
        for (const r of (data ?? []) as Array<Record<string, unknown>>) {
          out[String(r.post_id)] = {
            topic: (r.topic as string | null) ?? null,
            topicLabel: (r.topic_label as string | null) ?? null,
            editedAt: (r.edited_at as string | null) ?? null,
            savedByMe: Boolean(r.saved_by_me),
            repostCount: num(r.repost_count as number),
            repostedByMe: Boolean(r.reposted_by_me),
          }
        }
      }
      return out
    },
    setPostTopic: (postId, topic) => rpc<void>('app_set_post_topic', { p_post: postId, p_topic: topic }),
    editPost: (postId, body, topic) => rpc<void>('app_edit_post', { p_post: postId, p_body: body, p_topic: topic }),
    async postEdits(postId) {
      const rows = await rpc<Array<Record<string, unknown>>>('app_post_edits', { p_post: postId })
      return rows.map((r) => ({ previousBody: String(r.previous_body), previousTopic: (r.previous_topic as string | null) ?? null, editedAt: String(r.edited_at) }))
    },
    save: (postId) => rpc<void>('app_save', { p_post: postId }),
    unsave: (postId) => rpc<void>('app_unsave', { p_post: postId }),
    async savedPosts(before) {
      const { data, error } = await client.rpc('app_saved_page', { p_before_at: before?.createdAt ?? null, p_before_id: before?.id ?? null, p_limit: 20 })
      if (error) {
        if (isMissingFunction(error, 'app_saved_page')) return null
        throw toAppError(error)
      }
      // Paged on (saved time, id): the cursor carries the saved time.
      return ((data ?? []) as Array<PostRow & { saved_at: string }>).map((r) => ({ ...toPost(r), activityAt: r.saved_at }))
    },
    async discoverPosts(topic) {
      const { data, error } = await client.rpc('app_discover_content', { p_topic: topic ?? null, p_limit: 30 })
      if (error) {
        if (isMissingFunction(error, 'app_discover_content')) return null
        throw toAppError(error)
      }
      return ((data ?? []) as PostRow[]).map(toPost)
    },
    async searchPosts(query) {
      const { data, error } = await client.rpc('app_search_posts', { p_query: query, p_limit: 30 })
      if (error) {
        if (isMissingFunction(error, 'app_search_posts')) return null
        throw toAppError(error)
      }
      return ((data ?? []) as PostRow[]).map(toPost)
    },
    recordShare: (postId, channel) => rpc<void>('app_record_share', { p_post: postId, p_channel: channel }),
    async noteSearch(surface, hadResults, topic) {
      const { error } = await client.rpc('app_note_search', { p_surface: surface, p_had_results: hadResults, p_topic: topic ?? null })
      if (error && !isMissingFunction(error, 'app_note_search')) throw toAppError(error)
    },
    async noteSearchSelection(surface, topic) {
      const { error } = await client.rpc('app_note_search_selection', { p_surface: surface, p_topic: topic ?? null })
      if (error && !isMissingFunction(error, 'app_note_search_selection')) throw toAppError(error)
    },
    async publicPreviewsAllowed() {
      const { data, error } = await client.rpc('app_public_previews_allowed')
      if (error) {
        if (isMissingFunction(error, 'app_public_previews_allowed')) return null
        throw toAppError(error)
      }
      return data === true
    },
    async myPoints() {
      const { data, error } = await client.rpc('app_my_points')
      if (error) {
        if (isMissingFunction(error, 'app_my_points')) return null
        throw toAppError(error)
      }
      const r = (Array.isArray(data) ? data[0] : null) as Record<string, unknown> | null
      if (!r) return null
      return {
        recognized: num(r.recognized as number),
        redeemablePending: num(r.redeemable_pending as number),
        redeemableApproved: num(r.redeemable_approved as number),
        settled: num(r.settled as number),
        simulatedPointValueCents: num(r.simulated_point_value_cents as number),
        simulatedValueCents: num(r.simulated_value_cents as number),
      }
    },
    async myPointsHistory(before) {
      const rows = await rpc<Array<Record<string, unknown>>>('app_my_points_history', { p_before: before ?? null, p_limit: 30 })
      return rows.map((r) => ({
        id: num(r.id as number),
        action: String(r.action),
        points: num(r.points as number),
        redeemable: Boolean(r.redeemable),
        status: String(r.status),
        createdAt: String(r.created_at),
        creator: r.creator_username ? { username: String(r.creator_username), displayName: String(r.creator_display_name) } : null,
        postId: (r.post_id as string | null) ?? null,
      }))
    },
    async mySimulatedEarnings() {
      const { data, error } = await client.rpc('app_my_simulated_earnings')
      if (error) {
        if (isMissingFunction(error, 'app_my_simulated_earnings')) return null
        throw toAppError(error)
      }
      return ((data ?? []) as Array<Record<string, unknown>>).map((r) => ({ month: String(r.month), creatorCents: num(r.creator_cents as number) }))
    },
    async founderReferralQueue() {
      const rows = await rpc<Array<Record<string, unknown>>>('app_founder_referral_queue')
      return rows.map((r) => ({
        awardId: num(r.award_id as number),
        referrer: (r.referrer_username as string | null) ?? null,
        referred: (r.referred_username as string | null) ?? null,
        firstFollow: (r.first_follow_username as string | null) ?? null,
        createdAt: String(r.created_at),
      }))
    },
    founderReviewReferral: (awardId, approve) => rpc<void>('app_founder_review_referral', { p_award: awardId, p_approve: approve }),
    async founderRewardsOverview() {
      const { data, error } = await client.rpc('app_founder_rewards_overview')
      if (error) {
        if (isMissingFunction(error, 'app_founder_rewards_overview')) return null
        throw toAppError(error)
      }
      const r = (Array.isArray(data) ? data[0] : null) as Record<string, unknown> | null
      if (!r) return null
      return {
        recognized: num(r.recognized as number),
        redeemablePending: num(r.redeemable_pending as number),
        redeemableApproved: num(r.redeemable_approved as number),
        settled: num(r.settled as number),
        revenueCents: num(r.revenue_cents as number),
        creatorCents: num(r.creator_cents as number),
        poolCents: num(r.pool_cents as number),
        splitpostCents: num(r.splitpost_cents as number),
        openPoolCents: num(r.open_pool_cents as number),
        paused: Boolean(r.paused),
        ruleVersion: String(r.rule_version),
      }
    },
    block: (id) => rpc<void>('app_block', { p_member: id }),
    unblock: (id) => rpc<void>('app_unblock', { p_member: id }),
    async myBlocks() {
      const { data, error } = await client.rpc('app_my_blocks')
      if (error) {
        if (isMissingFunction(error, 'app_my_blocks')) return null
        throw toAppError(error)
      }
      return ((data ?? []) as Array<Record<string, unknown>>).map((r) => ({
        id: String(r.id),
        username: String(r.username),
        displayName: String(r.display_name),
        blockedAt: String(r.blocked_at),
      }))
    },
    async myStanding() {
      const { data, error } = await client.rpc('app_my_standing')
      if (error) {
        if (isMissingFunction(error, 'app_my_standing')) return null
        throw toAppError(error)
      }
      const r = (Array.isArray(data) ? data[0] : null) as Record<string, unknown> | null
      if (!r) return null
      return { standing: r.standing as Standing['standing'], endsAt: (r.ends_at as string | null) ?? null }
    },
    async myNotices() {
      const { data, error } = await client.rpc('app_my_notices')
      if (error) {
        if (isMissingFunction(error, 'app_my_notices')) return null
        throw toAppError(error)
      }
      return ((data ?? []) as Array<Record<string, unknown>>).map((r) => ({
        id: num(r.id as number),
        kind: r.kind as NoticeKind,
        targetType: (r.target_type as ReportTarget | null) ?? null,
        targetId: (r.target_id as string | null) ?? null,
        reason: (r.reason as string | null) ?? null,
        excerpt: (r.excerpt as string | null) ?? null,
        endsAt: (r.ends_at as string | null) ?? null,
        createdAt: String(r.created_at),
        read: Boolean(r.read),
        appealStatus: (r.appeal_status as MemberNotice['appealStatus']) ?? null,
        canAppeal: Boolean(r.can_appeal),
      }))
    },
    markNoticesRead: () => rpc<void>('app_mark_notices_read'),
    appeal: async (noticeId, body) => {
      await rpc<string>('app_appeal', { p_notice: noticeId, p_body: body.trim() })
    },
    modEnforce: async (memberId, level, reason, reportId, days, note) => {
      await rpc<number>('app_mod_enforce', {
        p_member: memberId,
        p_level: level,
        p_reason: reason,
        p_report: reportId ?? null,
        p_days: days ?? null,
        p_note: note?.trim() || null,
      })
    },
    modLift: (enforcementId, note) => rpc<void>('app_mod_lift', { p_enforcement: enforcementId, p_note: note?.trim() || null }),
    async modMemberRecord(memberId) {
      const r = await rpc<Record<string, unknown> | null>('app_mod_member_record', { p_member: memberId })
      if (!r) return null
      const list = (r.enforcements as Array<Record<string, unknown>> | null) ?? []
      return {
        username: String(r.username),
        displayName: String(r.display_name),
        standing: (r.standing as MemberRecord['standing']) ?? null,
        hiddenContent: num(r.hidden_content as number),
        enforcements: list.map((e) => ({
          id: num(e.id as number),
          level: e.level as EnforcementLevel,
          reason: String(e.reason),
          startsAt: String(e.starts_at),
          endsAt: (e.ends_at as string | null) ?? null,
          liftedAt: (e.lifted_at as string | null) ?? null,
          liftedVia: (e.lifted_via as string | null) ?? null,
          active: Boolean(e.active),
        })),
      }
    },
    async modAppeals(status) {
      const { data, error } = await client.rpc('app_mod_appeals', { p_status: status })
      if (error) {
        if (isMissingFunction(error, 'app_mod_appeals')) return null
        throw toAppError(error)
      }
      return ((data ?? []) as Array<Record<string, unknown>>).map((r) => ({
        id: String(r.id),
        memberId: String(r.member_id),
        memberUsername: (r.member_username as string | null) ?? null,
        kind: r.kind as NoticeKind,
        targetType: (r.target_type as ReportTarget | null) ?? null,
        targetId: (r.target_id as string | null) ?? null,
        reason: (r.reason as string | null) ?? null,
        excerpt: (r.excerpt as string | null) ?? null,
        body: String(r.body),
        status: r.status as ModAppeal['status'],
        createdAt: String(r.created_at),
        decidedAt: (r.decided_at as string | null) ?? null,
        decisionNote: (r.decision_note as string | null) ?? null,
        decidedOriginal: Boolean(r.decided_original),
      }))
    },
    modDecideAppeal: (appealId, reverse, note) => rpc<void>('app_mod_decide_appeal', { p_appeal: appealId, p_reverse: reverse, p_note: note?.trim() || null }),
    setPublicPreviews: (allowed) => rpc<void>('app_set_public_previews', { p_allowed: allowed, p_wording_version: allowed ? PREVIEW_WORDING_VERSION : null }),
    repost: (postId) => rpc<void>('app_repost', { p_post: postId }),
    unrepost: (postId) => rpc<void>('app_unrepost', { p_post: postId }),
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
