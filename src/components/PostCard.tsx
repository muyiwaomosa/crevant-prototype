import clsx from 'clsx'
import { useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Bookmark, Heart, MessageCircle, Play } from 'lucide-react'
import type { Post, PostMedia as PostMediaType } from '../types'
import { useNow, useStore } from '../state/store'
import { clockTime, fullDateTime, relativeTime } from '../lib/time'
import { formatCompact } from '../lib/format'
import { Artwork } from './Artwork'
import { CreatorAvatar, CreatorName } from './ui'
import { SELF_ID } from '../data/seed'
import { EARN_RULES } from '../lib/points'
import { REQUIRED_SHARE, newWatchProgress, qualifiesAsWatched, recordSeek, recordTime, type WatchProgress } from '../lib/watch'

export function PostMedia({ media, postId, rounded = true }: { media: PostMediaType; postId: string; rounded?: boolean }) {
  const frame = clsx('relative overflow-hidden bg-ink-100', rounded && 'rounded-2xl')

  if (media.type === 'art') {
    return (
      <div className={clsx(frame, 'aspect-[5/4]')}>
        <Artwork kind={media.art} label={media.alt} className="h-full w-full" />
      </div>
    )
  }
  if (media.type === 'image') {
    return (
      <div className={frame}>
        <img src={media.src} alt={media.alt} className="max-h-[560px] w-full object-cover" loading="lazy" />
      </div>
    )
  }
  return <VideoMedia media={media} postId={postId} frame={frame} />
}

/** Video with genuine watch tracking: CP only after real playback, never for seeking to the end. */
function VideoMedia({ media, postId, frame }: { media: Extract<PostMediaType, { type: 'video' }>; postId: string; frame: string }) {
  const { markWatched, postById, state, pushToast } = useStore()
  const [started, setStarted] = useState(false)
  const videoRef = useRef<HTMLVideoElement>(null)
  const progress = useRef<WatchProgress>(newWatchProgress())
  const post = postById(postId)
  const own = post?.creatorId === SELF_ID
  const earned = Boolean(state.earnedKeys[`watch:${postId}`])
  const canEarn = !own && !earned

  const onEnded = () => {
    const v = videoRef.current
    if (!v || !canEarn) return
    if (qualifiesAsWatched(progress.current, v.duration)) markWatched(postId)
    else {
      pushToast({
        tone: 'info',
        title: 'No CP for this video yet',
        body: `Watch at least ${Math.round(REQUIRED_SHARE * 100)}% of it without skipping ahead to earn ${EARN_RULES.watch.points} CP.`,
      })
    }
    progress.current = newWatchProgress()
  }

  return (
    <div className={clsx(frame, 'aspect-[4/5] bg-ink-900')}>
      <video
        ref={videoRef}
        className="h-full w-full object-cover"
        src={media.src}
        poster={media.poster}
        controls={started}
        playsInline
        muted
        preload="none"
        aria-label={media.alt}
        onTimeUpdate={(e) => {
          const v = e.currentTarget
          progress.current = recordTime(progress.current, v.currentTime, { seeking: v.seeking })
        }}
        onSeeked={(e) => {
          progress.current = recordSeek(progress.current, e.currentTarget.currentTime)
        }}
        onEnded={onEnded}
        onPlay={() => setStarted(true)}
      />
      {!started && (
        <button
          type="button"
          onClick={() => {
            setStarted(true)
            void videoRef.current?.play()
          }}
          className="absolute inset-0 grid place-items-center bg-ink-900/10 transition hover:bg-ink-900/20"
          aria-label="Play video"
        >
          <span className="grid h-16 w-16 place-items-center rounded-full bg-white/90 text-ink-900 shadow-lg">
            <Play className="ml-1 h-7 w-7 fill-current" />
          </span>
          <span className="absolute bottom-3 left-3 rounded-full bg-ink-900/75 px-2.5 py-1 text-xs font-semibold text-white">
            0:08{canEarn ? ` · Watch it through for +${EARN_RULES.watch.points} CP` : earned ? ' · CP earned' : ''}
          </span>
        </button>
      )}
    </div>
  )
}

function ActionButton({
  active,
  onClick,
  label,
  activeClass,
  children,
  count,
}: {
  active?: boolean
  onClick: () => void
  label: string
  activeClass?: string
  children: React.ReactNode
  count?: number
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      aria-label={label}
      className={clsx(
        'group inline-flex h-10 min-w-10 items-center gap-1.5 rounded-full px-2.5 text-sm font-medium tabular-nums transition hover:bg-ink-100',
        active ? activeClass : 'text-ink-500',
      )}
    >
      {children}
      {count !== undefined && <span>{formatCompact(count)}</span>}
    </button>
  )
}

export function PostCard({ post, linkToDetail = true }: { post: Post; linkToDetail?: boolean }) {
  const { creatorById, statsFor, state, toggleLike, toggleSave } = useStore()
  const now = useNow()
  const navigate = useNavigate()
  const [popKey, setPopKey] = useState(0)
  const creator = creatorById(post.creatorId)
  if (!creator) return null

  const stats = statsFor(post)
  const liked = Boolean(state.liked[post.id])
  const saved = Boolean(state.saved[post.id])
  const isNew = now - post.createdAt < 60 * 60_000

  return (
    <article className="rounded-3xl bg-card p-4 shadow-[0_1px_2px_rgb(19_25_27/0.06),0_0_0_1px_rgb(19_25_27/0.05)] sm:p-5" aria-label={`Post by ${creator.name}`}>
      <header className="mb-3 flex items-center gap-3">
        <Link to={`/creator/${creator.id}`} tabIndex={-1} aria-hidden="true">
          <CreatorAvatar creator={creator} size={42} />
        </Link>
        <div className="min-w-0 flex-1">
          <CreatorName creator={creator} className="max-w-full text-[15px]" />
          <p className="truncate text-[13px] text-ink-500">
            @{creator.handle} · {creator.category}
          </p>
        </div>
        <time
          dateTime={new Date(post.createdAt).toISOString()}
          title={fullDateTime(post.createdAt)}
          className="shrink-0 text-right text-[13px] leading-tight text-ink-500"
        >
          <span className={clsx('block font-medium', isNew ? 'text-brand-600' : 'text-ink-700')}>
            {relativeTime(post.createdAt, now)}
          </span>
          <span className="block text-[12px] text-ink-400">{clockTime(post.createdAt)}</span>
        </time>
      </header>

      {post.text && (
        <p className="mb-3 whitespace-pre-line text-[15px] leading-relaxed text-ink-800">{post.text}</p>
      )}

      {post.media && <PostMedia media={post.media} postId={post.id} />}

      <footer className="-mx-2 mt-2 flex items-center">
        <ActionButton
          active={liked}
          activeClass="text-heart"
          label={liked ? 'Unlike' : 'Like'}
          count={stats.likes}
          onClick={() => {
            if (!liked) setPopKey((k) => k + 1)
            toggleLike(post.id)
          }}
        >
          <Heart key={popKey} className={clsx('h-5 w-5', liked && 'animate-pop fill-current')} />
        </ActionButton>
        <ActionButton
          label="Comments"
          count={stats.comments}
          onClick={() => (linkToDetail ? navigate(`/post/${post.id}`) : document.getElementById('comment-box')?.focus())}
        >
          <MessageCircle className="h-5 w-5" />
        </ActionButton>
        <div className="flex-1" />
        <ActionButton active={saved} activeClass="text-brand-600" label={saved ? 'Remove from saved' : 'Save post'} onClick={() => toggleSave(post.id)}>
          <Bookmark className={clsx('h-5 w-5', saved && 'fill-current')} />
        </ActionButton>
      </footer>
    </article>
  )
}
