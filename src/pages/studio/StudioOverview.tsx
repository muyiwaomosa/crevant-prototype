import { useState } from 'react'
import { Link } from 'react-router-dom'
import { AvatarEditor } from '../../components/AvatarEditor'
import { ArrowUpRight, Bookmark, Camera, Heart, MessageCircle, PenSquare, Ticket, TrendingUp, Users } from 'lucide-react'
import { useNow, useStore } from '../../state/store'
import { Card, CreatorAvatar, Notice, PageHeader, buttonClass } from '../../components/ui'
import { formatCompact, formatNumber } from '../../lib/format'
import { relativeTime } from '../../lib/time'
import { SELF_FOLLOWER_TREND, SELF_ID } from '../../data/seed'

function Stat({ icon: Icon, label, value, hint }: { icon: typeof Heart; label: string; value: string; hint?: string }) {
  return (
    <Card className="p-4">
      <div className="flex items-center gap-2 text-[13px] font-medium text-ink-500">
        <Icon className="h-4 w-4" /> {label}
      </div>
      <p className="mt-1 font-display text-2xl font-extrabold tabular-nums tracking-tight">{value}</p>
      {hint && <p className="text-[12px] text-ink-500">{hint}</p>}
    </Card>
  )
}

export function StudioOverview() {
  const { creatorById, posts, statsFor, followerCount, rewards } = useStore()
  const now = useNow()
  const [editingPhoto, setEditingPhoto] = useState(false)
  const me = creatorById(SELF_ID)!
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
  const days = Array.from({ length: 7 }, (_, i) =>
    new Date(now - (6 - i) * 86_400_000).toLocaleDateString(undefined, { weekday: 'narrow' }),
  )

  return (
    <div>
      <PageHeader
        title="Creator studio"
        subtitle="See how your community is doing and publish to your followers."
        action={
          <Link to="/studio/new" className={buttonClass('primary', 'sm')}>
            <PenSquare className="h-4 w-4" /> New post
          </Link>
        }
      />

      <Card className="mb-4 flex items-center gap-3 p-4">
        <button
          type="button"
          onClick={() => setEditingPhoto(true)}
          className="group relative shrink-0 rounded-full"
          aria-label={me.avatar ? 'Change creator profile picture' : 'Add creator profile picture'}
        >
          <CreatorAvatar creator={me} size={52} />
          <span className="absolute -bottom-0.5 -right-0.5 grid h-6 w-6 place-items-center rounded-full bg-ink-900 text-white ring-2 ring-white group-hover:bg-brand-700">
            <Camera className="h-3 w-3" />
          </span>
        </button>
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold">{me.name}</p>
          <p className="truncate text-[13px] text-ink-500">
            @{me.handle} · {me.category}
          </p>
        </div>
        <Link to={`/creator/${SELF_ID}`} className={buttonClass('secondary', 'sm')}>
          View page <ArrowUpRight className="h-4 w-4" />
        </Link>
      </Card>

      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Stat icon={Users} label="Followers" value={formatNumber(followers)} hint={`+${weekGain} this week`} />
        <Stat icon={Heart} label="Likes" value={formatCompact(totals.likes)} hint={`across ${myPosts.length} posts`} />
        <Stat icon={MessageCircle} label="Comments" value={formatNumber(totals.comments)} />
        <Stat icon={Bookmark} label="Saves" value={formatNumber(totals.saves)} />
        <Stat icon={TrendingUp} label="Engagement" value={`${engagementRate.toFixed(1)}%`} hint="per post, of followers" />
        <Stat icon={Ticket} label="Rewards" value={String(myRewards.length)} hint="offered to fans" />
      </div>

      <Card className="mb-4 p-4">
        <div className="mb-3 flex items-baseline justify-between">
          <h2 className="font-semibold">New followers, last 7 days</h2>
          <span className="text-sm font-semibold text-brand-600">+{weekGain}</span>
        </div>
        <div className="flex h-28 items-end gap-2" role="img" aria-label={`New followers per day: ${SELF_FOLLOWER_TREND.join(', ')}`}>
          {SELF_FOLLOWER_TREND.map((v, i) => (
            <div key={i} className="flex flex-1 flex-col items-center gap-1">
              <span className="text-[11px] tabular-nums text-ink-500">{v}</span>
              <div className="w-full rounded-t-lg bg-brand-500/85" style={{ height: `${(v / maxTrend) * 72}px` }} />
              <span className="text-[11px] text-ink-400">{days[i]}</span>
            </div>
          ))}
        </div>
      </Card>

      <Notice tone="brand" className="mb-6">
        Your posts appear in followers' Home feeds in time order, with no ranking. Follower counts and engagement on this page are simulated
        for the demo.
      </Notice>

      <section aria-labelledby="recent-title">
        <div className="mb-3 flex items-baseline justify-between">
          <h2 id="recent-title" className="font-display text-lg font-bold">
            Recent posts
          </h2>
          <Link to="/studio/posts" className="text-sm font-semibold text-brand-600 hover:underline">
            See all
          </Link>
        </div>
        <Card className="divide-y divide-ink-100">
          {myPosts.slice(0, 4).map((p) => {
            const s = statsFor(p)
            return (
              <Link key={p.id} to={`/post/${p.id}`} className="block px-4 py-3 hover:bg-ink-50/60">
                <p className="line-clamp-1 text-sm text-ink-800">{p.text || 'Image post'}</p>
                <p className="mt-1 flex flex-wrap gap-x-4 text-[12px] tabular-nums text-ink-500">
                  <span>{relativeTime(p.createdAt, now)}</span>
                  <span className="inline-flex items-center gap-1">
                    <Heart className="h-3.5 w-3.5" /> {formatCompact(s.likes)}
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <MessageCircle className="h-3.5 w-3.5" /> {s.comments}
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <Bookmark className="h-3.5 w-3.5" /> {s.saves}
                  </span>
                </p>
              </Link>
            )
          })}
          {myPosts.length === 0 && <p className="px-4 py-6 text-center text-sm text-ink-500">No posts yet.</p>}
        </Card>
      </section>
      <AvatarEditor open={editingPhoto} onClose={() => setEditingPhoto(false)} />
    </div>
  )
}
