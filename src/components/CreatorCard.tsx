import clsx from 'clsx'
import { Link } from 'react-router-dom'
import { Check, Plus } from 'lucide-react'
import type { Creator } from '../types'
import { useStore } from '../state/store'
import { formatCompact } from '../lib/format'
import { Artwork } from './Artwork'
import { CreatorAvatar, CreatorName } from './ui'

export function FollowButton({ creator, size = 'md', className }: { creator: Creator; size?: 'sm' | 'md'; className?: string }) {
  const { state, toggleFollow } = useStore()
  if (creator.isSelf) return null
  const following = state.following.includes(creator.id)
  return (
    <button
      type="button"
      onClick={() => toggleFollow(creator.id)}
      aria-pressed={following}
      aria-label={following ? `Unfollow ${creator.name}` : `Follow ${creator.name}`}
      className={clsx(
        'inline-flex shrink-0 items-center justify-center gap-1.5 rounded-full font-semibold transition active:scale-[0.96]',
        size === 'sm' ? 'h-8 px-3 text-[13px]' : 'h-10 px-4.5 text-sm',
        following
          ? 'border border-ink-200 bg-white text-ink-700 hover:border-[#e8b4ae] hover:text-[#b2342a]'
          : 'bg-brand-600 text-white hover:bg-brand-700',
        className,
      )}
    >
      {following ? <Check className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
      {following ? 'Following' : 'Follow'}
    </button>
  )
}

export function CreatorCard({ creator }: { creator: Creator }) {
  const { followerCount, posts } = useStore()
  const postCount = posts.filter((p) => p.creatorId === creator.id).length
  return (
    <article className="group flex flex-col overflow-hidden rounded-3xl bg-card shadow-[0_1px_2px_rgb(19_25_27/0.06),0_0_0_1px_rgb(19_25_27/0.05)]">
      <Link to={`/creator/${creator.id}`} className="relative block h-24 overflow-hidden" aria-label={`Open ${creator.name}'s profile`}>
        <Artwork kind={creator.cover} className="h-full w-full transition duration-500 group-hover:scale-105" />
        <span className="absolute left-3 top-3 rounded-full bg-white/90 px-2.5 py-1 text-[11px] font-semibold text-ink-700">
          {creator.category}
        </span>
      </Link>
      <div className="flex flex-1 flex-col px-4 pb-4">
        <div className="-mt-7 mb-2 flex items-end justify-between gap-2">
          <Link to={`/creator/${creator.id}`} tabIndex={-1} aria-hidden="true" className="relative z-10 rounded-full ring-4 ring-white">
            <CreatorAvatar creator={creator} size={56} />
          </Link>
          <FollowButton creator={creator} size="sm" />
        </div>
        <CreatorName creator={creator} className="text-base" />
        <p className="text-[13px] text-ink-500">@{creator.handle}</p>
        <p className="mt-2 line-clamp-2 text-sm leading-relaxed text-ink-600">{creator.bio}</p>
        <p className="mt-auto pt-3 text-[13px] text-ink-500">
          <strong className="font-semibold text-ink-800">{formatCompact(followerCount(creator.id))}</strong> followers ·{' '}
          <strong className="font-semibold text-ink-800">{postCount}</strong> posts
        </p>
      </div>
    </article>
  )
}
