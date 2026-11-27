import clsx from 'clsx'
import { HOMEPAGE_COPY } from '../copy'
import { Eyebrow } from '../ui/Story'

const copy = HOMEPAGE_COPY.how

/**
 * Section 5, HOW (SP-BRAND-002, structured per SP-BRAND-003): each of the
 * five steps reads hook (the title), a recognizable problem, how Splitpost
 * answers it (the approved body), then a realistic screen. Five steps,
 * each with a different screen from the actual Splitpost app (Discover, Home
 * with the Clique row, a creator's profile and insights, a recognized
 * contribution, My Split), captured with illustrative sample people and
 * data and labelled so. Screens alternate sides on wide screens so no two
 * look alike in a row; each carries one callout naming its benefit. No video
 * publishing is shown (not yet released). The money step carries its full
 * disclosure beside it.
 */
export function How() {
  return (
    <section id="how" aria-labelledby="how-title" className="scroll-mt-16 overflow-x-clip bg-sp-bg text-sp-ink">
      <div className="mx-auto max-w-6xl px-4 pb-18 pt-20 sm:px-6 sm:pb-24 sm:pt-24 lg:pb-28 lg:pt-28">
        <Eyebrow>{copy.eyebrow}</Eyebrow>
        <h2 id="how-title" className="mt-4 max-w-3xl text-balance font-sp-display text-[clamp(2.2rem,7vw,4rem)] font-black leading-[0.98] tracking-[-0.02em] [font-stretch:108%]">
          {copy.headline}
        </h2>
        <ol className="mt-14 space-y-16 sm:space-y-24">
          {copy.steps.map((s, i) => (
            <li
              key={s.id}
              data-testid={`how-${s.id}`}
              className="grid grid-cols-1 items-center gap-8 md:grid-cols-2 md:gap-14"
              aria-labelledby={`how-${s.id}-title`}
            >
              <div className={clsx('min-w-0', i % 2 === 1 && 'md:order-2')}>
                <p className="font-sp-display text-[13px] font-extrabold uppercase tracking-[0.18em] text-sp-link">
                  <span className="tabular-nums">{s.number}</span> <span aria-hidden="true">·</span> {s.label}
                </p>
                <h3 id={`how-${s.id}-title`} className="mt-2 font-sp-display text-[clamp(1.8rem,5vw,2.6rem)] font-black leading-tight [font-stretch:104%]">
                  {s.title}
                </h3>
                <p data-testid={`how-${s.id}-problem`} className="mt-4 max-w-md border-l-[3px] border-sp-accent pl-3.5 text-[1.02rem] font-semibold italic leading-snug text-sp-muted">
                  {s.problem}
                </p>
                <div data-testid={`how-${s.id}-solution`} className="mt-4 max-w-md space-y-3 text-[1.06rem] leading-relaxed">
                  {s.body.map((p) => (
                    <p key={p}>{p}</p>
                  ))}
                  {'source' in s && s.source && (
                    <p data-testid={`how-${s.id}-source`} className="text-[0.98rem] text-sp-muted">
                      {s.source}
                    </p>
                  )}
                </div>
                {'note' in s && s.note && (
                  <p data-testid={`how-${s.id}-note`} className="mt-4 max-w-md rounded-2xl bg-sp-secondary-tint px-4 py-3 text-[14px] font-semibold leading-snug text-sp-ink">
                    {s.note}
                  </p>
                )}
              </div>
              <figure className={clsx('m-0 flex flex-col items-center', i % 2 === 1 && 'md:order-1')}>
                <div className="relative">
                  <div className="w-[min(72vw,260px)] overflow-hidden rounded-[34px] bg-[#11161c] p-[7px] shadow-[0_36px_70px_-36px_rgb(18_37_90/0.7)]">
                    <img
                      src={s.screen}
                      alt={s.alt}
                      width={780}
                      height={1688}
                      loading="lazy"
                      decoding="async"
                      className="block h-auto w-full rounded-[28px]"
                    />
                  </div>
                  <span
                    aria-hidden="true"
                    className={clsx(
                      'absolute top-[9%] max-w-[11rem] rounded-2xl bg-sp-primary px-3.5 py-2 text-[13px] font-bold leading-snug text-white shadow-lg',
                      i % 2 === 1 ? '-left-3 lg:-left-20 xl:-left-36' : '-right-3 lg:-right-20 xl:-right-36',
                    )}
                  >
                    {s.callout}
                  </span>
                </div>
                <figcaption data-testid="screen-label" className="mt-4 max-w-[19rem] text-center text-[12px] leading-snug text-sp-muted">
                  {copy.screenLabel}
                </figcaption>
              </figure>
            </li>
          ))}
        </ol>
      </div>
    </section>
  )
}
