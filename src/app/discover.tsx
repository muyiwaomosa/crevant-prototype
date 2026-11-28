import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Compass, Search, Sparkles } from 'lucide-react'
import { EmptyState, PageHeader, buttonClass } from '../components/ui'
import { Message } from '../public/auth/AuthUi'
import { type DiscoverMember, type Post, type Topic } from './api'
import { useAppApi } from './AppApiContext'
import { ErrorNote, PostItem } from './components'
import { PersonSummary } from './profileDetails'
import { useTopicList } from './content'
import { DiscoverGoalHint } from './journey'

/**
 * Discover (SP-DESIGN-001: "find new value"), value and intent based
 * (20261203000000). One layout (Nov 28): the header, the search box and three
 * compact tabs, For you (posts in your interests from people you don't follow
 * yet, each with its reason), People (shared interests first) and Topics,
 * always in the same place; switching tabs or searching changes only the
 * results below. The tab is kept in the URL (?face=) so Back and links work.
 * Nothing about a search or a focus is stored.
 */
const TABS = [
  { key: 'for-you', label: 'For you' },
  { key: 'creators', label: 'People' },
  { key: 'content', label: 'Topics' },
] as const
type TabKey = (typeof TABS)[number]['key']

export function DiscoverPage() {
  const api = useAppApi()
  const topics = useTopicList()
  const [params, setParams] = useSearchParams()
  const [query, setQuery] = useState('')
  const [submitted, setSubmitted] = useState('')
  const requested = params.get('face')
  const tab: TabKey = TABS.some((t) => t.key === requested) ? (requested as TabKey) : 'for-you'
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([])
  function choose(key: TabKey, focus = false) {
    setSubmitted('')
    setQuery('')
    const p = new URLSearchParams(params)
    p.delete('browse')
    if (key === 'for-you') p.delete('face')
    else p.set('face', key)
    setParams(p, { replace: true })
    if (focus) tabRefs.current[TABS.findIndex((t) => t.key === key)]?.focus()
  }
  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    const i = TABS.findIndex((t) => t.key === tab)
    const to = e.key === 'ArrowRight' ? i + 1 : e.key === 'ArrowLeft' ? i - 1 : e.key === 'Home' ? 0 : e.key === 'End' ? TABS.length - 1 : null
    if (to === null) return
    e.preventDefault()
    choose(TABS[(to + TABS.length) % TABS.length].key, true)
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
      <form onSubmit={search} role="search" className="mb-3 flex gap-2">
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
      <div role="tablist" aria-label="Discover views" onKeyDown={onKeyDown} className="mb-4 flex border-b border-ink-200" data-testid="discover-tabs">
        {TABS.map((t, i) => (
          <button
            key={t.key}
            ref={(el) => {
              tabRefs.current[i] = el
            }}
            type="button"
            role="tab"
            id={`discover-tab-${t.key}`}
            aria-selected={!submitted && tab === t.key}
            aria-controls="discover-panel"
            tabIndex={tab === t.key ? 0 : -1}
            onClick={() => choose(t.key)}
            className={`-mb-px min-h-11 flex-1 border-b-2 px-2 text-[15px] font-semibold transition ${
              !submitted && tab === t.key ? 'border-brand-600 text-ink-900' : 'border-transparent text-ink-500 hover:text-ink-800'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div id="discover-panel" role="tabpanel" aria-labelledby={submitted ? undefined : `discover-tab-${tab}`} aria-label={submitted ? 'Search results' : undefined}>
        {submitted ? (
          <SearchResults query={submitted} topics={topics} onClear={clear} api={api} />
        ) : tab === 'creators' ? (
          <Creators topics={topics} />
        ) : tab === 'content' ? (
          <ByTopic topics={topics} />
        ) : (
          <ForYou topics={topics} />
        )}
      </div>
    </>
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
  // A few people to start with: never someone already followed.
  const people = useAsync(() => api.discover(''), [api])
  const mine = useAsync(async () => (await api.myDetails().catch(() => null))?.topics ?? [], [api])
  const few = (people.data ?? []).filter((m) => !m.followedByMe).slice(0, 3)
  return (
    <div>
      <DiscoverGoalHint />
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
                <Link to="/app/profile?edit=1" className={buttonClass('secondary')}>
                  Choose your interests
                </Link>
              }
            />
          }
        />
      )}
      {few.length > 0 && (
        <section aria-labelledby="for-you-people" className="mt-6" data-testid="for-you-people">
          <h2 id="for-you-people" className="mb-1 text-[15px] font-bold text-ink-900">
            People you might value
          </h2>
          <People people={few} topics={topics} myTopics={mine.data} onChange={people.reload} />
        </section>
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
  // First steps on Home can open People on the member's interest (SP-UX-002).
  const [params] = useSearchParams()
  const [topic, setTopic] = useState(() => params.get('interest') ?? '')
  const list = useAsync(() => api.discover('', topic || undefined), [api, topic])
  const mine = useAsync(async () => (await api.myDetails().catch(() => null))?.topics ?? [], [api])
  const topicLabel = topics?.find((t) => t.slug === topic)?.label
  return (
    <div>
      {topics && topics.length > 0 && (
        <fieldset className="mb-2">
          <legend className="sr-only">Browse by interest</legend>
          <div className="flex flex-wrap gap-2">
            <button type="button" aria-pressed={topic === ''} onClick={() => setTopic('')} className={chip(topic === '')}>
              Everyone
            </button>
            {topics.map((t) => (
              <button key={t.slug} type="button" aria-pressed={topic === t.slug} onClick={() => setTopic(t.slug)} className={chip(topic === t.slug)}>
                {t.label}
              </button>
            ))}
          </div>
        </fieldset>
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
    <ul className="divide-y divide-ink-100" onClickCapture={(e) => onOpen && (e.target as HTMLElement).closest('a') && onOpen()}>
      {people.map((m) => (
        <li key={m.id}>
          <PersonSummary member={m} topics={topics} myTopics={myTopics} onChange={onChange} source={fromSearch ? 'search' : 'discover'} variant="row" />
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
