import { HOMEPAGE_COPY } from '../copy'
import { Photo } from '../ui/Photo'
import { ValueFlow } from '../ui/ValueFlow'

const copy = HOMEPAGE_COPY.why

/**
 * Section 2, WHY (SP-BRAND-004): the founder-approved wording of Nov 28
 * (BR-001), verbatim, paragraph by paragraph, with "Everyone contributes. Not
 * everyone gets a split." given the most visual weight after the heading. The
 * picture is a creator at work, with the value-flow illustration laid over it
 * (creators and followers create value; platforms control the split; not
 * everyone benefits). No figures, no named companies.
 */
export function Why() {
  return (
    <section id="why" aria-labelledby="why-title" className="scroll-mt-16 bg-sp-bg text-sp-ink">
      <div className="mx-auto grid max-w-6xl grid-cols-1 gap-12 px-4 pb-18 pt-20 sm:px-6 sm:pb-24 sm:pt-24 lg:grid-cols-[1.05fr_0.95fr] lg:items-center lg:gap-16 lg:pb-28 lg:pt-28">
        <div className="min-w-0">
          <h2 id="why-title" className="text-balance font-sp-display text-[clamp(2.2rem,7vw,4rem)] font-black leading-[0.98] tracking-[-0.02em] [font-stretch:108%]">
            {copy.headline}
          </h2>
          <div data-testid="why-copy" className="mt-6 max-w-xl space-y-4 text-[1.08rem] leading-relaxed sm:text-lg">
            {copy.body.map((p) => (
              <p key={p}>{p}</p>
            ))}
            <p
              data-testid="why-emphasis"
              className="border-l-4 border-sp-accent py-1 pl-4 text-balance font-sp-display text-[clamp(1.6rem,4.6vw,2.35rem)] font-black leading-[1.08] tracking-[-0.01em] text-sp-primary"
            >
              {copy.emphasis}
            </p>
            <p className="font-semibold">{copy.closing}</p>
          </div>
        </div>
        <figure data-testid="why-visual" className="relative m-0 mx-auto w-full max-w-[30rem]">
          <div className="overflow-hidden rounded-[28px] shadow-[0_30px_60px_-34px_rgb(0_0_0/0.45)]">
            <Photo id="creatorEditing" sizes="(min-width: 1024px) 480px, min(100vw - 2rem, 480px)" className="aspect-[4/3]" />
          </div>
          <ValueFlow />
        </figure>
      </div>
    </section>
  )
}
