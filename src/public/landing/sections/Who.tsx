import { HOMEPAGE_COPY } from '../copy'
import { WHO_PHOTOS } from '../photos'
import { Photo } from '../ui/Photo'
import { Eyebrow } from '../ui/Story'

const copy = HOMEPAGE_COPY.who

/**
 * Section 3, WHO (SP-BRAND-002, as amended): creators and supporters, each
 * with a photo of a real-life moment they would recognize. Two ways to take
 * part in one Splitpost account, not two account types.
 */
export function Who() {
  return (
    <section id="who" aria-labelledby="who-title" className="scroll-mt-16 bg-white text-sp-ink">
      <div className="mx-auto max-w-6xl px-4 pb-18 pt-20 sm:px-6 sm:pb-24 sm:pt-24 lg:pb-28 lg:pt-28">
        <Eyebrow>{copy.eyebrow}</Eyebrow>
        <h2 id="who-title" className="mt-4 text-balance font-sp-display text-[clamp(2.2rem,7vw,4rem)] font-black leading-[0.98] tracking-[-0.02em] [font-stretch:108%]">
          {copy.headline}
        </h2>
        <div className="mt-12 grid gap-8 md:grid-cols-2 md:gap-10">
          {copy.groups.map((g, i) => (
            <article key={g.id} data-testid={`who-${g.id}`} aria-labelledby={`who-${g.id}-title`} className="min-w-0 overflow-hidden rounded-[28px] bg-sp-bg ring-1 ring-sp-ink/8">
              <Photo id={WHO_PHOTOS[i]} sizes="(min-width: 768px) 540px, min(100vw - 2rem, 640px)" className="aspect-[4/3]" />
              <div className="p-6 sm:p-8">
                <p className="font-sp-display text-[13px] font-extrabold uppercase tracking-[0.16em] text-sp-link">{g.tag}</p>
                <h3 id={`who-${g.id}-title`} className="mt-2 text-balance font-sp-display text-[1.6rem] font-black leading-tight [font-stretch:104%]">
                  {g.title}
                </h3>
                <div className="mt-4 space-y-3 text-[1.02rem] leading-relaxed">
                  {g.body.map((p, k) => (
                    <p key={p} className={k === g.body.length - 1 ? 'font-semibold' : undefined}>
                      {p}
                    </p>
                  ))}
                </div>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  )
}
