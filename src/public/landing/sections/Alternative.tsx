import { HOMEPAGE_COPY } from '../copy'
import { DiscoverScreen, FollowingScreen, InsightsScreen } from '../ui/PhoneScreens'

const copy = HOMEPAGE_COPY.alternative
const SCREENS = [FollowingScreen, DiscoverScreen, InsightsScreen]

/**
 * Section 3, the alternative: a social platform designed around connection.
 * Three pillars, each shown on a concept phone screen labelled concept and
 * sample data. On phones the screens scroll sideways; from 1024px they sit in
 * a row. "Being built for the pilot" and "still being built and tested" sit
 * with the claims they qualify.
 */
export function Alternative() {
  return (
    <section id="alternative" aria-labelledby="alternative-title" className="relative isolate scroll-mt-16 overflow-hidden bg-sp-teal text-sp-cream">
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10 bg-[linear-gradient(118deg,transparent_0_64%,rgb(56_168_138/0.08)_64%_100%)]" />
      <div className="mx-auto max-w-6xl px-4 py-18 sm:px-6 sm:py-24 lg:py-28">
        <div className="flex flex-wrap items-center gap-3">
          <p className="font-sp-display text-[13px] font-extrabold uppercase tracking-[0.18em] text-sp-green-on-dark">{copy.eyebrow}</p>
          <span data-testid="alternative-pilot-label" className="rounded-full bg-sp-cream/10 px-3 py-1 text-xs font-bold text-sp-cream ring-1 ring-sp-cream/25">
            {copy.pilotLabel}
          </span>
        </div>
        <h2
          id="alternative-title"
          className="mt-4 max-w-4xl text-balance font-sp-display text-[clamp(2.2rem,7vw,4.2rem)] font-black leading-[0.98] tracking-[-0.02em] [font-stretch:108%]"
        >
          {copy.headline}
        </h2>
        <p className="mt-5 max-w-2xl text-[1.08rem] leading-relaxed text-sp-muted-on-dark sm:text-lg">{copy.body}</p>

        <div
          role="region"
          aria-label="What we're building (concept screens)"
          tabIndex={0}
          className="relative -mx-4 mt-12 overflow-x-auto px-4 pb-4 focus-visible:outline focus-visible:outline-2 focus-visible:outline-sp-green-on-dark sm:-mx-6 sm:px-6 lg:mx-0 lg:overflow-visible lg:px-0"
        >
          <ol data-testid="alternative-pillars" className="flex w-max snap-x snap-mandatory gap-6 lg:grid lg:w-auto lg:grid-cols-3 lg:gap-10">
            {copy.pillars.map((p, i) => {
              const Screen = SCREENS[i]
              return (
                <li key={p.title} className="w-[250px] shrink-0 snap-start lg:w-auto">
                  <Screen />
                  <h3 className="mt-6 font-sp-display text-xl font-extrabold leading-tight">{p.title}</h3>
                  <p className="mt-1.5 text-[15px] leading-snug text-sp-muted-on-dark">{p.line}</p>
                </li>
              )
            })}
          </ol>
        </div>
        <p data-testid="alternative-note" className="mt-8 text-sm text-sp-muted-on-dark">
          {copy.note}
        </p>
      </div>
    </section>
  )
}
