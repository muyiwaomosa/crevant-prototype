import { Link } from 'react-router-dom'
import { ArrowRight } from 'lucide-react'
import { useMemberLinks } from '../../member-links'
import { HOMEPAGE_COPY, PILOT_DISCLOSURES } from '../copy'
import { waitlistCta } from '../../waitlist/status'
import { ValueShare } from '../ui/illustrations/ValueShare'
import { Disclosure } from '../ui/Story'

const copy = HOMEPAGE_COPY.hero

const focusRing = 'focus-visible:outline focus-visible:outline-3 focus-visible:outline-offset-4 focus-visible:outline-sp-primary'

/**
 * Section 1, HERO. White, bold, and led by the signature line: the headline is
 * the unmistakable focal point, two lines on every screen, sized to the width
 * of the screen on phones (condensed Archivo, so it can be much larger). Then
 * the approved supporting copy, the waitlist call to action (it reads
 * "Waitlist Opens Soon" while registration is closed), the hero pilot
 * disclosure, and the concept illustration of how value is shared (no
 * percentages: the pilot allocation stays private).
 */
export function Hero() {
  const memberLinks = useMemberLinks()
  return (
    <section id="hero" aria-labelledby="hero-title" className="relative isolate overflow-hidden bg-white text-sp-ink">
      <div aria-hidden="true" className="pointer-events-none absolute -right-24 -top-24 -z-10 h-[28rem] w-[28rem] rounded-full bg-sp-secondary-tint sm:h-[36rem] sm:w-[36rem]" />
      <div className="mx-auto grid max-w-6xl gap-10 px-4 pb-14 pt-8 sm:px-6 sm:pb-20 sm:pt-14 lg:grid-cols-[1.1fr_0.9fr] lg:items-center lg:gap-12 lg:pb-24 lg:pt-20">
        <div className="min-w-0">
          <h1
            id="hero-title"
            // Each sentence on its own line, never wrapping: sized from the
            // screen width on phones (the longer line is about 6.3em wide in
            // condensed Archivo Black), capped on larger screens.
            className="font-sp-display text-[length:min(calc((100vw_-_2rem)/6.5),6.6rem)] font-black leading-[0.92] tracking-[-0.015em] [font-stretch:75%] sm:text-[length:min(calc((100vw_-_3rem)/6.5),7.4rem)] lg:text-[length:clamp(4.6rem,7.2vw,5.6rem)]"
          >
            <span data-testid="headline-line" className="block whitespace-nowrap">
              {copy.headlineLines[0]}
            </span>{' '}
            <span data-testid="headline-emphasis" className="relative block whitespace-nowrap text-sp-primary">
              <span className="relative z-10">{copy.headlineLines[1]}</span>
              {/* The apricot line from the badge, under the second sentence. */}
              <span aria-hidden="true" className="absolute bottom-[0.06em] left-0 -z-0 h-[0.16em] w-full origin-left -rotate-[1.5deg] rounded-full bg-sp-accent" />
            </span>
          </h1>

          <div data-testid="hero-body" className="mt-7 max-w-[36rem] space-y-3 text-[1.12rem] leading-relaxed text-sp-ink sm:text-xl">
            <p className="font-semibold">{copy.body[0]}</p>
            <p className="text-sp-muted">{copy.body[1]}</p>
          </div>

          <div data-testid="hero-actions" className="mt-8">
            <Link
              to="/join"
              className={`inline-flex min-h-14 w-full items-center justify-center gap-2 rounded-full bg-sp-primary px-8 text-[1.05rem] font-bold text-white shadow-[0_14px_30px_-14px_rgb(36_71_166/0.75)] transition-[background-color,transform] hover:bg-sp-primary-raised active:scale-[0.98] motion-reduce:transition-none min-[420px]:w-auto ${focusRing}`}
            >
              {waitlistCta()} <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
          </div>

          <Disclosure testId="hero-disclosure" className="mt-5 max-w-[30rem]">
            {PILOT_DISCLOSURES.hero}
          </Disclosure>

          {import.meta.env.MODE !== 'site' && memberLinks && (
            <p className="mt-2 text-sm text-sp-muted">
              Already invited?{' '}
              <Link to="/sign-in" className={`font-semibold text-sp-link underline underline-offset-4 ${focusRing}`}>
                Sign in
              </Link>
            </p>
          )}
        </div>

        <figure className="m-0 min-w-0">
          <ValueShare className="mx-auto max-w-[30rem]" />
        </figure>
      </div>
    </section>
  )
}
