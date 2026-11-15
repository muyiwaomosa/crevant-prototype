import { Link } from 'react-router-dom'
import { ArrowRight } from 'lucide-react'
import { TOUR_BASE } from '../../../entry'
import { useMemberLinks } from '../../member-links'
import { HOMEPAGE_COPY } from '../copy'
import { SplitThePost } from '../ui/SplitThePost'

const copy = HOMEPAGE_COPY.hero

/** The approved headline, set as three stacked lines: SOCIAL MEDIA / NEEDS A / BETTER SPLIT. */
export const HEADLINE_LINES = ['SOCIAL MEDIA', 'NEEDS A', 'BETTER SPLIT.'] as const

const focusRing = 'focus-visible:outline focus-visible:outline-3 focus-visible:outline-offset-4 focus-visible:outline-white'

/**
 * Section 1: the hero. A Deep Teal band with the headline as a poster, the
 * core belief and the positioning, both calls to action, and the pilot small
 * print. The picture is one post split in two along a gold seam: what the
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
      className="font-sp-display text-[clamp(2.1rem,10vw,5.4rem)] font-black uppercase leading-[0.92] tracking-[-0.025em] [font-stretch:108%] lg:text-[clamp(3.2rem,5vw,4rem)]"
    >
      <span className="block">{HEADLINE_LINES[0]}</span>{' '}
      <span className="block">{HEADLINE_LINES[1]}</span>{' '}
      <span className="block">
        {HEADLINE_LINES[2].split(' ')[0]}{' '}
        <span
          data-testid="split-word"
          className="inline-block bg-[linear-gradient(135deg,var(--color-sp-cream)_0_46%,var(--color-sp-green)_46%_100%)] bg-clip-text text-transparent forced-colors:bg-none forced-colors:text-[CanvasText]"
        >
          {HEADLINE_LINES[2].split(' ')[1]}
        </span>
      </span>
    </h1>
  )
  const rest = (
    <>
      <p data-testid="hero-tagline" className="mt-5 font-sp-display text-xl font-extrabold tracking-[-0.01em] text-sp-green [font-stretch:110%] sm:text-2xl">
        {copy.tagline}
      </p>

      <p data-testid="hero-body" className="mt-4 max-w-[34rem] text-[1.08rem] font-semibold leading-relaxed text-sp-cream sm:text-lg">
        {copy.body.join(' ')}
      </p>
      <p data-testid="hero-positioning" className="mt-3 max-w-[34rem] text-[1.02rem] leading-relaxed text-sp-muted-on-dark sm:text-[1.05rem]">
        {copy.positioning}
      </p>

      <div data-testid="hero-actions" className="mt-7 flex flex-col gap-3 min-[420px]:flex-row min-[420px]:flex-wrap">
        <Link
          to="/join"
          className={`inline-flex min-h-13 items-center justify-center gap-2 rounded-full bg-sp-green px-7 text-base font-bold text-sp-ink transition-[background-color,color,box-shadow,transform] hover:bg-[#4fb699] active:scale-[0.98] motion-reduce:transition-none ${focusRing}`}
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
          <Link to="/sign-in" className={`font-semibold text-white underline underline-offset-4 hover:text-sp-green-on-dark ${focusRing}`}>
            Sign in
          </Link>
        </p>
      )}
    </>
  )
  return (
    <section id="hero" aria-labelledby="hero-title" className="relative isolate overflow-hidden bg-sp-teal text-sp-cream">
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
