import clsx from 'clsx'
import { Heart, MessageCircle, PenLine, Repeat2 } from 'lucide-react'
import { HOMEPAGE_COPY } from '../copy'
import { SplitMark } from '../ui/SplitpostWordmark'

const copy = HOMEPAGE_COPY.solution

/** One small illustration per step. Decorative: each step's words carry the meaning. */
function StepArt({ step }: { step: number }) {
  if (step === 0) {
    return (
      <div aria-hidden="true" className="relative h-24 w-full max-w-[220px] rounded-2xl bg-white p-3 text-sp-ink shadow-[0_20px_40px_-18px_rgb(0_0_0/0.7)]">
        <div className="flex items-center gap-2">
          <span className="h-6 w-6 rounded-full bg-sp-orange" />
          <span className="h-2 w-20 rounded-full bg-sp-ink/15" />
        </div>
        <span className="mt-3 block h-2 w-[85%] rounded-full bg-sp-ink/10" />
        <span className="mt-1.5 block h-2 w-[60%] rounded-full bg-sp-ink/10" />
        <span className="absolute -right-3 -top-3 grid h-9 w-9 place-items-center rounded-full bg-sp-orange text-sp-midnight shadow-lg">
          <PenLine className="h-4 w-4" />
        </span>
      </div>
    )
  }
  if (step === 1) {
    return (
      <div aria-hidden="true" className="flex h-24 items-center gap-3">
        {[Heart, MessageCircle, Repeat2].map((Icon, i) => (
          <span
            key={i}
            className={clsx(
              'grid h-14 w-14 place-items-center rounded-2xl ring-1 ring-white/15',
              i === 2 ? 'bg-sp-orange text-sp-midnight' : 'bg-white/8 text-white',
            )}
          >
            <Icon className="h-6 w-6" />
          </span>
        ))}
      </div>
    )
  }
  return (
    <div aria-hidden="true" className="flex h-24 items-center">
      <SplitMark className="h-20 w-20 rounded-[20px]" />
    </div>
  )
}

/**
 * Section 3: POST. SUPPORT. SPLIT. Three steps in order, then the two panels
 * that keep the pilot's noncash recognition apart from the future vision.
 * Both panels are always visible, side by side on wide screens.
 */
export function Solution() {
  return (
    <section id="solution" aria-labelledby="solution-title" className="relative isolate scroll-mt-16 overflow-hidden bg-sp-midnight text-white">
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10 bg-[linear-gradient(118deg,rgb(255_255_255/0.035)_0_38%,transparent_38%_100%)]" />
      <div className="mx-auto max-w-6xl px-4 py-18 sm:px-6 sm:py-24 lg:py-28">
        <h2
          id="solution-title"
          className="font-sp-display text-[clamp(2.4rem,9vw,5.6rem)] font-black uppercase leading-[0.92] tracking-[-0.02em] [font-stretch:112%]"
        >
          {copy.steps.map((s, i) => (
            <span key={s.word}>
              {i > 0 && ' '}
              <span className={clsx('inline-block', i === 2 && 'text-sp-orange')}>{s.word}</span>
            </span>
          ))}
        </h2>

        <ol data-testid="solution-steps" className="relative mt-12 grid gap-10 md:grid-cols-3 md:gap-8 lg:mt-16">
          {/* The rail the three steps sit on (wide screens). */}
          <span aria-hidden="true" className="absolute left-0 right-0 top-12 hidden h-px bg-[linear-gradient(90deg,rgb(255_255_255/0.25),var(--color-sp-orange))] md:block" />
          {copy.steps.map((s, i) => (
            <li key={s.word} className="relative flex flex-col gap-5">
              <StepArt step={i} />
              <div>
                <p className="font-sp-display text-sm font-extrabold uppercase tracking-[0.16em] text-sp-muted-on-dark">
                  <span className="sr-only">Step {i + 1}: </span>
                  {s.word}
                </p>
                <p className="mt-2 font-sp-display text-2xl font-extrabold leading-tight tracking-[-0.01em] sm:text-[1.7rem]">{s.line}</p>
              </div>
            </li>
          ))}
        </ol>

        <div className="mt-14 grid gap-4 md:grid-cols-2 lg:mt-20">
          <div data-panel="now" className="rounded-[26px] bg-white/[0.06] p-6 ring-1 ring-white/15 sm:p-8">
            <span className="inline-block rounded-full bg-white px-3 py-1 text-[12px] font-bold uppercase tracking-[0.12em] text-sp-midnight">{copy.now.badge}</span>
            <h3 className="mt-4 font-sp-display text-2xl font-extrabold tracking-[-0.01em]">{copy.now.title}</h3>
            <p className="mt-2 text-[1.05rem] leading-relaxed text-sp-muted-on-dark">{copy.now.body}</p>
          </div>
          <div data-panel="later" className="rounded-[26px] p-6 ring-2 ring-sp-orange/70 sm:p-8">
            <span className="inline-block rounded-full px-3 py-1 text-[12px] font-bold uppercase tracking-[0.12em] text-sp-orange ring-1 ring-sp-orange">
              {copy.later.badge}
            </span>
            <h3 className="mt-4 font-sp-display text-2xl font-extrabold tracking-[-0.01em]">{copy.later.title}</h3>
            <p className="mt-2 text-[1.05rem] leading-relaxed text-sp-muted-on-dark">{copy.later.body}</p>
          </div>
        </div>
      </div>
    </section>
  )
}
