import clsx from 'clsx'
import { Heart, MessageCircle, Repeat2, Send } from 'lucide-react'

/**
 * Illustrations for Section 2's two stories. Decorative (aria-hidden): each
 * story's heading and sentence carry the meaning. Built from shapes and short
 * labels only, with no photos, no real people and no numbers on any chart, so
 * nothing here can be read as a statistic or a promise.
 */

function Chip({ children, className }: { children: string; className?: string }) {
  return (
    <span
      className={clsx(
        'absolute whitespace-nowrap rounded-full px-3 py-1.5 text-[12px] font-semibold shadow-[0_10px_24px_-10px_rgb(0_0_0/0.45)] sm:text-[13px]',
        className,
      )}
    >
      {children}
    </span>
  )
}

/** The creator: a week of posts and a follower line climbing, while the income line stays flat. */
export function CreatorStoryVisual({ chips }: { chips: readonly string[] }) {
  return (
    <div aria-hidden="true" className="relative aspect-[5/4] w-full overflow-hidden rounded-[26px] bg-sp-midnight-raised">
      <div className="absolute inset-0 bg-[radial-gradient(90%_70%_at_85%_0%,rgb(255_106_43/0.22),transparent_60%)]" />

      {/* A week of posting: five days filled. */}
      <div className="absolute left-[7%] top-[9%] flex gap-1.5">
        {[1, 1, 1, 0, 1, 1, 0].map((on, i) => (
          <span key={i} className={clsx('h-5 w-5 rounded-md sm:h-6 sm:w-6', on ? 'bg-sp-orange' : 'bg-white/10')} />
        ))}
      </div>

      {/* Two lines, no axes or numbers: followers climb, income stays flat. */}
      <svg viewBox="0 0 300 170" preserveAspectRatio="none" className="absolute inset-x-[7%] bottom-[14%] h-[55%] w-[86%]">
        <path d="M0 150 C 60 140, 90 110, 140 90 S 230 30, 300 12" fill="none" stroke="var(--color-sp-orange)" strokeWidth="5" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
        <path d="M0 150 L 300 146" fill="none" stroke="var(--color-sp-muted-on-dark)" strokeWidth="4" strokeDasharray="2 9" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
      </svg>
      <span className="absolute right-[7%] top-[27%] font-sp-display text-[12px] font-bold uppercase tracking-[0.14em] text-sp-orange">Followers</span>
      <span className="absolute bottom-[26%] right-[7%] font-sp-display text-[12px] font-bold uppercase tracking-[0.14em] text-sp-muted-on-dark">Income</span>

      <Chip className="left-[7%] top-[24%] bg-white text-sp-ink">{chips[0]}</Chip>
      <Chip className="bottom-[4%] left-[7%] bg-sp-orange text-sp-midnight">{chips[1]}</Chip>
    </div>
  )
}

function Avatar({ className, tone }: { className?: string; tone: 'fan' | 'friend' }) {
  return (
    <span
      className={clsx(
        'absolute grid place-items-center rounded-full ring-4 ring-sp-neutral',
        tone === 'fan' ? 'bg-sp-orange' : 'bg-sp-midnight-raised',
        className,
      )}
    >
      <svg viewBox="0 0 40 40" className="h-[62%] w-[62%]">
        <circle cx="20" cy="14" r="7.5" fill="white" opacity="0.9" />
        <path d="M6 38c1-9 7-14 14-14s13 5 14 14z" fill="white" opacity="0.9" />
      </svg>
    </span>
  )
}

/** The fan: shares a post with three friends and starts the conversation, and the recognition slot stays empty. */
export function FanStoryVisual({ chips }: { chips: readonly string[] }) {
  return (
    <div aria-hidden="true" className="relative aspect-[5/4] w-full overflow-hidden rounded-[26px] bg-white ring-1 ring-sp-ink/10">
      <div className="absolute inset-0 bg-[radial-gradient(80%_60%_at_10%_100%,rgb(255_106_43/0.14),transparent_60%)]" />

      {/* The post the fan shared. */}
      <div className="absolute left-[7%] top-[10%] w-[50%] rounded-2xl bg-sp-neutral p-3 ring-1 ring-sp-ink/10">
        <div className="h-12 rounded-xl bg-[repeating-linear-gradient(135deg,#ece5da_0_8px,#e2d9cb_8px_16px)] sm:h-16" />
        <div className="mt-2.5 flex items-center gap-2.5 text-sp-muted">
          <Heart className="h-4 w-4 fill-sp-orange text-sp-orange" />
          <MessageCircle className="h-4 w-4" />
          <Repeat2 className="h-4 w-4 text-sp-orange" />
        </div>
      </div>

      {/* Shared outward to three friends. */}
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 h-full w-full">
        {[
          'M44 34 C 60 30, 70 22, 82 18',
          'M44 38 C 62 40, 72 42, 84 44',
          'M44 42 C 58 54, 70 64, 80 70',
        ].map((d) => (
          <path key={d} d={d} fill="none" stroke="var(--color-sp-orange)" strokeWidth="2" strokeDasharray="3 4" vectorEffect="non-scaling-stroke" />
        ))}
      </svg>
      <Send className="absolute left-[56%] top-[27%] h-5 w-5 -rotate-12 text-sp-orange" />
      <Avatar tone="friend" className="right-[8%] top-[9%] h-11 w-11 sm:h-12 sm:w-12" />
      <Avatar tone="friend" className="right-[6%] top-[37%] h-11 w-11 sm:h-12 sm:w-12" />
      <Avatar tone="friend" className="right-[11%] top-[63%] h-11 w-11 sm:h-12 sm:w-12" />

      {/* The fan, and an empty place where recognition should be. */}
      <Avatar tone="fan" className="bottom-[9%] left-[7%] h-14 w-14 sm:h-16 sm:w-16" />
      <span className="absolute bottom-[11%] left-[27%] grid h-11 w-11 place-items-center rounded-full border-2 border-dashed border-sp-ink/25 font-sp-display text-lg font-black text-sp-ink/30 sm:h-12 sm:w-12">
        ?
      </span>

      <Chip className="left-[7%] top-[50%] bg-sp-midnight text-white sm:top-[55%]">{chips[0]}</Chip>
      <Chip className="bottom-[13%] left-[44%] bg-sp-orange text-sp-midnight">{chips[1]}</Chip>
    </div>
  )
}
