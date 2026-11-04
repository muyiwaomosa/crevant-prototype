import clsx from 'clsx'
import { Fragment, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowDownWideNarrow, CheckCheck, ChevronDown, Compass, Sparkles } from 'lucide-react'
import { useNow, useStore } from '../state/store'
import { PostCard } from '../components/PostCard'
import { CreatorAvatar, EmptyState, buttonClass } from '../components/ui'
import { dayKey, dayLabel, fullDateTime } from '../lib/time'
import { SELF_ID } from '../data/seed'

function ChronoExplainer() {
  const [open, setOpen] = useState(false)
  return (
    <div className="mb-4 rounded-2xl bg-brand-50 ring-1 ring-brand-100">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full items-center gap-3 px-4 py-3 text-left"
      >
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-white text-brand-600 ring-1 ring-brand-100">
          <ArrowDownWideNarrow className="h-5 w-5" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold text-brand-900">Newest first. No ranking.</span>
          <span className="block text-[13px] leading-snug text-brand-800/80">
            Posts from creators you follow, in the order they were shared.
          </span>
        </span>
        <ChevronDown className={clsx('h-5 w-5 shrink-0 text-brand-700 transition', open && 'rotate-180')} />
      </button>
      {open && (
        <div className="space-y-2 px-4 pb-4 text-[13px] leading-relaxed text-brand-900/85">
          <p>
            Your Home feed only shows creators you chose to follow, sorted purely by time. Nothing is boosted, hidden, or reordered based on
            predicted engagement, so you can scroll until you are caught up.
          </p>
          <p>
            That does not mean every follower sees every post, since people do not open the app all the time. It means that when you do, the
            posts are all here, in order.
          </p>
        </div>
      )}
    </div>
  )
}

export function HomePage() {
  const { posts, state, creatorById } = useStore()
  const now = useNow()
  const [filter, setFilter] = useState<string>('all')

  const followedIds = useMemo(() => new Set([...state.following, SELF_ID]), [state.following])
  const feed = useMemo(
    () => posts.filter((p) => followedIds.has(p.creatorId) && (filter === 'all' || p.creatorId === filter)),
    [posts, followedIds, filter],
  )

  const followedCreators = state.following.map((id) => creatorById(id)).filter(Boolean)
  const activeFilter = filter !== 'all' && !followedIds.has(filter) ? 'all' : filter

  return (
    <div>
      <div className="mb-4 flex items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-[1.75rem] font-extrabold leading-tight tracking-[-0.02em]">Following</h1>
          <p className="text-[15px] text-ink-500">
            {followedCreators.length === 0
              ? 'You are not following anyone yet.'
              : `${followedCreators.length} creator${followedCreators.length === 1 ? '' : 's'}, latest first`}
          </p>
        </div>
        <Link to="/discover" className={buttonClass('secondary', 'sm')}>
          <Compass className="h-4 w-4" /> Find creators
        </Link>
      </div>

      <ChronoExplainer />

      {followedCreators.length > 0 && (
        <div className="no-scrollbar -mx-4 mb-4 flex gap-2 overflow-x-auto px-4 sm:mx-0 sm:px-0" role="group" aria-label="Filter feed by creator">
          <button
            type="button"
            onClick={() => setFilter('all')}
            aria-pressed={activeFilter === 'all'}
            className={clsx(
              'h-9 shrink-0 rounded-full px-4 text-sm font-semibold transition',
              activeFilter === 'all' ? 'bg-ink-900 text-white' : 'bg-white text-ink-600 ring-1 ring-ink-100 hover:ring-ink-200',
            )}
          >
            All
          </button>
          {followedCreators.map(
            (c) =>
              c && (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setFilter(activeFilter === c.id ? 'all' : c.id)}
                  aria-pressed={activeFilter === c.id}
                  className={clsx(
                    'flex h-9 shrink-0 items-center gap-2 rounded-full pl-1 pr-3.5 text-sm font-semibold transition',
                    activeFilter === c.id ? 'bg-ink-900 text-white' : 'bg-white text-ink-600 ring-1 ring-ink-100 hover:ring-ink-200',
                  )}
                >
                  <CreatorAvatar creator={c} size={28} />
                  {c.name.split(' ')[0]}
                </button>
              ),
          )}
        </div>
      )}

      {feed.length === 0 ? (
        <EmptyState
          icon={<Compass className="h-7 w-7" />}
          title="Your feed is waiting"
          body="Follow a few creators and their posts will show up here, newest first."
          action={
            <Link to="/discover" className={buttonClass('primary')}>
              Discover creators
            </Link>
          }
        />
      ) : (
        <div className="space-y-4">
          {feed.map((post, i) => {
            const showDay = i === 0 || dayKey(feed[i - 1].createdAt) !== dayKey(post.createdAt)
            return (
              <Fragment key={post.id}>
                {showDay && (
                  <div className="sticky top-[calc(env(safe-area-inset-top)+56px)] z-10 -mx-1 flex items-center gap-3 bg-paper/90 px-1 py-2 backdrop-blur-sm md:top-0">
                    <h2 className="text-[13px] font-bold uppercase tracking-wider text-ink-500">{dayLabel(post.createdAt, now)}</h2>
                    <span className="h-px flex-1 bg-ink-200" />
                  </div>
                )}
                <PostCard post={post} />
              </Fragment>
            )
          })}

          <div className="flex flex-col items-center gap-2 px-6 py-8 text-center">
            <span className="grid h-12 w-12 place-items-center rounded-full bg-brand-50 text-brand-600">
              <CheckCheck className="h-6 w-6" />
            </span>
            <p className="font-display text-lg font-bold">You are all caught up</p>
            <p className="max-w-sm text-sm leading-relaxed text-ink-500">
              That is every post from {activeFilter === 'all' ? 'the creators you follow' : creatorById(activeFilter)?.name} back to{' '}
              {fullDateTime(feed[feed.length - 1].createdAt)}. Nothing was left out by an algorithm.
            </p>
            <Link to="/points" className="mt-2 inline-flex items-center gap-1.5 text-sm font-semibold text-brand-600 hover:underline">
              <Sparkles className="h-4 w-4" /> See your Connection Points
            </Link>
          </div>
        </div>
      )}
    </div>
  )
}
