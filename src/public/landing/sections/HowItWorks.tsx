import { HOMEPAGE_COPY, PILOT_DISCLOSURES } from '../copy'
import { StepArt } from '../ui/illustrations/StoryIllustrations'
import { Disclosure, Eyebrow } from '../ui/Story'

const copy = HOMEPAGE_COPY.howItWorks

/**
 * Section 3, HOW SPLITPOST WORKS, in the original site's "What we're building"
 * band: Cobalt with the diagonal cut, the eyebrow and headline, then the four
 * steps as the original cream cards. Each step has its own conceptual
 * drawing (no screens of the unfinished app), its approved label, title and
 * explanation; the approved Step 04 disclosure sits inline, right under its explanation. The
 * closing statement ends the section.
 */
export function HowItWorks() {
  return (
    <section id="how-it-works" aria-labelledby="how-title" className="relative isolate scroll-mt-16 overflow-hidden bg-sp-primary text-sp-bg">
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10 bg-[linear-gradient(118deg,transparent_0_64%,rgb(255_255_255/0.04)_64%_100%)]" />
      <div className="mx-auto max-w-6xl px-4 pb-18 pt-20 sm:px-6 sm:pb-24 sm:pt-24 lg:pb-28 lg:pt-28">
        <Eyebrow tone="dark">{copy.eyebrow}</Eyebrow>
        <h2 id="how-title" className="mt-4 text-balance font-sp-display text-[clamp(2.2rem,7vw,4rem)] font-black leading-[0.98] tracking-[-0.02em] [font-stretch:108%]">
          {copy.headline}
        </h2>

        <ol data-testid="steps" className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {copy.steps.map((s, i) => (
            <li key={s.number} data-testid="step" className="flex flex-col overflow-hidden rounded-[28px] bg-sp-bg text-sp-ink ring-1 ring-white/10">
              <div className="bg-sp-secondary-tint p-4">
                <StepArt step={i as 0 | 1 | 2 | 3} className="mx-auto max-w-[16rem]" />
              </div>
              <div className="flex flex-1 flex-col p-6">
                <p data-testid="step-label" className="font-sp-display text-[13px] font-black tracking-[0.12em] text-sp-accent-text">
                  {s.label}
                </p>
                <h3 className="mt-2 font-sp-display text-[1.45rem] font-extrabold leading-tight">{s.title}</h3>
                <p className="mt-3 text-[1.02rem] leading-relaxed text-sp-muted">{s.body}</p>
                {i === 3 && (
                  // Inline and discreet, right under the rewards explanation (founder decision): visible, real text, AA contrast.
                  <Disclosure testId="step04-disclosure" className="mt-4">
                    {PILOT_DISCLOSURES.step04}
                  </Disclosure>
                )}
              </div>
            </li>
          ))}
        </ol>

        <p data-testid="how-closing" className="mx-auto mt-16 max-w-3xl text-balance text-center font-sp-display text-[clamp(1.9rem,6vw,3rem)] font-black leading-[1.05] tracking-[-0.01em] text-sp-accent [font-stretch:104%]">
          {copy.closing}
        </p>
      </div>
    </section>
  )
}
