import { Link } from 'react-router-dom'
import { ArrowRight, Heart, Megaphone, PenLine } from 'lucide-react'
import { HOMEPAGE_COPY } from '../copy'
import { JOIN_PATH, waitlistCta } from '../../waitlist/status'
import { Eyebrow } from '../ui/Story'

const copy = HOMEPAGE_COPY.paths

const ICONS = { creators: PenLine, members: Heart, advertisers: Megaphone } as const

const focusRing = 'focus-visible:outline focus-visible:outline-3 focus-visible:outline-offset-4 focus-visible:outline-sp-primary'

/**
 * FIND YOUR PATH: three short benefit cards, for creators, members (fans) and
 * advertisers. There is one Splitpost account and one sign up, so every
 * card's button goes to the same place as every other call to action on the
 * site. Advertisers ask to advertise from their account after joining; there
 * is no separate advertiser form.
 */
export function Paths() {
  return (
    <section id="paths" aria-labelledby="paths-title" className="scroll-mt-16 bg-white text-sp-ink">
      <div className="mx-auto max-w-6xl px-4 pb-18 pt-20 sm:px-6 sm:pb-24 sm:pt-24 lg:pb-28 lg:pt-28">
        <Eyebrow>{copy.eyebrow}</Eyebrow>
        <h2
          id="paths-title"
          className="mt-4 max-w-3xl text-balance font-sp-display text-[clamp(2.2rem,7vw,4rem)] font-black leading-[0.98] tracking-[-0.02em] [font-stretch:108%]"
        >
          {copy.headline}
        </h2>
        <p data-testid="paths-intro" className="mt-6 max-w-2xl text-[1.08rem] leading-relaxed text-sp-muted sm:text-lg">
          {copy.intro}
        </p>
        <ul data-testid="paths-cards" className="mt-12 grid gap-6 md:grid-cols-3">
          {copy.cards.map((card) => {
            const Icon = ICONS[card.id]
            const titleId = `path-${card.id}-title`
            return (
              <li
                key={card.id}
                id={`path-${card.id}`}
                data-testid={`path-${card.id}`}
                className="flex flex-col rounded-[28px] bg-sp-bg p-6 ring-1 ring-sp-ink/8 sm:p-7"
              >
                <span aria-hidden="true" className="grid h-12 w-12 place-items-center rounded-2xl bg-sp-primary text-sp-secondary">
                  <Icon className="h-6 w-6" />
                </span>
                <p className="mt-5 font-sp-display text-[13px] font-extrabold uppercase tracking-[0.16em] text-sp-accent-text">{card.tag}</p>
                <h3 id={titleId} className="mt-1.5 font-sp-display text-2xl font-extrabold leading-tight">
                  {card.title}
                </h3>
                <p className="mt-3 flex-1 text-[1.02rem] leading-relaxed text-sp-muted">{card.body}</p>
                <Link
                  to={JOIN_PATH}
                  aria-describedby={titleId}
                  className={`mt-6 inline-flex min-h-12 items-center justify-center gap-2 self-start rounded-full bg-sp-primary px-6 text-base font-bold text-white transition-[background-color,transform] hover:bg-sp-primary-raised active:scale-[0.98] motion-reduce:transition-none ${focusRing}`}
                >
                  {waitlistCta()} <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </Link>
              </li>
            )
          })}
        </ul>
        <p data-testid="paths-note" className="mt-8 font-sp-display text-xl font-extrabold leading-snug">
          {copy.note}
        </p>
      </div>
    </section>
  )
}
