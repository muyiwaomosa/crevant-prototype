import { HOMEPAGE_COPY } from '../copy'
import { ValueCapture } from '../ui/illustrations/StoryIllustrations'

const copy = HOMEPAGE_COPY.problem

/**
 * The approved body, in order, grouped into story beats for spacing only (no
 * words added, removed or moved): the opening three lines (the effort, then
 * the imbalance), how the platforms profit, the fans, and the final question.
 */
const BEATS = [copy.body.slice(0, 3), copy.body.slice(3, 5), copy.body.slice(5, 8), copy.body.slice(8)] as const

/**
 * Section 2, THE PROBLEM, in the original site's layout. On phones the
 * value-flow illustration comes right after the headline and the three
 * opening lines, which end on the imbalance it pictures (founder direction,
 * 2026-11-19), then the rest of the story in short beats. On desktop the copy
 * stays on the left and the illustration on the right, centred vertically
 * beside it.
 */
export function Problem() {
  const [imbalance, fansQuestion, finalQuestion] = copy.emphasis as readonly string[]
  const closingPair = [imbalance, finalQuestion]
  const line = (p: string) =>
    p === fansQuestion ? (
      <p key={p} data-testid="problem-emphasis" className="font-sp-display text-2xl font-extrabold leading-snug text-sp-primary">
        {p}
      </p>
    ) : closingPair.includes(p) ? (
      <p key={p} data-testid="problem-emphasis" className="border-l-4 border-sp-accent pl-4 font-semibold">
        {p}
      </p>
    ) : (
      <p key={p}>{p}</p>
    )
  return (
    <section id="problem" aria-labelledby="problem-title" className="scroll-mt-16 bg-sp-bg text-sp-ink">
      <div className="mx-auto grid max-w-6xl grid-cols-1 px-4 pb-20 pt-20 sm:px-6 sm:pb-24 sm:pt-24 lg:grid-cols-[1.05fr_0.95fr] lg:gap-x-16 lg:pb-28 lg:pt-28">
        <h2 id="problem-title" className="text-balance font-sp-display text-[clamp(2.2rem,7vw,4rem)] font-black leading-[0.98] tracking-[-0.02em] [font-stretch:108%] lg:col-start-1">
          {copy.headline}
        </h2>
        <div data-testid="problem-opening" className="mt-6 max-w-xl space-y-2 text-[1.08rem] leading-relaxed sm:text-lg lg:col-start-1">
          {BEATS[0].map(line)}
        </div>

        <figure data-testid="problem-visual" className="m-0 mx-auto mt-8 w-full max-w-[32rem] lg:col-start-2 lg:row-span-3 lg:row-start-1 lg:mt-0 lg:self-center">
          <div className="rounded-[28px] bg-white p-4 shadow-[0_30px_60px_-34px_rgb(18_48_45/0.45)] ring-1 ring-sp-ink/8 sm:p-7">
            <ValueCapture />
          </div>
          <figcaption className="sr-only">
            An illustration of how value flows through social media today. Creators make posts; fans like and share them, and more and more people are
            reached; the platform turns that attention into advertising money, and its vault fills up. What comes back is uneven: one creator has a small
            stack, another a single coin, a third has one on its way, and the fans get a thank-you.
          </figcaption>
        </figure>

        <div data-testid="problem-copy" className="mt-10 max-w-xl text-[1.08rem] leading-relaxed sm:text-lg lg:col-start-1 lg:mt-8">
          {BEATS.slice(1).map((beat, i) => (
            <div key={i} className={i === 0 ? 'space-y-3' : 'mt-9 space-y-3 border-t border-sp-ink/10 pt-9 sm:mt-10 sm:pt-10'}>
              {beat.map(line)}
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
