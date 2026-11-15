import { HOMEPAGE_COPY } from '../copy'
import { ConceptPhoto } from '../ui/ConceptPhoto'
import { Avatar } from '../ui/PostJourney'

const copy = HOMEPAGE_COPY.who

const PEOPLE = [
  { key: 'creator', photo: 'creator', ...copy.creator },
  { key: 'fan', photo: 'fan', ...copy.fan },
] as const

/**
 * Section 3, WHO: the creator who keeps posting and the fan who keeps
 * sharing. Recognition before features: each side gets a concept photograph,
 * one line and three things they'll recognise.
 */
export function Who() {
  return (
    <section id="who" aria-labelledby="who-title" className="scroll-mt-16 bg-white text-sp-ink">
      <div className="mx-auto max-w-6xl px-4 py-18 sm:px-6 sm:py-24 lg:py-28">
        <p className="font-sp-display text-[13px] font-extrabold uppercase tracking-[0.18em] text-sp-orange-text">{copy.eyebrow}</p>
        <h2
          id="who-title"
          className="mt-4 font-sp-display text-[clamp(2rem,6.6vw,4.2rem)] font-black leading-[1.02] tracking-[-0.02em] [font-stretch:108%]"
        >
          <span className="block">{copy.headline[0]}</span> <span className="block text-sp-orange-text">{copy.headline[1]}</span>
        </h2>

        <div className="mt-12 grid gap-14 md:grid-cols-2 md:gap-10 lg:mt-16">
          {PEOPLE.map((person) => (
            <article key={person.key} data-audience={person.key} aria-labelledby={`who-${person.key}`} className="flex min-w-0 flex-col gap-5">
              <ConceptPhoto id={person.photo} sizes="(min-width: 1152px) 540px, (min-width: 768px) 46vw, 92vw" className="aspect-[3/2]" />
              <div>
                <h3 id={`who-${person.key}`} className="font-sp-display text-[13px] font-extrabold uppercase tracking-[0.16em] text-sp-orange-text">
                  {person.label}
                </h3>
                <p className="mt-2 font-sp-display text-[1.65rem] font-black leading-[1.1] tracking-[-0.01em] sm:text-[2rem]">{person.line}</p>
              </div>
              <ul className="space-y-2.5">
                {person.points.map((point) => (
                  <li key={point} className="flex gap-3 text-[1.05rem] leading-relaxed">
                    <span aria-hidden="true" className="mt-[0.6em] h-2 w-2 shrink-0 rounded-full bg-sp-orange" />
                    {point}
                  </li>
                ))}
              </ul>
            </article>
          ))}
        </div>

        <div data-testid="who-sample-note" className="mt-12 flex flex-col gap-3 rounded-2xl bg-sp-neutral px-5 py-4 sm:flex-row sm:items-center sm:gap-4 sm:px-6">
          <span aria-hidden="true" className="flex">
            <Avatar initials="PR" tone="priya" className="h-9 w-9 text-xs ring-2 ring-sp-neutral" />
            <Avatar initials="AN" tone="ana" className="-ml-1.5 h-9 w-9 text-xs ring-2 ring-sp-neutral" />
            <Avatar initials="LE" tone="leo" className="-ml-1.5 h-9 w-9 text-xs ring-2 ring-sp-neutral" />
          </span>
          <p className="text-[15px] leading-relaxed">{copy.samplePeople}</p>
        </div>
      </div>
    </section>
  )
}
