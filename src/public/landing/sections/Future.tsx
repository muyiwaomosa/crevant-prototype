import { HOMEPAGE_COPY } from '../copy'
import { FUTURE_MOSAIC } from '../photos'
import { Photo } from '../ui/Photo'
import { Eyebrow } from '../ui/Story'

const copy = HOMEPAGE_COPY.future

/**
 * Section 5, A BETTER FUTURE FOR CREATORS (WHERE), in the original site's
 * "Our bigger vision" style: mint band and large rounded photos. A mosaic of
 * creators clearly enjoying the work (cooking on camera, painting, a workshop,
 * filming), across ages, genders and kinds of creating. Aspirational but
 * realistic: no money, luxury or "made it" imagery, and the approved wording
 * beside it. Licensed stock photos of models, pending the founder's approval.
 */
export function Future() {
  return (
    <section id="future" aria-labelledby="future-title" className="scroll-mt-16 bg-sp-secondary-tint text-sp-ink">
      <div className="mx-auto grid max-w-6xl grid-cols-1 gap-12 px-4 pb-14 pt-20 sm:px-6 sm:pt-24 lg:grid-cols-[0.95fr_1.05fr] lg:items-center lg:gap-14 lg:pt-28">
        <div className="min-w-0">
          <Eyebrow>{copy.eyebrow}</Eyebrow>
          <h2 id="future-title" className="mt-4 text-balance font-sp-display text-[clamp(2.2rem,7vw,4rem)] font-black leading-[0.98] tracking-[-0.02em] [font-stretch:108%]">
            {copy.headline}
          </h2>
          <div data-testid="future-body" className="mt-6 max-w-xl space-y-3 text-[1.08rem] leading-relaxed sm:text-lg">
            {copy.body.map((line, i) => (
              <p key={line} className={i === 0 ? 'font-sp-display text-2xl font-extrabold text-sp-primary' : i >= 3 ? 'font-semibold' : undefined}>
                {line}
              </p>
            ))}
          </div>
        </div>

        <div data-testid="future-mosaic" className="grid grid-cols-2 gap-3 sm:gap-4">
          {FUTURE_MOSAIC.map((id, i) => (
            <figure key={id} className={`m-0 overflow-hidden rounded-[22px] shadow-[0_24px_50px_-30px_rgb(0_0_0/0.45)] sm:rounded-[28px] ${i % 2 === 1 ? 'translate-y-6' : ''}`}>
              <Photo id={id} sizes="(min-width: 1024px) 290px, calc(50vw - 1.5rem)" className="aspect-[4/5]" />
            </figure>
          ))}
        </div>
      </div>
      <div className="px-4 pb-20 pt-6 sm:px-6 sm:pb-24">
        <p data-testid="future-closing" className="mx-auto max-w-4xl text-balance text-center font-sp-display text-[clamp(1.8rem,5.6vw,3rem)] font-black leading-[1.05] tracking-[-0.01em] text-sp-primary [font-stretch:104%]">
          {copy.closing}
        </p>
        <p data-testid="future-signal" className="mx-auto mt-5 max-w-2xl text-center text-[1.1rem] font-semibold sm:text-xl">
          {copy.signal}
        </p>
      </div>
    </section>
  )
}
