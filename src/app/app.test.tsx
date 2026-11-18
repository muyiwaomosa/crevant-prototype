// @vitest-environment jsdom
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
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
  type OwnProfile,
  type Post,
} from './api'
import { MemberArea } from './MemberArea'
import { AppNotFound, CliquePage, ComposePage, DiscoverPage, FeedPage, MemberPage, PostPage, ProfilePage } from './pages'

afterEach(cleanup)

// ---------------------------------------------------------------------------
// An in-memory stand-in for the database functions, with the same rules.

type Row = { id: string; username: string | null; displayName: string | null; createdAt: string }

function fakeApi(meId = 'me', opts: { profile?: Partial<Row> | null; creators?: number } = {}) {
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
  const maybeFail = (name: keyof AppApi) => {
    if (failures[name]) throw failures[name]
  }

  const api: AppApi = {
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
    async discover(query) {
      complete()
      const q = (query ?? '').trim().toLowerCase()
      return [...users.values()]
        .filter((u) => u.id !== meId && u.username && u.displayName && (!q || u.username.includes(q) || u.displayName.toLowerCase().includes(q)))
        .map((u) => ({
          ...summary(u.id),
          postCount: posts.filter((p) => p.author === u.id && !p.deleted).length,
          followerCount: [...follows].filter((k) => k.endsWith(`>${u.id}`)).length,
          followedByMe: follows.has(key(meId, u.id)),
          inMyClique: clique.has(key(meId, u.id)),
        }))
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
  }
  const seedPost = (author: string, body: string) => {
    const id = `p${++n}`
    posts.push({ id, author, body, at: (clock += 1000), deleted: false })
    return id
  }
  return { api, seedPost, follows, clique, failures, key }
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
