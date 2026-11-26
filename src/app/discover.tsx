import { useEffect, useState, type FormEvent } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { ChevronLeft, Compass, LayoutGrid, Search, Sparkles, UserPlus } from 'lucide-react'
import { EmptyState, PageHeader, buttonClass } from '../components/ui'
import { Message } from '../public/auth/AuthUi'
import { type DiscoverMember, type Post, type Topic } from './api'
import { useAppApi } from './AppApiContext'
import { ErrorNote, PostItem } from './components'
import { FaceView } from '../components/FaceView'
import { PersonSummary } from './profileDetails'
import { useTopicList } from './content'

/**
 * Discover (SP-DESIGN-001: "find new value"), value and intent based
 * (20261203000000). Search sits above three views: For you (posts in your
 * interests from people you don't follow yet, each with its reason, and an
 * optional focus for this visit, kept in this browser tab only), Creators
 * (people, shared interests first) and Content (posts by topic). Nothing
 * about a search or a focus is stored.
 */
export function DiscoverPage() {
  const api = useAppApi()
  const topics = useTopicList()
  const [params, setParams] = useSearchParams()
  const [query, setQuery] = useState('')
  const [submitted, setSubmitted] = useState('')
  // Approved design (D1): one question and one search box, then three ways
  // in. A focused view (For you, People, Topics) opens full screen with the
  // face transition; the choice is kept in the URL so Back works.
  const focused = params.has('face') || params.has('browse')
  function open(face: 'for-you' | 'creators' | 'content') {
    const p = new URLSearchParams(params)
    p.set('browse', '1')
    if (face === 'for-you') p.delete('face')
    else p.set('face', face)
    setParams(p)
    window.scrollTo({ top: 0 })
  }
  function back() {
    const p = new URLSearchParams(params)
    p.delete('browse')
    p.delete('face')
    setParams(p)
  }
  function search(e: FormEvent) {
    e.preventDefault()
    setSubmitted(query.trim())
  }
  function clear() {
    setQuery('')
    setSubmitted('')
  }
  return (
    <>
      <PageHeader title="Discover" subtitle="What are you looking for today?" />
      <form onSubmit={search} role="search" className="mb-4 flex gap-2">
        <label htmlFor="discover-search" className="sr-only">
          Search people, posts and topics
        </label>
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" aria-hidden="true" />
          <input
            id="discover-search"
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="People, posts or topics"
            className="block h-12 w-full rounded-2xl border border-ink-200 bg-white pl-10 pr-4 text-base text-ink-900 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-200"
          />
        </div>
        <button type="submit" className={buttonClass('secondary')}>
          Search
        </button>
      </form>
      {submitted ? (
        <SearchResults query={submitted} topics={topics} onClear={clear} api={api} />
      ) : focused ? (
        <>
          <button type="button" onClick={back} className="mb-3 inline-flex items-center gap-1 text-[14px] font-semibold text-brand-700" data-testid="discover-back">
            <ChevronLeft className="h-4 w-4" aria-hidden="true" /> All of Discover
          </button>
          <FaceView
            label="Discover views"
            faces={[
              { key: 'for-you', label: 'For you', content: <ForYou topics={topics} /> },
              { key: 'creators', label: 'People', content: <Creators topics={topics} /> },
              { key: 'content', label: 'Topics', content: <ByTopic topics={topics} /> },
            ]}
          />
        </>
      ) : (
        <DiscoverHome onOpen={open} />
      )}
    </>
  )
}

const WAYS_IN = [
  { face: 'for-you' as const, label: 'For you', icon: Sparkles, hint: 'Picked for your interests' },
  { face: 'creators' as const, label: 'People', icon: UserPlus, hint: 'Creators to follow' },
  { face: 'content' as const, label: 'Topics', icon: LayoutGrid, hint: 'Browse by subject' },
]

/** The first screen: three ways in, one recommended person, and a few posts. Everything else is one tap deeper. */
function DiscoverHome({ onOpen }: { onOpen: (face: 'for-you' | 'creators' | 'content') => void }) {
  const api = useAppApi()
  const topics = useTopicList()
  const people = useAsync(() => api.discover(''), [api])
  const mine = useAsync(async () => (await api.myDetails().catch(() => null))?.topics ?? [], [api])
  const posts = useAsync(() => api.discoverPosts(), [api])
  // Someone new: never a person already followed.
  const hero = people.data?.find((m) => !m.followedByMe)
  const few = (posts.data ?? []).slice(0, 3)
  return (
    <div className="space-y-5" data-testid="discover-home">
      <nav aria-label="Ways into Discover" className="grid grid-cols-3 gap-2">
        {WAYS_IN.map((w, i) => (
          <button
            key={w.face}
            type="button"
            onClick={() => onOpen(w.face)}
            className={`flex flex-col items-center gap-1.5 rounded-3xl px-2 py-4 text-center transition ${
              i === 0 ? 'bg-brand-600 text-white hover:bg-brand-700' : 'bg-white text-ink-900 ring-1 ring-ink-100 hover:bg-ink-50'
            }`}
          >
            <w.icon className="h-5 w-5" aria-hidden="true" />
            <span className="text-[15px] font-bold">{w.label}</span>
            <span className={`text-[12px] leading-tight ${i === 0 ? 'text-white/85' : 'text-ink-600'}`}>{w.hint}</span>
          </button>
        ))}
      </nav>
      {hero && (
        <section aria-labelledby="discover-hero-title">
          <h2 id="discover-hero-title" className="mb-2 text-[15px] font-bold text-ink-900">
            Someone you might value
          </h2>
          <PersonSummary member={hero} topics={topics} myTopics={mine.data} onChange={people.reload} source="discover" />
        </section>
      )}
      {few.length > 0 && (
        <section aria-labelledby="discover-posts-title">
          <div className="mb-2 flex items-baseline justify-between">
            <h2 id="discover-posts-title" className="text-[15px] font-bold text-ink-900">
              Posts you might value
            </h2>
            <button type="button" onClick={() => onOpen('for-you')} className="text-[14px] font-semibold text-brand-700">
              See more
            </button>
          </div>
          <PostResults posts={few} empty={null} />
        </section>
      )}
      {people.data && people.data.length === 0 && posts.data !== undefined && few.length === 0 && (
        <EmptyState icon={<Compass className="h-7 w-7" />} title="Quiet for now" body="As more members join and post, people and posts you might value appear here." />
      )}
    </div>
  )
}

function useAsync<T>(load: () => Promise<T>, deps: unknown[]) {
  const [data, setData] = useState<T | undefined>(undefined)
  const [error, setError] = useState<unknown>(null)
  useEffect(() => {
    let live = true
    setData(undefined)
    setError(null)
    load().then(
      (d) => live && setData(d),
      (e) => live && setError(e),
    )
    return () => {
      live = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)
  return { data, error, setData, reload: () => load().then(setData, setError) }
}

function PostResults({ posts, empty, onOpen }: { posts: Post[]; empty: React.ReactNode; onOpen?: () => void }) {
  if (posts.length === 0) return <>{empty}</>
  return (
    <ul className="space-y-3" onClickCapture={(e) => onOpen && (e.target as HTMLElement).closest('a') && onOpen()}>
      {posts.map((p) => (
        <li key={p.id}>
          {p.reason && (
            <p className="mb-1.5 flex items-center gap-1.5 text-[13px] font-semibold text-ink-700" data-testid="discover-reason">
              <Sparkles className="h-3.5 w-3.5 text-brand-700" aria-hidden="true" /> {p.reason}
            </p>
          )}
          <PostItem post={p} />
        </li>
      ))}
    </ul>
  )
}

/** For you: posts in your interests (or the focus you choose now) from people you don't follow yet. */
function ForYou({ topics }: { topics: Topic[] | null }) {
  const api = useAppApi()
  const [focus, setFocus] = useState('')
  const posts = useAsync(() => api.discoverPosts(focus || undefined), [api, focus])
  // Measurement (20261204000000): one count per focus chosen, with whether it found anything. No member, no words.
  useEffect(() => {
    if (focus && posts.data) void api.noteSearch('focus', posts.data.length > 0, focus).catch(() => undefined)
  }, [api, focus, posts.data])
  return (
    <div>
      {topics && topics.length > 0 && (
        <fieldset className="mb-4">
          <legend className="mb-2 text-sm font-semibold text-ink-800">What are you here for today?</legend>
          <div className="flex flex-wrap gap-2">
            <button type="button" aria-pressed={focus === ''} onClick={() => setFocus('')} className={chip(focus === '')}>
              My interests
            </button>
            {topics.map((t) => (
              <button key={t.slug} type="button" aria-pressed={focus === t.slug} onClick={() => setFocus(t.slug)} className={chip(focus === t.slug)}>
                {t.label}
              </button>
            ))}
          </div>
          <p className="mt-2 text-[12.5px] text-ink-600">Your choice here only shapes this visit. It isn't saved.</p>
        </fieldset>
      )}
      {posts.error !== null && <ErrorNote error={posts.error} />}
      {posts.data === undefined && posts.error === null && <p className="text-sm text-ink-600">Finding posts for you…</p>}
      {posts.data === null && <Message tone="info">Suggested posts aren't available yet. Try Creators to find people.</Message>}
      {posts.data && (
        <PostResults
          onOpen={focus ? () => void api.noteSearchSelection('focus', focus).catch(() => undefined) : undefined}
          posts={posts.data}
          empty={
            <EmptyState
              icon={<Compass className="h-7 w-7" />}
              title="Nothing new here yet"
              body={
                focus
                  ? 'No recent posts in this topic from people you don’t follow yet. Try another topic.'
                  : 'No recent posts in your interests from people you don’t follow yet. Try a topic above, or add interests to your profile.'
              }
              action={
                <Link to="/app/profile" className={buttonClass('secondary')}>
                  Choose your interests
                </Link>
              }
            />
          }
        />
      )}
    </div>
  )
}

function chip(on: boolean) {
  return `inline-flex h-9 items-center rounded-full px-3.5 text-sm font-semibold ring-1 transition ${
    on ? 'bg-brand-600 text-white ring-brand-600' : 'bg-white text-ink-800 ring-ink-200 hover:bg-ink-50'
  }`
}

/** Creators: people, those who share your interests first; browse by interest. */
function Creators({ topics }: { topics: Topic[] | null }) {
  const api = useAppApi()
  const [topic, setTopic] = useState('')
  const list = useAsync(() => api.discover('', topic || undefined), [api, topic])
  const mine = useAsync(async () => (await api.myDetails().catch(() => null))?.topics ?? [], [api])
  const topicLabel = topics?.find((t) => t.slug === topic)?.label
  return (
    <div>
      {topics && topics.length > 0 && (
        <div className="mb-4">
          <label htmlFor="discover-topic" className="mb-1.5 block text-sm font-semibold text-ink-700">
            Browse by interest
          </label>
          <select
            id="discover-topic"
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            className="block h-12 w-full rounded-2xl border border-ink-200 bg-white px-4 text-base text-ink-900 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-200"
          >
            <option value="">Everyone</option>
            {topics.map((t) => (
              <option key={t.slug} value={t.slug}>
                {t.label}
              </option>
            ))}
          </select>
        </div>
      )}
      {list.error !== null && <ErrorNote error={list.error} />}
      {list.data === undefined && list.error === null && <p className="text-sm text-ink-600">Finding people…</p>}
      {list.data && list.data.length === 0 && (
        <EmptyState
          icon={<Search className="h-7 w-7" />}
          title="Nobody found"
          body={topicLabel ? `Nobody has chosen ${topicLabel} yet. Try another interest.` : 'No other members yet. Invited members will appear here.'}
          action={
            topic ? (
              <button type="button" onClick={() => setTopic('')} className={buttonClass('secondary')}>
                Show everyone
              </button>
            ) : undefined
          }
        />
      )}
      {list.data && list.data.length > 0 && <People people={list.data} topics={topics} myTopics={mine.data} onChange={list.reload} />}
    </div>
  )
}

function People({
  people,
  topics,
  myTopics,
  onChange,
  fromSearch = false,
  onOpen,
}: {
  people: DiscoverMember[]
  topics: Topic[] | null
  myTopics?: string[]
  onChange: () => void
  fromSearch?: boolean
  onOpen?: () => void
}) {
  return (
    <ul className="space-y-3" onClickCapture={(e) => onOpen && (e.target as HTMLElement).closest('a') && onOpen()}>
      {people.map((m) => (
        <li key={m.id}>
          <PersonSummary member={m} topics={topics} myTopics={myTopics} onChange={onChange} source={fromSearch ? 'search' : 'discover'} />
        </li>
      ))}
    </ul>
  )
}

/** Content: posts by topic, from everyone (people you follow too), newest first. */
function ByTopic({ topics }: { topics: Topic[] | null }) {
  const api = useAppApi()
  const [topic, setTopic] = useState('')
  const label = topics?.find((t) => t.slug === topic)?.label
  const posts = useAsync(async () => (label ? api.searchPosts(label) : []), [api, label])
  // Who posts about it (shared interests first), then what: the approved Topics view.
  const people = useAsync(async () => (topic ? (await api.discover('', topic)).slice(0, 3) : []), [api, topic])
  const mine = useAsync(async () => (await api.myDetails().catch(() => null))?.topics ?? [], [api])
  if (!topics || topics.length === 0) return <Message tone="info">Topics aren't available yet.</Message>
  return (
    <div>
      <fieldset className="mb-4">
        <legend className="mb-2 text-sm font-semibold text-ink-800">Choose a topic</legend>
        <div className="flex flex-wrap gap-2">
          {topics.map((t) => (
            <button key={t.slug} type="button" aria-pressed={topic === t.slug} onClick={() => setTopic(t.slug)} className={chip(topic === t.slug)}>
              {t.label}
            </button>
          ))}
        </div>
      </fieldset>
      {!topic && <p className="text-sm text-ink-600">Pick a topic to see who posts about it and its latest posts.</p>}
      {topic && people.data && people.data.length > 0 && (
        <section aria-labelledby="topic-people" className="mb-5" data-testid="topic-people">
          <h2 id="topic-people" className="mb-2 text-[15px] font-bold text-ink-900">
            People who post about {label}
          </h2>
          <People people={people.data} topics={topics} myTopics={mine.data} onChange={people.reload} />
        </section>
      )}
      {topic && <h2 className="mb-2 text-[15px] font-bold text-ink-900">Latest in {label}</h2>}
      {posts.error !== null && <ErrorNote error={posts.error} />}
      {topic && posts.data === null && <Message tone="info">Browsing posts by topic isn't available yet.</Message>}
      {topic && posts.data && <PostResults posts={posts.data} empty={<Message tone="info">No posts in {label} yet.</Message>} />}
    </div>
  )
}

/** Search results: people, topics and posts for the words typed. */
function SearchResults({ query, topics, onClear, api }: { query: string; topics: Topic[] | null; onClear: () => void; api: ReturnType<typeof useAppApi> }) {
  const people = useAsync(() => api.discover(query), [api, query])
  const posts = useAsync(async () => (query.length >= 2 ? api.searchPosts(query) : []), [api, query])
  const mine = useAsync(async () => (await api.myDetails().catch(() => null))?.topics ?? [], [api])
  const matchingTopics = (topics ?? []).filter((t) => t.label.toLowerCase().includes(query.toLowerCase()))
  const done = people.data !== undefined && posts.data !== undefined
  // Measurement (20261204000000): one count per search, whether it found anything, and the approved topic it matched.
  const topicSlug = matchingTopics.length === 1 ? matchingTopics[0].slug : undefined
  const found = (people.data?.length ?? 0) + (posts.data?.length ?? 0) + matchingTopics.length > 0
  useEffect(() => {
    if (done) void api.noteSearch('search', found, topicSlug).catch(() => undefined)
    // Once per search, when its results are in.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [done, query])
  const opened = () => void api.noteSearchSelection('search', topicSlug).catch(() => undefined)
  const nothing = done && (people.data?.length ?? 0) === 0 && (posts.data?.length ?? 0) === 0 && matchingTopics.length === 0
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm text-ink-700" aria-live="polite">
          Results for <strong>“{query}”</strong>
        </p>
        <button type="button" onClick={onClear} className={buttonClass('ghost', 'sm')}>
          Clear search
        </button>
      </div>
      {nothing && (
        <EmptyState
          icon={<Search className="h-7 w-7" />}
          title="Nothing found"
          body={`Nothing matches "${query}". Try a different name, username or word.`}
          action={
            <button type="button" onClick={onClear} className={buttonClass('secondary')}>
              Show everyone
            </button>
          }
        />
      )}
      {matchingTopics.length > 0 && (
        <section aria-labelledby="results-topics">
          <h2 id="results-topics" className="mb-2 font-display text-[15px] font-bold text-ink-900">
            Topics
          </h2>
          <ul className="flex flex-wrap gap-2">
            {matchingTopics.map((t) => (
              <li key={t.slug} className={chip(false)}>
                {t.label}
              </li>
            ))}
          </ul>
        </section>
      )}
      {people.error !== null && <ErrorNote error={people.error} />}
      {people.data && people.data.length > 0 && (
        <section aria-labelledby="results-people">
          <h2 id="results-people" className="mb-2 font-display text-[15px] font-bold text-ink-900">
            People
          </h2>
          <People people={people.data} topics={topics} myTopics={mine.data} onChange={people.reload} fromSearch onOpen={opened} />
        </section>
      )}
      {posts.error !== null && <ErrorNote error={posts.error} />}
      {posts.data && posts.data.length > 0 && (
        <section aria-labelledby="results-posts">
          <h2 id="results-posts" className="mb-2 font-display text-[15px] font-bold text-ink-900">
            Posts
          </h2>
          <PostResults posts={posts.data} empty={null} onOpen={opened} />
        </section>
      )}
    </div>
  )
}
