import clsx from 'clsx'
import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { Bookmark, CalendarCheck, Gift, Heart, MessageCircle, PlayCircle, ShieldCheck, Sparkles, UserPlus } from 'lucide-react'
import type { EarnAction, LedgerEntry } from '../types'
import { useNow, useStore } from '../state/store'
import { Button, Card, CreatorAvatar, Notice, PageHeader, SparkIcon, buttonClass } from '../components/ui'
import { EARN_RULES, earnedTodayCount, lifetimeEarned } from '../lib/points'
import { dayLabel, relativeTime } from '../lib/time'

const ACTION_ICON: Record<EarnAction | 'redeem' | 'welcome', typeof Heart> = {
  checkin: CalendarCheck,
  follow: UserPlus,
  comment: MessageCircle,
  watch: PlayCircle,
  like: Heart,
  save: Bookmark,
  redeem: Gift,
  welcome: Sparkles,
}

const ACTION_ORDER: EarnAction[] = ['checkin', 'follow', 'comment', 'watch', 'like', 'save']

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

export function PointsPage() {
  const { state, balance, checkedInToday, checkIn, creatorById } = useStore()
  const now = useNow()
  const earned = lifetimeEarned(state.ledger)
  const spent = earned - balance

  const byCreator = useMemo(() => {
    const totals = new Map<string, number>()
    for (const e of state.ledger) {
      if (e.amount > 0 && e.creatorId) totals.set(e.creatorId, (totals.get(e.creatorId) ?? 0) + e.amount)
    }
    return [...totals.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5)
  }, [state.ledger])
  const maxCreator = byCreator[0]?.[1] ?? 1

  const groups = groupByDay(state.ledger, now)

  return (
    <div>
      <PageHeader title="Connection Points" subtitle="Recognition for showing up for the creators you care about." />

      <Card className="relative mb-5 overflow-hidden bg-ink-900 p-5 text-white shadow-none">
        <div className="pointer-events-none absolute -right-10 -top-12 h-48 w-48 rounded-full bg-spark-400/25 blur-2xl" />
        <div className="pointer-events-none absolute -bottom-16 -left-10 h-40 w-40 rounded-full bg-brand-500/30 blur-2xl" />
        <div className="relative">
          <p className="text-sm font-medium text-ink-300">Your balance</p>
          <p className="mt-1 flex items-center gap-2 font-display text-5xl font-extrabold tabular-nums tracking-tight">
            <SparkIcon className="h-10 w-10" />
            {balance.toLocaleString()}
            <span className="text-xl font-bold text-ink-300">CP</span>
          </p>
          <div className="mt-4 flex gap-6 text-sm">
            <div>
              <p className="text-ink-400">Earned</p>
              <p className="font-semibold tabular-nums">{earned.toLocaleString()} CP</p>
            </div>
            <div>
              <p className="text-ink-400">Redeemed</p>
              <p className="font-semibold tabular-nums">{spent.toLocaleString()} CP</p>
            </div>
          </div>
          <div className="mt-5 flex flex-wrap gap-2">
            <Link to="/rewards" className={buttonClass('spark', 'sm')}>
              <Gift className="h-4 w-4" /> Browse rewards
            </Link>
            {!checkedInToday && (
              <Button variant="secondary" size="sm" onClick={checkIn} className="border-white/20 bg-white/10 text-white hover:bg-white/20">
                <CalendarCheck className="h-4 w-4" /> Check in +{EARN_RULES.checkin.points}
              </Button>
            )}
          </div>
        </div>
      </Card>

      <Notice className="mb-6">
        <strong className="font-semibold text-ink-900">Demo points, no monetary value.</strong> CP in this prototype cannot be bought, sold,
        transferred, or exchanged for money. They exist to show how loyalty could be recognised.
      </Notice>

      <section className="mb-7" aria-labelledby="earn-title">
        <h2 id="earn-title" className="mb-1 font-display text-lg font-bold">
          Ways to earn today
        </h2>
        <p className="mb-3 text-[13px] text-ink-500">
          Each action earns once per post or creator, with a daily limit, so repeating the same tap does not add up.
        </p>
        <Card className="divide-y divide-ink-100">
          {ACTION_ORDER.map((action) => {
            const rule = EARN_RULES[action]
            const Icon = ACTION_ICON[action]
            const used = earnedTodayCount(state.ledger, action, now)
            const full = used >= rule.dailyLimit
            return (
              <div key={action} className="flex items-center gap-3 px-4 py-3.5">
                <span className={clsx('grid h-10 w-10 shrink-0 place-items-center rounded-xl', full ? 'bg-ink-100 text-ink-400' : 'bg-spark-50 text-spark-600')}>
                  <Icon className="h-5 w-5" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-ink-900">{rule.title}</p>
                  <p className="text-[13px] leading-snug text-ink-500">{rule.description}</p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-sm font-bold tabular-nums text-spark-700">+{rule.points}</p>
                  <p className={clsx('text-[11px] tabular-nums', full ? 'font-semibold text-ink-700' : 'text-ink-400')}>
                    {used}/{rule.dailyLimit} today
                  </p>
                </div>
              </div>
            )
          })}
        </Card>
      </section>

      {byCreator.length > 0 && (
        <section className="mb-7" aria-labelledby="connections-title">
          <h2 id="connections-title" className="mb-3 font-display text-lg font-bold">
            Your strongest connections
          </h2>
          <Card className="space-y-3 p-4">
            {byCreator.map(([id, total]) => {
              const c = creatorById(id)
              if (!c) return null
              return (
                <Link key={id} to={`/creator/${id}`} className="flex items-center gap-3">
                  <CreatorAvatar creator={c} size={36} />
                  <div className="min-w-0 flex-1">
                    <div className="flex justify-between text-sm">
                      <span className="truncate font-semibold">{c.name}</span>
                      <span className="tabular-nums text-ink-500">{total} CP</span>
                    </div>
                    <div className="mt-1 h-2 overflow-hidden rounded-full bg-ink-100">
                      <div className="h-full rounded-full bg-gradient-to-r from-brand-500 to-spark-400" style={{ width: `${(total / maxCreator) * 100}%` }} />
                    </div>
                  </div>
                </Link>
              )
            })}
          </Card>
        </section>
      )}

      <section aria-labelledby="history-title">
        <h2 id="history-title" className="mb-3 font-display text-lg font-bold">
          Activity history
        </h2>
        <div className="space-y-5">
          {groups.map((g) => (
            <div key={g.label}>
              <h3 className="mb-2 text-[12px] font-bold uppercase tracking-wider text-ink-500">{g.label}</h3>
              <Card className="divide-y divide-ink-100">
                {g.items.map((e) => {
                  const Icon = ACTION_ICON[e.kind]
                  return (
                    <div key={e.id} className="flex items-center gap-3 px-4 py-3">
                      <span className={clsx('grid h-9 w-9 shrink-0 place-items-center rounded-full', e.amount < 0 ? 'bg-[#fdeceb] text-[#b2342a]' : 'bg-brand-50 text-brand-600')}>
                        <Icon className="h-[18px] w-[18px]" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm leading-snug text-ink-800">{e.label}</p>
                        <p className="text-[12px] text-ink-400">{relativeTime(e.at, now)}</p>
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
        <p className="mt-6 flex items-center justify-center gap-1.5 text-center text-[12px] text-ink-400">
          <ShieldCheck className="h-4 w-4" /> In a real version, points would be calculated on the server.
        </p>
      </section>
    </div>
  )
}
