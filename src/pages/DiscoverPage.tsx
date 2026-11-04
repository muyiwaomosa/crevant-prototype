import clsx from 'clsx'
import { useMemo, useState } from 'react'
import { Search, SearchX } from 'lucide-react'
import { useStore } from '../state/store'
import { CreatorCard } from '../components/CreatorCard'
import { EmptyState, PageHeader } from '../components/ui'
import type { Category } from '../types'

const CATEGORIES: Array<Category | 'All'> = ['All', 'Food', 'Travel', 'Tech', 'Music', 'Art', 'Fitness', 'Books', 'Wellness']

export function DiscoverPage() {
  const { creators, state } = useStore()
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState<Category | 'All'>('All')

  const list = useMemo(() => {
    const q = query.trim().toLowerCase()
    return creators
      .filter((c) => !c.isSelf)
      .filter((c) => category === 'All' || c.category === category)
      .filter((c) => !q || `${c.name} ${c.handle} ${c.bio} ${c.category}`.toLowerCase().includes(q))
      .sort((a, b) => a.name.localeCompare(b.name))
  }, [creators, category, query])

  return (
    <div>
      <PageHeader
        title="Discover"
        subtitle={`Browse creators by interest. You follow ${state.following.length} of ${creators.length - 1}.`}
      />

      <label className="relative mb-3 block">
        <span className="sr-only">Search creators</span>
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
        Listed A to Z. Following someone adds every one of their posts to your Home feed, in time order.
      </p>

      {list.length === 0 ? (
        <EmptyState icon={<SearchX className="h-7 w-7" />} title="No creators match" body="Try a different word or interest." />
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
