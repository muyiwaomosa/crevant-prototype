import { HOMEPAGE_COPY } from '../copy'
import { CreatorStoryVisual, FanStoryVisual } from '../ui/StoryVisuals'

const copy = HOMEPAGE_COPY.problem

/**
 * Section 2: the problem. Two visual stories, the creator and the fan, each
 * with one short line. No statistics and no platform names.
 */
export function Problem() {
  return (
    <section id="problem" aria-labelledby="problem-title" className="scroll-mt-16 bg-sp-neutral text-sp-ink">
      <div className="mx-auto max-w-6xl px-4 py-18 sm:px-6 sm:py-24 lg:py-28">
        <h2
          id="problem-title"
          className="max-w-4xl font-sp-display text-[clamp(2.1rem,7.4vw,4.5rem)] font-black leading-[0.98] tracking-[-0.02em] [font-stretch:108%]"
        >
          {/* "You helped build it. Where's your split?" with the question in orange. */}
          <span>{copy.headline.split('. ')[0]}.</span> <span className="text-sp-orange-text">{copy.headline.split('. ')[1]}</span>
        </h2>

        <div className="mt-12 grid gap-6 md:grid-cols-2 md:gap-8 lg:mt-16">
          <article data-story="creator" aria-labelledby="story-creator" className="flex flex-col gap-5">
            <CreatorStoryVisual chips={copy.creator.chips} />
            <div>
              <h3 id="story-creator" className="font-sp-display text-sm font-extrabold uppercase tracking-[0.16em] text-sp-orange-text">
                {copy.creator.label}
              </h3>
              <p className="mt-2 font-sp-display text-[1.6rem] font-extrabold leading-[1.1] tracking-[-0.01em] sm:text-[1.9rem]">{copy.creator.line}</p>
            </div>
          </article>

          <article data-story="fan" aria-labelledby="story-fan" className="flex flex-col gap-5">
            <FanStoryVisual chips={copy.fan.chips} />
            <div>
              <h3 id="story-fan" className="font-sp-display text-sm font-extrabold uppercase tracking-[0.16em] text-sp-orange-text">
                {copy.fan.label}
              </h3>
              <p className="mt-2 font-sp-display text-[1.6rem] font-extrabold leading-[1.1] tracking-[-0.01em] sm:text-[1.9rem]">{copy.fan.line}</p>
            </div>
          </article>
        </div>
      </div>
    </section>
  )
}
