import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, Bookmark, Check, Compass, MessageCircle, Trash2, UserPlus, Users } from 'lucide-react'
import { Card, EmptyState, PageHeader, buttonClass } from '../components/ui'
import { Message, Spinner } from '../public/auth/AuthUi'
import { LIMITS, cursorOf, type Comment, type FeedFilter, type Member, type Me, type Post, type PostCursor } from './api'
import { FaceView } from '../components/FaceView'
import { useAppApi, useMyProfile } from './AppApiContext'
import { ErrorNote, MemberAvatar, MemberLink, PostItem, RelationshipButtons, TextComposer, When } from './components'
import { useViewsSent } from './ViewTracker'
import { ProfileForm } from './MemberArea'
import { DetailsEditor, MemberAbout, SuggestedPeople, useTopics } from './profileDetails'
import { ReportButton, useModeration } from './moderation'
import { CreatorSetupCard, FirstPostGuide } from './onboarding'
import { PostComposer, usePhotosEnabled } from './media'
import { ProfilePictureField } from './avatars'
import { AudienceInsight, SupportButton } from './relationships'
import { JoinedForPrompt, PublicPreviewsSetting, categorize } from './content'
import { BlockButton, BlockedMembers, BlockedProfilePanel, GovernanceBanner } from './governance'
import { AdPreferences, AdSlot } from './ads'
import { AttentionFace, MoneyFace, RetentionFace } from './insights'
import { useFeedbackAccess } from './feedback'

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
function PostList({
  posts,
  loadOlder,
  onDeleted,
  hide,
}: {
  posts: Post[]
  loadOlder: (before: PostCursor) => Promise<Post[]>
  onDeleted: (id: string) => void
  /** Posts already shown elsewhere on the page (Clique first): skipped here, but paging still continues after them. */
  hide?: Set<string>
}) {
  const [older, setOlder] = useState<Post[]>([])
  const [done, setDone] = useState(posts.length < 20)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<unknown>(null)
  const all = [...posts, ...older]
  const shown = hide ? all.filter((p) => !hide.has(p.id)) : all
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
      // The next page starts strictly after the last post shown (time, then id), so none is skipped.
      const next = await loadOlder(cursorOf(last))
      setOlder((o) => {
        const seen = new Set([...posts, ...o].map((x) => x.id))
        return [...o, ...next.filter((x) => !seen.has(x.id))]
      })
      if (next.length < 20) setDone(true)
    } catch (e) {
      setError(e)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-3">
      {shown.map((p) => (
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
// Home: one feed (founder decision, Nov 26). Posts from the people the member
// follows, newest first, with unseen posts from their Clique first. Each post
// appears once; nothing from outside the people they follow is added.

export function FeedPage() {
  return (
    <>
      <PageHeader title="Home" subtitle="New posts from the people you follow. Only you decide what is hidden." />
      <GovernanceBanner />
      <JoinedForPrompt />
      <HomeFeed filter="all" withStrip withComposer cliqueFirst />
    </>
  )
}

/**
 * One Home face: the whole followed feed, or only My Clique (20261130000000),
 * chronological either way. Clique first (20261201000000) shows the member's
 * unseen recent Clique posts at the top, then everything else newest first:
 * each post appears once, and the group empties as its posts are seen.
 */
function HomeFeed({
  filter,
  withStrip = false,
  withComposer = false,
  cliqueFirst = false,
}: {
  filter: FeedFilter
  withStrip?: boolean
  withComposer?: boolean
  cliqueFirst?: boolean
}) {
  const api = useAppApi()
  const feed = useLoad(() => api.feed(undefined, filter), [api, filter])
  const group = useLoad(async () => (cliqueFirst ? api.homePriority() : []), [api, cliqueFirst])
  const groupIds = new Set((group.data ?? []).map((p) => p.id))
  const rest = (feed.data ?? []).filter((p) => !groupIds.has(p.id))
  // Only to choose the right empty state: new member, or following people who haven't posted yet.
  const me = useLoad(async () => (feed.data && feed.data.length === 0 ? api.me() : null), [api, feed.data?.length === 0])
  return (
    <>
      {withStrip && <CliqueRow />}
      {filter === 'clique' && (
        <div className="mb-3 flex justify-end">
          <Link to="/app/clique" className="text-[13px] font-semibold text-brand-700 underline underline-offset-2">
            Manage Clique
          </Link>
        </div>
      )}
      {withComposer && (
        <Card className="mb-4 p-4 sm:p-5">
          <PostComposer
            label="Write a post"
            placeholder="Share something with the people who follow you…"
            onPost={async ({ text, requestId, photo, video, topic }) => {
              const id = await (video
                ? api.createVideoPost(text, requestId, video.uploadId)
                : photo
                  ? api.createPhotoPost(text, requestId, photo.uploadId, photo.description)
                  : api.createPost(text, requestId))
              await categorize(api, id, topic)
              await feed.reload()
            }}
          />
        </Card>
      )}
      {feed.loading && !feed.data && <Loading label="Loading your feed…" />}
      {feed.error !== null && <ErrorNote error={feed.error} />}
      {filter === 'clique' && feed.data && feed.data.length === 0 && (
        <EmptyState
          icon={<Users className="h-7 w-7" />}
          title="Your Clique is quiet"
          body="My Clique shows posts from the creators you chose for your Clique, newest first. Add creators you follow to see them here."
          action={
            <Link to="/app/clique" className={buttonClass('primary')}>
              Choose your Clique
            </Link>
          }
        />
      )}
      {filter === 'all' && feed.data && feed.data.length === 0 && me.data && me.data.followingCount > 0 && (
        <EmptyState
          icon={<Compass className="h-7 w-7" />}
          title="Nothing new yet"
          body={`You follow ${me.data.followingCount} ${me.data.followingCount === 1 ? 'person' : 'people'}, and they haven't posted yet. Their posts will appear here, newest first.`}
          action={
            <div className="flex flex-wrap justify-center gap-2">
              <Link to="/app/discover" className={buttonClass('primary')}>
                Discover more people
              </Link>
              <Link to="/app/clique" className={buttonClass('secondary')}>
                Your Clique
              </Link>
            </div>
          }
        />
      )}
      {filter === 'all' && feed.data && feed.data.length === 0 && me.data && me.data.followingCount === 0 && <GettingStarted />}
      {filter === 'all' && feed.data && feed.data.length === 0 && me.error !== null && (
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
      {/* Unseen posts from the member's Clique come first, with no label: the
          feed simply starts with them. Then everything else, newest first. */}
      {group.data && group.data.length > 0 && (
        <div className="mb-3 space-y-3" data-testid="clique-first-group">
          {group.data.map((p) => (
            <PostItem key={p.id} post={p} onDeleted={(id) => group.setData((d) => d?.filter((x) => x.id !== id))} />
          ))}
        </div>
      )}
      {/* A general feed ad between the sections: never removes or reorders a post. */}
      {withComposer && feed.data && rest.length > 0 && <AdSlot surface="feed" />}
      {feed.data && rest.length > 0 && (
        <PostList
          posts={feed.data}
          hide={groupIds}
          loadOlder={(before) => api.feed(before, filter)}
          onDeleted={(id) => feed.setData((d) => d?.filter((p) => p.id !== id))}
        />
      )}
    </>
  )
}

/** "9+" above nine; the server caps counts at 10 (meaning more than 9). */
export function unseenBadge(n: number) {
  return n > 9 ? '9+' : String(n)
}

/**
 * Unseen-first strip: followed creators with posts you haven't seen, My Clique
 * first (marked with a ring), newest unseen first. Only creators with unseen
 * posts appear. Opening one starts catch-up. The feed below stays chronological.
 */
/**
 * The Clique row at the top of Home: every member of the member's Clique,
 * those with unseen posts first (with a ring), then the rest. Tapping one
 * opens their posts in catch-up, unseen first. Not Stories: nothing expires,
 * and these are the same posts as everywhere else. The last tile opens the
 * Clique page to add or remove people.
 */
function CliqueRow() {
  const api = useAppApi()
  const relationships = useLoad(() => api.relationships(), [api])
  const unseen = useLoad(() => api.unseenCreators(), [api])
  // Refresh a moment after views are recorded (at most every 2 seconds).
  const refresh = useRef<ReturnType<typeof setTimeout> | null>(null)
  useViewsSent(() => {
    if (refresh.current) return
    refresh.current = setTimeout(() => {
      refresh.current = null
      void unseen.reload()
    }, 2000)
  })
  useEffect(
    () => () => {
      if (refresh.current) clearTimeout(refresh.current)
    },
    [],
  )
  // Optional: while loading, on error, or for someone who follows nobody, it takes no space.
  if (!relationships.data || relationships.data.length === 0) return null
  const counts = new Map((unseen.data ?? []).map((c) => [c.id, c]))
  const clique = relationships.data
    .filter((r) => r.inMyClique)
    .map((r) => ({ ...r, unseenCount: counts.get(r.id)?.unseenCount ?? 0, latestUnseenAt: counts.get(r.id)?.latestUnseenAt ?? '' }))
    .sort((x, y) =>
      (y.unseenCount > 0 ? 1 : 0) - (x.unseenCount > 0 ? 1 : 0) ||
      y.latestUnseenAt.localeCompare(x.latestUnseenAt) ||
      (y.latestPostAt ?? '').localeCompare(x.latestPostAt ?? ''),
    )
  return (
    <section aria-labelledby="clique-row-title" className="mb-4" data-testid="clique-row">
      <h2 id="clique-row-title" className="sr-only">
        Your Clique
      </h2>
      <ul className="-mx-4 flex gap-3 overflow-x-auto px-4 pb-2 [scrollbar-width:none] sm:mx-0 sm:px-0">
        {clique.map((c) => {
          const fresh = c.unseenCount > 0
          const count = c.unseenCount > 9 ? 'more than 9' : String(c.unseenCount)
          return (
            <li key={c.id} className="shrink-0">
              {/* The name is visible; screen readers also hear whether there is something new (WCAG 2.5.3). */}
              <Link
                to={`/app/catch-up/${c.username}`}
                data-unseen={fresh ? 'true' : 'false'}
                // relative: keeps the screen-reader text inside the scrolling row (an absolutely
                // positioned element would otherwise widen the whole page on a phone).
                className="relative flex w-[68px] flex-col items-center gap-1 rounded-2xl py-1 focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-500"
              >
                {/* SP-DESIGN-002: an apricot-to-seafoam ring and a count (9+ at most) for new posts; a plain ring when caught up. */}
                <span aria-hidden="true" className="relative">
                  <span className={`block rounded-full p-[3px] ${fresh ? 'bg-linear-to-br from-sp-accent to-sp-secondary' : 'bg-ink-200'}`}>
                    <span className="block rounded-full bg-paper p-[2px]">
                      <MemberAvatar member={c} size={52} />
                    </span>
                  </span>
                  {fresh && (
                    <span
                      data-testid="unseen-badge"
                      className="absolute -right-1 -top-1 min-w-[22px] rounded-full bg-brand-600 px-1.5 text-center text-[12px] font-bold leading-[22px] text-white ring-2 ring-paper"
                    >
                      {unseenBadge(c.unseenCount)}
                    </span>
                  )}
                </span>
                <span className="w-full truncate text-center text-[12px] text-ink-700">
                  {c.displayName}
                  <span className="sr-only">{fresh ? ` has ${count} new ${c.unseenCount === 1 ? 'post' : 'posts'}` : ' has nothing new'}</span>
                </span>
              </Link>
            </li>
          )
        })}
        <li className="shrink-0">
          <Link
            to="/app/clique"
            className="flex w-[68px] flex-col items-center gap-1 rounded-2xl py-1 focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-500"
          >
            <span aria-hidden="true" className="flex h-[60px] w-[60px] items-center justify-center rounded-full border-2 border-dashed border-ink-200 text-ink-500">
              {clique.length === 0 ? <UserPlus className="h-6 w-6" /> : <Users className="h-6 w-6" />}
            </span>
            <span className="w-full truncate text-center text-[12px] text-ink-700">{clique.length === 0 ? 'Add to Clique' : 'Edit Clique'}</span>
          </Link>
        </li>
      </ul>
    </section>
  )
}

// ---------------------------------------------------------------------------
// Catch-up: one creator's unseen posts, oldest first, 20 at a time.

export function CatchUpPage() {
  const api = useAppApi()
  const { username = '' } = useParams()
  const member = useLoad(() => api.member(username), [api, username])
  const m = member.data
  const [posts, setPosts] = useState<Post[] | null>(null)
  const [error, setError] = useState<unknown>(null)
  const [hasEarlier, setHasEarlier] = useState(false)
  const [loadingEarlier, setLoadingEarlier] = useState(false)
  // After the unseen posts: the member's earlier posts (the same posts as on their profile).
  const recent = useLoad(async () => (m ? api.memberPosts(m.id) : []), [api, m])

  useEffect(() => {
    if (!m) return
    let live = true
    setPosts(null)
    setError(null)
    api
      .catchUp(m.id)
      .then((p) => {
        if (!live) return
        setPosts(p)
        setHasEarlier(p.length === 20)
      })
      .catch((e) => live && setError(e))
    return () => {
      live = false
    }
  }, [api, m])

  async function showEarlier() {
    if (!m || !posts || posts.length === 0 || loadingEarlier) return
    setLoadingEarlier(true)
    setError(null)
    try {
      const oldest = posts[0]
      const earlier = await api.catchUp(m.id, { createdAt: oldest.createdAt, id: oldest.id })
      const known = new Set(posts.map((p) => p.id))
      setPosts([...earlier.filter((p) => !known.has(p.id)), ...posts])
      setHasEarlier(earlier.length === 20)
    } catch (e) {
      setError(e)
    } finally {
      setLoadingEarlier(false)
    }
  }

  if (member.loading && member.data === undefined) return <Loading label="Loading…" />
  if (member.error !== null) return <ErrorNote error={member.error} />
  if (!m) return <NotFoundPanel what="This member" />
  return (
    <>
      <Link to="/app" className="mb-3 inline-flex items-center gap-1 text-sm font-semibold text-brand-700">
        <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Home
      </Link>
      <div className="mb-4 flex items-center gap-3">
        <MemberAvatar member={m} size={48} />
        <div className="min-w-0">
          <h1 className="truncate font-display text-xl font-extrabold text-ink-900">Catching up with {m.displayName}</h1>
          <p className="text-sm text-ink-600">New posts first, oldest of them first, then earlier ones. New posts are marked as seen as you read them.</p>
        </div>
      </div>
      {posts === null && error === null && <Loading label="Loading unseen posts…" />}
      {error !== null && <ErrorNote error={error} />}
      {posts && posts.length === 0 && !(m.followedByMe || m.isMe) && (
        <EmptyState
          icon={<Check className="h-7 w-7" />}
          title="You're all caught up"
          body={`Follow ${m.displayName} to catch up on their new posts.`}
          action={
            <Link to={`/app/u/${m.username}`} className={buttonClass('secondary')}>
              See {m.displayName}'s profile
            </Link>
          }
        />
      )}
      {posts && posts.length === 0 && (m.followedByMe || m.isMe) && (
        <p className="mb-3 flex items-center gap-2 text-sm font-semibold text-ink-700" data-testid="caught-up">
          <Check className="h-4 w-4 text-brand-700" aria-hidden="true" /> Nothing new from {m.displayName}. Here are their earlier posts.
        </p>
      )}
      {posts && posts.length > 0 && (
        <>
          {hasEarlier && (
            <div className="mb-3 text-center">
              <button type="button" onClick={showEarlier} disabled={loadingEarlier} className={buttonClass('secondary', 'sm')}>
                {loadingEarlier ? 'Loading…' : 'Show earlier unseen posts'}
              </button>
            </div>
          )}
          <ul className="space-y-3">
            {posts.map((p) => (
              <li key={p.id}>
                <PostItem post={p} />
              </li>
            ))}
          </ul>
        </>
      )}
      {/* Once every unseen post is shown: the member's earlier posts, without repeating any. */}
      {posts && !hasEarlier && (m.followedByMe || m.isMe) && recent.data && (
        <EarlierPosts member={m} posts={recent.data.filter((p) => !posts.some((u) => u.id === p.id))} />
      )}
    </>
  )
}

function EarlierPosts({ member, posts }: { member: Member; posts: Post[] }) {
  return (
    <section aria-labelledby="earlier-title" className="mt-5">
      <h2 id="earlier-title" className="mb-2 font-display text-[15px] font-bold text-ink-900">
        Earlier from {member.displayName}
      </h2>
      {posts.length === 0 ? (
        <p className="text-sm text-ink-600">No earlier posts.</p>
      ) : (
        <ul className="space-y-3">
          {posts.map((p) => (
            <li key={p.id}>
              <PostItem post={p} />
            </li>
          ))}
        </ul>
      )}
      <div className="mt-4 flex flex-wrap justify-center gap-2">
        <Link to="/app" className={buttonClass('primary', 'sm')}>
          Back to Home
        </Link>
        <Link to={`/app/u/${member.username}`} className={buttonClass('secondary', 'sm')}>
          See profile
        </Link>
      </div>
    </section>
  )
}

/** First steps for a new member: find people, follow, choose a Clique. */
function GettingStarted() {
  const steps: Array<{ title: string; body: string; to: string; cta: string }> = [
    { title: 'Find people', body: 'Browse Discover or search by name, then open a profile to read their posts.', to: '/app/discover', cta: 'Discover people' },
    {
      title: 'Follow them',
      body: 'Their new posts appear here on Home, newest first. Nobody is added for you.',
      to: '/app/discover',
      cta: 'Find someone to follow',
    },
    {
      title: 'Choose your Clique',
      body: 'Choose the people you follow that you want closest. You can change them at any time.',
      to: '/app/clique',
      cta: 'Your Clique',
    },
  ]
  return (
    <Card className="p-5">
      <h2 className="font-display text-lg font-bold text-ink-900">Your feed is quiet</h2>
      <p className="mt-1 text-sm text-ink-600">Here's how to start. It takes a minute.</p>
      <ol className="mt-4 space-y-4">
        {steps.map((step, i) => (
          <li key={step.title} className="flex gap-3">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand-50 text-sm font-bold text-brand-700" aria-hidden="true">
              {i + 1}
            </span>
            <div className="min-w-0">
              <p className="font-semibold text-ink-900">{step.title}</p>
              <p className="text-sm text-ink-600">{step.body}</p>
              {i !== 1 && (
                <Link to={step.to} className="mt-1 inline-block text-sm font-semibold text-brand-700 underline">
                  {step.cta}
                </Link>
              )}
            </div>
          </li>
        ))}
      </ol>
      <div className="mt-5">
        <SuggestedPeople heading="People you might like" limit={3} />
      </div>
    </Card>
  )
}

// ---------------------------------------------------------------------------
// Create a post.

export function ComposePage() {
  const api = useAppApi()
  const navigate = useNavigate()
  const photos = usePhotosEnabled()
  return (
    <>
      <PageHeader
        title="Create a post"
        subtitle={`${photos ? 'Text, or one photo with an optional caption.' : 'Text posts for now.'} Everyone who follows you will see it in their feed.`}
      />
      <div className="mb-4">
        <FirstPostGuide />
      </div>
      <Card className="p-4 sm:p-5">
        <PostComposer
          label="Write a post"
          placeholder="What do you want to share?"
          rows={6}
          onPost={async ({ text, requestId, photo, video, topic }) => {
            const id = await (video
              ? api.createVideoPost(text, requestId, video.uploadId)
              : photo
                ? api.createPhotoPost(text, requestId, photo.uploadId, photo.description)
                : api.createPost(text, requestId))
            await categorize(api, id, topic)
            navigate(`/app/post/${id}`)
          }}
        />
      </Card>
    </>
  )
}

// ---------------------------------------------------------------------------
// Discover people.

export { DiscoverPage } from './discover'

// ---------------------------------------------------------------------------
// A member's page.

export function MemberPage() {
  const api = useAppApi()
  const { username = '' } = useParams()
  const { hash } = useLocation()
  const member = useLoad(() => api.member(username), [api, username])
  const m = member.data
  const posts = useLoad(async () => (m ? api.memberPosts(m.id) : []), [api, m?.id])
  const details = useLoad(async () => (m ? api.memberDetails(m.id) : null), [api, m?.id])
  const { topics } = useTopics()
  // Arriving from "See posts" (…#posts): bring the posts into view once they load.
  const postsReady = posts.data !== undefined && m !== undefined && m !== null
  useEffect(() => {
    if (hash === '#posts' && postsReady) document.getElementById('posts')?.scrollIntoView?.({ block: 'start' })
  }, [hash, postsReady])

  if (member.loading && member.data === undefined) return <Loading label="Loading profile…" />
  if (member.error !== null) return <ErrorNote error={member.error} />
  if (!m) return <BlockedProfilePanel username={username} fallback={<NotFoundPanel what="This member" />} onUnblocked={() => void member.reload()} />
  return (
    <>
      <MemberHeader member={m} onChange={member.reload} about={<MemberAbout details={details.data} topics={topics} />} />
      <h2 id="posts" className="mb-3 mt-6 scroll-mt-20 font-display text-lg font-bold text-ink-900">
        Posts
      </h2>
      {posts.loading && !posts.data && <Loading label="Loading posts…" />}
      {posts.error !== null && <ErrorNote error={posts.error} />}
      {posts.data && posts.data.length === 0 && (
        <Message tone="info">
          {m.isMe
            ? "You haven't posted yet. Use Create to share your first post."
            : m.followedByMe
              ? `${m.displayName} hasn't posted yet. When they do, it will appear on your Home feed.`
              : `${m.displayName} hasn't posted yet. Follow them to see their posts on Home when they do.`}
        </Message>
      )}
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

function MemberHeader({ member, onChange, about }: { member: Member; onChange: () => Promise<void>; about?: ReactNode }) {
  return (
    <Card className="p-5">
      <div className="flex items-center gap-4">
        <MemberAvatar member={member} size={64} />
        <div className="min-w-0">
          <h1 className="truncate font-display text-2xl font-extrabold text-ink-900">{member.displayName}</h1>
          <p className="text-[15px] text-ink-500">@{member.username}</p>
        </div>
      </div>
      {about}
      <dl className="mt-4 flex flex-wrap gap-x-6 gap-y-2 text-sm" data-testid="profile-counts">
        {(member.activeSupporterCount !== undefined
          ? [
              ['Followers', member.followerCount],
              ['Clique', member.cliqueCount ?? 0],
              ['Active Supporters', member.activeSupporterCount],
            ]
          : [
              ['Posts', member.postCount],
              ['Followers', member.followerCount],
              ['Following', member.followingCount],
            ]
        ).map(([label, value]) => (
          <div key={label}>
            <dt className="text-ink-500">{label}</dt>
            <dd className="font-semibold tabular-nums text-ink-900">{value}</dd>
          </div>
        ))}
      </dl>
      <div className="mt-4">
        {member.isMe ? (
          <Link to="/app/profile" className={buttonClass('secondary', 'sm')}>
            Edit your profile
          </Link>
        ) : (
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="flex flex-wrap items-start gap-2">
              <RelationshipButtons member={member} onChange={onChange} size="md" source="profile" postsHref={member.postCount > 0 ? '#posts' : undefined} />
              <SupportButton creator={member} />
            </div>
            <div className="flex flex-wrap items-center gap-1">
              <ReportButton target="profile" targetId={member.id} name={member.displayName} />
              <BlockButton memberId={member.id} name={member.displayName} onBlocked={() => void onChange()} />
            </div>
          </div>
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
  // Opening a post is qualifying consumption for intelligence (best effort, never a reward).
  useEffect(() => {
    if (id) void api.noteOpen(id).catch(() => undefined)
  }, [api, id])

  if (post.loading && post.data === undefined) return <Loading label="Loading post…" />
  if (post.error !== null) return <ErrorNote error={post.error} />
  if (!post.data) return <NotFoundPanel what="This post" />
  const p = post.data
  return (
    <>
      <h1 className="sr-only">Post by {p.author.displayName}</h1>
      <PostItem post={p} linkToPost={false} onDeleted={() => navigate('/app', { replace: true })} />
      {!p.isMine && <AdSlot surface="content" postId={p.id} />}
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
        {!comment.isMine && <ReportButton target="comment" targetId={comment.id} name={comment.author.displayName} />}
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
// Saved posts (20261202000000): private to the member, most recently saved first.

export function SavedPage() {
  const api = useAppApi()
  const saved = useLoad(() => api.savedPosts(), [api])
  return (
    <>
      <PageHeader title="Saved" subtitle="Posts you saved. Only you can see this list." />
      {saved.loading && saved.data === undefined && <Loading label="Loading your saved posts…" />}
      {saved.error !== null && <ErrorNote error={saved.error} />}
      {saved.data === null && <Message tone="info">Saving posts isn't available yet.</Message>}
      {saved.data && saved.data.length === 0 && (
        <EmptyState
          icon={<Bookmark className="h-7 w-7" />}
          title="Nothing saved yet"
          body="Tap the bookmark on any post to keep it here."
          action={
            <Link to="/app" className={buttonClass('primary')}>
              Back to Home
            </Link>
          }
        />
      )}
      {saved.data && saved.data.length > 0 && (
        <PostList
          posts={saved.data}
          loadOlder={async (before) => (await api.savedPosts(before)) ?? []}
          onDeleted={(id) => saved.setData((d) => d?.filter((p) => p.id !== id))}
        />
      )}
    </>
  )
}

// ---------------------------------------------------------------------------
// Your Clique and everyone you follow (relationship management): src/app/relationships.tsx.
export { CliquePage } from './relationships'

// ---------------------------------------------------------------------------
// Your profile.

/**
 * Your profile and your insights (SP-DESIGN-002): four faces, Profile,
 * Attention, Retention and Money. The insight faces are owner only: other
 * members see only the profile itself.
 */
export function ProfilePage() {
  return (
    <>
      <PageHeader title="Your profile" subtitle="How people see you on Splitpost, and what's happening with your work." />
      <FaceView
        label="Your profile and insights"
        faces={[
          { key: 'profile', label: 'Profile', content: <ProfileFace /> },
          { key: 'attention', label: 'Attention', content: <AttentionFace /> },
          { key: 'retention', label: 'Retention', content: <RetentionFace /> },
          { key: 'money', label: 'Money', content: <MoneyFace /> },
        ]}
      />
    </>
  )
}

function ProfileFace() {
  const api = useAppApi()
  const { profile, refresh } = useMyProfile()
  const me = useLoad<Me>(() => api.me(), [api, profile.username, profile.displayName])
  const { moderator } = useModeration()
  const { founder } = useFeedbackAccess()
  return (
    <>
      {me.data && (
        <Card className="mb-4 p-5">
          <dl className="grid grid-cols-2 gap-4 text-sm sm:grid-cols-4">
            {[
              ['Posts', me.data.postCount],
              ['Followers', me.data.followerCount],
              ['Following', me.data.followingCount],
              ['My Clique', me.data.cliqueCount],
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
            <Link to="/app/saved" className={buttonClass('secondary', 'sm')}>
              <Bookmark className="h-4 w-4" aria-hidden="true" /> Saved
            </Link>
            <Link to="/app/account" className={buttonClass('secondary', 'sm')}>
              Your account
            </Link>
            <Link to="/app/notices" className={buttonClass('secondary', 'sm')}>
              Notices
            </Link>
            <Link to="/app/advertise" className={buttonClass('secondary', 'sm')}>
              Advertise with Splitpost
            </Link>
            <Link to="/app/privacy" className={buttonClass('secondary', 'sm')}>
              Your data and privacy
            </Link>
            {moderator && (
              <Link to="/app/moderation" className={buttonClass('secondary', 'sm')}>
                Moderation
              </Link>
            )}
            {founder && (
              <Link to="/app/ads" className={buttonClass('secondary', 'sm')}>
                Advertising
              </Link>
            )}
            {founder && (
              <Link to="/app/control" className={buttonClass('secondary', 'sm')}>
                Control Center
              </Link>
            )}
          </div>
        </Card>
      )}
      {me.error !== null && <ErrorNote error={me.error} />}
      <div className="mb-4">
        <CreatorSetupCard />
      </div>
      <AudienceInsight />
      <Card className="mb-4 p-5">
        <ProfilePictureField />
      </Card>
      <Card className="p-5">
        <h2 className="mb-4 font-display text-lg font-bold text-ink-900">Your name</h2>
        <ProfileForm initial={{ username: profile.username, displayName: profile.displayName }} submitLabel="Save changes" onSaved={refresh} />
      </Card>
      <Card className="mt-4 p-5">
        <DetailsEditor />
      </Card>
      <PublicPreviewsSetting />
      <AdPreferences />
      <BlockedMembers />
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
