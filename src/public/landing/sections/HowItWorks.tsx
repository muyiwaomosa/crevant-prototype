import { HOMEPAGE_COPY, PILOT_DISCLOSURES } from '../copy'
import { StepArt } from '../ui/illustrations/StoryIllustrations'
import { Disclosure, Eyebrow } from '../ui/Story'

const copy = HOMEPAGE_COPY.howItWorks

/**
 * Section 4, HOW SPLITPOST WORKS. Four connected illustrations on one thread:
 * a horizontal journey on large screens, a vertical progression on phones.
 * Step 04 carries the approved pilot disclosure right beside it (fan rewards
 * are simulated during the 60-day pilot). The closing statement gets its own
 * band.
 */
export function HowItWorks() {
  return (
    <section id="how-it-works" aria-labelledby="how-title" className="scroll-mt-16 bg-sp-secondary-tint text-sp-ink">
      <div className="mx-auto max-w-6xl px-4 pb-16 pt-20 sm:px-6 sm:pt-24 lg:pt-28">
        <div className="max-w-3xl">
          <Eyebrow>{copy.eyebrow}</Eyebrow>
          <h2 id="how-title" className="mt-4 font-sp-display text-[clamp(2.4rem,10vw,5rem)] font-black leading-[0.92] tracking-[-0.025em] [font-stretch:85%]">
            {copy.headline}
          </h2>
          <p className="mt-6 max-w-2xl text-[1.12rem] leading-relaxed sm:text-xl">{copy.intro}</p>
        </div>

        <ol data-testid="steps" className="relative mt-12 grid gap-10 lg:mt-16 lg:grid-cols-4 lg:gap-6">
          {/* The thread joining the four steps: down the left on phones, across on large screens. */}
          <span aria-hidden="true" className="absolute bottom-6 left-[1.4rem] top-6 w-[3px] rounded-full bg-sp-primary/25 lg:bottom-auto lg:left-6 lg:right-6 lg:top-[1.4rem] lg:h-[3px] lg:w-auto" />
          {copy.steps.map((step, i) => (
            <li key={step.number} data-testid="step" className="relative pl-16 lg:pl-0 lg:pt-16">
              <span
                aria-hidden="true"
                className="absolute left-0 top-0 grid h-[2.8rem] w-[2.8rem] place-items-center rounded-full bg-sp-primary font-sp-display text-base font-black text-white ring-[6px] ring-sp-secondary-tint"
              >
                {step.number}
              </span>
              <StepArt step={i as 0 | 1 | 2 | 3} className="max-w-[17rem] drop-shadow-[0_16px_28px_rgb(27_36_48/0.1)]" />
              <h3 className="mt-5 font-sp-display text-[1.45rem] font-extrabold leading-tight">
                <span className="sr-only">Step {step.number}: </span>
                {step.title}
              </h3>
              <p className="mt-2 text-[1.02rem] leading-relaxed text-sp-ink/85">{step.body}</p>
              {i === 3 && (
                <div data-testid="step04-disclosure" className="mt-4 rounded-2xl bg-white/80 p-4 ring-1 ring-sp-primary/10">
                  <Disclosure>{PILOT_DISCLOSURES.step04}</Disclosure>
                </div>
              )}
            </li>
          ))}
        </ol>
      </div>

      <div className="bg-sp-primary">
        <p data-testid="how-closing" className="mx-auto max-w-6xl text-balance px-4 py-12 text-center font-sp-display text-[clamp(1.8rem,6vw,3rem)] font-black leading-[1.05] text-white sm:px-6 sm:py-14">
          {copy.closing}
        </p>
      </div>
    </section>
  )
}
