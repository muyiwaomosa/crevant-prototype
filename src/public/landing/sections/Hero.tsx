import { Link } from 'react-router-dom'
import { ArrowRight } from 'lucide-react'
import { TOUR_BASE } from '../../../entry'
import { useMemberLinks } from '../../member-links'
import { HOMEPAGE_COPY } from '../copy'
import { HeroVisual } from '../ui/HeroVisual'

const copy = HOMEPAGE_COPY.hero

/** The approved headline, set as three stacked lines: SUCCESS / SHOULD BE / SPLIT. */
export const HEADLINE_LINES = ['SUCCESS', 'SHOULD BE', 'SPLIT.'] as const

const focusRing = 'focus-visible:outline focus-visible:outline-3 focus-visible:outline-offset-4 focus-visible:outline-white'

/**
 * Section 1: the hero. A midnight band with the headline as a poster, the
 * approved belief in three short sentences, both calls to action, and the
 * pilot small print. The visual is placeholder material (HeroVisual).
 */
export function Hero() {
  const memberLinks = useMemberLinks()
  return (
    <section id="hero" aria-labelledby="hero-title" className="relative isolate overflow-hidden bg-sp-midnight text-white">
      {/* The split: one diagonal cut across the whole band. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 -z-10 bg-[linear-gradient(118deg,transparent_0_62%,rgb(255_255_255/0.035)_62%_100%)]"
      />
      <div className="mx-auto grid max-w-6xl gap-10 px-4 pb-14 pt-6 sm:px-6 sm:pb-20 sm:pt-12 lg:grid-cols-[1.08fr_0.92fr] lg:items-center lg:gap-14 lg:pb-24 lg:pt-16">
        <div className="min-w-0">
          <h1
            id="hero-title"
            className="font-sp-display text-[clamp(2.6rem,12vw,6.2rem)] font-black uppercase leading-[0.9] tracking-[-0.025em] [font-stretch:112%] lg:text-[clamp(4rem,6.6vw,5.1rem)]"
          >
            <span className="block">{HEADLINE_LINES[0]}</span>{' '}
            <span className="block">{HEADLINE_LINES[1]}</span>{' '}
            <span
              data-testid="split-word"
              className="block w-fit bg-[linear-gradient(135deg,#ffffff_0_46%,var(--color-sp-orange)_46%_100%)] bg-clip-text text-transparent forced-colors:bg-none forced-colors:text-[CanvasText]"
            >
              {HEADLINE_LINES[2]}
            </span>
          </h1>

          <p data-testid="hero-tagline" className="mt-5 font-sp-display text-xl font-extrabold tracking-[-0.01em] text-sp-orange [font-stretch:110%] sm:text-2xl">
            {copy.tagline}
          </p>

          <p data-testid="hero-body" className="mt-4 max-w-[34rem] text-[1.05rem] leading-relaxed text-sp-muted-on-dark sm:text-lg">
            {copy.body.join(' ')}
          </p>

          <div data-testid="hero-actions" className="mt-7 flex flex-col gap-3 min-[420px]:flex-row min-[420px]:flex-wrap">
            <Link
              to="/join"
              className={`inline-flex min-h-13 items-center justify-center gap-2 rounded-full bg-sp-orange px-7 text-base font-bold text-sp-midnight transition-[background-color,color,box-shadow,transform] hover:bg-[#ff7e45] active:scale-[0.98] motion-reduce:transition-none ${focusRing}`}
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
              <Link to="/sign-in" className={`font-semibold text-white underline underline-offset-4 hover:text-sp-orange ${focusRing}`}>
                Sign in
              </Link>
            </p>
          )}
        </div>

        <HeroVisual className="mx-auto w-full max-w-[460px] lg:max-w-none" />
      </div>
    </section>
  )
}
