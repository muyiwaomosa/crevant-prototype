import { HOMEPAGE_COPY } from '../copy'
import { PostConnectSplit } from '../ui/illustrations/StoryIllustrations'
import { Eyebrow } from '../ui/Story'

const copy = HOMEPAGE_COPY.vision

/**
 * Section 3, THE VISION. The question from the bridge returns as the headline,
 * answered by "Imagine…". The two "Where…" lines read as a pair, joined by a
 * thread, and the section closes on the POST → CONNECT → SPLIT journey.
 */
export function Vision() {
  const [imagine, ...rest] = copy.body
  const wheres = rest.slice(0, 2)
  const closing = rest[2]
  return (
    <section id="vision" aria-labelledby="vision-title" className="scroll-mt-16 bg-white text-sp-ink">
      <div className="mx-auto max-w-6xl px-4 pb-20 pt-20 sm:px-6 sm:pb-24 sm:pt-24 lg:pb-28 lg:pt-28">
        <div className="mx-auto max-w-3xl text-center">
          <Eyebrow>{copy.eyebrow}</Eyebrow>
          <h2 id="vision-title" className="mt-4 text-balance font-sp-display text-[clamp(2.1rem,7vw,3.6rem)] font-black leading-[1] tracking-[-0.02em] [font-stretch:90%]">
            {copy.headline}
          </h2>
          <p className="mx-auto mt-7 max-w-2xl text-balance text-[1.2rem] font-semibold leading-relaxed sm:text-[1.35rem]">{imagine}</p>
        </div>

        <ul data-testid="vision-wheres" className="mx-auto mt-10 grid max-w-4xl gap-4 sm:grid-cols-2">
          {wheres.map((line, i) => (
            <li key={line} className="relative rounded-[28px] bg-sp-secondary-tint p-6 text-[1.08rem] leading-relaxed sm:p-7 sm:text-lg">
              <span aria-hidden="true" className={`mb-3 block h-1.5 w-12 rounded-full bg-sp-primary ${i === 0 ? '' : 'opacity-55'}`} />
              {line}
            </li>
          ))}
        </ul>

        <p data-testid="vision-closing" className="mx-auto mt-10 max-w-3xl text-balance text-center font-sp-display text-[clamp(1.5rem,4.6vw,2.2rem)] font-extrabold leading-snug text-sp-primary">
          {closing}
        </p>

        <PostConnectSplit labels={copy.journey} className="mx-auto mt-12 max-w-4xl" />
      </div>
    </section>
  )
}
