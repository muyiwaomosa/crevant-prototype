import clsx from 'clsx'
import { useMemo, useState } from 'react'
import { Search, SearchX } from 'lucide-react'
import { useStore } from '../state/store'
import { CreatorCard } from '../components/CreatorCard'
import { EmptyState, PageHeader } from '../components/ui'
import type { Category } from '../types'
import { rankForDiscover } from '../lib/matching'

const CATEGORIES: Array<Category | 'All'> = ['All', 'Food', 'Money', 'Travel', 'Tech', 'Music', 'Art', 'Fitness', 'Books', 'Wellness']

export function DiscoverPage() {
  const { creators, state } = useStore()
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState<Category | 'All'>('All')

  // With topics chosen (onboarding), matches come first in their own group.
  // Searching or picking a topic filter shows one plain A to Z list. Either
  // way, Discover only suggests: nobody is followed for you.
  const personal = state.interests.length > 0 && category === 'All' && !query.trim()
  const list = useMemo(() => {
    const q = query.trim().toLowerCase()
    return creators
      .filter((c) => !c.isSelf)
      .filter((c) => category === 'All' || c.category === category)
      .filter((c) => !q || `${c.name} ${c.handle} ${c.bio} ${c.category}`.toLowerCase().includes(q))
      .sort((a, b) => a.name.localeCompare(b.name))
  }, [creators, category, query])
  const ranked = useMemo(() => rankForDiscover(creators, state.interests, state.following), [creators, state.interests, state.following])
  const forYou = ranked.filter((e) => e.matches).map((e) => e.creator)
  const more = ranked.filter((e) => !e.matches).map((e) => e.creator)

  return (
    <div>
      <PageHeader
        title="Discover"
        subtitle={`Find people to follow, by interest. You follow ${state.following.length} of ${creators.length - 1}.`}
      />

      <label className="relative mb-3 block">
        <span className="sr-only">Search people</span>
        <Search className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-ink-400" />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by name, topic, or handle"
          className="h-12 w-full rounded-full bg-white pl-12 pr-4 text-[15px] text-ink-900 ring-1 ring-ink-100 placeholder:text-ink-400 focus:outline-none focus:ring-2 focus:ring-brand-500"
        />
      </label>

      <div className="no-scrollbar -mx-4 mb-5 flex gap-2 overflow-x-auto px-4 sm:mx-0 sm:flex-wrap sm:px-0" role="group" aria-label="Filter by interest">
        {CATEGORIES.map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => setCategory(c)}
            aria-pressed={category === c}
            className={clsx(
              'h-9 shrink-0 rounded-full px-4 text-sm font-semibold transition',
              category === c ? 'bg-ink-900 text-white' : 'bg-white text-ink-600 ring-1 ring-ink-100 hover:ring-ink-200',
            )}
          >
            {c}
          </button>
        ))}
      </div>

      <p className="mb-3 text-[13px] text-ink-500">
        {personal ? 'Matched to the topics you chose, then everyone else.' : 'Listed A to Z.'} Following someone adds every one of their posts to your Home feed, in time order.
      </p>

      {personal ? (
        <>
          {forYou.length > 0 && (
            <section data-testid="discover-for-you" aria-labelledby="for-you-title" className="mb-8">
              <h2 id="for-you-title" className="mb-3 font-display text-lg font-bold text-ink-900">
                Matches your interests
              </h2>
              <div className="grid gap-4 sm:grid-cols-2">
                {forYou.map((c) => (
                  <CreatorCard key={c.id} creator={c} />
                ))}
              </div>
            </section>
          )}
          <section aria-labelledby="more-title">
            <h2 id="more-title" className="mb-3 font-display text-lg font-bold text-ink-900">
              More people
            </h2>
            <div className="grid gap-4 sm:grid-cols-2">
              {more.map((c) => (
                <CreatorCard key={c.id} creator={c} />
              ))}
            </div>
          </section>
        </>
      ) : list.length === 0 ? (
        <EmptyState icon={<SearchX className="h-7 w-7" />} title="No one matches" body="Try a different word or interest." />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {list.map((c) => (
            <CreatorCard key={c.id} creator={c} />
          ))}
        </div>
      )}
    </div>
  )
}
