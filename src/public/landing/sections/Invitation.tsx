import { Link } from 'react-router-dom'
import { ArrowRight } from 'lucide-react'
import { HOMEPAGE_COPY } from '../copy'
import { JOIN_PATH, waitlistCta } from '../../waitlist/status'

const copy = HOMEPAGE_COPY.invitation

const focusRing = 'focus-visible:outline focus-visible:outline-3 focus-visible:outline-offset-4 focus-visible:outline-white'

/**
 * The close: the invitation. One sign up for everyone, straight after the
 * pilot details band (PilotDetails), so every required disclosure is in view
 * just before the call to action. The band is cut diagonally: the split, one
 * last time.
 */
export function Invitation() {
  return (
    <section id="invitation" aria-labelledby="invitation-title" className="relative isolate scroll-mt-16 overflow-hidden bg-sp-primary text-white">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 -z-10 hidden bg-[linear-gradient(118deg,transparent_0_70%,var(--color-sp-secondary)_70%_100%)] opacity-90 md:block"
      />
      <div className="mx-auto max-w-6xl px-4 py-18 sm:px-6 sm:py-24 lg:py-28">
        <div className="min-w-0 max-w-3xl">
          <h2
            id="invitation-title"
            className="font-sp-display text-[clamp(2.4rem,8.4vw,5.2rem)] font-black leading-[0.95] tracking-[-0.02em] [font-stretch:110%]"
          >
            {copy.headline}
          </h2>
          <div data-testid="invitation-body" className="mt-6 max-w-xl space-y-1.5 text-[1.12rem] leading-relaxed sm:text-xl">
            {copy.body.map((line) => (
              <p key={line} className="text-sp-muted-on-dark">
                {line}
              </p>
            ))}
          </div>
          <p data-testid="invitation-belief" className="mt-6 font-sp-display text-[clamp(1.8rem,5vw,2.4rem)] font-black text-sp-accent">
            {copy.belief}
          </p>
          <p data-testid="invitation-close" className="mt-1 text-[1.1rem] font-semibold text-sp-bg">
            {copy.close}
          </p>
          <Link
            to={JOIN_PATH}
            className={`mt-8 inline-flex min-h-13 w-full items-center justify-center gap-2 rounded-full bg-sp-secondary px-8 text-base font-bold text-sp-ink transition-[background-color,transform] hover:bg-[#bde3db] active:scale-[0.98] motion-reduce:transition-none min-[420px]:w-auto ${focusRing}`}
          >
            {waitlistCta()} <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Link>
          <p data-testid="invitation-disclosure" className="mt-4 max-w-xl text-sm leading-relaxed text-sp-muted-on-dark">
            {copy.disclosure}
          </p>
          <div data-testid="founder-signoff" className="mt-8 flex items-center gap-3">
            <img
              src="/media/landing/founder.jpg"
              alt=""
              width={640}
              height={640}
              loading="lazy"
              decoding="async"
              className="h-10 w-10 rounded-full object-cover ring-2 ring-white/25"
            />
            <p className="text-sm font-semibold text-white">{copy.signOff}</p>
          </div>
        </div>
      </div>
      <div className="relative bg-sp-primary">
        <p data-testid="people-note" className="mx-auto max-w-6xl px-4 py-6 text-[13px] leading-relaxed text-sp-muted-on-dark sm:px-6">
          {HOMEPAGE_COPY.peopleNote}
        </p>
      </div>
    </section>
  )
}
