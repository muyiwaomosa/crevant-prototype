import clsx from 'clsx'
import { ArrowDown } from 'lucide-react'
import { HOMEPAGE_COPY } from '../copy'
import { AudienceVsEarnings } from '../ui/illustrations/StoryIllustrations'

const copy = HOMEPAGE_COPY.problem

/**
 * Section 2, THE PROBLEM. The story builds line by line on the left; the two
 * lines the brief emphasizes ("But what about you?" and "You did the work…")
 * become large pull quotes. The illustration contrasts a growing audience with
 * earnings that don't keep up. The transition closes the section as a
 * full-width bridge: the question Section 3 then answers, so the repetition
 * reads as a deliberate hand-over.
 */
export function Problem() {
  const emphasis = new Set<string>(copy.emphasis)
  return (
    <section id="problem" aria-labelledby="problem-title" className="scroll-mt-16 bg-sp-bg text-sp-ink">
      <div className="mx-auto grid max-w-6xl gap-12 px-4 pb-16 pt-20 sm:px-6 sm:pb-20 sm:pt-24 lg:grid-cols-[1fr_1fr] lg:gap-16 lg:pt-28">
        <div className="min-w-0">
          <h2 id="problem-title" className="text-balance font-sp-display text-[clamp(2.3rem,9vw,4.4rem)] font-black leading-[0.95] tracking-[-0.02em] [font-stretch:90%]">
            {copy.headline}
          </h2>
          <div data-testid="problem-body" className="mt-8 space-y-5">
            {copy.body.map((line) =>
              emphasis.has(line) ? (
                <p
                  key={line}
                  data-testid="problem-emphasis"
                  className={clsx(
                    'font-sp-display font-black leading-[1.05] tracking-[-0.01em] [font-stretch:90%]',
                    line === copy.emphasis[0]
                      ? 'text-[clamp(2rem,7vw,3.2rem)] text-sp-primary'
                      : 'border-l-[6px] border-sp-accent pl-4 text-[clamp(1.5rem,5vw,2.2rem)] text-sp-ink',
                  )}
                >
                  {line}
                </p>
              ) : (
                <p key={line} className="max-w-xl text-[1.1rem] leading-relaxed text-sp-ink/85 sm:text-lg">
                  {line}
                </p>
              ),
            )}
          </div>
        </div>
        <figure className="m-0 min-w-0 lg:sticky lg:top-24 lg:self-start">
          <AudienceVsEarnings className="mx-auto max-w-[34rem] drop-shadow-[0_24px_40px_rgb(27_36_48/0.12)]" />
        </figure>
      </div>

      {/* The bridge into Section 3. */}
      <div className="relative overflow-hidden bg-sp-primary text-white">
        <div aria-hidden="true" className="pointer-events-none absolute inset-0 bg-[linear-gradient(104deg,transparent_0_66%,rgb(255_255_255/0.06)_66%_100%)]" />
        <div className="relative mx-auto flex max-w-6xl flex-col items-start gap-5 px-4 py-14 sm:px-6 sm:py-16 lg:flex-row lg:items-center lg:justify-between">
          <p data-testid="problem-transition" className="max-w-3xl text-balance font-sp-display text-[clamp(2rem,7.5vw,3.8rem)] font-black leading-[1] tracking-[-0.015em] [font-stretch:90%]">
            {copy.transition}
          </p>
          <span aria-hidden="true" className="grid h-14 w-14 shrink-0 place-items-center rounded-full bg-sp-accent text-sp-ink motion-safe:animate-[sp-nudge_2.4s_ease-in-out_infinite]">
            <ArrowDown className="h-6 w-6" />
          </span>
        </div>
      </div>
    </section>
  )
}
