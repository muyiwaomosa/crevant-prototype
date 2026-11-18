import { HOMEPAGE_COPY, PILOT_DISCLOSURES } from '../copy'
import { PostConnectSplit, StepArt } from '../ui/illustrations/StoryIllustrations'
import { Disclosure, Eyebrow } from '../ui/Story'

const copy = HOMEPAGE_COPY.howItWorks

/**
 * Section 3, HOW SPLITPOST WORKS, with The Vision merged in (founder-approved,
 * 2026-11-18). The original site's "What we're building" band: Cobalt with
 * the diagonal cut, the headline and the two retained Vision lines on the
 * left, and the POST → CONNECT → SPLIT journey in the original cream card on
 * the right. Then the four steps as cards (illustrations only, no app
 * mockups), with the approved Step 04 disclosure inside Step 04, and the
 * closing statement.
 */
export function HowItWorks() {
  return (
    <section id="how-it-works" aria-labelledby="how-title" className="relative isolate scroll-mt-16 overflow-hidden bg-sp-primary text-sp-bg">
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10 bg-[linear-gradient(118deg,transparent_0_64%,rgb(255_255_255/0.04)_64%_100%)]" />
      <div className="mx-auto max-w-6xl px-4 pb-18 pt-20 sm:px-6 sm:pb-24 sm:pt-24 lg:pb-28 lg:pt-28">
        <div className="grid gap-10 lg:grid-cols-[1fr_1fr] lg:items-center lg:gap-16">
          <div className="min-w-0">
            <Eyebrow tone="dark">{copy.eyebrow}</Eyebrow>
            <h2 id="how-title" className="mt-4 text-balance font-sp-display text-[clamp(2.2rem,7vw,4rem)] font-black leading-[0.98] tracking-[-0.02em] [font-stretch:108%]">
              {copy.headline}
            </h2>
            <div data-testid="how-vision" className="mt-6 max-w-xl space-y-4">
              <p className="text-[1.08rem] leading-relaxed text-sp-muted-on-dark sm:text-lg">{copy.vision[0]}</p>
              <p className="font-sp-display text-2xl font-extrabold">{copy.vision[1]}</p>
            </div>
          </div>
          <figure className="m-0 rounded-[28px] bg-sp-bg p-6 text-sp-ink shadow-[0_30px_60px_-34px_rgb(0_0_0/0.6)] sm:p-8">
            <PostConnectSplit labels={copy.journey} />
          </figure>
        </div>

        <ol data-testid="steps" className="mt-14 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {copy.steps.map((s, i) => (
            <li key={s.number} data-testid="step" className="flex flex-col overflow-hidden rounded-[28px] bg-sp-bg text-sp-ink ring-1 ring-white/10">
              <div className="bg-sp-secondary-tint p-4">
                <StepArt step={i as 0 | 1 | 2 | 3} className="mx-auto max-w-[16rem]" />
              </div>
              <div className="flex flex-1 flex-col p-6">
                <p className="font-sp-display text-sm font-black text-sp-accent-text">{s.number}</p>
                <h3 className="mt-1 font-sp-display text-2xl font-extrabold leading-tight">
                  <span className="sr-only">Step {s.number}: </span>
                  {s.title}
                </h3>
                <p className="mt-3 text-[1.02rem] leading-relaxed text-sp-muted">{s.body}</p>
                {i === 3 && (
                  <div data-testid="step04-disclosure" className="mt-5 rounded-2xl bg-white p-4 ring-1 ring-sp-ink/8">
                    <Disclosure>{PILOT_DISCLOSURES.step04}</Disclosure>
                  </div>
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
