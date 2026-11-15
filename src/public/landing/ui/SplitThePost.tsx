import clsx from 'clsx'
import type { ReactNode } from 'react'
import { Heart, MessageCircle, Repeat2, Send } from 'lucide-react'
import { HOMEPAGE_COPY } from '../copy'
import { Avatar, PostArt } from './PostJourney'
import { SplitMark } from './SplitpostWordmark'

/**
 * The hero picture, "Split the post" (approved concept A).
 *
 * Priya's sample post, cut once on the diagonal of the Splitpost mark. The
 * white piece is what the creator made (her words and photo); the orange piece
 * is what fans added (likes, comments, reposts, the people who shared it). The
 * pieces sit a hair apart along the same cut, so they still read as one post.
 * No money, no amounts, no percentages: only the post and the people.
 */

const post = HOMEPAGE_COPY.post
/** How far the cut climbs across the card, in px. The fans' piece uses the same value so the edges match. */
const CUT = 46

export function SplitThePost({ className }: { className?: string }) {
  return (
    <figure data-testid="hero-scene" className={clsx('relative m-0 mx-auto w-full max-w-[25rem] lg:max-w-[28rem]', className)}>
      <div aria-hidden="true" className="relative">
        {/* The creator's piece: her post, as she made it. */}
        <div className="relative -rotate-[1.5deg] [filter:drop-shadow(0_28px_36px_rgb(0_0_0/0.45))]">
          <div
            className="rounded-[24px] bg-white px-4 pt-7 text-sp-ink sm:px-5 sm:pt-8"
            style={{ clipPath: `polygon(0 0, 100% 0, 100% calc(100% - ${CUT}px), 0 100%)`, paddingBottom: CUT + 10 }}
          >
            <div className="flex items-center gap-2.5">
              <Avatar initials="PR" tone="priya" className="h-9 w-9 text-xs" />
              <div className="min-w-0 leading-tight">
                <p className="text-sm font-bold">{post.author}</p>
                <p className="text-xs text-sp-muted">
                  {post.handle} · {post.time}
                </p>
              </div>
              <span className="ml-auto rounded-full bg-sp-neutral px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-[0.08em] text-sp-muted">Sample</span>
            </div>
            <p className="mt-2.5 text-[0.875rem] leading-snug sm:mt-3 sm:text-[0.95rem]">{post.text}</p>
            <PostArt className="mt-2.5 h-[5.5rem] min-[400px]:h-28 sm:mt-3 sm:h-32" />
          </div>
          <Tag className="absolute -left-1 -top-4 bg-sp-midnight text-white ring-1 ring-white/25 sm:-left-4">
            <Avatar initials="PR" tone="priya" className="h-5 w-5 text-[8px]" /> Priya made it
          </Tag>
        </div>

        {/* The fans' piece: everything they added to the same post. */}
        <div className="relative translate-x-2.5 rotate-[1.5deg] [filter:drop-shadow(0_28px_36px_rgb(0_0_0/0.45))] sm:translate-x-4" style={{ marginTop: -CUT + 10 }}>
          <div
            className="rounded-[24px] bg-sp-orange px-4 pb-4 text-sp-midnight sm:px-5 sm:pb-5"
            style={{ clipPath: `polygon(0 ${CUT}px, 100% 0, 100% 100%, 0 100%)`, paddingTop: CUT + 12 }}
          >
            <div className="flex items-center gap-4 text-sm font-extrabold">
              <span className="inline-flex items-center gap-1.5">
                <Heart className="h-4 w-4 fill-sp-midnight" /> {post.likes}
              </span>
              <span className="inline-flex items-center gap-1.5">
                <MessageCircle className="h-4 w-4" /> {post.comments}
              </span>
              <span className="inline-flex items-center gap-1.5">
                <Repeat2 className="h-4 w-4" /> {post.reposts}
              </span>
              <Send className="ml-auto h-4 w-4" />
            </div>
            <div className="mt-3 flex items-center gap-2.5 rounded-2xl bg-sp-midnight/10 p-2">
              <span className="flex">
                <Avatar initials="AN" tone="ana" className="h-8 w-8 text-[10px] ring-2 ring-sp-orange" />
                <Avatar initials="LE" tone="leo" className="-ml-2 h-8 w-8 text-[10px] ring-2 ring-sp-orange" />
                <Avatar initials="JK" tone="friend" className="-ml-2 h-8 w-8 text-[10px] ring-2 ring-sp-orange" />
              </span>
              <p className="min-w-0 text-[13px] font-semibold leading-snug">
                <b>Ana</b> shared it. <b>Leo</b> reposted it. Their friends joined in.
              </p>
            </div>
          </div>
          {/* The join: the Splitpost mark sits on the cut, so the two pieces read as one post. */}
          <span
            className="absolute left-1/2 grid h-11 w-11 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-sp-midnight shadow-[0_10px_24px_-8px_rgb(0_0_0/0.7)] ring-[3px] ring-white/90"
            style={{ top: CUT / 2 - 5 }}
          >
            <SplitMark tone="dark" className="h-5 w-5" />
          </span>
          <Tag className="absolute -bottom-3.5 -right-1 bg-white text-sp-midnight sm:-right-3">
            <Repeat2 className="h-3.5 w-3.5 text-sp-orange-text" /> Fans grew it
          </Tag>
        </div>

      </div>
      <figcaption className="sr-only">
        Priya’s sample post, split into two pieces that fit together: the part Priya made, her words and photo, and the part her fans added, their likes,
        comments and reposts. One post, made and grown together.
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
