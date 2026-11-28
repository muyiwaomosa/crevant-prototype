import clsx from 'clsx'
import { Link } from 'react-router-dom'
import type { Post } from './api'
import { hueFor } from './api'
import { PhotoThumb } from './media'
import { VideoThumb } from './video'

/**
 * Brand tints for designed surfaces that have no photo (SP-UAT-001 finding 3):
 * text-only posts, initials and empty tiles. Apricot, seafoam, cobalt and
 * sand, each with the ink that reads on it (WCAG AA). Chosen from an id, so a
 * member or post keeps its tint everywhere.
 */
export const TINTS = [
  { bg: '#fde6d3', fg: '#5a2a0b' },
  { bg: '#d8efe9', fg: '#173f37' },
  { bg: '#dce4f6', fg: '#172f70' },
  { bg: '#f1e8d6', fg: '#46391c' },
] as const

export function tintFor(id: string) {
  return TINTS[hueFor(id) % TINTS.length]
}

/**
 * One post as a square grid tile (Discover's "Posts you might value", a
 * profile's posts). A photo fills the tile; a video shows its poster or first
 * frame with a small video mark (cobalt until it loads); a text post is set in the display face on its tint. The link names
 * the post, so the picture itself is decorative.
 */
export function PostTile({ post, className }: { post: Post; className?: string }) {
  const kind = post.media?.kind
  const t = tintFor(post.id)
  const label = `${kind === 'photo' ? 'Photo post' : kind === 'video' ? 'Video post' : 'Post'} by ${post.author.displayName}${post.body ? `: ${post.body.slice(0, 80)}` : ''}`
  return (
    <Link
      to={`/app/post/${post.id}`}
      aria-label={label}
      data-testid="post-tile"
      data-kind={kind ?? 'text'}
      className={clsx('relative block aspect-square overflow-hidden focus:outline-none focus-visible:ring-4 focus-visible:ring-brand-300', className)}
      style={kind ? undefined : { background: t.bg, color: t.fg }}
    >
      {kind === 'photo' && <PhotoThumb post={post} />}
      {kind === 'video' && <VideoThumb post={post} />}
      {!kind && (
        <span aria-hidden="true" className="absolute inset-0 p-3 font-display text-[14px] font-extrabold leading-snug [display:-webkit-box] [-webkit-line-clamp:5] [-webkit-box-orient:vertical] overflow-hidden">
          {post.body}
        </span>
      )}
    </Link>
  )
}
