import clsx from 'clsx'
import { ArrowRight } from 'lucide-react'

// Illustrations drawn in code. They explain ideas; none of them shows real
// data, and none of them promises reach or income.

function Legend({ swatch, children }: { swatch: string; children: string }) {
  return (
    <li className="flex items-start gap-2.5 text-[14px] leading-snug text-ink-700">
      <span aria-hidden="true" className={clsx('mt-0.5 h-3.5 w-3.5 shrink-0 rounded-[4px]', swatch)} />
      {children}
    </li>
  )
}

/**
 * What: the central visual. Today's creator economy as an upright pyramid
 * next to Crevant's vision as an inverted one. Conceptual, not data.
 */
export function PyramidComparison() {
  return (
    <figure data-testid="pyramid-comparison" className="rounded-[32px] bg-white p-5 ring-1 ring-ink-100 sm:p-8">
      <div className="grid items-start gap-8 md:grid-cols-[1fr_auto_1fr] md:gap-6">
        <div data-pyramid="today">
          <p className="text-center text-[12px] font-semibold uppercase tracking-wide text-ink-500">Today's creator economy</p>
          <svg viewBox="0 0 200 160" role="img" aria-labelledby="pyr-today-title" className="mx-auto mt-3 w-full max-w-[300px]">
            <title id="pyr-today-title">An upright pyramid: a small point at the top, a broad base at the bottom.</title>
            <polygon points="100,6 121,40 79,40" className="fill-spark-400" />
            <polygon points="79,40 121,40 194,156 6,156" className="fill-ink-200" />
            <line x1="79" y1="40" x2="121" y2="40" className="stroke-white" strokeWidth="2" />
          </svg>
          <ul className="mx-auto mt-4 max-w-[300px] space-y-2">
            <Legend swatch="bg-spark-400">Relatively few creators capture much of the income</Legend>
            <Legend swatch="bg-ink-200">Many creators struggle to earn consistently</Legend>
          </ul>
        </div>

        <div aria-hidden="true" className="flex items-center justify-center md:h-full md:pt-24">
          <span className="inline-flex items-center gap-2 rounded-full bg-ink-900 px-4 py-2 text-[13px] font-semibold text-white">
            Flip it <ArrowRight className="h-4 w-4 rotate-90 md:rotate-0" />
          </span>
        </div>

        <div data-pyramid="vision">
          <p className="text-center text-[12px] font-semibold uppercase tracking-wide text-brand-700">Crevant's vision</p>
          <svg viewBox="0 0 200 160" role="img" aria-labelledby="pyr-vision-title" className="mx-auto mt-3 w-full max-w-[300px]">
            <title id="pyr-vision-title">An inverted pyramid: the wide side at the top, the point at the bottom.</title>
            <polygon points="6,6 194,6 131,108 69,108" className="fill-brand-600" />
            <polygon points="69,108 131,108 100,156" className="fill-ink-200" />
            <line x1="69" y1="108" x2="131" y2="108" className="stroke-white" strokeWidth="2" />
          </svg>
          <ul className="mx-auto mt-4 max-w-[300px] space-y-2">
            <Legend swatch="bg-brand-600">Sustainable earning opportunities for many more creators</Legend>
            <Legend swatch="bg-ink-200">Fewer creators left without a way to earn from what they create</Legend>
          </ul>
        </div>
      </div>
      <figcaption className="mt-6 border-t border-ink-100 pt-4 text-center text-[13px] leading-relaxed text-ink-500">
        <span className="mr-2 rounded-full border border-dashed border-ink-300 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide">Conceptual vision</span>
        Not measured income data, and not a promise of any outcome.
      </figcaption>
    </figure>
  )
}

/** Section 6: the one connected story the three demonstrations tell. */
export function DifferenceRail() {
  const steps = ['Reach', 'Loyalty', 'Income opportunities']
  return (
    <ol aria-label="Reach, then loyalty, then income opportunities" className="flex flex-wrap items-center gap-2 text-sm font-semibold">
      {steps.map((s, i) => (
        <li key={s} className="flex items-center gap-2">
          <a href={`#difference-${i + 1}`} className="rounded-full bg-white px-3.5 py-1.5 text-ink-800 ring-1 ring-ink-100 hover:ring-brand-300">
            <span className="mr-1.5 text-brand-600">{i + 1}</span>
            {s}
          </a>
          {i < steps.length - 1 && <ArrowRight aria-hidden="true" className="h-4 w-4 text-ink-400" />}
        </li>
      ))}
    </ol>
  )
}
