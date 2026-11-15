import clsx from 'clsx'
import type { ReactNode } from 'react'
import { Check, Gift, LineChart, Sparkles, Store, UserRound, Users } from 'lucide-react'
import { HOMEPAGE_COPY } from '../copy'
import { Photo } from '../ui/Photo'
import { Avatar, SamplePost } from '../ui/PostJourney'

const copy = HOMEPAGE_COPY.what

function Outcome({ label, points, photos }: { label: string; points: readonly string[]; photos: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-5 rounded-[28px] bg-sp-midnight-raised p-6 sm:flex-row sm:items-center sm:p-7">
      <div aria-hidden="true" className="flex shrink-0">
        {photos}
      </div>
      <div className="min-w-0">
        <h3 className="font-sp-display text-[13px] font-extrabold uppercase tracking-[0.16em] text-sp-orange">{label}</h3>
        <ul className="mt-3 space-y-2">
          {points.map((p) => (
            <li key={p} className="flex gap-2.5 text-[15px] leading-snug text-white">
              <Check aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-sp-orange" />
              {p}
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}

const PhotoDisc = ({ children, className }: { children: ReactNode; className?: string }) => (
  <span className={clsx('relative block h-20 w-20 overflow-hidden rounded-full bg-sp-orange ring-4 ring-sp-midnight-raised', className)}>{children}</span>
)

/** One branch of a split: an arrow from the post to whoever receives value. */
function Branch({ vision, icon, who, what, line }: { vision?: boolean; icon: ReactNode; who: ReactNode; what?: string; line: string }) {
  return (
    <li className="relative pl-9">
      <span
        aria-hidden="true"
        className={clsx('absolute left-0 top-7 h-0 w-7 border-t-2', vision ? 'border-dashed border-white/70' : 'border-sp-orange')}
      />
      <span
        aria-hidden="true"
        className={clsx(
          'absolute left-[22px] top-[23px] h-0 w-0 border-y-[5px] border-l-[8px] border-y-transparent',
          vision ? 'border-l-white/70' : 'border-l-sp-orange',
        )}
      />
      <div className={clsx('rounded-2xl p-4', vision ? 'border border-dashed border-white/30 bg-white/[0.04]' : 'bg-sp-midnight ring-1 ring-white/10')}>
        <p className="flex flex-wrap items-center gap-2 font-sp-display text-[15px] font-extrabold">
          {icon}
          {who}
        </p>
        {what && <p className="mt-1.5 text-[15px] font-bold text-sp-orange">{what}</p>}
        <p className="mt-1 text-sm leading-relaxed text-sp-muted-on-dark">{line}</p>
      </div>
    </li>
  )
}

/** The trunk the branches hang from: solid for what the pilot does, dashed for the vision. */
function Trunk({ vision, children }: { vision?: boolean; children: ReactNode }) {
  return (
    <ul className={clsx('mt-4 space-y-3 border-l-2 pt-2', vision ? 'border-dashed border-white/70' : 'border-sp-orange')}>{children}</ul>
  )
}

const iconClass = 'h-4 w-4 shrink-0 text-sp-orange'

/**
 * Section 4, WHAT: the outcome we want, then the split itself. The pilot
 * (recognition and perks, solid orange) and the vision (eligible ad revenue,
 * dashed, badged) are always both on screen and never look alike. No
 * percentages, and no proportional widths: how the vision would be divided
 * hasn't been decided.
 */
export function What() {
  const { now, later } = copy
  return (
    <section id="what" aria-labelledby="what-title" className="scroll-mt-16 bg-sp-midnight text-white">
      <div className="mx-auto max-w-6xl px-4 py-18 sm:px-6 sm:py-24 lg:py-28">
        <p className="font-sp-display text-[13px] font-extrabold uppercase tracking-[0.18em] text-sp-orange">{copy.eyebrow}</p>
        <h2
          id="what-title"
          className="mt-4 max-w-5xl font-sp-display text-[clamp(2.1rem,7vw,4.5rem)] font-black leading-[0.98] tracking-[-0.02em] [font-stretch:108%]"
        >
          What if every successful post created <span className="text-sp-orange">more winners?</span>
        </h2>
        <p className="mt-5 max-w-2xl text-lg leading-relaxed text-sp-muted-on-dark sm:text-xl">{copy.intro}</p>

        <div data-testid="outcomes" className="mt-12 grid gap-5 lg:grid-cols-2">
          <Outcome
            {...copy.outcomes.creator}
            photos={
              <PhotoDisc>
                <Photo id="creatorAtWork" className="h-full w-full origin-[80%_18%] scale-[1.9] object-cover object-[80%_18%]" />
              </PhotoDisc>
            }
          />
          <Outcome
            {...copy.outcomes.fan}
            photos={
              <>
                <PhotoDisc>
                  <Photo id="fanGlasses" className="absolute -bottom-1 left-1/2 h-[118%] w-auto max-w-none -translate-x-1/2" />
                </PhotoDisc>
                <PhotoDisc className="-ml-5 bg-[#ffd9c7]">
                  <Photo id="fanBraids" className="absolute -bottom-1 left-1/2 h-[112%] w-auto max-w-none -translate-x-[42%]" />
                </PhotoDisc>
              </>
            }
          />
        </div>

        <div className="mt-8 grid gap-6 lg:grid-cols-2">
          <section
            data-panel="now"
            aria-labelledby="split-now"
            className="rounded-[28px] bg-sp-midnight-raised p-6 ring-2 ring-sp-orange sm:p-8"
          >
            <span className="inline-flex rounded-full bg-sp-orange px-3 py-1.5 text-xs font-extrabold uppercase tracking-[0.12em] text-sp-midnight">{now.badge}</span>
            <h3 id="split-now" className="mt-4 font-sp-display text-3xl font-black tracking-[-0.01em]">
              {now.title}
            </h3>
            <div aria-hidden="true" className="mt-6 max-w-[300px]">
              <SamplePost compact />
            </div>
            <Trunk>
              <Branch icon={<LineChart className={iconClass} />} who={<><Avatar initials="PR" tone="priya" className="h-6 w-6 text-[9px]" /> {now.flows[0].to}</>} what={now.flows[0].what} line={now.flows[0].line} />
              <Branch
                icon={<Sparkles className={iconClass} />}
                who={<><Avatar initials="AN" tone="ana" className="h-6 w-6 text-[9px]" /> <Avatar initials="LE" tone="leo-light" className="-ml-3 h-6 w-6 text-[9px]" /> {now.flows[1].to}</>}
                what={now.flows[1].what}
                line={now.flows[1].line}
              />
              <Branch
                icon={<Gift className={iconClass} />}
                who={<><Avatar initials="AN" tone="ana" className="h-6 w-6 text-[9px]" /> <Avatar initials="LE" tone="leo-light" className="-ml-3 h-6 w-6 text-[9px]" /> {now.flows[2].to}</>}
                what={now.flows[2].what}
                line={now.flows[2].line}
              />
            </Trunk>
            <p data-testid="pilot-note" className="mt-6 border-t border-white/10 pt-4 text-sm leading-relaxed text-sp-muted-on-dark">
              {now.note}
            </p>
          </section>

          <section
            data-panel="later"
            aria-labelledby="split-later"
            className="rounded-[28px] border-2 border-dashed border-white/35 p-6 sm:p-8"
          >
            <span className="inline-flex rounded-full border-[1.5px] border-white px-3 py-1 text-xs font-extrabold uppercase tracking-[0.12em]">{later.badge}</span>
            <h3 id="split-later" className="mt-4 font-sp-display text-3xl font-black tracking-[-0.01em]">
              {later.title}
            </h3>
            <p className="mt-6 inline-flex max-w-[300px] rounded-2xl border border-dashed border-white/40 px-4 py-3 font-sp-display text-[15px] font-extrabold">
              {later.source}
            </p>
            <Trunk vision>
              <Branch vision icon={<UserRound className={iconClass} />} who={later.flows[0].to} line={later.flows[0].line} />
              <Branch vision icon={<Users className={iconClass} />} who={later.flows[1].to} line={later.flows[1].line} />
              <Branch vision icon={<Store className={iconClass} />} who={later.flows[2].to} line={later.flows[2].line} />
            </Trunk>
            <p className="mt-6 text-[15px] leading-relaxed text-white/90">{later.body}</p>
            <p data-testid="vision-note" className="mt-3 border-t border-white/10 pt-4 text-sm leading-relaxed text-sp-muted-on-dark">
              {later.note}
            </p>
          </section>
        </div>
      </div>
    </section>
  )
}
