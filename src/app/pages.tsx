import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Compass, MessageCircle, Search, Trash2, UserPlus, Users } from 'lucide-react'
import { Card, EmptyState, PageHeader, buttonClass } from '../components/ui'
import { Message, Spinner } from '../public/auth/AuthUi'
import { LIMITS, type Comment, type DiscoverMember, type FollowedCreator, type Member, type Me, type Post } from './api'
import { useAppApi, useMyProfile } from './AppApiContext'
import { ErrorNote, MemberAvatar, MemberLink, PostItem, RelationshipButtons, TextComposer, When } from './components'
import { ProfileForm } from './MemberArea'

/** Loads data for a page, with loading and error states and a reload function. */
function useLoad<T>(load: () => Promise<T>, deps: unknown[]) {
  const [data, setData] = useState<T | undefined>(undefined)
  const [error, setError] = useState<unknown>(null)
  const [loading, setLoading] = useState(true)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const run = useCallback(load, deps)
  const reload = useCallback(async () => {
    try {
      const d = await run()
      setData(d)
      setError(null)
    } catch (e) {
      setError(e)
    } finally {
      setLoading(false)
    }
  }, [run])
  useEffect(() => {
    setLoading(true)
    void reload()
  }, [reload])
  return { data, setData, error, loading, reload }
}

function Loading({ label }: { label: string }) {
  return (
    <div className="py-10">
      <Spinner label={label} />
    </div>
  )
}

/** Posts with "Show older posts", newest first. */
function PostList({ posts, loadOlder, onDeleted }: { posts: Post[]; loadOlder: (before: string) => Promise<Post[]>; onDeleted: (id: string) => void }) {
  const [older, setOlder] = useState<Post[]>([])
  const [done, setDone] = useState(posts.length < 20)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<unknown>(null)
  const all = [...posts, ...older]
  useEffect(() => {
    setOlder([])
    setDone(posts.length < 20)
  }, [posts])

  async function more() {
    const last = all[all.length - 1]
    if (!last || busy) return
    setBusy(true)
    setError(null)
    try {
      const next = await loadOlder(last.createdAt)
      setOlder((o) => [...o, ...next])
      if (next.length < 20) setDone(true)
    } catch (e) {
      setError(e)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-3">
      {all.map((p) => (
        <PostItem
          key={p.id}
          post={p}
          onDeleted={(id) => {
            setOlder((o) => o.filter((x) => x.id !== id))
            onDeleted(id)
          }}
        />
      ))}
      {error !== null && <ErrorNote error={error} />}
      {!done && all.length > 0 && (
        <div className="flex justify-center pt-2">
          <button type="button" onClick={more} disabled={busy} className={buttonClass('secondary')}>
            {busy ? 'Loading…' : 'Show older posts'}
          </button>
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Home: the Following feed, newest first.

export function FeedPage() {
  const api = useAppApi()
  const feed = useLoad(() => api.feed(), [api])
  return (
    <>
      <PageHeader title="Home" subtitle="Posts from people you follow, newest first." />
      <Card className="mb-4 p-4 sm:p-5">
        <TextComposer
          label="Write a post"
          placeholder="Share something with the people who follow you…"
          max={LIMITS.post}
          submitLabel="Post"
          onSubmit={async (text, requestId) => {
            await api.createPost(text, requestId)
            await feed.reload()
          }}
        />
      </Card>
      {feed.loading && !feed.data && <Loading label="Loading your feed…" />}
      {feed.error !== null && <ErrorNote error={feed.error} />}
      {feed.data && feed.data.length === 0 && (
        <EmptyState
          icon={<Compass className="h-7 w-7" />}
          title="Your feed is quiet"
          body="Follow people to see their posts here, newest first. Nobody is added to your feed for you."
          action={
            <Link to="/app/discover" className={buttonClass('primary')}>
              Discover people
            </Link>
          }
        />
      )}
      {feed.data && feed.data.length > 0 && (
        <PostList
          posts={feed.data}
          loadOlder={(before) => api.feed(before)}
          onDeleted={(id) => feed.setData((d) => d?.filter((p) => p.id !== id))}
        />
      )}
    </>
  )
}

// ---------------------------------------------------------------------------
// Create a post.

export function ComposePage() {
  const api = useAppApi()
  const navigate = useNavigate()
  return (
    <>
      <PageHeader title="Create a post" subtitle="Text posts for now. Everyone who follows you will see it in their feed." />
      <Card className="p-4 sm:p-5">
        <TextComposer
          label="Write a post"
          placeholder="What do you want to share?"
          max={LIMITS.post}
          submitLabel="Post"
          rows={6}
          onSubmit={async (text, requestId) => {
            const id = await api.createPost(text, requestId)
            navigate(`/app/post/${id}`)
          }}
        />
      </Card>
    </>
  )
}

// ---------------------------------------------------------------------------
// Discover people.

export function DiscoverPage() {
  const api = useAppApi()
  const [query, setQuery] = useState('')
  const [submitted, setSubmitted] = useState('')
  const list = useLoad(() => api.discover(submitted), [api, submitted])

  function search(e: FormEvent) {
    e.preventDefault()
    setSubmitted(query.trim())
  }

  return (
    <>
      <PageHeader title="Discover" subtitle="Find people to follow. Most recently active first." />
      <form onSubmit={search} role="search" className="mb-4 flex gap-2">
        <label htmlFor="discover-search" className="sr-only">
          Search people by name or username
        </label>
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" aria-hidden="true" />
          <input
            id="discover-search"
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by name or username"
            className="block h-12 w-full rounded-2xl border border-ink-200 bg-white pl-10 pr-4 text-base text-ink-900 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-200"
          />
        </div>
        <button type="submit" className={buttonClass('secondary')}>
          Search
        </button>
      </form>
      {list.loading && !list.data && <Loading label="Finding people…" />}
      {list.error !== null && <ErrorNote error={list.error} />}
      {list.data && list.data.length === 0 && (
        <EmptyState icon={<Search className="h-7 w-7" />} title="Nobody found" body={submitted ? 'Try a different name or username.' : 'No other members yet.'} />
      )}
      {list.data && list.data.length > 0 && (
        <ul className="space-y-3">
          {list.data.map((m) => (
            <li key={m.id}>
              <PersonCard member={m} onChange={list.reload} />
            </li>
          ))}
        </ul>
      )}
    </>
  )
}

function PersonCard({ member, onChange }: { member: DiscoverMember; onChange: () => Promise<void> }) {
  return (
    <Card className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <MemberAvatar member={member} size={44} />
        <div className="min-w-0 leading-tight">
          <MemberLink member={member} />
          <p className="truncate text-[13px] text-ink-500">
            @{member.username} · {member.postCount} {member.postCount === 1 ? 'post' : 'posts'} · {member.followerCount}{' '}
            {member.followerCount === 1 ? 'follower' : 'followers'}
          </p>
        </div>
      </div>
      <RelationshipButtons member={member} onChange={onChange} />
    </Card>
  )
}

// ---------------------------------------------------------------------------
// A member's page.

export function MemberPage() {
  const api = useAppApi()
  const { username = '' } = useParams()
  const member = useLoad(() => api.member(username), [api, username])
  const m = member.data
  const posts = useLoad(async () => (m ? api.memberPosts(m.id) : []), [api, m?.id])

  if (member.loading && member.data === undefined) return <Loading label="Loading profile…" />
  if (member.error !== null) return <ErrorNote error={member.error} />
  if (!m) return <NotFoundPanel what="This member" />
  return (
    <>
      <MemberHeader member={m} onChange={member.reload} />
      <h2 className="mb-3 mt-6 font-display text-lg font-bold text-ink-900">Posts</h2>
      {posts.loading && !posts.data && <Loading label="Loading posts…" />}
      {posts.error !== null && <ErrorNote error={posts.error} />}
      {posts.data && posts.data.length === 0 && <Message tone="info">{m.isMe ? "You haven't posted yet." : `${m.displayName} hasn't posted yet.`}</Message>}
      {posts.data && posts.data.length > 0 && (
        <PostList
          posts={posts.data}
          loadOlder={(before) => api.memberPosts(m.id, before)}
          onDeleted={(id) => {
            posts.setData((d) => d?.filter((p) => p.id !== id))
            void member.reload()
          }}
        />
      )}
    </>
  )
}

function MemberHeader({ member, onChange }: { member: Member; onChange: () => Promise<void> }) {
  return (
    <Card className="p-5">
      <div className="flex items-center gap-4">
        <MemberAvatar member={member} size={64} />
        <div className="min-w-0">
          <h1 className="truncate font-display text-2xl font-extrabold text-ink-900">{member.displayName}</h1>
          <p className="text-[15px] text-ink-500">@{member.username}</p>
        </div>
      </div>
      <dl className="mt-4 flex gap-6 text-sm">
        <div>
          <dt className="text-ink-500">Posts</dt>
          <dd className="font-semibold tabular-nums text-ink-900">{member.postCount}</dd>
        </div>
        <div>
          <dt className="text-ink-500">Followers</dt>
          <dd className="font-semibold tabular-nums text-ink-900">{member.followerCount}</dd>
        </div>
        <div>
          <dt className="text-ink-500">Following</dt>
          <dd className="font-semibold tabular-nums text-ink-900">{member.followingCount}</dd>
        </div>
      </dl>
      <div className="mt-4">
        {member.isMe ? (
          <Link to="/app/profile" className={buttonClass('secondary', 'sm')}>
            Edit your profile
          </Link>
        ) : (
          <RelationshipButtons member={member} onChange={onChange} size="md" />
        )}
      </div>
    </Card>
  )
}

// ---------------------------------------------------------------------------
// One post and its comments.

export function PostPage() {
  const api = useAppApi()
  const navigate = useNavigate()
  const { id = '' } = useParams()
  const post = useLoad(() => api.post(id), [api, id])
  const comments = useLoad(() => api.comments(id), [api, id])

  if (post.loading && post.data === undefined) return <Loading label="Loading post…" />
  if (post.error !== null) return <ErrorNote error={post.error} />
  if (!post.data) return <NotFoundPanel what="This post" />
  const p = post.data
  return (
    <>
      <h1 className="sr-only">Post by {p.author.displayName}</h1>
      <PostItem post={p} linkToPost={false} onDeleted={() => navigate('/app', { replace: true })} />
      <section aria-labelledby="comments-title" className="mt-6">
        <h2 id="comments-title" className="mb-3 font-display text-lg font-bold text-ink-900">
          Comments
        </h2>
        <Card className="mb-3 p-4">
          <TextComposer
            label="Write a comment"
            placeholder="Add a thoughtful comment…"
            max={LIMITS.comment}
            submitLabel="Comment"
            rows={2}
            onSubmit={async (text, requestId) => {
              await api.addComment(p.id, text, requestId)
              await Promise.all([comments.reload(), post.reload()])
            }}
          />
        </Card>
        {comments.error !== null && <ErrorNote error={comments.error} />}
        {comments.data && comments.data.length === 0 && <Message tone="info">No comments yet.</Message>}
        {comments.data && comments.data.length > 0 && (
          <ul className="space-y-2">
            {comments.data.map((c) => (
              <li key={c.id}>
                <CommentItem
                  comment={c}
                  onDeleted={async () => {
                    await Promise.all([comments.reload(), post.reload()])
                  }}
                />
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  )
}

function CommentItem({ comment, onDeleted }: { comment: Comment; onDeleted: () => Promise<void> }) {
  const api = useAppApi()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<unknown>(null)
  async function remove() {
    setBusy(true)
    setError(null)
    try {
      await api.deleteComment(comment.id)
      await onDeleted()
    } catch (e) {
      setError(e)
      setBusy(false)
    }
  }
  return (
    <Card className="p-4">
      <div className="flex items-start gap-3" data-testid="comment">
        <MemberAvatar member={comment.author} size={32} />
        <div className="min-w-0 flex-1">
          <p className="text-[13px] leading-tight text-ink-500">
            <MemberLink member={comment.author} className="text-[14px]" /> · <When iso={comment.createdAt} />
          </p>
          <p className="mt-1 whitespace-pre-wrap break-words text-[15px] leading-relaxed text-ink-800">{comment.body}</p>
          {error !== null && (
            <div className="mt-2">
              <ErrorNote error={error} />
            </div>
          )}
        </div>
        {comment.isMine && (
          <button
            type="button"
            onClick={remove}
            disabled={busy}
            aria-label="Delete comment"
            className="inline-flex h-8 w-8 items-center justify-center rounded-full text-ink-500 hover:bg-ink-100 hover:text-ink-800"
          >
            <Trash2 className="h-4 w-4" aria-hidden="true" />
          </button>
        )}
      </div>
    </Card>
  )
}

// ---------------------------------------------------------------------------
// The Clique: up to 10 creators you choose from the people you follow.

export function CliquePage() {
  const api = useAppApi()
  const list = useLoad(() => api.following(), [api])
  const clique = (list.data ?? []).filter((f) => f.inMyClique)
  const others = (list.data ?? []).filter((f) => !f.inMyClique)
  const full = clique.length >= LIMITS.clique

  return (
    <>
      <PageHeader
        title="Your Clique"
        subtitle="Up to 10 creators you want a closer relationship with. You choose them from the people you follow; following someone never adds them for you."
      />
      {list.loading && !list.data && <Loading label="Loading your Clique…" />}
      {list.error !== null && <ErrorNote error={list.error} />}
      {list.data && (
        <>
          <section aria-labelledby="clique-title">
            <h2 id="clique-title" className="mb-3 flex items-baseline justify-between font-display text-lg font-bold text-ink-900">
              In your Clique
              <span className="text-sm font-semibold tabular-nums text-ink-500" aria-label={`${clique.length} of ${LIMITS.clique}`}>
                {clique.length}/{LIMITS.clique}
              </span>
            </h2>
            {clique.length === 0 ? (
              <EmptyState
                icon={<Users className="h-7 w-7" />}
                title="Nobody in your Clique yet"
                body={list.data.length === 0 ? 'Follow people first, then choose who belongs in your Clique.' : 'Add creators you follow from the list below.'}
                action={
                  list.data.length === 0 ? (
                    <Link to="/app/discover" className={buttonClass('primary')}>
                      Discover people
                    </Link>
                  ) : undefined
                }
              />
            ) : (
              <ul className="space-y-2">
                {clique.map((f) => (
                  <li key={f.id}>
                    <FollowedRow creator={f} onChange={list.reload} />
                  </li>
                ))}
              </ul>
            )}
          </section>
          {others.length > 0 && (
            <section aria-labelledby="following-title" className="mt-8">
              <h2 id="following-title" className="mb-1 font-display text-lg font-bold text-ink-900">
                People you follow
              </h2>
              {full && <p className="mb-3 text-sm text-ink-600">Your Clique is full. Remove someone to make room.</p>}
              <ul className="mt-3 space-y-2">
                {others.map((f) => (
                  <li key={f.id}>
                    <FollowedRow creator={f} onChange={list.reload} />
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}
    </>
  )
}

function FollowedRow({ creator, onChange }: { creator: FollowedCreator; onChange: () => Promise<void> }) {
  return (
    <Card className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <MemberAvatar member={creator} size={40} />
        <div className="min-w-0 leading-tight">
          <MemberLink member={creator} />
          <p className="truncate text-[13px] text-ink-500">
            @{creator.username} ·{' '}
            {creator.inMyClique && creator.cliqueAddedAt ? (
              <>
                in your Clique since <When iso={creator.cliqueAddedAt} />
              </>
            ) : (
              <>
                following since <When iso={creator.followedAt} />
              </>
            )}
          </p>
        </div>
      </div>
      <RelationshipButtons member={{ ...creator, followedByMe: true }} onChange={onChange} />
    </Card>
  )
}

// ---------------------------------------------------------------------------
// Your profile.

export function ProfilePage() {
  const api = useAppApi()
  const { profile, refresh } = useMyProfile()
  const me = useLoad<Me>(() => api.me(), [api, profile.username, profile.displayName])
  return (
    <>
      <PageHeader title="Your profile" subtitle="How people see you on Splitpost." />
      {me.data && (
        <Card className="mb-4 p-5">
          <dl className="grid grid-cols-2 gap-4 text-sm sm:grid-cols-4">
            {[
              ['Posts', me.data.postCount],
              ['Followers', me.data.followerCount],
              ['Following', me.data.followingCount],
              ['In your Clique', `${me.data.cliqueCount}/${LIMITS.clique}`],
            ].map(([label, value]) => (
              <div key={label}>
                <dt className="text-ink-500">{label}</dt>
                <dd className="font-semibold tabular-nums text-ink-900">{value}</dd>
              </div>
            ))}
          </dl>
          <div className="mt-4 flex flex-wrap gap-2">
            <Link to={`/app/u/${profile.username}`} className={buttonClass('secondary', 'sm')}>
              <UserPlus className="h-4 w-4" aria-hidden="true" /> View your public page
            </Link>
            <Link to="/app/account" className={buttonClass('secondary', 'sm')}>
              Your account
            </Link>
          </div>
        </Card>
      )}
      {me.error !== null && <ErrorNote error={me.error} />}
      <Card className="p-5">
        <ProfileForm initial={{ username: profile.username, displayName: profile.displayName }} submitLabel="Save changes" onSaved={refresh} />
      </Card>
    </>
  )
}

// ---------------------------------------------------------------------------

function NotFoundPanel({ what }: { what: string }) {
  return (
    <EmptyState
      icon={<MessageCircle className="h-7 w-7" />}
      title={`${what} isn't available`}
      body="It may have been deleted, or the link may be wrong."
      action={
        <Link to="/app" className={buttonClass('primary')}>
          Back to your feed
        </Link>
      }
    />
  )
}

export function AppNotFound() {
  return <NotFoundPanel what="This page" />
}
