import clsx from 'clsx'
import { ArrowRight } from 'lucide-react'
import { TOUR_BASE } from '../../../entry'
import { HOMEPAGE_COPY } from '../copy'
import { FeedScreen, InsightsScreen, PerksScreen, RecognitionScreen } from '../ui/ProductScreens'

const copy = HOMEPAGE_COPY.experience
const SCREENS = [FeedScreen, InsightsScreen, RecognitionScreen, PerksScreen]

const focusRing = 'focus-visible:outline focus-visible:outline-3 focus-visible:outline-offset-4 focus-visible:outline-sp-ink'

/**
 * Section 4: the experience. Four concept screens (following feed, creator
 * insights, fan recognition, perks), each with a one-line caption, and a link
 * to the tour rather than explaining every feature here. Phones swipe through
 * the screens; wider screens show all four.
 */
export function Experience() {
  return (
    <section id="experience" aria-labelledby="experience-title" className="relative scroll-mt-16 overflow-hidden bg-sp-neutral text-sp-ink">
      <div className="mx-auto max-w-6xl px-4 py-18 sm:px-6 sm:py-24 lg:py-28">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between lg:gap-10">
          <h2
            id="experience-title"
            className="max-w-3xl font-sp-display text-[clamp(2.1rem,7vw,4.4rem)] font-black leading-[0.98] tracking-[-0.02em] [font-stretch:108%]"
          >
            {copy.headline.split('. ')[0]}. <span className="text-sp-orange-text">{copy.headline.split('. ')[1]}</span>
          </h2>
          <div className="max-w-sm lg:pb-2">
            <span data-status className="inline-block rounded-full bg-sp-midnight px-3 py-1 text-[12px] font-bold uppercase tracking-[0.12em] text-white">
              {copy.badge}
            </span>
            <p className="mt-3 text-[1.05rem] leading-relaxed text-sp-muted">{copy.intro}</p>
          </div>
        </div>

        <div
          role="region"
          aria-label="Concept screens with sample data"
          tabIndex={0}
          className={clsx(
            'relative -mx-4 mt-12 flex snap-x snap-mandatory gap-5 overflow-x-auto px-4 pb-6 [scrollbar-width:none] sm:-mx-6 sm:px-6 lg:mx-0 lg:mt-16 lg:grid lg:grid-cols-4 lg:gap-6 lg:overflow-visible lg:px-0 lg:pb-0',
            'focus-visible:outline focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-sp-orange-text',
          )}
        >
          <ul className="contents">
            {copy.mockups.map((m, i) => {
              const Screen = SCREENS[i]
              return (
                <li key={m.title} className={clsx('w-[72%] max-w-[260px] shrink-0 snap-center list-none sm:w-[44%] lg:w-auto lg:max-w-none', i % 2 === 1 && 'lg:mt-14')}>
                  <figure data-mockup={m.title} className="m-0">
                    <div aria-hidden="true">
                      <Screen />
                    </div>
                    <figcaption className="mt-5 text-center">
                      <span className="block font-sp-display text-lg font-extrabold">{m.title}</span>
                      <span className="mt-1 block text-[0.95rem] leading-snug text-sp-muted">{m.line}</span>
                      <span className="sr-only"> {copy.mockupLabel}.</span>
                    </figcaption>
                  </figure>
                </li>
              )
            })}
          </ul>
        </div>

        <div className="mt-10 flex flex-col items-start gap-3 sm:mt-14 sm:flex-row sm:items-center sm:gap-5">
          {/* The tour is a separate app, so it needs a full page load. */}
          <a
            href={TOUR_BASE}
            className={`inline-flex min-h-13 items-center justify-center gap-2 rounded-full bg-sp-midnight px-7 text-base font-bold text-white transition-[background-color,transform] hover:bg-sp-midnight-raised active:scale-[0.98] motion-reduce:transition-none ${focusRing}`}
          >
            {copy.cta} <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </a>
          <p data-testid="experience-small-print" className="text-sm text-sp-muted">
            {copy.smallPrint}
          </p>
        </div>
      </div>
    </section>
  )
}
