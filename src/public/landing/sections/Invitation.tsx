import { Link } from 'react-router-dom'
import { ArrowRight } from 'lucide-react'
import { HOMEPAGE_COPY, PILOT_DISCLOSURES } from '../copy'
import { waitlistCta } from '../../waitlist/status'
import { Constellation } from '../ui/illustrations/PeopleIllustrations'
import { Disclosure, Eyebrow } from '../ui/Story'

const copy = HOMEPAGE_COPY.invitation

const focusRing = 'focus-visible:outline focus-visible:outline-3 focus-visible:outline-offset-4 focus-visible:outline-white'

/**
 * Section 7, THE INVITATION. The finale: creators and fans connected through
 * posts, with the Splitpost badge at the centre. The headline and its second
 * line, the approved body, the waitlist call to action ("Waitlist Opens Soon"
 * while registration is closed), the Section 7 pilot disclosure beside it,
 * and the brand line to close.
 */
export function Invitation() {
  return (
    <section id="invitation" aria-labelledby="invitation-title" className="relative isolate scroll-mt-16 overflow-hidden bg-sp-primary text-white">
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(circle_at_80%_30%,rgb(168_217_207/0.18),transparent_55%)]" />
      <div className="mx-auto grid max-w-6xl gap-12 px-4 pb-16 pt-20 sm:px-6 sm:pt-24 lg:grid-cols-[1.05fr_0.95fr] lg:items-center lg:gap-14 lg:pt-28">
        <div className="min-w-0">
          <Eyebrow tone="dark">{copy.eyebrow}</Eyebrow>
          <h2 id="invitation-title" className="mt-4 text-balance font-sp-display text-[clamp(2.3rem,8.4vw,4.6rem)] font-black leading-[0.95] tracking-[-0.02em] [font-stretch:90%]">
            {copy.headline}
          </h2>
          <p data-testid="invitation-secondary" className="mt-3 font-sp-display text-[clamp(1.8rem,6vw,3rem)] font-black leading-[1] text-sp-accent">
            {copy.secondaryHeadline}
          </p>
          <div data-testid="invitation-body" className="mt-7 max-w-xl space-y-3 text-[1.12rem] leading-relaxed text-white/90 sm:text-xl">
            {copy.body.map((line) => (
              <p key={line}>{line}</p>
            ))}
          </div>
          <Link
            to="/join"
            className={`mt-9 inline-flex min-h-14 w-full items-center justify-center gap-2 rounded-full bg-sp-secondary px-9 text-[1.05rem] font-bold text-sp-ink transition-[background-color,transform] hover:bg-[#bde3db] active:scale-[0.98] motion-reduce:transition-none min-[420px]:w-auto ${focusRing}`}
          >
            {waitlistCta()} <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Link>
          <div data-testid="invitation-disclosure" className="mt-6 max-w-xl rounded-2xl bg-white/[0.07] p-4 ring-1 ring-white/12">
            <Disclosure tone="dark">{PILOT_DISCLOSURES.invitation}</Disclosure>
          </div>
        </div>
        <figure className="m-0 min-w-0">
          <Constellation className="mx-auto max-w-[30rem]" />
        </figure>
      </div>
      <p data-testid="brand-line" className="mx-auto max-w-6xl px-4 pb-16 pt-4 text-center font-sp-display text-[clamp(2rem,9vw,5rem)] font-black leading-[0.95] tracking-[-0.02em] [font-stretch:85%] sm:px-6 sm:pb-20">
        {copy.brandLine}
      </p>
    </section>
  )
}
