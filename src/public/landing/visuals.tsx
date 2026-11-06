import clsx from 'clsx'
import type { ReactNode } from 'react'
import { Eye, HeartHandshake, PenLine, Sprout, Users } from 'lucide-react'
import { StatusBadge, type Status } from './shared'

// Diagrams drawn in code. They illustrate ideas; none of them shows real data,
// and none of them compares income.

/** A deterministic scatter of faint dots: many people passing by. */
function PassingDots() {
  // A fixed pseudo-random sequence, so the drawing is the same on every visit.
  let seed = 7
  const rand = () => {
    seed = (seed * 16807) % 2147483647
    return (seed - 1) / 2147483646
  }
  const dots = Array.from({ length: 140 }, () => ({ x: 2 + rand() * 96, y: 3 + rand() * 94, r: 0.8 + rand() * 0.9, o: 0.15 + rand() * 0.35 }))
  return (
    <svg viewBox="0 0 100 60" aria-hidden="true" className="h-32 w-full">
      {dots.map((d, i) => (
        <circle key={i} cx={d.x} cy={d.y * 0.6} r={d.r} className="fill-ink-400" opacity={d.o} />
      ))}
    </svg>
  )
}

/** A close circle of 100 connected dots: people who keep showing up. */
function CircleDots() {
  const dots = Array.from({ length: 100 }, (_, i) => {
    const ring = i < 16 ? 12 : i < 44 ? 20 : 28
    const inRing = i < 16 ? i : i < 44 ? i - 16 : i - 44
    const count = i < 16 ? 16 : i < 44 ? 28 : 56
    const a = (inRing / count) * Math.PI * 2 + ring
    return { x: 50 + Math.cos(a) * ring * 1.15, y: 30 + Math.sin(a) * ring * 0.9 }
  })
  return (
    <svg viewBox="0 0 100 60" aria-hidden="true" className="h-32 w-full">
      {dots.slice(0, 16).map((d, i) => (
        <line key={`l${i}`} x1={50} y1={30} x2={d.x} y2={d.y} className="stroke-brand-300" strokeWidth={0.3} />
      ))}
      {dots.map((d, i) => (
        <circle key={i} cx={d.x} cy={d.y} r={1.25} className="fill-brand-600" />
      ))}
      <circle cx={50} cy={30} r={3.6} className="fill-spark-400" />
    </svg>
  )
}

export function AttentionAndRelationships() {
  return (
    <figure data-testid="attention-diagram" className="overflow-hidden rounded-[28px] bg-white ring-1 ring-ink-100">
      <div className="grid sm:grid-cols-2">
        <div className="border-b border-ink-100 p-6 sm:border-b-0 sm:border-r">
          <p className="inline-flex items-center gap-2 text-[12px] font-semibold uppercase tracking-wide text-ink-500">
            <Eye className="h-4 w-4" aria-hidden="true" /> Attention
          </p>
          <p className="mt-2 font-display text-2xl font-bold text-ink-900">100,000 views</p>
          <PassingDots />
          <p className="text-[15px] leading-relaxed text-ink-600">How many people see your work. It can be huge, and it can move on quickly.</p>
        </div>
        <div className="bg-brand-50/60 p-6">
          <p className="inline-flex items-center gap-2 text-[12px] font-semibold uppercase tracking-wide text-brand-700">
            <HeartHandshake className="h-4 w-4" aria-hidden="true" /> Relationships
          </p>
          <p className="mt-2 font-display text-2xl font-bold text-ink-900">100 people who value your work</p>
          <CircleDots />
          <p className="text-[15px] leading-relaxed text-ink-600">How many people trust you, recommend you and keep coming back.</p>
        </div>
      </div>
      <figcaption className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-ink-100 px-6 py-4 text-[14px] leading-relaxed text-ink-600">
        <span className="rounded-full border border-dashed border-ink-300 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-ink-500">Illustration</span>
        Both matter, and neither one is a promise of income. Crevant is being built to help creators grow the second kind
        alongside the first.
      </figcaption>
    </figure>
  )
}

const JOURNEY: Array<{ title: string; body: string; status: Status; icon: ReactNode }> = [
  { title: 'Create and share', body: 'Start by creating value.', status: 'pilot', icon: <PenLine className="h-5 w-5" /> },
  { title: 'Find your people', body: 'The people who genuinely appreciate what you bring.', status: 'pilot', icon: <Users className="h-5 w-5" /> },
  { title: 'Build relationships', body: 'A community where participation matters.', status: 'testing', icon: <HeartHandshake className="h-5 w-5" /> },
  { title: 'Grow toward opportunity', body: 'Tools to turn strong communities into earning opportunities.', status: 'vision', icon: <Sprout className="h-5 w-5" /> },
]

/** The journey from creating to opportunity, with each step's real status. */
export function JourneyDiagram() {
  return (
    <ol aria-label="The Crevant journey" data-testid="journey-diagram" className="relative grid gap-4 md:grid-cols-4">
      <div aria-hidden="true" className="absolute left-[12%] right-[12%] top-[34px] hidden h-0.5 bg-gradient-to-r from-brand-500 via-brand-300 to-ink-200 md:block" />
      {JOURNEY.map((step, i) => (
        <li key={step.title} className="relative flex gap-4 md:flex-col md:items-center md:text-center">
          <span
            className={clsx(
              'relative z-10 grid h-[68px] w-[68px] shrink-0 place-items-center rounded-full ring-4 ring-paper',
              step.status === 'vision' ? 'border-2 border-dashed border-ink-300 bg-white text-ink-500' : 'bg-brand-600 text-white',
            )}
          >
            {step.icon}
            <span className="absolute -right-1 -top-1 grid h-6 w-6 place-items-center rounded-full bg-ink-900 text-[12px] font-bold text-white">{i + 1}</span>
          </span>
          <div className="min-w-0 md:mt-3">
            <StatusBadge status={step.status} />
            <p className="mt-2 font-display text-lg font-bold text-ink-900">{step.title}</p>
            <p className="mt-1 text-[15px] leading-snug text-ink-600">{step.body}</p>
          </div>
        </li>
      ))}
    </ol>
  )
}
