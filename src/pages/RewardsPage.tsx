import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Gift, History } from 'lucide-react'
import { useNow, useStore } from '../state/store'
import { RewardCard } from '../components/RewardCard'
import { CPAmount, CreatorAvatar, EmptyState, Notice, PageHeader, Tabs, buttonClass } from '../components/ui'
import { relativeTime } from '../lib/time'

type Tab = 'available' | 'all' | 'history'

export function RewardsPage() {
  const { rewards, rewardStatus, state, balance, creatorById } = useStore()
  const now = useNow()
  const [tab, setTab] = useState<Tab>('available')

  // "All" includes rewards the visitor created in the studio, shown as "Your reward".
  const fanRewards = rewards
  const fromFollowed = useMemo(() => rewards.filter((r) => state.following.includes(r.creatorId)), [rewards, state.following])
  const readyCount = fanRewards.filter((r) => rewardStatus(r).canRedeem).length

  return (
    <div>
      <PageHeader
        title="Rewards"
        subtitle="Creators thank their most loyal fans. Redeem your CP for perks."
        action={<CPAmount value={balance} className="shrink-0 rounded-full bg-white px-3 py-1.5 text-sm ring-1 ring-ink-100" />}
      />

      <Notice tone="spark" className="mb-4">
        <strong className="font-semibold">Demonstration rewards.</strong> Every reward here is simulated. Redeeming one deducts demo CP and
        shows a confirmation, but nothing is purchased, shipped, or delivered.
      </Notice>

      <Tabs
        label="Rewards views"
        value={tab}
        onChange={setTab}
        tabs={[
          { id: 'available', label: 'Following', count: fromFollowed.length },
          { id: 'all', label: 'All', count: fanRewards.length },
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
                    <p className="text-[13px] text-ink-500">
                      {c?.name} · {relativeTime(r.at, now)}
                    </p>
                    <p className="mt-1 font-mono text-[13px] font-semibold text-ink-700">{r.code}</p>
                  </div>
                  <span className="shrink-0 text-sm font-semibold tabular-nums text-[#b2342a]">−{r.cost} CP</span>
                </li>
              )
            })}
          </ul>
        )
      ) : (
        <>
          {tab === 'available' && (
            <p className="mb-3 text-[13px] text-ink-500">
              {readyCount > 0
                ? `You can redeem ${readyCount} reward${readyCount === 1 ? '' : 's'} right now.`
                : 'Rewards are for followers. Keep engaging to earn more CP.'}
            </p>
          )}
          {(tab === 'available' ? fromFollowed : fanRewards).length === 0 ? (
            <EmptyState
              icon={<Gift className="h-7 w-7" />}
              title="No rewards from creators you follow"
              body="Follow creators to unlock the rewards they offer their community."
              action={
                <Link to="/discover" className={buttonClass('primary')}>
                  Discover creators
                </Link>
              }
            />
          ) : (
            <div className="space-y-3">
              {(tab === 'available' ? fromFollowed : fanRewards).map((r) => (
                <RewardCard key={r.id} reward={r} />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}
