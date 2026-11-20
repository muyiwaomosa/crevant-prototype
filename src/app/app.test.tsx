// @vitest-environment jsdom
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
  type Comment,
  type MyDetails,
  type OwnProfile,
  type Post,
  type ProfileDetails,
} from './api'
import { MemberArea } from './MemberArea'
import { AppNotFound, CatchUpPage, CliquePage, ComposePage, DiscoverPage, FeedPage, MemberPage, PostPage, ProfilePage } from './pages'

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
  } = {},
) {
  const users = new Map<string, Row>()
  const add = (id: string, username: string | null, displayName: string | null) =>
    users.set(id, { id, username, displayName, createdAt: '2026-11-17T10:00:00Z' })
  if (opts.profile !== null) {
    const pr = opts.profile ?? {}
    add(meId, 'username' in pr ? pr.username ?? null : 'mia', 'displayName' in pr ? pr.displayName ?? null : 'Mia')
  }
  for (let i = 1; i <= (opts.creators ?? 11); i++) add(`c${i}`, `creator_${i}`, `Creator ${i}`)
  const posts: Array<{ id: string; author: string; body: string; at: number; deleted: boolean }> = []
  const follows = new Set<string>()
  const followedAt = new Map<string, number>()
  const views = new Set<string>()
  const marks: Array<{ ids: string[]; basis: string }> = []
  const clique = new Set<string>()
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
    return d ? { identity: d.identity, bio: d.bio, followReason: d.followReason, topics: [...d.topics] } : { identity: null, bio: null, followReason: null, topics: [] }
  }
  const shared = (id: string) => detailsOf(id).topics.filter((t) => detailsOf(meId).topics.includes(t)).length
  // Pilot membership (20261122000000): active unless a test says otherwise.
  const access: { status: 'active' | 'none' | 'revoked' | 'expired'; expiresAt: string | null } = { status: 'active', expiresAt: null }
  const maybeFail = (name: keyof AppApi) => {
    if (failures[name]) throw failures[name]
  }

  const api: AppApi = {
    async accessState() {
      maybeFail('accessState')
      return { status: access.status, expiresAt: access.expiresAt }
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
    async feed(before) {
      complete()
      return posts
        .filter((p) => !p.deleted && (p.author === meId || follows.has(key(meId, p.author))) && (!before || p.at < Date.parse(before)))
        .sort((a, b) => b.at - a.at)
        .slice(0, 20)
        .map(toP)
    },
    async member(username) {
      complete()
      const u = [...users.values()].find((x) => x.username === username && x.displayName)
      if (!u) return null
      return {
        ...summary(u.id),
        postCount: posts.filter((p) => p.author === u.id && !p.deleted).length,
        followerCount: [...follows].filter((k) => k.endsWith(`>${u.id}`)).length,
        followingCount: [...follows].filter((k) => k.startsWith(`${u.id}>`)).length,
        followedByMe: follows.has(key(meId, u.id)),
        inMyClique: clique.has(key(meId, u.id)),
        isMe: u.id === meId,
      }
    },
    async memberPosts(id, before) {
      complete()
      return posts
        .filter((p) => !p.deleted && p.author === id && (!before || p.at < Date.parse(before)))
        .sort((a, b) => b.at - a.at)
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
      details.set(meId, { identity: d.identity, bio: d.bio?.trim() || null, followReason: d.followReason?.trim() || null, topics: [...new Set(d.topics)], onboarded: true })
    },
    async memberDetails(id) {
      if (detailsMode === 'absent') return null
      complete()
      return users.get(id)?.displayName ? detailsOf(id) : null
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
        .map((id) => ({ ...summary(id), followedAt: '2026-11-17T11:00:00Z', inMyClique: clique.has(key(meId, id)), cliqueAddedAt: clique.has(key(meId, id)) ? '2026-11-17T11:30:00Z' : null }))
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
    async follow(id) {
      if (id === meId) throw new AppApiError('cannot_follow_self')
      if (!follows.has(key(meId, id))) followedAt.set(key(meId, id), (clock += 1))
      follows.add(key(meId, id))
    },
    async unfollow(id) {
      follows.delete(key(meId, id))
      clique.delete(key(meId, id))
    },
    async cliqueAdd(id) {
      if (!follows.has(key(meId, id))) throw new AppApiError('not_following')
      if (clique.has(key(meId, id))) return
      if ([...clique].filter((k) => k.startsWith(`${meId}>`)).length >= 25) throw new AppApiError('clique_full')
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
  return { api, seedPost, follows, clique, failures, key, views, marks, followedAt, access, setDetails, savedDetails, details }
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
            <Route path="catch-up/:username" element={<CatchUpPage />} />
            <Route path="profile" element={<ProfilePage />} />
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
    expect(messageFor(new AppApiError('clique_full'))).toMatch(/full \(25\)/)
    expect(messageFor(new Error('relation "social.posts" does not exist'))).toBe('Something went wrong. Please try again.')
  })

  it('maps database rows to posts, including counts sent as text', () => {
    const p = toPost({
      id: 'p1', author_id: 'a', author_username: 'aye', author_display_name: 'Aye', body: 'hi', created_at: '2026-11-17T12:00:00Z',
      like_count: '3', comment_count: 2, liked_by_me: true, author_in_my_clique: false, is_mine: false,
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
    for (const path of ['/app/discover', '/app/new', '/app/clique', '/app/profile', '/app/u/creator_1', '/app/post/p1']) {
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
    expect(await screen.findByText('Step 1 of 5: Your name')).toBeTruthy()
    fireEvent.change(screen.getByLabelText('Username'), { target: { value: 'mia' } })
    fireEvent.change(screen.getByLabelText('Display name'), { target: { value: 'Mia' } })
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }))

    // 2. Identity: descriptive only, and the page says so.
    expect(await screen.findByRole('heading', { name: 'How will you use Splitpost?' })).toBeTruthy()
    const bar = screen.getByRole('progressbar', { name: 'Profile setup' })
    expect(bar.getAttribute('aria-valuenow')).toBe('2')
    expect(screen.getByText(/This only describes you\. Everyone can post, follow and build a Clique, whatever you choose/)).toBeTruthy()
    expect((screen.getByRole('button', { name: 'Continue' }) as HTMLButtonElement).disabled).toBe(true)
    fireEvent.click(screen.getByRole('radio', { name: /Creator/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }))

    // 3. Interests, from the database's list, at most 5.
    expect(await screen.findByRole('heading', { name: 'What are you into?' })).toBeTruthy()
    for (const t of ['Food & cooking', 'Music']) fireEvent.click(screen.getByRole('button', { name: t }))
    expect(screen.getByRole('button', { name: 'Music' }).getAttribute('aria-pressed')).toBe('true')
    expect(screen.getByText(/2 of 5 chosen/)).toBeTruthy()
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
    expect(await within(first).findByRole('button', { name: 'Unfollow Creator 1' })).toBeTruthy()
    expect(f.follows.has(f.key('me', 'c1'))).toBe(true)
    fireEvent.click(screen.getByRole('button', { name: 'Go to my feed' }))
    expect(await screen.findByRole('heading', { name: 'Home' })).toBeTruthy()
  })

  it('every step can be skipped: "Skip the rest" saves empty details and setup is not shown again', async () => {
    const f = fakeApi('me', { details: 'new' })
    const view = renderApp('/app', f.api)
    expect(await screen.findByRole('heading', { name: 'How will you use Splitpost?' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Skip the rest' }))
    expect(await screen.findByRole('heading', { name: 'People you might like' })).toBeTruthy()
    expect(f.savedDetails).toEqual([{ identity: null, bio: null, followReason: null, topics: [] }])
    fireEvent.click(screen.getByRole('button', { name: 'Go to my feed' }))
    expect(await screen.findByRole('heading', { name: 'Home' })).toBeTruthy()
    view.unmount()
    renderApp('/app', f.api)
    expect(await screen.findByRole('heading', { name: 'Home' })).toBeTruthy()
    expect(screen.queryByRole('progressbar')).toBeNull()
  })

  it('checks the limits before saving, and keeps the member on the step if saving fails', async () => {
    const f = fakeApi('me', { details: 'new' })
    renderApp('/app', f.api)
    await screen.findByRole('heading', { name: 'How will you use Splitpost?' })
    fireEvent.click(screen.getByRole('button', { name: 'Skip for now: how you use Splitpost' }))
    await screen.findByRole('heading', { name: 'What are you into?' })
    for (const t of ['Food & cooking', 'Money & business', 'Tech', 'Music', 'Travel']) fireEvent.click(screen.getByRole('button', { name: t }))
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
    renderApp('/app/discover', f.api)
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
    renderApp('/app/discover', f.api)
    const items = await screen.findAllByRole('listitem')
    expect(within(items[0]).getByRole('link', { name: 'Creator 1' })).toBeTruthy()
    expect(within(items[0]).getByText('Shares 1 of your interests')).toBeTruthy()
    expect(within(items[0]).getByText(/Why follow:/)).toBeTruthy()
    expect(within(items[0]).getByText(/Creator ·/)).toBeTruthy()
    const filter = screen.getByLabelText('Browse by interest') as HTMLSelectElement
    expect([...filter.options].map((o) => o.textContent)).toEqual(['Everyone', 'Food & cooking', 'Money & business', 'Tech', 'Music', 'Travel', 'Books & writing'])
    fireEvent.change(filter, { target: { value: 'travel' } })
    await waitFor(() => expect(screen.queryByRole('link', { name: 'Creator 1' })).toBeNull())
    expect(screen.getByRole('link', { name: 'Creator 2' })).toBeTruthy()
    expect(screen.getByText(/Creator and fan ·/)).toBeTruthy()
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
    expect(within(about).getByText('Creator')).toBeTruthy()
    expect(within(about).getByText('Budget recipes.')).toBeTruthy()
    expect(within(about).getByText('Why follow')).toBeTruthy()
    expect(within(about).getByText('A new recipe every week')).toBeTruthy()
    expect(within(within(about).getByRole('list', { name: 'Interests' })).getAllByRole('listitem').map((li) => li.textContent)).toEqual(['Food & cooking', 'Music'])
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
    expect((screen.getByRole('radio', { name: /Fan/ }) as HTMLInputElement).checked).toBe(true)
    expect((screen.getByLabelText('Short bio') as HTMLTextAreaElement).value).toBe('Old bio')
    fireEvent.click(screen.getByRole('radio', { name: /Both/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Music' }))
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

describe('feed and posting', () => {
  it('starts quiet, points to Discover, and shows your own post after posting', async () => {
    const { api } = fakeApi()
    renderApp('/app', api)
    expect(await screen.findByText('Your feed is quiet')).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Discover people' }).getAttribute('href')).toBe('/app/discover')
    fireEvent.change(screen.getByLabelText('Write a post'), { target: { value: '  My first post  ' } })
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
    renderApp('/app', api)
    await screen.findByText('Your feed is quiet')
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
    renderApp('/app', api)
    await screen.findByText('Your feed is quiet')
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
    renderApp('/app', api)
    await screen.findByText('Your feed is quiet')
    fireEvent.change(screen.getByLabelText('Write a post'), { target: { value: 'First draft' } })
    fireEvent.click(screen.getByRole('button', { name: 'Post' }))
    await screen.findByText("We couldn't reach Splitpost. Check your connection and try again.")
    fireEvent.change(screen.getByLabelText('Write a post'), { target: { value: 'Second draft' } })
    fireEvent.click(screen.getByRole('button', { name: 'Post' }))
    await screen.findByText('Second draft')
    fireEvent.change(screen.getByLabelText('Write a post'), { target: { value: 'Another post' } })
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
    fireEvent.click(await ready('Like (0 likes)'))
    fireEvent.click(await ready('Unlike (1 likes)'))
    await ready('Like (0 likes)')
    failures.like = new AppApiError('not_found')
    fireEvent.click(await ready('Like (0 likes)'))
    expect((await screen.findByRole('alert')).textContent).toMatch(/no longer available/)
    expect(await ready('Like (0 likes)')).toBeTruthy()
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
    renderApp('/app/discover', api)
    fireEvent.click(await screen.findByRole('button', { name: 'Follow Creator 1' }))
    expect(await screen.findByRole('button', { name: 'Unfollow Creator 1' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Add Creator 1 to your Clique' }))
    expect(await screen.findByRole('button', { name: 'Remove Creator 1 from your Clique (you keep following them)' })).toBeTruthy()
  })

  it('follows are unlimited: Following lists all 30 followed creators, each with its status', async () => {
    const { api } = setup(30, 2)
    renderApp('/app/clique', api)
    expect(await screen.findByText('30 creators')).toBeTruthy()
    expect(following().getAllByRole('listitem')).toHaveLength(30)
    expect(following().getAllByText('Clique')).toHaveLength(2)
    expect(following().getAllByRole('button', { name: /^Add Creator \d+ to your Clique$/ })).toHaveLength(28)
    expect(following().getAllByRole('button', { name: /^Unfollow Creator/ })).toHaveLength(30)
    expect(screen.getByLabelText('2 of 25 in your Clique').textContent).toBe('2/25')
  })

  it('adds and removes Clique creators; removing never unfollows', async () => {
    const fake = setup(3, 1)
    renderApp('/app/clique', fake.api)
    fireEvent.click(await (await loaded()).findByRole('button', { name: 'Add Creator 2 to your Clique' }))
    expect(await screen.findByLabelText('2 of 25 in your Clique')).toBeTruthy()
    expect((await screen.findByTestId('clique-status')).textContent).toMatch(/Creator 2 was added/)
    fireEvent.click(myClique().getByRole('button', { name: 'Remove Creator 1 from your Clique (you keep following them)' }))
    expect(await screen.findByLabelText('1 of 25 in your Clique')).toBeTruthy()
    expect(fake.follows.has(fake.key('me', 'c1'))).toBe(true)
    expect(following().getByRole('button', { name: 'Unfollow Creator 1' })).toBeTruthy()
    expect((await screen.findByTestId('clique-status')).textContent).toMatch(/You still follow them/)
  })

  it('unfollowing removes the creator from Following and My Clique', async () => {
    const fake = setup(2, 1)
    renderApp('/app/clique', fake.api)
    fireEvent.click(await (await loaded()).findByRole('button', { name: 'Unfollow Creator 1 (also removes them from your Clique)' }))
    expect(await screen.findByLabelText('0 of 25 in your Clique')).toBeTruthy()
    expect(screen.queryByText('Creator 1')).toBeNull()
    expect(innerOf(fake)).toEqual([])
  })

  it('at 25, adding opens the replacement dialog; the chosen creator is swapped out and stays followed', async () => {
    const fake = setup(27, 25)
    renderApp('/app/clique', fake.api)
    expect(await screen.findByLabelText('25 of 25 in your Clique')).toBeTruthy()
    const add = following().getByRole('button', { name: 'Add Creator 26 to your Clique' })
    expect(add.getAttribute('aria-haspopup')).toBe('dialog')
    fireEvent.click(add)
    const dialog = within(await screen.findByRole('dialog', { name: 'Your Clique is full' }))
    expect(dialog.getByText(/stays in Following/)).toBeTruthy()
    expect(dialog.getAllByRole('radio')).toHaveLength(25)
    const replace = dialog.getByRole('button', { name: 'Replace' }) as HTMLButtonElement
    expect(replace.disabled).toBe(true)
    fireEvent.click(dialog.getByRole('radio', { name: /Creator 3\b/ }))
    expect(replace.disabled).toBe(false)
    fireEvent.click(replace)
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect((await screen.findByTestId('clique-status')).textContent).toMatch(/Creator 26 replaced Creator 3 in your Clique/)
    expect(screen.getByLabelText('25 of 25 in your Clique')).toBeTruthy()
    expect(innerOf(fake)).toContain('me>c26')
    expect(innerOf(fake)).not.toContain('me>c3')
    expect(fake.follows.has(fake.key('me', 'c3'))).toBe(true)
    expect(following().getByRole('button', { name: 'Add Creator 3 to your Clique' })).toBeTruthy()
  })

  // Opens the replacement dialog for Creator 26 with c1..c25 in the Clique.
  async function openReplace(fake: ReturnType<typeof fakeApi>) {
    renderApp('/app/clique', fake.api)
    fireEvent.click(await (await loaded()).findByRole('button', { name: 'Add Creator 26 to your Clique' }))
    return within(await screen.findByRole('dialog', { name: 'Your Clique is full' }))
  }

  it('a refused replacement keeps the dialog open with the error focused, keeps the choice, and can be retried', async () => {
    const fake = setup(27, 25)
    const before = innerOf(fake)
    fake.failures.cliqueReplace = new AppApiError('rate_limited')
    const dialog = await openReplace(fake)
    fireEvent.click(dialog.getByRole('radio', { name: /Creator 3\b/ }))
    fireEvent.click(dialog.getByRole('button', { name: 'Replace' }))
    const alert = await dialog.findByRole('alert')
    expect(alert.textContent).toMatch(/going a little fast/)
    await waitFor(() => expect(alert.parentElement!.contains(document.activeElement)).toBe(true))
    expect(innerOf(fake)).toEqual(before)
    expect((dialog.getByRole('radio', { name: /Creator 3\b/ }) as HTMLInputElement).checked).toBe(true)
    expect((dialog.getByRole('button', { name: 'Replace' }) as HTMLButtonElement).disabled).toBe(false)
    delete fake.failures.cliqueReplace
    fireEvent.click(dialog.getByRole('button', { name: 'Replace' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(innerOf(fake)).toContain('me>c26')
    expect(innerOf(fake)).not.toContain('me>c3')
  })

  it('a stale choice (replaced in another tab) is refused, the list refreshes, and another choice works', async () => {
    const fake = setup(28, 25)
    const dialog = await openReplace(fake)
    fireEvent.click(dialog.getByRole('radio', { name: /Creator 3\b/ }))
    // Another tab swaps Creator 3 for Creator 28 meanwhile.
    fake.clique.delete(fake.key('me', 'c3'))
    fake.clique.add(fake.key('me', 'c28'))
    const before = innerOf(fake)
    fireEvent.click(dialog.getByRole('button', { name: 'Replace' }))
    expect((await dialog.findByRole('alert')).textContent).toMatch(/no longer in your Clique\. Nothing was changed/)
    expect(innerOf(fake)).toEqual(before)
    await waitFor(() => expect(dialog.queryByRole('radio', { name: /Creator 3\b/ })).toBeNull())
    expect(dialog.getByRole('radio', { name: /Creator 28\b/ })).toBeTruthy()
    expect(dialog.getAllByRole('radio')).toHaveLength(25)
    expect((dialog.getByRole('button', { name: 'Replace' }) as HTMLButtonElement).disabled).toBe(true)
    fireEvent.click(dialog.getByRole('radio', { name: /Creator 4\b/ }))
    fireEvent.click(dialog.getByRole('button', { name: 'Replace' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect((await screen.findByTestId('clique-status')).textContent).toMatch(/Creator 26 replaced Creator 4/)
    expect(innerOf(fake)).toContain('me>c26')
    expect(innerOf(fake)).toContain('me>c28')
  })

  it('if a place opened up elsewhere, the refused replacement turns into a plain add', async () => {
    const fake = setup(27, 25)
    const dialog = await openReplace(fake)
    fireEvent.click(dialog.getByRole('radio', { name: /Creator 5\b/ }))
    fake.clique.delete(fake.key('me', 'c5')) // removed in another tab: 24 now
    fireEvent.click(dialog.getByRole('button', { name: 'Replace' }))
    const room = within(await screen.findByRole('dialog', { name: 'Add to your Clique' }))
    expect(room.getByRole('alert').textContent).toMatch(/Nothing was changed/)
    expect(room.getByText(/There is room in your Clique now \(24\/25\)/)).toBeTruthy()
    fireEvent.click(room.getByRole('button', { name: 'Add Creator 26' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(screen.getByLabelText('25 of 25 in your Clique')).toBeTruthy()
    expect(innerOf(fake)).toContain('me>c26')
  })

  it('if the creator was unfollowed elsewhere, the dialog says so and changes nothing', async () => {
    const fake = setup(27, 25)
    const before = innerOf(fake)
    const dialog = await openReplace(fake)
    fireEvent.click(dialog.getByRole('radio', { name: /Creator 1\b/ }))
    fake.follows.delete(fake.key('me', 'c26'))
    fireEvent.click(dialog.getByRole('button', { name: 'Replace' }))
    const gone = within(await screen.findByRole('dialog', { name: 'No longer followed' }))
    expect(gone.getByText(/You no longer follow Creator 26/)).toBeTruthy()
    expect(gone.getByRole('alert').textContent).toMatch(/Follow this creator first/)
    expect(innerOf(fake)).toEqual(before)
    fireEvent.click(gone.getByRole('button', { name: 'Done' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  })

  it('the replacement dialog works from the keyboard: Escape and Cancel close it and change nothing', async () => {
    const fake = setup(27, 25)
    const before = innerOf(fake)
    renderApp('/app/clique', fake.api)
    const add = await (await loaded()).findByRole('button', { name: 'Add Creator 27 to your Clique' })
    add.focus()
    fireEvent.click(add)
    const dialog = await screen.findByRole('dialog')
    expect(document.activeElement).toBe(dialog)
    fireEvent.keyDown(document, { key: 'Escape' })
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(document.activeElement).toBe(add)
    fireEvent.click(add)
    fireEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Cancel' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(innerOf(fake)).toEqual(before)
  })

  it('a full Clique elsewhere links to the Clique page, which opens the replacement for that creator', async () => {
    const fake = setup(26, 25)
    renderApp('/app/u/creator_26', fake.api)
    fireEvent.click(await screen.findByRole('button', { name: 'Add Creator 26 to your Clique' }))
    expect((await screen.findByRole('alert')).textContent).toMatch(/full \(25\)/)
    fireEvent.click(screen.getByRole('link', { name: 'Choose who to replace' }))
    const dialog = within(await screen.findByRole('dialog', { name: 'Your Clique is full' }))
    expect(dialog.getByText('Creator 26')).toBeTruthy()
  })

  it('existing memberships show as they are', async () => {
    const fake = setup(11, 10, 11)
    renderApp('/app/clique', fake.api)
    expect(await screen.findByLabelText('10 of 25 in your Clique')).toBeTruthy()
    expect(myClique().getAllByRole('listitem')).toHaveLength(10)
    expect(screen.getByText('11 creators')).toBeTruthy()
  })

  it('unfollowing elsewhere removes Clique membership too', async () => {
    const { api, follows, clique, key } = fakeApi()
    follows.add(key('me', 'c1'))
    clique.add(key('me', 'c1'))
    renderApp('/app/u/creator_1', api)
    fireEvent.click(await screen.findByRole('button', { name: 'Unfollow Creator 1' }))
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
    renderApp('/app/discover', api)
    const card = within((await screen.findByRole('link', { name: 'Creator 1' })).closest('li')!)
    expect(card.getByRole('link', { name: 'See posts by Creator 1' }).getAttribute('href')).toBe('/app/u/creator_1#posts')
    expect(card.queryByRole('button', { name: 'Unfollow Creator 1' })).toBeNull()

    fireEvent.click(card.getByRole('button', { name: 'Follow Creator 1' }))
    const confirmation = within(await card.findByTestId('follow-confirmation'))
    expect(confirmation.getByText(/You're following/).textContent).toMatch(/Creator 1\. Their new posts will appear on Home, newest first\./)
    expect(card.getByRole('button', { name: 'Unfollow Creator 1' }).textContent).toBe('Following')
    // One "Add to Clique" only: the confirmation's.
    expect(card.getAllByRole('button', { name: 'Add Creator 1 to your Clique' })).toHaveLength(1)
    expect(confirmation.getByRole('link', { name: 'See their posts' }).getAttribute('href')).toBe('/app/u/creator_1#posts')

    fireEvent.click(confirmation.getByRole('button', { name: 'Add Creator 1 to your Clique' }))
    expect(await card.findByText(/They are in your Clique\./)).toBeTruthy()
    expect(clique.has(key('me', 'c1'))).toBe(true)
    expect(card.getByRole('button', { name: 'Remove Creator 1 from your Clique (you keep following them)' })).toBeTruthy()

    fireEvent.click(card.getByRole('button', { name: 'Not now' }))
    expect(card.queryByTestId('follow-confirmation')).toBeNull()
  })

  it('"See their posts" opens the profile at its posts', async () => {
    const { api, seedPost } = fakeApi()
    seedPost('c2', 'Something worth reading')
    renderApp('/app/discover', api)
    fireEvent.click(await screen.findByRole('button', { name: 'Follow Creator 2' }))
    fireEvent.click(await screen.findByRole('link', { name: 'See their posts' }))
    expect(await screen.findByRole('heading', { name: 'Creator 2', level: 1 })).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'Posts' }).id).toBe('posts')
    expect(await screen.findByText('Something worth reading')).toBeTruthy()
  })

  it('without posts, there is no "See posts" link, and the profile says what happens when they post', async () => {
    const { api } = fakeApi()
    renderApp('/app/discover', api)
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
    expect(confirmation.getByRole('button', { name: 'Add Creator 5 to your Clique' })).toBeTruthy()
  })

  it('adding from the confirmation when the Clique is full leads to the replacement choice', async () => {
    const fake = fakeApi('me', { creators: 26 })
    for (let i = 1; i <= 25; i++) {
      fake.follows.add(fake.key('me', `c${i}`))
      fake.clique.add(fake.key('me', `c${i}`))
    }
    renderApp('/app/u/creator_26', fake.api)
    fireEvent.click(await screen.findByRole('button', { name: 'Follow Creator 26' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Add Creator 26 to your Clique' }))
    expect((await screen.findByRole('alert')).textContent).toBe('Your Clique is full (25). Choose someone to replace.')
    expect(screen.getByRole('link', { name: 'Choose who to replace' }).getAttribute('href')).toBe('/app/clique?add=c26')
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

  it('the Home feed stays chronological, with no filters or extra tabs', async () => {
    const { api, seedPost, follows, clique, key } = fakeApi()
    follows.add(key('me', 'c1'))
    follows.add(key('me', 'c2'))
    clique.add(key('me', 'c2'))
    seedPost('c2', 'Older, from my Clique')
    seedPost('c1', 'Newer, from someone I follow')
    renderApp('/app', api)
    await screen.findByText('Newer, from someone I follow')
    const bodies = screen.getAllByTestId('post').map((p) => p.textContent ?? '')
    expect(bodies[0]).toMatch(/Newer, from someone I follow/)
    expect(bodies[1]).toMatch(/Older, from my Clique/)
    expect(screen.queryByRole('tablist')).toBeNull()
    expect(screen.queryByRole('button', { name: /Everyone|filter/i })).toBeNull()
  })

  it('a search with no matches offers to show everyone again', async () => {
    const { api } = fakeApi()
    renderApp('/app/discover', api)
    await screen.findByRole('link', { name: 'Creator 1' })
    fireEvent.change(screen.getByLabelText('Search people by name or username'), { target: { value: 'zzz' } })
    fireEvent.click(screen.getByRole('button', { name: 'Search' }))
    expect(await screen.findByText('No one matches "zzz". Try a different name or username.')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Show everyone' }))
    expect(await screen.findByRole('link', { name: 'Creator 1' })).toBeTruthy()
    expect((screen.getByLabelText('Search people by name or username') as HTMLInputElement).value).toBe('')
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

  it('the strip lists only followed creators with unseen posts, My Clique first, then newest, with 9+ badges', async () => {
    const fake = unseenSetup()
    for (let i = 0; i < 12; i++) fake.seedPost('c3', `c3 post ${i}`, T + i * 1000) // 12 unseen, newest of all
    fake.seedPost('c1', 'c1 post', T - 60_000) // Clique, older
    fake.seedPost('c2', 'c2 post', T - 30_000) // Clique, newer than c1
    fake.seedPost('c5', 'not followed', T + 99_000)
    renderApp('/app', fake.api)
    const strip = within(await screen.findByRole('region', { name: 'Catch up' }))
    const links = strip.getAllByRole('link')
    expect(links.map((l) => l.getAttribute('aria-label'))).toEqual([
      'Catch up with Creator 2 (in your Clique): 1 unseen post',
      'Catch up with Creator 1 (in your Clique): 1 unseen post',
      'Catch up with Creator 3: more than 9 unseen posts',
    ])
    expect(strip.getAllByTestId('unseen-badge').map((b) => b.textContent)).toEqual(['1', '1', '9+'])
    expect(links[2].getAttribute('href')).toBe('/app/catch-up/creator_3')
    // The main feed below is still chronological: the newest post first.
    expect(screen.getAllByTestId('post')[0].textContent).toMatch(/c3 post 11/)
  })

  it('the strip is hidden when nothing is unseen, and posts from before the follow do not count', async () => {
    const fake = fakeApi('me', { creators: 3 })
    fake.seedPost('c1', 'Before the follow')
    await fake.api.follow('c1') // follows now: the earlier post is not unseen
    renderApp('/app', fake.api)
    await screen.findByText('Before the follow')
    expect(screen.queryByRole('region', { name: 'Catch up' })).toBeNull()
  })

  it('catch-up shows the newest 20 unseen posts oldest first, then earlier ones on request, without repeats', async () => {
    const fake = unseenSetup()
    for (let i = 1; i <= 25; i++) fake.seedPost('c4', `Unseen ${String(i).padStart(2, '0')}`, T + i * 1000)
    renderApp('/app/catch-up/creator_4', fake.api)
    expect(await screen.findByRole('heading', { name: 'Catching up with Creator 4' })).toBeTruthy()
    await screen.findByText('Unseen 25')
    let bodies = screen.getAllByTestId('post').map((p) => p.textContent?.match(/Unseen \d{2}/)?.[0])
    expect(bodies).toEqual([...Array(20)].map((_, i) => `Unseen ${String(i + 6).padStart(2, '0')}`))
    // Earlier unseen posts remain, so it doesn't claim to be finished yet.
    expect(screen.queryByText("That's everything new from Creator 4")).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Show earlier unseen posts' }))
    await screen.findByText('Unseen 01')
    bodies = screen.getAllByTestId('post').map((p) => p.textContent?.match(/Unseen \d{2}/)?.[0])
    expect(bodies).toEqual([...Array(25)].map((_, i) => `Unseen ${String(i + 1).padStart(2, '0')}`))
    expect(screen.queryByRole('button', { name: 'Show earlier unseen posts' })).toBeNull()
    expect(screen.getByText("That's everything new from Creator 4")).toBeTruthy()
  })

  it('catch-up says when you are all caught up, and asks you to follow if you do not', async () => {
    const fake = unseenSetup()
    fake.seedPost('c5', 'From someone I do not follow')
    renderApp('/app/catch-up/creator_1', fake.api)
    expect(await screen.findByText("You're all caught up")).toBeTruthy()
    expect(screen.getByText('Nothing new from Creator 1.')).toBeTruthy()
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
      for (const o of observed) o.cb([{ target: o.el, isIntersecting: ratio > 0, intersectionRatio: ratio } as IntersectionObserverEntry], {} as IntersectionObserver)
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
      await screen.findByRole('region', { name: 'Catch up' })
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
      await screen.findByRole('region', { name: 'Catch up' })
      vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
      act(() => show(0.8))
      act(() => setVisibility('hidden'))
      act(() => show(0.2))
      act(() => setVisibility('visible'))
      await act(async () => vi.advanceTimersByTime(30_000))
      expect(fake.marks).toHaveLength(0)
    })

    it('posts at least half on screen for 2 seconds are recorded in one batch; own posts never; the strip refreshes', async () => {
      installObserver()
      const fake = unseenSetup()
      fake.seedPost('c3', 'One', T + 1000)
      fake.seedPost('c3', 'Two', T + 2000)
      fake.seedPost('me', 'My own post', T + 3000)
      renderApp('/app', fake.api)
      const strip = within(await screen.findByRole('region', { name: 'Catch up' }))
      expect(strip.getByTestId('unseen-badge').textContent).toBe('2')
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
      await act(async () => vi.advanceTimersByTime(2500)) // the strip refreshes shortly after
      vi.useRealTimers()
      await waitFor(() => expect(screen.queryByRole('region', { name: 'Catch up' })).toBeNull())
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
    for (const path of ['/app', '/app/discover', '/app/profile', '/app/u/creator_1', '/app/u/creator_26']) {
      renderApp(path, fake.api)
      await waitFor(() => expect(document.body.textContent).not.toMatch(/Loading|Checking/))
      expect(shownCopy()).not.toMatch(OLD)
      cleanup()
    }
    // The badge on a Clique creator's post reads "Clique".
    renderApp('/app', fake.api)
    expect(within(await screen.findByTestId('post')).getByText('Clique')).toBeTruthy()
    cleanup()

    // A full Clique elsewhere: the error and the link.
    renderApp('/app/u/creator_26', fake.api)
    fireEvent.click(await screen.findByRole('button', { name: 'Add Creator 26 to your Clique' }))
    expect((await screen.findByRole('alert')).textContent).toBe('Your Clique is full (25). Choose someone to replace.')
    expect(shownCopy()).not.toMatch(OLD)
    cleanup()

    // The Clique page, the replacement dialog, a refusal inside it, and the status after a replacement.
    renderApp('/app/clique', fake.api)
    const followingList = within(await screen.findByRole('region', { name: 'Following' }))
    expect(shownCopy()).not.toMatch(OLD)
    fireEvent.click(followingList.getByRole('button', { name: 'Add Creator 26 to your Clique' }))
    const dialog = within(await screen.findByRole('dialog', { name: 'Your Clique is full' }))
    expect(shownCopy()).not.toMatch(OLD)
    fake.failures.cliqueReplace = new AppApiError('not_in_clique')
    fireEvent.click(dialog.getByRole('radio', { name: /Creator 2\b/ }))
    fireEvent.click(dialog.getByRole('button', { name: 'Replace' }))
    expect((await dialog.findByRole('alert')).textContent).toBe('That creator is no longer in your Clique. Nothing was changed.')
    expect(shownCopy()).not.toMatch(OLD)
    delete fake.failures.cliqueReplace
    fireEvent.click(dialog.getByRole('button', { name: 'Replace' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect((await screen.findByTestId('clique-status')).textContent).toBe('Creator 26 replaced Creator 2 in your Clique. You still follow Creator 2.')
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
    expect(screen.getByLabelText('1 comments')).toBeTruthy()
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
    expect(await screen.findByLabelText('1 comments')).toBeTruthy()
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

describe('the members area', () => {
  it('has the main navigation and a way to reach the account page', async () => {
    const { api } = fakeApi()
    renderApp('/app', api)
    await screen.findByRole('heading', { name: 'Home' })
    const nav = screen.getAllByRole('navigation', { name: 'Main' })[0]
    for (const label of ['Home', 'Discover', 'Clique', 'Profile']) expect(within(nav).getByTitle(label)).toBeTruthy()
    expect(screen.getAllByRole('link', { name: 'Your account' })[0].getAttribute('href')).toBe('/app/account')
  })

  it('never mentions Connection Points, rewards or money in Release 1', async () => {
    const { api, seedPost, follows, key } = fakeApi()
    seedPost('c1', 'Hello')
    follows.add(key('me', 'c1'))
    for (const path of ['/app', '/app/discover', '/app/clique', '/app/profile']) {
      renderApp(path, api)
      await waitFor(() => expect(screen.queryByRole('status')).toBeNull())
      expect(document.body.textContent).not.toMatch(/Connection Points|\bCP\b|reward|cash|\$/i)
      cleanup()
    }
  })
})
