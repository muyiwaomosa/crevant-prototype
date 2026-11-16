import { Link } from 'react-router-dom'
import { ArrowRight } from 'lucide-react'
import { TOUR_BASE } from '../../../entry'
import { useMemberLinks } from '../../member-links'
import { HOMEPAGE_COPY } from '../copy'
import { SplitThePost } from '../ui/SplitThePost'

const copy = HOMEPAGE_COPY.hero


const focusRing = 'focus-visible:outline focus-visible:outline-3 focus-visible:outline-offset-4 focus-visible:outline-white'

/**
 * Section 1: the hero. A Cobalt band with the founder-approved headline
 * ("You Deserve a Split." in apricot), two plain sentences, both calls to
 * action, and the pilot small print, which says plainly that nothing is
 * guaranteed. The picture is one post split in two, with an apricot line in the gap: what the
 * creator made and what her community grew.
 *
 * Phones: headline, picture, then the words, actions and small print, so the
 * picture shows in the first screen. From lg up: text left, picture right.
 */
export function Hero() {
  const memberLinks = useMemberLinks()
  const headline = (
    <h1
      id="hero-title"
      // Phones and tablets: exactly two lines, one sentence each. Each line is
      // kept whole and the size follows the screen width (the longer sentence
      // is 10.1em wide at 95% width), so it never wraps or overflows. From lg
      // up it sits beside the picture at the larger desktop size.
      className="font-sp-display text-[length:min(calc((100vw_-_2rem)/10.3),4.75rem)] font-black leading-[1.02] tracking-[-0.025em] [font-stretch:95%] sm:text-[length:min(calc((100vw_-_3rem)/10.3),5.25rem)] lg:text-[length:clamp(3.3rem,5.2vw,4.4rem)] lg:leading-[0.95] lg:[font-stretch:108%]"
    >
      <span data-testid="headline-line" className="block whitespace-nowrap lg:whitespace-normal lg:[text-wrap:balance]">
        {copy.headlineLines[0]}
      </span>{' '}
      {/* The approved highlight: apricot on Cobalt (4.8:1). */}
      <span data-testid="headline-emphasis" className="block whitespace-nowrap text-sp-accent lg:whitespace-normal lg:[text-wrap:balance]">
        {copy.headlineLines[1]}
      </span>
    </h1>
  )
  const rest = (
    <>
      <div data-testid="hero-body" className="mt-6 max-w-[34rem] space-y-3 text-[1.1rem] leading-relaxed sm:text-lg">
        <p className="text-sp-muted-on-dark">{copy.body[0]}</p>
        <p className="font-semibold text-sp-bg">{copy.body[1]}</p>
      </div>

      <div data-testid="hero-actions" className="mt-7 flex flex-col gap-3 min-[420px]:flex-row min-[420px]:flex-wrap">
        <Link
          to="/join"
          className={`inline-flex min-h-13 items-center justify-center gap-2 rounded-full bg-sp-secondary px-7 text-base font-bold text-sp-ink transition-[background-color,color,box-shadow,transform] hover:bg-[#bde3db] active:scale-[0.98] motion-reduce:transition-none ${focusRing}`}
        >
          {copy.primaryCta} <ArrowRight className="h-4 w-4" aria-hidden="true" />
        </Link>
        {/* The tour is a separate app, so it needs a full page load. */}
        <a
          href={TOUR_BASE}
          className={`inline-flex min-h-13 items-center justify-center rounded-full px-7 text-base font-semibold text-white ring-1 ring-white/35 transition-[background-color,color,box-shadow,transform] hover:bg-white/10 hover:ring-white/60 motion-reduce:transition-none ${focusRing}`}
        >
          {copy.secondaryCta}
        </a>
      </div>

      <p data-testid="hero-small-print" className="mt-5 text-sm leading-relaxed text-sp-muted-on-dark">
        {copy.smallPrint.join(' ')}
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
      <div className="mx-auto grid max-w-6xl px-4 pb-12 pt-5 [grid-template-areas:'title'_'scene'_'rest'] sm:px-6 sm:pb-20 sm:pt-10 lg:grid-cols-[1.08fr_0.92fr] lg:grid-rows-[1fr_auto_auto_1fr] lg:gap-x-14 lg:pb-24 lg:pt-16 lg:[grid-template-areas:'top_scene'_'title_scene'_'rest_scene'_'end_scene']">
        <div className="min-w-0 [grid-area:title]">{headline}</div>
        <div className="mt-5 min-w-0 [grid-area:scene] sm:mt-8 lg:mt-0 lg:self-center">
          <SplitThePost />
        </div>
        <div className="mt-1 min-w-0 [grid-area:rest] lg:mt-0">{rest}</div>
      </div>
    </section>
  )
}
