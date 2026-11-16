import { HOMEPAGE_COPY } from '../copy'
import { Eyebrow, PhotoSlot } from '../ui/Story'

const copy = HOMEPAGE_COPY.vision

/**
 * Section 6, OUR BIGGER VISION: content creation as a real career, part-time
 * or full-time. Clearly labelled as a long-term vision, not a promise of
 * income during the pilot, right beside the copy.
 */
export function Vision() {
  return (
    <section id="vision" aria-labelledby="vision-title" className="scroll-mt-16 bg-spark-50 text-sp-ink">
      <div className="mx-auto grid max-w-6xl grid-cols-1 gap-12 px-4 pb-18 pt-20 sm:px-6 sm:pb-24 sm:pt-24 lg:grid-cols-[0.95fr_1.05fr] lg:items-center lg:gap-16 lg:pb-28 lg:pt-28">
        <PhotoSlot shot={copy.photo} className="aspect-[4/5] w-full max-w-[30rem] justify-self-center bg-white/60 lg:order-2" />
        <div className="min-w-0 lg:order-1">
          <Eyebrow>{copy.eyebrow}</Eyebrow>
          <h2 id="vision-title" className="mt-4 text-balance font-sp-display text-[clamp(2.2rem,7vw,4rem)] font-black leading-[0.98] tracking-[-0.02em] [font-stretch:108%]">
            {copy.headline}
          </h2>
          <div data-testid="vision-copy" className="mt-6 max-w-xl space-y-4 text-[1.08rem] leading-relaxed sm:text-lg">
            {copy.body.map((p, i) => (
              <p key={p} className={i === copy.body.length - 1 ? 'font-sp-display text-xl font-extrabold' : undefined}>
                {p}
              </p>
            ))}
          </div>
          <p data-testid="vision-disclosure" className="mt-7 flex items-center gap-3 rounded-2xl bg-white p-4 text-[15px] font-semibold leading-snug ring-1 ring-sp-ink/8">
            <span aria-hidden="true" className="h-2 w-6 shrink-0 rounded-full bg-sp-gold" />
            {copy.disclosure}
          </p>
        </div>
      </div>
    </section>
  )
}
