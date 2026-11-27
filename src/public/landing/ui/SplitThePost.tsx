import clsx from 'clsx'
import { Bookmark, Heart, MessageCircle, MoreHorizontal, Repeat2, Send, Users } from 'lucide-react'
import { HOMEPAGE_COPY } from '../copy'
import { HERO_POST } from '../photos'

/**
 * The hero picture (SP-BRAND-003): the Splitpost logo, expanded.
 *
 * The logo is one post in two pieces, ivory above and seafoam below, cut on
 * the same diagonal, with an apricot line showing only in the gap. Here the
 * upper piece is an authentic-looking Splitpost image post (a fictional
 * sample creator, labelled SAMPLE: picture, name, a short title and the four
 * actions, with no counts) and the lower piece is the community whose
 * contributions help it succeed. The cut follows the logo's geometry: it
 * rises by 0.169 of the width from left to right (4.05 over 24 in the logo),
 * so the picture reads as the mark at any size. No money, amounts,
 * percentages or engagement figures.
 */

const split = HOMEPAGE_COPY.split
/** The logo's cut, as a share of the width (4.05 / 24). */
const RISE = '16.9cqw'
/** The gap between the pieces, where the apricot line shows. */
const GAP = '5cqw'

export function SplitThePost({ className }: { className?: string }) {
  const p = HERO_POST
  return (
    <figure data-testid="hero-scene" className={clsx('relative m-0 mx-auto w-full max-w-[24rem] px-1 [container-type:inline-size] sm:px-0 lg:max-w-[27rem]', className)}>
      <div aria-hidden="true" className="relative">
        {/* Upper piece: the creator's post, cut on the logo's diagonal. */}
        <div data-testid="split-creator-piece" className="relative z-10 [filter:drop-shadow(0_22px_28px_rgb(0_0_0/0.38))]">
          <div className="overflow-hidden rounded-[24px] bg-sp-bg text-sp-ink" style={{ clipPath: `polygon(0 0, 100% 0, 100% calc(100% - ${RISE}), 0 100%)` }}>
            <div className="flex items-center gap-2.5 px-4 pb-3 pt-3.5">
              <img data-photo={p.creator.avatar.id} src={p.creator.avatar.src} width={160} height={160} alt="" decoding="async" className="h-9 w-9 shrink-0 rounded-full object-cover ring-2 ring-white" />
              <div className="min-w-0 leading-tight">
                <p className="truncate text-[14px] font-bold">{p.creator.name}</p>
                <p className="truncate text-[12px] text-sp-muted">{p.creator.role}</p>
              </div>
              <span className="ml-auto rounded-full bg-white px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-[0.1em] text-sp-muted">Sample</span>
              <MoreHorizontal className="h-4 w-4 shrink-0 text-sp-muted" />
            </div>
            <img
              data-photo={p.media.id}
              src={`${p.media.base}-640.webp`}
              srcSet={p.media.widths.map((w) => `${p.media.base}-${w}.webp ${w}w`).join(', ')}
              sizes="(min-width: 1024px) 432px, min(384px, 92vw)"
              width={p.media.width}
              height={p.media.height}
              alt=""
              decoding="async"
              fetchPriority="high"
              className="block aspect-[16/10] w-full object-cover"
            />
            <div className="px-4 pt-3" style={{ paddingBottom: `calc(${RISE} + 0.75rem)` }}>
              <p className="font-sp-display text-[15px] font-extrabold leading-snug">{p.title}</p>
              <div className="mt-2 flex items-center gap-4 text-sp-ink">
                <Heart className="h-[18px] w-[18px]" />
                <MessageCircle className="h-[18px] w-[18px]" />
                <Repeat2 className="h-[18px] w-[18px]" />
                <Send className="h-[18px] w-[18px]" />
              </div>
            </div>
          </div>
        </div>

        {/* Lower piece: the community, on the same diagonal, in seafoam. */}
        <div className="relative" style={{ marginTop: `calc(-1 * ${RISE} + ${GAP})` }}>
          {/* The apricot line, behind both pieces: it shows only in the gap, as in the logo. */}
          <svg
            data-testid="gold-seam"
            aria-hidden="true"
            viewBox="0 0 100 16.9"
            preserveAspectRatio="none"
            className="pointer-events-none absolute inset-x-0 -z-10 w-full overflow-visible"
            style={{ top: `calc(-1 * ${GAP} / 2)`, height: RISE }}
          >
            <line x1="3" y1="16.4" x2="97" y2="0.5" stroke="var(--color-sp-accent)" strokeWidth="6" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
          </svg>
          <div data-testid="split-community-piece" className="relative z-10 [filter:drop-shadow(0_22px_28px_rgb(0_0_0/0.32))]">
            <div
              className="rounded-[24px] bg-sp-secondary px-4 pb-5 text-sp-ink"
              style={{ clipPath: `polygon(0 ${RISE}, 100% 0, 100% 100%, 0 100%)`, paddingTop: `calc(${RISE} + 1rem)` }}
            >
              <div className="flex justify-center">
                {p.community.map((c, i) => (
                  <img
                    key={c.id}
                    data-photo={c.id}
                    src={c.src}
                    width={160}
                    height={160}
                    alt=""
                    decoding="async"
                    className={clsx('h-11 w-11 rounded-full object-cover ring-[3px] ring-sp-secondary', i > 0 && '-ml-2.5')}
                  />
                ))}
              </div>
              <div className="mt-3 flex justify-center gap-5 text-sp-ink/80">
                <MessageCircle className="h-4 w-4" />
                <Bookmark className="h-4 w-4" />
                <Send className="h-4 w-4" />
                <Users className="h-4 w-4" />
              </div>
              <p className="mt-3 text-center font-sp-display text-[15px] font-extrabold">{split.communityTag}</p>
            </div>
          </div>
        </div>
      </div>
      <figcaption className="sr-only">{split.caption}</figcaption>
    </figure>
  )
}
