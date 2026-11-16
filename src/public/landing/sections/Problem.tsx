import { HOMEPAGE_COPY } from '../copy'
import { Eyebrow } from '../ui/Story'

const copy = HOMEPAGE_COPY.problem

/**
 * Section 2, THE PROBLEM: who gets the reward, and why reach is so hard to
 * predict. The picture is a creator's own dashboard, drawn: followers climb
 * steadily while views per post jump around and earnings stay a question
 * mark. A sample, with no figures, so it can't be read as a real result.
 */
export function Problem() {
  return (
    <section id="problem" aria-labelledby="problem-title" className="scroll-mt-16 bg-sp-bg text-sp-ink">
      <div className="mx-auto grid max-w-6xl grid-cols-1 gap-12 px-4 pb-18 pt-20 sm:px-6 sm:pb-24 sm:pt-24 lg:grid-cols-[1.05fr_0.95fr] lg:items-center lg:gap-16 lg:pb-28 lg:pt-28">
        <div className="min-w-0">
          <Eyebrow>{copy.eyebrow}</Eyebrow>
          <h2 id="problem-title" className="mt-4 text-balance font-sp-display text-[clamp(2.2rem,7vw,4rem)] font-black leading-[0.98] tracking-[-0.02em] [font-stretch:108%]">
            {copy.headline}
          </h2>
          <div data-testid="problem-copy" className="mt-6 max-w-xl space-y-4 text-[1.08rem] leading-relaxed sm:text-lg">
            {copy.body.map((p) => (
              <p key={p}>{p}</p>
            ))}
            <p className="pt-2 font-sp-display text-xl font-extrabold">{copy.turn}</p>
            {copy.body2.map((p) => (
              <p key={p}>{p}</p>
            ))}
            <p data-testid="problem-closing" className="border-l-4 border-sp-accent pl-4 font-semibold">
              {copy.closing}
            </p>
          </div>
        </div>
        <UnpredictableDashboard />
      </div>
    </section>
  )
}

/** A creator's dashboard, drawn: followers up, views all over the place, earnings unknown. Sample, no figures. */
function UnpredictableDashboard() {
  const views = [72, 18, 94, 12, 40, 8, 66, 15]
  return (
    <figure data-testid="problem-visual" className="m-0 mx-auto w-full max-w-[30rem]">
      <div className="rounded-[28px] bg-white p-5 shadow-[0_30px_60px_-34px_rgb(18_48_45/0.45)] ring-1 ring-sp-ink/8 sm:p-6">
        <div className="flex items-center justify-between">
          <p className="font-sp-display text-lg font-extrabold">Your month at a glance</p>
          <span className="rounded-full bg-sp-bg px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-[0.08em] text-sp-muted">Sample</span>
        </div>

        <div className="mt-5 grid gap-4">
          <div className="rounded-2xl bg-sp-bg/70 p-4">
            <p className="text-sm font-bold">Followers</p>
            <p className="text-xs text-sp-muted">Growing every week</p>
            <svg viewBox="0 0 300 70" aria-hidden="true" className="mt-2 h-16 w-full">
              <path d="M4 62 C50 58 80 52 120 44 S200 26 296 8" fill="none" stroke="var(--color-sp-link)" strokeWidth="4" strokeLinecap="round" />
              <circle cx="296" cy="8" r="5" fill="var(--color-sp-link)" />
            </svg>
          </div>

          <div className="rounded-2xl bg-sp-bg/70 p-4">
            <p className="text-sm font-bold">Views per post</p>
            <p className="text-xs text-sp-muted">Up one day, down the next</p>
            <div aria-hidden="true" className="mt-3 flex h-16 items-end gap-2">
              {views.map((h, i) => (
                <span key={i} className="flex-1 rounded-t-md bg-sp-primary/80" style={{ height: `${h}%` }} />
              ))}
            </div>
          </div>

          <div className="flex items-center gap-4 rounded-2xl bg-sp-primary p-4 text-sp-bg">
            <span className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-sp-accent font-sp-display text-2xl font-black text-sp-ink">?</span>
            <div className="min-w-0">
              <p className="text-sm font-bold">Earnings</p>
              <p className="text-xs text-sp-muted-on-dark">Hard to predict, hard to plan around</p>
            </div>
          </div>
        </div>
      </div>
      <figcaption className="sr-only">
        A sample creator dashboard: followers grow steadily, but views per post rise and fall from one post to the next, and earnings are a question mark.
      </figcaption>
    </figure>
  )
}
