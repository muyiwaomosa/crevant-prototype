// @vitest-environment jsdom
import { AdvertisePage, PrivacyPage as MemberPrivacyPage } from './account'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import type { SupabaseClient } from '@supabase/supabase-js'
import { AuthProvider } from '../auth/AuthProvider'
import {
  AppApiError,
  displayNameProblem,
  messageFor,
  toAppError,
  toPost,
  usernameProblem,
  type AppApi,
  type CreatorSetup,
  type Inviter,
  type RegistrationSettings,
  type InvitationLink,
  type MyAdvertising,
  type AdvertisingRequest,
  type Features,
  type FounderSwitches,
  type FounderMemberRequest,
  type FeedbackEntry,
  type PhotoLinks,
  type PostMedia,
  type DeviceKind,
  type VideoLinks,
  type VideoPurpose,
  type FeedbackItem,
  type Comment,
  type MyDetails,
  type OwnProfile,
  type Post,
  type ProfileDetails,
  type MemberNotice,
  type MemberRecord,
  type ModAppeal,
  type Ad,
  type AdCategory,
  type AdExclusion,
  type AdsAdmin,
  type Advertiser,
  type Campaign,
  type CampaignReport,
  type ContributionInsights,
  type CreatorInsights,
  type FounderOverview,
  type FounderGoals,
  type MyProgress,
  type ProgressionQueue,
  type QualificationStatus,
} from './api'
import { MemberArea } from './MemberArea'
import { ModerationAppealsPage, ModerationQueuePage, ModerationReportPage } from './moderation'
import { NoticesPage } from './governance'
import { AdsManagePage, campaignStory } from './ads'
import { ControlCenterPage, attentionStory, contributionStory, founderStory, moneyStory, overviewCsv, retentionStory } from './insights'
import { FeedbackEntryPage, FeedbackInboxPage, FeedbackPage, featureFor } from './feedback'
import { fitWithin } from './photoPrep'
import { VideoTestPage } from './video'

// The browser's photo preparation (canvas) doesn't exist in jsdom: stand in for it.
vi.mock('./photoPrep', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./photoPrep')>()
  return {
    ...actual,
    preparePhoto: vi.fn(async (file: File) => {
      if (file.name.endsWith('.txt')) throw new (await import('./api')).AppApiError('photo_type')
      return { blob: new Blob(['jpeg'], { type: 'image/jpeg' }), preview: 'blob:preview', width: 1600, height: 1067 }
    }),
  }
})
// Video preparation needs WebCodecs and mediabunny, which jsdom lacks: the
// check and conversion stand in (a file named *.hevc can't be converted), the
// rest of the pipeline (upload, the server check, the poster) runs as written.
vi.mock('./videoPrep', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./videoPrep')>()
  const { AppApiError } = await import('./api')
  return {
    ...actual,
    prepareAndUpload: (api: AppApi, file: File, purpose: VideoPurpose, on: Parameters<typeof actual.prepareAndUpload>[3], signal?: AbortSignal) =>
      actual.prepareAndUpload(api, file, purpose, on, signal, {
        check: async (f: Blob) => {
          if ((f as File).name?.endsWith('.long.mp4')) throw new AppApiError('video_too_long')
          const hevc = (f as File).name?.endsWith('.hevc')
          return { container: 'mp4', codec: hevc ? 'hevc' : 'avc', audioCodec: 'aac', width: 1920, height: 1080, seconds: 20, bytes: f.size, bitsPerSecond: 2e6, canDecode: !hevc }
        },
        convert: async (f: Blob, c: import('./videoPrep').VideoCheck, onProgress: (p: number) => void) => {
          if (!c.canDecode) throw new AppApiError('video_hevc')
          onProgress(0.5)
          onProgress(1)
          return { file: f, check: c, converted: true, output: { width: 1280, height: 720, bytes: f.size }, dropped: [] }
        },
        poster: async () => new Blob(['jpeg'], { type: 'image/jpeg' }),
      }),
  }
})
import { clampOffset, coverScale, sourceRect } from './avatars'
import { AppNotFound, CatchUpPage, CliquePage, ComposePage, DiscoverPage, FeedPage, MemberPage, PostPage, ProfilePage, SavedPage } from './pages'
import { MySplitPage, RewardsReviewPage } from './split'

afterEach(cleanup)

// ---------------------------------------------------------------------------
// An in-memory stand-in for the database functions, with the same rules.

type Row = { id: string; username: string | null; displayName: string | null; createdAt: string }

function fakeApi(
  meId = 'me',
  opts: {
    profile?: Partial<Row> | null
    creators?: number
    /** Profile details (20261123000000): 'done' (default, setup finished), 'new' (setup not done yet) or 'absent' (a database without them). */
    details?: 'done' | 'new' | 'absent'
    /** Moderation (20261124000000): 'absent' for a database without it. */
    moderation?: 'present' | 'absent'
    moderator?: boolean
    /** Feedback (20261126000000): 'absent' for a database without it. */
    feedback?: 'present' | 'absent'
    founder?: boolean
    /** Photo posts (20261127000000): on only when a test says so. */
    photos?: boolean
    /** Video posts (20261213000000): on only when a test says so; tester: may run the device test. */
    video?: boolean
    tester?: boolean
  } = {},
) {
  const users = new Map<string, Row>()
  const add = (id: string, username: string | null, displayName: string | null) =>
    users.set(id, { id, username, displayName, createdAt: '2026-11-17T10:00:00Z' })
  if (opts.profile !== null) {
    const pr = opts.profile ?? {}
    add(meId, 'username' in pr ? (pr.username ?? null) : 'mia', 'displayName' in pr ? (pr.displayName ?? null) : 'Mia')
  }
  for (let i = 1; i <= (opts.creators ?? 11); i++) add(`c${i}`, `creator_${i}`, `Creator ${i}`)
  const posts: Array<{ id: string; author: string; body: string; at: number; deleted: boolean; hidden?: boolean; media?: PostMedia }> = []
  const follows = new Set<string>()
  const followedAt = new Map<string, number>()
  const views = new Set<string>()
  const marks: Array<{ ids: string[]; basis: string }> = []
  const clique = new Set<string>()
  // Relationships (20261201000000): mutes, follow sources, Support Intent.
  const mutes = new Set<string>()
  const followSources = new Map<string, string | undefined>()
  const supportIntents = new Map<string, string>()
  // Content (20261202000000): topics, edits, saves, reposts.
  const postTopics = new Map<string, string>()
  const edits = new Map<string, Array<{ previousBody: string; previousTopic: string | null; editedAt: string }>>()
  const saves = new Map<string, number>()
  const reposts = new Set<string>()
  const shares: Array<{ id: string; channel: string }> = []
  const searchNotes: Array<Record<string, unknown>> = []
  const previews = { allowed: false }
  const rewards = {
    points: null as null | {
      recognized: number
      redeemablePending: number
      redeemableApproved: number
      settled: number
      simulatedPointValueCents: number
      simulatedValueCents: number
    },
    history: [] as Array<{
      id: number
      action: string
      points: number
      redeemable: boolean
      status: string
      createdAt: string
      creator: { username: string; displayName: string } | null
      postId: string | null
    }>,
    earnings: null as null | Array<{ month: string; creatorCents: number }>,
    queue: [] as Array<{ awardId: number; referrer: string | null; referred: string | null; firstFollow: string | null; createdAt: string }>,
    reviewed: [] as Array<{ id: number; approve: boolean }>,
    revenue: [] as Array<{ month: string; kind: string; creatorId: string | null; netCents: number; note: string }>,
    closed: [] as string[],
    overview: null as null | {
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
    },
  }
  const likes = new Set<string>()
  const comments: Array<{ id: string; post: string; author: string; body: string; at: number; deleted: boolean }> = []
  let clock = Date.parse('2026-11-17T12:00:00Z')
  let n = 0
  const requests = new Map<string, { id: string; body: string }>()
  const key = (a: string, b: string) => `${a}>${b}`
  const summary = (id: string) => {
    const u = users.get(id)!
    return { id, username: u.username!, displayName: u.displayName! }
  }
  const complete = () => {
    const u = users.get(meId)
    if (!u?.username || !u.displayName) throw new AppApiError('profile_incomplete')
  }
  const toP = (p: (typeof posts)[number]): Post => ({
    id: p.id,
    author: summary(p.author),
    body: p.body,
    createdAt: new Date(p.at).toISOString(),
    likeCount: [...likes].filter((k) => k.endsWith(`>${p.id}`)).length,
    commentCount: comments.filter((c) => c.post === p.id && !c.deleted).length,
    likedByMe: likes.has(key(meId, p.id)),
    authorInMyClique: clique.has(key(meId, p.author)),
    isMine: p.author === meId,
    media: p.media ?? null,
  })
  const live = (id: string) => {
    const p = posts.find((x) => x.id === id && !x.deleted)
    if (!p) throw new AppApiError('not_found')
    return p
  }
  const failures: Partial<Record<keyof AppApi, AppApiError>> = {}
  // Profile details, with the database's rules (identity is descriptive only).
  const topicList = [
    { slug: 'food', label: 'Food & cooking' },
    { slug: 'money', label: 'Money & business' },
    { slug: 'tech', label: 'Tech' },
    { slug: 'music', label: 'Music' },
    { slug: 'travel', label: 'Travel' },
    { slug: 'books', label: 'Books & writing' },
  ]
  const detailsMode = opts.details ?? 'done'
  const details = new Map<string, MyDetails>()
  if (detailsMode === 'done') details.set(meId, { identity: null, bio: null, followReason: null, topics: [], onboarded: true })
  const savedDetails: ProfileDetails[] = []
  const detailsOf = (id: string): ProfileDetails => {
    const d = details.get(id)
    return d
      ? { identity: d.identity, bio: d.bio, followReason: d.followReason, topics: [...d.topics] }
      : { identity: null, bio: null, followReason: null, topics: [] }
  }
  // Reports and moderation, with the database's rules.
  type FakeReport = {
    id: string
    reporter: string
    targetType: 'post' | 'profile' | 'comment'
    targetId: string
    owner: string
    reason: string
    details: string | null
    snapshot: Record<string, string | null>
    status: 'open' | 'hidden' | 'dismissed' | 'restored'
    at: number
  }
  const reports: FakeReport[] = []
  const ads = {
    next: null as Ad | null,
    calls: [] as Array<{ surface: string; postId?: string }>,
    events: [] as Array<{ id: string; kind: string }>,
    categories: [
      { slug: 'software_apps', label: 'Software & apps', chosen: false, excluded: false },
      { slug: 'travel', label: 'Travel & experiences', chosen: false, excluded: false },
    ] as AdCategory[],
    prefCalls: [] as Array<{ category: string; state: string }>,
    cleared: 0,
    exclusions: [] as AdExclusion[],
    admin: null as AdsAdmin | null,
    savedAdvertisers: [] as Array<Partial<Advertiser>>,
    savedCampaigns: [] as Array<Partial<Campaign>>,
    reviews: [] as Array<{ id: string; approve: boolean }>,
    statuses: [] as Array<{ id: string; status: string }>,
    report: null as CampaignReport | null,
  }
  const intel = {
    creator: null as CreatorInsights | null,
    contribution: null as ContributionInsights | null,
    overview: null as FounderOverview | null,
    opens: [] as string[],
  }
  // Unified onboarding, privacy requests and switches (20261211000000, 20261212000000).
  const onb = {
    setup: { postingTopics: [] as string[], posts: 0, followers: 0, joinedThroughMyLink: 0 } as CreatorSetup | null,
    inviter: null as Inviter | null,
    topicCalls: [] as string[][],
    registration: {
      paused: true,
      totalCap: 200,
      dailyCap: 25,
      perReferrerDailyCap: 5,
      registeredTotal: 0,
      registeredToday: 0,
      externalAccessApproved: false,
      updatedAt: null,
    } as RegistrationSettings,
    registrationCalls: [] as Array<{ paused: boolean; reason: string }>,
    links: [] as InvitationLink[],
    advertising: { requests: [], campaigns: [] } as MyAdvertising,
    adRequests: [] as AdvertisingRequest[],
    report: null as CampaignReport | null,
    features: { ads: true, sharing: true, videoPosts: false, videoPlayback: true, photos: false, rewards: true } as Features,
    switches: [
      { feature: 'ads', enabled: true, updatedAt: '2026-12-01T00:00:00Z' },
      { feature: 'sharing', enabled: true, updatedAt: '2026-12-01T00:00:00Z' },
      { feature: 'video_posts', enabled: false, updatedAt: '2026-12-01T00:00:00Z' },
    ] as FounderSwitches['switches'],
    switchCalls: [] as Array<{ feature: string; enabled: boolean; reason: string }>,
    requests: [] as FounderMemberRequest[],
    resolved: [] as Array<{ id: number; completed: boolean; note: string }>,
    deleted: [] as Array<{ id: number; username: string }>,
  }
  const governance = {
    blocks: [] as Array<{ id: string; username: string; displayName: string; blockedAt: string }>,
    blockCalls: [] as Array<{ id: string; block: boolean }>,
    standing: null as null | { standing: 'restricted' | 'suspended'; endsAt: string | null },
    notices: [] as MemberNotice[],
    appealed: [] as Array<{ noticeId: number; body: string }>,
    enforced: [] as Array<{
      memberId: string
      level: string
      reason: string
      reportId: string | null
      days: number | null
      immediate?: boolean
      note?: string
    }>,
    lifted: [] as number[],
    record: null as MemberRecord | null,
    appeals: [] as ModAppeal[],
    decided: [] as Array<{ id: string; reverse: boolean }>,
  }
  const modActions: Array<{ action: string; report: string; note: string | null }> = []
  const moderationPresent = opts.moderation !== 'absent'
  const isModerator = { value: opts.moderator ?? false }
  const requireModerator = () => {
    complete()
    if (!isModerator.value) throw new AppApiError('not_moderator')
  }
  const hiddenProfiles = new Set<string>()
  // Photo posts, with the database's and the function's rules.
  const photo = {
    on: opts.photos ?? false,
    uploads: new Map<string, { width: number; height: number; used: boolean }>(),
    calls: [] as string[],
    linkCalls: [] as string[][],
    links: (id: string): PhotoLinks | null => ({ feed: `https://pics.test/${id}-feed.jpg`, full: `https://pics.test/${id}.jpg` }),
    checks: [] as number[],
  }
  // Video posts (20261213000000), with the database's and the server's rules.
  const video = {
    on: opts.video ?? false,
    playback: true,
    tester: opts.tester ?? false,
    uploads: new Map<string, { purpose: string; bytes: number; stored: boolean; used: boolean; poster: boolean }>(),
    calls: [] as string[],
    /** What the server check finds (a test can make it refuse). */
    verify: null as null | AppApiError,
    tests: [] as Array<{ device: DeviceKind; passed: boolean; notes: string | null; at: string }>,
    capBytes: null as number | null,
  }
  // Progression (20261217000000): off unless a test turns it on.
  const progression = {
    my: { enabled: false } as MyProgress,
    goals: { catalogue: { creator: ['original_posts'], consumer: ['shares'] }, versions: [], qualified: { creator: 0, consumer: 0 } } as FounderGoals,
    setCalls: [] as Array<{ audience: string; targets: Record<string, number>; reason: string }>,
    settleCalls: [] as string[],
    queue: { members: [], holds: [], decisions: [] } as ProgressionQueue,
    decisions: [] as Array<{ memberId: string; decision: string; reason: string }>,
    actions: [] as Array<Record<string, unknown>>,
  }
  // Feedback, with the database's rules.
  const feedbackPresent = opts.feedback !== 'absent'
  const isFounder = { value: opts.founder ?? false }
  const feedback: Array<FeedbackItem & { requestId: string; notes: FeedbackEntry['notes']; history: FeedbackEntry['history'] }> = []
  const feedbackCalls: Array<{ category: string; feature: string; body: string; requestId: string }> = []
  const requireFounder = () => {
    complete()
    if (!isFounder.value) throw new AppApiError('not_founder')
  }
  // Profile pictures: id -> link. Uploads and removals are recorded.
  const pictures = new Map<string, string>()
  const pictureCalls: string[] = []
  const storage = { unused: 0, bytes: 0, plans: new Map<string, string>() }
  const shared = (id: string) => detailsOf(id).topics.filter((t) => detailsOf(meId).topics.includes(t)).length
  // Pilot membership (20261122000000): active unless a test says otherwise.
  const access: { status: 'active' | 'none' | 'revoked' | 'expired' | 'attestation_required'; expiresAt: string | null } = { status: 'active', expiresAt: null }
  // Pages on (time, id), newest first, like app_feed_page (20261130000000).
  const newestFirst = (a: { at: number; id: string }, b: { at: number; id: string }) => b.at - a.at || (b.id < a.id ? -1 : b.id > a.id ? 1 : 0)
  const afterCursor = (p: { at: number; id: string }, c?: { createdAt: string; id: string }) =>
    !c || p.at < Date.parse(c.createdAt) || (p.at === Date.parse(c.createdAt) && p.id < c.id)
  const maybeFail = (name: keyof AppApi) => {
    if (failures[name]) throw failures[name]
  }

  const api: AppApi = {
    async accessState() {
      maybeFail('accessState')
      return { status: access.status, expiresAt: access.expiresAt }
    },
    async attestAdult() {
      maybeFail('attestAdult')
      if (access.status === 'attestation_required') access.status = 'active'
    },
    async myReferralCode() {
      maybeFail('myReferralCode')
      return '0123456789abcdef'
    },
    async ownProfile(): Promise<OwnProfile | null> {
      const u = users.get(meId)
      return u ? { id: u.id, createdAt: u.createdAt, username: u.username, displayName: u.displayName } : null
    },
    async saveProfile({ username, displayName }) {
      if ([...users.values()].some((u) => u.id !== meId && u.username === username)) throw new AppApiError('username_taken')
      const u = users.get(meId)!
      u.username = username
      u.displayName = displayName.trim()
    },
    async me() {
      const u = users.get(meId)!
      return {
        id: meId,
        username: u.username,
        displayName: u.displayName,
        complete: Boolean(u.username && u.displayName),
        followingCount: [...follows].filter((k) => k.startsWith(`${meId}>`)).length,
        followerCount: [...follows].filter((k) => k.endsWith(`>${meId}`)).length,
        cliqueCount: [...clique].filter((k) => k.startsWith(`${meId}>`)).length,
        postCount: posts.filter((p) => p.author === meId && !p.deleted).length,
      }
    },
    async feed(before, filter = 'all') {
      complete()
      return posts
        .filter(
          (p) =>
            !p.deleted &&
            !mutes.has(key(meId, p.author)) &&
            (filter === 'clique' ? clique.has(key(meId, p.author)) : p.author === meId || follows.has(key(meId, p.author))) &&
            afterCursor(p, before),
        )
        .sort(newestFirst)
        .slice(0, 20)
        .map(toP)
    },
    async member(username) {
      complete()
      const u = [...users.values()].find((x) => x.username === username && x.displayName)
      if (!u || governance.blocks.some((b) => b.id === u.id)) return null
      return {
        ...summary(u.id),
        postCount: posts.filter((p) => p.author === u.id && !p.deleted).length,
        followerCount: [...follows].filter((k) => k.endsWith(`>${u.id}`)).length,
        followingCount: [...follows].filter((k) => k.startsWith(`${u.id}>`)).length,
        followedByMe: follows.has(key(meId, u.id)),
        inMyClique: clique.has(key(meId, u.id)),
        isMe: u.id === meId,
        cliqueCount: [...clique].filter((k) => k.endsWith(`>${u.id}`)).length,
        activeSupporterCount: 0,
        iAmActiveSupporter: false,
        mutedByMe: mutes.has(key(meId, u.id)),
      }
    },
    async memberPosts(id, before) {
      complete()
      return posts
        .filter((p) => !p.deleted && p.author === id && afterCursor(p, before))
        .sort(newestFirst)
        .map(toP)
    },
    async post(id) {
      complete()
      const p = posts.find((x) => x.id === id && !x.deleted)
      return p ? toP(p) : null
    },
    async comments(postId): Promise<Comment[]> {
      complete()
      return comments
        .filter((c) => c.post === postId && !c.deleted)
        .map((c) => ({ id: c.id, postId, author: summary(c.author), body: c.body, createdAt: new Date(c.at).toISOString(), isMine: c.author === meId }))
    },
    async discover(query, topic) {
      complete()
      const q = (query ?? '').trim().toLowerCase()
      const withDetails = detailsMode !== 'absent'
      return [...users.values()]
        .filter((u) => u.id !== meId && u.username && u.displayName && (!q || u.username.includes(q) || u.displayName.toLowerCase().includes(q)))
        .filter((u) => !withDetails || !topic || detailsOf(u.id).topics.includes(topic))
        .map((u) => ({
          ...summary(u.id),
          postCount: posts.filter((p) => p.author === u.id && !p.deleted).length,
          followerCount: [...follows].filter((k) => k.endsWith(`>${u.id}`)).length,
          followedByMe: follows.has(key(meId, u.id)),
          inMyClique: clique.has(key(meId, u.id)),
          ...(withDetails ? { details: detailsOf(u.id), sharedTopics: shared(u.id) } : {}),
        }))
        .sort((a, b) => (b.sharedTopics ?? 0) - (a.sharedTopics ?? 0))
    },
    async topics() {
      if (detailsMode === 'absent') return null
      complete()
      return topicList
    },
    async myDetails() {
      if (detailsMode === 'absent') return null
      complete()
      return details.get(meId) ?? { identity: null, bio: null, followReason: null, topics: [], onboarded: false }
    },
    async saveDetails(d) {
      if (detailsMode === 'absent') throw new AppApiError('not_available')
      complete()
      maybeFail('saveDetails')
      if ((d.bio ?? '').trim().length > 160) throw new AppApiError('bio_too_long')
      if (d.topics.length > 5) throw new AppApiError('too_many_topics')
      savedDetails.push({ ...d, topics: [...d.topics] })
      details.set(meId, {
        identity: d.identity,
        bio: d.bio?.trim() || null,
        followReason: d.followReason?.trim() || null,
        topics: [...new Set(d.topics)],
        onboarded: true,
      })
    },
    async memberDetails(id) {
      if (detailsMode === 'absent') return null
      complete()
      return users.get(id)?.displayName ? detailsOf(id) : null
    },
    async photoStatus() {
      complete()
      return photo.on
    },
    async uploadPhoto(jpeg) {
      photo.calls.push('upload')
      maybeFail('uploadPhoto')
      if (!photo.on) throw new AppApiError('photos_unavailable')
      if (jpeg.type !== 'image/jpeg') throw new AppApiError('photo_not_usable')
      const id = `u${++n}`
      photo.uploads.set(id, { width: 1600, height: 1067, used: false })
      return { uploadId: id, width: 1600, height: 1067 }
    },
    async createPhotoPost(body, requestId, uploadId, description) {
      photo.calls.push(`publish:${uploadId}:${requestId}`)
      maybeFail('createPhotoPost')
      complete()
      const prior = requests.get(requestId)
      if (prior) return prior.id
      const u = photo.uploads.get(uploadId)
      if (!u || u.used) throw new AppApiError('upload_not_ready')
      if ([...body.trim()].length > 2000) throw new AppApiError('too_long')
      u.used = true
      const id = `p${String(++n).padStart(3, '0')}`
      posts.push({
        id,
        author: meId,
        body: body.trim(),
        at: (clock += 1000),
        deleted: false,
        media: { kind: 'photo', width: u.width, height: u.height, description: description?.trim() || null },
      })
      requests.set(requestId, { id, body: body.trim() })
      return id
    },
    async photoLinks(ids) {
      photo.linkCalls.push([...ids])
      const out: Record<string, PhotoLinks> = {}
      for (const id of ids) {
        const p = posts.find((x) => x.id === id && !x.deleted && x.media)
        const l = p ? photo.links(id) : null
        if (l) out[id] = l
      }
      return out
    },
    async requestPhotoCleanup() {
      photo.calls.push('cleanup')
    },
    async modReportPhoto(reportId) {
      requireModerator()
      const r = reports.find((x) => x.id === reportId)
      return r?.snapshot.media_full_path ? { feed: 'https://pics.test/reported-feed.jpg', full: 'https://pics.test/reported.jpg', description: null } : null
    },
    async mediaStatus() {
      requireModerator()
      return {
        photosEnabled: photo.on,
        capBytes: 1_000_000_000,
        usedBytes: 52_428_800,
        photoPosts: posts.filter((p) => p.media && !p.deleted).length,
        queued: 2,
        oldestQueuedAt: null,
        failing: 1,
        gaveUp: 0,
        held: 1,
        heldOpenOver30Days: 1,
        lastScheduledAt: new Date(Date.now() - 3 * 3600_000).toISOString(),
        lastRunAt: null,
        lastRunFailed: false,
        egressReviewGb: 10,
        egressPauseGb: 20,
        checks: [],
      }
    },
    async modMediaDrain() {
      requireModerator()
      photo.calls.push('mod-drain')
      return { deleted: 2, failed: 0 }
    },
    async runPhotoCheck(seed) {
      if (!isFounder.value) throw new AppApiError('not_founder')
      photo.checks.push(seed)
      return { ms: 600 + seed, ok: true }
    },
    async videoStatus() {
      complete()
      return {
        enabled: video.on,
        canTest: video.tester || isFounder.value,
        maxSeconds: 300,
        maxBytes: 115343360,
        maxSourceBytes: 2147483648,
        dailyLimit: 5,
        postedToday: posts.filter((x) => x.author === meId && x.media?.kind === 'video').length,
        memberCapBytes: 1073741824,
        memberUsedBytes: 0,
      }
    },
    async beginVideoUpload(bytes, durationMs, purpose) {
      video.calls.push(`begin:${purpose}`)
      maybeFail('beginVideoUpload')
      if (purpose === 'post' && !video.on) throw new AppApiError('videos_unavailable')
      if (purpose === 'device_test' && !(video.tester || isFounder.value)) throw new AppApiError('not_tester')
      if (bytes > 115343360) throw new AppApiError('video_too_large')
      if (durationMs > 300000) throw new AppApiError('video_too_long')
      const id = `v${++n}`
      video.uploads.set(id, { purpose, bytes, stored: false, used: false, poster: false })
      return { uploadId: id, bucket: 'post-videos', path: `${meId}/${id}.mp4`, token: 'signed-token', chunkBytes: 6 * 1024 * 1024 }
    },
    async uploadVideoFile(ticket, _file, onProgress) {
      video.calls.push(`upload:${ticket.uploadId}`)
      maybeFail('uploadVideoFile')
      onProgress(0.5)
      onProgress(1)
    },
    async verifyVideo(uploadId) {
      video.calls.push(`verify:${uploadId}`)
      const u = video.uploads.get(uploadId)
      if (!u) throw new AppApiError('not_found')
      if (video.verify) throw video.verify
      u.stored = true
      return { width: 1280, height: 720, durationMs: 20000, bytes: u.bytes }
    },
    async uploadVideoPoster(uploadId) {
      video.calls.push(`poster:${uploadId}`)
      const u = video.uploads.get(uploadId)
      if (u) u.poster = true
    },
    async createVideoPost(body, requestId, uploadId) {
      video.calls.push(`publish:${uploadId}:${requestId}`)
      maybeFail('createVideoPost')
      complete()
      const prior = requests.get(requestId)
      if (prior) return prior.id
      if (!video.on) throw new AppApiError('videos_unavailable')
      const u = video.uploads.get(uploadId)
      if (!u || !u.stored || u.used || u.purpose !== 'post') throw new AppApiError('upload_not_ready')
      u.used = true
      const id = `p${String(++n).padStart(3, '0')}`
      posts.push({
        id,
        author: meId,
        body: body.trim(),
        at: (clock += 1000),
        deleted: false,
        media: { kind: 'video', width: 1280, height: 720, description: null, durationMs: 20000, poster: u.poster },
      })
      requests.set(requestId, { id, body: body.trim() })
      return id
    },
    async videoLinks(ids) {
      video.calls.push(`links:${ids.join(',')}`)
      const out: Record<string, VideoLinks> = {}
      // Playback has its own switch: pausing uploads never hides published videos.
      if (!video.playback) return out
      for (const id of ids) {
        const p = posts.find((x) => x.id === id && !x.deleted && x.media?.kind === 'video')
        if (p) out[id] = { src: `https://videos.test/${id}.mp4`, poster: `https://videos.test/${id}-poster.jpg` }
      }
      return out
    },
    async videoTestLink(uploadId) {
      const u = video.uploads.get(uploadId)
      if (!u || u.purpose !== 'device_test' || !u.stored) throw new AppApiError('not_found')
      return { src: `https://videos.test/${uploadId}.mp4`, poster: null }
    },
    async modReportVideo(reportId) {
      requireModerator()
      const r = reports.find((x) => x.id === reportId)
      return r?.snapshot.media_kind === 'video' ? { src: 'https://videos.test/reported.mp4', poster: null } : null
    },
    async founderVideoStatus() {
      requireFounder()
      const latest: Partial<Record<DeviceKind, { device: DeviceKind; passed: boolean; notes: string | null; at: string }>> = {}
      for (const t of video.tests) latest[t.device] = t
      const ready = latest.iphone_safari?.passed === true && latest.android_chrome?.passed === true && video.capBytes !== null
      return {
        enabled: video.on,
        playbackEnabled: video.playback,
        delivery7d: { links: 3, videoBytes: 30000000 },
        delivery30d: { links: 9, videoBytes: 90000000 },
        ready,
        capBytes: video.capBytes,
        usedBytes: 0,
        videoPosts: 0,
        testUploads24h: 0,
        latest,
        recent: [...video.tests].reverse(),
      }
    },
    async founderVideoEmergencyStop(reason) {
      requireFounder()
      if (reason.trim().length < 3) throw new AppApiError('reason_required')
      video.on = false
      video.playback = false
    },
    async founderRecordDeviceTest(device, passed, notes) {
      requireFounder()
      video.tests.push({ device, passed, notes: notes.trim() || null, at: new Date((clock += 1000)).toISOString() })
    },
    async founderSetVideoCap(gb) {
      requireFounder()
      if (!Number.isInteger(gb) || gb < 1 || gb > 1000) throw new AppApiError('invalid_request')
      video.capBytes = gb * 1073741824
    },
    async feedbackAccess() {
      if (!feedbackPresent) return { available: false, founder: false }
      complete()
      return { available: true, founder: isFounder.value }
    },
    async sendFeedback(input, requestId) {
      feedbackCalls.push({ ...input, requestId })
      maybeFail('sendFeedback')
      if (!feedbackPresent) throw new AppApiError('not_available')
      complete()
      const body = input.body.trim()
      if (!['problem', 'improvement', 'praise'].includes(input.category)) throw new AppApiError('invalid_category')
      if ([...body].length < 10) throw new AppApiError('feedback_too_short')
      if ([...body].length > 1000) throw new AppApiError('too_long')
      const same = feedback.find((f) => f.requestId === requestId)
      if (same) return same.id
      if (feedback.filter((f) => f.submitterUsername === users.get(meId)!.username).length >= 3) throw new AppApiError('rate_limited')
      clock += 1000
      const at = new Date(clock).toISOString()
      const u = users.get(meId)!
      const id = `fb${++n}`
      feedback.unshift({
        id,
        category: input.category,
        feature: input.feature,
        body,
        status: 'new',
        cohort: 'tester',
        submitterUsername: u.username,
        submitterName: u.displayName,
        noteCount: 0,
        createdAt: at,
        updatedAt: at,
        requestId,
        notes: [],
        history: [],
      })
      return id
    },
    async feedbackInbox(filters) {
      requireFounder()
      return feedback
        .filter(
          (f) =>
            (!filters.category || f.category === filters.category) &&
            (!filters.status || f.status === filters.status) &&
            (!filters.cohort || f.cohort === filters.cohort),
        )
        .map(({ requestId: _r, notes, history: _h, ...f }) => ({ ...f, noteCount: notes.length }))
    },
    async feedbackEntry(id) {
      requireFounder()
      const f = feedback.find((x) => x.id === id)
      if (!f) return null
      const { requestId: _r, noteCount: _n, ...rest } = f
      return { ...rest, notes: [...f.notes], history: [...f.history] }
    },
    async setFeedbackStatus(id, status) {
      requireFounder()
      const f = feedback.find((x) => x.id === id)
      if (!f) throw new AppApiError('not_found')
      if (f.status === status) return
      f.history.push({ action: 'status_changed', from: f.status, to: status, by: 'Mia', at: new Date(clock).toISOString() })
      f.status = status
    },
    async addFeedbackNote(id, note) {
      requireFounder()
      const f = feedback.find((x) => x.id === id)
      if (!f) throw new AppApiError('not_found')
      if (!note.trim()) throw new AppApiError('note_required')
      f.notes.push({ body: note.trim(), author: 'Mia', createdAt: new Date(clock).toISOString() })
      f.history.push({ action: 'note_added', from: null, to: null, by: 'Mia', at: new Date(clock).toISOString() })
    },
    async moderationAccess() {
      if (!moderationPresent) return { available: false, moderator: false }
      complete()
      return { available: true, moderator: isModerator.value }
    },
    async report(targetType, targetId, reason, details) {
      if (!moderationPresent) throw new AppApiError('not_available')
      complete()
      maybeFail('report')
      let owner: string
      let snapshot: Record<string, string | null>
      if (targetType === 'post') {
        const p = posts.find((x) => x.id === targetId && !x.deleted)
        if (!p) throw new AppApiError('not_found')
        owner = p.author
        snapshot = { body: p.body, author_username: users.get(p.author)!.username, author_display_name: users.get(p.author)!.displayName }
      } else if (targetType === 'comment') {
        const c = comments.find((x) => x.id === targetId && !x.deleted)
        if (!c) throw new AppApiError('not_found')
        owner = c.author
        snapshot = { body: c.body, author_username: users.get(c.author)!.username, author_display_name: users.get(c.author)!.displayName }
      } else {
        const u = users.get(targetId)
        if (!u?.displayName) throw new AppApiError('not_found')
        owner = targetId
        snapshot = { username: u.username, display_name: u.displayName, bio: detailsOf(targetId).bio, follow_reason: detailsOf(targetId).followReason }
      }
      if (owner === meId) throw new AppApiError('cannot_report_self')
      if (reports.some((r) => r.reporter === meId && r.targetType === targetType && r.targetId === targetId && r.status === 'open'))
        throw new AppApiError('already_reported')
      reports.push({
        id: `r${reports.length + 1}`,
        reporter: meId,
        targetType,
        targetId,
        owner,
        reason,
        details: details?.trim() || null,
        snapshot,
        status: 'open',
        at: (clock += 1000),
      })
    },
    async modQueue(status) {
      requireModerator()
      const priority = (r: FakeReport) => (r.reason === 'violence' || r.reason === 'self_harm' ? 1 : 0)
      return reports
        .filter((r) => (status === 'open' ? r.status === 'open' : r.status !== 'open'))
        .sort((a, b) => priority(b) - priority(a) || a.at - b.at)
        .map((r) => ({
          id: r.id,
          targetType: r.targetType,
          targetId: r.targetId,
          reason: r.reason as never,
          priority: priority(r) === 1,
          hasDetails: r.details !== null,
          excerpt: r.snapshot.body ?? r.snapshot.bio ?? r.snapshot.display_name ?? '',
          targetUsername: r.snapshot.author_username ?? r.snapshot.username ?? null,
          openReportsForTarget: reports.filter((o) => o.targetId === r.targetId && o.status === 'open').length,
          status: r.status,
          createdAt: new Date(r.at).toISOString(),
          resolvedAt: r.status === 'open' ? null : new Date(r.at).toISOString(),
        }))
    },
    async modReport(id) {
      requireModerator()
      const r = reports.find((x) => x.id === id)
      if (!r) return null
      const p = r.targetType === 'post' ? posts.find((x) => x.id === r.targetId) : undefined
      const targetState =
        r.targetType === 'post'
          ? !p
            ? 'gone'
            : p.hidden
              ? 'hidden'
              : p.deleted
                ? 'deleted_by_author'
                : 'live'
          : hiddenProfiles.has(r.targetId)
            ? 'hidden'
            : 'live'
      return {
        id: r.id,
        targetType: r.targetType,
        targetId: r.targetId,
        reason: r.reason as never,
        priority: r.reason === 'violence' || r.reason === 'self_harm',
        details: r.details,
        snapshot: r.snapshot,
        status: r.status,
        createdAt: new Date(r.at).toISOString(),
        resolvedAt: null,
        dataPurged: false,
        targetState,
        currentBody: p && !p.deleted ? p.body : null,
        openReportsForTarget: reports.filter((o) => o.targetId === r.targetId && o.status === 'open').length,
        targetOwnerId: r.owner,
      }
    },
    async modHide(id, note) {
      requireModerator()
      const r = reports.find((x) => x.id === id)
      if (!r) throw new AppApiError('not_found')
      if (r.targetType === 'post') {
        const p = posts.find((x) => x.id === r.targetId && !x.deleted)
        if (!p) throw new AppApiError('not_live')
        p.deleted = true
        p.hidden = true
      } else {
        if (hiddenProfiles.has(r.targetId)) throw new AppApiError('not_live')
        hiddenProfiles.add(r.targetId)
      }
      for (const o of reports) if (o.targetId === r.targetId && o.status === 'open') o.status = 'hidden'
      modActions.push({ action: 'hide', report: id, note: note?.trim() || null })
    },
    async modRestore(id, note) {
      requireModerator()
      const r = reports.find((x) => x.id === id)!
      if (r.targetType === 'post') {
        const p = posts.find((x) => x.id === r.targetId && x.hidden)
        if (!p) throw new AppApiError('not_hidden')
        p.deleted = false
        p.hidden = false
      } else if (!hiddenProfiles.delete(r.targetId)) throw new AppApiError('not_hidden')
      for (const o of reports) if (o.targetId === r.targetId && (o.status === 'open' || o.status === 'hidden')) o.status = 'restored'
      modActions.push({ action: 'restore', report: id, note: note?.trim() || null })
    },
    async modDismiss(id, note) {
      requireModerator()
      const r = reports.find((x) => x.id === id)!
      if (r.status !== 'open') throw new AppApiError('not_open')
      for (const o of reports) if (o.targetId === r.targetId && o.status === 'open') o.status = 'dismissed'
      modActions.push({ action: 'dismiss', report: id, note: note?.trim() || null })
    },
    async avatarLinks(ids) {
      maybeFail('avatarLinks')
      return Object.fromEntries(
        ids.filter((id) => pictures.has(id) && users.get(id)?.displayName).map((id) => [id, { url: pictures.get(id)!, updatedAt: null }]),
      )
    },
    async uploadAvatar(jpeg) {
      complete()
      maybeFail('uploadAvatar')
      pictureCalls.push(`upload:${jpeg.type}`)
      pictures.set(meId, `https://pics.test/${meId}-${pictureCalls.length}.jpg`)
    },
    async removeAvatar() {
      complete()
      maybeFail('removeAvatar')
      pictureCalls.push('remove')
      pictures.delete(meId)
    },
    async modStoragePreview() {
      requireModerator()
      const planId = `plan-${storage.plans.size + 1}`
      const phrase = `DELETE ${storage.unused} FILES`
      storage.plans.set(planId, phrase)
      return { planId, fileCount: storage.unused, totalBytes: storage.bytes, confirmPhrase: phrase, expiresAt: '2026-11-20T00:15:00Z' }
    },
    async modStorageCleanup(planId, confirm) {
      requireModerator()
      if (storage.plans.get(planId) !== confirm) throw new AppApiError('confirmation_mismatch')
      storage.plans.delete(planId)
      const deleted = storage.unused
      storage.unused = 0
      return { deleted, confirmed: deleted }
    },
    async suggested() {
      if (detailsMode === 'absent') return []
      complete()
      return (await api.discover())
        .filter((m) => !m.followedByMe)
        .sort((a, b) => (b.sharedTopics ?? 0) - (a.sharedTopics ?? 0))
        .slice(0, 10)
    },
    async following() {
      complete()
      return [...follows]
        .filter((k) => k.startsWith(`${meId}>`))
        .map((k) => k.split('>')[1])
        .map((id) => ({
          ...summary(id),
          followedAt: '2026-11-17T11:00:00Z',
          inMyClique: clique.has(key(meId, id)),
          cliqueAddedAt: clique.has(key(meId, id)) ? '2026-11-17T11:30:00Z' : null,
        }))
    },
    async createPost(body, requestId) {
      complete()
      const b = body.trim()
      // Like the server: a repeated request id returns the post it already made.
      const seen = requestId ? requests.get(`post:${requestId}`) : undefined
      if (seen) {
        if (seen.body !== b) throw new AppApiError('request_reused')
        return seen.id
      }
      if (!b) throw new AppApiError('empty')
      const id = `p${++n}`
      posts.push({ id, author: meId, body: b, at: (clock += 1000), deleted: false })
      if (requestId) requests.set(`post:${requestId}`, { id, body: b })
      return id
    },
    async deletePost(id) {
      const p = posts.find((x) => x.id === id && !x.deleted && x.author === meId)
      if (!p) throw new AppApiError('not_found')
      p.deleted = true
    },
    async follow(id, source) {
      if (id === meId) throw new AppApiError('cannot_follow_self')
      if (!follows.has(key(meId, id))) {
        followedAt.set(key(meId, id), (clock += 1))
        followSources.set(key(meId, id), source)
        mutes.delete(key(meId, id))
      }
      follows.add(key(meId, id))
    },
    async mute(id) {
      maybeFail('mute')
      if (!follows.has(key(meId, id))) throw new AppApiError('not_following')
      mutes.add(key(meId, id))
    },
    async unmute(id) {
      mutes.delete(key(meId, id))
    },
    // Like app_home_priority: unseen Clique posts of the last 7 days, newest first, at most 10.
    async homePriority() {
      complete()
      return posts
        .filter(
          (p) =>
            !p.deleted &&
            clique.has(key(meId, p.author)) &&
            !mutes.has(key(meId, p.author)) &&
            !views.has(key(meId, p.id)) &&
            p.at >= (followedAt.get(key(meId, p.author)) ?? 0) &&
            p.at >= clock - 7 * 86400000,
        )
        .sort(newestFirst)
        .slice(0, 10)
        .map(toP)
    },
    async relationships() {
      complete()
      return (await api.following()).map((f) => ({
        ...f,
        activeSupporter: false,
        muted: mutes.has(key(meId, f.id)),
        supportChoice: (supportIntents.get(key(meId, f.id)) ?? null) as 'usd_3' | 'usd_5' | 'usd_10' | 'not_sure' | null,
        latestPostAt: null,
      }))
    },
    async audience() {
      complete()
      const mine = [...supportIntents].filter(([k]) => k.endsWith(`>${meId}`))
      return {
        followerCount: [...follows].filter((k) => k.endsWith(`>${meId}`)).length,
        cliqueCount: [...clique].filter((k) => k.endsWith(`>${meId}`)).length,
        activeSupporterCount: 0,
        newFollowers7d: [...follows].filter((k) => k.endsWith(`>${meId}`)).length,
        newFollowersPrev7d: 0,
        followSources: {},
        supportIntentCount: mine.length,
        supportByChoice: Object.fromEntries(mine.map(([, c]) => [c, mine.filter(([, x]) => x === c).length])),
        posts28d: posts.filter((p) => p.author === meId && !p.deleted).length,
      }
    },
    async supportIntent(id) {
      complete()
      return (supportIntents.get(key(meId, id)) ?? null) as 'usd_3' | 'usd_5' | 'usd_10' | 'not_sure' | null
    },
    async postMeta(ids) {
      complete()
      const out: Record<
        string,
        { topic: string | null; topicLabel: string | null; editedAt: string | null; savedByMe: boolean; repostCount: number; repostedByMe: boolean }
      > = {}
      for (const id of ids) {
        const p = posts.find((x) => x.id === id && !x.deleted)
        if (!p) continue
        const t = postTopics.get(id) ?? null
        out[id] = {
          topic: t,
          topicLabel: t ? (topicList.find((x) => x.slug === t)?.label ?? t) : null,
          editedAt: edits.get(id)?.[0]?.editedAt ?? null,
          savedByMe: saves.has(key(meId, id)),
          repostCount: [...reposts].filter((k) => k.endsWith(`>${id}`)).length,
          repostedByMe: reposts.has(key(meId, id)),
        }
      }
      return out
    },
    async setPostTopic(id, topic) {
      const p = posts.find((x) => x.id === id && !x.deleted && x.author === meId)
      if (!p || postTopics.has(id)) throw new AppApiError('not_found')
      if (!topicList.some((t) => t.slug === topic)) throw new AppApiError('unknown_topic')
      postTopics.set(id, topic)
    },
    async editPost(id, body, topic) {
      maybeFail('editPost')
      const p = posts.find((x) => x.id === id && !x.deleted && x.author === meId)
      if (!p) throw new AppApiError('not_found')
      const b = body.trim()
      if (!b && !p.media) throw new AppApiError('empty')
      if (b === p.body && (topic ?? null) === (postTopics.get(id) ?? null)) return
      edits.set(id, [
        { previousBody: p.body, previousTopic: postTopics.get(id) ?? null, editedAt: new Date((clock += 1000)).toISOString() },
        ...(edits.get(id) ?? []),
      ])
      p.body = b
      if (topic) postTopics.set(id, topic)
      else postTopics.delete(id)
    },
    async postEdits(id) {
      return edits.get(id) ?? []
    },
    async save(id) {
      maybeFail('save')
      live(id)
      if (!saves.has(key(meId, id))) saves.set(key(meId, id), (clock += 1000))
    },
    async unsave(id) {
      saves.delete(key(meId, id))
    },
    async savedPosts(before) {
      complete()
      return [...saves]
        .filter(([k]) => k.startsWith(`${meId}>`))
        .map(([k, at]) => ({ p: posts.find((x) => x.id === k.split('>')[1] && !x.deleted), at }))
        .filter((x): x is { p: (typeof posts)[number]; at: number } => !!x.p)
        .sort((a, b) => b.at - a.at)
        .filter((x) => !before || x.at < Date.parse(before.createdAt))
        .map((x) => ({ ...toP(x.p), activityAt: new Date(x.at).toISOString() }))
    },
    // Discovery (20261203000000), with the database's rules.
    async discoverPosts(topic) {
      complete()
      const mineT = detailsOf(meId).topics
      const perAuthor = new Map<string, number>()
      return posts
        .filter((p) => !p.deleted && p.author !== meId && !follows.has(key(meId, p.author)) && !mutes.has(key(meId, p.author)))
        .filter((p) => {
          const t = postTopics.get(p.id)
          return !!t && (topic ? t === topic : mineT.length === 0 || mineT.includes(t))
        })
        .sort(newestFirst)
        .filter((p) => {
          const n = (perAuthor.get(p.author) ?? 0) + 1
          perAuthor.set(p.author, n)
          return n <= 2
        })
        .map((p) => {
          const label = topicList.find((t) => t.slug === postTopics.get(p.id))?.label ?? ''
          return { ...toP(p), reason: topic ? `In ${label}, the topic you chose` : `Because you're interested in ${label}` }
        })
    },
    async searchPosts(q) {
      complete()
      if (q.trim().length < 2) throw new AppApiError('invalid_query')
      const w = q.trim().toLowerCase()
      return posts
        .filter((p) => !p.deleted && !mutes.has(key(meId, p.author)))
        .filter(
          (p) =>
            p.body.toLowerCase().includes(w) ||
            (topicList
              .find((t) => t.slug === postTopics.get(p.id))
              ?.label.toLowerCase()
              .includes(w) ??
              false),
        )
        .sort(newestFirst)
        .map(toP)
    },
    async recordShare(id, channel) {
      shares.push({ id, channel })
    },
    async noteSearch(surface, hadResults, topic) {
      searchNotes.push({ surface, hadResults, topic: topic ?? null })
    },
    async noteSearchSelection(surface, topic) {
      searchNotes.push({ surface, selected: true, topic: topic ?? null })
    },
    async creatorInsights() {
      return intel.creator
    },
    async myContributionInsights() {
      return intel.contribution
    },
    async founderOverview() {
      if (!isFounder.value) throw new AppApiError('not_founder')
      return intel.overview
    },
    async noteOpen(postId) {
      intel.opens.push(postId)
    },
    async myCreatorSetup() {
      complete()
      return onb.setup
    },
    async setCreatorTopics(t) {
      complete()
      if (t.length > 3) throw new AppApiError('too_many_posting_topics')
      onb.topicCalls.push(t)
      if (onb.setup) onb.setup = { ...onb.setup, postingTopics: [...new Set(t)] }
      return [...new Set(t)]
    },
    async memberCreatorTopics() {
      return []
    },
    async myInviter() {
      complete()
      return onb.inviter
    },
    async founderRegistration() {
      requireFounder()
      return onb.registration
    },
    async founderSetRegistration(x, reason) {
      requireFounder()
      onb.registrationCalls.push({ paused: x.paused, reason })
      onb.registration = { ...onb.registration, ...x }
    },
    async founderCreateInvitationLink(maxUses, days, creatorUsername) {
      requireFounder()
      const code = `${onb.links.length + 1}`.padStart(16, 'a')
      onb.links.unshift({
        code,
        creatorUsername: creatorUsername?.trim() || null,
        cohort: 'fan',
        uses: 0,
        maxUses,
        expiresAt: new Date(Date.now() + days * 86400000).toISOString(),
        revokedAt: null,
        createdAt: new Date().toISOString(),
        registered: 0,
      })
      return code
    },
    async founderInvitationLinks() {
      requireFounder()
      return onb.links
    },
    async founderRevokeInvitationLink(code) {
      requireFounder()
      onb.links = onb.links.map((l) => (l.code === code ? { ...l, revokedAt: new Date().toISOString() } : l))
    },
    async requestAdvertising(r) {
      complete()
      if (onb.advertising.requests.some((x) => x.status === 'pending')) throw new AppApiError('request_pending')
      onb.adRequests.push(r)
      const id = `req-${onb.adRequests.length}`
      onb.advertising = {
        ...onb.advertising,
        requests: [
          { id, name: r.name, status: 'pending', reviewNote: null, objective: r.objective, requestedAt: new Date().toISOString() },
          ...onb.advertising.requests,
        ],
      }
      return id
    },
    async myAdvertising() {
      complete()
      return onb.advertising
    },
    async myCampaignReport() {
      if (!onb.report) throw new AppApiError('not_found')
      return onb.report
    },
    async features() {
      return onb.features
    },
    async myProgress() {
      return progression.my
    },
    async founderGoals() {
      requireFounder()
      return progression.goals
    },
    async founderSetGoals(audience, targets, reason) {
      requireFounder()
      if (reason.trim().length < 3) throw new AppApiError('reason_required')
      if (progression.goals.catalogue[audience].some((m) => !Number.isInteger(targets[m]) || targets[m] < 1)) throw new AppApiError('every_goal_needs_a_value')
      progression.setCalls.push({ audience, targets, reason })
      const id = progression.goals.versions.length + 1
      progression.goals = { ...progression.goals, versions: [{ id, audience, targets, reason, setAt: '2026-11-26T10:00:00Z' }, ...progression.goals.versions] }
      return id
    },
    async founderProgressionQueue() {
      requireFounder()
      return progression.queue
    },
    async founderProgressionReport() {
      requireFounder()
      return {
        definitions: { creator_denominator: 'Members who published', consumer_denominator: 'Active members' },
        creator: { denominator: 4, milestones: { original_posts: 1 } },
        consumer: { denominator: 10, milestones: { shares: 2 } },
        statuses: { creator: { under_review: 1 }, consumer: {} },
        referrals: { qualifiedReferrals: 7, membersWithTarget: 1, theoreticalMaxQualifyingConsumers: 1, note: 'Each referral counts once.' },
        integrity: { open_holds: 0, account_holds: 0, revocations: 0, restorations: 0, revenue_corrections: 0, allocation_corrections: 0 },
        money: { heldCreatorCents: 0, openPoolCents: 0 },
      }
    },
    async founderDecideQualification(d) {
      requireFounder()
      if (d.reason.trim().length < 3) throw new AppApiError('reason_required')
      progression.decisions.push({ memberId: d.memberId, decision: d.decision, reason: d.reason })
      progression.queue = {
        ...progression.queue,
        members: progression.queue.members.map((m) => (m.memberId === d.memberId && m.audience === d.audience ? { ...m, status: d.decision === 'revoked' ? 'revoked' : 'qualified' } : m)),
      }
    },
    async founderPlaceHold(h) {
      requireFounder()
      if (h.scope === 'account' && (h.justification ?? '').trim().length < 10) throw new AppApiError('justification_required')
      progression.actions.push({ action: 'hold', ...h })
      return 1
    },
    async founderReleaseHold() {
      requireFounder()
    },
    async founderCorrectRevenue(c) {
      requireFounder()
      progression.actions.push({ action: 'correct_revenue', ...c })
      return 1
    },
    async founderCorrectAllocation(c) {
      requireFounder()
      progression.actions.push({ action: 'correct_allocation', ...c })
      return 1
    },
    async founderSettleEligible(reason) {
      requireFounder()
      if (reason.trim().length < 3) throw new AppApiError('reason_required')
      progression.settleCalls.push(reason)
      return { creatorEntries: 1, consumerAllocations: 0 }
    },
    async founderSwitches() {
      requireFounder()
      return {
        switches: onb.switches,
        registrationPaused: onb.registration.paused,
        externalAccessApproved: false,
        rewardsPaused: false,
        photosEnabled: false,
        recent: onb.switchCalls.map((c) => ({ feature: c.feature, enabled: c.enabled, reason: c.reason, changedAt: new Date().toISOString() })).reverse(),
      }
    },
    async founderSetSwitch(feature, enabled, reason) {
      requireFounder()
      if (reason.trim().length < 3) throw new AppApiError('reason_required')
      if (feature === 'video_posts' && enabled) {
        const last = (d: DeviceKind) => [...video.tests].reverse().find((t) => t.device === d)?.passed === true
        if (!last('iphone_safari') || !last('android_chrome') || video.capBytes === null) throw new AppApiError('video_not_ready')
        video.on = true
      }
      if (feature === 'video_posts' && !enabled) video.on = false
      onb.switchCalls.push({ feature, enabled, reason })
      onb.switches = onb.switches.map((x) => (x.feature === feature ? { ...x, enabled } : x))
    },
    async submitMemberRequest(kind, details) {
      complete()
      if (onb.requests.some((r) => r.kind === kind && r.status === 'open' && r.username === (users.get(meId)?.username ?? null)))
        throw new AppApiError('request_open')
      const id = onb.requests.length + 1
      onb.requests.unshift({
        id,
        kind,
        status: 'open',
        createdAt: new Date().toISOString(),
        resolvedAt: null,
        details: details.trim() || null,
        username: users.get(meId)?.username ?? null,
        displayName: users.get(meId)?.displayName ?? null,
      })
      return id
    },
    async myMemberRequests() {
      complete()
      return onb.requests
        .filter((r) => r.username === (users.get(meId)?.username ?? null))
        .map(({ id, kind, status, createdAt, resolvedAt }) => ({ id, kind, status, createdAt, resolvedAt }))
    },
    async withdrawMemberRequest(id) {
      onb.requests = onb.requests.map((r) => (r.id === id && r.status === 'open' ? { ...r, status: 'withdrawn', resolvedAt: new Date().toISOString() } : r))
    },
    async founderMemberRequests() {
      requireFounder()
      return onb.requests
    },
    async founderResolveMemberRequest(id, completed, note) {
      requireFounder()
      if (!note.trim()) throw new AppApiError('note_required')
      onb.resolved.push({ id, completed, note })
      onb.requests = onb.requests.map((r) => (r.id === id ? { ...r, status: completed ? 'completed' : 'declined', resolvedAt: new Date().toISOString() } : r))
    },
    async founderDeleteMember(id, username) {
      requireFounder()
      const r = onb.requests.find((x) => x.id === id)
      if (!r || r.kind !== 'deletion' || r.status !== 'open') throw new AppApiError('not_found')
      if (r.username !== username.trim().toLowerCase()) throw new AppApiError('confirmation_mismatch')
      onb.deleted.push({ id, username })
      onb.requests = onb.requests.map((x) => (x.id === id ? { ...x, status: 'completed', details: null, username: null, displayName: null } : x))
      return { postsRemoved: 1, awardsForfeited: 2 }
    },
    async adFor(surface, postId) {
      ads.calls.push({ surface, postId })
      const a = ads.next
      return a && a.placement === surface ? a : null
    },
    async adEvent(id, kind) {
      ads.events.push({ id, kind })
    },
    async adCategories() {
      return ads.categories
    },
    async setAdPreference(category, state) {
      ads.prefCalls.push({ category, state })
      ads.categories = ads.categories.map((c) => (c.slug === category ? { ...c, chosen: state === 'chosen', excluded: state === 'excluded' } : c))
    },
    async clearAdPreferences() {
      ads.cleared += 1
      ads.categories = ads.categories.map((c) => ({ ...c, chosen: false, excluded: false }))
      ads.exclusions = []
    },
    async myAdExclusions() {
      return ads.exclusions
    },
    async removeAdExclusion(kind, target) {
      ads.exclusions = ads.exclusions.filter((x) => !(x.kind === kind && x.target === target))
    },
    async founderAds() {
      if (!isFounder.value) throw new AppApiError('not_founder')
      return ads.admin
    },
    async founderSaveAdvertiser(a) {
      ads.savedAdvertisers.push(a)
      return 'adv-new'
    },
    async founderReviewAdvertiser(id, approve) {
      ads.reviews.push({ id, approve })
      if (ads.admin)
        ads.admin = { ...ads.admin, advertisers: ads.admin.advertisers.map((x) => (x.id === id ? { ...x, status: approve ? 'approved' : 'declined' } : x)) }
    },
    async founderSaveCampaign(c) {
      ads.savedCampaigns.push(c)
      return 'camp-new'
    },
    async founderSetCampaignStatus(id, status) {
      ads.statuses.push({ id, status })
      if (ads.admin) ads.admin = { ...ads.admin, campaigns: ads.admin.campaigns.map((x) => (x.id === id ? { ...x, status } : x)) }
    },
    async founderCampaignReport() {
      return ads.report!
    },
    async founderRecordConversions() {},
    async founderAttributeCampaignRevenue() {
      return { contentCents: 10000, feedCents: 0 }
    },
    async founderAdDemand() {
      return [{ category: 'software_apps', label: 'Software & apps', members: null }]
    },
    async block(id) {
      governance.blockCalls.push({ id, block: true })
      const u = users.get(id)
      if (u) governance.blocks.push({ id, username: u.username ?? '', displayName: u.displayName ?? '', blockedAt: new Date().toISOString() })
    },
    async unblock(id) {
      governance.blockCalls.push({ id, block: false })
      governance.blocks = governance.blocks.filter((b) => b.id !== id)
    },
    async myBlocks() {
      return governance.blocks
    },
    async myStanding() {
      return governance.standing
    },
    async myNotices() {
      return governance.notices
    },
    async markNoticesRead() {
      governance.notices = governance.notices.map((n) => ({ ...n, read: true }))
    },
    async appeal(noticeId, body) {
      governance.appealed.push({ noticeId, body })
      governance.notices = governance.notices.map((n) => (n.id === noticeId ? { ...n, appealStatus: 'open', canAppeal: false } : n))
    },
    async modEnforce(memberId, level, reason, reportId, days, note, immediate) {
      requireModerator()
      governance.enforced.push({ memberId, level, reason, reportId: reportId ?? null, days: days ?? null, ...(immediate ? { immediate, note } : {}) })
    },
    async modLift(id) {
      requireModerator()
      governance.lifted.push(id)
    },
    async modMemberRecord() {
      requireModerator()
      return governance.record
    },
    async modAppeals(status) {
      requireModerator()
      return governance.appeals.filter((a) => (status === 'open' ? a.status === 'open' : a.status !== 'open'))
    },
    async modDecideAppeal(id, reverse) {
      requireModerator()
      governance.decided.push({ id, reverse })
      governance.appeals = governance.appeals.map((a) => (a.id === id ? { ...a, status: reverse ? 'reversed' : 'upheld' } : a))
    },
    async myPoints() {
      return rewards.points
    },
    async myPointsHistory() {
      return rewards.history
    },
    async mySimulatedEarnings() {
      return rewards.earnings
    },
    async founderReferralQueue() {
      return rewards.queue
    },
    async founderReviewReferral(id, approve) {
      rewards.reviewed.push({ id, approve })
      rewards.queue = rewards.queue.filter((q) => q.awardId !== id)
    },
    async founderRewardsOverview() {
      return rewards.overview
    },
    async founderRecordSimRevenue(month, kind, creatorId, netCents, note) {
      rewards.revenue.push({ month, kind, creatorId, netCents, note })
    },
    async founderCloseMonth(month) {
      rewards.closed.push(month)
      return { poolCents: 2000, points: 100, members: 1, allocatedCents: 2000 }
    },
    async publicPreviewsAllowed() {
      return previews.allowed
    },
    async setPublicPreviews(allowed) {
      previews.allowed = allowed
    },
    async repost(id) {
      const p = posts.find((x) => x.id === id && !x.deleted)
      if (!p) throw new AppApiError('not_found')
      if (p.author === meId) throw new AppApiError('cannot_repost_own')
      reposts.add(key(meId, id))
    },
    async unrepost(id) {
      reposts.delete(key(meId, id))
    },
    async recordSupportIntent(id, choice) {
      maybeFail('recordSupportIntent')
      if (id === meId) throw new AppApiError('invalid_request')
      if (choice === 'withdrawn') supportIntents.delete(key(meId, id))
      else supportIntents.set(key(meId, id), choice)
    },
    async unfollow(id) {
      follows.delete(key(meId, id))
      clique.delete(key(meId, id))
    },
    async cliqueAdd(id) {
      maybeFail('cliqueAdd')
      if (!follows.has(key(meId, id))) throw new AppApiError('not_following')
      if (clique.has(key(meId, id))) return
      clique.add(key(meId, id))
    },
    async cliqueRemove(id) {
      clique.delete(key(meId, id))
    },
    // Same checks and order as public.app_clique_replace; all or nothing.
    async cliqueReplace(removeId, addId) {
      maybeFail('cliqueReplace')
      if (addId === meId) throw new AppApiError('cannot_add_self')
      if (removeId === addId || !clique.has(key(meId, removeId))) throw new AppApiError('not_in_clique')
      if (clique.has(key(meId, addId))) throw new AppApiError('already_in_clique')
      if (!follows.has(key(meId, addId))) throw new AppApiError('not_following')
      clique.delete(key(meId, removeId))
      clique.add(key(meId, addId))
    },
    async like(id) {
      maybeFail('like')
      live(id)
      likes.add(key(meId, id))
    },
    async unlike(id) {
      likes.delete(key(meId, id))
    },
    async addComment(postId, body, requestId) {
      const seen = requestId ? requests.get(`comment:${requestId}`) : undefined
      if (seen) {
        if (seen.body !== `${postId}:${body.trim()}`) throw new AppApiError('request_reused')
        return seen.id
      }
      live(postId)
      const id = `k${++n}`
      comments.push({ id, post: postId, author: meId, body: body.trim(), at: (clock += 1000), deleted: false })
      if (requestId) requests.set(`comment:${requestId}`, { id, body: `${postId}:${body.trim()}` })
      return id
    },
    async deleteComment(id) {
      const c = comments.find((x) => x.id === id && x.author === meId && !x.deleted)
      if (!c) throw new AppApiError('not_found')
      c.deleted = true
    },
    // Viewed state, with the database's rules: unseen = published at or after
    // the follow, not deleted, not viewed; counts capped at 10; My Clique
    // first, then newest unseen; catch-up newest 20 shown oldest first.
    async unseenCreators() {
      complete()
      return [...follows]
        .filter((k) => k.startsWith(`${meId}>`))
        .map((k) => k.split('>')[1])
        .map((id) => ({ id, unseen: unseenOf(id) }))
        .filter((c) => c.unseen.length > 0)
        .map((c) => ({
          ...summary(c.id),
          inMyClique: clique.has(key(meId, c.id)),
          unseenCount: Math.min(c.unseen.length, 10),
          latestUnseenAt: new Date(c.unseen[0].at).toISOString(),
        }))
        .sort((a, b) => Number(b.inMyClique) - Number(a.inMyClique) || b.latestUnseenAt.localeCompare(a.latestUnseenAt) || a.id.localeCompare(b.id))
    },
    async catchUp(creatorId, before) {
      complete()
      maybeFail('catchUp')
      if (!follows.has(key(meId, creatorId))) return []
      return unseenOf(creatorId)
        .filter((p) => !before || p.at < Date.parse(before.createdAt) || (p.at === Date.parse(before.createdAt) && p.id < before.id))
        .slice(0, 20)
        .reverse()
        .map(toP)
    },
    async markViewed(ids, basis) {
      complete()
      maybeFail('markViewed')
      marks.push({ ids: [...ids], basis })
      if (ids.length > 50) throw new AppApiError('too_many')
      let added = 0
      for (const id of new Set(ids)) {
        const p = posts.find((x) => x.id === id && !x.deleted)
        if (!p || p.author === meId || views.has(key(meId, id))) continue
        views.add(key(meId, id))
        added++
      }
      return added
    },
  }
  // A creator's unseen posts for the signed-in member, newest first (ties by id).
  const unseenOf = (creatorId: string) =>
    posts
      .filter((p) => p.author === creatorId && !p.deleted && p.at >= (followedAt.get(key(meId, creatorId)) ?? 0) && !views.has(key(meId, p.id)))
      .sort((a, b) => b.at - a.at || b.id.localeCompare(a.id))
  const seedPost = (author: string, body: string, at?: number) => {
    const id = `p${String(++n).padStart(3, '0')}`
    posts.push({ id, author, body, at: at ?? (clock += 1000), deleted: false })
    return id
  }
  const setDetails = (id: string, d: Partial<MyDetails>) =>
    details.set(id, { identity: null, bio: null, followReason: null, topics: [], onboarded: true, ...details.get(id), ...d })
  const seedReport = (r: Omit<FakeReport, 'id' | 'status' | 'at'>) => {
    const id = `r${reports.length + 1}`
    reports.push({ ...r, id, status: 'open', at: (clock += 1000) })
    return id
  }
  return {
    api,
    photo,
    video,
    posts,
    feedback,
    feedbackCalls,
    isFounder,
    seedPost,
    follows,
    clique,
    mutes,
    followSources,
    supportIntents,
    postTopics,
    edits,
    saves,
    reposts,
    shares,
    searchNotes,
    previews,
    rewards,
    progression,
    governance,
    ads,
    intel,
    onb,
    commentStore: comments,
    failures,
    key,
    views,
    marks,
    followedAt,
    access,
    setDetails,
    savedDetails,
    details,
    reports,
    modActions,
    isModerator,
    seedReport,
    pictures,
    pictureCalls,
    storage,
  }
}

const SESSION = { access_token: 't', refresh_token: 'r', user: { id: 'me', email: 'mia@example.test' } }
function fakeAuthClient() {
  return {
    auth: {
      getSession: async () => ({ data: { session: SESSION }, error: null }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
    },
  } as unknown as SupabaseClient
}

function renderApp(path: string, api: AppApi) {
  return render(
    <AuthProvider client={fakeAuthClient()}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="app" element={<MemberArea api={api} />}>
            <Route index element={<FeedPage />} />
            <Route path="discover" element={<DiscoverPage />} />
            <Route path="new" element={<ComposePage />} />
            <Route path="post/:id" element={<PostPage />} />
            <Route path="u/:username" element={<MemberPage />} />
            <Route path="clique" element={<CliquePage />} />
            <Route path="saved" element={<SavedPage />} />
            <Route path="split" element={<MySplitPage />} />
            <Route path="split/review" element={<RewardsReviewPage />} />
            <Route path="catch-up/:username" element={<CatchUpPage />} />
            <Route path="profile" element={<ProfilePage />} />
            <Route path="moderation" element={<ModerationQueuePage />} />
            <Route path="moderation/appeals" element={<ModerationAppealsPage />} />
            <Route path="moderation/:id" element={<ModerationReportPage />} />
            <Route path="notices" element={<NoticesPage />} />
            <Route path="ads" element={<AdsManagePage />} />
            <Route path="control" element={<ControlCenterPage />} />
            <Route path="advertise" element={<AdvertisePage />} />
            <Route path="privacy" element={<MemberPrivacyPage />} />
            <Route path="video-test" element={<VideoTestPage />} />
            <Route path="feedback" element={<FeedbackPage />} />
            <Route path="feedback/inbox" element={<FeedbackInboxPage />} />
            <Route path="feedback/inbox/:id" element={<FeedbackEntryPage />} />
            <Route path="*" element={<AppNotFound />} />
          </Route>
        </Routes>
      </MemoryRouter>
    </AuthProvider>,
  )
}

// ---------------------------------------------------------------------------

describe('data layer helpers', () => {
  it('checks usernames and display names like the database does', () => {
    expect(usernameProblem('mia_23')).toBeNull()
    expect(usernameProblem('ab')).toMatch(/3 to 30/)
    expect(usernameProblem('Mia')).toMatch(/lowercase/)
    expect(usernameProblem('admin')).toMatch(/reserved/)
    expect(displayNameProblem('Mia Chen')).toBeNull()
    expect(displayNameProblem('   ')).toMatch(/Add the name/)
    expect(displayNameProblem('x'.repeat(51))).toMatch(/50/)
  })

  it('turns database errors into known codes and plain messages, never raw database text', () => {
    expect(toAppError({ message: 'clique_full' }).code).toBe('clique_full')
    expect(toAppError({ message: 'rate_limited' }).code).toBe('rate_limited')
    expect(toAppError({ message: 'not_in_clique' }).code).toBe('not_in_clique')
    expect(toAppError({ message: 'already_in_clique' }).code).toBe('already_in_clique')
    expect(toAppError({ message: 'not_following' }).code).toBe('not_following')
    expect(toAppError({ code: '23505', message: 'duplicate key value violates unique constraint "profiles_username_unique"' }).code).toBe('username_taken')
    expect(toAppError({ code: '23514', message: 'new row violates check constraint "posts_body_valid"' }).code).toBe('posts_body_valid')
    expect(toAppError({ message: 'a stack trace mentioning empty things' }).code).toBe('unknown')
    expect(toAppError({ message: 'TypeError: Failed to fetch' }).code).toBe('network')
    expect(messageFor(new AppApiError('clique_full'))).toMatch(/full for now/)
    expect(messageFor(new Error('relation "social.posts" does not exist'))).toBe('Something went wrong. Please try again.')
  })

  it('maps database rows to posts, including counts sent as text', () => {
    const p = toPost({
      id: 'p1',
      author_id: 'a',
      author_username: 'aye',
      author_display_name: 'Aye',
      body: 'hi',
      created_at: '2026-11-17T12:00:00Z',
      like_count: '3',
      comment_count: 2,
      liked_by_me: true,
      author_in_my_clique: false,
      is_mine: false,
    })
    expect(p).toMatchObject({ likeCount: 3, commentCount: 2, author: { username: 'aye', displayName: 'Aye' } })
  })
})

describe('pilot membership (20261122000000): signed in is not enough', () => {
  for (const [status, text] of [
    ['none', "Your account hasn't been approved for the Splitpost pilot yet."],
    ['revoked', 'Your pilot access has ended.'],
    ['expired', 'Your pilot access has ended.'],
  ] as const) {
    it(`${status}: explains it, loads no profile or member data, and offers a Sign out button`, async () => {
      const { api, access } = fakeApi()
      access.status = status
      const ownProfile = vi.spyOn(api, 'ownProfile')
      const feed = vi.spyOn(api, 'feed')
      const me = vi.spyOn(api, 'me')
      renderApp('/app', api)
      expect(await screen.findByRole('heading', { name: "Your pilot access isn't active" })).toBeTruthy()
      expect(screen.getByTestId('no-pilot-access').getAttribute('data-status')).toBe(status)
      expect(screen.getByText(text)).toBeTruthy()
      expect(screen.getByRole('button', { name: 'Sign out' })).toBeTruthy()
      // Revoked and expired read the same: the screen never says why access ended.
      expect(document.body.textContent).not.toMatch(/revoked|expired|removed/i)
      expect(screen.queryByRole('heading', { name: 'Home' })).toBeNull()
      expect(screen.queryByLabelText('Username')).toBeNull()
      expect(ownProfile).not.toHaveBeenCalled()
      expect(feed).not.toHaveBeenCalled()
      expect(me).not.toHaveBeenCalled()
    })
  }

  it('the same for every member page, not just the feed', async () => {
    for (const path of ['/app/discover?face=creators', '/app/new', '/app/clique', '/app/profile', '/app/u/creator_1', '/app/post/p1']) {
      const { api, access } = fakeApi()
      access.status = 'none'
      const { unmount } = renderApp(path, api)
      expect(await screen.findByRole('heading', { name: "Your pilot access isn't active" }), path).toBeTruthy()
      unmount()
    }
  })

  it('an active member with no profile yet goes on to choose one', async () => {
    const { api } = fakeApi('me', { profile: { username: null, displayName: null } })
    renderApp('/app', api)
    expect(await screen.findByText('Your profile is ready')).toBeTruthy()
  })

  it('if the membership check itself fails, nothing is shown but an error, and no profile or member data is loaded', async () => {
    for (const code of ['network', 'unknown', 'no_pilot_access'] as const) {
      const { api, failures } = fakeApi()
      failures.accessState = new AppApiError(code)
      const ownProfile = vi.spyOn(api, 'ownProfile')
      const feed = vi.spyOn(api, 'feed')
      const { unmount } = renderApp('/app', api)
      expect(await screen.findByText("We couldn't verify your access right now. Please try again."), code).toBeTruthy()
      expect(screen.queryByRole('heading', { name: 'Home' })).toBeNull()
      expect(ownProfile).not.toHaveBeenCalled()
      expect(feed).not.toHaveBeenCalled()
      unmount()
    }
  })

  it('a database without the gate yet (pre-gate) behaves as before: straight to the feed', async () => {
    const { api, access } = fakeApi()
    ;(access as { preGate?: true }).preGate = true
    renderApp('/app', api)
    expect(await screen.findByRole('heading', { name: 'Home' })).toBeTruthy()
  })

  it('a refused member action says pilot access is not active, in plain words', () => {
    expect(toAppError({ message: 'no_pilot_access', code: 'P0001' }).code).toBe('no_pilot_access')
    expect(messageFor(new AppApiError('no_pilot_access'))).toMatch(/pilot access isn't active/)
  })
})

describe('first visit: choosing a username and display name', () => {
  it('shows the profile is ready, validates the form, then opens the feed', async () => {
    const { api } = fakeApi('me', { profile: { username: null, displayName: null } })
    renderApp('/app', api)
    expect(await screen.findByText('Your profile is ready')).toBeTruthy()
    expect(screen.getByText('mia@example.test')).toBeTruthy()
    fireEvent.change(screen.getByLabelText('Username'), { target: { value: 'ad' } })
    fireEvent.change(screen.getByLabelText('Display name'), { target: { value: 'Mia' } })
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }))
    expect((await screen.findByRole('alert')).textContent).toMatch(/3 to 30/)
    fireEvent.change(screen.getByLabelText('Username'), { target: { value: 'creator_1' } })
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }))
    expect((await screen.findByRole('alert')).textContent).toMatch(/taken/)
    fireEvent.change(screen.getByLabelText('Username'), { target: { value: 'mia' } })
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }))
    expect(await screen.findByRole('heading', { name: 'Home' })).toBeTruthy()
  })

  it('explains when the profile has not been created yet', async () => {
    const { api } = fakeApi('me', { profile: null })
    renderApp('/app', api)
    expect(await screen.findByText(/Your profile isn't ready yet/)).toBeTruthy()
  })
})

describe('first-time setup and profile details (20261123000000)', () => {
  it('a new member goes from their name to identity, interests, about and people to follow, with progress shown, then the feed', async () => {
    const f = fakeApi('me', { profile: { username: null, displayName: null }, details: 'new' })
    f.setDetails('c1', { identity: 'creator', bio: 'Budget recipes.', followReason: 'A new recipe every week', topics: ['food', 'music'] })
    f.setDetails('c2', { identity: 'fan', topics: ['travel'] })
    renderApp('/app', f.api)
    expect(await screen.findByText('Step 1 of 6: Your name')).toBeTruthy()
    fireEvent.change(screen.getByLabelText('Username'), { target: { value: 'mia' } })
    fireEvent.change(screen.getByLabelText('Display name'), { target: { value: 'Mia' } })
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }))

    // 2. Identity: descriptive only, and the page says so.
    expect(await screen.findByRole('heading', { name: 'What brings you to Splitpost?' })).toBeTruthy()
    const bar = screen.getByRole('progressbar', { name: 'Profile setup' })
    expect(bar.getAttribute('aria-valuenow')).toBe('2')
    expect(screen.getByText(/It only helps us suggest where to start\. Every account can post, follow, build a Clique and advertise/)).toBeTruthy()
    // Optional: Continue works without an answer (unified account, nothing to declare).
    expect((screen.getByRole('button', { name: 'Continue' }) as HTMLButtonElement).disabled).toBe(false)
    fireEvent.click(screen.getByRole('radio', { name: /Share my own work/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }))

    // 3. Interests, from the database's list, at most 5.
    expect(await screen.findByRole('heading', { name: 'What are you into?' })).toBeTruthy()
    expect(screen.getByText('Choose what you love so we can help you find your people.')).toBeTruthy()
    expect(screen.getByText(/We suggest at least 3\. You can choose up to 5/)).toBeTruthy()
    const progress = screen.getByTestId('topic-progress')
    expect(progress.textContent).toBe('Nothing chosen yet.')
    for (const t of ['Food & cooking', 'Music']) fireEvent.click(screen.getByRole('button', { name: t }))
    expect(screen.getByRole('button', { name: 'Music' }).getAttribute('aria-pressed')).toBe('true')
    // Fewer than 3: a nudge, never a block.
    expect(progress.textContent).toBe('2 chosen. Pick 1 more for better suggestions.')
    expect((screen.getByRole('button', { name: 'Continue' }) as HTMLButtonElement).disabled).toBe(false)
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }))

    // 4. About you, then saved once.
    expect(await screen.findByRole('heading', { name: 'Tell people about you' })).toBeTruthy()
    fireEvent.change(screen.getByLabelText('Short bio'), { target: { value: 'Home cook.\nToronto.' } })
    fireEvent.change(screen.getByLabelText('Why should people follow you?'), { target: { value: 'Quick dinners' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save and continue' }))

    // 5. People to follow, shared interests first, with the existing Follow button.
    expect(await screen.findByRole('heading', { name: 'People you might like' })).toBeTruthy()
    expect(f.savedDetails).toEqual([{ identity: 'creator', bio: 'Home cook. Toronto.', followReason: 'Quick dinners', topics: ['food', 'music'] }])
    const people = await screen.findByTestId('suggested-people')
    const first = within(people).getAllByRole('listitem')[0]
    expect(within(first).getByRole('link', { name: 'Creator 1' })).toBeTruthy()
    expect(within(first).getByText('Budget recipes.')).toBeTruthy()
    expect(within(first).getByText('A new recipe every week')).toBeTruthy()
    expect(within(first).getByText('Shares 2 of your interests')).toBeTruthy()
    fireEvent.click(within(first).getByRole('button', { name: 'Follow Creator 1' }))
    expect(await within(first).findByRole('button', { name: 'Following (Creator 1, tap to unfollow)' })).toBeTruthy()
    expect(f.follows.has(f.key('me', 'c1'))).toBe(true)
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Go to my feed' }))
    expect(await screen.findByRole('heading', { name: 'Home' })).toBeTruthy()
  })

  it('while "Skip the rest" is saving, the step buttons wait too, so a second tap cannot change the step underneath it', async () => {
    const f = fakeApi('me', { details: 'new' })
    let release!: () => void
    const save = f.api.saveDetails.bind(f.api)
    f.api.saveDetails = async (d) => {
      await new Promise<void>((r) => (release = r))
      return save(d)
    }
    renderApp('/app', f.api)
    expect(await screen.findByRole('heading', { name: 'What brings you to Splitpost?' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Skip the rest' }))
    const next = screen.getByRole('button', { name: 'Continue' }) as HTMLButtonElement
    await waitFor(() => expect(next.disabled).toBe(true))
    expect((screen.getByRole('button', { name: 'Skip for now: what brings you here' }) as HTMLButtonElement).disabled).toBe(true)
    fireEvent.click(next)
    expect(screen.getByRole('heading', { name: 'What brings you to Splitpost?' })).toBeTruthy()
    release()
    expect(await screen.findByRole('heading', { name: 'People you might like' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }))
    expect(await screen.findByRole('button', { name: 'Go to my feed' })).toBeTruthy()
  })

  it('every step can be skipped: "Skip the rest" saves empty details and setup is not shown again', async () => {
    const f = fakeApi('me', { details: 'new' })
    const view = renderApp('/app', f.api)
    expect(await screen.findByRole('heading', { name: 'What brings you to Splitpost?' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Skip the rest' }))
    expect(await screen.findByRole('heading', { name: 'People you might like' })).toBeTruthy()
    expect(f.savedDetails).toEqual([{ identity: null, bio: null, followReason: null, topics: [] }])
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Go to my feed' }))
    expect(await screen.findByRole('heading', { name: 'Home' })).toBeTruthy()
    view.unmount()
    renderApp('/app', f.api)
    expect(await screen.findByRole('heading', { name: 'Home' })).toBeTruthy()
    expect(screen.queryByRole('progressbar')).toBeNull()
  })

  it('interests are encouraged, not required: Continue works with none or one', async () => {
    const f = fakeApi('me', { details: 'new' })
    renderApp('/app', f.api)
    await screen.findByRole('heading', { name: 'What brings you to Splitpost?' })
    fireEvent.click(screen.getByRole('radio', { name: /Find creators I'll love/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }))
    await screen.findByRole('heading', { name: 'What are you into?' })
    fireEvent.click(screen.getByRole('button', { name: 'Tech' }))
    expect(screen.getByTestId('topic-progress').textContent).toBe('1 chosen. Pick 2 more for better suggestions.')
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }))
    await screen.findByRole('heading', { name: 'Tell people about you' })
    fireEvent.click(screen.getByRole('button', { name: 'Save and continue' }))
    await screen.findByRole('heading', { name: 'People you might like' })
    expect(f.savedDetails).toEqual([{ identity: 'fan', bio: null, followReason: null, topics: ['tech'] }])
  })

  it('checks the limits before saving, and keeps the member on the step if saving fails', async () => {
    const f = fakeApi('me', { details: 'new' })
    renderApp('/app', f.api)
    await screen.findByRole('heading', { name: 'What brings you to Splitpost?' })
    fireEvent.click(screen.getByRole('button', { name: 'Skip for now: what brings you here' }))
    await screen.findByRole('heading', { name: 'What are you into?' })
    for (const t of ['Food & cooking', 'Money & business', 'Tech']) fireEvent.click(screen.getByRole('button', { name: t }))
    expect(screen.getByTestId('topic-progress').textContent).toBe("3 of 5 chosen. That's enough to find your people.")
    for (const t of ['Music', 'Travel']) fireEvent.click(screen.getByRole('button', { name: t }))
    expect(screen.getByTestId('topic-progress').textContent).toBe('5 of 5 chosen, the most you can pick.')
    // A sixth can't be chosen.
    expect((screen.getByRole('button', { name: 'Books & writing' }) as HTMLButtonElement).disabled).toBe(true)
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }))
    await screen.findByRole('heading', { name: 'Tell people about you' })
    fireEvent.change(screen.getByLabelText('Short bio'), { target: { value: 'x'.repeat(161) } })
    expect(screen.getByText('161/160')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Save and continue' }))
    expect((await screen.findByRole('alert')).textContent).toMatch(/Keep your bio to 160 characters/)
    expect(f.savedDetails).toHaveLength(0)
    fireEvent.change(screen.getByLabelText('Short bio'), { target: { value: 'Fine.' } })
    f.failures.saveDetails = new AppApiError('rate_limited')
    fireEvent.click(screen.getByRole('button', { name: 'Save and continue' }))
    expect((await screen.findByRole('alert')).textContent).toMatch(/going a little fast/)
    expect(screen.getByRole('heading', { name: 'Tell people about you' })).toBeTruthy()
    delete f.failures.saveDetails
    fireEvent.click(screen.getByRole('button', { name: 'Save and continue' }))
    expect(await screen.findByRole('heading', { name: 'People you might like' })).toBeTruthy()
  })

  it('on a database without profile details, the member goes straight in and nothing new is shown', async () => {
    const f = fakeApi('me', { profile: { username: null, displayName: null }, details: 'absent' })
    renderApp('/app', f.api)
    fireEvent.change(await screen.findByLabelText('Username'), { target: { value: 'mia' } })
    fireEvent.change(screen.getByLabelText('Display name'), { target: { value: 'Mia' } })
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }))
    expect(await screen.findByRole('heading', { name: 'Home' })).toBeTruthy()
    cleanup()
    renderApp('/app/discover?face=creators', f.api)
    expect(await screen.findByRole('link', { name: 'Creator 1' })).toBeTruthy()
    expect(screen.queryByText('Browse by interest')).toBeNull()
    cleanup()
    renderApp('/app/profile', f.api)
    expect(await screen.findByRole('heading', { name: 'Your name' })).toBeTruthy()
    await waitFor(() => expect(screen.queryByText('Loading your details…')).toBeNull())
    expect(screen.queryByRole('heading', { name: 'About you' })).toBeNull()
  })

  it('Discover filters by interest and shows bios, follow reasons and shared interests', async () => {
    const f = fakeApi()
    f.setDetails('me', { topics: ['food'] })
    f.setDetails('c1', { identity: 'creator', bio: 'Budget recipes.', followReason: 'A new recipe every week', topics: ['food'] })
    f.setDetails('c2', { identity: 'both', topics: ['travel'] })
    renderApp('/app/discover?face=creators', f.api)
    const items = await screen.findAllByRole('listitem')
    expect(within(items[0]).getByRole('link', { name: 'Creator 1' })).toBeTruthy()
    expect(within(items[0]).getByText('Shares 1 of your interests')).toBeTruthy()
    expect(within(items[0]).getByText(/Why follow:/)).toBeTruthy()
    // The goal question is private personalization: never a public label (unified account).
    expect(within(items[0]).queryByText(/Creator ·/)).toBeNull()
    const filter = screen.getByLabelText('Browse by interest') as HTMLSelectElement
    expect([...filter.options].map((o) => o.textContent)).toEqual([
      'Everyone',
      'Food & cooking',
      'Money & business',
      'Tech',
      'Music',
      'Travel',
      'Books & writing',
    ])
    fireEvent.change(filter, { target: { value: 'travel' } })
    await waitFor(() => expect(screen.queryByRole('link', { name: 'Creator 1' })).toBeNull())
    expect(screen.getByRole('link', { name: 'Creator 2' })).toBeTruthy()
    expect(screen.queryByText(/Creator and fan ·/)).toBeNull()
    fireEvent.change(filter, { target: { value: 'books' } })
    expect(await screen.findByText('Nobody has chosen Books & writing yet. Try another interest.')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Show everyone' }))
    expect(await screen.findByRole('link', { name: 'Creator 1' })).toBeTruthy()
  })

  it("a member's page shows their identity, bio, why to follow and interests", async () => {
    const f = fakeApi()
    f.setDetails('c1', { identity: 'creator', bio: 'Budget recipes.', followReason: 'A new recipe every week', topics: ['food', 'music'] })
    renderApp('/app/u/creator_1', f.api)
    const about = await screen.findByTestId('member-about')
    expect(within(about).queryByText('Creator')).toBeNull()
    expect(within(about).getByText('Budget recipes.')).toBeTruthy()
    expect(within(about).getByText('Why follow')).toBeTruthy()
    expect(within(about).getByText('A new recipe every week')).toBeTruthy()
    expect(
      within(within(about).getByRole('list', { name: 'Interests' }))
        .getAllByRole('listitem')
        .map((li) => li.textContent),
    ).toEqual(['Food & cooking', 'Music'])
    cleanup()
    renderApp('/app/u/creator_2', f.api)
    expect(await screen.findByRole('heading', { name: 'Creator 2' })).toBeTruthy()
    expect(screen.queryByTestId('member-about')).toBeNull()
  })

  it('details are edited later from Profile', async () => {
    const f = fakeApi()
    f.setDetails('me', { identity: 'fan', bio: 'Old bio', topics: ['tech'] })
    renderApp('/app/profile', f.api)
    expect(await screen.findByRole('heading', { name: 'About you' })).toBeTruthy()
    expect((screen.getByRole('radio', { name: /Find creators I'll love/ }) as HTMLInputElement).checked).toBe(true)
    expect((screen.getByLabelText('Short bio') as HTMLTextAreaElement).value).toBe('Old bio')
    fireEvent.click(screen.getByRole('radio', { name: /A bit of both/ }))
    fireEvent.click(within(screen.getByRole('form', { name: 'About you' })).getByRole('button', { name: 'Music' }))
    fireEvent.change(screen.getByLabelText('Why should people follow you?'), { target: { value: 'Honest reviews' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save details' }))
    expect(await screen.findByText('Saved.')).toBeTruthy()
    expect(f.savedDetails.at(-1)).toEqual({ identity: 'both', bio: 'Old bio', followReason: 'Honest reviews', topics: ['tech', 'music'] })
  })

  it('an empty feed suggests people who share your interests', async () => {
    const f = fakeApi()
    f.setDetails('me', { topics: ['music'] })
    f.setDetails('c3', { topics: ['music'], followReason: 'Live sets' })
    renderApp('/app', f.api)
    expect(await screen.findByText('Your feed is quiet')).toBeTruthy()
    const people = await screen.findByTestId('suggested-people')
    expect(within(within(people).getAllByRole('listitem')[0]).getByRole('link', { name: 'Creator 3' })).toBeTruthy()
  })
})

describe('reporting and moderation (20261124000000)', () => {
  it("reports a post with a reason and details, after a safety notice; you can't report your own; a second report says so", async () => {
    const f = fakeApi()
    f.seedPost('c1', 'Something unkind')
    f.follows.add(f.key('me', 'c1'))
    const mine = await f.api.createPost('My own post')
    renderApp('/app', f.api)
    await screen.findByText('Something unkind')
    const theirs = screen.getAllByTestId('post').find((p) => p.textContent?.includes('Something unkind'))!
    const own = screen.getAllByTestId('post').find((p) => p.textContent?.includes('My own post'))!
    expect(within(own).queryByRole('button', { name: /^Report/ })).toBeNull()
    expect(mine).toBeTruthy()
    fireEvent.click(within(theirs).getByRole('button', { name: 'Report this post by Creator 1' }))
    const dialog = await screen.findByRole('dialog', { name: 'Report this post' })
    expect(within(dialog).getByRole('note').textContent).toMatch(/Reporting isn't an emergency service\..*not around the clock.*call 911.*988/)
    expect(
      within(dialog)
        .getAllByRole('radio')
        .map((r) => r.closest('label')?.textContent),
    ).toEqual([
      'Spam or scam',
      'Harassment or bullying',
      'Hate or discrimination',
      'Nudity or sexual content',
      'Violence or threats',
      'Self-harm',
      'Impersonation',
      'Something else',
    ])
    fireEvent.click(within(dialog).getByRole('button', { name: 'Send report' }))
    expect((await within(dialog).findByRole('alert')).textContent).toBe('Choose a reason.')
    fireEvent.click(within(dialog).getByRole('radio', { name: 'Harassment or bullying' }))
    fireEvent.change(within(dialog).getByLabelText('Anything else we should know? (optional)'), { target: { value: '  It keeps happening.  ' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Send report' }))
    const sent = await within(dialog).findByTestId('report-sent')
    expect(sent.textContent).toMatch(/Thanks for letting us know\. We'll review this\./)
    expect(sent.textContent).toMatch(/isn't told who reported them/)
    expect(sent.textContent).toMatch(/isn't removed just because it was reported/)
    expect(f.reports).toHaveLength(1)
    expect(f.reports[0]).toMatchObject({ targetType: 'post', reason: 'harassment', details: 'It keeps happening.' })
    // Reporting hides nothing.
    fireEvent.click(within(dialog).getByRole('button', { name: 'Done' }))
    expect(screen.getByText('Something unkind')).toBeTruthy()
    // Again: already reported.
    fireEvent.click(within(theirs).getByRole('button', { name: 'Report this post by Creator 1' }))
    const again = await screen.findByRole('dialog', { name: 'Report this post' })
    fireEvent.click(within(again).getByRole('radio', { name: 'Spam or scam' }))
    fireEvent.click(within(again).getByRole('button', { name: 'Send report' }))
    expect((await within(again).findByTestId('report-sent')).textContent).toMatch(/You've already reported this\. We'll review it\./)
    expect(f.reports).toHaveLength(1)
  })

  it('a threat or self-harm report says it is reviewed first, but not around the clock', async () => {
    const f = fakeApi()
    renderApp('/app/u/creator_2', f.api)
    fireEvent.click(await screen.findByRole('button', { name: 'Report Creator 2' }))
    const dialog = await screen.findByRole('dialog', { name: 'Report Creator 2' })
    fireEvent.click(within(dialog).getByRole('radio', { name: 'Self-harm' }))
    fireEvent.click(within(dialog).getByRole('button', { name: 'Send report' }))
    expect((await within(dialog).findByTestId('report-sent')).textContent).toMatch(
      /reviewed first, but not around the clock\. If someone is in danger now, call 911/,
    )
    expect(f.reports[0]).toMatchObject({ targetType: 'profile', targetId: 'c2', reason: 'self_harm' })
  })

  it('on a database without moderation, nothing new is shown', async () => {
    const f = fakeApi('me', { moderation: 'absent' })
    f.seedPost('c1', 'Hello')
    f.follows.add(f.key('me', 'c1'))
    renderApp('/app', f.api)
    await screen.findByText('Hello')
    expect(screen.queryByRole('button', { name: /^Report/ })).toBeNull()
  })

  it('members who are not moderators see no Moderation link, and the page is not available', async () => {
    const f = fakeApi()
    renderApp('/app/profile', f.api)
    await screen.findByRole('heading', { name: 'Your name' })
    expect(screen.queryByRole('link', { name: 'Moderation' })).toBeNull()
    cleanup()
    renderApp('/app/moderation', f.api)
    expect(await screen.findByText("This page isn't available")).toBeTruthy()
  })

  it('a moderator reviews the queue (safety first), hides a post everywhere, restores it, and dismisses another', async () => {
    const f = fakeApi('me', { moderator: true })
    const p1 = f.seedPost('c1', 'A rude post')
    const p2 = f.seedPost('c2', 'A harmless post')
    f.follows.add(f.key('me', 'c1'))
    f.follows.add(f.key('me', 'c2'))
    const rRude = f.seedReport({
      reporter: 'c3',
      targetType: 'post',
      targetId: p1,
      owner: 'c1',
      reason: 'harassment',
      details: 'Aimed at me.',
      snapshot: { body: 'A rude post', author_username: 'creator_1', author_display_name: 'Creator 1' },
    })
    f.seedReport({
      reporter: 'c4',
      targetType: 'post',
      targetId: p2,
      owner: 'c2',
      reason: 'violence',
      details: null,
      snapshot: { body: 'A harmless post', author_username: 'creator_2', author_display_name: 'Creator 2' },
    })
    renderApp('/app/profile', f.api)
    fireEvent.click(await screen.findByRole('link', { name: 'Moderation' }))
    const list = await screen.findByRole('list', { name: 'Open reports' })
    const items = within(list).getAllByRole('listitem')
    expect(items[0].textContent).toMatch(/Priority: safety.*Violence or threats/)
    expect(items[1].textContent).toMatch(/Harassment or bullying.*@creator_1/)
    // Nothing identifies who reported.
    expect(document.body.textContent).not.toMatch(/creator_3|Creator 3|creator_4|Creator 4/)
    fireEvent.click(within(items[1]).getByRole('link'))
    expect(await screen.findByText('Aimed at me.')).toBeTruthy()
    expect(screen.getByText('Visible to members')).toBeTruthy()
    fireEvent.change(screen.getByLabelText('Note for the record (optional)'), { target: { value: 'Targeted.' } })
    fireEvent.click(screen.getByRole('button', { name: 'Hide' }))
    expect(await screen.findByText('Hidden. Members can no longer see it.')).toBeTruthy()
    expect(await screen.findByText('Hidden by a moderator')).toBeTruthy()
    expect(f.modActions.at(-1)).toEqual({ action: 'hide', report: rRude, note: 'Targeted.' })
    cleanup()
    renderApp('/app', f.api)
    await screen.findByText('A harmless post')
    expect(screen.queryByText('A rude post')).toBeNull()
    cleanup()
    renderApp(`/app/moderation/${rRude}`, f.api)
    fireEvent.click(await screen.findByRole('button', { name: 'Restore' }))
    expect(await screen.findByText('Restored. Members can see it again.')).toBeTruthy()
    cleanup()
    renderApp('/app', f.api)
    expect(await screen.findByText('A rude post')).toBeTruthy()
    cleanup()
    renderApp('/app/moderation', f.api)
    const open = await screen.findByRole('list', { name: 'Open reports' })
    fireEvent.click(within(within(open).getAllByRole('listitem')[0]).getByRole('link'))
    fireEvent.click(await screen.findByRole('button', { name: 'Dismiss' }))
    expect(await screen.findByText('Dismissed. Nothing was changed.')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Hide' })).toBeTruthy()
    expect(f.modActions.map((a) => a.action)).toEqual(['hide', 'restore', 'dismiss'])
  })
})

describe('accessible names match what is visible (WCAG 2.5.3)', () => {
  it('Like, comments and catch-up are named from their visible text, with no aria-label overriding it', async () => {
    const f = fakeApi()
    f.follows.add(f.key('me', 'c1'))
    f.followedAt.set(f.key('me', 'c1'), 0)
    f.clique.add(f.key('me', 'c1'))
    const id = f.seedPost('c1', 'Named from what you see')
    renderApp('/app', f.api)
    const post = within((await screen.findAllByTestId('post')).find((p) => p.textContent?.includes('Named from what you see'))!)
    const like = post.getByRole('button', { name: 'Like, 0 likes' })
    const comments = post.getByRole('link', { name: '0 comments' })
    for (const el of [like, comments]) {
      expect(el.getAttribute('aria-label')).toBeNull()
      // The visible count is part of the name.
      expect(el.textContent).toContain('0')
    }
    fireEvent.click(like)
    expect(await post.findByRole('button', { name: 'Unlike, 1 like' })).toBeTruthy()
    const row = within(await screen.findByRole('region', { name: 'Your Clique' }))
    const link = await row.findByRole('link', { name: 'Creator 1 has 1 new post' })
    expect(link.getAttribute('aria-label')).toBeNull()
    expect(link.textContent).toContain('Creator 1')
    expect(id).toBeTruthy()
  })
})

describe('Clique confirmation (the suggestion card fix)', () => {
  async function toSuggestions(f: ReturnType<typeof fakeApi>) {
    f.setDetails('c1', { topics: ['food'], followReason: 'Recipes' })
    renderApp('/app', f.api)
    await screen.findByRole('heading', { name: 'What brings you to Splitpost?' })
    fireEvent.click(screen.getByRole('button', { name: 'Skip the rest' }))
    await screen.findByRole('heading', { name: 'People you might like' })
    const people = await screen.findByTestId('suggested-people')
    return within(
      within(people)
        .getAllByRole('listitem')
        .find((li) => li.textContent?.includes('Creator 1'))!,
    )
  }

  it('after adding someone, the card says "Added to your Clique!" and shows "In your Clique", and stays that way; Discover agrees after navigating', async () => {
    const f = fakeApi('me', { details: 'new' })
    const card = await toSuggestions(f)
    fireEvent.click(card.getByRole('button', { name: 'Follow Creator 1' }))
    const confirmation = within(await card.findByTestId('follow-confirmation'))
    fireEvent.click(confirmation.getByRole('button', { name: 'Join Clique (Creator 1)' }))
    expect((await card.findByTestId('relationship-notice')).textContent).toBe('Added to your Clique!')
    const inClique = card.getByRole('button', { name: 'In your Clique (Creator 1, tap to remove)' })
    expect(inClique.textContent?.trim()).toMatch(/^In your Clique/)
    expect(inClique.querySelector('svg')).toBeTruthy() // the check mark
    // The suggestions no longer include people you follow; the card keeps the right state anyway.
    await new Promise((r) => setTimeout(r, 50))
    expect(card.getByRole('button', { name: 'In your Clique (Creator 1, tap to remove)' })).toBeTruthy()
    expect(card.queryByRole('button', { name: 'Join Clique (Creator 1)' })).toBeNull()
    expect(f.clique.has(f.key('me', 'c1'))).toBe(true)
    // After leaving setup, Discover shows the same (server) state.
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Go to my feed' }))
    await screen.findByRole('heading', { name: 'Home' })
    cleanup()
    renderApp('/app/discover?face=creators', f.api)
    expect(await screen.findByRole('button', { name: 'In your Clique (Creator 1, tap to remove)' })).toBeTruthy()
  })

  it('a double tap sends one request; a failure shows a clear message and changes nothing', async () => {
    const f = fakeApi('me', { details: 'new' })
    let calls = 0
    const add = f.api.cliqueAdd.bind(f.api)
    f.api.cliqueAdd = async (id) => {
      calls++
      await new Promise((r) => setTimeout(r, 30))
      return add(id)
    }
    const card = await toSuggestions(f)
    fireEvent.click(card.getByRole('button', { name: 'Follow Creator 1' }))
    const button = await within(await card.findByTestId('follow-confirmation')).findByRole('button', { name: 'Join Clique (Creator 1)' })
    f.failures.cliqueAdd = new AppApiError('rate_limited')
    fireEvent.click(button)
    expect((await card.findByRole('alert')).textContent).toMatch(/going a little fast/)
    expect(card.getByRole('button', { name: 'Join Clique (Creator 1)' })).toBeTruthy()
    expect(f.clique.has(f.key('me', 'c1'))).toBe(false)
    delete f.failures.cliqueAdd
    calls = 0
    const again = card.getByRole('button', { name: 'Join Clique (Creator 1)' })
    fireEvent.click(again)
    fireEvent.click(again)
    expect((await card.findByTestId('relationship-notice')).textContent).toBe('Added to your Clique!')
    expect(calls).toBe(1)
  })

  it('removing from the Clique and unfollowing say so clearly', async () => {
    const f = fakeApi()
    f.follows.add(f.key('me', 'c1'))
    f.clique.add(f.key('me', 'c1'))
    renderApp('/app/u/creator_1', f.api)
    fireEvent.click(await screen.findByRole('button', { name: 'In your Clique (Creator 1, tap to remove)' }))
    expect((await screen.findByTestId('relationship-notice')).textContent).toBe('Removed from your Clique. You still follow Creator 1.')
    fireEvent.click(screen.getByRole('button', { name: 'Following (Creator 1, tap to unfollow)' }))
    expect((await screen.findByTestId('relationship-notice')).textContent).toBe('You unfollowed Creator 1.')
    expect(screen.getByRole('button', { name: 'Follow Creator 1' })).toBeTruthy()
  })
})

describe('profile pictures (20261125000000)', () => {
  it('crop maths: the photo always covers the square, and the saved part is what is shown', () => {
    expect(coverScale(1024, 768, 240)).toBeCloseTo(240 / 768)
    expect(clampOffset(10, 400, 240)).toBe(0) // can't leave a gap on the left
    expect(clampOffset(-500, 400, 240)).toBe(-160) // or on the right
    expect(clampOffset(-80, 400, 240)).toBe(-80)
    const s = coverScale(1000, 500, 240) * 2 // zoomed in 2x
    expect(sourceRect({ x: -100, y: -60, scale: s, view: 240 })).toEqual({ sx: 100 / s, sy: 60 / s, size: 240 / s })
  })

  it('shows pictures wherever members appear, and initials for everyone else', async () => {
    const f = fakeApi()
    f.pictures.set('c1', 'https://pics.test/c1.jpg')
    f.follows.add(f.key('me', 'c1'))
    f.seedPost('c1', 'With a picture')
    f.seedPost('c2', 'Without one')
    f.follows.add(f.key('me', 'c2'))
    const view = renderApp('/app', f.api)
    await screen.findByText('With a picture')
    await waitFor(() => expect(view.container.querySelector('img[src="https://pics.test/c1.jpg"]')).toBeTruthy())
    const other = screen.getAllByTestId('post').find((p) => p.textContent?.includes('Without one'))!
    expect(other.querySelector('img[src^="https://pics.test"]')).toBeNull()
    cleanup()
    const d = renderApp('/app/discover?face=creators', f.api)
    await screen.findByRole('link', { name: 'Creator 1' })
    await waitFor(() => expect(d.container.querySelector('img[src="https://pics.test/c1.jpg"]')).toBeTruthy())
  })

  it('the editor offers camera and gallery, refuses non-photos and huge files, and removes a picture after confirming', async () => {
    const f = fakeApi()
    f.pictures.set('me', 'https://pics.test/me.jpg')
    renderApp('/app/profile', f.api)
    fireEvent.click(await screen.findByRole('button', { name: 'Change picture' }))
    const editor = within(await screen.findByTestId('avatar-editor'))
    const input = editor.getByLabelText('Choose a new photo', { selector: 'input' }) as HTMLInputElement
    expect(input.type).toBe('file')
    expect(input.getAttribute('accept')).toBe('image/*')
    expect(input.hasAttribute('capture')).toBe(false) // phones offer camera AND gallery
    fireEvent.change(input, { target: { files: [new File(['%PDF'], 'notes.pdf', { type: 'application/pdf' })] } })
    expect((await editor.findByRole('alert')).textContent).toMatch(/Please choose a photo/)
    const huge = new File(['x'], 'huge.jpg', { type: 'image/jpeg' })
    Object.defineProperty(huge, 'size', { value: 16 * 1024 * 1024 })
    fireEvent.change(input, { target: { files: [huge] } })
    expect((await editor.findByRole('alert')).textContent).toMatch(/under 15 MB/)
    expect(f.pictureCalls).toEqual([])
    fireEvent.click(editor.getByRole('button', { name: 'Remove picture' }))
    fireEvent.click(editor.getByRole('button', { name: 'Remove' }))
    expect(await screen.findByText('Profile picture removed. Your initials show instead.')).toBeTruthy()
    expect(f.pictureCalls).toEqual(['remove'])
    expect(f.pictures.has('me')).toBe(false)
  })

  it('the About you step offers an optional photo', async () => {
    const f = fakeApi('me', { details: 'new' })
    renderApp('/app', f.api)
    await screen.findByRole('heading', { name: 'What brings you to Splitpost?' })
    fireEvent.click(screen.getByRole('button', { name: 'Skip for now: what brings you here' }))
    await screen.findByRole('heading', { name: 'What are you into?' })
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }))
    await screen.findByRole('heading', { name: 'Tell people about you' })
    const field = within(screen.getByTestId('profile-picture-field'))
    expect(field.getByText('Profile picture (optional)')).toBeTruthy()
    expect(field.getByRole('button', { name: 'Add a photo' })).toBeTruthy()
  })

  it('when picture links fail (function unavailable), the feed, profiles and setup keep working with initials', async () => {
    const f = fakeApi('me', { details: 'new' })
    f.failures.avatarLinks = new AppApiError('not_available')
    f.failures.removeAvatar = new AppApiError('not_available')
    f.pictures.set('me', 'https://pics.test/me.jpg')
    f.follows.add(f.key('me', 'c1'))
    f.seedPost('c1', 'Still readable')
    renderApp('/app', f.api)
    // Setup still works, including the About you step with its photo field.
    await screen.findByRole('heading', { name: 'What brings you to Splitpost?' })
    fireEvent.click(screen.getByRole('button', { name: 'Skip for now: what brings you here' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Continue' }))
    await screen.findByRole('heading', { name: 'Tell people about you' })
    expect(screen.getByRole('button', { name: 'Add a photo' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Save and continue' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Continue' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Go to my feed' }))
    expect(await screen.findByText('Still readable')).toBeTruthy()
    expect(document.querySelector('img[src^="https://pics.test"]')).toBeNull()
    cleanup()
    renderApp('/app/profile', f.api)
    expect(await screen.findByRole('heading', { name: 'Your name' })).toBeTruthy()
    expect(await screen.findByRole('heading', { name: 'About you' })).toBeTruthy()
  })

  it('saving or removing a picture while the function is unavailable says so plainly', async () => {
    const f = fakeApi()
    f.pictures.set('me', 'https://pics.test/me.jpg')
    f.failures.removeAvatar = new AppApiError('not_available')
    renderApp('/app/profile', f.api)
    fireEvent.click(await screen.findByRole('button', { name: 'Change picture' }))
    const editor = within(await screen.findByTestId('avatar-editor'))
    fireEvent.click(editor.getByRole('button', { name: 'Remove picture' }))
    fireEvent.click(editor.getByRole('button', { name: 'Remove' }))
    expect((await editor.findByRole('alert')).textContent).toMatch(/isn't available yet/)
    expect(f.pictures.has('me')).toBe(true)
  })

  it('moderators clean up unused picture files only after a dry run and the exact phrase', async () => {
    const f = fakeApi('me', { moderator: true })
    f.storage.unused = 2
    f.storage.bytes = 40_000
    renderApp('/app/moderation', f.api)
    const panel = within(await screen.findByTestId('storage-cleanup'))
    fireEvent.click(panel.getByRole('button', { name: 'Check for unused files' }))
    expect(await panel.findByText(/2 unused files \(40 KB\)/)).toBeTruthy()
    const run = panel.getByRole('button', { name: 'Delete 2 files' }) as HTMLButtonElement
    expect(run.disabled).toBe(true)
    fireEvent.change(panel.getByLabelText(/to confirm/), { target: { value: 'delete 2 files' } })
    expect(run.disabled).toBe(true)
    fireEvent.change(panel.getByLabelText(/to confirm/), { target: { value: 'DELETE 2 FILES' } })
    fireEvent.click(run)
    expect(await panel.findByText('Deleted 2 unused files.')).toBeTruthy()
  })

  it('members who are not moderators never see storage cleanup', async () => {
    const f = fakeApi()
    renderApp('/app/moderation', f.api)
    expect(await screen.findByText("This page isn't available")).toBeTruthy()
    expect(screen.queryByTestId('storage-cleanup')).toBeNull()
  })
})

describe('feed and posting', () => {
  it('starts quiet, points to Discover, and shows your own post after posting', async () => {
    const { api } = fakeApi()
    renderApp('/app', api)
    expect(await screen.findByText('Your feed is quiet')).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Discover people' }).getAttribute('href')).toBe('/app/discover')
    // Home opens on content: posting is in Create (approved design, V1).
    expect(screen.queryByLabelText('Write a post')).toBeNull()
    fireEvent.click(screen.getAllByRole('link', { name: 'Create' })[0])
    fireEvent.change(await screen.findByLabelText('Write a post'), { target: { value: '  My first post  ' } })
    fireEvent.click(screen.getByRole('button', { name: 'Post' }))
    expect(await screen.findByText('My first post')).toBeTruthy()
  })

  it('sends a post once even if the form is submitted twice in the same tick', async () => {
    const { api } = fakeApi()
    const sent: string[] = []
    const createPost = api.createPost.bind(api)
    api.createPost = async (body, requestId) => {
      sent.push(body)
      return createPost(body, requestId)
    }
    renderApp('/app/new', api)
    await screen.findByLabelText('Write a post')
    fireEvent.change(screen.getByLabelText('Write a post'), { target: { value: 'Only once, please' } })
    const form = screen.getByLabelText('Write a post').closest('form')!
    // Both events land before React re-renders, as with a fast double click.
    act(() => {
      form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
      form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
    })
    expect(await screen.findByTestId('post')).toBeTruthy()
    expect(sent).toEqual(['Only once, please'])
    expect(screen.getAllByTestId('post')).toHaveLength(1)
  })

  it('a retry after a lost answer reuses the request id, so the post is stored once', async () => {
    const { api } = fakeApi()
    const ids: string[] = []
    const createPost = api.createPost.bind(api)
    let loseNext = true
    api.createPost = async (body, requestId) => {
      ids.push(requestId ?? 'none')
      const id = await createPost(body, requestId)
      // The first time, the server stores the post but the answer never arrives.
      if (loseNext) {
        loseNext = false
        throw new AppApiError('network')
      }
      return id
    }
    renderApp('/app/new', api)
    await screen.findByLabelText('Write a post')
    fireEvent.change(screen.getByLabelText('Write a post'), { target: { value: 'Sent on a bad connection' } })
    fireEvent.click(screen.getByRole('button', { name: 'Post' }))
    expect(await screen.findByText("We couldn't reach Splitpost. Check your connection and try again.")).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Post' }))
    await waitFor(() => expect(ids).toHaveLength(2))
    expect(ids[0]).toMatch(/^[0-9a-f-]{36}$/)
    expect(ids[1]).toBe(ids[0])
    expect(await screen.findByTestId('post')).toBeTruthy()
    expect(screen.getAllByTestId('post')).toHaveLength(1)
  })

  it('uses a new request id once the text changes after an error, and after each success', async () => {
    const { api } = fakeApi()
    const ids: string[] = []
    const createPost = api.createPost.bind(api)
    let failNext = true
    api.createPost = async (body, requestId) => {
      ids.push(requestId ?? 'none')
      if (failNext) {
        failNext = false
        throw new AppApiError('network')
      }
      return createPost(body, requestId)
    }
    renderApp('/app/new', api)
    await screen.findByLabelText('Write a post')
    fireEvent.change(screen.getByLabelText('Write a post'), { target: { value: 'First draft' } })
    fireEvent.click(screen.getByRole('button', { name: 'Post' }))
    await screen.findByText("We couldn't reach Splitpost. Check your connection and try again.")
    fireEvent.change(screen.getByLabelText('Write a post'), { target: { value: 'Second draft' } })
    fireEvent.click(screen.getByRole('button', { name: 'Post' }))
    await screen.findByText('Second draft')
    // Publishing opens the post; the next one starts again from Create.
    fireEvent.click(screen.getAllByRole('link', { name: 'Create' })[0])
    fireEvent.change(await screen.findByLabelText('Write a post'), { target: { value: 'Another post' } })
    fireEvent.click(screen.getByRole('button', { name: 'Post' }))
    await screen.findByText('Another post')
    expect(ids).toHaveLength(3)
    expect(new Set(ids).size).toBe(3)
  })

  it('shows posts from people you follow, newest first, and lets you delete only your own', async () => {
    const { api, seedPost, follows, key } = fakeApi()
    seedPost('c1', 'Older post from Creator 1')
    seedPost('c2', 'Not followed, never shown')
    follows.add(key('me', 'c1'))
    await api.createPost('My newest post')
    renderApp('/app', api)
    const articles = await screen.findAllByTestId('post')
    expect(articles.map((a) => within(a).getByText(/post/i).textContent)).toEqual(['My newest post', 'Older post from Creator 1'])
    expect(screen.queryByText('Not followed, never shown')).toBeNull()
    expect(within(articles[1]).queryByRole('button', { name: 'Delete post' })).toBeNull()
    fireEvent.click(within(articles[0]).getByRole('button', { name: 'Delete post' }))
    fireEvent.click(within(articles[0]).getByRole('button', { name: 'Delete' }))
    await waitFor(() => expect(screen.queryByText('My newest post')).toBeNull())
  })

  it('likes update straight away, and roll back with a plain message if the server refuses', async () => {
    const { api, seedPost, follows, key, failures } = fakeApi()
    seedPost('c1', 'A post to like')
    follows.add(key('me', 'c1'))
    renderApp('/app', api)
    // The button is disabled while a request is in flight: wait for it to be ready before each click.
    const ready = async (name: string) => {
      const btn = (await screen.findByRole('button', { name })) as HTMLButtonElement
      await waitFor(() => expect(btn.disabled).toBe(false))
      return btn
    }
    fireEvent.click(await ready('Like, 0 likes'))
    fireEvent.click(await ready('Unlike, 1 like'))
    await ready('Like, 0 likes')
    failures.like = new AppApiError('not_found')
    fireEvent.click(await ready('Like, 0 likes'))
    expect((await screen.findByRole('alert')).textContent).toMatch(/no longer available/)
    expect(await ready('Like, 0 likes')).toBeTruthy()
  })
})

describe('Following and My Clique', () => {
  // The fan follows c1..cN, with c1..cM in their Clique.
  function setup(followed: number, inner: number, creators = 30) {
    const fake = fakeApi('me', { creators })
    for (let i = 1; i <= followed; i++) fake.follows.add(fake.key('me', `c${i}`))
    for (let i = 1; i <= inner; i++) fake.clique.add(fake.key('me', `c${i}`))
    return fake
  }
  const innerOf = (fake: ReturnType<typeof fakeApi>) => [...fake.clique].filter((k) => k.startsWith('me>')).sort()
  const following = () => within(screen.getByRole('region', { name: 'Following' }))
  const myClique = () => within(screen.getByRole('region', { name: 'My Clique' }))
  const loaded = async () => within(await screen.findByRole('region', { name: 'Following' }))

  it('following never adds someone to the Clique; adding is a separate choice, shown everywhere', async () => {
    const { api, seedPost } = fakeApi()
    seedPost('c1', 'Hello from Creator 1')
    renderApp('/app/discover?face=creators', api)
    fireEvent.click(await screen.findByRole('button', { name: 'Follow Creator 1' }))
    expect(await screen.findByRole('button', { name: 'Following (Creator 1, tap to unfollow)' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Join Clique (Creator 1)' }))
    expect(await screen.findByRole('button', { name: 'In your Clique (Creator 1, tap to remove)' })).toBeTruthy()
    expect(screen.getByTestId('relationship-notice').textContent).toBe('Added to your Clique!')
  })

  it('follows are unlimited: Following lists all 30 followed creators, each with its status', async () => {
    const { api } = setup(30, 2)
    renderApp('/app/clique', api)
    expect(await screen.findByText('30 creators')).toBeTruthy()
    expect(following().getAllByRole('listitem')).toHaveLength(30)
    expect(following().getAllByText('Clique')).toHaveLength(2)
    expect(following().getAllByRole('button', { name: /^Join Clique \(Creator \d+\)$/ })).toHaveLength(28)
    expect(following().getAllByRole('button', { name: /^Unfollow Creator/ })).toHaveLength(30)
    expect(screen.getByText('2 in your Clique')).toBeTruthy()
  })

  it('adds and removes Clique creators; removing never unfollows', async () => {
    const fake = setup(3, 1)
    renderApp('/app/clique', fake.api)
    fireEvent.click(await (await loaded()).findByRole('button', { name: 'Join Clique (Creator 2)' }))
    expect(await screen.findByText('2 in your Clique')).toBeTruthy()
    expect((await screen.findByTestId('clique-status')).textContent).toMatch(/Creator 2 was added/)
    fireEvent.click(myClique().getByRole('button', { name: 'Remove from Clique (Creator 1, you keep following them)' }))
    expect(await screen.findByText('1 in your Clique')).toBeTruthy()
    expect(fake.follows.has(fake.key('me', 'c1'))).toBe(true)
    expect(following().getByRole('button', { name: 'Unfollow Creator 1' })).toBeTruthy()
    expect((await screen.findByTestId('clique-status')).textContent).toMatch(/You still follow them/)
  })

  it('unfollowing removes the creator from Following and My Clique', async () => {
    const fake = setup(2, 1)
    renderApp('/app/clique', fake.api)
    fireEvent.click(await (await loaded()).findByRole('button', { name: 'Unfollow Creator 1 (also removes them from your Clique)' }))
    expect(await screen.findByText('0 in your Clique')).toBeTruthy()
    expect(screen.queryByText('Creator 1')).toBeNull()
    expect(innerOf(fake)).toEqual([])
  })

  it('the Clique has no limit (20261201000000): a 26th creator joins like any other', async () => {
    const fake = setup(27, 25)
    renderApp('/app/clique', fake.api)
    expect(await screen.findByText('25 in your Clique')).toBeTruthy()
    fireEvent.click(following().getByRole('button', { name: 'Join Clique (Creator 26)' }))
    expect(await screen.findByText('26 in your Clique')).toBeTruthy()
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(innerOf(fake)).toContain('me>c26')
  })

  it('muting hides a creator from Home only; the follow stays, and unmuting brings them back', async () => {
    const fake = setup(2, 0)
    fake.seedPost('c1', 'A post from Creator 1')
    fake.seedPost('c2', 'A post from Creator 2')
    renderApp('/app/clique', fake.api)
    fireEvent.click(await (await loaded()).findByRole('button', { name: 'Mute Creator 1 on your Home (you keep following them)' }))
    expect((await screen.findByTestId('clique-status')).textContent).toMatch(/Creator 1 is muted/)
    expect(await following().findByText('Muted on Home')).toBeTruthy()
    expect(fake.follows.has(fake.key('me', 'c1'))).toBe(true)
    expect((await fake.api.feed()).map((p) => p.body)).toEqual(['A post from Creator 2'])
    fireEvent.click(following().getByRole('button', { name: 'Unmute Creator 1' }))
    await waitFor(() => expect(following().queryByText('Muted on Home')).toBeNull())
    expect((await fake.api.feed()).map((p) => p.body).sort()).toEqual(['A post from Creator 1', 'A post from Creator 2'])
  })

  it('existing memberships show as they are', async () => {
    const fake = setup(11, 10, 11)
    renderApp('/app/clique', fake.api)
    expect(await screen.findByText('10 in your Clique')).toBeTruthy()
    expect(myClique().getAllByRole('listitem')).toHaveLength(10)
    expect(screen.getByText('11 creators')).toBeTruthy()
  })

  it('unfollowing elsewhere removes Clique membership too', async () => {
    const { api, follows, clique, key } = fakeApi()
    follows.add(key('me', 'c1'))
    clique.add(key('me', 'c1'))
    renderApp('/app/u/creator_1', api)
    fireEvent.click(await screen.findByRole('button', { name: 'Following (Creator 1, tap to unfollow)' }))
    expect(await screen.findByRole('button', { name: 'Follow Creator 1' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: /Clique/ })).toBeNull()
  })

  it('the Clique page shows My Clique first, then Following', async () => {
    const { api } = setup(3, 1)
    renderApp('/app/clique', api)
    await loaded()
    const headings = screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent)
    expect(headings).toEqual(['My Clique', 'Following'])
  })
})

describe('Discover, follow, add to Clique, read their posts', () => {
  it('Discover cards link to the profile and posts, and lead from a follow to the next steps', async () => {
    const { api, seedPost, clique, key } = fakeApi()
    seedPost('c1', 'First post from Creator 1')
    renderApp('/app/discover?face=creators', api)
    const card = within((await screen.findByRole('link', { name: 'Creator 1' })).closest('li')!)
    expect(card.getByRole('link', { name: 'See posts by Creator 1' }).getAttribute('href')).toBe('/app/u/creator_1#posts')
    expect(card.queryByRole('button', { name: 'Following (Creator 1, tap to unfollow)' })).toBeNull()

    fireEvent.click(card.getByRole('button', { name: 'Follow Creator 1' }))
    const confirmation = within(await card.findByTestId('follow-confirmation'))
    expect(confirmation.getByText(/You're following/).textContent).toMatch(/Creator 1\. Their new posts will appear on Home, newest first\./)
    expect(card.getByRole('button', { name: 'Following (Creator 1, tap to unfollow)' }).textContent?.trim()).toMatch(/^Following/)
    // One "Join Clique" only: the confirmation's.
    expect(card.getAllByRole('button', { name: 'Join Clique (Creator 1)' })).toHaveLength(1)
    expect(confirmation.getByRole('link', { name: 'See their posts' }).getAttribute('href')).toBe('/app/u/creator_1#posts')

    fireEvent.click(confirmation.getByRole('button', { name: 'Join Clique (Creator 1)' }))
    expect((await card.findByTestId('relationship-notice')).textContent).toBe('Added to your Clique!')
    expect(clique.has(key('me', 'c1'))).toBe(true)
    expect(card.getByRole('button', { name: 'In your Clique (Creator 1, tap to remove)' })).toBeTruthy()
    // The follow prompt is done once they're in the Clique.
    expect(card.queryByTestId('follow-confirmation')).toBeNull()
  })

  it('"See their posts" opens the profile at its posts', async () => {
    const { api, seedPost } = fakeApi()
    seedPost('c2', 'Something worth reading')
    renderApp('/app/discover?face=creators', api)
    fireEvent.click(await screen.findByRole('button', { name: 'Follow Creator 2' }))
    fireEvent.click(await screen.findByRole('link', { name: 'See their posts' }))
    expect(await screen.findByRole('heading', { name: 'Creator 2', level: 1 })).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'Posts' }).id).toBe('posts')
    expect(await screen.findByText('Something worth reading')).toBeTruthy()
  })

  it('without posts, there is no "See posts" link, and the profile says what happens when they post', async () => {
    const { api } = fakeApi()
    renderApp('/app/discover?face=creators', api)
    const card = within((await screen.findByRole('link', { name: 'Creator 3' })).closest('li')!)
    expect(card.queryByRole('link', { name: /posts/ })).toBeNull()
    fireEvent.click(card.getByRole('button', { name: 'Follow Creator 3' }))
    const confirmation = within(await card.findByTestId('follow-confirmation'))
    expect(confirmation.queryByRole('link', { name: 'See their posts' })).toBeNull()
    cleanup()
    renderApp('/app/u/creator_3', api)
    expect((await screen.findByText(/hasn't posted yet/)).textContent).toBe("Creator 3 hasn't posted yet. When they do, it will appear on your Home feed.")
    cleanup()
    renderApp('/app/u/creator_4', api)
    expect((await screen.findByText(/hasn't posted yet/)).textContent).toBe("Creator 4 hasn't posted yet. Follow them to see their posts on Home when they do.")
  })

  it('following from a profile offers the same next steps, with "See their posts" jumping to the posts below', async () => {
    const { api, seedPost } = fakeApi()
    seedPost('c5', 'Hello from five')
    renderApp('/app/u/creator_5', api)
    fireEvent.click(await screen.findByRole('button', { name: 'Follow Creator 5' }))
    const confirmation = within(await screen.findByTestId('follow-confirmation'))
    expect(confirmation.getByRole('link', { name: 'See their posts' }).getAttribute('href')).toBe('#posts')
    expect(confirmation.getByRole('button', { name: 'Join Clique (Creator 5)' })).toBeTruthy()
  })

  it('a follow from a profile records where it started (profile), and from Discover (discover)', async () => {
    const fake = fakeApi('me', { creators: 3 })
    renderApp('/app/u/creator_1', fake.api)
    fireEvent.click(await screen.findByRole('button', { name: 'Follow Creator 1' }))
    await screen.findByRole('button', { name: 'Following (Creator 1, tap to unfollow)' })
    expect(fake.followSources.get(fake.key('me', 'c1'))).toBe('profile')
    cleanup()
    renderApp('/app/discover?face=creators', fake.api)
    fireEvent.click(await screen.findByRole('button', { name: 'Follow Creator 2' }))
    await screen.findByRole('button', { name: 'Following (Creator 2, tap to unfollow)' })
    expect(fake.followSources.get(fake.key('me', 'c2'))).toBe('discover')
  })

  it('a profile shows Followers, Clique and Active Supporters, and a labelled Support button with the non-binding sheet', async () => {
    const fake = fakeApi('me', { creators: 2 })
    fake.follows.add(fake.key('me', 'c1'))
    renderApp('/app/u/creator_1', fake.api)
    const counts = await screen.findByTestId('profile-counts')
    expect(counts.textContent).toMatch(/Followers1/)
    expect(counts.textContent).toMatch(/Clique0/)
    expect(counts.textContent).toMatch(/Active Supporters0/)
    fireEvent.click(await screen.findByTestId('support-button'))
    const sheet = within(await screen.findByRole('dialog', { name: "Show Creator you'd support their work" }))
    expect(sheet.getByTestId('support-disclosure').textContent).toMatch(/Non-binding\. Nothing is charged, now or later\./)
    expect(sheet.getAllByRole('radio').map((r) => (r.closest('label') as HTMLElement).textContent)).toEqual([
      '$3 a month',
      '$5 a month',
      '$10 a month',
      'Not sure yet',
    ])
    const record = sheet.getByRole('button', { name: 'Record my support intent' }) as HTMLButtonElement
    expect(record.disabled).toBe(true)
    fireEvent.click(sheet.getByRole('radio', { name: '$5 a month' }))
    fireEvent.click(record)
    expect(await sheet.findByText(/Recorded: \$5 a month/)).toBeTruthy()
    // The confirmation stays on screen after the saved choice updates the button.
    await act(async () => {
      await new Promise((r) => setTimeout(r, 20))
    })
    expect(sheet.getByText(/Recorded: \$5 a month/)).toBeTruthy()
    expect(fake.supportIntents.get(fake.key('me', 'c1'))).toBe('usd_5')
    fireEvent.click(sheet.getByRole('button', { name: 'Withdraw my support intent' }))
    expect(await sheet.findByText('Your support intent was withdrawn.')).toBeTruthy()
    expect(fake.supportIntents.has(fake.key('me', 'c1'))).toBe(false)
  })

  it('your own profile tells your audience story: What happened, What it means, What to do next', async () => {
    const fake = fakeApi()
    fake.follows.add(fake.key('c1', 'me'))
    renderApp('/app/profile', fake.api)
    const card = within(await screen.findByTestId('audience-insight'))
    expect(card.getByText('What happened')).toBeTruthy()
    expect(card.getByText('1 new follower this week, 1 more than last week.')).toBeTruthy()
    expect(card.getByText('What it means')).toBeTruthy()
    expect(card.getByText('What to do next')).toBeTruthy()
    expect(card.getByText(/Share your first post this week/)).toBeTruthy()
  })

  it('a new member sees three first steps on Home; someone following quiet people sees a different message', async () => {
    const fake = fakeApi()
    renderApp('/app', fake.api)
    expect(await screen.findByText('Your feed is quiet')).toBeTruthy()
    const steps = screen.getAllByRole('listitem').map((li) => li.textContent)
    expect(steps.some((t) => /^1Find people/.test(t ?? ''))).toBe(true)
    expect(steps.some((t) => /^2Follow them/.test(t ?? ''))).toBe(true)
    expect(steps.some((t) => /^3Choose your Clique/.test(t ?? ''))).toBe(true)
    expect(screen.getByRole('link', { name: 'Discover people' }).getAttribute('href')).toBe('/app/discover')
    expect(screen.getByRole('link', { name: 'Your Clique' }).getAttribute('href')).toBe('/app/clique')
    cleanup()

    fake.follows.add(fake.key('me', 'c1'))
    renderApp('/app', fake.api)
    expect(await screen.findByText('Nothing new yet')).toBeTruthy()
    expect(screen.getByText(/You follow 1 person, and they haven't posted yet/)).toBeTruthy()
    expect(screen.queryByText('Your feed is quiet')).toBeNull()
  })

  it('Home is one feed: unseen Clique posts first, then everyone followed newest first, each once, with no tabs or section labels', async () => {
    const { api, seedPost, follows, clique, key } = fakeApi()
    follows.add(key('me', 'c1'))
    follows.add(key('me', 'c2'))
    clique.add(key('me', 'c2'))
    seedPost('c2', 'Older, from my Clique')
    seedPost('c1', 'Newer, from someone I follow')
    renderApp('/app', api)
    await screen.findByText('Newer, from someone I follow')
    expect(screen.queryAllByRole('tab')).toHaveLength(0)
    const bodies = () => screen.getAllByTestId('post').map((p) => p.textContent ?? '')
    await waitFor(() => expect(bodies()).toHaveLength(2))
    expect(bodies()[0]).toMatch(/Older, from my Clique/)
    expect(bodies()[1]).toMatch(/Newer, from someone I follow/)
    // The Clique is prioritized without being named in the feed.
    expect(screen.queryByRole('heading', { name: /New from your Clique|Everything else/ })).toBeNull()
    expect(screen.queryByText(/Clique first|Everything else, newest first/)).toBeNull()
  })

  it('a search with no matches offers to show everyone again', async () => {
    const { api } = fakeApi()
    renderApp('/app/discover?face=creators', api)
    await screen.findByRole('link', { name: 'Creator 1' })
    fireEvent.change(screen.getByLabelText('Search people, posts and topics'), { target: { value: 'zzz' } })
    fireEvent.click(screen.getByRole('button', { name: 'Search' }))
    expect(await screen.findByText('Nothing matches "zzz". Try a different name, username or word.')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Show everyone' }))
    expect(await screen.findByRole('link', { name: 'Creator 1' })).toBeTruthy()
    expect((screen.getByLabelText('Search people, posts and topics') as HTMLInputElement).value).toBe('')
  })
})

describe('Unseen-first Home', () => {
  // c1 and c2 in the Clique, c3 and c4 followed only, c5 not followed.
  function unseenSetup() {
    const fake = fakeApi('me', { creators: 6 })
    for (const c of ['c1', 'c2', 'c3', 'c4']) fake.follows.add(fake.key('me', c))
    fake.clique.add(fake.key('me', 'c1'))
    fake.clique.add(fake.key('me', 'c2'))
    return fake
  }
  const T = Date.parse('2026-11-18T09:00:00Z')

  it('the Clique row shows every Clique member, those with new posts first; others followed are not in it; the last tile edits the Clique', async () => {
    const fake = unseenSetup()
    for (let i = 0; i < 12; i++) fake.seedPost('c3', `c3 post ${i}`, T + i * 1000) // followed, not in the Clique
    fake.seedPost('c2', 'c2 post', T - 30_000) // Clique, unseen
    fake.seedPost('c5', 'not followed', T + 99_000)
    renderApp('/app', fake.api)
    const row = within(await screen.findByRole('region', { name: 'Your Clique' }))
    await row.findByRole('link', { name: 'Creator 2 has 1 new post' })
    const links = row.getAllByRole('link')
    // Named from what is visible (WCAG 2.5.3): no aria-label overriding the text.
    expect(links.map((l) => l.getAttribute('aria-label'))).toEqual([null, null, null])
    expect(links.map((l) => l.textContent)).toEqual([expect.stringMatching(/Creator 2/), expect.stringMatching(/Creator 1/), 'Edit Clique'])
    expect(row.getByRole('link', { name: 'Creator 1 has nothing new' })).toBe(links[1])
    expect(links.map((l) => l.getAttribute('data-unseen'))).toEqual(['true', 'false', null])
    expect(row.getAllByTestId('unseen-badge').map((b) => b.textContent)).toEqual(['1'])
    expect(links[0].getAttribute('href')).toBe('/app/catch-up/creator_2')
    expect(links[2].getAttribute('href')).toBe('/app/clique')
    expect(row.queryByText(/Creator 3/)).toBeNull()
    // The feed starts with the unseen Clique post, then everything else newest first, each once.
    const all = screen.getAllByTestId('post').map((p) => p.textContent ?? '')
    expect(all[0]).toMatch(/c2 post/)
    expect(all[1]).toMatch(/c3 post 11/)
    expect(all.filter((t) => /c2 post/.test(t))).toHaveLength(1)
  })

  it('with an empty Clique the row offers to add people, and posts from before a follow are not new', async () => {
    const fake = fakeApi('me', { creators: 3 })
    fake.seedPost('c1', 'Before the follow')
    await fake.api.follow('c1') // follows now: the earlier post is not unseen
    renderApp('/app', fake.api)
    await screen.findByText('Before the follow')
    const row = within(await screen.findByRole('region', { name: 'Your Clique' }))
    expect(row.getAllByRole('link').map((l) => l.textContent)).toEqual(['Add to Clique'])
  })

  it('catch-up shows the newest 20 unseen posts oldest first, then earlier ones on request, without repeats', async () => {
    const fake = unseenSetup()
    for (let i = 1; i <= 25; i++) fake.seedPost('c4', `Unseen ${String(i).padStart(2, '0')}`, T + i * 1000)
    renderApp('/app/catch-up/creator_4', fake.api)
    expect(await screen.findByRole('heading', { name: 'Catching up with Creator 4' })).toBeTruthy()
    await screen.findByText('Unseen 25')
    let bodies = screen.getAllByTestId('post').map((p) => p.textContent?.match(/Unseen \d{2}/)?.[0])
    expect(bodies).toEqual([...Array(20)].map((_, i) => `Unseen ${String(i + 6).padStart(2, '0')}`))
    // Earlier unseen posts remain, so the earlier posts aren't shown yet.
    expect(screen.queryByRole('heading', { name: 'Earlier from Creator 4' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Show earlier unseen posts' }))
    await screen.findByText('Unseen 01')
    bodies = screen.getAllByTestId('post').map((p) => p.textContent?.match(/Unseen \d{2}/)?.[0])
    expect(bodies).toEqual([...Array(25)].map((_, i) => `Unseen ${String(i + 1).padStart(2, '0')}`))
    expect(screen.queryByRole('button', { name: 'Show earlier unseen posts' })).toBeNull()
    // Then the member's earlier posts, without repeating the unseen ones (all 25 were unseen here).
    expect(await screen.findByRole('heading', { name: 'Earlier from Creator 4' })).toBeTruthy()
    expect(screen.getByText('No earlier posts.')).toBeTruthy()
  })

  it('with nothing new, catch-up says so and shows earlier posts; it asks you to follow if you do not', async () => {
    const fake = unseenSetup()
    fake.seedPost('c5', 'From someone I do not follow')
    fake.seedPost('c1', 'An earlier post', T - 3_600_000)
    for (const id of fake.posts.filter((p) => p.author === 'c1').map((p) => p.id)) fake.views.add(fake.key('me', id))
    renderApp('/app/catch-up/creator_1', fake.api)
    expect(await screen.findByText('Nothing new from Creator 1. Here are their earlier posts.')).toBeTruthy()
    expect(await screen.findByRole('heading', { name: 'Earlier from Creator 1' })).toBeTruthy()
    expect(await screen.findByText('An earlier post')).toBeTruthy()
    cleanup()
    renderApp('/app/catch-up/creator_5', fake.api)
    expect(await screen.findByText('Follow Creator 5 to catch up on their new posts.')).toBeTruthy()
  })

  describe('marking posts viewed', () => {
    type Observed = { el: Element; cb: IntersectionObserverCallback }
    let observed: Observed[] = []
    const original = globalThis.IntersectionObserver
    function installObserver() {
      observed = []
      class FakeObserver {
        constructor(private cb: IntersectionObserverCallback) {}
        observe(el: Element) {
          observed.push({ el, cb: this.cb })
        }
        unobserve(el: Element) {
          observed = observed.filter((o) => o.el !== el)
        }
        disconnect() {}
        takeRecords() {
          return []
        }
      }
      globalThis.IntersectionObserver = FakeObserver as unknown as typeof IntersectionObserver
    }
    function show(ratio: number) {
      for (const o of observed)
        o.cb([{ target: o.el, isIntersecting: ratio > 0, intersectionRatio: ratio } as IntersectionObserverEntry], {} as IntersectionObserver)
    }
    let visibility: DocumentVisibilityState = 'visible'
    function setVisibility(v: DocumentVisibilityState) {
      visibility = v
      document.dispatchEvent(new Event('visibilitychange'))
    }
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => visibility })
    afterEach(() => {
      globalThis.IntersectionObserver = original
      visibility = 'visible'
      vi.useRealTimers()
    })

    it('time in a background tab or with the phone locked never counts; on return the full 2 seconds start again', async () => {
      installObserver()
      const fake = unseenSetup()
      fake.seedPost('c3', 'Read me', T + 1000)
      renderApp('/app', fake.api)
      await screen.findByText('Read me')
      await screen.findByRole('region', { name: 'Your Clique' })
      expect(observed).toHaveLength(1)
      vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
      act(() => show(0.8))
      await act(async () => vi.advanceTimersByTime(1500))
      act(() => setVisibility('hidden')) // tab switched or phone locked after 1.5 s
      await act(async () => vi.advanceTimersByTime(60_000))
      expect(fake.marks).toHaveLength(0)
      // Visibility changes while hidden are noted but start nothing.
      act(() => show(0.9))
      await act(async () => vi.advanceTimersByTime(60_000))
      expect(fake.marks).toHaveLength(0)
      act(() => setVisibility('visible')) // back, and the post is still on screen
      await act(async () => vi.advanceTimersByTime(1999 + 5000))
      expect(fake.marks).toHaveLength(0) // the 1.5 s before hiding didn't carry over
      await act(async () => vi.advanceTimersByTime(1))
      await act(async () => vi.advanceTimersByTime(5000))
      expect(fake.marks).toHaveLength(1)
      expect(fake.marks[0].ids).toEqual(['p001'])
    })

    it('a post scrolled away while hidden does not count when the page comes back', async () => {
      installObserver()
      const fake = unseenSetup()
      fake.seedPost('c3', 'Gone while hidden', T + 1000)
      renderApp('/app', fake.api)
      await screen.findByText('Gone while hidden')
      await screen.findByRole('region', { name: 'Your Clique' })
      vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
      act(() => show(0.8))
      act(() => setVisibility('hidden'))
      act(() => show(0.2))
      act(() => setVisibility('visible'))
      await act(async () => vi.advanceTimersByTime(30_000))
      expect(fake.marks).toHaveLength(0)
    })

    it('posts at least half on screen for 2 seconds are recorded in one batch; own posts never; the Clique row refreshes', async () => {
      installObserver()
      const fake = unseenSetup()
      fake.seedPost('c1', 'One', T + 1000)
      fake.seedPost('c1', 'Two', T + 2000)
      fake.seedPost('me', 'My own post', T + 3000)
      renderApp('/app', fake.api)
      const row = within(await screen.findByRole('region', { name: 'Your Clique' }))
      expect((await row.findByRole('link', { name: 'Creator 1 has 2 new posts' })).getAttribute('data-unseen')).toBe('true')
      expect(observed).toHaveLength(2) // own post is not watched
      vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
      act(() => show(0.4))
      await act(async () => vi.advanceTimersByTime(10_000))
      expect(fake.marks).toHaveLength(0) // under half: never counts
      act(() => show(0.6))
      await act(async () => vi.advanceTimersByTime(1999))
      act(() => show(0.3)) // scrolled away just before 2 s: resets
      await act(async () => vi.advanceTimersByTime(10_000))
      expect(fake.marks).toHaveLength(0)
      act(() => show(0.6))
      await act(async () => vi.advanceTimersByTime(2000 + 5000)) // 2 continuous seconds, then the 5 s batch wait
      expect(fake.marks).toHaveLength(1) // one request for both
      expect(fake.marks[0].basis).toBe('visible')
      expect([...fake.marks[0].ids].sort()).toEqual(['p001', 'p002'])
      await act(async () => vi.advanceTimersByTime(2500)) // the row refreshes shortly after
      vi.useRealTimers()
      await waitFor(() => expect(row.getByRole('link', { name: 'Creator 1 has nothing new' }).getAttribute('data-unseen')).toBe('false'))
      expect(fake.views.size).toBe(2)
    })
  })
})

// Members see two relationships only: Following and My Clique. "Inner Clique"
// was the earlier name and must never reach member-facing copy again.
describe('member-facing copy never says "Inner Clique"', () => {
  const OLD = /inner\s*clique/i
  // Visible text plus everything assistive technology reads.
  function shownCopy() {
    const attrs = [...document.querySelectorAll('[aria-label], [title], [placeholder], [alt]')].flatMap((el) =>
      ['aria-label', 'title', 'placeholder', 'alt'].map((n) => el.getAttribute(n) ?? ''),
    )
    return [document.body.textContent ?? '', ...attrs].join('\n')
  }

  it('on every member page, including the full-Clique dialog, status messages and errors', async () => {
    const fake = fakeApi('me', { creators: 30 })
    for (let i = 1; i <= 27; i++) fake.follows.add(fake.key('me', `c${i}`))
    for (let i = 1; i <= 25; i++) fake.clique.add(fake.key('me', `c${i}`))
    fake.seedPost('c1', 'A post from someone in my Clique')
    for (const path of ['/app', '/app/discover?face=creators', '/app/profile', '/app/u/creator_1', '/app/u/creator_26']) {
      renderApp(path, fake.api)
      await waitFor(() => expect(document.body.textContent).not.toMatch(/Loading|Checking/))
      expect(shownCopy()).not.toMatch(OLD)
      cleanup()
    }
    // The badge on a Clique creator's post reads "Clique".
    renderApp('/app', fake.api)
    expect(within(await screen.findByTestId('post')).getByText('Clique')).toBeTruthy()
    cleanup()

    // The Clique page, joining with no limit, mute, and the Support sheet.
    renderApp('/app/clique', fake.api)
    const followingList = within(await screen.findByRole('region', { name: 'Following' }))
    expect(shownCopy()).not.toMatch(OLD)
    fireEvent.click(followingList.getByRole('button', { name: 'Join Clique (Creator 26)' }))
    expect((await screen.findByTestId('clique-status')).textContent).toBe('Creator 26 was added to your Clique.')
    fireEvent.click(followingList.getByRole('button', { name: 'Mute Creator 27 on your Home (you keep following them)' }))
    expect((await screen.findByTestId('clique-status')).textContent).toMatch(/Creator 27 is muted/)
    expect(shownCopy()).not.toMatch(OLD)
    cleanup()
    renderApp('/app/u/creator_1', fake.api)
    fireEvent.click(await screen.findByTestId('support-button'))
    await screen.findByTestId('support-sheet')
    expect(shownCopy()).not.toMatch(OLD)
  })

  it('in every error message', () => {
    for (const code of ['cannot_add_self', 'not_following', 'clique_full', 'not_in_clique', 'already_in_clique', 'rate_limited', 'not_found', 'unknown']) {
      const text = messageFor(new AppApiError(code))
      expect(text, code).not.toMatch(OLD)
    }
    expect(messageFor(new AppApiError('not_following'))).toBe('Follow this creator first. Your Clique only includes people you follow.')
  })

  it('anywhere in the member app source (tests excepted)', () => {
    const dir = join(process.cwd(), 'src/app')
    const files = readdirSync(dir).filter((f) => /\.(ts|tsx)$/.test(f) && !/\.test\./.test(f))
    expect(files.length).toBeGreaterThan(3)
    for (const f of files) expect(readFileSync(join(dir, f), 'utf8'), f).not.toMatch(OLD)
  })
})

describe('posts, comments and profiles', () => {
  it('a post page lists comments, adds yours, and lets you delete only your own', async () => {
    const { api, seedPost } = fakeApi()
    const id = seedPost('c1', 'Discuss this')
    renderApp(`/app/post/${id}`, api)
    expect(await screen.findByText('No comments yet.')).toBeTruthy()
    fireEvent.change(screen.getByLabelText('Write a comment'), { target: { value: 'Great point, thank you.' } })
    fireEvent.click(screen.getByRole('button', { name: 'Comment' }))
    expect(await screen.findByText('Great point, thank you.')).toBeTruthy()
    expect(screen.getByText((_, el) => el?.tagName === 'SPAN' && el.textContent === '1 comment' && el.querySelector('svg') !== null)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Delete comment' }))
    await waitFor(() => expect(screen.queryByText('Great point, thank you.')).toBeNull())
  })

  it('a comment retried after a lost answer is stored once', async () => {
    const { api, seedPost } = fakeApi()
    const id = seedPost('c1', 'Discuss this')
    const ids: string[] = []
    const addComment = api.addComment.bind(api)
    let loseNext = true
    api.addComment = async (postId, body, requestId) => {
      ids.push(requestId ?? 'none')
      const cid = await addComment(postId, body, requestId)
      if (loseNext) {
        loseNext = false
        throw new AppApiError('network')
      }
      return cid
    }
    renderApp(`/app/post/${id}`, api)
    await screen.findByText('No comments yet.')
    fireEvent.change(screen.getByLabelText('Write a comment'), { target: { value: 'Worth saying once.' } })
    fireEvent.click(screen.getByRole('button', { name: 'Comment' }))
    await screen.findByText("We couldn't reach Splitpost. Check your connection and try again.")
    fireEvent.click(screen.getByRole('button', { name: 'Comment' }))
    await waitFor(() => expect(ids).toHaveLength(2))
    expect(ids[1]).toBe(ids[0])
    expect(await screen.findByText((_, el) => el?.tagName === 'SPAN' && el.textContent === '1 comment' && el.querySelector('svg') !== null)).toBeTruthy()
  })

  it('a missing post or member says so plainly', async () => {
    const { api } = fakeApi()
    renderApp('/app/post/nope', api)
    expect(await screen.findByText("This post isn't available")).toBeTruthy()
    cleanup()
    renderApp('/app/u/nobody_here', api)
    expect(await screen.findByText("This member isn't available")).toBeTruthy()
  })

  it('member pages show public counts; your own page offers editing instead of follow buttons', async () => {
    const { api, seedPost } = fakeApi()
    seedPost('c2', 'Creator 2 writes')
    renderApp('/app/u/creator_2', api)
    expect(await screen.findByRole('heading', { name: 'Creator 2' })).toBeTruthy()
    expect(screen.getByText('@creator_2')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Follow Creator 2' })).toBeTruthy()
    cleanup()
    renderApp('/app/u/mia', api)
    expect(await screen.findByRole('link', { name: 'Edit your profile' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: /^Follow/ })).toBeNull()
  })

  it('profile edits are saved', async () => {
    const { api } = fakeApi()
    renderApp('/app/profile', api)
    const name = await screen.findByLabelText('Display name')
    fireEvent.change(name, { target: { value: 'Mia Chen' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }))
    expect(await screen.findByText('Saved.')).toBeTruthy()
    expect((await api.ownProfile())?.displayName).toBe('Mia Chen')
  })
})

describe('adult confirmation and My Split (foundation v2)', () => {
  it('a member without an 18+ confirmation sees only the confirmation, which needs the box ticked', async () => {
    const { api, access } = fakeApi()
    access.status = 'attestation_required'
    renderApp('/app', api)
    expect(await screen.findByRole('heading', { name: 'One quick check' })).toBeTruthy()
    expect(screen.queryByRole('navigation', { name: 'Main' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }))
    expect(await screen.findByText('Please confirm that you are 18 or older to continue.')).toBeTruthy()
    expect(access.status).toBe('attestation_required')
    fireEvent.click(screen.getByLabelText('I confirm that I am 18 or older.'))
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }))
    expect(await screen.findByRole('heading', { name: 'Home' })).toBeTruthy()
    expect(access.status).toBe('active')
  })

  it('My Split has Overview, History and Opportunities; the simulated disclosure is always shown', async () => {
    const { api } = fakeApi()
    renderApp('/app/split', api)
    expect(await screen.findByRole('heading', { name: 'My Split' })).toBeTruthy()
    expect(screen.getAllByRole('tab').map((t) => t.textContent)).toEqual(['Overview', 'History', 'Opportunities'])
    expect(screen.getByTestId('split-disclosure').textContent).toMatch(/simulated.*no cash value.*nothing is paid out/i)
    // No balances or amounts are shown before Connection Points exist.
    expect(screen.getByRole('tabpanel').textContent).not.toMatch(/\$\d|\d+ points/)
  })

  it("Opportunities shows the member's personal referral link", async () => {
    const { api } = fakeApi()
    renderApp('/app/split?face=opportunities', api)
    expect((await screen.findByTestId('referral-link')).textContent).toBe(`${window.location.origin}/register/0123456789abcdef`)
    expect(screen.getByRole('button', { name: 'Copy link' })).toBeTruthy()
  })
})

describe('the members area', () => {
  it('has the main navigation and a way to reach the account page', async () => {
    const { api } = fakeApi()
    renderApp('/app', api)
    await screen.findByRole('heading', { name: 'Home' })
    const nav = screen.getAllByRole('navigation', { name: 'Main' })[0]
    // Five destinations (SP-SCOPE-001): Clique management moved into Home.
    for (const label of ['Home', 'Discover', 'Create', 'My Split', 'Profile']) expect(within(nav).getByTitle(label)).toBeTruthy()
    expect(within(nav).queryByTitle('Clique')).toBeNull()
    expect(screen.getAllByRole('link', { name: 'Your account' })[0].getAttribute('href')).toBe('/app/account')
  })

  it('never mentions Connection Points, rewards or money in Release 1', async () => {
    const { api, seedPost, follows, key } = fakeApi()
    seedPost('c1', 'Hello')
    follows.add(key('me', 'c1'))
    for (const path of ['/app', '/app/discover?face=creators', '/app/clique', '/app/profile']) {
      renderApp(path, api)
      await waitFor(() => expect(screen.queryByRole('status')).toBeNull())
      expect(document.body.textContent).not.toMatch(/Connection Points|\bCP\b|reward|cash|\$/i)
      cleanup()
    }
  })
})

describe('feedback (Build 5.2c)', () => {
  const sendLinks = () => screen.getAllByRole('link', { name: 'Send feedback' })

  it('names the part of the app from a fixed list, never the address, a post or a person', () => {
    expect(featureFor('/app')).toBe('home')
    expect(featureFor('/app/')).toBe('home')
    expect(featureFor('/app/discover')).toBe('discover')
    expect(featureFor('/app/profile')).toBe('profile')
    expect(featureFor('/app/u/someone')).toBe('profile')
    expect(featureFor('/app/clique')).toBe('clique')
    expect(featureFor('/app/post/1234-abcd')).toBe('post')
    expect(featureFor('/app/new')).toBe('create')
    expect(featureFor('/app/catch-up/someone')).toBe('catch_up')
    expect(featureFor('/app/moderation/abc')).toBe('other')
    expect(featureFor('/app/account')).toBe('other')
    expect(featureFor('/app/feedback')).toBeNull()
    expect(featureFor('/app/feedback/inbox/x')).toBeNull()
  })

  it('Send feedback is in the phone header and the sidebar, and the form says where it came from', async () => {
    const f = fakeApi()
    renderApp('/app/discover?face=creators', f.api)
    await waitFor(() => expect(sendLinks()).toHaveLength(2))
    fireEvent.click(sendLinks()[0])
    expect(await screen.findByRole('heading', { name: 'Help us improve Splitpost' })).toBeTruthy()
    expect(screen.getByText('Your feedback helps us build a better experience for creators and fans.')).toBeTruthy()
    expect((await screen.findByText(/^Sent from:/)).textContent?.replace(/\s+/g, ' ')).toBe(
      'Sent from: Discover. We record which part of Splitpost you were using, along with your name and pilot role, to help us understand your feedback.',
    )
    // No promise of a personal reply (not part of this build).
    expect(document.body.textContent).not.toMatch(/follow up|get back to you|reply to you|respond to you/i)
    for (const label of ['Report a problem', 'Suggest an improvement', 'Share something I like'])
      expect(screen.getByRole('radio', { name: label })).toBeTruthy()
    // The founder's inbox link is only for the founder.
    expect(screen.queryByRole('link', { name: 'Open the feedback inbox' })).toBeNull()
  })

  it('validates before sending, sends once, and shows the approved confirmation', async () => {
    const f = fakeApi()
    renderApp('/app', f.api)
    await waitFor(() => expect(sendLinks()).toHaveLength(2))
    fireEvent.click(sendLinks()[1])
    await screen.findByRole('heading', { name: 'Help us improve Splitpost' })
    const submit = screen.getByRole('button', { name: 'Submit feedback' })
    fireEvent.click(submit)
    expect((await screen.findByRole('alert')).textContent).toBe('Choose what kind of feedback this is.')
    fireEvent.click(screen.getByRole('radio', { name: 'Report a problem' }))
    const box = screen.getByRole('textbox', { name: 'Tell us more' }) as HTMLTextAreaElement
    expect(box.placeholder).toMatch(/What happened, and what did you expect/)
    fireEvent.change(box, { target: { value: '  too short ' } })
    fireEvent.click(submit)
    expect((await screen.findByRole('alert')).textContent).toBe('Please write at least 10 characters.')
    expect(f.feedbackCalls).toHaveLength(0)
    fireEvent.change(box, { target: { value: 'x'.repeat(1001) } })
    fireEvent.click(submit)
    expect((await screen.findByRole('alert')).textContent).toMatch(/1,000 characters/)
    fireEvent.click(screen.getByRole('radio', { name: 'Share something I like' }))
    expect(box.placeholder).toMatch(/working well/)
    fireEvent.change(box, { target: { value: '  Catch up makes it easy to see what I missed.  ' } })
    fireEvent.click(submit)
    fireEvent.click(submit)
    expect(await screen.findByText('Thanks for sharing! Your feedback has been received.')).toBeTruthy()
    expect(f.feedbackCalls).toHaveLength(1)
    expect(f.feedbackCalls[0]).toMatchObject({ category: 'praise', feature: 'home', body: 'Catch up makes it easy to see what I missed.' })
    expect(f.feedback).toHaveLength(1)
  })

  it('a retry after a failed send reuses the same request id (stored once); the next message gets a new one', async () => {
    const f = fakeApi()
    f.failures.sendFeedback = new AppApiError('network')
    renderApp('/app/clique', f.api)
    await waitFor(() => expect(sendLinks()).toHaveLength(2))
    fireEvent.click(sendLinks()[0])
    await screen.findByRole('heading', { name: 'Help us improve Splitpost' })
    fireEvent.click(screen.getByRole('radio', { name: 'Suggest an improvement' }))
    fireEvent.change(screen.getByRole('textbox', { name: 'Tell us more' }), { target: { value: 'Let me reorder the people in my Clique.' } })
    fireEvent.click(screen.getByRole('button', { name: 'Submit feedback' }))
    expect((await screen.findByRole('alert')).textContent).toMatch(/couldn't reach Splitpost/)
    delete f.failures.sendFeedback
    fireEvent.click(screen.getByRole('button', { name: 'Submit feedback' }))
    await screen.findByText('Thanks for sharing! Your feedback has been received.')
    expect(f.feedbackCalls.map((c) => c.feature)).toEqual(['clique', 'clique'])
    expect(f.feedbackCalls[1].requestId).toBe(f.feedbackCalls[0].requestId)
    fireEvent.click(screen.getByRole('button', { name: 'Send more feedback' }))
    fireEvent.click(screen.getByRole('radio', { name: 'Report a problem' }))
    fireEvent.change(screen.getByRole('textbox', { name: 'Tell us more' }), { target: { value: 'A different message entirely.' } })
    fireEvent.click(screen.getByRole('button', { name: 'Submit feedback' }))
    await screen.findByText('Thanks for sharing! Your feedback has been received.')
    expect(f.feedbackCalls[2].requestId).not.toBe(f.feedbackCalls[0].requestId)
    expect(f.feedback).toHaveLength(2)
  })

  it("the server's limits are explained plainly (rate limit)", async () => {
    const f = fakeApi()
    f.failures.sendFeedback = new AppApiError('rate_limited')
    renderApp('/app', f.api)
    await waitFor(() => expect(sendLinks()).toHaveLength(2))
    fireEvent.click(sendLinks()[0])
    await screen.findByRole('heading', { name: 'Help us improve Splitpost' })
    fireEvent.click(screen.getByRole('radio', { name: 'Report a problem' }))
    fireEvent.change(screen.getByRole('textbox', { name: 'Tell us more' }), { target: { value: 'Something broke on Home today.' } })
    fireEvent.click(screen.getByRole('button', { name: 'Submit feedback' }))
    expect((await screen.findByRole('alert')).textContent).toMatch(/going a little fast/)
  })

  it('opened directly (no link), the form records "other"; the inbox is closed to members', async () => {
    const f = fakeApi()
    renderApp('/app/feedback', f.api)
    await screen.findByRole('heading', { name: 'Help us improve Splitpost' })
    expect((await screen.findByText(/^Sent from:/)).textContent).toMatch(/^Sent from: Another page\./)
    cleanup()
    renderApp('/app/feedback/inbox', f.api)
    expect(await screen.findByRole('heading', { name: "This page isn't available" })).toBeTruthy()
    cleanup()
    renderApp('/app/feedback/inbox/fb1', f.api)
    expect(await screen.findByRole('heading', { name: "This page isn't available" })).toBeTruthy()
  })

  it("on a database without feedback, there is no entry point and the page says it isn't available", async () => {
    const f = fakeApi('me', { feedback: 'absent' })
    renderApp('/app', f.api)
    await screen.findByRole('heading', { name: 'Home' })
    await act(async () => {})
    expect(screen.queryByRole('link', { name: 'Send feedback' })).toBeNull()
    cleanup()
    renderApp('/app/feedback', f.api)
    expect(await screen.findByText("This isn't available yet. Please try again later.")).toBeTruthy()
  })

  it('the founder reviews the inbox: newest first, filters, status changes and private notes', async () => {
    const f = fakeApi('me', { founder: true })
    await f.api.sendFeedback({ category: 'problem', feature: 'home', body: 'The feed did not refresh after posting.' }, 'r1')
    await f.api.sendFeedback({ category: 'praise', feature: 'discover', body: 'I love browsing by interest here.' }, 'r2')
    renderApp('/app/feedback', f.api)
    fireEvent.click(await screen.findByRole('link', { name: 'Open the feedback inbox' }))
    const list = await screen.findByRole('list', { name: 'Feedback, newest first' })
    const items = within(list).getAllByRole('listitem')
    expect(items[0].textContent).toMatch(/I love browsing/)
    expect(items[1].textContent).toMatch(/did not refresh/)
    expect(items[1].textContent).toMatch(/Mia \(@mia\) · Tester · Home/)
    fireEvent.change(screen.getByRole('combobox', { name: 'Category' }), { target: { value: 'problem' } })
    await waitFor(() => expect(within(screen.getByRole('list', { name: 'Feedback, newest first' })).getAllByRole('listitem')).toHaveLength(1))
    fireEvent.change(screen.getByRole('combobox', { name: 'Status' }), { target: { value: 'closed' } })
    expect(await screen.findByRole('heading', { name: 'Nothing matches these filters' })).toBeTruthy()
    fireEvent.change(screen.getByRole('combobox', { name: 'Status' }), { target: { value: '' } })
    fireEvent.click(await screen.findByRole('link', { name: /did not refresh/ }))
    await screen.findByRole('heading', { name: 'Problem' })
    expect(screen.getByText('Role when sent').nextSibling?.textContent).toBe('Tester')
    fireEvent.change(screen.getByRole('combobox', { name: 'Status' }), { target: { value: 'planned' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save status' }))
    expect(await screen.findByText('Status changed to Planned.')).toBeTruthy()
    expect(f.feedback.find((x) => x.body.startsWith('The feed'))!.status).toBe('planned')
    fireEvent.click(screen.getByRole('button', { name: 'Add note' }))
    expect((await screen.findByRole('alert')).textContent).toBe('Write a note first.')
    fireEvent.change(screen.getByRole('textbox', { name: 'Add a note' }), { target: { value: 'Reproduced on iPhone.' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add note' }))
    expect(await screen.findByText('Reproduced on iPhone.')).toBeTruthy()
    expect(screen.getByText(/Status New to Planned by Mia/)).toBeTruthy()
    expect(screen.getByText(/Note added by Mia/)).toBeTruthy()
  })
})

describe('photo posts (Build 5.3)', () => {
  const choose = (name = 'IMG_0001.HEIC') =>
    fireEvent.change(screen.getByTestId('photo-input'), {
      target: { files: [new File(['x'], name, { type: name.endsWith('.txt') ? 'text/plain' : 'image/heic' })] },
    })

  it('sizes photos to at most 1600 px on the longest edge, never upscaling', () => {
    expect(fitWithin(4032, 3024)).toEqual({ width: 1600, height: 1200 })
    expect(fitWithin(3024, 4032)).toEqual({ width: 1200, height: 1600 })
    expect(fitWithin(800, 600)).toEqual({ width: 800, height: 600 })
  })

  it('with photos off, posting is text only, exactly as before', async () => {
    const f = fakeApi()
    renderApp('/app/new', f.api)
    await screen.findByRole('heading', { name: 'Create a post' })
    await act(async () => {})
    expect(screen.queryByRole('button', { name: 'Add photo' })).toBeNull()
    fireEvent.change(screen.getByRole('textbox', { name: 'Write a post' }), { target: { value: 'Words only' } })
    fireEvent.click(screen.getByRole('button', { name: 'Post' }))
    expect(await screen.findByText('Words only')).toBeTruthy()
    expect(f.photo.calls).toEqual([])
  })

  it('posts a photo with no caption: one upload, one post, with an accessible fallback name', async () => {
    const f = fakeApi('me', { photos: true })
    renderApp('/app/new', f.api)
    fireEvent.click(await screen.findByRole('button', { name: 'Add photo' }))
    choose()
    expect(await screen.findByRole('img', { name: "The photo you're adding" })).toBeTruthy()
    expect(screen.getByRole('textbox', { name: 'Write a post' }).getAttribute('placeholder')).toBe('Add a caption (optional)')
    const post = screen.getByRole('button', { name: 'Post' })
    expect(post.hasAttribute('disabled')).toBe(false)
    fireEvent.click(post)
    fireEvent.click(post)
    const photo = await screen.findByRole('img', { name: /^Photo by / })
    expect(photo.getAttribute('src')).toMatch(/-feed\.jpg$/)
    expect(f.photo.calls.filter((c) => c === 'upload')).toHaveLength(1)
    expect(f.photo.calls.filter((c) => c.startsWith('publish'))).toHaveLength(1)
    const mine = f.posts.find((p) => p.media)!
    expect(mine.body).toBe('')
    // No description is asked for or sent.
    expect(mine.media?.description).toBeNull()
    // No empty caption paragraph.
    const card = screen.getByTestId('post')
    expect(within(card).queryByText((_, el) => el?.tagName === 'P' && el.textContent === '')).toBeNull()
  })

  it('with a photo: the preview, then Change photo and Remove photo, then one caption field, then Post; no other inputs', async () => {
    const f = fakeApi('me', { photos: true })
    renderApp('/app/new', f.api)
    fireEvent.click(await screen.findByRole('button', { name: 'Add photo' }))
    choose()
    const preview = await screen.findByRole('img', { name: "The photo you're adding" })
    const change = screen.getByRole('button', { name: 'Change photo' })
    const remove = screen.getByRole('button', { name: 'Remove photo' })
    const caption = screen.getByRole('textbox', { name: 'Write a post' })
    const post = screen.getByRole('button', { name: 'Post' })
    const form = caption.closest('form')!
    // One writing field only: no description, alt text or tags.
    expect(within(form).getAllByRole('textbox')).toEqual([caption])
    expect(within(form).queryByLabelText(/description|alt text|tag/i)).toBeNull()
    // Add photo becomes Change photo; it isn't shown twice.
    expect(within(form).queryByRole('button', { name: 'Add photo' })).toBeNull()
    // Reading and keyboard (Tab) order: preview, Change photo, Remove photo, caption, Post.
    const order = [preview, change, remove, caption, post]
    for (let i = 1; i < order.length; i++) {
      expect(order[i - 1].compareDocumentPosition(order[i]) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    }
    // The pilot keeps no separate copy of media, so the creator is told to keep the original.
    expect(within(form).getByTestId('media-backup-note').textContent).toMatch(/Keep your original\. During the pilot, Splitpost does not keep a separate backup of photos and videos\./)
    // Native buttons (keyboard operable), at least 44 px tall for touch.
    for (const b of [change, remove]) {
      expect(b.tagName).toBe('BUTTON')
      expect(b.getAttribute('type')).toBe('button')
      expect(b.className).toMatch(/\bh-11\b/)
    }
  })

  it('changing or removing the photo keeps the caption', async () => {
    const f = fakeApi('me', { photos: true })
    renderApp('/app/new', f.api)
    fireEvent.click(await screen.findByRole('button', { name: 'Add photo' }))
    choose()
    await screen.findByRole('img', { name: "The photo you're adding" })
    const caption = screen.getByRole('textbox', { name: 'Write a post' }) as HTMLTextAreaElement
    fireEvent.change(caption, { target: { value: 'Morning at the canal' } })
    fireEvent.click(screen.getByRole('button', { name: 'Change photo' }))
    choose('IMG_0002.HEIC')
    await screen.findByRole('img', { name: "The photo you're adding" })
    expect((screen.getByRole('textbox', { name: 'Write a post' }) as HTMLTextAreaElement).value).toBe('Morning at the canal')
    fireEvent.click(screen.getByRole('button', { name: 'Remove photo' }))
    await waitFor(() => expect(screen.queryByRole('img', { name: "The photo you're adding" })).toBeNull())
    const after = screen.getByRole('textbox', { name: 'Write a post' }) as HTMLTextAreaElement
    expect(after.value).toBe('Morning at the canal')
    // The same field throughout (nothing remounted), back to the text composer.
    expect(after).toBe(caption)
    expect(after.getAttribute('placeholder')).not.toBe('Add a caption (optional)')
    expect(screen.getByRole('button', { name: 'Add photo' })).toBeTruthy()
    // It still posts as text only.
    fireEvent.click(screen.getByRole('button', { name: 'Post' }))
    expect(await screen.findByText('Morning at the canal')).toBeTruthy()
    expect(f.photo.calls.filter((c) => c === 'upload')).toHaveLength(0)
  })

  it('a saved photo description is the image alt text only, never a visible second caption', async () => {
    const f = fakeApi()
    f.follows.add(f.key('me', 'c1'))
    const id = f.seedPost('c1', 'The caption')
    f.posts.find((p) => p.id === id)!.media = { kind: 'photo', width: 1600, height: 1067, description: 'A red bicycle by a canal' }
    renderApp('/app', f.api)
    expect(await screen.findByRole('img', { name: 'A red bicycle by a canal' })).toBeTruthy()
    const card = screen.getByTestId('post')
    expect(within(card).getByText('The caption')).toBeTruthy()
    expect(within(card).queryByText('A red bicycle by a canal')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Open the photo: A red bicycle by a canal' }))
    const dialog = await screen.findByRole('dialog', { name: 'Photo' })
    expect(within(dialog).getByRole('img', { name: 'A red bicycle by a canal' })).toBeTruthy()
    expect(within(dialog).queryByText('A red bicycle by a canal')).toBeNull()
    expect(dialog.querySelector('figcaption')).toBeNull()
  })

  it('a failed publish is retried with the same upload and request id (posted once)', async () => {
    const f = fakeApi('me', { photos: true })
    f.failures.createPhotoPost = new AppApiError('network')
    renderApp('/app/new', f.api)
    fireEvent.click(await screen.findByRole('button', { name: 'Add photo' }))
    choose()
    await screen.findByRole('img', { name: "The photo you're adding" })
    fireEvent.change(screen.getByRole('textbox', { name: 'Write a post' }), { target: { value: 'Sunset' } })
    fireEvent.click(screen.getByRole('button', { name: 'Post' }))
    expect((await screen.findByRole('alert')).textContent).toMatch(/couldn't reach Splitpost/)
    delete f.failures.createPhotoPost
    fireEvent.click(screen.getByRole('button', { name: 'Post' }))
    expect(await screen.findByText('Sunset')).toBeTruthy()
    const publishes = f.photo.calls.filter((c) => c.startsWith('publish'))
    expect(f.photo.calls.filter((c) => c === 'upload')).toHaveLength(1)
    expect(publishes).toHaveLength(2)
    expect(publishes[0]).toBe(publishes[1])
    expect(f.posts.filter((p) => p.media)).toHaveLength(1)
  })

  it('a failed upload says so plainly, and a retry uploads again', async () => {
    const f = fakeApi('me', { photos: true })
    f.failures.uploadPhoto = new AppApiError('photo_upload_failed')
    renderApp('/app/new', f.api)
    fireEvent.click(await screen.findByRole('button', { name: 'Add photo' }))
    choose()
    await screen.findByRole('img', { name: "The photo you're adding" })
    fireEvent.click(screen.getByRole('button', { name: 'Post' }))
    expect((await screen.findByRole('alert')).textContent).toBe("We couldn't upload your photo right now. Please try again.")
    delete f.failures.uploadPhoto
    fireEvent.click(screen.getByRole('button', { name: 'Post' }))
    await waitFor(() => expect(f.posts.filter((p) => p.media)).toHaveLength(1))
    expect(f.photo.calls.filter((c) => c === 'upload')).toHaveLength(2)
  })

  it('a file that is not a photo is refused before anything is sent', async () => {
    const f = fakeApi('me', { photos: true })
    renderApp('/app/new', f.api)
    fireEvent.click(await screen.findByRole('button', { name: 'Add photo' }))
    choose('notes.txt')
    expect((await screen.findByRole('alert')).textContent).toMatch(/Please choose a photo/)
    expect(f.photo.calls).toEqual([])
  })

  it('shows a photo in the feed, opens the full photo, and recovers from a failed link', async () => {
    const f = fakeApi()
    f.follows.add(f.key('me', 'c1'))
    const id = f.seedPost('c1', '')
    f.posts.find((p) => p.id === id)!.media = { kind: 'photo', width: 900, height: 1600, description: null }
    let fail = 1
    const links = f.photo.links
    f.photo.links = (x) => (fail-- > 0 ? null : links(x))
    renderApp('/app', f.api)
    expect(await screen.findByText("This photo couldn't load.")).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    const img = await screen.findByRole('img', { name: 'Photo by Creator 1' })
    // A tall photo is shown at 4:5 in the feed.
    expect((screen.getByTestId('post-photo') as HTMLElement).style.aspectRatio).toBe(String(4 / 5))
    // An expired link: one fresh fetch.
    const before = f.photo.linkCalls.length
    fireEvent.error(img)
    await waitFor(() => expect(f.photo.linkCalls.length).toBe(before + 1))
    fireEvent.click(await screen.findByRole('button', { name: 'Open the photo: Photo by Creator 1' }))
    const dialog = await screen.findByRole('dialog', { name: 'Photo' })
    expect(within(dialog).getByRole('img', { name: 'Photo by Creator 1' }).getAttribute('src')).toBe(`https://pics.test/${id}.jpg`)
    fireEvent.click(within(dialog).getByRole('button', { name: 'Close' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  })

  it('deleting your photo post asks the server to clean up its files', async () => {
    const f = fakeApi('me', { photos: true })
    const id = f.seedPost('me', 'My photo')
    f.posts.find((p) => p.id === id)!.media = { kind: 'photo', width: 1600, height: 1067, description: null }
    renderApp('/app', f.api)
    await screen.findByText('My photo')
    fireEvent.click(screen.getByRole('button', { name: /Delete/ }))
    const confirm = await screen.findAllByRole('button', { name: /Delete/ })
    fireEvent.click(confirm[confirm.length - 1])
    await waitFor(() => expect(f.photo.calls).toContain('cleanup'))
  })

  it('moderators see photo storage; only the founder can run the processing check', async () => {
    const f = fakeApi('me', { moderator: true, photos: true })
    renderApp('/app/moderation', f.api)
    expect(await screen.findByRole('heading', { name: 'Photo storage' })).toBeTruthy()
    expect(screen.getByText(/failed to delete at least 3 times/)).toBeTruthy()
    expect(screen.getByText(/hasn't run in the last 2 hours/)).toBeTruthy()
    expect(screen.getByText(/held for reports open more than 30 days/)).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Run processing check' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Run cleanup now' }))
    expect(await screen.findByText('2 deleted.')).toBeTruthy()
    cleanup()
    const g = fakeApi('me', { moderator: true, founder: true })
    renderApp('/app/moderation', g.api)
    fireEvent.click(await screen.findByRole('button', { name: 'Run processing check' }))
    expect(await screen.findByText('All six checks passed.')).toBeTruthy()
    expect(g.photo.checks).toEqual([1, 2, 3, 4, 5, 6])
  })

  it('warns about a missing scheduled cleanup whenever files are waiting, even with photos off', async () => {
    const f = fakeApi('me', { moderator: true, photos: false })
    renderApp('/app/moderation', f.api)
    await screen.findByRole('heading', { name: 'Photo storage' })
    expect(screen.getByText('Off')).toBeTruthy()
    expect(screen.getByText(/hasn't run in the last 2 hours/)).toBeTruthy()
  })
})

describe('content (20261202000000): topics, saves, reposts, editing', () => {
  it('a post can carry a topic from the composer, shown on its card', async () => {
    const fake = fakeApi()
    renderApp('/app/new', fake.api)
    fireEvent.change(await screen.findByLabelText('Write a post'), { target: { value: 'My weekly budget, explained' } })
    fireEvent.change(await screen.findByLabelText('Topic (optional)'), { target: { value: 'money' } })
    fireEvent.click(screen.getByRole('button', { name: 'Post' }))
    expect(await screen.findByTestId('post-topic')).toBeTruthy()
    expect(screen.getByTestId('post-topic').textContent).toBe('Money & business')
    expect([...fake.postTopics.values()]).toEqual(['money'])
  })

  it('saving keeps a post in the private Saved list; tapping again removes it', async () => {
    const fake = fakeApi()
    fake.follows.add(fake.key('me', 'c1'))
    fake.seedPost('c1', 'Worth keeping')
    renderApp('/app?face=following', fake.api)
    const card = within(await screen.findByTestId('post'))
    fireEvent.click(await card.findByRole('button', { name: 'Save' }))
    expect(await card.findByRole('button', { name: 'Saved (tap to remove)' })).toBeTruthy()
    cleanup()
    renderApp('/app/saved', fake.api)
    expect(await screen.findByText('Worth keeping')).toBeTruthy()
    fireEvent.click(await screen.findByRole('button', { name: 'Saved (tap to remove)' }))
    await waitFor(() => expect(fake.saves.size).toBe(0))
    cleanup()
    renderApp('/app/saved', fake.api)
    expect(await screen.findByText('Nothing saved yet')).toBeTruthy()
  })

  it("reposting someone else's post counts it; your own posts offer no repost", async () => {
    const fake = fakeApi()
    fake.follows.add(fake.key('me', 'c1'))
    fake.seedPost('c1', 'Share this one')
    fake.seedPost('me', 'My own post')
    renderApp('/app?face=following', fake.api)
    const others = within((await screen.findAllByTestId('post')).find((p) => p.textContent?.includes('Share this one'))!)
    fireEvent.click(await others.findByRole('button', { name: 'Repost, 0 reposts' }))
    expect(await others.findByRole('button', { name: 'Undo repost, 1 repost' })).toBeTruthy()
    expect(fake.reposts.has(fake.key('me', 'p001'))).toBe(true)
    const mine = within(screen.getAllByTestId('post').find((p) => p.textContent?.includes('My own post'))!)
    expect(mine.queryByRole('button', { name: /Repost/ })).toBeNull()
  })

  it('the author edits their post: the text and topic change, "Edited" shows, and the earlier version is kept', async () => {
    const fake = fakeApi()
    const id = fake.seedPost('me', 'First draft')
    renderApp(`/app/post/${id}`, fake.api)
    fireEvent.click(await screen.findByRole('button', { name: 'Edit post' }))
    const editor = within(screen.getByTestId('post-editor'))
    fireEvent.change(editor.getByLabelText('Edit your post'), { target: { value: 'Final version' } })
    fireEvent.change(editor.getByLabelText('Topic'), { target: { value: 'tech' } })
    expect(editor.getByText(/People will see that this post was edited/)).toBeTruthy()
    fireEvent.click(editor.getByRole('button', { name: 'Save changes' }))
    expect(await screen.findByText('Final version')).toBeTruthy()
    expect(await screen.findByTestId('post-edited')).toBeTruthy()
    expect(screen.getByTestId('post-topic').textContent).toBe('Tech')
    expect(fake.edits.get(id)?.[0]).toMatchObject({ previousBody: 'First draft', previousTopic: null })
  })

  it('a reposted post on Home says who reposted it', async () => {
    const fake = fakeApi()
    const post = toPost({
      id: 'p9',
      author_id: 'c2',
      author_username: 'creator_2',
      author_display_name: 'Creator 2',
      body: 'Reached you through a repost',
      created_at: '2026-11-17T12:00:00Z',
      like_count: 0,
      comment_count: 0,
      liked_by_me: false,
      author_in_my_clique: false,
      is_mine: false,
      activity_at: '2026-11-17T13:00:00Z',
      reposted_by_id: 'c1',
      reposted_by_username: 'creator_1',
      reposted_by_display_name: 'Creator 1',
    })
    expect(post.repostedBy).toEqual({ id: 'c1', username: 'creator_1', displayName: 'Creator 1' })
    expect(post.activityAt).toBe('2026-11-17T13:00:00Z')
    fake.api.feed = async () => [post]
    renderApp('/app?face=following', fake.api)
    expect((await screen.findByTestId('reposted-by')).textContent).toMatch(/Reposted by Creator 1/)
  })
})

describe('discovery (20261203000000): value and intent based, search, share', () => {
  it("Discover opens on For you: posts in your interests from people you don't follow, each with its reason, two per creator", async () => {
    const fake = fakeApi()
    fake.setDetails('me', { topics: ['money'] })
    for (const [author, body, topic] of [
      ['c1', 'Budget one', 'money'],
      ['c1', 'Budget two', 'money'],
      ['c1', 'Budget three', 'money'],
      ['c2', 'A recipe', 'food'],
      ['c3', 'Followed already', 'money'],
    ] as const)
      fake.postTopics.set(fake.seedPost(author, body), topic)
    fake.follows.add(fake.key('me', 'c3'))
    renderApp('/app/discover', fake.api)
    // The first screen (D1): three ways in, then a few posts you might value, each with its reason.
    const home = within(await screen.findByTestId('discover-home'))
    expect(home.getByRole('navigation', { name: 'Ways into Discover' }).textContent).toMatch(/For you.*People.*Topics/)
    await home.findByText('Budget three')
    expect(home.getAllByTestId('discover-reason')).toHaveLength(2)
    fireEvent.click(home.getByRole('button', { name: /^For you/ }))
    expect((await screen.findByRole('tab', { name: 'For you' })).getAttribute('aria-selected')).toBe('true')
    await screen.findByText('Budget three')
    const bodies = screen.getAllByTestId('post').map((p) => p.textContent ?? '')
    expect(bodies).toHaveLength(2)
    expect(bodies.some((b) => b.includes('Budget one'))).toBe(false)
    expect(screen.getAllByTestId('discover-reason').map((r) => r.textContent?.trim())).toEqual([
      "Because you're interested in Money & business",
      "Because you're interested in Money & business",
    ])
    // A focus for this visit, never stored.
    fireEvent.click(screen.getByRole('button', { name: 'Food & cooking' }))
    expect(await screen.findByText('A recipe')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Food & cooking' }).getAttribute('aria-pressed')).toBe('true')
    expect(screen.getByText("Your choice here only shapes this visit. It isn't saved.")).toBeTruthy()
  })

  it('search finds people, posts and topics together', async () => {
    const fake = fakeApi()
    fake.postTopics.set(fake.seedPost('c2', 'Weekend travel on a budget'), 'travel')
    renderApp('/app/discover', fake.api)
    fireEvent.change(await screen.findByLabelText('Search people, posts and topics'), { target: { value: 'travel' } })
    fireEvent.click(screen.getByRole('button', { name: 'Search' }))
    const posts = within(await screen.findByRole('region', { name: 'Posts' }))
    expect(posts.getByText('Weekend travel on a budget')).toBeTruthy()
    expect(within(screen.getByRole('region', { name: 'Topics' })).getByText('Travel')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Clear search' }))
    expect(await screen.findByTestId('discover-home')).toBeTruthy()
  })

  it('Share copies the post link where there is no share sheet, and records the share', async () => {
    const fake = fakeApi()
    const id = fake.seedPost('c1', 'Pass this on')
    const writeText = vi.fn(async () => undefined)
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
    renderApp(`/app/post/${id}`, fake.api)
    fireEvent.click(await screen.findByRole('button', { name: 'Share' }))
    expect(await screen.findByRole('button', { name: 'Link copied' })).toBeTruthy()
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(`${window.location.origin}/p/${id}?r=0123456789abcdef`))
    await waitFor(() => expect(fake.shares).toEqual([{ id, channel: 'copy_link' }]))
  })
})

describe('previews and search measurement (20261204000000)', () => {
  it('a search is counted once (with results, matched topic) and opening a result is counted; nothing else is sent', async () => {
    const fake = fakeApi()
    fake.postTopics.set(fake.seedPost('c2', 'Weekend travel on a budget'), 'travel')
    renderApp('/app/discover', fake.api)
    fireEvent.change(await screen.findByLabelText('Search people, posts and topics'), { target: { value: 'travel' } })
    fireEvent.click(screen.getByRole('button', { name: 'Search' }))
    await screen.findByRole('region', { name: 'Posts' })
    await waitFor(() => expect(fake.searchNotes).toEqual([{ surface: 'search', hadResults: true, topic: 'travel' }]))
    fireEvent.click(within(screen.getByRole('region', { name: 'Posts' })).getAllByRole('link')[0])
    await waitFor(() => expect(fake.searchNotes[1]).toEqual({ surface: 'search', selected: true, topic: 'travel' }))
    expect(JSON.stringify(fake.searchNotes)).not.toMatch(/Weekend|me\b/)
  })

  it('a follow from search results records "search" as its source', async () => {
    const fake = fakeApi()
    renderApp('/app/discover', fake.api)
    fireEvent.change(await screen.findByLabelText('Search people, posts and topics'), { target: { value: 'Creator 4' } })
    fireEvent.click(screen.getByRole('button', { name: 'Search' }))
    fireEvent.click(await within(await screen.findByRole('region', { name: 'People' })).findByRole('button', { name: 'Follow Creator 4' }))
    await waitFor(() => expect(fake.followSources.get(fake.key('me', 'c4'))).toBe('search'))
  })

  it("a shared link is the public preview with the sharer's referral link", async () => {
    const fake = fakeApi()
    const id = fake.seedPost('c1', 'Pass this on')
    const writeText = vi.fn(async () => undefined)
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
    renderApp(`/app/post/${id}`, fake.api)
    fireEvent.click(await screen.findByRole('button', { name: 'Share' }))
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(`${window.location.origin}/p/${id}?r=0123456789abcdef`))
  })

  it('public previews are opt-in: off until the creator reads what is shown and chooses to allow them', async () => {
    const fake = fakeApi()
    renderApp('/app/profile', fake.api)
    const setting = within(await screen.findByTestId('public-previews-setting'))
    const box = setting.getByRole('checkbox', { name: 'Allow public previews of my posts' }) as HTMLInputElement
    expect(box.checked).toBe(false)
    expect(setting.getByText(/They never see photos, comments, likes or anything about other members/)).toBeTruthy()
    expect(setting.getByText('Off: only members can open links to your posts.')).toBeTruthy()
    fireEvent.click(box)
    await waitFor(() => expect(fake.previews.allowed).toBe(true))
    expect(await setting.findByText('On: shared links to your posts show a public preview.')).toBeTruthy()
  })

  it('sharing your own post before opting in says only members can open the link', async () => {
    const fake = fakeApi()
    const id = fake.seedPost('me', 'My own thoughts')
    Object.defineProperty(navigator, 'clipboard', { value: { writeText: vi.fn(async () => undefined) }, configurable: true })
    renderApp(`/app/post/${id}`, fake.api)
    fireEvent.click(await screen.findByRole('button', { name: 'Share' }))
    expect((await screen.findByTestId('share-notice')).textContent).toMatch(/Only members can open this link/)
  })

  it('after joining from a preview, Home offers to see the creator they came for (never an automatic follow)', async () => {
    const fake = fakeApi()
    window.localStorage.setItem('splitpost.join_for', JSON.stringify({ username: 'creator_2', displayName: 'Creator 2', at: Date.now() }))
    renderApp('/app', fake.api)
    const prompt = within(await screen.findByTestId('joined-for'))
    expect(prompt.getByRole('link', { name: 'See Creator 2' }).getAttribute('href')).toBe('/app/u/creator_2')
    expect(fake.follows.size).toBe(0)
    fireEvent.click(prompt.getByRole('button', { name: 'Not now' }))
    expect(window.localStorage.getItem('splitpost.join_for')).toBeNull()
  })
})

describe('progression (SP-PRG-001): goals, statuses and simulated earnings', () => {
  const steps = (xs: Array<[string, number, number | null]>) => xs.map(([metric, value, target]) => ({ metric, value, target }))
  const money = (accumulatedCents: number, lockedCents: number, eligibleCents = 0, settledCents = 0, pausedCents = 0) => ({
    accumulatedCents,
    lockedCents,
    eligibleCents,
    settledCents,
    pausedCents,
  })
  const journey = (status: QualificationStatus, s: ReturnType<typeof steps>, qualifiedAt: string | null = null) => ({
    status,
    qualifiedAt,
    goalsSince: '2026-11-26T10:00:00Z',
    steps: s,
  })

  it('with the switch off, My Split is unchanged and shows no goals', async () => {
    const fake = fakeApi()
    renderApp('/app/split', fake.api)
    expect(await screen.findByRole('heading', { name: 'How My Split works' })).toBeTruthy()
    expect(screen.queryByTestId('split-progression')).toBeNull()
    expect(screen.queryByTestId('goals-consumer')).toBeNull()
  })

  it('in progress: points bar, each milestone with progress and target, the next step, locked simulated earnings and the approved wording', async () => {
    const fake = fakeApi()
    fake.rewards.points = { recognized: 970, redeemablePending: 0, redeemableApproved: 270, settled: 0, simulatedPointValueCents: 0, simulatedValueCents: 315 }
    fake.progression.my = {
      enabled: true,
      goodStanding: true,
      creator: journey('in_progress', steps([['original_posts', 0, 20]])),
      consumer: journey('in_progress', steps([['clique_creators', 10, 10], ['meaningful_engagements', 12, 30]])),
      notices: [],
      earnings: { creator: money(0, 0), consumer: money(1240, 1240) },
    }
    renderApp('/app/split', fake.api)
    const bar = await screen.findByTestId('points-bar')
    expect(bar.textContent).toMatch(/1,240.*Recognition 970.*Reward eligible 270/)
    // No posts and no creator earnings: only the supporter journey.
    expect(screen.queryByTestId('goals-creator')).toBeNull()
    const card = within(screen.getByTestId('goals-consumer'))
    expect(screen.getByTestId('goals-consumer-badge').textContent).toBe('1 of 2')
    expect(screen.getByTestId('goals-consumer-status').textContent).toBe('Next: comment, save or repost thoughtfully.')
    expect(card.getAllByTestId('goal-step').map((x) => x.textContent)).toEqual(['Keep creators in your Clique (done)10 / 10', 'Comment, save or repost thoughtfully12 / 30'])
    expect(card.getByText(/Goals in force since November 26, 2026/)).toBeTruthy()
    expect(screen.getByTestId('earnings-consumer').textContent).toMatch(/Simulated.*Accumulated\$12\.40Locked\$12\.40Unlocked\$0\.00Settled\$0\.00/)
    expect(screen.getByTestId('earnings-consumer').textContent).toMatch(/Estimated for your reward-eligible points this month: \$3\.15/)
    expect(
      card.getByText(
        'Your legitimate allocated rewards remain attributed to you until you qualify, subject to applicable integrity and adjustment rules. All pilot amounts are simulated.',
      ),
    ).toBeTruthy()
    expect(screen.getByTestId('split-progression').textContent).not.toMatch(/never takes/)
    // No split percentages are shown to members (legal review safeguard).
    expect(screen.getByTestId('split-progression').textContent).not.toMatch(/\d+\s*%/)
  })

  it('shows Under review, Qualified with optional growth guidance, and a paused amount', async () => {
    const fake = fakeApi()
    fake.progression.my = {
      enabled: true,
      goodStanding: true,
      creator: journey('under_review', steps([['original_posts', 20, 20]]), '2026-11-20T00:00:00Z'),
      consumer: journey('qualified', steps([['external_shares', 5, 5]]), '2026-11-20T00:00:00Z'),
      notices: [{ kind: 'hold', message: 'One advertising entry is being checked.', since: '2026-11-25T00:00:00Z', scope: 'creator_entry', audience: null }],
      earnings: { creator: money(4000, 2000, 0, 0, 2000), consumer: money(500, 0, 500) },
    }
    renderApp('/app/split', fake.api)
    expect((await screen.findByTestId('goals-creator-badge')).textContent).toBe('Under review')
    expect(screen.getByTestId('goals-creator-status').textContent).toMatch(/met every goal\. We are checking it/)
    const creator = within(screen.getByTestId('goals-creator'))
    expect(creator.getByTestId('progress-notice').textContent).toMatch(/One advertising entry is being checked\. Nothing is taken/)
    expect(screen.getByTestId('earnings-creator').textContent).toMatch(/Paused while under review: \$20\.00/)
    expect(screen.getByTestId('goals-consumer-badge').textContent).toBe('Qualified')
    expect(screen.getByTestId('earnings-consumer').textContent).toMatch(/Locked\$0\.00Unlocked\$5\.00/)
    expect(screen.getByTestId('growth-consumer').textContent).toMatch(/Keep growing \(optional\).*never depends on them/)
    // A creator hold is not shown on the supporter card.
    expect(within(screen.getByTestId('goals-consumer')).queryByTestId('progress-notice')).toBeNull()
  })

  it('a revoked qualification tells the member why and how to appeal', async () => {
    const fake = fakeApi()
    fake.progression.my = {
      enabled: true,
      goodStanding: true,
      creator: journey('revoked', steps([['original_posts', 20, 20]]), '2026-11-20T00:00:00Z'),
      consumer: journey('in_progress', steps([['shares', 0, 5]])),
      notices: [{ kind: 'revoked', message: 'Your creator qualification was revoked after a review.', since: '2026-11-25T00:00:00Z', scope: null, audience: 'creator' }],
      earnings: { creator: money(4000, 4000), consumer: money(0, 0) },
    }
    renderApp('/app/split', fake.api)
    expect((await screen.findByTestId('goals-creator-badge')).textContent).toBe('Qualification revoked')
    expect(within(screen.getByTestId('goals-creator')).getByTestId('progress-notice').textContent).toMatch(/revoked after a review\. To appeal, send us a message through Feedback/)
  })

  it('the founder sets goals, approves a member under review and runs a simulated settlement; the scorecard is labelled', async () => {
    const f = fakeApi('me', { founder: true })
    f.progression.queue = {
      members: [{ memberId: 'cleo', username: 'cleo', audience: 'creator', goalsMetAt: '2026-11-25T00:00:00Z', status: 'under_review' }],
      holds: [],
      decisions: [],
    }
    renderApp('/app/control', f.api)
    const form = within(await screen.findByTestId('goal-form-creator'))
    expect(form.getByText(/Not set\. Until every value is set, nobody on this journey qualifies/)).toBeTruthy()
    fireEvent.change(form.getByLabelText('Publish original posts'), { target: { value: '0' } })
    fireEvent.change(form.getByLabelText('Reason'), { target: { value: 'pilot goals v1' } })
    fireEvent.click(form.getByRole('button', { name: 'Save creator goals' }))
    expect(await form.findByText('Give every goal a whole number of 1 or more.')).toBeTruthy()
    fireEvent.change(form.getByLabelText('Publish original posts'), { target: { value: '20' } })
    fireEvent.click(form.getByRole('button', { name: 'Save creator goals' }))
    expect(await screen.findByText(/In force since .*: pilot goals v1\. 0 met\./)).toBeTruthy()
    expect(f.progression.setCalls).toEqual([{ audience: 'creator', targets: { original_posts: 20 }, reason: 'pilot goals v1' }])
    // Review: approve with a reason.
    const review = within(await screen.findByTestId('progression-review'))
    expect(review.getByTestId('review-row').textContent).toMatch(/@cleo · creator · Under review/)
    fireEvent.change(review.getByLabelText('Decision reason'), { target: { value: 'integrity review passed' } })
    fireEvent.click(review.getByRole('button', { name: 'Approve' }))
    expect(await screen.findByText('Approved @cleo.')).toBeTruthy()
    expect(f.progression.decisions).toEqual([{ memberId: 'cleo', decision: 'approved', reason: 'integrity review passed' }])
    // Settlement.
    const panel = within(screen.getByTestId('goals-panel'))
    fireEvent.change(panel.getAllByLabelText('Reason').at(-1)!, { target: { value: 'November statement' } })
    fireEvent.click(panel.getByRole('button', { name: 'Settle (simulated)' }))
    expect(await panel.findByText(/Settled \(simulated\): 1 creator share\(s\) and 0 supporter allocation\(s\)\. Nothing is paid\./)).toBeTruthy()
    expect(f.progression.settleCalls).toEqual(['November statement'])
    const card = screen.getByTestId('progression-scorecard').textContent
    expect(card).toMatch(/Creators \(4\)Members who published/)
    expect(card).toMatch(/Publish original posts: 1 \(25%\)/)
    expect(card).toMatch(/Qualified referrals: 7; at most 1 supporters can reach the referral goal/)
  })
})

describe('progression governance (SP-PRG-001): holds and corrections in Control Center', () => {
  it('places a targeted hold only after a review step, with the member message, and keeps the reason internal', async () => {
    const f = fakeApi('me', { founder: true })
    renderApp('/app/control', f.api)
    const form = within(await screen.findByTestId('governance-form'))
    fireEvent.change(form.getByLabelText('Member username'), { target: { value: '@creator_2' } })
    fireEvent.change(form.getByLabelText('Revenue entry number'), { target: { value: '41' } })
    fireEvent.change(form.getByLabelText('Reason (internal)'), { target: { value: 'refund dispute' } })
    fireEvent.click(form.getByRole('button', { name: 'Review' }))
    expect(await form.findByText('Write the message the member will see.')).toBeTruthy()
    fireEvent.change(form.getByLabelText('Message the member will see'), { target: { value: 'One advertising entry is being checked.' } })
    fireEvent.change(form.getByLabelText('Evidence reference'), { target: { value: 'case-17' } })
    fireEvent.click(form.getByRole('button', { name: 'Review' }))
    const confirm = within(await form.findByTestId('governance-confirm'))
    expect(confirm.getByText(/Hold one revenue entry 41 for @creator_2\. The member will see: “One advertising entry is being checked\.” Nothing is taken/)).toBeTruthy()
    expect(f.progression.actions).toEqual([])
    fireEvent.click(confirm.getByRole('button', { name: 'Confirm and record' }))
    expect(await screen.findByText('Hold recorded.')).toBeTruthy()
    expect(f.progression.actions).toEqual([
      {
        action: 'hold',
        memberId: 'c2',
        scope: 'creator_entry',
        revenueEntryId: 41,
        settlementId: undefined,
        reason: 'refund dispute',
        evidenceRef: 'case-17',
        justification: undefined,
        memberMessage: 'One advertising entry is being checked.',
      },
    ])
  })

  it('an account-wide hold needs a justification; a refund is recorded as a negative compensating correction; cancel records nothing', async () => {
    const f = fakeApi('me', { founder: true })
    renderApp('/app/control', f.api)
    const form = within(await screen.findByTestId('governance-form'))
    fireEvent.change(form.getByLabelText('Action'), { target: { value: 'hold_account' } })
    fireEvent.change(form.getByLabelText('Member username'), { target: { value: 'creator_3' } })
    fireEvent.change(form.getByLabelText('Reason (internal)'), { target: { value: 'coordinated activity' } })
    fireEvent.change(form.getByLabelText('Message the member will see'), { target: { value: 'Your account is being reviewed.' } })
    fireEvent.change(form.getByLabelText('Why the risk cannot be isolated (justification)'), { target: { value: 'short' } })
    fireEvent.click(form.getByRole('button', { name: 'Review' }))
    expect(await form.findByText(/needs a documented justification/)).toBeTruthy()
    fireEvent.change(form.getByLabelText('Why the risk cannot be isolated (justification)'), { target: { value: 'Activity across all entries is affected' } })
    fireEvent.click(form.getByRole('button', { name: 'Review' }))
    fireEvent.click(within(await form.findByTestId('governance-confirm')).getByRole('button', { name: 'Cancel' }))
    expect(f.progression.actions).toEqual([])
    fireEvent.change(form.getByLabelText('Action'), { target: { value: 'correct_entry' } })
    fireEvent.change(form.getByLabelText('Revenue entry number'), { target: { value: '7' } })
    fireEvent.change(form.getByLabelText('Amount in dollars (simulated)'), { target: { value: '25' } })
    fireEvent.change(form.getByLabelText('Reason (internal)'), { target: { value: 'advertiser refund' } })
    fireEvent.click(form.getByRole('button', { name: 'Review' }))
    const confirm = within(await form.findByTestId('governance-confirm'))
    expect(confirm.getByText(/Correct a revenue entry 7 for @creator_3: Advertiser refund \(reduces\), −\$25\.00 \(simulated\)\. A new compensating record/)).toBeTruthy()
    fireEvent.click(confirm.getByRole('button', { name: 'Confirm and record' }))
    expect(await screen.findByText('Correction recorded.')).toBeTruthy()
    expect(f.progression.actions).toEqual([{ action: 'correct_revenue', entryId: 7, deltaCents: -2500, kind: 'refund', reason: 'advertiser refund', evidenceRef: undefined }])
  })
})

describe('rewards (20261205000000): simulated Connection Points', () => {
  it('My Split shows recognized and redeemable points separately, and their value marked as simulated', async () => {
    const fake = fakeApi()
    fake.rewards.points = {
      recognized: 14,
      redeemablePending: 100,
      redeemableApproved: 100,
      settled: 0,
      simulatedPointValueCents: 20,
      simulatedValueCents: 2000,
    }
    renderApp('/app/split', fake.api)
    const box = within(await screen.findByTestId('split-points'))
    expect(box.getByText('Recognized').nextSibling?.textContent).toBe('14')
    expect(box.getByText(/From qualified referrals\. 100 waiting for review\./)).toBeTruthy()
    expect(box.getByText('$20.00')).toBeTruthy()
    expect(box.getByText('Simulated')).toBeTruthy()
    expect(screen.getByTestId('split-disclosure').textContent).toMatch(/simulated.*no cash value.*nothing is paid out/i)
  })

  it('My Split keeps "How My Split works" to come back to after setup, with no percentages', async () => {
    const fake = fakeApi()
    renderApp('/app/split', fake.api)
    expect(await screen.findByRole('heading', { name: 'How My Split works' })).toBeTruthy()
    const intro = screen.getByTestId('my-split-intro')
    expect(intro.textContent).toMatch(/Connection Points/)
    expect(intro.textContent).toMatch(/redeemable after a quick review/)
    expect(intro.textContent).toMatch(/Points are not money and nothing is paid/)
    expect(intro.textContent).not.toMatch(/\d+\s*%/)
  })

  it('the History face lists contributions newest first, with reversals shown', async () => {
    const fake = fakeApi()
    fake.rewards.points = { recognized: 3, redeemablePending: 0, redeemableApproved: 0, settled: 0, simulatedPointValueCents: 0, simulatedValueCents: 0 }
    fake.rewards.history = [
      {
        id: 3,
        action: 'meaningful_comment',
        points: -2,
        redeemable: false,
        status: 'reversal',
        createdAt: '2026-11-25T12:00:00Z',
        creator: { username: 'creator_1', displayName: 'Creator 1' },
        postId: 'p1',
      },
      {
        id: 2,
        action: 'repost',
        points: 5,
        redeemable: false,
        status: 'recognized',
        createdAt: '2026-11-25T11:00:00Z',
        creator: { username: 'creator_1', displayName: 'Creator 1' },
        postId: 'p1',
      },
    ]
    renderApp('/app/split?face=history', fake.api)
    const list = within(await screen.findByTestId('points-history'))
    expect(list.getAllByRole('listitem').map((li) => li.textContent)).toEqual([
      expect.stringMatching(/Thoughtful comment.*Reversed.*Creator 1.*-2/),
      expect.stringMatching(/Reposted.*Recognized.*Creator 1.*\+5/),
    ])
  })

  it('the founder reviews qualified referrals and sees the simulated reconciliation', async () => {
    const fake = fakeApi('me', { founder: true })
    fake.rewards.points = { recognized: 0, redeemablePending: 0, redeemableApproved: 0, settled: 0, simulatedPointValueCents: 0, simulatedValueCents: 0 }
    fake.rewards.queue = [{ awardId: 7, referrer: 'creator_1', referred: 'creator_2', firstFollow: 'creator_3', createdAt: '2026-11-25T12:00:00Z' }]
    fake.rewards.overview = {
      recognized: 10,
      redeemablePending: 100,
      redeemableApproved: 0,
      settled: 0,
      revenueCents: 15001,
      creatorCents: 4000,
      poolCents: 2000,
      splitpostCents: 9001,
      openPoolCents: 2000,
      paused: false,
      ruleVersion: 'd6-v1',
    }
    renderApp('/app/split', fake.api)
    fireEvent.click(await screen.findByRole('link', { name: 'Founder: review referrals and rewards' }))
    const overview = within(await screen.findByTestId('rewards-overview'))
    expect(overview.getByText('$40.00')).toBeTruthy()
    expect(overview.getAllByText('$20.00')).toHaveLength(2) // fan pool and open pool
    fireEvent.click(within(screen.getByTestId('referral-queue')).getByRole('button', { name: 'Approve referral by creator_1' }))
    await waitFor(() => expect(fake.rewards.reviewed).toEqual([{ id: 7, approve: true }]))
    expect(await screen.findByText('Nothing waiting.')).toBeTruthy()
  })

  it('creators see their simulated 40% share, marked simulated', async () => {
    const fake = fakeApi()
    fake.intel.creator = creatorInsightsFixture()
    renderApp('/app/profile?face=money', fake.api)
    const money = within(await screen.findByTestId('simulated-earnings'))
    expect(within(screen.getByTestId('money-face')).getAllByText('Simulated').length).toBeGreaterThan(0)
    expect(money.getAllByText(/\$40\.00/).length).toBeGreaterThan(0)
    expect(money.getByText(/Nothing is paid during the pilot/)).toBeTruthy()
  })

  it('the founder records simulated revenue (content ads need the creator) and closes a month', async () => {
    const f = fakeApi('me', { founder: true })
    f.rewards.overview = {
      recognized: 0,
      redeemablePending: 0,
      redeemableApproved: 100,
      settled: 0,
      revenueCents: 0,
      creatorCents: 0,
      poolCents: 0,
      splitpostCents: 0,
      openPoolCents: 0,
      paused: false,
      ruleVersion: 'd6-v1',
    }
    renderApp('/app/split/review', f.api)
    fireEvent.change(await screen.findByLabelText('Creator username'), { target: { value: '@creator_1' } })
    fireEvent.change(screen.getByLabelText('Net amount ($)'), { target: { value: '100' } })
    fireEvent.change(screen.getByLabelText('Note'), { target: { value: 'Test campaign' } })
    fireEvent.click(screen.getByRole('button', { name: 'Record simulated revenue' }))
    await waitFor(() => expect(f.rewards.revenue[0]).toMatchObject({ kind: 'content_ad', creatorId: 'c1', netCents: 10000, note: 'Test campaign' }))
    expect(f.rewards.revenue[0].month).toMatch(/^\d{4}-\d{2}-01$/)
    fireEvent.click(screen.getByRole('button', { name: 'Close the month (simulated)' }))
    expect(await screen.findByText(/It reconciles to the cent\./)).toBeTruthy()
    expect(f.rewards.closed).toHaveLength(1)
  })
})

// ---------------------------------------------------------------------------
describe('governance (20261206000000): blocking, notices, appeals and the enforcement ladder', () => {
  const notice = (over: Partial<MemberNotice>): MemberNotice => ({
    id: 1,
    kind: 'content_hidden',
    targetType: 'comment',
    targetId: 'x',
    reason: 'harassment',
    excerpt: 'You are all terrible',
    endsAt: null,
    createdAt: new Date().toISOString(),
    read: false,
    appealStatus: null,
    canAppeal: true,
    sameModerator: false,
    ...over,
  })

  it('blocks from a profile after explaining what a block does, then shows the block with Unblock', async () => {
    const f = fakeApi()
    renderApp('/app/u/creator_2', f.api)
    fireEvent.click(await screen.findByRole('button', { name: 'Block Creator 2' }))
    const dialog = await screen.findByRole('dialog', { name: 'Block Creator 2?' })
    expect(dialog.textContent).toMatch(/won't see each other's profiles, posts or comments/)
    expect(dialog.textContent).toMatch(/Creator 2 isn't told/)
    expect(dialog.textContent).toMatch(/still report them after blocking/)
    fireEvent.click(within(dialog).getByRole('button', { name: 'Block' }))
    const panel = await screen.findByTestId('blocked-profile')
    expect(panel.textContent).toMatch(/You blocked Creator 2/)
    expect(f.governance.blockCalls).toEqual([{ id: 'c2', block: true }])
    fireEvent.click(within(panel).getByRole('button', { name: 'Unblock @creator_2' }))
    expect(await screen.findByRole('heading', { name: 'Creator 2' })).toBeTruthy()
    expect(f.governance.blockCalls[1]).toEqual({ id: 'c2', block: false })
  })

  it('your profile lists the members you blocked, with Unblock, and links to your notices', async () => {
    const f = fakeApi()
    await f.api.block('c3')
    renderApp('/app/profile', f.api)
    const list = await screen.findByTestId('blocked-members')
    expect(list.textContent).toMatch(/Creator 3.*@creator_3/)
    expect(screen.getByRole('link', { name: 'Notices' }).getAttribute('href')).toBe('/app/notices')
    fireEvent.click(within(list).getByRole('button', { name: 'Unblock' }))
    await waitFor(() => expect(screen.queryByTestId('blocked-members')).toBeNull())
  })

  it('reports a comment by someone else, never your own', async () => {
    const f = fakeApi()
    const post = f.seedPost('c1', 'A post with comments')
    f.commentStore.push({ id: 'cm1', post, author: 'c2', body: 'An unkind comment', at: 1, deleted: false })
    renderApp(`/app/post/${post}`, f.api)
    fireEvent.click(await screen.findByRole('button', { name: 'Report this comment by Creator 2' }))
    const dialog = await screen.findByRole('dialog', { name: 'Report this comment' })
    fireEvent.click(within(dialog).getByRole('radio', { name: 'Harassment or bullying' }))
    fireEvent.click(within(dialog).getByRole('button', { name: 'Send report' }))
    await within(dialog).findByTestId('report-sent')
    expect(f.reports[0]).toMatchObject({ targetType: 'comment', targetId: 'cm1', owner: 'c2', reason: 'harassment' })
  })

  it('Home says when your account is restricted and when there is a new notice', async () => {
    const f = fakeApi()
    f.governance.standing = { standing: 'restricted', endsAt: '2026-12-02T12:00:00Z' }
    f.governance.notices = [notice({ kind: 'restriction', targetType: null, canAppeal: true })]
    renderApp('/app', f.api)
    const banner = await screen.findByTestId('governance-banner')
    await waitFor(() => expect(banner.textContent).toMatch(/new notice/))
    expect(banner.textContent).toMatch(/restricted until .*2026.*can't post, comment or repost/)
    expect(within(banner).getByRole('link', { name: 'See your notices' }).getAttribute('href')).toBe('/app/notices')
  })

  it('notices say what happened and why, never who reported; you can appeal once', async () => {
    const f = fakeApi()
    f.governance.notices = [notice({ id: 7 }), notice({ id: 8, kind: 'appeal_reversed', canAppeal: false, read: true })]
    renderApp('/app/notices', f.api)
    const items = await screen.findAllByTestId('notice')
    expect(items[0].textContent).toMatch(/We hid your comment.*\(harassment or bullying\).*You are all terrible/)
    expect(items[1].textContent).toMatch(/Your appeal was successful/)
    expect(document.body.textContent).toMatch(/never say who reported/)
    fireEvent.click(within(items[0]).getByRole('button', { name: 'Appeal' }))
    fireEvent.change(within(items[0]).getByLabelText('Why should we look again?'), { target: { value: 'It was a quote from a film.' } })
    fireEvent.click(within(items[0]).getByRole('button', { name: 'Send appeal' }))
    await waitFor(() => expect(f.governance.appealed).toEqual([{ noticeId: 7, body: 'It was a quote from a film.' }]))
    expect((await screen.findAllByTestId('notice'))[0].textContent).toMatch(/Appeal sent/)
    expect(within((await screen.findAllByTestId('notice'))[0]).queryByRole('button', { name: 'Appeal' })).toBeNull()
    await waitFor(() => expect(f.governance.notices.every((n) => n.read)).toBe(true))
  })

  it('a moderator sees the account behind a report and takes the next step on the ladder', async () => {
    const f = fakeApi('me', { moderator: true })
    const p1 = f.seedPost('c1', 'Spammy post')
    const r = f.seedReport({
      reporter: 'c3',
      targetType: 'post',
      targetId: p1,
      owner: 'c1',
      reason: 'spam',
      details: null,
      snapshot: { body: 'Spammy post', author_username: 'creator_1', author_display_name: 'Creator 1' },
    })
    f.governance.record = {
      username: 'creator_1',
      displayName: 'Creator 1',
      standing: null,
      hiddenContent: 1,
      enforcements: [
        { id: 3, level: 'warning', reason: 'spam', startsAt: new Date().toISOString(), endsAt: null, liftedAt: null, liftedVia: null, active: false },
      ],
    }
    renderApp(`/app/moderation/${r}`, f.api)
    const record = await screen.findByTestId('member-record')
    expect(record.textContent).toMatch(/Creator 1 \(@creator_1\).*No limits now\. Hidden by moderators so far: 1/)
    expect(screen.getByRole('list', { name: 'Enforcement history' }).textContent).toMatch(/Warning.*Spam or scam/)
    fireEvent.click(screen.getByRole('button', { name: 'Restriction' }))
    expect((screen.getByLabelText('Days (1 to 30)') as HTMLInputElement).value).toBe('7')
    fireEvent.click(screen.getByRole('button', { name: 'Give a restriction' }))
    await waitFor(() => expect(f.governance.enforced).toEqual([{ memberId: 'c1', level: 'restriction', reason: 'spam', reportId: r, days: 7 }]))
    expect(await screen.findByText('Restriction recorded. @creator_1 has been notified.')).toBeTruthy()
  })

  it('appeals: a moderator is told when they took the original action, and can reverse or keep a decision', async () => {
    const f = fakeApi('me', { moderator: true })
    f.governance.appeals = [
      {
        id: 'a1',
        memberId: 'c1',
        memberUsername: 'creator_1',
        kind: 'content_hidden',
        targetType: 'post',
        targetId: 'p',
        reason: 'spam',
        excerpt: 'Buy now',
        body: 'This was a real recommendation.',
        status: 'open',
        createdAt: new Date().toISOString(),
        decidedAt: null,
        decisionNote: null,
        decidedOriginal: true,
        anotherModeratorAvailable: true,
        sameModerator: false,
      },
    ]
    renderApp('/app/moderation/appeals', f.api)
    const list = await screen.findByRole('list', { name: 'Open appeals' })
    expect(list.textContent).toMatch(/Hidden content.*Spam or scam.*@creator_1.*Buy now.*This was a real recommendation\./)
    expect(list.textContent).toMatch(/Another moderator should decide this one/)
    expect((within(list).getByRole('button', { name: 'Reverse' }) as HTMLButtonElement).disabled).toBe(true)
  })

  it('the sole-moderator exception: allowed only without another moderator, needs a reason, and is disclosed', async () => {
    const f = fakeApi('me', { moderator: true })
    f.governance.appeals = [
      {
        id: 'a1',
        memberId: 'c1',
        memberUsername: 'creator_1',
        kind: 'content_hidden',
        targetType: 'post',
        targetId: 'p',
        reason: 'spam',
        excerpt: 'Buy now',
        body: 'This was a real recommendation.',
        status: 'open',
        createdAt: new Date().toISOString(),
        decidedAt: null,
        decisionNote: null,
        decidedOriginal: true,
        anotherModeratorAvailable: false,
        sameModerator: false,
      },
    ]
    renderApp('/app/moderation/appeals', f.api)
    const list = await screen.findByRole('list', { name: 'Open appeals' })
    expect(within(list).getByTestId('sole-moderator').textContent).toMatch(/no other moderator is available.*conflict of interest.*the member is told/)
    fireEvent.click(within(list).getByRole('button', { name: 'Reverse' }))
    expect(await screen.findByText('Write a note first.')).toBeTruthy()
    expect(f.governance.decided).toEqual([])
    fireEvent.change(within(list).getByLabelText('Decision note (optional, never shown to the member)'), { target: { value: 'On review it was fine.' } })
    fireEvent.click(within(list).getByRole('button', { name: 'Reverse' }))
    await waitFor(() => expect(f.governance.decided).toEqual([{ id: 'a1', reverse: true }]))
  })

  it('a notice says when the same moderator reviewed your appeal', async () => {
    const f = fakeApi()
    f.governance.notices = [notice({ id: 9, kind: 'appeal_reversed', canAppeal: false, read: true, sameModerator: true })]
    renderApp('/app/notices', f.api)
    expect((await screen.findByTestId('same-moderator')).textContent).toMatch(/moderator who made the original decision reviewed your appeal/)
  })

  it('a serious violation can be acted on at once, with a required reason', async () => {
    const f = fakeApi('me', { moderator: true })
    const p1 = f.seedPost('c1', 'Threatening post')
    const r = f.seedReport({
      reporter: 'c3',
      targetType: 'post',
      targetId: p1,
      owner: 'c1',
      reason: 'sexual',
      details: null,
      snapshot: { body: 'x', author_username: 'creator_1', author_display_name: 'Creator 1' },
    })
    f.governance.record = { username: 'creator_1', displayName: 'Creator 1', standing: null, hiddenContent: 0, enforcements: [] }
    renderApp(`/app/moderation/${r}`, f.api)
    await screen.findByTestId('member-record')
    fireEvent.click(screen.getByRole('button', { name: 'Suspension' }))
    fireEvent.click(screen.getByRole('checkbox', { name: /Serious violation: act now/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Give a suspension' }))
    expect(await screen.findByText('Write a note first.')).toBeTruthy()
    fireEvent.change(screen.getByLabelText(/Note for the record \(optional, never shown to the member\)/), {
      target: { value: 'Explicit images sent to a minor.' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Give a suspension' }))
    await waitFor(() => expect(f.governance.enforced[0]).toMatchObject({ level: 'suspension', immediate: true, note: 'Explicit images sent to a minor.' }))
  })
})

// ---------------------------------------------------------------------------
describe('advertising (20261208000000): labelled, explainable, controllable', () => {
  const ad = (over: Partial<Ad> = {}): Ad => ({
    impressionId: 'imp1',
    advertiser: 'Budgetly',
    headline: 'Plan your month in minutes',
    body: 'See where your money goes.',
    ctaLabel: 'Try it free',
    landingUrl: 'https://budgetly.example/start',
    match: 'preference',
    matched: 'Software & apps',
    placement: 'content',
    creativeKind: 'text',
    mediaUrl: null,
    mediaAlt: null,
    shownWith: null,
    ...over,
  })

  it("an ad under someone else's post is labelled Sponsored, explains why, opens safely, and can be hidden", async () => {
    const f = fakeApi()
    const post = f.seedPost('c1', 'A post about budgets')
    f.ads.next = ad()
    renderApp(`/app/post/${post}`, f.api)
    const card = await screen.findByTestId('ad')
    expect(card.textContent).toMatch(/Sponsored · Budgetly/)
    expect(f.ads.calls).toEqual([{ surface: 'content', postId: post }])
    fireEvent.click(within(card).getByRole('button', { name: 'Why this ad' }))
    expect(within(card).getByTestId('why-this-ad').textContent).toMatch(/You chose "Software & apps".*never use your content interests, follows, searches/)
    const link = within(card).getByRole('link', { name: /Try it free/ })
    expect(link.getAttribute('rel')).toBe('noopener noreferrer sponsored')
    expect(link.getAttribute('target')).toBe('_blank')
    fireEvent.click(link)
    await waitFor(() => expect(f.ads.events.map((e) => e.kind)).toEqual(['view', 'click']))
    fireEvent.click(within(card).getByRole('button', { name: 'Hide this ad' }))
    await waitFor(() => expect(screen.queryByTestId('ad')).toBeNull())
    expect(f.ads.events.at(-1)).toEqual({ id: 'imp1', kind: 'hidden' })
  })

  it('an ad counts as seen only after a second on screen in a tab the person is looking at', async () => {
    const original = globalThis.IntersectionObserver
    const callbacks: Array<{ el: Element; cb: IntersectionObserverCallback }> = []
    globalThis.IntersectionObserver = class {
      constructor(private cb: IntersectionObserverCallback) {}
      observe(el: Element) {
        callbacks.push({ el, cb: this.cb })
      }
      unobserve() {}
      disconnect() {}
      takeRecords() {
        return []
      }
    } as unknown as typeof IntersectionObserver
    let visibility: DocumentVisibilityState = 'visible'
    const desc = Object.getOwnPropertyDescriptor(document, 'visibilityState')
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => visibility })
    const setVisibility = (v: DocumentVisibilityState) => {
      visibility = v
      document.dispatchEvent(new Event('visibilitychange'))
    }
    try {
      // If this ever fails, the trace below says whether the test lost track of
      // the slot (synchronization) or the app counted a view it should not have
      // (a defect): observers registered, whether the card was still on the
      // page, and every ad event, with times.
      const t0 = Date.now()
      const trace: string[] = []
      const note = (what: string) => trace.push(`${Date.now() - t0}ms ${what}`)
      const f = fakeApi()
      try {
        const post = f.seedPost('c1', 'A post about budgets')
        f.ads.next = ad()
        renderApp(`/app/post/${post}`, f.api)
        const card = await screen.findByTestId('ad')
        note(`ad shown; observers so far ${callbacks.length}`)
        // The slot's observer is registered in an effect, which may run after the ad first appears.
        const find = () => callbacks.find((c) => c.el === card || c.el.contains(card) || card.contains(c.el))
        await waitFor(() => expect(find()).toBeTruthy())
        const slot = find()!
        note(`slot observer found; observers ${callbacks.length}; card on page ${card.isConnected}`)
        const show = (ratio: number) => {
          note(`show ${ratio}; card on page ${card.isConnected}; events ${JSON.stringify(f.ads.events)}`)
          slot.cb([{ target: slot.el, isIntersecting: ratio > 0, intersectionRatio: ratio } as IntersectionObserverEntry], {} as IntersectionObserver)
        }
        show(1)
        setVisibility('hidden') // the person switched tabs straight away
        note('tab hidden')
        await new Promise((r) => setTimeout(r, 1300))
        expect(f.ads.events.filter((e) => e.kind === 'view')).toEqual([])
        setVisibility('visible')
        note('tab visible')
        show(0.3) // less than half on screen does not count
        await new Promise((r) => setTimeout(r, 1300))
        expect(f.ads.events.filter((e) => e.kind === 'view')).toEqual([])
        show(0.8)
        await waitFor(() => expect(f.ads.events.filter((e) => e.kind === 'view')).toEqual([{ id: 'imp1', kind: 'view' }]), { timeout: 2500 })
      } catch (e) {
        note(`failed; observers ${callbacks.length}; events ${JSON.stringify(f.ads.events)}`)
        console.error(`ad view test trace:\n${trace.join('\n')}`)
        throw e
      }
    } finally {
      globalThis.IntersectionObserver = original
      if (desc) Object.defineProperty(document, 'visibilityState', desc)
      else delete (document as { visibilityState?: unknown }).visibilityState
    }
  })

  it('the ad feedback buttons are at least 24px tall, so they stay apart when they wrap on a narrow phone (WCAG 2.5.8)', async () => {
    const f = fakeApi()
    const post = f.seedPost('c1', 'A post')
    f.ads.next = ad()
    renderApp(`/app/post/${post}`, f.api)
    const card = await screen.findByTestId('ad')
    for (const name of ['Relevant', 'Not relevant', 'Hide this ad', 'Report ad']) {
      expect(within(card).getByRole('button', { name }).className.split(' ')).toEqual(expect.arrayContaining(['inline-flex', 'min-h-6']))
    }
  })

  it('a content ad says whose post it is shown with, and the advertiser can be hidden from Why this ad', async () => {
    const f = fakeApi()
    const post = f.seedPost('c1', 'A post')
    f.ads.next = ad({ shownWith: 'Creator 1' })
    renderApp(`/app/post/${post}`, f.api)
    const card = await screen.findByTestId('ad')
    expect(card.textContent).toMatch(/Sponsored · shown with Creator 1's post/)
    fireEvent.click(within(card).getByRole('button', { name: 'Why this ad' }))
    fireEvent.click(within(card).getByRole('button', { name: "Don't show ads from Budgetly" }))
    await waitFor(() => expect(screen.queryByTestId('ad')).toBeNull())
    expect(f.ads.events.at(-1)).toEqual({ id: 'imp1', kind: 'hidden_advertiser' })
  })

  it('an image ad shows its picture with the text alternative from Splitpost storage', async () => {
    const f = fakeApi()
    const post = f.seedPost('c1', 'A post')
    f.ads.next = ad({
      creativeKind: 'image',
      mediaUrl: 'https://kpudeppgokpjhvaqrprn.supabase.co/storage/v1/object/public/ad-creatives/a.jpg',
      mediaAlt: 'A phone showing a monthly budget.',
    })
    renderApp(`/app/post/${post}`, f.api)
    const img = within(await screen.findByTestId('ad')).getByRole('img', { name: 'A phone showing a monthly budget.' })
    expect(img.getAttribute('src')).toMatch(/\/storage\/v1\/object\/public\/ad-creatives\/a\.jpg$/)
  })

  it('a contextual or non-personalized ad says so; no ad when nothing matches; never on your own post', async () => {
    const f = fakeApi()
    const post = f.seedPost('c1', 'Money talk')
    f.ads.next = ad({ match: 'context', matched: 'Money & business' })
    renderApp(`/app/post/${post}`, f.api)
    fireEvent.click(within(await screen.findByTestId('ad')).getByRole('button', { name: 'Why this ad' }))
    expect(screen.getByTestId('why-this-ad').textContent).toMatch(/Shown with Money & business posts\. Not based on anything about you\./)
    cleanup()
    const f2 = fakeApi()
    const mine = await f2.api.createPost('My own post')
    f2.ads.next = ad()
    renderApp(`/app/post/${mine}`, f2.api)
    await screen.findByText('My own post')
    expect(screen.queryByTestId('ad')).toBeNull()
    expect(f2.ads.calls).toEqual([])
  })

  it('Home shows one feed ad between sections without removing posts', async () => {
    const f = fakeApi()
    f.seedPost('c1', 'First post')
    f.seedPost('c1', 'Second post')
    f.follows.add(f.key('me', 'c1'))
    f.ads.next = ad({ placement: 'feed', match: 'general', matched: null })
    renderApp('/app', f.api)
    await screen.findByText('First post')
    expect(await screen.findByTestId('ad')).toBeTruthy()
    expect(screen.getByText('Second post')).toBeTruthy()
    expect(screen.getAllByTestId('ad')).toHaveLength(1)
  })

  it('ad preferences are optional, editable and removable, and explain the separation from content interests', async () => {
    const f = fakeApi()
    f.ads.exclusions = [{ kind: 'campaign', target: 'c9', label: 'Budgetly: Plan your month', createdAt: new Date().toISOString() }]
    renderApp('/app/profile', f.api)
    const box = await screen.findByTestId('ad-preferences')
    expect(box.textContent).toMatch(/Optional.*content interests, follows\s+and searches are never used for ads.*full access/)
    fireEvent.change(within(box).getByLabelText('Software & apps'), { target: { value: 'chosen' } })
    await waitFor(() => expect(f.ads.prefCalls).toEqual([{ category: 'software_apps', state: 'chosen' }]))
    fireEvent.click(within(box).getByRole('button', { name: 'Show again' }))
    await waitFor(() => expect(within(box).queryByRole('button', { name: 'Show again' })).toBeNull())
    fireEvent.click(within(box).getByRole('button', { name: 'Remove all ad preferences' }))
    await waitFor(() => expect(f.ads.cleared).toBe(1))
  })

  it('the founder onboards and approves an advertiser, activates a campaign and reads an aggregate report', async () => {
    const f = fakeApi('me', { founder: true })
    const base = {
      website: 'https://b.example',
      offering: 'An app',
      problem_solved: 'p',
      desired_outcome: 'o',
      customer_needs: 'n',
      objective: 'traffic' as const,
      conversion_action: 'Sign-up',
      eligibility_notes: null,
      categories: ['software_apps'],
      review_note: null,
    }
    f.ads.admin = {
      advertisers: [{ id: 'a1', name: 'Budgetly', status: 'pending', ...base }],
      campaigns: [
        {
          id: 'k1',
          advertiser_id: 'a1',
          advertiser: 'Budgetly',
          name: 'Spring',
          status: 'draft',
          placement: 'both',
          categories: ['software_apps'],
          context_topics: [],
          allow_general: false,
          starts_on: '2026-11-01',
          ends_on: '2026-12-31',
          daily_cap: 3,
          price_cents: 0,
          headline: 'H',
          body: 'B',
          cta_label: 'Go',
          landing_url: 'https://b.example',
        },
      ],
      categories: [{ slug: 'software_apps', label: 'Software & apps' }],
      topics: [{ slug: 'money', label: 'Money & business' }],
    }
    f.ads.report = {
      eligibleAudience: null,
      served: 3,
      impressions: 2,
      clicks: 1,
      ctr: 0.5,
      reach: null,
      relevant: 1,
      notRelevant: 0,
      hidden: 0,
      reported: 0,
      byMatch: { preference: { impressions: 2, clicks: 1 }, context: { impressions: 0, clicks: 0 }, general: { impressions: 0, clicks: 0 } },
      contentImpressions: 1,
      feedImpressions: 1,
      creativeKind: 'text',
      videoPlays: 0,
      videoCompletions: 0,
      verifiedConversions: 0,
      selfReportedConversions: null,
      advertiserSatisfaction: null,
      simulatedRevenueCents: 0,
    }
    renderApp('/app/ads', f.api)
    // Approving needs the Advertising Policy confirmation (founder decision, Nov 25).
    expect(((await screen.findByRole('button', { name: 'Approve Budgetly' })) as HTMLButtonElement).disabled).toBe(true)
    fireEvent.click(screen.getByRole('checkbox', { name: /Meets the Advertising Policy.*Budgetly/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Approve Budgetly' }))
    await waitFor(() => expect(f.ads.reviews).toEqual([{ id: 'a1', approve: true }]))
    fireEvent.click(screen.getByRole('button', { name: 'Activate Spring' }))
    await waitFor(() => expect(f.ads.statuses).toEqual([{ id: 'k1', status: 'active' }]))
    fireEvent.click(screen.getByRole('button', { name: 'Report for Spring' }))
    const rep = await screen.findByTestId('campaign-report')
    expect(rep.textContent).toMatch(/Actual observations, aggregate only/)
    expect(rep.textContent).toMatch(/Eligible audience \(chose a matching category\)fewer than 10/)
    expect(rep.textContent).toMatch(/Click-through rate50\.0%/)
    fireEvent.change(screen.getByLabelText('Advertiser name'), { target: { value: 'Shop Co' } })
    fireEvent.change(screen.getByLabelText('What they sell'), { target: { value: 'Kitchen tools' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save advertiser' }))
    await waitFor(() => expect(f.ads.savedAdvertisers[0]).toMatchObject({ name: 'Shop Co', offering: 'Kitchen tools', objective: 'traffic' }))
    expect(screen.getByTestId('ad-demand').textContent).toMatch(/Software & appsfewer than 10/)
  })
})

// ---------------------------------------------------------------------------
function creatorInsightsFixture(over: Partial<CreatorInsights> = {}): CreatorInsights {
  return {
    days: 7,
    attention: {
      followers: 10,
      new_followers: 4,
      new_followers_before: 2,
      sources: { discover: 3, search: 1 },
      reached: 6,
      posts: 2,
      top_posts: [{ id: 'p1', excerpt: 'Budget tips', topic: 'money', views: 6, comments: 2, saves: 1, reposts: 0, shares: 1 }],
    },
    retention: { followers: 10, active_supporters: 3, clique: 2, returning: 4, connections_this_week: 5, connections_last_week: 3 },
    money: {
      actual_income_cents: 0,
      simulated_by_month: [{ month: '2026-10-01', creator_cents: 4000 }],
      ads_with_your_posts: [{ advertiser: 'Budgetly', campaign: 'Spring', impressions: 120, clicks: 6, posts: 2 }],
    },
    ...over,
  }
}
function overviewFixture(): FounderOverview {
  const weeks = Array.from({ length: 8 }, (_, i) => ({
    week_start: `2026-10-${String(5 + i * 7).padStart(2, '0')}T04:00:00Z`,
    connections: 10 + i,
    founder_dependent: 2,
    test: 1,
  }))
  return {
    generated_at: '2026-11-25T18:00:00Z',
    week_start: '2026-11-23T05:00:00Z',
    north_star: { kind: 'actual', definition: 'Unique (consumer, creator) pairs…', weeks },
    members: {
      kind: 'actual',
      active_members: 40,
      test_members: 3,
      registrations_this_week: 5,
      registration_cap: 200,
      registration_paused: false,
      by_referral: 7,
      activation_eligible: 10,
      activated: 6,
      retained: 8,
    },
    discovery: { kind: 'actual', searches_7d: 30, searches_with_results_7d: 25, follows_7d: 12, follows_from_search_7d: 4, follows_from_discover_7d: 5 },
    content: { kind: 'actual', posts_7d: 22, creators_posting_7d: 6, meaningful_comments_7d: 14 },
    rewards: { kind: 'simulated', recognized_points: 300, referrals_waiting: 2, open_pool_cents: 6240, revenue_cents: 31200 },
    advertising: { kind: 'actual', active_campaigns: 1, impressions_7d: 210, clicks_7d: 9, hidden_or_reported_7d: 1, members_with_preferences: 12 },
    governance: { kind: 'actual', open_reports: 0, oldest_open_report_hours: null, open_appeals: 1, blocks_7d: 0, active_limits: 0 },
    operations: { kind: 'actual', external_access_approved: false },
  }
}

describe('intelligence (20261210000000): what happened, what it means, what to do next', () => {
  it('the creator story rules follow the data', () => {
    const i = creatorInsightsFixture()
    const a = attentionStory(i)
    expect(a.happened).toBe('Every post was available to all 10 followers. 6 of them saw at least one.')
    expect(a.means).toMatch(/growing: 4 new followers, up from 2.*Most came from Discover\. 60% of followers saw something/)
    expect(attentionStory(creatorInsightsFixture({ attention: { ...i.attention, posts: 0 } })).next).toMatch(/Post something this week/)
    expect(retentionStory(i).happened).toMatch(/^5 followers connected.*up 2 on last week/)
    const m = moneyStory(i, null)
    expect(m.happened).toMatch(/would earn you \$40\.00 for October 2026/)
    expect(m.means).toMatch(/Spring \(Budgetly\) carried most of it: 120 impressions/)
    expect(
      contributionStory({
        connections_this_week: 2,
        connections_last_week: 1,
        referrals: { joined: 1, waiting_review: 1, approved: 0, not_approved: 0 },
        opportunities: [{ post_id: 'p', creator: 'Kofi', username: 'kofi', excerpt: 'x' }],
      }).next,
    ).toBe("Share Kofi's new post with someone who'd value it.")
  })

  it('the Profile has four faces; Attention shows availability versus reach and where followers came from', async () => {
    const f = fakeApi()
    f.intel.creator = creatorInsightsFixture()
    renderApp('/app/profile?face=attention', f.api)
    const face = await screen.findByTestId('attention-face')
    expect(screen.getAllByRole('tab').map((t) => t.textContent)).toEqual(['Profile', 'Reach', 'Connection', 'Earnings'])
    expect(face.textContent).toMatch(/What happened.*What it means.*What to do next/)
    expect(face.textContent).toMatch(/Available\. Your posts were in every follower's Home\..*Reached\. Followers who actually viewed a post/)
    expect(face.textContent).toMatch(/Where your 4 new followers came from.*Discover.*3.*Search.*1/)
  })

  it('the Money face keeps simulated earnings, actual income and non-binding Support Intent apart, without percentages', async () => {
    const f = fakeApi()
    f.intel.creator = creatorInsightsFixture()
    renderApp('/app/profile?face=money', f.api)
    const face = await screen.findByTestId('money-face')
    expect(face.textContent).toMatch(/Simulated.*Not paid during the pilot/)
    expect(face.textContent).toMatch(/Ads shown with your posts.*Actual.*Spring · Budgetly.*120 impressions · 6 clicks/)
    expect(face.textContent).toMatch(/Actual income.*\$0\.00/)
    expect(face.textContent).not.toMatch(/\d+\s*%/)
  })

  it("My Split shows the member's week, their referrals and opportunities", async () => {
    const f = fakeApi()
    f.intel.contribution = {
      connections_this_week: 2,
      connections_last_week: 1,
      referrals: { joined: 2, waiting_review: 1, approved: 1, not_approved: 0 },
      opportunities: [{ post_id: 'p9', creator: 'Kofi', username: 'kofi', excerpt: 'Weekly budget' }],
    }
    renderApp('/app/split', f.api)
    const panel = await screen.findByTestId('contribution-insight')
    expect(panel.textContent).toMatch(/You connected with 2 creators this week \(last week: 1\)/)
    expect(panel.textContent).toMatch(/2 people joined through your link: 1 qualified, 1 waiting for review/)
    expect(within(panel).getByRole('link', { name: 'Kofi: Weekly budget' }).getAttribute('href')).toBe('/app/post/p9')
  })

  it('opening a post records qualifying consumption', async () => {
    const f = fakeApi()
    const post = f.seedPost('c1', 'Opened post')
    renderApp(`/app/post/${post}`, f.api)
    await screen.findByText('Opened post')
    await waitFor(() => expect(f.intel.opens).toEqual([post]))
  })

  it('the Control Center shows the North Star with test data excluded, labels every figure, and exports', async () => {
    const f = fakeApi('me', { founder: true })
    f.intel.overview = overviewFixture()
    renderApp('/app/control', f.api)
    expect((await screen.findByTestId('north-star')).textContent).toBe('17')
    const cc = screen.getByTestId('control-center')
    expect(cc.textContent).toMatch(/North Star · Actual.*2 from founder-dependent activity · 1 test-data connections excluded/)
    expect(cc.textContent).toMatch(/Fan pool.*Simulated.*\$62\.40/)
    expect(cc.textContent).toMatch(/Test accounts.*Test data.*3/)
    expect(document.body.textContent).toMatch(/Business hypotheses.*Hypothesis.*Not validated\. Simulated money is never evidence of commercial success/)
    const csv = overviewCsv(f.intel.overview)
    expect(csv.split('\n')[0]).toBe('section,metric,value,kind')
    expect(csv).toMatch(/rewards,open_pool_cents,6240,simulated/)
    expect(csv).toMatch(/members,test_members,3,test/)
    expect(csv).toMatch(/hypothesis$/m)
    expect(founderStory(f.intel.overview).happened).toMatch(/^17 creator-consumer connections this week, up 6% on last week; 2 involve you\./)
  })

  it('members cannot open the Control Center', async () => {
    const f = fakeApi()
    renderApp('/app/control', f.api)
    expect(await screen.findByText('Only the founder can see this.')).toBeTruthy()
  })

  it('advertiser observations: small samples are called noise; high negative feedback leads to a review', () => {
    const base: CampaignReport = {
      eligibleAudience: 12,
      served: 300,
      impressions: 250,
      clicks: 10,
      ctr: 0.04,
      reach: 40,
      relevant: 5,
      notRelevant: 10,
      hidden: 4,
      reported: 1,
      byMatch: { preference: { impressions: 150, clicks: 8 }, context: { impressions: 0, clicks: 0 }, general: { impressions: 100, clicks: 2 } },
      contentImpressions: 200,
      feedImpressions: 50,
      creativeKind: 'text',
      videoPlays: 0,
      videoCompletions: 0,
      verifiedConversions: 1,
      selfReportedConversions: 4,
      advertiserSatisfaction: null,
      simulatedRevenueCents: 0,
    }
    const s = campaignStory(base)
    expect(s.means).toMatch(/Preference-based delivery clicked at 5\.3% against 2\.0% when not personalized\. 15 members found it not relevant/)
    expect(s.next).toMatch(/Review the creative and categories/)
    expect(campaignStory({ ...base, byMatch: { ...base.byMatch, preference: { impressions: 20, clicks: 1 } } }).means).toMatch(/Too few impressions yet/)
  })
})

describe('unified account and progressive onboarding (20261211000000, 20261212000000)', () => {
  it('setup shows who invited you (follow only by choice), then explains My Split, and points creators to their setup', async () => {
    const f = fakeApi('me', { details: 'new' })
    f.onb.inviter = { id: 'c1', username: 'creator_1', displayName: 'Creator 1', following: false, postingTopics: [] }
    renderApp('/app', f.api)
    await screen.findByRole('heading', { name: 'What brings you to Splitpost?' })
    fireEvent.click(screen.getByRole('radio', { name: /Share my own work/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Skip the rest' }))
    const card = await screen.findByTestId('inviter-card')
    expect(within(card).getAllByText(/Creator 1/).length).toBeGreaterThan(0)
    expect(f.follows.has(f.key('me', 'c1'))).toBe(false)
    fireEvent.click(within(card).getByRole('button', { name: 'Not now' }))
    expect(within(card).getByText(/You can follow them from their profile any time/)).toBeTruthy()
    expect(f.follows.has(f.key('me', 'c1'))).toBe(false)
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }))
    expect(await screen.findByRole('heading', { name: 'How My Split works' })).toBeTruthy()
    const intro = screen.getByTestId('my-split-intro')
    expect(intro.textContent).toMatch(/Points are not money and nothing is paid/)
    expect(intro.textContent).not.toMatch(/\b(40|20)\s*%/)
    expect(screen.getByRole('link', { name: 'Set up my creator profile' })).toBeTruthy()
  })

  it('following the inviter is one tap and is recorded', async () => {
    const f = fakeApi('me', { details: 'new' })
    f.onb.inviter = { id: 'c1', username: 'creator_1', displayName: 'Creator 1', following: false, postingTopics: [] }
    renderApp('/app', f.api)
    await screen.findByRole('heading', { name: 'What brings you to Splitpost?' })
    fireEvent.click(screen.getByRole('button', { name: 'Skip the rest' }))
    const card = await screen.findByTestId('inviter-card')
    fireEvent.click(within(card).getByRole('button', { name: 'Follow Creator 1' }))
    expect(await within(card).findByText("You're following Creator 1.")).toBeTruthy()
    expect(f.follows.has(f.key('me', 'c1'))).toBe(true)
  })

  it('creator setup on Profile saves up to three posting topics and guides the first post', async () => {
    const f = fakeApi()
    renderApp('/app/profile', f.api)
    const setup = await screen.findByTestId('creator-setup')
    expect(within(setup).getByText(/Optional\. Every Splitpost account can post/)).toBeTruthy()
    fireEvent.click(await within(setup).findByRole('button', { name: 'Music' }))
    fireEvent.click(within(setup).getByRole('button', { name: 'Food & cooking' }))
    fireEvent.click(within(setup).getByRole('button', { name: 'Save topics' }))
    expect(await within(setup).findByText(/You'll appear in suggestions for these topics/)).toBeTruthy()
    expect(f.onb.topicCalls.at(-1)).toEqual(['music', 'food'])
    expect(within(setup).getByRole('link', { name: 'Write a post' }).getAttribute('href')).toBe('/app/new')
    cleanup()
    renderApp('/app/new', f.api)
    expect(await screen.findByTestId('first-post-guide')).toBeTruthy()
  })

  it('any member can ask to advertise from their account; the request waits for review', async () => {
    const f = fakeApi()
    renderApp('/app/profile', f.api)
    expect((await screen.findByRole('link', { name: 'Advertise with Splitpost' })).getAttribute('href')).toBe('/app/advertise')
    cleanup()
    renderApp('/app/advertise', f.api)
    expect(await screen.findByRole('heading', { name: 'Tell us about your business' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Send my request' }))
    expect(await screen.findByText(/Please answer every question/)).toBeTruthy()
    expect(f.onb.adRequests).toHaveLength(0)
    const fill = (label: string, value: string) => fireEvent.change(screen.getByLabelText(label), { target: { value } })
    fill('Business name', 'Budgetly')
    fill('Website', 'https://budgetly.example')
    fill('What do you offer?', 'A budgeting app')
    fill('What problem does it solve?', 'Money stress')
    fill('What do your customers need?', 'A simple plan')
    fill('What outcome do you want for them?', 'Save more')
    fill('What should people do after seeing your ad?', 'Start a free trial')
    const categories = screen.getByRole('group', { name: 'What you sell' })
    fireEvent.click(within(categories).getAllByRole('button')[0])
    fireEvent.click(screen.getByRole('button', { name: 'Send my request' }))
    expect(await screen.findByText(/Your request is with the Splitpost team/)).toBeTruthy()
    expect(f.onb.adRequests[0]).toMatchObject({ name: 'Budgetly', objective: 'awareness' })
    expect(await screen.findByText('Waiting for review')).toBeTruthy()
    expect(screen.queryByRole('heading', { name: 'Tell us about your business' })).toBeNull()
  })

  it('a member asks to delete their account only after confirming what it means', async () => {
    const f = fakeApi()
    renderApp('/app/privacy', f.api)
    fireEvent.click(await screen.findByRole('radio', { name: /Delete my account/ }))
    const send = screen.getByRole('button', { name: 'Send request' }) as HTMLButtonElement
    expect(send.disabled).toBe(true)
    fireEvent.click(screen.getByRole('checkbox', { name: /I understand my account/ }))
    fireEvent.click(send)
    expect(await screen.findByText(/We've received your request to delete your account/)).toBeTruthy()
    expect(f.onb.requests[0]).toMatchObject({ kind: 'deletion', status: 'open' })
    fireEvent.click(await screen.findByRole('button', { name: 'Withdraw' }))
    await waitFor(() => expect(f.onb.requests[0].status).toBe('withdrawn'))
  })

  it('the Control Center manages registration, invitation links, switches and deletion requests', async () => {
    const f = fakeApi('me', { founder: true })
    f.onb.requests = [
      {
        id: 7,
        kind: 'deletion',
        status: 'open',
        createdAt: '2026-12-01T00:00:00Z',
        resolvedAt: null,
        details: 'Please delete',
        username: 'dee',
        displayName: 'Dee',
      },
    ]
    renderApp('/app/control', f.api)
    const links = await screen.findByTestId('invitation-links-panel')
    fireEvent.change(within(links).getByLabelText("Creator's username (optional)"), { target: { value: 'creator_1' } })
    fireEvent.click(within(links).getByRole('button', { name: 'Create link' }))
    expect(await within(links).findByText('For @creator_1')).toBeTruthy()
    fireEvent.click(within(links).getByRole('button', { name: 'Stop this link' }))
    expect(await within(links).findByText('Stopped')).toBeTruthy()

    const reg = await screen.findByTestId('registration-panel')
    fireEvent.click(within(reg).getByRole('checkbox', { name: /Accept new registrations/ }))
    fireEvent.click(within(reg).getByRole('button', { name: 'Save registration settings' }))
    expect(await within(reg).findByText('Saved and recorded.')).toBeTruthy()
    expect(f.onb.registrationCalls.at(-1)?.paused).toBe(false)

    const sw = await screen.findByTestId('switches-panel')
    expect((within(sw).getByRole('button', { name: 'Turn new video uploads on' }) as HTMLButtonElement).disabled).toBe(true)
    fireEvent.change(within(sw).getByLabelText('Reason'), { target: { value: 'Review a complaint' } })
    fireEvent.click(within(sw).getByRole('button', { name: 'Turn advertising off' }))
    expect(await within(sw).findByText('Advertising: Off')).toBeTruthy()
    expect(f.onb.switchCalls[0]).toEqual({ feature: 'ads', enabled: false, reason: 'Review a complaint' })

    const pr = await screen.findByTestId('privacy-requests-panel')
    fireEvent.change(within(pr).getByLabelText('Type the username to confirm'), { target: { value: 'someone' } })
    fireEvent.click(within(pr).getByRole('button', { name: 'Delete this account' }))
    expect(await within(pr).findByText(/Type the confirmation exactly/)).toBeTruthy()
    fireEvent.change(within(pr).getByLabelText('Type the username to confirm'), { target: { value: 'dee' } })
    fireEvent.click(within(pr).getByRole('button', { name: 'Delete this account' }))
    await waitFor(() => expect(f.onb.deleted).toEqual([{ id: 7, username: 'dee' }]))
  })
})

describe('video posts (20261213000000)', () => {
  const chooseVideo = (name = 'IMG_0001.MOV', type = 'video/quicktime') =>
    fireEvent.change(screen.getByTestId('video-input'), { target: { files: [new File([new Uint8Array(2000)], name, { type })] } })

  it('while video posts are off, the composer offers no video', async () => {
    const f = fakeApi('me')
    renderApp('/app', f.api)
    await screen.findByRole('heading', { name: 'Home' })
    await act(async () => {})
    expect(screen.queryByRole('button', { name: 'Add video' })).toBeNull()
    expect(screen.queryByTestId('video-input')).toBeNull()
  })

  it('a member adds a video: it is checked, prepared, uploaded and checked by the server, then posted once with a player that never autoplays', async () => {
    const f = fakeApi('me', { video: true })
    renderApp('/app/new', f.api)
    fireEvent.click(await screen.findByRole('button', { name: 'Add video' }))
    chooseVideo()
    expect(await screen.findByText(/Ready to post: 0:20, 1280 x 720/)).toBeTruthy()
    expect(f.video.calls.slice(0, 4)).toEqual(['begin:post', 'upload:v1', 'verify:v1', 'poster:v1'])
    // One video per post: no photo or second video while it is attached.
    expect(screen.queryByRole('button', { name: 'Add video' })).toBeNull()
    expect(screen.getByRole('textbox', { name: 'Write a post' }).getAttribute('placeholder')).toBe('Add a caption (optional)')
    const post = screen.getByRole('button', { name: 'Post' })
    expect(post.hasAttribute('disabled')).toBe(false)
    fireEvent.click(post)
    fireEvent.click(post)
    const player = (await screen.findByTestId('post-video-player')) as HTMLVideoElement
    expect(f.video.calls.filter((c) => c.startsWith('publish'))).toHaveLength(1)
    expect(player.getAttribute('src')).toMatch(/^https:\/\/videos\.test\/p\d+\.mp4$/)
    expect(player.getAttribute('poster')).toMatch(/-poster\.jpg$/)
    expect(player.hasAttribute('autoplay')).toBe(false)
    expect(player.getAttribute('preload')).toBe('none')
    expect(player.hasAttribute('controls')).toBe(true)
    expect(player.getAttribute('aria-label')).toBe('Video by Mia')
    // Swipes over the player never reach the screen.
    expect(screen.getByTestId('post-video').hasAttribute('data-no-swipe')).toBe(true)
    expect(screen.getByText('Video, 0:20')).toBeTruthy()
    expect(screen.queryByTestId('video-attachment')).toBeNull()
  })

  it('a video that cannot be used shows a clear message and can be removed; nothing is posted', async () => {
    const f = fakeApi('me', { video: true })
    renderApp('/app/new', f.api)
    fireEvent.click(await screen.findByRole('button', { name: 'Add video' }))
    chooseVideo('clip.hevc', 'video/mp4')
    expect(await screen.findByText(/Most Compatible/)).toBeTruthy()
    expect(f.video.calls).toEqual([])
    expect(screen.getByRole('button', { name: 'Post' }).hasAttribute('disabled')).toBe(true)
    fireEvent.click(screen.getByRole('button', { name: 'Remove video' }))
    expect(screen.queryByTestId('video-attachment')).toBeNull()
    // The server's check refuses too.
    f.video.verify = new AppApiError('video_codec')
    fireEvent.click(screen.getByRole('button', { name: 'Add video' }))
    chooseVideo()
    expect(await screen.findByText("That video couldn't be used. Please choose another one.")).toBeTruthy()
    expect(f.video.calls.some((c) => c.startsWith('publish'))).toBe(false)
    // Over five minutes: refused before any upload.
    fireEvent.click(screen.getByRole('button', { name: 'Remove video' }))
    const before = f.video.calls.length
    fireEvent.click(screen.getByRole('button', { name: 'Add video' }))
    chooseVideo('talk.long.mp4', 'video/mp4')
    expect(await screen.findByText(/longer than five minutes/)).toBeTruthy()
    expect(f.video.calls.length).toBe(before)
  })

  it('the device test page: testers check, convert and upload privately, see the times, play the clip and copy the results', async () => {
    const f = fakeApi('me', { tester: true })
    renderApp('/app/video-test', f.api)
    expect(await screen.findByRole('heading', { name: 'Video device test' })).toBeTruthy()
    fireEvent.click(await screen.findByRole('button', { name: 'Choose a video' }))
    fireEvent.change(screen.getByTestId('video-test-input'), { target: { files: [new File([new Uint8Array(3000)], 'IMG_0002.MOV', { type: 'video/quicktime' })] } })
    const runs = await screen.findByRole('list', { name: 'Test runs' })
    expect(await within(runs).findByText('IMG_0002.MOV: Pass')).toBeTruthy()
    expect(within(runs).getByText(/Check \d+\.\d s; Convert \d+\.\d s; Upload \d+\.\d s; Server check/)).toBeTruthy()
    expect(f.video.calls[0]).toBe('begin:device_test')
    fireEvent.click(screen.getByRole('button', { name: 'Play the uploaded clip' }))
    const player = (await screen.findByTestId('video-test-player')) as HTMLVideoElement
    expect(player.hasAttribute('autoplay')).toBe(false)
    expect(player.getAttribute('preload')).toBe('none')
    const summary = screen.getByLabelText('Summary to send to the Splitpost team') as HTMLTextAreaElement
    expect(summary.value).toMatch(/Run 1: IMG_0002\.MOV \(video\/quicktime, 0\.0 MB\): Pass/)
    const writeText = vi.fn(async () => {})
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
    fireEvent.click(screen.getByRole('button', { name: 'Copy results' }))
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(summary.value))
    expect(await screen.findByText(/Copied\./)).toBeTruthy()
  })

  it('the device test page is for the founder and testers only', async () => {
    const f = fakeApi('me')
    renderApp('/app/video-test', f.api)
    expect(await screen.findByText('The video device test is for the founder and testers.')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Choose a video' })).toBeNull()
  })

  it('the founder records both phone tests and the cap; only then can video posts be switched on', async () => {
    const f = fakeApi('me', { founder: true })
    renderApp('/app/control', f.api)
    const panel = await screen.findByTestId('video-readiness-panel')
    const sw = await screen.findByTestId('switches-panel')
    const turnOn = () => within(sw).getByRole('button', { name: 'Turn new video uploads on' }) as HTMLButtonElement
    expect(turnOn().disabled).toBe(true)
    expect(within(panel).getAllByText('Not tested yet')).toHaveLength(3)
    fireEvent.change(within(panel).getByLabelText('Device'), { target: { value: 'iphone_safari' } })
    fireEvent.change(within(panel).getByLabelText(/Notes/), { target: { value: 'iPhone 15: all passed' } })
    fireEvent.click(within(panel).getByRole('button', { name: 'Record result' }))
    expect(await within(panel).findByText('Device test recorded.')).toBeTruthy()
    fireEvent.change(within(panel).getByLabelText('Device'), { target: { value: 'android_chrome' } })
    fireEvent.click(within(panel).getByRole('radio', { name: 'Did not pass' }))
    fireEvent.click(within(panel).getByRole('button', { name: 'Record result' }))
    await waitFor(() => expect(f.video.tests).toHaveLength(2))
    expect(f.video.tests[1]).toMatchObject({ device: 'android_chrome', passed: false })
    fireEvent.click(within(panel).getByRole('radio', { name: 'Passed' }))
    fireEvent.click(within(panel).getByRole('button', { name: 'Record result' }))
    await waitFor(() => expect(f.video.tests).toHaveLength(3))
    expect(turnOn().disabled).toBe(true)
    fireEvent.change(within(panel).getByLabelText('Video storage cap (GB)'), { target: { value: '50' } })
    fireEvent.click(within(panel).getByRole('button', { name: 'Save cap' }))
    expect(await within(panel).findByText('Video storage cap saved.')).toBeTruthy()
    expect(f.video.capBytes).toBe(50 * 1073741824)
    await waitFor(() => expect(turnOn().disabled).toBe(false))
    fireEvent.change(within(sw).getByLabelText('Reason'), { target: { value: 'Both phones passed' } })
    fireEvent.click(turnOn())
    expect(await within(sw).findByText('New video uploads: On')).toBeTruthy()
    expect(f.video.on).toBe(true)
  })
})
