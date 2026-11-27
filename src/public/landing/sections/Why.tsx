import { HOMEPAGE_COPY } from '../copy'
import { Photo } from '../ui/Photo'
import { Eyebrow } from '../ui/Story'

const copy = HOMEPAGE_COPY.why

/**
 * Section 2, WHY (SP-BRAND-002): the gap between the value people create and
 * the value they receive. The picture is a creator at work behind the scenes,
 * with a drawn dashboard laid over it: followers climb, views per post jump
 * around and earnings are a question mark. A sample with no figures, so it
 * can't be read as a real result; no statistics, no named companies.
 */
export function Why() {
  return (
    <section id="why" aria-labelledby="why-title" className="scroll-mt-16 bg-sp-bg text-sp-ink">
      <div className="mx-auto grid max-w-6xl grid-cols-1 gap-12 px-4 pb-18 pt-20 sm:px-6 sm:pb-24 sm:pt-24 lg:grid-cols-[1.05fr_0.95fr] lg:items-center lg:gap-16 lg:pb-28 lg:pt-28">
        <div className="min-w-0">
          <Eyebrow>{copy.eyebrow}</Eyebrow>
          <h2 id="why-title" className="mt-4 text-balance font-sp-display text-[clamp(2.2rem,7vw,4rem)] font-black leading-[0.98] tracking-[-0.02em] [font-stretch:108%]">
            {copy.headline}
          </h2>
          <div data-testid="why-copy" className="mt-6 max-w-xl space-y-4 text-[1.08rem] leading-relaxed sm:text-lg">
            {copy.body.map((p) => (
              <p key={p}>{p}</p>
            ))}
            <p className="pt-2 font-sp-display text-xl font-extrabold">{copy.question}</p>
            {copy.body2.map((p) => (
              <p key={p}>{p}</p>
            ))}
            <div data-testid="why-belief" className="space-y-1 border-l-4 border-sp-accent pl-4 font-semibold">
              {copy.belief.map((p) => (
                <p key={p}>{p}</p>
              ))}
            </div>
          </div>
        </div>
        <figure data-testid="why-visual" className="relative m-0 mx-auto w-full max-w-[30rem]">
          <div className="overflow-hidden rounded-[28px] shadow-[0_30px_60px_-34px_rgb(0_0_0/0.45)]">
            <Photo id="creatorEditing" sizes="(min-width: 1024px) 480px, min(100vw - 2rem, 480px)" className="aspect-[4/3]" />
          </div>
          <UnpredictableMonth />
          <figcaption className="sr-only">
            A creator at work behind the scenes. Beside her, a sample dashboard: followers grow steadily, views per post rise and fall, and earnings are a
            question mark.
          </figcaption>
        </figure>
      </div>
    </section>
  )
}

/** A creator's month, drawn: followers up, views all over the place, earnings unknown. Sample, no figures. */
function UnpredictableMonth() {
  const views = [72, 18, 94, 12, 40, 8, 66, 15]
  return (
    <div aria-hidden="true" className="relative -mt-14 ml-auto mr-3 w-[78%] rounded-[22px] bg-white p-4 shadow-[0_24px_50px_-30px_rgb(18_48_45/0.55)] ring-1 ring-sp-ink/8 sm:mr-6">
      <div className="flex items-center justify-between">
        <p className="font-sp-display text-[15px] font-extrabold">Your month at a glance</p>
        <span className="rounded-full bg-sp-bg px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-[0.08em] text-sp-muted">Sample</span>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-3">
        <div className="rounded-xl bg-sp-bg/70 p-2.5">
          <p className="text-[12px] font-bold">Followers</p>
          <svg viewBox="0 0 300 70" className="mt-1 h-9 w-full">
            <path d="M4 62 C50 58 80 52 120 44 S200 26 296 8" fill="none" stroke="var(--color-sp-link)" strokeWidth="6" strokeLinecap="round" />
          </svg>
        </div>
        <div className="rounded-xl bg-sp-bg/70 p-2.5">
          <p className="text-[12px] font-bold">Views per post</p>
          <div className="mt-1 flex h-9 items-end gap-1">
            {views.map((h, i) => (
              <span key={i} className="flex-1 rounded-t-sm bg-sp-primary/80" style={{ height: `${h}%` }} />
            ))}
          </div>
        </div>
      </div>
      <div className="mt-3 flex items-center gap-3 rounded-xl bg-sp-primary p-2.5 text-sp-bg">
        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-sp-accent font-sp-display text-lg font-black text-sp-ink">?</span>
        <p className="text-[12px] font-bold">Earnings: hard to predict, hard to plan around</p>
      </div>
    </div>
  )
}
