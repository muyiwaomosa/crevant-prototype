import clsx from 'clsx'
import { Bookmark, Heart, MessageCircle, MoreHorizontal, Share2, UserPlus } from 'lucide-react'
import { HOMEPAGE_COPY } from '../copy'
import { HERO_POST } from '../photos'

/**
 * The hero picture (SP-BRAND-003, refined Nov 28): the Splitpost logo, expanded.
 *
 * The logo is one post in two pieces, ivory above and seafoam below, cut on
 * the same diagonal, with an apricot line showing only in the gap. Here the
 * cut sits near the middle so both halves carry equal weight:
 *   * the upper piece is the content: an authentic-looking Splitpost image
 *     post (a fictional sample creator, labelled SAMPLE: picture, name, topic,
 *     a short title);
 *   * the lower piece is the community engaging with that same post: two
 *     comment bubbles, a like, a save, a share and a follow, each from one of
 *     the followers pictured.
 * Labels are plain interface words only (Like, Save, Share, Follow) and the
 * comments are drawn as lines, not words. The cut follows the logo's
 * geometry: it rises by 0.169 of the width from left to right (4.05 over 24
 * in the logo), so the picture reads as the mark at any size. No money,
 * amounts, percentages or engagement figures: engagement is shown as
 * contribution, never as something that earns money.
 */

const split = HOMEPAGE_COPY.split
/** The logo's cut, as a share of the width (4.05 / 24). */
const RISE = '16.9cqw'
/** The gap between the pieces, where the apricot line shows. */
const GAP = '5cqw'

type Person = (typeof HERO_POST.community)[number]

function Face({ person, size = 'h-9 w-9' }: { person: Person; size?: string }) {
  return (
    <img
      data-photo={person.id}
      src={person.src}
      width={160}
      height={160}
      alt=""
      decoding="async"
      className={clsx(size, 'shrink-0 rounded-full object-cover ring-2 ring-white')}
    />
  )
}

/** A comment, drawn: who wrote it, and lines where the words would be. */
function CommentBubble({ person, lines, align = 'left' }: { person: Person; lines: [string, string]; align?: 'left' | 'right' }) {
  return (
    <div className={clsx('flex items-end gap-2', align === 'right' && 'flex-row-reverse')}>
      <Face person={person} />
      <div className={clsx('min-w-0 flex-1 rounded-2xl bg-white px-3 py-2.5 shadow-[0_6px_14px_-10px_rgb(18_48_45/0.6)]', align === 'right' ? 'rounded-br-md' : 'rounded-bl-md')}>
        <span className="block h-2 rounded-full bg-sp-ink/20" style={{ width: lines[0] }} />
        <span className="mt-1.5 block h-2 rounded-full bg-sp-ink/12" style={{ width: lines[1] }} />
      </div>
      <MessageCircle className="mb-1 h-4 w-4 shrink-0 text-sp-ink/70" />
    </div>
  )
}

/** One action on the post, by one follower: a picture, the icon and its plain label. */
function Action({ person, icon: Icon, label, filled }: { person?: Person; icon: typeof Heart; label: string; filled?: boolean }) {
  return (
    <span className={clsx('inline-flex items-center gap-1 rounded-full bg-white py-1 pr-2.5 text-[11.5px] font-bold min-[400px]:gap-1.5 min-[400px]:pr-3 min-[400px]:text-[12px] text-sp-ink shadow-[0_6px_14px_-10px_rgb(18_48_45/0.6)]', person ? 'pl-1' : 'min-h-8 pl-2.5 min-[400px]:pl-3')}>
      {person && <Face person={person} size="h-6 w-6" />}
      <Icon className={clsx('h-3.5 w-3.5', filled && 'fill-current text-sp-accent-text')} />
      {label}
    </span>
  )
}

export function SplitThePost({ className }: { className?: string }) {
  const p = HERO_POST
  const [c1, c2, c3, c4] = p.community
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
              className="block aspect-[2/1] w-full object-cover"
            />
            <div className="px-4 pt-3" style={{ paddingBottom: `calc(${RISE} + 0.5rem)` }}>
              <p className="font-sp-display text-[15px] font-extrabold leading-snug">{p.title}</p>
            </div>
          </div>
        </div>

        {/* Lower piece: followers engaging with the same post, on the same diagonal, in seafoam. */}
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
              style={{ clipPath: `polygon(0 ${RISE}, 100% 0, 100% 100%, 0 100%)`, paddingTop: `calc(${RISE} + 0.9rem)` }}
            >
              <div className="space-y-2.5">
                <CommentBubble person={c1} lines={['86%', '58%']} />
                <CommentBubble person={c2} lines={['74%', '46%']} align="right" />
              </div>
              <div className="mt-3.5 flex flex-wrap justify-center gap-1 min-[400px]:gap-1.5">
                <Action person={c3} icon={Heart} label="Like" filled />
                <Action person={c4} icon={Bookmark} label="Save" />
                <Action icon={Share2} label="Share" />
                <Action icon={UserPlus} label="Follow" />
              </div>
            </div>
          </div>
        </div>
      </div>
      <figcaption className="mt-5 text-center">
        <span data-testid="hero-caption" className="block font-sp-display text-[1.05rem] font-extrabold text-sp-bg">
          {split.caption}
        </span>
        <span data-testid="hero-illustrative" className="mt-1 block text-[12px] leading-snug text-sp-muted-on-dark">
          {split.note}
        </span>
      </figcaption>
    </figure>
  )
}
