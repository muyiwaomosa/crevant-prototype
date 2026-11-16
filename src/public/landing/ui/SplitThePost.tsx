import clsx from 'clsx'
import type { ReactNode } from 'react'
import { Heart, MessageCircle, Repeat2, Send } from 'lucide-react'
import { HOMEPAGE_COPY } from '../copy'
import { Avatar, PostArt } from './SamplePost'

/**
 * The hero picture, "Split the post".
 *
 * One sample post (a fitness coach teaching a drill) in two separate pieces
 * with a visible gap between them. The upper piece is what the creator made;
 * the lower piece is what her community added. The separation reads without
 * colour: a real gap, the lower piece offset, and a label on each piece.
 *
 * The gold detail sits BEHIND both pieces, so it only shows in the gap (and
 * as two small marks just past each end). It never crosses the content.
 * No money, no amounts, no percentages: only the post and the people.
 */

const post = HOMEPAGE_COPY.post
const split = HOMEPAGE_COPY.split
/** How far the cut climbs across the card, in px. Both pieces use it, so the edges stay parallel. */
const CUT = 40
/** The vertical gap between the pieces, in px. */
const GAP = 18

export function SplitThePost({ className }: { className?: string }) {
  return (
    <figure data-testid="hero-scene" className={clsx('relative m-0 mx-auto w-full max-w-[25rem] lg:max-w-[28rem]', className)}>
      <div aria-hidden="true" className="relative -rotate-[1.5deg]">
        {/* Upper piece: the creator's content. */}
        <div data-testid="split-creator-piece" className="relative z-10 [filter:drop-shadow(0_24px_30px_rgb(0_0_0/0.4))]">
          <div
            className="rounded-[22px] bg-sp-cream px-4 pt-7 text-sp-ink sm:px-5 sm:pt-8"
            style={{ clipPath: `polygon(0 0, 100% 0, 100% calc(100% - ${CUT}px), 0 100%)`, paddingBottom: CUT + 8 }}
          >
            <div className="flex items-center gap-2.5">
              <Avatar initials="PR" tone="priya" className="h-9 w-9 text-xs" />
              <div className="min-w-0 leading-tight">
                <p className="text-sm font-bold">{post.author}</p>
                <p className="text-xs text-sp-muted">
                  {post.role} · {post.time}
                </p>
              </div>
              <span className="ml-auto rounded-full bg-white px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-[0.08em] text-sp-muted">Sample</span>
            </div>
            <p className="mt-2.5 text-[0.875rem] leading-snug sm:mt-3 sm:text-[0.95rem]">{post.text}</p>
            <PostArt className="mt-2.5 h-[5.5rem] min-[400px]:h-28 sm:mt-3 sm:h-32" />
          </div>
          <Tag className="absolute -left-1 -top-4 bg-sp-teal text-sp-cream ring-1 ring-sp-cream/30 sm:-left-4">
            <Avatar initials="PR" tone="priya" className="h-5 w-5 text-[8px]" /> {split.creatorTag}
          </Tag>
        </div>

        {/* Lower piece: the community's contribution, offset so the split reads without colour. */}
        <div className="relative translate-x-2.5 sm:translate-x-4" style={{ marginTop: -CUT + GAP }}>
          {/* The gold detail, behind both pieces: visible only in the gap and just past each end. */}
          <svg
            data-testid="gold-seam"
            aria-hidden="true"
            viewBox="0 0 100 10"
            preserveAspectRatio="none"
            className="pointer-events-none absolute inset-x-0 -z-10 w-full overflow-visible"
            style={{ top: -GAP / 2, height: CUT }}
          >
            <line x1="0" y1="10" x2="100" y2="0" stroke="var(--color-sp-gold)" strokeWidth="5" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
          </svg>
          <span aria-hidden="true" className="absolute -left-2.5 h-2.5 w-2.5 rounded-full bg-sp-gold sm:-left-4" style={{ top: CUT - GAP / 2 - 5 }} />
          <span aria-hidden="true" className="absolute -right-2.5 h-2.5 w-2.5 rounded-full bg-sp-gold sm:-right-4" style={{ top: -GAP / 2 - 5 }} />

          <div data-testid="split-community-piece" className="relative z-10 [filter:drop-shadow(0_24px_30px_rgb(0_0_0/0.4))]">
            <div
              className="rounded-[22px] bg-sp-green px-4 pb-4 text-sp-ink sm:px-5 sm:pb-5"
              style={{ clipPath: `polygon(0 ${CUT}px, 100% 0, 100% 100%, 0 100%)`, paddingTop: CUT + 10 }}
            >
              <div className="flex items-center gap-4 text-sm font-extrabold">
                <span className="inline-flex items-center gap-1.5">
                  <Heart className="h-4 w-4 fill-sp-ink" /> {post.likes}
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <MessageCircle className="h-4 w-4" /> {post.comments}
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <Repeat2 className="h-4 w-4" /> {post.reposts}
                </span>
                <Send className="ml-auto h-4 w-4" />
              </div>
              <div className="mt-3 flex items-center gap-2.5 rounded-2xl bg-white/25 p-2">
                <span className="flex">
                  <Avatar initials="AN" tone="ana" className="h-8 w-8 text-[10px] ring-2 ring-sp-green" />
                  <Avatar initials="LE" tone="leo" className="-ml-2 h-8 w-8 text-[10px] ring-2 ring-sp-green" />
                  <Avatar initials="JK" tone="friend" className="-ml-2 h-8 w-8 text-[10px] ring-2 ring-sp-green" />
                </span>
                <p className="min-w-0 text-[13px] font-semibold leading-snug">{split.communityLine}</p>
              </div>
            </div>
            <Tag className="absolute -bottom-3.5 right-2 bg-sp-cream text-sp-teal sm:-right-3">
              <Repeat2 className="h-3.5 w-3.5 text-sp-green-text" /> {split.communityTag}
            </Tag>
          </div>
        </div>
      </div>
      <figcaption className="sr-only">
        A sample post from a fitness coach, split into two separate pieces with a gap between them: the upper piece is what Priya created, her lesson;
        the lower piece is what her community grew, their likes, comments and reposts. A gold line marks the space between them.
      </figcaption>
    </figure>
  )
}

function Tag({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <span
      className={clsx(
        'inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 font-sp-display text-[13px] font-extrabold tracking-[-0.005em] shadow-[0_14px_28px_-12px_rgb(0_0_0/0.65)] [font-stretch:105%]',
        className,
      )}
    >
      {children}
    </span>
  )
}
