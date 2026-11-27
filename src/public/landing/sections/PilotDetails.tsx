import { Check } from 'lucide-react'
import { HOMEPAGE_COPY } from '../copy'
import { Eyebrow } from '../ui/Story'

const copy = HOMEPAGE_COPY.pilot

/**
 * PILOT DETAILS: the one disclosure band (BRD-10), just before the
 * invitation, so the pilot's limits sit near signup and are always visible
 * (never folded away). Adults 18 and older only; Connection Points are not
 * money; rewards and earnings are simulated and nothing is paid; no
 * guaranteed reach. /join shows the same list, word for word.
 */
export function PilotDetails() {
  return (
    <section id="pilot" aria-labelledby="pilot-title" className="scroll-mt-16 bg-sp-bg text-sp-ink">
      <div className="mx-auto grid max-w-6xl gap-10 px-4 pb-18 pt-20 sm:px-6 sm:pb-24 sm:pt-24 lg:grid-cols-[0.8fr_1.2fr] lg:gap-16 lg:pb-28 lg:pt-28">
        <div className="min-w-0">
          <Eyebrow>{copy.eyebrow}</Eyebrow>
          <h2
            id="pilot-title"
            className="mt-4 text-balance font-sp-display text-[clamp(2.2rem,7vw,3.4rem)] font-black leading-[0.98] tracking-[-0.02em] [font-stretch:108%]"
          >
            {copy.headline}
          </h2>
          <div className="mt-6 max-w-md space-y-3 text-[1.05rem] leading-relaxed text-sp-muted">
            {copy.body.map((p) => (
              <p key={p}>{p}</p>
            ))}
          </div>
        </div>
        <div className="min-w-0 rounded-[28px] bg-white p-6 ring-1 ring-sp-ink/8 sm:p-8">
        <h3 className="font-sp-display text-lg font-extrabold">{copy.listTitle}</h3>
        <ul
          data-testid="pilot-details"
          className="mt-4 grid min-w-0 content-start gap-x-8 gap-y-3 sm:grid-cols-2"
        >
          {copy.details.map((d) => (
            <li key={d} className="flex gap-3 text-[0.98rem] leading-relaxed">
              <Check className="mt-1 h-4 w-4 shrink-0 text-sp-accent-text" aria-hidden="true" />
              <span>{d}</span>
            </li>
          ))}
        </ul>
        </div>
      </div>
    </section>
  )
}
