import { HOMEPAGE_COPY } from '../copy'
import { ChallengeArt } from '../ui/illustrations/ChallengeArt'
import { Photo } from '../ui/Photo'
import { Eyebrow } from '../ui/Story'

const copy = HOMEPAGE_COPY.people

const CHALLENGES = ['reach', 'earnings', 'business'] as const

/**
 * Section 4, THE PEOPLE BEHIND THE POSTS (WHO), in the original site's
 * "Who we're building for" style: cream band and the original cards. The
 * approved copy runs in order: the opening, the emphasized line, then three
 * challenge cards (inconsistent reach, unpredictable earnings, building a
 * business) holding their approved lines under drawings, then the rest of the
 * story beside a photo of the other job. The fans follow, visibly smaller.
 *
 * Photos never show an identifiable person struggling (founder direction):
 * the lead creator is seen from behind, the other job without a face, and the
 * challenges are drawn. Licensed stock photos of models (photos.ts), pending
 * the founder's approval; the footer says so on every page.
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
            <div data-testid="people-intro" className="mt-6 max-w-xl space-y-3 text-[1.08rem] leading-relaxed sm:text-lg">
              {copy.intro.map((line, i) => (
                <p key={line} className={i === copy.intro.length - 1 ? 'pt-1 font-semibold' : undefined}>
                  {line}
                </p>
              ))}
            </div>
          </div>
          <figure className="m-0 w-full max-w-[30rem] justify-self-center overflow-hidden rounded-[28px] shadow-[0_30px_60px_-34px_rgb(0_0_0/0.45)]">
            <Photo id="creatorAtNight" sizes="(min-width: 1024px) 480px, min(100vw - 2rem, 480px)" className="aspect-[4/5]" />
          </figure>
        </div>

        <p
          data-testid="people-emphasis"
          className="mt-14 max-w-4xl border-l-[6px] border-sp-accent pl-5 font-sp-display text-[clamp(1.7rem,5vw,2.75rem)] font-black leading-[1.08] tracking-[-0.01em] [font-stretch:104%] sm:pl-7"
        >
          {copy.emphasis}
        </p>

        <ol data-testid="challenges" className="mt-10 grid gap-6 md:grid-cols-3">
          {copy.challenges.map((lines, i) => (
            <li key={CHALLENGES[i]} data-testid="challenge" className="flex flex-col overflow-hidden rounded-[28px] bg-white ring-1 ring-sp-ink/8">
              <div className="bg-sp-secondary-tint px-6 py-5">
                <ChallengeArt kind={CHALLENGES[i]} className="mx-auto max-w-[20rem]" />
              </div>
              <div className="p-6">
                <p className="font-sp-display text-sm font-black text-sp-accent-text">{i + 1}</p>
                <div className="mt-2 space-y-2 text-[1.05rem] font-semibold leading-relaxed">
                  {lines.map((line) => (
                    <p key={line}>{line}</p>
                  ))}
                </div>
              </div>
            </li>
          ))}
        </ol>

        <div data-testid="people-after" className="mt-14 grid items-center gap-8 md:grid-cols-[0.9fr_1.1fr] md:gap-12">
          <figure className="m-0 overflow-hidden rounded-[28px] shadow-[0_24px_50px_-30px_rgb(0_0_0/0.4)]">
            <Photo id="anotherJob" sizes="(min-width: 1024px) 480px, (min-width: 768px) 42vw, calc(100vw - 2rem)" className="aspect-[4/3]" />
          </figure>
          <div className="min-w-0 space-y-3 text-[1.08rem] leading-relaxed sm:text-lg">
            {copy.after.map((line, i) => (
              <p key={line} className={i < 3 ? 'font-sp-display text-xl font-extrabold' : i === copy.after.length - 1 ? 'border-l-4 border-sp-accent pl-4 font-semibold' : undefined}>
                {line}
              </p>
            ))}
          </div>
        </div>

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
