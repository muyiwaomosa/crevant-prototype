import clsx from 'clsx'
import type { ReactNode } from 'react'

// Shared building blocks for the landing page.

export type Status = 'pilot' | 'testing' | 'development' | 'vision'

const STATUS_LABEL: Record<Status, string> = {
  pilot: 'In the pilot',
  testing: 'Testing in the pilot',
  development: 'In development',
  vision: "Where we're headed",
}

/** Every feature claim on the page carries one of these. */
export function StatusBadge({ status, className }: { status: Status; className?: string }) {
  return (
    <span
      data-status={status}
      className={clsx(
        'inline-flex shrink-0 items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide',
        (status === 'pilot' || status === 'testing') && 'bg-brand-50 text-brand-700 ring-1 ring-brand-100',
        status === 'development' && 'bg-spark-50 text-spark-700 ring-1 ring-spark-200',
        status === 'vision' && 'border border-dashed border-ink-300 bg-white/60 text-ink-500',
        className,
      )}
    >
      {STATUS_LABEL[status]}
    </span>
  )
}

export function Section({
  id,
  eyebrow,
  title,
  intro,
  children,
  className,
}: {
  id: string
  eyebrow: string
  title: ReactNode
  intro?: ReactNode
  children: ReactNode
  className?: string
}) {
  return (
    <section id={id} aria-labelledby={`${id}-title`} className={clsx('px-4 py-12 sm:px-6 sm:py-20', className)}>
      <div className="mx-auto max-w-6xl">
        <p className="text-sm font-semibold uppercase tracking-wider text-brand-600">{eyebrow}</p>
        <h2 id={`${id}-title`} className="mt-2 max-w-3xl font-display text-[1.9rem] font-extrabold leading-[1.1] tracking-[-0.02em] text-ink-900 sm:text-[2.5rem]">
          {title}
        </h2>
        {intro && <div className="mt-5 max-w-2xl text-lg leading-relaxed text-ink-600">{intro}</div>}
        <div className="mt-8">{children}</div>
      </div>
    </section>
  )
}

export const cardShadow = 'shadow-[0_1px_2px_rgb(19_25_27/0.06),0_0_0_1px_rgb(19_25_27/0.05)]'

export const TOUR_SCREENS = {
  feed: {
    src: '/media/landing/tour-following-feed.jpg',
    alt: 'The Following feed in the Crevant sample tour: posts from three followed people, newest first, with a note saying there is no ranking.',
  },
  creator: {
    src: '/media/landing/tour-creator-page.jpg',
    alt: "A creator page in the Crevant sample tour, showing 10 Connection Points with that creator and the ways to earn more. The card notes they are demo points with no cash value.",
  },
  rewards: {
    src: '/media/landing/tour-rewards.jpg',
    alt: 'The rewards page in the Crevant sample tour: a reward from one creator, unlocked with points earned with that creator, marked as a simulated reward.',
  },
} as const

/**
 * A genuine screenshot of the sample-data tour (captured by
 * scripts/landing/capture-tour-screens.cjs), always labelled as sample data.
 */
export function TourScreenshot({
  screen,
  caption,
  priority = false,
  className,
}: {
  screen: keyof typeof TOUR_SCREENS
  caption: string
  priority?: boolean
  className?: string
}) {
  const s = TOUR_SCREENS[screen]
  return (
    <figure data-screenshot={screen} className={clsx('mx-auto w-full max-w-[290px]', className)}>
      <div className="rounded-[34px] bg-ink-900 p-2 shadow-[0_24px_60px_-24px_rgb(11_106_92/0.55),0_0_0_1px_rgb(19_25_27/0.08)]">
        <img
          src={s.src}
          alt={s.alt}
          width={600}
          height={1022}
          loading={priority ? 'eager' : 'lazy'}
          decoding="async"
          className="block h-auto w-full rounded-[27px]"
        />
      </div>
      <figcaption className="mt-3 text-center text-[13px] leading-snug text-ink-500">
        <span className="font-semibold text-ink-700">{caption}</span>
        <br />
        From the Crevant tour, with sample data.
      </figcaption>
    </figure>
  )
}
