import { ArrowDown } from 'lucide-react'
import { HOMEPAGE_COPY } from '../copy'
import { ValueCapture } from '../ui/illustrations/StoryIllustrations'

const copy = HOMEPAGE_COPY.problem

/**
 * Section 2, THE PROBLEM, in the original site's layout: the approved copy on
 * the left and, in the original white card, how value flows through social
 * media today (creators, a growing crowd of fans, the platform's ad panel and
 * vault, and uneven returns). On desktop the card stays in view while the
 * longer copy scrolls past it. The fans' question and the closing pair use
 * the original site's "turn" and quote styles; the approved transition closes
 * the section.
 */
export function Problem() {
  const [fansQuestion, ...closingPair] = copy.emphasis as readonly string[]
  return (
    <section id="problem" aria-labelledby="problem-title" className="scroll-mt-16 bg-sp-bg text-sp-ink">
      <div className="mx-auto grid max-w-6xl grid-cols-1 gap-12 px-4 pb-14 pt-20 sm:px-6 sm:pt-24 lg:grid-cols-[1.05fr_0.95fr] lg:gap-16 lg:pt-28">
        <div className="min-w-0">
          <h2 id="problem-title" className="text-balance font-sp-display text-[clamp(2.2rem,7vw,4rem)] font-black leading-[0.98] tracking-[-0.02em] [font-stretch:108%]">
            {copy.headline}
          </h2>
          <div data-testid="problem-copy" className="mt-6 max-w-xl space-y-4 text-[1.08rem] leading-relaxed sm:text-lg">
            {copy.body.map((p) =>
              p === fansQuestion ? (
                <p key={p} data-testid="problem-emphasis" className="pt-3 font-sp-display text-2xl font-extrabold text-sp-primary">
                  {p}
                </p>
              ) : closingPair.includes(p) ? (
                <p key={p} data-testid="problem-emphasis" className="border-l-4 border-sp-accent pl-4 font-semibold">
                  {p}
                </p>
              ) : (
                <p key={p}>{p}</p>
              ),
            )}
          </div>
        </div>
        <figure data-testid="problem-visual" className="m-0 mx-auto w-full max-w-[32rem] lg:sticky lg:top-24 lg:self-start">
          <div className="rounded-[28px] bg-white p-5 shadow-[0_30px_60px_-34px_rgb(18_48_45/0.45)] ring-1 ring-sp-ink/8 sm:p-7">
            <ValueCapture />
          </div>
          <figcaption className="sr-only">
            An illustration of how value flows through social media today. Creators make posts; fans like and share them, and more and more people are
            reached; the platform turns that attention into advertising money, and its vault fills up. What comes back is uneven: one creator has a small
            stack, another a single coin, a third has one on its way, and the fans get a thank-you.
          </figcaption>
        </figure>
      </div>
      <div className="mx-auto max-w-6xl px-4 pb-20 sm:px-6 sm:pb-24 lg:pb-28">
        <p data-testid="problem-transition" className="flex items-center gap-4 font-sp-display text-[clamp(1.6rem,5vw,2.5rem)] font-black leading-tight tracking-[-0.01em] [font-stretch:104%]">
          <span>{copy.transition}</span>
          <ArrowDown aria-hidden="true" className="h-8 w-8 shrink-0 text-sp-accent-text" />
        </p>
      </div>
    </section>
  )
}
