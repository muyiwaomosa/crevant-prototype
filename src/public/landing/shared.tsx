import clsx from 'clsx'
import type { ReactNode } from 'react'

// Shared building blocks for the landing page.

// Approved labels. The real app does not have these features yet: the sample
// tour demonstrates them. "Being built for the pilot" is under development;
// "Planned" is not implemented anywhere yet.
export type Status = 'building' | 'planned'

const STATUS_LABEL: Record<Status, string> = {
  building: 'Being built for the pilot',
  planned: 'Planned',
}

/** Every feature claim on the page carries one of these. */
export function StatusBadge({ status, className }: { status: Status; className?: string }) {
  return (
    <span
      data-status={status}
      className={clsx(
        'inline-flex shrink-0 items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide',
        status === 'building' && 'bg-brand-50 text-brand-700 ring-1 ring-brand-100',
        status === 'planned' && 'border border-dashed border-ink-300 bg-white/60 text-ink-500',
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

// Genuine screenshots of the sample-data tour, captured at a real phone's
// proportions (the 390 x 763 points between a 47-point status bar and a
// 34-point home indicator area) by
// scripts/landing/capture-tour-screens.cjs. statusBg matches the top of each
// screen, so the status bar reads as part of the app.
export const TOUR_SCREENS = {
  // The hero: Amara's budgeting post, framed so its illustration is in view.
  hero: {
    src: '/media/landing/tour-hero.jpg',
    statusBg: '#f5f2e9',
    alt: "Amara Okafor's 50/30/20 budgeting post in the Following feed of the Crevant sample tour, with an illustration of three labelled jars for needs, wants and savings.",
  },
  feed: {
    src: '/media/landing/tour-following-feed.jpg',
    statusBg: '#fff7ea',
    alt: 'The Following feed in the Crevant sample tour: posts from three followed people, newest first, with a note saying there is no ranking.',
  },
  creator: {
    src: '/media/landing/tour-creator-page.jpg',
    statusBg: '#f6f3ee',
    alt: "A creator page in the Crevant sample tour, showing 10 Connection Points with that creator and the ways to earn more. The card notes they are demo points with no cash value.",
  },
  rewards: {
    src: '/media/landing/tour-rewards.jpg',
    statusBg: '#f7f4ef',
    alt: 'The rewards page in the Crevant sample tour: a reward from one creator, unlocked with points earned with that creator, marked as a simulated reward.',
  },
  feedPosts: {
    src: '/media/landing/tour-feed-posts.jpg',
    statusBg: '#f5f2e9',
    alt: 'Posts from followed creators in the Following feed of the Crevant sample tour, newest first, each showing how long ago it was posted.',
  },
  discover: {
    src: '/media/landing/tour-discover.jpg',
    statusBg: '#fff7ea',
    alt: 'The Discover page in the Crevant sample tour: search and topic filters, with creator cards to follow.',
  },
  myPoints: {
    src: '/media/landing/tour-my-cp.jpg',
    statusBg: '#f5f2ed',
    alt: "A fan's Connection Points in the Crevant sample tour, kept separately with each creator, with progress toward each creator's next reward.",
  },
  profile: {
    src: '/media/landing/tour-profile.jpg',
    statusBg: '#fff7ea',
    alt: 'A member profile in the Crevant sample tour, with a short bio and an Edit profile button. The follower count is marked as demo data.',
  },
  post: {
    src: '/media/landing/tour-post.jpg',
    statusBg: '#f7f4ef',
    alt: 'A post with its comments in the Crevant sample tour, and a box to add a thoughtful comment.',
  },
} as const

/** Status bar icons, sized relative to the phone's width. */
function StatusIcons() {
  return (
    <span aria-hidden="true" className="flex items-center gap-[1.6cqw] text-ink-900">
      <svg viewBox="0 0 18 12" className="h-[2.9cqw] w-auto" fill="currentColor">
        <rect x="0" y="8" width="3" height="4" rx="0.8" />
        <rect x="5" y="5.5" width="3" height="6.5" rx="0.8" />
        <rect x="10" y="3" width="3" height="9" rx="0.8" />
        <rect x="15" y="0" width="3" height="12" rx="0.8" />
      </svg>
      <svg viewBox="0 0 16 12" className="h-[2.9cqw] w-auto" fill="currentColor">
        <path d="M8 2.4c2.3 0 4.4.9 6 2.4l1.3-1.4A10.4 10.4 0 0 0 8 .4C5.2.4 2.6 1.5.7 3.4L2 4.8a8.4 8.4 0 0 1 6-2.4Zm0 3.8c1.3 0 2.5.5 3.4 1.3l1.3-1.4A6.8 6.8 0 0 0 8 4.2c-1.8 0-3.4.7-4.7 1.9l1.3 1.4C5.5 6.7 6.7 6.2 8 6.2Zm0 3.6c.4 0 .8.2 1.1.4L8 11.6 6.9 10.2c.3-.2.7-.4 1.1-.4Z" />
      </svg>
      <svg viewBox="0 0 27 12" className="h-[2.9cqw] w-auto">
        <rect x="0.5" y="0.5" width="22" height="11" rx="3" fill="none" stroke="currentColor" strokeOpacity="0.4" />
        <rect x="2" y="2" width="17" height="8" rx="1.8" fill="currentColor" />
        <path d="M24.5 4v4c.8-.3 1.5-1 1.5-2s-.7-1.7-1.5-2Z" fill="currentColor" fillOpacity="0.45" />
      </svg>
    </span>
  )
}

/**
 * A genuine tour screenshot inside a realistic phone: slim metal frame, side
 * buttons, rounded screen, camera cut-out, status bar and home indicator.
 * Everything scales with the phone's width, so it looks the same on desktop
 * and mobile. Always captioned as sample data.
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
    <figure data-screenshot={screen} className={clsx('mx-auto w-full max-w-[280px]', className)}>
      <div data-device="phone" className="@container relative">
        {/* Side buttons */}
        <span aria-hidden="true" className="absolute -left-[0.9%] top-[17%] h-[4%] w-[1.2%] rounded-l-sm bg-[#3a3f44]" />
        <span aria-hidden="true" className="absolute -left-[0.9%] top-[23%] h-[7.5%] w-[1.2%] rounded-l-sm bg-[#3a3f44]" />
        <span aria-hidden="true" className="absolute -left-[0.9%] top-[32%] h-[7.5%] w-[1.2%] rounded-l-sm bg-[#3a3f44]" />
        <span aria-hidden="true" className="absolute -right-[0.9%] top-[26%] h-[11%] w-[1.2%] rounded-r-sm bg-[#3a3f44]" />
        {/* Frame: a thin metal edge around a black bezel */}
        <div className="relative rounded-[15cqw] bg-gradient-to-b from-[#4a4f55] via-[#2a2e32] to-[#1c1f22] p-[0.9cqw] shadow-[0_18px_40px_-22px_rgb(19_25_27/0.45),0_2px_6px_-2px_rgb(19_25_27/0.2)]">
          <div className="rounded-[14.2cqw] bg-[#0b0d0e] p-[2.6cqw]">
            {/* Screen: exactly 390 x 844 */}
            <div className="relative flex aspect-[390/844] flex-col overflow-hidden rounded-[11.6cqw] bg-white">
              <div
                aria-hidden="true"
                className="flex h-[5.57%] flex-none items-center justify-between px-[7.5cqw] pt-[0.6cqw] text-[3.6cqw] font-semibold tracking-tight text-ink-900"
                style={{ backgroundColor: s.statusBg }}
              >
                <span className="w-[16cqw]">9:41</span>
                <StatusIcons />
              </div>
              {/* Camera cut-out */}
              <span aria-hidden="true" className="absolute left-1/2 top-[1.25%] h-[3.3%] w-[29%] -translate-x-1/2 rounded-full bg-black" />
              <img
                src={s.src}
                alt={s.alt}
                width={600}
                height={1174}
                loading={priority ? 'eager' : 'lazy'}
                decoding="async"
                className="block min-h-0 w-full flex-1 object-cover object-top"
              />
              {/* Home indicator area, below the app's tab bar */}
              <div aria-hidden="true" className="relative h-[4.03%] flex-none bg-white">
                <span className="absolute bottom-[22%] left-1/2 h-[14%] w-[35%] -translate-x-1/2 rounded-full bg-ink-900/85" />
              </div>
            </div>
          </div>
        </div>
      </div>
      <figcaption className="mt-3 text-center text-[13px] leading-snug text-ink-500">
        <span className="font-semibold text-ink-700">{caption}</span>
        <br />
        From the Crevant tour, with sample data and fictional people.
      </figcaption>
    </figure>
  )
}
