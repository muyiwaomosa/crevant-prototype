import clsx from 'clsx'
import type { ReactNode } from 'react'
import { Heart, MessageCircle, Repeat2, Send } from 'lucide-react'
import { HOMEPAGE_COPY } from '../copy'
import { Avatar, PostArt } from './SamplePost'
import { SplitMark } from './SplitpostWordmark'

/**
 * The hero picture, "Split the post" (approved concept A, Connected Growth).
 *
 * Priya's sample post, a running coach teaching a drill, cut once on the
 * diagonal of the Splitpost mark. The cream piece is what the creator made
 * (her lesson); the green piece is what her community added (likes, comments,
 * reposts, the people who shared it). A gold seam joins them: the shared
 * value. No money, no amounts, no percentages: only the post and the people.
 */

const post = HOMEPAGE_COPY.post
const split = HOMEPAGE_COPY.split
/** How far the cut climbs across the card, in px. The fans' piece uses the same value so the edges match. */
const CUT = 46

export function SplitThePost({ className }: { className?: string }) {
  return (
    <figure data-testid="hero-scene" className={clsx('relative m-0 mx-auto w-full max-w-[25rem] lg:max-w-[28rem]', className)}>
      <div aria-hidden="true" className="relative">
        {/* The creator's piece: her post, as she made it. */}
        <div className="relative -rotate-[1.5deg] [filter:drop-shadow(0_28px_36px_rgb(0_0_0/0.45))]">
          <div
            className="rounded-[24px] bg-sp-cream px-4 pt-7 text-sp-ink sm:px-5 sm:pt-8"
            style={{ clipPath: `polygon(0 0, 100% 0, 100% calc(100% - ${CUT}px), 0 100%)`, paddingBottom: CUT + 10 }}
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

        {/* The fans' piece: everything they added to the same post. */}
        <div className="relative translate-x-2.5 rotate-[1.5deg] [filter:drop-shadow(0_28px_36px_rgb(0_0_0/0.45))] sm:translate-x-4" style={{ marginTop: -CUT + 10 }}>
          <div
            className="rounded-[24px] bg-sp-green px-4 pb-4 text-sp-ink sm:px-5 sm:pb-5"
            style={{ clipPath: `polygon(0 ${CUT}px, 100% 0, 100% 100%, 0 100%)`, paddingTop: CUT + 12 }}
          >
            <div className="flex items-center gap-4 text-sm font-extrabold">
              <span className="inline-flex items-center gap-1.5">
                <Heart className="h-4 w-4 fill-sp-teal" /> {post.likes}
              </span>
              <span className="inline-flex items-center gap-1.5">
                <MessageCircle className="h-4 w-4" /> {post.comments}
              </span>
              <span className="inline-flex items-center gap-1.5">
                <Repeat2 className="h-4 w-4" /> {post.reposts}
              </span>
              <Send className="ml-auto h-4 w-4" />
            </div>
            <div className="mt-3 flex items-center gap-2.5 rounded-2xl bg-sp-teal/10 p-2">
              <span className="flex">
                <Avatar initials="AN" tone="ana" className="h-8 w-8 text-[10px] ring-2 ring-sp-green" />
                <Avatar initials="LE" tone="leo" className="-ml-2 h-8 w-8 text-[10px] ring-2 ring-sp-green" />
                <Avatar initials="JK" tone="friend" className="-ml-2 h-8 w-8 text-[10px] ring-2 ring-sp-green" />
              </span>
              <p className="min-w-0 text-[13px] font-semibold leading-snug">
                {split.communityLine}
              </p>
            </div>
          </div>
          {/* The gold seam along the cut: the value the creator and her community share. */}
          <svg
            data-testid="gold-seam"
            aria-hidden="true"
            viewBox="0 0 100 10"
            preserveAspectRatio="none"
            className="pointer-events-none absolute inset-x-0 w-full overflow-visible"
            style={{ top: -5, height: CUT }}
          >
            <line x1="0" y1="10" x2="100" y2="0" stroke="var(--color-sp-gold)" strokeWidth="4" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
          </svg>
          {/* The join: the Splitpost mark sits on the seam, so the two pieces read as one post. */}
          <span
            className="absolute left-1/2 grid h-11 w-11 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-sp-teal shadow-[0_10px_24px_-8px_rgb(0_0_0/0.7)] ring-[3px] ring-sp-gold"
            style={{ top: CUT / 2 - 5 }}
          >
            <SplitMark tone="dark" className="h-5 w-5" />
          </span>
          <Tag className="absolute -bottom-3.5 -right-1 bg-sp-cream text-sp-teal sm:-right-3">
            <Repeat2 className="h-3.5 w-3.5 text-sp-green-text" /> {split.communityTag}
          </Tag>
        </div>

      </div>
      <figcaption className="sr-only">
        Priya’s sample post, a running coach sharing a 60-second calf drill, split into two pieces that fit together along a gold seam: the part Priya
        created, her lesson, and the part her community grew, their likes, comments and reposts. One post, created and grown together.
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
