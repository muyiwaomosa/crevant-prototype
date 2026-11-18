import { Link } from 'react-router-dom'
import { ArrowRight } from 'lucide-react'
import { useMemberLinks } from '../../member-links'
import { HOMEPAGE_COPY, PILOT_DISCLOSURES } from '../copy'
import { waitlistCta } from '../../waitlist/status'
import { SplitThePost } from '../ui/SplitThePost'
import { Disclosure } from '../ui/Story'

const copy = HOMEPAGE_COPY.hero

const focusRing = 'focus-visible:outline focus-visible:outline-3 focus-visible:outline-offset-4 focus-visible:outline-sp-primary'

/**
 * Section 1: the hero, in the original site's layout and type, on white
 * (founder decision, 2026-11-18). The approved headline ("Get your split." in
 * Cobalt), the approved supporting copy, one call to action ("Waitlist Opens
 * Soon" while registration is closed) and the approved hero disclosure. The
 * picture is the original split post: one sample post in two pieces, what
 * the creator made and what her community grew, settling into place once on
 * load (motion-safe only).
 *
 * Phones: headline, supporting copy, picture, then the call to action and
 * disclosure. From lg up: text left, picture right.
 */
export function Hero() {
  const memberLinks = useMemberLinks()
  return (
    <section id="hero" aria-labelledby="hero-title" className="relative isolate overflow-hidden bg-white text-sp-ink">
      {/* The split: one diagonal cut across the whole band, as on the original site. */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10 bg-[linear-gradient(118deg,transparent_0_62%,var(--color-sp-bg)_62%_100%)]" />
      <div className="mx-auto grid max-w-6xl px-4 pb-12 pt-6 [grid-template-areas:'title'_'body'_'scene'_'rest'] sm:px-6 sm:pb-20 sm:pt-10 lg:grid-cols-[1.08fr_0.92fr] lg:grid-rows-[1fr_auto_auto_auto_1fr] lg:gap-x-14 lg:pb-24 lg:pt-16 lg:[grid-template-areas:'top_scene'_'title_scene'_'body_scene'_'rest_scene'_'end_scene']">
        <div className="min-w-0 [grid-area:title]">
          <h1
            id="hero-title"
            // Exactly two lines, one sentence each, at every width: the longer
            // sentence is about 8.3em wide at this width, so the size follows
            // the screen on phones and is capped beside the picture on desktop.
            className="font-sp-display text-[length:min(calc((100vw_-_2rem)/8.6),5.4rem)] font-black leading-[1] tracking-[-0.025em] [font-stretch:100%] sm:text-[length:min(calc((100vw_-_3rem)/8.6),6rem)] lg:text-[length:clamp(3.2rem,4.5vw,4.2rem)] lg:leading-[0.96] lg:[font-stretch:108%]"
          >
            <span data-testid="headline-line" className="block whitespace-nowrap">
              {copy.headlineLines[0]}
            </span>{' '}
            <span data-testid="headline-emphasis" className="block whitespace-nowrap text-sp-primary">
              {copy.headlineLines[1]}
            </span>
          </h1>
        </div>

        <div data-testid="hero-body" className="mt-6 min-w-0 max-w-[34rem] space-y-3 text-[1.1rem] leading-relaxed [grid-area:body] sm:text-lg">
          <p className="font-semibold">{copy.body[0]}</p>
          <p className="text-sp-muted">{copy.body[1]}</p>
        </div>

        <div className="mt-9 min-w-0 [grid-area:scene] sm:mt-10 lg:mt-0 lg:self-center">
          <SplitThePost />
        </div>

        <div className="mt-10 min-w-0 [grid-area:rest] lg:mt-7">
          <div data-testid="hero-actions">
            <Link
              to="/join"
              className={`inline-flex min-h-13 w-full items-center justify-center gap-2 rounded-full bg-sp-primary px-7 text-base font-bold text-white transition-[background-color,transform] hover:bg-sp-primary-raised active:scale-[0.98] motion-reduce:transition-none min-[420px]:w-auto ${focusRing}`}
            >
              {waitlistCta()} <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
          </div>
          <Disclosure testId="hero-disclosure" className="mt-5 max-w-[34rem]">
            {PILOT_DISCLOSURES.hero}
          </Disclosure>

          {import.meta.env.MODE !== 'site' && memberLinks && (
            <p className="mt-2 text-sm text-sp-muted">
              Already invited?{' '}
              <Link to="/sign-in" className={`font-semibold text-sp-link underline underline-offset-4 hover:text-sp-primary ${focusRing}`}>
                Sign in
              </Link>
            </p>
          )}
        </div>
      </div>
    </section>
  )
}
