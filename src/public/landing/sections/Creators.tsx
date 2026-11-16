import { HOMEPAGE_COPY } from '../copy'
import { CREATOR_GROUP_PHOTOS } from '../photos'
import { Photo } from '../ui/Photo'
import { Eyebrow } from '../ui/Story'

const copy = HOMEPAGE_COPY.creators

/**
 * Section 4, WHO WE'RE BUILDING FOR: three creator groups, each with a
 * licensed photo of someone actually creating (see photos.ts).
 */
export function Creators() {
  return (
    <section id="creators" aria-labelledby="creators-title" className="scroll-mt-16 bg-sp-bg text-sp-ink">
      <div className="mx-auto max-w-6xl px-4 pb-18 pt-20 sm:px-6 sm:pb-24 sm:pt-24 lg:pb-28 lg:pt-28">
        <Eyebrow>{copy.eyebrow}</Eyebrow>
        <h2 id="creators-title" className="mt-4 max-w-3xl text-balance font-sp-display text-[clamp(2.2rem,7vw,4rem)] font-black leading-[0.98] tracking-[-0.02em] [font-stretch:108%]">
          {copy.headline}
        </h2>
        <ol data-testid="creator-groups" className="mt-12 grid gap-6 md:grid-cols-3">
          {copy.groups.map((g, i) => (
            <li key={g.title} className="flex flex-col overflow-hidden rounded-[28px] bg-white ring-1 ring-sp-ink/8">
              <Photo id={CREATOR_GROUP_PHOTOS[i]} sizes="(min-width: 1152px) 360px, (min-width: 768px) 31vw, calc(100vw - 2rem)" className="aspect-[4/3]" />
              <div className="p-6">
                <p className="font-sp-display text-sm font-black text-sp-accent-text">{i + 1}</p>
                <h3 className="mt-1 font-sp-display text-2xl font-extrabold leading-tight">{g.title}</h3>
                <p className="mt-3 text-[1.02rem] leading-relaxed text-sp-muted">{g.body}</p>
              </div>
            </li>
          ))}
        </ol>
      </div>
    </section>
  )
}
