import { HOMEPAGE_COPY } from '../copy'
import { CommunityIllustration, FollowingIllustration } from '../ui/ValueIllustrations'
import { Eyebrow } from '../ui/Story'

const copy = HOMEPAGE_COPY.building

/**
 * Section 3, WHAT WE'RE BUILDING: three questions, the answer, and the
 * founder's goal statement (verbatim), then two product illustrations, each
 * telling one benefit: followers can find your posts, and you can understand
 * the community you're building. The note below says features are still
 * being built and that nothing is guaranteed.
 */
export function Building() {
  return (
    <section id="building" aria-labelledby="building-title" className="relative isolate scroll-mt-16 overflow-hidden bg-sp-primary text-sp-bg">
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10 bg-[linear-gradient(118deg,transparent_0_64%,rgb(255_255_255/0.04)_64%_100%)]" />
      <div className="mx-auto max-w-6xl px-4 pb-18 pt-20 sm:px-6 sm:pb-24 sm:pt-24 lg:pb-28 lg:pt-28">
        <div className="grid gap-10 lg:grid-cols-[1.1fr_0.9fr] lg:gap-16">
          <div className="min-w-0">
            <Eyebrow tone="dark">{copy.eyebrow}</Eyebrow>
            <h2 id="building-title" className="mt-4 text-balance font-sp-display text-[clamp(2.2rem,7vw,4rem)] font-black leading-[0.98] tracking-[-0.02em] [font-stretch:108%]">
              {copy.headline}
            </h2>
            <ul data-testid="building-questions" className="mt-7 space-y-3 text-[1.08rem] leading-relaxed sm:text-lg">
              {copy.questions.map((q) => (
                <li key={q} className="flex gap-3">
                  <span aria-hidden="true" className="mt-[0.55em] h-2 w-2 shrink-0 rounded-full bg-sp-secondary" />
                  <span>{q}</span>
                </li>
              ))}
            </ul>
            <p className="mt-6 font-sp-display text-2xl font-extrabold">{copy.answer}</p>
            <p className="mt-3 max-w-xl text-[1.08rem] leading-relaxed text-sp-muted-on-dark sm:text-lg">{copy.body}</p>
          </div>

          {/* The founder's goal statement, verbatim: lowercase, no full stop. */}
          <figure data-testid="building-goal" className="m-0 self-center rounded-[28px] bg-sp-bg p-7 text-sp-ink shadow-[0_30px_60px_-34px_rgb(0_0_0/0.6)] sm:p-9">
            <figcaption className="text-[1.05rem] font-semibold text-sp-muted">{copy.goalIntro}</figcaption>
            <blockquote className="mt-3 border-l-4 border-sp-accent pl-5 font-sp-display text-[clamp(1.4rem,4.4vw,2.1rem)] font-extrabold leading-[1.15] tracking-[-0.01em] [font-stretch:104%]">
              <p data-testid="building-goal-text">{copy.goal}</p>
            </blockquote>
          </figure>
        </div>

        <div data-testid="building-illustrations" className="mt-14 grid gap-6 lg:grid-cols-2 lg:gap-8">
          <FollowingIllustration />
          <CommunityIllustration />
        </div>
        <p data-testid="building-note" className="mt-6 text-sm text-sp-muted-on-dark">
          {copy.note}
        </p>
      </div>
    </section>
  )
}
