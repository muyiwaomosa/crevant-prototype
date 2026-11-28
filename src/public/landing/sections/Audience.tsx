import { ArrowRight } from 'lucide-react'
import {
  AUDIENCE_HEADINGS,
  LAUNCH_CATEGORIES,
  PAIN_POINTS,
  PROBLEM_SOLUTION,
  USE_CASES,
  type PainPoint,
  type ProblemSolution,
  type UseCase,
} from '../audience'

/**
 * Layout for the creator and supporter detail (SP-BRAND-003 follow-up,
 * BR-003 to BR-005). Each block is fed only from `landing/audience.ts` and
 * renders nothing while its list is empty, so the live site never shows
 * placeholder text. The founder supplies every word.
 */

function Heading({ id, text }: { id: string; text?: string }) {
  if (!text) return null
  return (
    <h3 id={id} className="text-balance font-sp-display text-[1.6rem] font-black leading-tight">
      {text}
    </h3>
  )
}

export function PainPoints({ items = PAIN_POINTS, heading = AUDIENCE_HEADINGS.painPoints }: { items?: readonly PainPoint[]; heading?: string }) {
  if (items.length === 0) return null
  return (
    <section data-testid="pain-points" aria-labelledby={heading ? 'pain-points-title' : undefined} className="mt-14">
      <Heading id="pain-points-title" text={heading} />
      <ul className="mt-6 grid gap-3 sm:grid-cols-2">
        {items.map((p) => (
          <li key={p.id} data-audience={p.audience} className="rounded-2xl bg-sp-bg px-5 py-4 text-[1.02rem] leading-relaxed ring-1 ring-sp-ink/8">
            {p.text}
          </li>
        ))}
      </ul>
    </section>
  )
}

export function UseCases({ items = USE_CASES, heading = AUDIENCE_HEADINGS.useCases }: { items?: readonly UseCase[]; heading?: string }) {
  if (items.length === 0) return null
  // Grouped by launch category, in the approved order; a category with no entries is left out.
  const groups = LAUNCH_CATEGORIES.map((c) => [c, items.filter((u) => u.category === c)] as const).filter(([, list]) => list.length > 0)
  return (
    <section data-testid="use-cases" aria-labelledby={heading ? 'use-cases-title' : undefined} className="mt-14">
      <Heading id="use-cases-title" text={heading} />
      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        {groups.map(([category, list]) => (
          <div key={category} data-category={category} className="min-w-0">
            <p className="font-sp-display text-[13px] font-extrabold uppercase tracking-[0.16em] text-sp-link">{category}</p>
            <ul className="mt-3 space-y-3">
              {list.map((u) => (
                <li key={u.id} className="rounded-2xl bg-sp-bg p-5 ring-1 ring-sp-ink/8">
                  <p className="font-sp-display text-[1.15rem] font-extrabold leading-snug">{u.title}</p>
                  <p className="mt-1.5 text-[1rem] leading-relaxed text-sp-muted">{u.body}</p>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </section>
  )
}

export function ProblemToSolution({ items = PROBLEM_SOLUTION, heading = AUDIENCE_HEADINGS.problemSolution }: { items?: readonly ProblemSolution[]; heading?: string }) {
  if (items.length === 0) return null
  return (
    <section data-testid="problem-solution" aria-labelledby={heading ? 'problem-solution-title' : undefined} className="mt-14">
      <Heading id="problem-solution-title" text={heading} />
      <ul className="mt-6 space-y-3">
        {items.map((x) => (
          <li key={x.id} className="grid items-center gap-2 rounded-2xl bg-sp-bg p-5 ring-1 ring-sp-ink/8 md:grid-cols-[1fr_auto_1fr] md:gap-5">
            <p className="text-[1rem] leading-relaxed text-sp-muted">{x.problem}</p>
            <ArrowRight aria-hidden="true" className="hidden h-5 w-5 text-sp-link md:block" />
            <p className="text-[1rem] font-semibold leading-relaxed">{x.solution}</p>
          </li>
        ))}
      </ul>
    </section>
  )
}
