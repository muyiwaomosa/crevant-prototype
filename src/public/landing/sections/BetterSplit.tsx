import { Info } from 'lucide-react'
import { HOMEPAGE_COPY } from '../copy'
import { RecognitionScreen } from '../ui/PhoneScreens'
import { Avatar } from '../ui/SamplePost'
import { Eyebrow } from '../ui/Story'

const copy = HOMEPAGE_COPY.betterSplit

/**
 * Section 5, A BETTER SPLIT: the Following feed, recognition for the
 * supporters who help a community grow, and the pilot rules, with the
 * founder's three disclosures right beside them. The picture shows the
 * relationship: creator, post, community, and recognition flowing back.
 */
export function BetterSplit() {
  return (
    <section id="split" aria-labelledby="split-title" className="scroll-mt-16 bg-white text-sp-ink">
      <div className="mx-auto grid max-w-6xl grid-cols-1 gap-12 px-4 pb-18 pt-20 sm:px-6 sm:pb-24 sm:pt-24 lg:grid-cols-[1.05fr_0.95fr] lg:gap-16 lg:pb-28 lg:pt-28">
        <div className="min-w-0">
          <Eyebrow>{copy.eyebrow}</Eyebrow>
          <h2 id="split-title" className="mt-4 text-balance font-sp-display text-[clamp(2.2rem,7vw,4rem)] font-black leading-[0.98] tracking-[-0.02em] [font-stretch:108%]">
            {copy.headline}
          </h2>
          <div data-testid="split-copy" className="mt-6 max-w-xl space-y-4 text-[1.08rem] leading-relaxed sm:text-lg">
            {copy.body.map((p) => (
              <p key={p}>{p}</p>
            ))}
          </div>
          <ul data-testid="split-disclosures" className="mt-7 space-y-2 rounded-2xl bg-sp-cream p-5 text-[15px] font-semibold leading-snug">
            {copy.disclosures.map((d) => (
              <li key={d} className="flex gap-2.5">
                <Info aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-sp-gold-text" />
                {d}
              </li>
            ))}
          </ul>
          <p data-testid="split-closing" className="mt-7 font-sp-display text-2xl font-extrabold leading-snug">
            {copy.closing}
          </p>
        </div>

        <div className="grid min-w-0 content-center gap-8">
          <Relationship />
          <div aria-hidden="true" className="mx-auto w-full max-w-[250px]">
            <RecognitionScreen />
          </div>
        </div>
      </div>
    </section>
  )
}

/** Creator → post → community, and recognition flowing back to the community. */
function Relationship() {
  const d = copy.diagram
  return (
    <figure data-testid="split-diagram" className="m-0 min-w-0 rounded-[28px] bg-sp-teal px-3 py-6 text-sp-cream sm:p-8">
      <div aria-hidden="true" className="grid grid-cols-[1fr_auto_1fr_auto_1fr] items-center gap-1 text-center sm:gap-2">
        <div>
          <Avatar initials="PR" tone="priya" className="mx-auto h-11 w-11 text-sm sm:h-14 sm:w-14 sm:text-base" />
          <p className="mt-2 font-sp-display text-sm font-extrabold">{d.creator}</p>
        </div>
        <Arrow label={d.creates} />
        <div>
          <span className="mx-auto block h-12 w-10 sm:h-14 sm:w-12">
            <span className="block h-[22px] rounded-t-[8px] bg-sp-cream [clip-path:polygon(0_0,100%_0,100%_70%,0_100%)]" />
            <span className="mx-auto my-[3px] block h-[3px] w-full -rotate-[6deg] rounded-full bg-sp-gold" />
            <span className="block h-[22px] rounded-b-[8px] bg-sp-green [clip-path:polygon(0_30%,100%_0,100%_100%,0_100%)]" />
          </span>
          <p className="mt-2 font-sp-display text-sm font-extrabold">{d.post}</p>
        </div>
        <Arrow label={d.grows} />
        <div>
          <span className="flex justify-center">
            <Avatar initials="AN" tone="ana" className="h-8 w-8 text-[9px] ring-2 ring-sp-teal sm:h-9 sm:w-9 sm:text-[10px]" />
            <Avatar initials="LE" tone="leo" className="-ml-2.5 h-8 w-8 text-[9px] ring-2 ring-sp-teal sm:-ml-2 sm:h-9 sm:w-9 sm:text-[10px]" />
            <Avatar initials="JK" tone="friend" className="-ml-2.5 h-8 w-8 text-[9px] ring-sp-teal sm:-ml-2 sm:h-9 sm:w-9 sm:text-[10px]" />
          </span>
          <p className="mt-3 font-sp-display text-sm font-extrabold">{d.community}</p>
        </div>
      </div>
      <div aria-hidden="true" className="mt-5 flex items-center gap-2 text-[12px] font-bold text-sp-gold">
        <span className="h-px flex-1 bg-sp-gold/60" />
        {d.recognizes}
        <span className="h-px flex-1 bg-sp-gold/60" />
      </div>
      <figcaption className="sr-only">
        A creator creates a post, the community helps it grow, and the creator recognizes the community in return.
      </figcaption>
    </figure>
  )
}

function Arrow({ label }: { label: string }) {
  return (
    <span className="flex flex-col items-center text-[10px] font-bold text-sp-green-on-dark sm:text-[11px]">
      {label}
      <svg viewBox="0 0 40 10" className="mt-1 h-2.5 w-7 sm:w-10" aria-hidden="true">
        <path d="M0 5 H34 M30 1 L36 5 L30 9" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </span>
  )
}
