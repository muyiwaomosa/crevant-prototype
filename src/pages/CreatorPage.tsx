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
  const myCp = state.ledger.filter((e) => e.creatorId === creator.id && e.amount > 0).reduce((s, e) => s + e.amount, 0)

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
              <Link to="/studio/new" className={buttonClass('primary')}>
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
          {!creator.isSelf && (
            <p className="mt-3 text-[13px] text-ink-500">
              {following
                ? `You have earned ${myCp} CP engaging with ${creator.name.split(' ')[0]}.`
                : `Follow to see these posts in your Home feed and unlock ${creator.name.split(' ')[0]}'s rewards.`}
            </p>
          )}
        </div>
      </section>

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
