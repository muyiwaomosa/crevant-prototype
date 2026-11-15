import { HOMEPAGE_COPY } from '../copy'
import { Avatar, PostJourney } from '../ui/PostJourney'

const copy = HOMEPAGE_COPY.why

/**
 * Section 2, WHY: the problem. One sample post travels through four steps,
 * and ends on the question the rest of the page answers.
 */
export function Why() {
  const [statement, question] = copy.headline.split('. ')
  return (
    <section id="why" aria-labelledby="why-title" className="scroll-mt-16 bg-sp-neutral text-sp-ink">
      <div className="mx-auto max-w-6xl px-4 py-18 sm:px-6 sm:py-24 lg:py-28">
        <p className="font-sp-display text-[13px] font-extrabold uppercase tracking-[0.18em] text-sp-orange-text">{copy.eyebrow}</p>
        <h2
          id="why-title"
          className="mt-4 max-w-4xl font-sp-display text-[clamp(2.2rem,7.6vw,4.6rem)] font-black leading-[0.98] tracking-[-0.02em] [font-stretch:108%]"
        >
          <span>{statement}.</span> <span className="text-sp-orange-text">{question}</span>
        </h2>
        <p className="mt-5 max-w-2xl text-lg leading-relaxed text-sp-muted sm:text-xl">{copy.intro}</p>

        <div className="mt-12 lg:mt-16">
          <PostJourney />
        </div>

        <div
          data-testid="split-question"
          className="mt-14 flex flex-col items-start gap-6 rounded-[28px] bg-sp-midnight p-7 text-white sm:p-10 md:flex-row md:items-center md:justify-between lg:p-12"
        >
          <p className="font-sp-display text-[clamp(2rem,6vw,3.6rem)] font-black leading-[1] tracking-[-0.02em] [font-stretch:108%]">
            So where’s <span className="text-sp-orange">their split?</span>
          </p>
          <span aria-hidden="true" className="flex shrink-0">
            <Avatar initials="PR" tone="priya" className="h-14 w-14 text-base ring-4 ring-sp-midnight" />
            <Avatar initials="AN" tone="ana" className="-ml-3 h-14 w-14 text-base ring-4 ring-sp-midnight" />
            <Avatar initials="LE" tone="leo-light" className="-ml-3 h-14 w-14 text-base ring-4 ring-sp-midnight" />
          </span>
        </div>
      </div>
    </section>
  )
}
