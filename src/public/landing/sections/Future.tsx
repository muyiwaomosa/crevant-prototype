import { HOMEPAGE_COPY } from '../copy'
import { TodayVsPossible } from '../ui/illustrations/PeopleIllustrations'
import { Eyebrow } from '../ui/Story'

const copy = HOMEPAGE_COPY.future

/**
 * Section 6, A BETTER FUTURE FOR CREATORS. A "today / possible" pair: a
 * creator juggling another job, then the same creator with room to create.
 * The second panel is drawn as an aspiration (soft light, open space), never
 * as a financial result; the copy beside it is the approved wording only.
 */
export function Future() {
  return (
    <section id="future" aria-labelledby="future-title" className="scroll-mt-16 bg-sp-bg text-sp-ink">
      <div className="mx-auto grid max-w-6xl gap-12 px-4 pb-20 pt-20 sm:px-6 sm:pb-24 sm:pt-24 lg:grid-cols-[0.95fr_1.05fr] lg:items-center lg:gap-16 lg:pb-28 lg:pt-28">
        <div className="min-w-0">
          <Eyebrow>{copy.eyebrow}</Eyebrow>
          <h2 id="future-title" className="mt-4 text-balance font-sp-display text-[clamp(2.3rem,8.4vw,4.4rem)] font-black leading-[0.95] tracking-[-0.02em] [font-stretch:90%]">
            {copy.headline}
          </h2>
          <div data-testid="future-body" className="mt-7 space-y-4 text-[1.12rem] leading-relaxed sm:text-xl">
            {copy.body.map((line) => (
              <p key={line}>{line}</p>
            ))}
          </div>
        </div>
        <figure className="m-0 min-w-0">
          <TodayVsPossible />
        </figure>
      </div>
      <div className="px-4 pb-20 sm:px-6 sm:pb-24">
        <p data-testid="future-closing" className="mx-auto max-w-4xl text-balance text-center font-sp-display text-[clamp(1.9rem,6.4vw,3.2rem)] font-black leading-[1.05] text-sp-primary">
          {copy.closing}
        </p>
      </div>
    </section>
  )
}
