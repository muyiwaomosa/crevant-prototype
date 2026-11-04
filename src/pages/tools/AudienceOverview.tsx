import { Bookmark, Heart, MessageCircle, Ticket, TrendingUp, Users } from 'lucide-react'
import { useNow, useStore } from '../../state/store'
import { Card, DemoTag } from '../../components/ui'
import { formatCompact, formatNumber } from '../../lib/format'
import { SELF_FOLLOWER_TREND, SELF_ID } from '../../data/seed'

function Stat({ icon: Icon, label, value, hint }: { icon: typeof Heart; label: string; value: string; hint?: string }) {
  return (
    <Card className="p-4">
      <div className="flex items-center gap-2 text-[13px] font-medium text-ink-600">
        <Icon className="h-4 w-4" /> {label}
      </div>
      <p className="mt-1 font-display text-2xl font-extrabold tabular-nums tracking-tight">{value}</p>
      {hint && <p className="text-[12px] text-ink-600">{hint}</p>}
    </Card>
  )
}

/**
 * Audience numbers for the participant's own posts. In this prototype every
 * figure here is simulated, because nobody else's activity reaches this browser.
 */
export function AudienceOverview() {
  const { posts, statsFor, followerCount, rewards } = useStore()
  const now = useNow()
  const myPosts = posts.filter((p) => p.creatorId === SELF_ID)
  const totals = myPosts.reduce(
    (acc, p) => {
      const s = statsFor(p)
      acc.likes += s.likes
      acc.comments += s.comments
      acc.saves += s.saves
      return acc
    },
    { likes: 0, comments: 0, saves: 0 },
  )
  const followers = followerCount(SELF_ID)
  const engagementRate = myPosts.length ? ((totals.likes + totals.comments + totals.saves) / myPosts.length / followers) * 100 : 0
  const myRewards = rewards.filter((r) => r.creatorId === SELF_ID)
  const maxTrend = Math.max(...SELF_FOLLOWER_TREND)
  const weekGain = SELF_FOLLOWER_TREND.reduce((a, b) => a + b, 0)
  const days = Array.from({ length: 7 }, (_, i) => new Date(now - (6 - i) * 86_400_000).toLocaleDateString(undefined, { weekday: 'narrow' }))

  return (
    <div>
      <p className="mb-3 flex flex-wrap items-center gap-2 text-[13px] text-ink-600">
        <DemoTag>Simulated</DemoTag> These numbers are demo data so you can see how this could look. They are not real people or activity.
      </p>
      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Stat icon={Users} label="Followers" value={formatNumber(followers)} hint="demo audience" />
        <Stat icon={Heart} label="Likes" value={formatCompact(totals.likes)} hint={`across ${myPosts.length} posts`} />
        <Stat icon={MessageCircle} label="Comments" value={formatNumber(totals.comments)} />
        <Stat icon={Bookmark} label="Saves" value={formatNumber(totals.saves)} />
        <Stat icon={TrendingUp} label="Engagement" value={`${engagementRate.toFixed(1)}%`} hint="per post, of followers" />
        <Stat icon={Ticket} label="Rewards" value={String(myRewards.length)} hint="you offer" />
      </div>
      <Card className="p-4">
        <div className="mb-3 flex items-baseline justify-between">
          <h3 className="font-semibold">New followers, last 7 days</h3>
          <span className="text-sm font-semibold text-brand-700">+{weekGain} (demo)</span>
        </div>
        <div className="flex h-28 items-end gap-2" role="img" aria-label={`Simulated new followers per day: ${SELF_FOLLOWER_TREND.join(', ')}`}>
          {SELF_FOLLOWER_TREND.map((v, i) => (
            <div key={i} className="flex flex-1 flex-col items-center gap-1">
              <span className="text-[11px] tabular-nums text-ink-600">{v}</span>
              <div className="w-full rounded-t-lg bg-brand-500/85" style={{ height: `${(v / maxTrend) * 72}px` }} />
              <span className="text-[11px] text-ink-600">{days[i]}</span>
            </div>
          ))}
        </div>
      </Card>
    </div>
  )
}
