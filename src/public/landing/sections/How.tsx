import clsx from 'clsx'
import { ArrowRight } from 'lucide-react'
import { TOUR_BASE } from '../../../entry'
import { HOMEPAGE_COPY } from '../copy'
import { InsightsScreen, PostScreen, RecognitionScreen, SupportScreen } from '../ui/PhoneScreens'

const copy = HOMEPAGE_COPY.how
const SCREENS = [PostScreen, SupportScreen, InsightsScreen, RecognitionScreen]

/**
 * Section 5, HOW: POST. SUPPORT. SPLIT., shown rather than explained. The same
 * sample post moves through four concept phone screens: Priya posts, Ana and
 * Leo help it spread, Priya sees who helped, and Leo's support is recognised
 * with Connection Points and a perk. On phones the
 * screens scroll sideways; from 1024px all four sit in a row.
 */
export function How() {
  return (
    <section id="how" aria-labelledby="how-title" className="scroll-mt-16 bg-sp-neutral text-sp-ink">
      <div className="mx-auto max-w-6xl px-4 py-18 sm:px-6 sm:py-24 lg:py-28">
        <p className="font-sp-display text-[13px] font-extrabold uppercase tracking-[0.18em] text-sp-orange-text">{copy.eyebrow}</p>
        <h2
          id="how-title"
          className="mt-4 font-sp-display text-[clamp(2.6rem,10vw,6rem)] font-black leading-[0.95] tracking-[-0.02em] [font-stretch:112%]"
        >
          POST. SUPPORT. <span className="text-sp-orange-text">SPLIT.</span>
        </h2>
        <div
          role="region"
          aria-label="The post, step by step (concept screens)"
          tabIndex={0}
          className="relative -mx-4 mt-12 overflow-x-auto px-4 pb-4 focus-visible:outline focus-visible:outline-2 focus-visible:outline-sp-orange-text sm:-mx-6 sm:px-6 lg:mx-0 lg:overflow-visible lg:px-0"
        >
          <ol data-testid="how-screens" className="flex w-max snap-x snap-mandatory gap-5 lg:grid lg:w-auto lg:grid-cols-4">
            {copy.screens.map((screen, i) => {
              const Screen = SCREENS[i]
              return (
                <li key={screen.caption} data-screen={i + 1} className="w-[240px] shrink-0 snap-start lg:w-auto">
                  <p className={clsx('mb-3 text-center font-sp-display text-sm font-black tracking-[0.1em]', screen.step === 'SPLIT.' && 'text-sp-orange-text')}>
                    {screen.step}
                  </p>
                  <Screen />
                  <p className="mx-auto mt-4 max-w-[250px] text-center text-[15px] leading-snug">{screen.caption}</p>
                </li>
              )
            })}
          </ol>
        </div>

        <div className="mt-10 flex flex-col gap-5 rounded-3xl bg-white p-6 ring-1 ring-sp-ink/8 sm:flex-row sm:items-center sm:justify-between sm:p-7">
          <div className="max-w-2xl text-[15px] leading-relaxed">
            <p data-testid="how-pilot-note" className="font-semibold">
              {copy.pilotNote}
            </p>
            <p className="mt-1 text-sp-muted">{copy.smallPrint}</p>
          </div>
          {/* The tour is a separate app, so it needs a full page load. */}
          <a
            href={TOUR_BASE}
            className="inline-flex min-h-12 shrink-0 items-center justify-center gap-2 rounded-full bg-sp-midnight px-6 text-[15px] font-bold text-white transition-[background-color,box-shadow] hover:bg-sp-midnight-raised focus-visible:outline focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-sp-orange-text motion-reduce:transition-none"
          >
            {HOMEPAGE_COPY.hero.secondaryCta} <ArrowRight aria-hidden="true" className="h-4 w-4" />
          </a>
        </div>
      </div>
    </section>
  )
}
