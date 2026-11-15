import { HOMEPAGE_COPY } from '../copy'
import { Avatar, PostJourney } from '../ui/PostJourney'

const copy = HOMEPAGE_COPY.why

const GAP_AVATARS = {
  Priya: { initials: 'PR', tone: 'priya' },
  Ana: { initials: 'AN', tone: 'ana' },
  Leo: { initials: 'LE', tone: 'leo-light' },
} as const

/**
 * Section 2, WHY: the problem. One sample post travels through four steps,
 * then the gap: everyone contributed, but not everyone had a way to benefit.
 */
export function Why() {
  const [statement, question] = copy.headline.split('. ')
  return (
    <section id="why" aria-labelledby="why-title" className="scroll-mt-16 bg-sp-neutral text-sp-ink">
      <div className="mx-auto max-w-6xl px-4 py-18 sm:px-6 sm:py-24 lg:py-28">
        <p className="font-sp-display text-[13px] font-extrabold uppercase tracking-[0.18em] text-sp-orange-text">{copy.eyebrow}</p>
        <h2
          id="why-title"
          className="mt-4 max-w-4xl font-sp-display text-[clamp(2.2rem,7.6vw,4.6rem)] font-black leading-[0.98] tracking-[-0.02em] [font-stretch:108%]"
        >
          <span>{statement}.</span> <span className="text-sp-orange-text">{question}</span>
        </h2>
        <p className="mt-5 max-w-2xl text-lg leading-relaxed text-sp-muted sm:text-xl">{copy.intro}</p>

        <div className="mt-12 lg:mt-16">
          <PostJourney />
        </div>

        <div
          data-testid="contribution-gap"
          className="mt-14 grid gap-7 rounded-[28px] bg-sp-midnight p-6 text-white sm:p-10 lg:grid-cols-[0.9fr_1.6fr] lg:items-center lg:gap-12 lg:p-12"
        >
          <div>
            <p className="font-sp-display text-[13px] font-extrabold uppercase tracking-[0.18em] text-sp-orange">{copy.gap.kicker}</p>
            <h3 className="mt-3 font-sp-display text-[clamp(1.6rem,4.6vw,2.5rem)] font-black leading-[1.05] tracking-[-0.01em]">{copy.gap.headline}</h3>
          </div>
          <ul className="grid gap-3.5 sm:grid-cols-3 sm:gap-4">
            {copy.gap.people.map((p) => {
              const a = GAP_AVATARS[p.name]
              return (
                <li key={p.name} data-person={p.name} className="rounded-2xl bg-sp-midnight-raised p-5">
                  <p className="flex items-center gap-2.5 text-[15px] font-bold">
                    <Avatar initials={a.initials} tone={a.tone} className="h-8 w-8 text-[11px] ring-2 ring-white/50" />
                    {p.name}
                  </p>
                  <p className="mt-3 text-[15px] leading-relaxed text-[#e6e7f0]">{p.line}</p>
                </li>
              )
            })}
          </ul>
        </div>
      </div>
    </section>
  )
}
