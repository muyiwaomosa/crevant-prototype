import { Link } from 'react-router-dom'
import { ArrowRight } from 'lucide-react'
import { DISCOVER_PATH } from '../../../entry'
import { useMemberLinks } from '../../member-links'
import { HOMEPAGE_COPY } from '../copy'
import { JOIN_PATH, waitlistCta } from '../../waitlist/status'
import { SplitThePost } from '../ui/SplitThePost'

const copy = HOMEPAGE_COPY.hero

const focusRing = 'focus-visible:outline focus-visible:outline-3 focus-visible:outline-offset-4 focus-visible:outline-white'

/**
 * Section 1, HOOK (SP-BRAND-002): the signature line is the headline,
 * "Don't just post." then "Get your split." in the apricot accent. Two
 * sentences, both calls to action and the pilot small print (simulated, not
 * guaranteed). The picture is one post split in two, with an apricot line in
 * the gap: what the creator made and what her community grew, the shared
 * value, not money.
 *
 * Phones (SP-UAT-001): headline, then the value proposition, actions and
 * small print, then the picture with room around it, so the promise is read
 * first. From lg up: text left, picture right.
 */
export function Hero() {
  const memberLinks = useMemberLinks()
  const headline = (
    <h1
      id="hero-title"
      className="font-sp-display text-[length:min(calc((100vw_-_2rem)/7.6),5.4rem)] font-black leading-[0.98] tracking-[-0.025em] [font-stretch:100%] sm:text-[length:min(calc((100vw_-_3rem)/7.6),6rem)] lg:text-[length:clamp(3rem,4.5vw,4.6rem)] lg:leading-[0.95] lg:[font-stretch:108%]"
    >
      <span data-testid="headline-line" className="block whitespace-nowrap">
        {copy.headlineLines[0]}
      </span>{' '}
      {/* The approved highlight: apricot on Cobalt (4.8:1). */}
      <span data-testid="headline-emphasis" className="block whitespace-nowrap text-sp-accent">
        {copy.headlineLines[1]}
      </span>
    </h1>
  )
  const rest = (
    <>
      <div data-testid="hero-body" className="mt-5 max-w-[34rem] space-y-3 text-[1.1rem] leading-relaxed sm:text-lg">
        <p className="font-semibold text-sp-bg">{copy.body[0]}</p>
        <p className="text-sp-muted-on-dark">{copy.body[1]}</p>
      </div>

      <div data-testid="hero-actions" className="mt-7 flex flex-col gap-3 min-[420px]:flex-row min-[420px]:flex-wrap">
        <Link
          to={JOIN_PATH}
          className={`inline-flex min-h-13 items-center justify-center gap-2 rounded-full bg-sp-secondary px-7 text-base font-bold text-sp-ink transition-[background-color,color,box-shadow,transform] hover:bg-[#bde3db] active:scale-[0.98] motion-reduce:transition-none ${focusRing}`}
        >
          {waitlistCta()} <ArrowRight className="h-4 w-4" aria-hidden="true" />
        </Link>
        {/* The homepage's introduction to Splitpost, which leads on to Join the Waitlist. */}
        <Link
          to={DISCOVER_PATH}
          className={`inline-flex min-h-13 items-center justify-center rounded-full px-7 text-base font-semibold text-white ring-1 ring-white/35 transition-[background-color,color,box-shadow,transform] hover:bg-white/10 hover:ring-white/60 motion-reduce:transition-none ${focusRing}`}
        >
          {copy.secondaryCta}
        </Link>
      </div>

      <p data-testid="hero-small-print" className="mt-5 text-sm leading-relaxed text-sp-muted-on-dark">
        {copy.smallPrint}
      </p>

      {import.meta.env.MODE !== 'site' && memberLinks && (
        <p className="mt-2 text-sm text-sp-muted-on-dark">
          Already invited?{' '}
          <Link to="/sign-in" className={`font-semibold text-white underline underline-offset-4 hover:text-sp-secondary-on-dark ${focusRing}`}>
            Sign in
          </Link>
        </p>
      )}
    </>
  )
  return (
    <section id="hero" aria-labelledby="hero-title" className="relative isolate overflow-hidden bg-sp-primary text-sp-bg">
      {/* The split: one diagonal cut across the whole band. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 -z-10 bg-[linear-gradient(118deg,transparent_0_62%,rgb(255_255_255/0.035)_62%_100%)]"
      />
      <div className="mx-auto grid max-w-6xl px-4 pb-12 pt-5 [grid-template-areas:'title'_'rest'_'scene'] sm:px-6 sm:pb-20 sm:pt-10 lg:grid-cols-[1.08fr_0.92fr] lg:grid-rows-[1fr_auto_auto_1fr] lg:gap-x-14 lg:pb-24 lg:pt-16 lg:[grid-template-areas:'top_scene'_'title_scene'_'rest_scene'_'end_scene']">
        <div className="min-w-0 [grid-area:title]">{headline}</div>
        <div className="min-w-0 [grid-area:rest]">{rest}</div>
        <div className="mt-14 min-w-0 [grid-area:scene] sm:mt-16 lg:mt-0 lg:self-center">
          <SplitThePost />
        </div>
      </div>
    </section>
  )
}
