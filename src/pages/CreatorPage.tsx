import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, Gift, MapPin, PenSquare, UserX } from 'lucide-react'
import { useStore } from '../state/store'
import { Artwork } from '../components/Artwork'
import { FollowButton } from '../components/CreatorCard'
import { PostCard } from '../components/PostCard'
import { RewardCard } from '../components/RewardCard'
import { CreatorAvatar, CreatorName, EmptyState, Tabs, buttonClass } from '../components/ui'
import { formatCompact } from '../lib/format'
import { EARN_RULES, rewardProgress } from '../lib/points'
import { SparkIcon } from '../components/ui'

export function CreatorPage() {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const { creatorById, posts, rewards, followerCount, state } = useStore()
  const [tab, setTab] = useState<'posts' | 'rewards'>('posts')
  const creator = creatorById(id)

  if (!creator) {
    return (
      <EmptyState
        icon={<UserX className="h-7 w-7" />}
        title="Creator not found"
        body="This profile does not exist in the demo."
        action={
          <Link to="/discover" className={buttonClass('primary')}>
            Back to Discover
          </Link>
        }
      />
    )
  }

  const creatorPosts = posts.filter((p) => p.creatorId === creator.id)
  const creatorRewards = rewards.filter((r) => r.creatorId === creator.id)
  const following = state.following.includes(creator.id)

  return (
    <div>
      <button type="button" onClick={() => navigate(-1)} className="mb-3 inline-flex items-center gap-1.5 text-sm font-semibold text-ink-600 hover:text-ink-900">
        <ArrowLeft className="h-4 w-4" /> Back
      </button>

      <section className="mb-5 overflow-hidden rounded-3xl bg-card shadow-[0_1px_2px_rgb(19_25_27/0.06),0_0_0_1px_rgb(19_25_27/0.05)]">
        <div className="h-32 sm:h-40">
          <Artwork kind={creator.cover} className="h-full w-full" />
        </div>
        <div className="px-5 pb-5">
          <div className="-mt-10 mb-3 flex items-end justify-between gap-3">
            <span className="relative z-10 rounded-full ring-4 ring-white">
              <CreatorAvatar creator={creator} size={84} />
            </span>
            {creator.isSelf ? (
              <Link to="/create" className={buttonClass('primary')}>
                <PenSquare className="h-4 w-4" /> New post
              </Link>
            ) : (
              <FollowButton creator={creator} />
            )}
          </div>
          <h1 className="font-display text-2xl font-extrabold tracking-[-0.02em]">
            <CreatorName creator={creator} linked={false} className="text-2xl" />
          </h1>
          <p className="text-sm text-ink-500">
            @{creator.handle} · {creator.category}
          </p>
          <p className="mt-3 text-[15px] leading-relaxed text-ink-700">{creator.bio}</p>
          <p className="mt-2 inline-flex items-center gap-1 text-[13px] text-ink-500">
            <MapPin className="h-3.5 w-3.5" /> {creator.location}
          </p>
          <dl className="mt-4 grid grid-cols-3 gap-2 text-center">
            {[
              ['Followers', formatCompact(followerCount(creator.id))],
              ['Posts', creatorPosts.length],
              ['Rewards', creatorRewards.length],
            ].map(([label, value]) => (
              <div key={label} className="rounded-2xl bg-ink-50 py-2.5">
                <dt className="text-[12px] text-ink-500">{label}</dt>
                <dd className="font-display text-lg font-bold">{value}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      {!creator.isSelf && <ConnectionPanel creatorId={creator.id} following={following} onShowRewards={() => setTab('rewards')} />}

      <Tabs
        label="Profile sections"
        value={tab}
        onChange={setTab}
        tabs={[
          { id: 'posts', label: 'Posts', count: creatorPosts.length },
          { id: 'rewards', label: 'Rewards', count: creatorRewards.length },
        ]}
      />

      {tab === 'posts' ? (
        <div className="space-y-4">
          <p className="text-[13px] text-ink-500">All posts, newest first.</p>
          {creatorPosts.map((p) => (
            <PostCard key={p.id} post={p} />
          ))}
        </div>
      ) : creatorRewards.length === 0 ? (
        <EmptyState icon={<Gift className="h-7 w-7" />} title="No rewards yet" body="This creator has not offered any demo rewards yet." />
      ) : (
        <div className="space-y-3">
          {creatorRewards.map((r) => (
            <RewardCard key={r.id} reward={r} />
          ))}
        </div>
      )}
    </div>
  )
}

/** The fan's CP relationship with one creator, and what is still left to earn. */
function ConnectionPanel({ creatorId, following, onShowRewards }: { creatorId: string; following: boolean; onShowRewards: () => void }) {
  const { creatorById, balanceWith, posts, rewards, state } = useStore()
  const creator = creatorById(creatorId)!
  const first = creator.name.split(' ')[0]
  const balance = balanceWith(creatorId)
  const theirPosts = posts.filter((p) => p.creatorId === creatorId)
  const open = (action: string) => theirPosts.filter((p) => !state.earnedKeys[`${action}:${p.id}`]).length
  const videos = theirPosts.filter((p) => p.media?.type === 'video' && !state.earnedKeys[`watch:${p.id}`]).length
  const next = rewards.filter((r) => r.creatorId === creatorId && !state.redemptions.some((x) => x.rewardId === r.id)).find((r) => r.cost > balance)
  const ready = rewards.filter((r) => r.creatorId === creatorId && r.cost <= balance && !state.redemptions.some((x) => x.rewardId === r.id)).length

  const items = [
    { label: 'Follow bonus', detail: state.followBonus[creatorId] ? 'Held while you follow' : following ? 'Not held: you were already following when the demo started, or the daily follow limit was reached' : `+${EARN_RULES.follow.points} CP when you follow`, done: Boolean(state.followBonus[creatorId]) },
    { label: 'Comment on posts', detail: `${open('comment')} of ${theirPosts.length} posts left · +${EARN_RULES.comment.points} each`, done: open('comment') === 0 },
    ...(theirPosts.some((p) => p.media?.type === 'video') ? [{ label: 'Watch videos to the end', detail: `${videos} left · +${EARN_RULES.watch.points} each`, done: videos === 0 }] : []),
    { label: 'Like posts', detail: `${open('like')} left · +${EARN_RULES.like.points} each`, done: open('like') === 0 },
    { label: 'Save posts', detail: `${open('save')} left · +${EARN_RULES.save.points} each`, done: open('save') === 0 },
  ]

  return (
    <section aria-labelledby="connection-title" className="mb-5 rounded-3xl bg-ink-900 p-5 text-white">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 id="connection-title" className="text-sm font-medium text-ink-200">
            Your CP with {first}
          </h2>
          <p className="mt-1 flex items-center gap-2 font-display text-4xl font-extrabold tabular-nums">
            <SparkIcon className="h-8 w-8" />
            {balance}
            <span className="text-base font-bold text-ink-300">CP</span>
          </p>
        </div>
        <button type="button" onClick={onShowRewards} className="rounded-full bg-white/10 px-3 py-1.5 text-[13px] font-semibold hover:bg-white/20">
          {ready > 0 ? `${ready} reward${ready === 1 ? '' : 's'} ready` : `${first}'s rewards`}
        </button>
      </div>
      {next && (
        <div className="mt-3">
          <div className="flex justify-between gap-2 text-[12px] text-ink-200">
            <span className="truncate">Next: {next.title}</span>
            <span className="shrink-0 tabular-nums">
              {balance} / {next.cost}
            </span>
          </div>
          <div className="mt-1 h-2 overflow-hidden rounded-full bg-white/15" role="progressbar" aria-label={`Progress toward ${next.title}`} aria-valuemin={0} aria-valuemax={next.cost} aria-valuenow={balance}>
            <div className="h-full rounded-full bg-spark-400" style={{ width: `${rewardProgress(balance, next.cost) * 100}%` }} />
          </div>
        </div>
      )}
      <h3 className="mt-4 text-[12px] font-semibold uppercase tracking-wider text-ink-300">Ways to earn with {first}</h3>
      <ul className="mt-2 space-y-1.5 text-[13px]">
        {items.map((i) => (
          <li key={i.label} className="flex items-start gap-2">
            <span className={i.done ? 'text-brand-300' : 'text-spark-300'} aria-hidden="true">
              {i.done ? '✓' : '•'}
            </span>
            <span>
              <span className="font-semibold">{i.label}</span> <span className="text-ink-300">{i.detail}</span>
            </span>
          </li>
        ))}
      </ul>
      <p className="mt-3 text-[12px] leading-snug text-ink-300">CP earned here can only be spent on {first}'s rewards. Demo points, no cash value.</p>
    </section>
  )
}
