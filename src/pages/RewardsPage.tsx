import clsx from 'clsx'
import { useMemo } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Gift, History, Sparkles } from 'lucide-react'
import { useNow, useStore } from '../state/store'
import { RewardCard } from '../components/RewardCard'
import { CreatorAvatar, DemoTag, EmptyState, Notice, PageHeader, SparkIcon, Tabs, buttonClass } from '../components/ui'
import { relativeTime } from '../lib/time'
import type { Reward } from '../types'

type Tab = 'following' | 'all' | 'history'

export function RewardsPage() {
  const { rewards, state, creatorById, balanceWith } = useStore()
  const now = useNow()
  const [params, setParams] = useSearchParams()
  const tabParam = params.get('tab') as Tab | null
  const tab: Tab = tabParam === 'all' || tabParam === 'history' ? tabParam : 'following'
  const creatorFilter = params.get('creator')

  const setParam = (key: string, value: string | null) => {
    const next = new URLSearchParams(params)
    if (value === null) next.delete(key)
    else next.set(key, value)
    setParams(next, { replace: true })
  }

  const visible = useMemo(() => {
    const base = tab === 'following' ? rewards.filter((r) => state.following.includes(r.creatorId)) : rewards
    return creatorFilter ? base.filter((r) => r.creatorId === creatorFilter) : base
  }, [rewards, state.following, tab, creatorFilter])

  // Group by creator, followed creators with the highest balance first.
  const groups = useMemo(() => {
    const map = new Map<string, Reward[]>()
    for (const r of visible) map.set(r.creatorId, [...(map.get(r.creatorId) ?? []), r])
    return [...map.entries()].sort((a, b) => {
      const fa = state.following.includes(a[0]) ? 1 : 0
      const fb = state.following.includes(b[0]) ? 1 : 0
      return fb - fa || balanceWith(b[0]) - balanceWith(a[0]) || (creatorById(a[0])?.name ?? '').localeCompare(creatorById(b[0])?.name ?? '')
    })
  }, [visible, state.following, balanceWith, creatorById])

  const filterCreators = useMemo(() => {
    const ids = new Set((tab === 'following' ? rewards.filter((r) => state.following.includes(r.creatorId)) : rewards).map((r) => r.creatorId))
    return [...ids].map((id) => creatorById(id)).filter((c) => c !== undefined)
  }, [rewards, state.following, tab, creatorById])

  return (
    <div>
      <PageHeader title="Rewards" subtitle="Each creator's rewards are unlocked with the CP you earn with that creator." />

      <Notice tone="spark" className="mb-4">
        <strong className="font-semibold">Simulated rewards only.</strong> Redeeming deducts demo CP and shows a confirmation, but nothing is
        purchased, delivered, or sent to the creator. CP has no cash value.
      </Notice>

      <Tabs
        label="Rewards views"
        value={tab}
        onChange={(t) => setParam('tab', t === 'following' ? null : t)}
        tabs={[
          { id: 'following', label: 'Following' },
          { id: 'all', label: 'All' },
          { id: 'history', label: 'History', count: state.redemptions.length },
        ]}
      />

      {tab === 'history' ? (
        state.redemptions.length === 0 ? (
          <EmptyState icon={<History className="h-7 w-7" />} title="No redemptions yet" body="Rewards you redeem will be listed here with their demo confirmation codes." />
        ) : (
          <ul className="space-y-3">
            {state.redemptions.map((r) => {
              const c = creatorById(r.creatorId)
              return (
                <li key={r.id} className="flex items-center gap-3 rounded-2xl bg-white p-4 ring-1 ring-ink-100">
                  {c && <CreatorAvatar creator={c} size={40} />}
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold">{r.rewardTitle}</p>
                    <p className="text-[13px] text-ink-600">
                      {c?.name} · {relativeTime(r.at, now)}
                    </p>
                    <p className="mt-1 flex flex-wrap items-center gap-2 font-mono text-[13px] font-semibold text-ink-700">
                      {r.code} <DemoTag>{r.legacy ? 'Old universal CP' : 'Simulated'}</DemoTag>
                    </p>
                  </div>
                  <span className="shrink-0 text-right text-sm font-semibold tabular-nums text-[#b2342a]">
                    −{r.cost} CP
                    <span className="block text-[11px] font-normal text-ink-600">{r.legacy ? 'universal' : `with ${c?.name.split(' ')[0]}`}</span>
                  </span>
                </li>
              )
            })}
          </ul>
        )
      ) : (
        <>
          {filterCreators.length > 1 && (
            <div className="no-scrollbar -mx-4 mb-4 flex gap-2 overflow-x-auto px-4 sm:mx-0 sm:flex-wrap sm:px-0" role="group" aria-label="Filter rewards by creator">
              <button
                type="button"
                onClick={() => setParam('creator', null)}
                aria-pressed={!creatorFilter}
                className={clsx(
                  'h-9 shrink-0 rounded-full px-4 text-sm font-semibold transition',
                  !creatorFilter ? 'bg-ink-900 text-white' : 'bg-white text-ink-700 ring-1 ring-ink-100 hover:ring-ink-200',
                )}
              >
                All creators
              </button>
              {filterCreators.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setParam('creator', creatorFilter === c.id ? null : c.id)}
                  aria-pressed={creatorFilter === c.id}
                  className={clsx(
                    'flex h-9 shrink-0 items-center gap-2 rounded-full pl-1 pr-3.5 text-sm font-semibold transition',
                    creatorFilter === c.id ? 'bg-ink-900 text-white' : 'bg-white text-ink-700 ring-1 ring-ink-100 hover:ring-ink-200',
                  )}
                >
                  <CreatorAvatar creator={c} size={28} />
                  {c.name.split(' ')[0]}
                </button>
              ))}
            </div>
          )}

          {groups.length === 0 ? (
            <EmptyState
              icon={<Gift className="h-7 w-7" />}
              title={tab === 'following' ? 'No rewards from creators you follow' : 'No rewards here'}
              body="Follow creators to see the rewards they offer their community."
              action={
                <Link to="/discover" className={buttonClass('primary')}>
                  Discover creators
                </Link>
              }
            />
          ) : (
            <div className="space-y-8">
              {groups.map(([creatorId, list]) => {
                const c = creatorById(creatorId)
                if (!c) return null
                const first = c.name.split(' ')[0]
                const bal = balanceWith(creatorId)
                const following = state.following.includes(creatorId)
                return (
                  <section key={creatorId} aria-labelledby={`rw-${creatorId}`}>
                    <div className="mb-3 flex items-center gap-3">
                      <CreatorAvatar creator={c} size={44} />
                      <div className="min-w-0 flex-1">
                        <h2 id={`rw-${creatorId}`} className="truncate font-display text-lg font-bold leading-tight">
                          <Link to={`/creator/${c.id}`} className="hover:underline">
                            {c.name}
                          </Link>
                        </h2>
                        <p className="text-[13px] text-ink-600">
                          {c.isSelf ? 'Rewards you offer your fans' : following ? `Your balance with ${first}` : `Not following ${first} yet`}
                        </p>
                      </div>
                      {!c.isSelf && (
                        <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-white px-3 py-1.5 text-sm font-semibold tabular-nums ring-1 ring-ink-100">
                          <SparkIcon className="h-4 w-4" />
                          {bal} CP
                        </span>
                      )}
                    </div>
                    {!c.isSelf && (
                      <Link to={`/creator/${c.id}`} className="mb-3 inline-flex items-center gap-1.5 text-[13px] font-semibold text-brand-700 hover:underline">
                        <Sparkles className="h-3.5 w-3.5" /> How to earn more with {first}
                      </Link>
                    )}
                    <div className="space-y-3">
                      {list.map((r) => (
                        <RewardCard key={r.id} reward={r} showCreator={false} />
                      ))}
                    </div>
                  </section>
                )
              })}
            </div>
          )}
        </>
      )}
    </div>
  )
}
