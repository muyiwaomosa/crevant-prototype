import { HOMEPAGE_COPY } from '../copy'
import { PAIN_PHOTOS } from '../photos'
import { Photo } from '../ui/Photo'
import { Eyebrow } from '../ui/Story'

const copy = HOMEPAGE_COPY.people

/**
 * Section 4, THE PEOPLE BEHIND THE POSTS (WHO), in the original site's
 * "Who we're building for" style: cream band, the original photo cards. The
 * creator comes first and largest: a creator working alone late at night
 * beside the opening copy, then one photo card for each approved pain point.
 * The fans follow, visibly smaller: one photo of friends sharing posts beside
 * the approved fan lines. Licensed stock photos of models (photos.ts); the
 * footer says so on every page.
 */
export function People() {
  return (
    <section id="people" aria-labelledby="people-title" className="scroll-mt-16 bg-sp-bg text-sp-ink">
      <div className="mx-auto max-w-6xl px-4 pb-18 pt-20 sm:px-6 sm:pb-24 sm:pt-24 lg:pb-28 lg:pt-28">
        <div className="grid grid-cols-1 gap-12 lg:grid-cols-[1.05fr_0.95fr] lg:items-center lg:gap-16">
          <div className="min-w-0">
            <Eyebrow>{copy.eyebrow}</Eyebrow>
            <h2 id="people-title" className="mt-4 text-balance font-sp-display text-[clamp(2.2rem,7vw,4rem)] font-black leading-[0.98] tracking-[-0.02em] [font-stretch:108%]">
              {copy.headline}
            </h2>
            <div data-testid="people-body" className="mt-6 max-w-xl space-y-3 text-[1.08rem] leading-relaxed sm:text-lg">
              {copy.body.map((line, i) => (
                <p key={line} className={i === copy.body.length - 1 ? 'pt-1 font-semibold' : undefined}>
                  {line}
                </p>
              ))}
            </div>
          </div>
          <figure className="m-0 w-full max-w-[30rem] justify-self-center overflow-hidden rounded-[28px] shadow-[0_30px_60px_-34px_rgb(0_0_0/0.45)]">
            <Photo id="creatorLateNight" sizes="(min-width: 1024px) 480px, min(100vw - 2rem, 480px)" className="aspect-[4/5]" />
          </figure>
        </div>

        <p
          data-testid="people-emphasis"
          className="mt-14 max-w-4xl border-l-[6px] border-sp-accent pl-5 font-sp-display text-[clamp(1.7rem,5vw,2.75rem)] font-black leading-[1.08] tracking-[-0.01em] [font-stretch:104%] sm:pl-7"
        >
          {copy.emphasis}
        </p>

        <ol data-testid="pains" className="mt-10 grid gap-6 md:grid-cols-3">
          {copy.pains.map((p, i) => (
            <li key={p.title} className="flex flex-col overflow-hidden rounded-[28px] bg-white ring-1 ring-sp-ink/8">
              <Photo id={PAIN_PHOTOS[i]} sizes="(min-width: 1152px) 360px, (min-width: 768px) 31vw, calc(100vw - 2rem)" className="aspect-[4/3]" />
              <div className="p-6">
                <p className="font-sp-display text-sm font-black text-sp-accent-text">{i + 1}</p>
                <h3 className="mt-1 font-sp-display text-2xl font-extrabold leading-tight">{p.title}</h3>
                <p className="mt-3 text-[1.02rem] leading-relaxed text-sp-muted">{p.body}</p>
              </div>
            </li>
          ))}
        </ol>

        {/* The fans: real, but visibly smaller than the creators above. */}
        <div data-testid="people-fans" className="mt-14 grid items-center gap-6 overflow-hidden rounded-[28px] bg-white p-4 ring-1 ring-sp-ink/8 sm:p-5 md:grid-cols-[0.75fr_1.25fr] md:gap-10">
          <figure className="m-0 overflow-hidden rounded-[20px]">
            <Photo id="fansSharing" sizes="(min-width: 768px) 360px, calc(100vw - 4rem)" className="aspect-[4/3]" />
          </figure>
          <div className="min-w-0 px-2 pb-3 md:px-0 md:pb-0 md:pr-6">
            <h3 className="font-sp-display text-2xl font-extrabold leading-tight text-sp-primary sm:text-[1.75rem]">{copy.fanTransition}</h3>
            <div className="mt-4 space-y-2.5 text-[1.05rem] leading-relaxed">
              {copy.fans.map((line) => (
                <p key={line}>{line}</p>
              ))}
            </div>
          </div>
        </div>

        <p data-testid="people-closing" className="mx-auto mt-16 max-w-4xl text-balance text-center font-sp-display text-[clamp(1.8rem,5.6vw,3rem)] font-black leading-[1.05] tracking-[-0.01em] [font-stretch:104%]">
          {copy.closing}
        </p>
      </div>
    </section>
  )
}
