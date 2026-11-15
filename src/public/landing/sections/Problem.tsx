import { Eye, HeartHandshake, Shuffle, TrendingDown } from 'lucide-react'
import { HOMEPAGE_COPY } from '../copy'

const copy = HOMEPAGE_COPY.problem
const ICONS = [Shuffle, Eye, HeartHandshake, TrendingDown]

/**
 * Section 2, the creator's problem: not just low views, but no dependable
 * access to the people who chose you, which makes trust, community and a
 * sustainable career harder than they should be.
 */
export function Problem() {
  return (
    <section id="problem" aria-labelledby="problem-title" className="scroll-mt-16 bg-sp-cream text-sp-ink">
      <div className="mx-auto grid max-w-6xl gap-10 px-4 py-18 sm:px-6 sm:py-24 lg:grid-cols-[1.05fr_0.95fr] lg:gap-16 lg:py-28">
        <div className="min-w-0">
          <p className="font-sp-display text-[13px] font-extrabold uppercase tracking-[0.18em] text-sp-green-text">{copy.eyebrow}</p>
          <h2
            id="problem-title"
            className="mt-4 text-balance font-sp-display text-[clamp(2.2rem,7vw,4rem)] font-black leading-[0.98] tracking-[-0.02em] [font-stretch:108%]"
          >
            {copy.headline}
          </h2>
          <div data-testid="problem-body" className="mt-6 max-w-xl space-y-4 text-[1.08rem] leading-relaxed sm:text-lg">
            {copy.body.map((p, i) => (
              <p key={p} className={i === 1 ? 'font-semibold' : 'text-sp-muted'}>
                {p}
              </p>
            ))}
          </div>
        </div>
        <ul data-testid="problem-points" className="grid content-center gap-3 sm:grid-cols-2 lg:grid-cols-1">
          {copy.points.map((pt, i) => {
            const Icon = ICONS[i]
            return (
              <li key={pt.title} className="flex gap-4 rounded-3xl bg-white p-5 ring-1 ring-sp-ink/8">
                <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-sp-teal text-sp-green">
                  <Icon aria-hidden="true" className="h-5 w-5" />
                </span>
                <div className="min-w-0">
                  <h3 className="font-sp-display text-lg font-extrabold leading-tight">{pt.title}</h3>
                  <p className="mt-1 text-[15px] leading-snug text-sp-muted">{pt.line}</p>
                </div>
              </li>
            )
          })}
        </ul>
      </div>
    </section>
  )
}
