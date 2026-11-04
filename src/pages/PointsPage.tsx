import clsx from 'clsx'
import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { Bookmark, Gift, Heart, Info, MessageCircle, PlayCircle, Scale, ShieldCheck, Undo2, UserPlus, X } from 'lucide-react'
import type { LedgerEntry, LedgerKind } from '../types'
import { useNow, useStore } from '../state/store'
import { Card, CreatorAvatar, Notice, PageHeader, SparkIcon, buttonClass } from '../components/ui'
import { EARN_ORDER, EARN_RULES, earnedTodayCount, rewardProgress } from '../lib/points'
import { dayLabel, relativeTime } from '../lib/time'

const KIND_ICON: Record<LedgerKind, typeof Heart> = {
  follow: UserPlus,
  comment: MessageCircle,
  watch: PlayCircle,
  like: Heart,
  save: Bookmark,
  redeem: Gift,
  reversal: Undo2,
  clawback: Scale,
}

function groupByDay(entries: LedgerEntry[], now: number) {
  const groups: Array<{ label: string; items: LedgerEntry[] }> = []
  for (const e of entries) {
    const label = dayLabel(e.at, now)
    const last = groups[groups.length - 1]
    if (last && last.label === label) last.items.push(e)
    else groups.push({ label, items: [e] })
  }
  return groups
}

function MigrationBanner() {
  const { state, dismissMigrationNotice } = useStore()
  const n = state.migrationNotice
  if (!n || n.dismissed) return null
  return (
    <div role="region" aria-label="Points update" className="mb-5 rounded-2xl bg-white p-4 ring-2 ring-spark-300">
      <div className="flex items-start gap-3">
        <Info className="mt-0.5 h-5 w-5 shrink-0 text-spark-600" />
        <div className="min-w-0 flex-1 text-sm leading-relaxed text-ink-700">
          <p className="font-semibold text-ink-900">Connection Points now belong to each creator</p>
          <p className="mt-1">
            Your earlier universal balance of <strong>{n.retiredBalance} CP</strong> was retired instead of being split up, because there is no fair
            way to know which creator it should belong to. Your follows, likes, comments, saved posts, and posts are unchanged
            {n.legacyRedemptions > 0 && `, and your ${n.legacyRedemptions} earlier redemption${n.legacyRedemptions === 1 ? ' stays' : 's stay'} in your history`}
            . You can earn CP with each creator again from here.
          </p>
        </div>
        <button type="button" onClick={dismissMigrationNotice} className="-m-1 rounded-full p-1.5 text-ink-500 hover:bg-ink-100" aria-label="Dismiss notice">
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  )
}

export function PointsPage() {
  const { state, balanceWith, lifetime, creatorById, rewards } = useStore()
  const now = useNow()

  // Creators with any CP activity, plus everyone you follow.
  const rows = useMemo(() => {
    const ids = new Set<string>(state.following)
    for (const e of state.ledger) ids.add(e.creatorId)
    return [...ids]
      .map((id) => creatorById(id))
      .filter((c) => c !== undefined && !c.isSelf)
      .map((c) => {
        const balance = balanceWith(c!.id)
        const affordable = rewards.filter((r) => r.creatorId === c!.id && !state.redemptions.some((x) => x.rewardId === r.id))
        const next = affordable.find((r) => r.cost > balance) ?? null
        const ready = affordable.filter((r) => r.cost <= balance).length
        return { creator: c!, balance, next, ready, following: state.following.includes(c!.id), owed: state.clawbacks[c!.id] ?? 0 }
      })
      .sort((a, b) => b.balance - a.balance || a.creator.name.localeCompare(b.creator.name))
  }, [state.following, state.ledger, state.redemptions, state.clawbacks, creatorById, balanceWith, rewards])

  const groups = groupByDay(state.ledger, now)

  return (
    <div>
      <PageHeader title="Connection Points" subtitle="CP is earned and spent with each creator separately." />

      <MigrationBanner />

      <Notice className="mb-5">
        <strong className="font-semibold text-ink-900">How balances work.</strong> CP you earn by engaging with a creator can only be spent on that
        creator's rewards. Demo points only: no cash value, and they cannot be bought, sold, or transferred.
      </Notice>

      <section aria-labelledby="balances-title" className="mb-7">
        <h2 id="balances-title" className="mb-3 font-display text-lg font-bold">
          Your balances
        </h2>
        {rows.length === 0 ? (
          <Card className="p-5 text-sm text-ink-600">
            Follow a creator and engage with their posts to start a balance with them.{' '}
            <Link to="/discover" className="font-semibold text-brand-700 hover:underline">
              Discover creators
            </Link>
          </Card>
        ) : (
          <div className="space-y-3">
            {rows.map(({ creator: c, balance, next, ready, following, owed }) => {
              const first = c.name.split(' ')[0]
              const progress = next ? rewardProgress(balance, next.cost) : 1
              return (
                <Card key={c.id} className="p-4">
                  <div className="flex items-center gap-3">
                    <CreatorAvatar creator={c} size={44} />
                    <div className="min-w-0 flex-1">
                      <Link to={`/creator/${c.id}`} className="block truncate font-semibold hover:underline">
                        {c.name}
                      </Link>
                      <p className="text-[12px] text-ink-600">{following ? `Balance with ${first}` : `Not following ${first}`}</p>
                    </div>
                    <p className="flex items-center gap-1 font-display text-2xl font-extrabold tabular-nums">
                      <SparkIcon className="h-5 w-5" />
                      {balance}
                      <span className="text-sm font-bold text-ink-600">CP</span>
                    </p>
                  </div>
                  {next ? (
                    <div className="mt-3">
                      <div className="flex justify-between gap-2 text-[12px] text-ink-600">
                        <span className="truncate">
                          Next: <strong className="font-semibold text-ink-800">{next.title}</strong>
                        </span>
                        <span className="shrink-0 tabular-nums">
                          {balance} / {next.cost} CP
                        </span>
                      </div>
                      <div
                        className="mt-1 h-2 overflow-hidden rounded-full bg-ink-100"
                        role="progressbar"
                        aria-label={`Progress toward ${next.title}`}
                        aria-valuemin={0}
                        aria-valuemax={next.cost}
                        aria-valuenow={balance}
                      >
                        <div className="h-full rounded-full bg-gradient-to-r from-brand-500 to-spark-400" style={{ width: `${progress * 100}%` }} />
                      </div>
                    </div>
                  ) : (
                    <p className="mt-3 text-[12px] text-ink-600">No more rewards to work toward with {first} right now.</p>
                  )}
                  {owed > 0 && (
                    <p className="mt-2 text-[12px] text-ink-600">
                      {owed} CP from an earlier unfollow will be settled from your next CP with {first}.
                    </p>
                  )}
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Link to={`/rewards?tab=all&creator=${c.id}`} className={buttonClass(ready > 0 ? 'spark' : 'secondary', 'sm')}>
                      <Gift className="h-4 w-4" /> {ready > 0 ? `${ready} ready to redeem` : `${first}'s rewards`}
                    </Link>
                    <Link to={`/creator/${c.id}`} className={buttonClass('ghost', 'sm')}>
                      Earn more
                    </Link>
                  </div>
                </Card>
              )
            })}
          </div>
        )}
        <div className="mt-3 flex items-center justify-between gap-3 rounded-2xl border border-dashed border-ink-300 px-4 py-3 text-sm">
          <div>
            <p className="font-semibold text-ink-800">Lifetime CP earned, all creators</p>
            <p className="text-[12px] text-ink-600">A record of your participation. This total cannot be spent.</p>
          </div>
          <span className="font-display text-xl font-bold tabular-nums text-ink-700">{lifetime}</span>
        </div>
      </section>

      <section className="mb-7" aria-labelledby="earn-title">
        <h2 id="earn-title" className="mb-1 font-display text-lg font-bold">
          Ways to earn
        </h2>
        <p className="mb-3 text-[13px] text-ink-600">
          Points go to the creator you engaged with. Each action earns once per post or creator, with a daily limit across all creators.
        </p>
        <Card className="divide-y divide-ink-100">
          {EARN_ORDER.map((action) => {
            const rule = EARN_RULES[action]
            const Icon = KIND_ICON[action]
            const used = earnedTodayCount(state.ledger, action, now)
            const full = used >= rule.dailyLimit
            return (
              <div key={action} className="flex items-center gap-3 px-4 py-3.5">
                <span className={clsx('grid h-10 w-10 shrink-0 place-items-center rounded-xl', full ? 'bg-ink-100 text-ink-500' : 'bg-spark-50 text-spark-600')}>
                  <Icon className="h-5 w-5" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-ink-900">{rule.title}</p>
                  <p className="text-[13px] leading-snug text-ink-600">{rule.description}</p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-sm font-bold tabular-nums text-spark-700">+{rule.points}</p>
                  <p className={clsx('text-[11px] tabular-nums', full ? 'font-semibold text-ink-800' : 'text-ink-600')}>
                    {used}/{rule.dailyLimit} today
                  </p>
                </div>
              </div>
            )
          })}
        </Card>
        <p className="mt-2 text-[12px] text-ink-600">Engaging with your own posts never earns CP.</p>
      </section>

      <section aria-labelledby="history-title">
        <h2 id="history-title" className="mb-3 font-display text-lg font-bold">
          Activity history
        </h2>
        {groups.length === 0 ? (
          <p className="rounded-2xl bg-white px-4 py-6 text-center text-sm text-ink-600 ring-1 ring-ink-100">No CP activity yet.</p>
        ) : (
          <div className="space-y-5">
            {groups.map((g) => (
              <div key={g.label}>
                <h3 className="mb-2 text-[12px] font-bold uppercase tracking-wider text-ink-600">{g.label}</h3>
                <Card className="divide-y divide-ink-100">
                  {g.items.map((e) => {
                    const Icon = KIND_ICON[e.kind]
                    const c = creatorById(e.creatorId)
                    return (
                      <div key={e.id} className="flex items-center gap-3 px-4 py-3">
                        <span className={clsx('grid h-9 w-9 shrink-0 place-items-center rounded-full', e.amount < 0 ? 'bg-[#fdeceb] text-[#b2342a]' : 'bg-brand-50 text-brand-600')}>
                          <Icon className="h-[18px] w-[18px]" />
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm leading-snug text-ink-800">{e.label}</p>
                          <p className="text-[12px] text-ink-600">
                            {c ? `${c.name.split(' ')[0]} balance` : 'Balance'} · {relativeTime(e.at, now)}
                          </p>
                        </div>
                        <span className={clsx('shrink-0 text-sm font-bold tabular-nums', e.amount < 0 ? 'text-[#b2342a]' : 'text-brand-600')}>
                          {e.amount > 0 ? '+' : '−'}
                          {Math.abs(e.amount)}
                        </span>
                      </div>
                    )
                  })}
                </Card>
              </div>
            ))}
          </div>
        )}
        <p className="mt-6 flex items-center justify-center gap-1.5 text-center text-[12px] text-ink-600">
          <ShieldCheck className="h-4 w-4" /> These rules run in your browser for the demo. A real version would calculate CP on a server.
        </p>
      </section>
    </div>
  )
}
