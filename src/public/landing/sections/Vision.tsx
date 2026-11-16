import { HOMEPAGE_COPY } from '../copy'

const copy = HOMEPAGE_COPY.vision

/**
 * Section 5, the vision: content creation as a respected profession, at any
 * scale, and the founder's goal statement, verbatim. Sustainable pay is an
 * aim, never a promise: "No guaranteed reach, views or earnings" and the
 * long-term idea's "not part of the pilot" sit in the same section.
 */
export function Vision() {
  return (
    <section id="vision" aria-labelledby="vision-title" className="scroll-mt-16 bg-spark-50 text-sp-ink">
      <div className="mx-auto max-w-5xl px-4 py-18 text-center sm:px-6 sm:py-24 lg:py-28">
        <p className="font-sp-display text-[13px] font-extrabold uppercase tracking-[0.18em] text-sp-green-text">{copy.eyebrow}</p>
        <h2
          id="vision-title"
          className="mx-auto mt-4 max-w-4xl text-balance font-sp-display text-[clamp(2.3rem,7.4vw,4.6rem)] font-black leading-[0.96] tracking-[-0.02em] [font-stretch:110%]"
        >
          {copy.headline}
        </h2>
        {/* The founder's goal statement, verbatim. Shown as written: lowercase, no full stop. */}
        <figure data-testid="vision-goal" className="mx-auto mt-10 max-w-3xl rounded-[28px] bg-sp-teal px-6 py-8 text-left text-sp-cream shadow-[0_30px_60px_-34px_rgb(10_30_28/0.6)] sm:px-10 sm:py-10">
          <figcaption className="flex items-center gap-2 font-sp-display text-sm font-extrabold uppercase tracking-[0.16em] text-sp-gold">
            <span aria-hidden="true" className="h-2 w-6 rounded-full bg-sp-gold" />
            {copy.goalLabel}
          </figcaption>
          <blockquote className="mt-4 font-sp-display text-[clamp(1.45rem,4.6vw,2.3rem)] font-extrabold leading-[1.15] tracking-[-0.01em] [font-stretch:104%]">
            <p data-testid="vision-goal-text">{copy.goal}</p>
          </blockquote>
        </figure>
        <p data-testid="vision-body" className="mx-auto mt-8 max-w-2xl text-[1.08rem] leading-relaxed sm:text-lg">
          {copy.body}
        </p>
        <ul data-testid="vision-stages" className="mt-8 flex flex-wrap justify-center gap-2.5">
          {copy.stages.map((s) => (
            <li key={s} className="rounded-full bg-sp-teal px-4 py-2 text-sm font-bold text-sp-cream">
              {s}
            </li>
          ))}
        </ul>
        <div data-testid="vision-long-term" className="mx-auto mt-10 max-w-2xl rounded-3xl bg-white p-5 text-left ring-1 ring-sp-ink/8 sm:p-6">
          <p className="flex items-center gap-2 font-sp-display text-sm font-extrabold uppercase tracking-[0.14em] text-sp-gold-text">
            <span aria-hidden="true" className="h-2 w-6 rounded-full bg-sp-gold" />
            Long-term vision, not part of the pilot
          </p>
          <p className="mt-2 text-[15px] font-semibold leading-snug">{copy.longTerm}</p>
          <p data-testid="vision-disclosure" className="mt-2 text-[15px] leading-snug text-sp-muted">
            {copy.disclosure}
          </p>
        </div>
      </div>
    </section>
  )
}
