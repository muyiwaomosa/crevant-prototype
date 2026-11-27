import { HeartHandshake, Sprout, Users } from 'lucide-react'
import { SplitpostLogo } from '../../../logo/SplitpostLogo'
import { HOMEPAGE_COPY } from '../copy'
import { Photo } from '../ui/Photo'
import { Eyebrow } from '../ui/Story'

const copy = HOMEPAGE_COPY.what
const ICONS = [Users, Sprout, HeartHandshake]

/**
 * Section 4, WHAT (SP-BRAND-002, as amended): the hopeful turn after the
 * problem. A community laughing together, the vision in the founder's words,
 * the three commitments, and beside them the plain statement that this is a
 * long-term vision, not a promise of income during the pilot.
 */
export function What() {
  return (
    <section id="what" aria-labelledby="what-title" className="scroll-mt-16 bg-sp-secondary-tint text-sp-ink">
      <div className="mx-auto max-w-6xl px-4 pb-18 pt-20 sm:px-6 sm:pb-24 sm:pt-24 lg:pb-28 lg:pt-28">
        <div className="grid grid-cols-1 gap-12 lg:grid-cols-[1.05fr_0.95fr] lg:items-center lg:gap-16">
          <div className="min-w-0">
            <Eyebrow>{copy.eyebrow}</Eyebrow>
            <h2 id="what-title" className="mt-4 text-balance font-sp-display text-[clamp(2.2rem,7vw,4rem)] font-black leading-[0.98] tracking-[-0.02em] [font-stretch:108%]">
              {copy.headline}
            </h2>
            <div data-testid="what-copy" className="mt-6 max-w-xl space-y-3 text-[1.08rem] leading-relaxed sm:text-lg">
              {copy.body.map((p) => (
                <p key={p}>{p}</p>
              ))}
              <div className="pt-3">
                <p className="font-semibold">{copy.closing[0]}</p>
                <p className="mt-1 flex items-center gap-2.5 font-sp-display text-xl font-extrabold">
                  <SplitpostLogo className="h-8 w-8 shrink-0" />
                  {copy.closing[1]}
                </p>
              </div>
            </div>
          </div>
          <figure className="m-0 w-full max-w-[34rem] justify-self-center overflow-hidden rounded-[28px] shadow-[0_30px_60px_-34px_rgb(0_0_0/0.45)]">
            <Photo id="communityTable" sizes="(min-width: 1024px) 540px, min(100vw - 2rem, 540px)" className="aspect-[4/3]" />
          </figure>
        </div>
        <h3 className="mt-16 font-sp-display text-[13px] font-extrabold uppercase tracking-[0.18em] text-sp-link">{copy.commitmentsTitle}</h3>
        <ul data-testid="what-commitments" className="mt-4 grid gap-4 sm:grid-cols-3">
          {copy.commitments.map((c, i) => {
            const Icon = ICONS[i]
            return (
              <li key={c.title} className="rounded-[24px] bg-white p-6 ring-1 ring-sp-ink/8">
                <Icon className="h-7 w-7 text-sp-link" aria-hidden="true" />
                <p className="mt-3 font-sp-display text-lg font-extrabold">{c.title}</p>
                <p className="mt-1 text-[1rem] text-sp-muted">{c.line}</p>
              </li>
            )
          })}
        </ul>
        <p data-testid="what-disclosure" className="mt-6 flex items-center gap-3 rounded-2xl bg-white p-4 text-[15px] font-semibold leading-snug ring-1 ring-sp-ink/8">
          <span aria-hidden="true" className="h-2 w-6 shrink-0 rounded-full bg-sp-accent" />
          {copy.disclosure}
        </p>
      </div>
    </section>
  )
}
