import { ArrowRight } from 'lucide-react'
import { HOMEPAGE_COPY } from '../copy'
import { Photo } from '../ui/Photo'
import { Eyebrow } from '../ui/Story'

const copy = HOMEPAGE_COPY.future

/**
 * Section 5, A BETTER FUTURE FOR CREATORS (WHERE), in the original site's
 * "Our bigger vision" style: mint band, large rounded photos. Two photos side
 * by side show the contrast: today, a creator exhausted at the end of a long
 * day; and what we're working toward, a creator absorbed in making something
 * in daylight. The second is an aspiration, not a result: no money, luxury
 * or "made it" imagery, and the approved wording beside it.
 */
export function Future() {
  return (
    <section id="future" aria-labelledby="future-title" className="scroll-mt-16 bg-sp-secondary-tint text-sp-ink">
      <div className="mx-auto grid max-w-6xl grid-cols-1 gap-12 px-4 pb-18 pt-20 sm:px-6 sm:pb-24 sm:pt-24 lg:grid-cols-[0.9fr_1.1fr] lg:items-center lg:gap-14 lg:pb-28 lg:pt-28">
        <div className="min-w-0">
          <Eyebrow>{copy.eyebrow}</Eyebrow>
          <h2 id="future-title" className="mt-4 text-balance font-sp-display text-[clamp(2.2rem,7vw,4rem)] font-black leading-[0.98] tracking-[-0.02em] [font-stretch:108%]">
            {copy.headline}
          </h2>
          <div data-testid="future-body" className="mt-6 max-w-xl space-y-4 text-[1.08rem] leading-relaxed sm:text-lg">
            {copy.body.map((line) => (
              <p key={line}>{line}</p>
            ))}
          </div>
        </div>

        {/* Today → what we're working toward. */}
        <div data-testid="future-contrast" className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 sm:gap-4">
          <figure data-testid="today" className="m-0 overflow-hidden rounded-[24px] shadow-[0_24px_50px_-30px_rgb(0_0_0/0.5)] sm:rounded-[28px]">
            <Photo id="futureToday" sizes="(min-width: 1024px) 290px, calc(50vw - 2.5rem)" className="aspect-[4/5] saturate-[0.55]" />
          </figure>
          <span aria-hidden="true" className="grid h-9 w-9 place-items-center rounded-full bg-white text-sp-primary shadow-[0_8px_20px_-10px_rgb(0_0_0/0.4)] sm:h-12 sm:w-12">
            <ArrowRight className="h-4 w-4 sm:h-5 sm:w-5" />
          </span>
          <figure data-testid="possible" className="m-0 overflow-hidden rounded-[24px] shadow-[0_24px_50px_-30px_rgb(0_0_0/0.5)] ring-4 ring-sp-accent sm:rounded-[28px]">
            <Photo id="futureToward" sizes="(min-width: 1024px) 290px, calc(50vw - 2.5rem)" className="aspect-[4/5]" />
          </figure>
        </div>
      </div>
      <div className="px-4 pb-20 sm:px-6 sm:pb-24">
        <p data-testid="future-closing" className="mx-auto max-w-4xl text-balance text-center font-sp-display text-[clamp(1.8rem,5.6vw,3rem)] font-black leading-[1.05] tracking-[-0.01em] text-sp-primary [font-stretch:104%]">
          {copy.closing}
        </p>
      </div>
    </section>
  )
}
