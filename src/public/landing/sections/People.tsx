import { HOMEPAGE_COPY } from '../copy'
import { CreatorEffort, CreatorFrustration, Supporters } from '../ui/illustrations/PeopleIllustrations'
import { Eyebrow } from '../ui/Story'

const copy = HOMEPAGE_COPY.people

/**
 * Section 5, THE PEOPLE BEHIND THE POSTS, told in three visual moments:
 *   1. the effort: a creator working consistently, an audience gathering;
 *   2. the frustration: growing engagement without dependable income (the
 *      emphasized statement and the three pain points, drawn as a broken
 *      timeline rather than cards);
 *   3. the overlooked supporters: fans helping a creator grow.
 * Creators get the larger, earlier moments; fans a smaller one after them.
 */
export function People() {
  return (
    <section id="people" aria-labelledby="people-title" className="scroll-mt-16 bg-sp-ink text-white">
      <div className="mx-auto max-w-6xl px-4 pb-20 pt-20 sm:px-6 sm:pb-24 sm:pt-24 lg:pb-28 lg:pt-28">
        <Eyebrow tone="dark">{copy.eyebrow}</Eyebrow>
        <h2 id="people-title" className="mt-4 max-w-4xl text-balance font-sp-display text-[clamp(2.3rem,8.6vw,4.6rem)] font-black leading-[0.95] tracking-[-0.02em] [font-stretch:90%]">
          {copy.headline}
        </h2>

        {/* Moment 1: the effort. */}
        <div className="mt-12 grid items-center gap-10 lg:grid-cols-[1.05fr_0.95fr] lg:gap-14">
          <figure className="m-0 min-w-0">
            <CreatorEffort className="mx-auto max-w-[34rem]" />
          </figure>
          <div data-testid="people-body" className="min-w-0 space-y-3 text-[1.12rem] leading-relaxed sm:text-xl">
            {copy.body.map((line, i) => (
              <p key={line} className={i === copy.body.length - 1 ? 'font-semibold text-sp-secondary-on-dark' : 'text-white/85'}>
                {line}
              </p>
            ))}
          </div>
        </div>

        {/* Moment 2: the frustration. */}
        <p data-testid="people-emphasis" className="mt-16 max-w-4xl text-balance rounded-[28px] bg-sp-accent px-6 py-7 font-sp-display text-[clamp(1.7rem,5.6vw,2.8rem)] font-black leading-[1.05] text-sp-ink sm:px-9 sm:py-9">
          {copy.emphasis}
        </p>
        <div className="mt-10 grid items-start gap-10 lg:grid-cols-[0.95fr_1.05fr] lg:gap-14">
          <ol data-testid="pains" className="relative min-w-0 space-y-8 border-l-[3px] border-dashed border-sp-accent/60 pl-6 sm:pl-8">
            {copy.pains.map((pain) => (
              <li key={pain.title} className="relative">
                <span aria-hidden="true" className="absolute -left-[2.05rem] top-2 h-4 w-4 rounded-full bg-sp-accent ring-4 ring-sp-ink sm:-left-[2.55rem]" />
                <h3 className="font-sp-display text-[1.45rem] font-extrabold leading-tight sm:text-[1.65rem]">{pain.title}</h3>
                <p className="mt-1.5 text-[1.05rem] leading-relaxed text-white/80">{pain.body}</p>
              </li>
            ))}
          </ol>
          <figure className="m-0 min-w-0">
            <CreatorFrustration className="mx-auto max-w-[32rem]" />
          </figure>
        </div>

        {/* Moment 3: the overlooked supporters (smaller than the creator moments). */}
        <div className="mt-20 grid items-center gap-8 rounded-[32px] bg-white/[0.06] p-6 ring-1 ring-white/10 sm:p-9 md:grid-cols-[0.8fr_1.2fr]">
          <figure className="m-0 min-w-0">
            <Supporters className="mx-auto max-w-[22rem]" />
          </figure>
          <div data-testid="people-fans" className="min-w-0">
            <p className="font-sp-display text-[1.6rem] font-extrabold leading-tight text-sp-secondary-on-dark sm:text-[1.9rem]">{copy.fanTransition}</p>
            <div className="mt-4 space-y-2 text-[1.05rem] leading-relaxed text-white/85 sm:text-lg">
              {copy.fans.map((line) => (
                <p key={line}>{line}</p>
              ))}
            </div>
          </div>
        </div>

        <p data-testid="people-closing" className="mx-auto mt-16 max-w-4xl text-balance text-center font-sp-display text-[clamp(1.8rem,6vw,3rem)] font-black leading-[1.05]">
          {copy.closing}
        </p>
      </div>
    </section>
  )
}
