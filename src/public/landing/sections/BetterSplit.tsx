import { Info } from 'lucide-react'
import { HOMEPAGE_COPY } from '../copy'
import { ReferralIllustration } from '../ui/ValueIllustrations'
import { Eyebrow } from '../ui/Story'

const copy = HOMEPAGE_COPY.betterSplit

/**
 * Section 5, A BETTER SPLIT: the Following feed, recognition for the
 * supporters who help a community grow, and the pilot rules, with the
 * founder's three disclosures right beside them. The illustration walks
 * through one qualified referral: a fan shares, a friend verifies and
 * follows, and the fan receives noncash Connection Points during the pilot.
 */
export function BetterSplit() {
  return (
    <section id="split" aria-labelledby="split-title" className="scroll-mt-16 bg-white text-sp-ink">
      <div className="mx-auto grid max-w-6xl grid-cols-1 gap-12 px-4 pb-18 pt-20 sm:px-6 sm:pb-24 sm:pt-24 lg:grid-cols-[1.05fr_0.95fr] lg:gap-16 lg:pb-28 lg:pt-28">
        <div className="min-w-0">
          <Eyebrow>{copy.eyebrow}</Eyebrow>
          <h2 id="split-title" className="mt-4 text-balance font-sp-display text-[clamp(2.2rem,7vw,4rem)] font-black leading-[0.98] tracking-[-0.02em] [font-stretch:108%]">
            {copy.headline}
          </h2>
          <div data-testid="split-copy" className="mt-6 max-w-xl space-y-4 text-[1.08rem] leading-relaxed sm:text-lg">
            {copy.body.map((p) => (
              <p key={p}>{p}</p>
            ))}
          </div>
          <ul data-testid="split-disclosures" className="mt-7 space-y-2 rounded-2xl bg-sp-bg p-5 text-[15px] font-semibold leading-snug">
            {copy.disclosures.map((d) => (
              <li key={d} className="flex gap-2.5">
                <Info aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-sp-accent-text" />
                {d}
              </li>
            ))}
          </ul>
          <p data-testid="split-closing" className="mt-7 font-sp-display text-2xl font-extrabold leading-snug">
            {copy.closing}
          </p>
        </div>

        <div className="grid min-w-0 content-center">
          <ReferralIllustration />
        </div>
      </div>
    </section>
  )
}
