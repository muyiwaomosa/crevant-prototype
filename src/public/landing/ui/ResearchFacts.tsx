import { ArrowUpRight } from 'lucide-react'
import { RESEARCH } from '../research'

/**
 * The two research figures, each with its context and its source beside it.
 * Only verified figures from research.ts are shown.
 */
export function ResearchFacts() {
  return (
    <div data-testid="research-facts" className="grid gap-5 md:grid-cols-2 md:gap-7">
      {RESEARCH.filter((f) => f.verified).map((f) => (
        <figure key={f.id} data-research={f.id} className="relative flex flex-col rounded-3xl bg-white p-6 ring-1 ring-sp-ink/8 sm:p-8">
          <p className="font-sp-display text-[3.2rem] font-black leading-none tracking-[-0.02em] text-sp-orange-text sm:text-6xl">{f.figure}</p>
          <p data-testid="research-statement" className="mt-3.5 text-lg font-semibold leading-snug sm:text-[1.2rem]">
            {f.statement}
          </p>
          <p className="mb-5 mt-2.5 text-[15px] leading-relaxed text-sp-muted">{f.context}</p>
          <figcaption className="mt-auto border-t border-sp-ink/10 pt-4 text-[13px] leading-relaxed text-sp-muted">
            Source:{' '}
            <a
              href={f.source.url}
              target="_blank"
              rel="noopener noreferrer"
              className="font-semibold text-sp-orange-text underline underline-offset-2 hover:text-sp-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sp-orange-text"
            >
              {f.source.publisher}, “{f.source.title}”, {f.source.date}
              <ArrowUpRight aria-hidden="true" className="ml-0.5 inline h-3.5 w-3.5 align-[-2px]" />
              <span className="sr-only"> (opens in a new tab)</span>
            </a>
            . <span data-testid="research-note">{f.source.note}</span>
          </figcaption>
        </figure>
      ))}
    </div>
  )
}
