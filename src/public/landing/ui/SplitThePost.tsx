import clsx from 'clsx'
import type { ReactNode } from 'react'
import { Heart, MessageCircle, Repeat2, Send } from 'lucide-react'
import { HOMEPAGE_COPY } from '../copy'
import { SAMPLE_AVATAR } from '../photos'
import { Photo } from './Photo'
import { Avatar } from './SamplePost'

/**
 * The hero picture, "Split the post" (simplified, SP-UAT-001 finding 1).
 *
 * One sample post in two separate pieces with a visible gap between them,
 * told in pictures rather than words. The upper piece is what the creator
 * made: a photo post (labelled SAMPLE) by Priya, a fictional creator. The
 * lower piece is what her community added: people and the ways they
 * contributed, with no counts, statistics or comments. An apricot line sits
 * in the gap. No money, no amounts, no percentages: only the post and the
 * people.
 *
 * On phones both pieces stay upright and inside the screen; from the sm
 * breakpoint up the lower piece is offset and the picture tilts slightly.
 * The accent always sits BEHIND both pieces, so it only shows in the gap.
 */

const split = HOMEPAGE_COPY.split
/** How far the cut climbs across the card, in px. Both pieces use it, so the edges stay parallel. */
const CUT = 32
/** The vertical gap between the pieces, in px. */
const GAP = 18

export function SplitThePost({ className }: { className?: string }) {
  return (
    <figure data-testid="hero-scene" className={clsx('relative m-0 mx-auto w-full max-w-[25rem] px-2 sm:px-0 lg:max-w-[28rem]', className)}>
      <div aria-hidden="true" className="relative sm:-rotate-[1.5deg]">
        {/* Upper piece: the creator's content, a photo post. */}
        <div data-testid="split-creator-piece" className="relative z-10 [filter:drop-shadow(0_24px_30px_rgb(0_0_0/0.4))]">
          <div className="relative overflow-hidden rounded-[22px] bg-sp-bg" style={{ clipPath: `polygon(0 0, 100% 0, 100% calc(100% - ${CUT}px), 0 100%)` }}>
            <Photo id="creatorEditing" sizes="(min-width: 1024px) 448px, 400px" eager decorative className="aspect-[4/3.2]" />
            <span className="absolute right-3 top-3 rounded-full bg-white/90 px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-[0.1em] text-sp-ink">Sample</span>
          </div>
          <Tag className="absolute -left-1 -top-4 bg-sp-primary text-sp-bg ring-1 ring-sp-bg/30 sm:-left-4">
            <AvatarPhoto className="h-6 w-6" /> {split.creatorTag}
          </Tag>
        </div>

        {/* Lower piece: the community's contribution, offset so the split reads without colour. */}
        <div className="relative sm:translate-x-4" style={{ marginTop: -CUT + GAP }}>
          {/* The accent detail, behind both pieces: visible only in the gap and just past each end. */}
          <svg
            data-testid="gold-seam"
            aria-hidden="true"
            viewBox="0 0 100 10"
            preserveAspectRatio="none"
            className="pointer-events-none absolute inset-x-0 -z-10 w-full overflow-visible"
            style={{ top: -GAP / 2, height: CUT }}
          >
            {/* Phones: the line follows the cut but stops short of both edges, so it stays between the pieces. */}
            <line className="sm:hidden" x1="5" y1="9.5" x2="95" y2="0.5" stroke="var(--color-sp-accent)" strokeWidth="5" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
            <line className="hidden sm:inline" x1="0" y1="10" x2="100" y2="0" stroke="var(--color-sp-accent)" strokeWidth="5" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
          </svg>
          <span aria-hidden="true" className="absolute -left-4 hidden h-2.5 w-2.5 rounded-full bg-sp-accent sm:block" style={{ top: CUT - GAP / 2 - 5 }} />
          <span aria-hidden="true" className="absolute -right-4 hidden h-2.5 w-2.5 rounded-full bg-sp-accent sm:block" style={{ top: -GAP / 2 - 5 }} />

          <div data-testid="split-community-piece" className="relative z-10 [filter:drop-shadow(0_24px_30px_rgb(0_0_0/0.4))]">
            <div
              className="flex items-center justify-between gap-3 rounded-[22px] bg-sp-secondary px-4 pb-7 text-sp-ink sm:px-5"
              style={{ clipPath: `polygon(0 ${CUT}px, 100% 0, 100% 100%, 0 100%)`, paddingTop: CUT + 14 }}
            >
              <span className="flex">
                <Avatar initials="AN" tone="ana" className="h-9 w-9 text-[11px] ring-2 ring-sp-secondary" />
                <Avatar initials="LE" tone="leo" className="-ml-1.5 h-9 w-9 text-[11px] ring-2 ring-sp-secondary" />
                <Avatar initials="JK" tone="friend" className="-ml-1.5 h-9 w-9 text-[11px] ring-2 ring-sp-secondary" />
              </span>
              <span className="flex items-center gap-4">
                <Heart className="h-5 w-5 fill-sp-ink" />
                <MessageCircle className="h-5 w-5" />
                <Repeat2 className="h-5 w-5" />
                <Send className="h-5 w-5" />
              </span>
            </div>
            <Tag className="absolute -bottom-3.5 right-2 bg-sp-bg text-sp-primary sm:-right-3">
              <Repeat2 className="h-3.5 w-3.5 text-sp-link" /> {split.communityTag}
            </Tag>
          </div>
        </div>
      </div>
      <figcaption className="sr-only">
        A sample post split into two separate pieces with a gap between them. The upper piece is what Priya created: a photo post. The lower piece is what
        her community grew: the people who liked, commented on, reposted and shared it. An apricot line marks the space between them. Priya is a fictional
        sample creator; the photos are stock images of models.
      </figcaption>
    </figure>
  )
}

/** Priya's profile photo: a licensed stock image of a model, small and circular. Decorative; the figure caption explains it. */
function AvatarPhoto({ className }: { className?: string }) {
  return (
    <img
      src={SAMPLE_AVATAR.src}
      width={SAMPLE_AVATAR.size}
      height={SAMPLE_AVATAR.size}
      alt=""
      data-photo={SAMPLE_AVATAR.id}
      decoding="async"
      className={clsx('shrink-0 rounded-full object-cover ring-2 ring-white', className)}
    />
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
