import clsx from 'clsx'
import type { ReactNode } from 'react'
import { ArrowDown, ArrowLeft, ArrowRight, Info } from 'lucide-react'
import { HOMEPAGE_COPY } from '../copy'
import { Photo } from '../ui/Photo'
import { SamplePost } from '../ui/PostJourney'

const copy = HOMEPAGE_COPY.what

function ValueCard({ side, label, headline, body, photo }: { side: 'creator' | 'fan'; label: string; headline: string; body: string; photo: ReactNode }) {
  return (
    <article data-value={side} className="flex min-w-0 flex-col overflow-hidden rounded-[28px] bg-sp-midnight-raised">
      <div aria-hidden="true" className={clsx('relative h-44 overflow-hidden sm:h-52', side === 'creator' ? 'bg-sp-neutral' : 'bg-[#ffd9c7]')}>
        {photo}
      </div>
      <div className="flex flex-1 flex-col p-6 sm:p-7">
        <h3 className="font-sp-display text-[13px] font-extrabold uppercase tracking-[0.16em] text-sp-orange">{label}</h3>
        <p className="mt-2.5 font-sp-display text-[1.7rem] font-black leading-[1.05] tracking-[-0.01em] sm:text-[2rem]">{headline}</p>
        <p className="mt-3 text-[15px] leading-relaxed text-sp-muted-on-dark">{body}</p>
      </div>
    </article>
  )
}

/** The arrows from the post to the creator and to the fans: down on phones, sideways from 1024px. */
function SplitArrow({ to }: { to: 'creator' | 'fan' }) {
  const Side = to === 'creator' ? ArrowLeft : ArrowRight
  return (
    <span aria-hidden="true" className="flex items-center justify-center text-sp-orange">
      <ArrowDown className="h-7 w-7 lg:hidden" />
      <Side className="hidden h-8 w-8 lg:block" />
    </span>
  )
}

/**
 * Section 4, WHAT: the value proposition. One successful post, split between
 * the creator who made it and the fans who helped it spread. Below it, always
 * visible, what the pilot does today and what is still only a vision.
 */
export function What() {
  return (
    <section id="what" aria-labelledby="what-title" className="scroll-mt-16 bg-sp-midnight text-white">
      <div className="mx-auto max-w-6xl px-4 py-18 sm:px-6 sm:py-24 lg:py-28">
        <p className="font-sp-display text-[13px] font-extrabold uppercase tracking-[0.18em] text-sp-orange">{copy.eyebrow}</p>
        <h2
          id="what-title"
          className="mt-4 max-w-5xl font-sp-display text-[clamp(2.1rem,7vw,4.5rem)] font-black leading-[0.98] tracking-[-0.02em] [font-stretch:108%]"
        >
          What if every successful post created <span className="text-sp-orange">more winners?</span>
        </h2>

        <div data-testid="value-split" className="mt-12 grid items-center gap-5 lg:mt-16 lg:grid-cols-[1fr_auto_minmax(0,280px)_auto_1fr] lg:gap-4">
          <div className="order-3 lg:order-1">
            <ValueCard
              side="creator"
              {...copy.creator}
              photo={<Photo id="creatorAtWork" className="absolute inset-0 h-full w-full object-cover object-[70%_22%]" />}
            />
          </div>
          <div className="order-2 lg:order-2">
            <SplitArrow to="creator" />
          </div>
          <div className="order-1 mx-auto w-full max-w-[300px] lg:order-3">
            <p className="mb-3 text-center font-sp-display text-sm font-black uppercase tracking-[0.14em] text-sp-orange">One post. A better split.</p>
            <div aria-hidden="true">
              <SamplePost compact />
            </div>
          </div>
          <div className="order-4 lg:order-4">
            <SplitArrow to="fan" />
          </div>
          <div className="order-5 lg:order-5">
            <ValueCard
              side="fan"
              {...copy.fan}
              photo={
                <>
                  <span className="absolute -bottom-1/2 left-1/2 aspect-square w-[70%] -translate-x-1/2 rounded-full bg-sp-orange" />
                  <Photo id="fanOnPhone" className="absolute bottom-0 left-1/2 h-[104%] w-auto max-w-none -translate-x-1/2" />
                </>
              }
            />
          </div>
        </div>

        <div data-testid="what-disclosures" className="mt-10 grid gap-4 rounded-3xl border border-white/15 p-5 text-sm leading-relaxed sm:p-6 md:grid-cols-2 md:gap-8">
          <p data-testid="what-today">
            <span className="mb-1 flex items-center gap-1.5 font-sp-display text-xs font-extrabold uppercase tracking-[0.14em] text-sp-orange">
              <Info aria-hidden="true" className="h-3.5 w-3.5" /> {copy.today.label}
            </span>
            <span className="text-white/85">{copy.today.body}</span>
          </p>
          <p data-testid="what-vision">
            <span className="mb-1 flex items-center gap-1.5 font-sp-display text-xs font-extrabold uppercase tracking-[0.14em] text-white">
              <Info aria-hidden="true" className="h-3.5 w-3.5" /> {copy.vision.label}
            </span>
            <span className="text-sp-muted-on-dark">{copy.vision.body}</span>
          </p>
        </div>
      </div>
    </section>
  )
}
