import { Link } from 'react-router-dom'
import { ArrowRight } from 'lucide-react'
import { HOMEPAGE_COPY, PILOT_DISCLOSURES } from '../copy'
import { waitlistCta } from '../../waitlist/status'
import { Disclosure, Eyebrow } from '../ui/Story'

const copy = HOMEPAGE_COPY.invitation

const focusRing = 'focus-visible:outline focus-visible:outline-3 focus-visible:outline-offset-4 focus-visible:outline-white'

/**
 * Section 6, THE INVITATION, in the original site's design: the Cobalt band
 * cut diagonally with mint (the split, one last time), the call to action
 * ("Waitlist Opens Soon" while registration is closed) and the founder's
 * sign-off on the left, and the original details card on the right, now
 * holding the approved Section 7 pilot disclosure. The brand line closes the
 * page.
 */
export function Invitation() {
  return (
    <section id="invitation" aria-labelledby="invitation-title" className="relative isolate scroll-mt-16 overflow-hidden bg-sp-primary text-white">
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10 bg-[linear-gradient(118deg,transparent_0_70%,var(--color-sp-secondary)_70%_100%)] opacity-90" />
      <div className="mx-auto grid max-w-6xl gap-10 px-4 pb-12 pt-18 sm:px-6 sm:pt-24 lg:grid-cols-[1.1fr_0.9fr] lg:items-center lg:gap-14 lg:pt-28">
        <div className="min-w-0">
          <Eyebrow tone="dark">{copy.eyebrow}</Eyebrow>
          <h2 id="invitation-title" className="mt-4 text-balance font-sp-display text-[clamp(2.3rem,7.2vw,4.2rem)] font-black leading-[0.97] tracking-[-0.02em] [font-stretch:108%]">
            {copy.headline}
          </h2>
          <p data-testid="invitation-secondary" className="mt-4 font-sp-display text-[clamp(1.6rem,5vw,2.4rem)] font-extrabold leading-[1.05] text-sp-accent [font-stretch:104%]">
            {copy.secondaryHeadline}
          </p>
          <div data-testid="invitation-body" className="mt-6 max-w-xl space-y-3 text-[1.08rem] leading-relaxed sm:text-lg">
            {copy.body.map((line, i) => (
              <p key={line} className={i === 0 ? 'font-semibold text-sp-bg' : 'text-sp-muted-on-dark'}>
                {line}
              </p>
            ))}
          </div>
          <Link
            to="/join"
            className={`mt-8 inline-flex min-h-13 w-full items-center justify-center gap-2 rounded-full bg-sp-secondary px-8 text-base font-bold text-sp-ink transition-[background-color,transform] hover:bg-[#bde3db] active:scale-[0.98] motion-reduce:transition-none min-[420px]:w-auto ${focusRing}`}
          >
            {waitlistCta()} <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Link>
          <div data-testid="founder-signoff" className="mt-8 flex items-center gap-3">
            <img src="/media/landing/founder.jpg" alt="" width={640} height={640} loading="lazy" decoding="async" className="h-10 w-10 rounded-full object-cover ring-2 ring-white/25" />
            <p className="text-sm font-semibold text-white">{copy.signOff}</p>
          </div>
        </div>

        <div data-testid="invitation-disclosure" className="rounded-[28px] bg-sp-primary p-6 shadow-[0_30px_60px_-30px_rgb(0_0_0/0.7)] ring-1 ring-white/15 sm:p-8">
          <Disclosure tone="dark" className="!text-[0.97rem] !leading-relaxed">
            {PILOT_DISCLOSURES.invitation}
          </Disclosure>
        </div>
      </div>
      <div className="relative bg-sp-primary">
        <p data-testid="brand-line" className="mx-auto max-w-6xl px-4 pb-16 pt-10 text-balance text-center font-sp-display text-[clamp(2rem,6.2vw,4rem)] font-black leading-[0.98] tracking-[-0.02em] [font-stretch:108%] sm:px-6 sm:pb-20">
          {copy.brandLine}
        </p>
      </div>
    </section>
  )
}
