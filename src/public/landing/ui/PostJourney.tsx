import clsx from 'clsx'
import type { ReactNode } from 'react'
import { Heart, MessageCircle, Share2 } from 'lucide-react'
import { HOMEPAGE_COPY } from '../copy'

/**
 * The WHY section's post journey: one sample post (Priya's) told in four
 * steps. Each step has a short title and line (the story, read by everyone)
 * and a small drawing of what happened (decorative, so it's hidden from
 * screen readers and the line carries the meaning). On phones the steps run
 * down a vertical line; from 1024px they run across.
 */

const steps = HOMEPAGE_COPY.why.steps

type Tone = 'priya' | 'ana' | 'leo' | 'friend'

export function Avatar({ initials, tone, className }: { initials: string; tone: Tone; className?: string }) {
  return (
    <span
      className={clsx(
        'grid shrink-0 place-items-center rounded-full font-sp-display font-black',
        tone === 'priya' && 'bg-sp-orange text-sp-midnight',
        tone === 'ana' && 'bg-[#5b3a7a] text-white',
        tone === 'leo' && 'bg-sp-midnight-raised text-white',
        tone === 'friend' && 'bg-[#e7dfd2] text-sp-ink ring-2 ring-white',
        className ?? 'h-8 w-8 text-[11px]',
      )}
    >
      {initials}
    </span>
  )
}

/** The sample post's image: the product's own diagonal, nothing photographic. */
export function PostArt({ className }: { className?: string }) {
  return <span className={clsx('block rounded-xl bg-[linear-gradient(135deg,var(--color-sp-midnight-raised)_0_58%,var(--color-sp-orange)_58%_100%)]', className)} />
}

function Card({ children, dark }: { children: ReactNode; dark?: boolean }) {
  return (
    <div
      aria-hidden="true"
      className={clsx(
        'rounded-2xl p-3.5 shadow-[0_18px_40px_-26px_rgb(20_24_51/0.45)] ring-1',
        dark ? 'bg-sp-midnight text-white ring-white/10' : 'bg-white text-sp-ink ring-sp-ink/8',
      )}
    >
      {children}
    </div>
  )
}

function PriyaPosts() {
  return (
    <Card>
      <div className="flex items-center gap-2.5">
        <Avatar initials="PR" tone="priya" />
        <div className="min-w-0 leading-tight">
          <p className="text-[13px] font-bold">Priya Raman</p>
          <p className="text-[11px] text-sp-muted">Indie app maker · Tue 9:12 pm</p>
        </div>
        <span className="ml-auto rounded-full bg-sp-neutral px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-[0.08em] text-sp-muted">Sample</span>
      </div>
      <p className="mt-2.5 text-sm leading-snug">Shipped the offline mode. Here’s what broke first.</p>
      <PostArt className="mt-2.5 h-16" />
    </Card>
  )
}

function AnaJoinsIn() {
  return (
    <Card>
      <div className="flex gap-2.5">
        <Avatar initials="AN" tone="ana" />
        <p className="rounded-xl bg-sp-neutral px-3 py-2 text-[13px] leading-snug">
          <b>Ana</b> · first comment
          <br />
          This fixed my sync bug too. Sharing it with my team.
        </p>
      </div>
      <p className="mt-2.5 flex items-center gap-2 rounded-xl border border-dashed border-sp-orange px-2.5 py-2 text-xs font-bold text-sp-orange-text">
        <Share2 className="h-3.5 w-3.5" />
        Shared with her team of 14
      </p>
    </Card>
  )
}

function LeoRecommends() {
  return (
    <Card>
      <div className="flex items-start gap-2.5">
        <Avatar initials="LE" tone="leo" />
        <p className="rounded-xl bg-sp-midnight px-3 py-2 text-[13px] leading-snug text-white">You need to follow her. Best build logs anywhere.</p>
      </div>
      <div className="mt-2.5 flex items-center gap-2">
        <span className="flex">
          <Avatar initials="JK" tone="friend" className="h-6 w-6 text-[9px]" />
          <Avatar initials="MT" tone="friend" className="-ml-1.5 h-6 w-6 text-[9px]" />
          <Avatar initials="SO" tone="friend" className="-ml-1.5 h-6 w-6 text-[9px]" />
        </span>
        <span className="text-xs font-bold">3 friends followed Priya</span>
      </div>
      <span className="mt-2 inline-flex rounded-full bg-[#ffe2d4] px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-[0.06em] text-sp-midnight">Verified referral</span>
    </Card>
  )
}

function PostTakesOff() {
  const bars = [14, 22, 38, 61, 100]
  return (
    <Card dark>
      <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-sp-muted-on-dark">Priya’s post this week</p>
      <div className="mt-2.5 flex h-16 items-end gap-1.5">
        {bars.map((h, i) => (
          <span key={i} className={clsx('flex-1 rounded-t', i === bars.length - 1 ? 'bg-sp-orange' : 'bg-white/25')} style={{ height: `${h}%` }} />
        ))}
      </div>
      <div className="mt-3 flex flex-wrap gap-1.5 text-[11px] font-bold">
        <span className="inline-flex items-center gap-1 rounded-full bg-white/12 px-2.5 py-1">
          <Heart className="h-3 w-3" /> Most liked
        </span>
        <span className="inline-flex items-center gap-1 rounded-full bg-white/12 px-2.5 py-1">
          <MessageCircle className="h-3 w-3" /> Most discussed
        </span>
      </div>
    </Card>
  )
}

const DRAWINGS = [PriyaPosts, AnaJoinsIn, LeoRecommends, PostTakesOff]

export function PostJourney() {
  return (
    <ol data-testid="post-journey" aria-label="One post, four steps" className="relative grid gap-9 sm:grid-cols-2 sm:gap-x-6 sm:gap-y-10 lg:grid-cols-4 lg:gap-6">
      {/* The path the post travels: down on phones, across on wide screens. */}
      <span
        aria-hidden="true"
        className="absolute bottom-6 left-[15px] top-4 w-0.5 bg-[repeating-linear-gradient(180deg,var(--color-sp-orange)_0_7px,transparent_7px_13px)] sm:hidden"
      />
      <span
        aria-hidden="true"
        className="absolute left-4 right-4 top-[15px] hidden h-0.5 bg-[repeating-linear-gradient(90deg,var(--color-sp-orange)_0_8px,transparent_8px_14px)] lg:block"
      />
      {steps.map((step, i) => {
        const Drawing = DRAWINGS[i]
        const last = i === steps.length - 1
        return (
          <li key={step.title} data-step={i + 1} className="relative flex min-w-0 flex-col gap-3.5 pl-12 sm:pl-0">
            <span
              aria-hidden="true"
              className={clsx(
                'absolute left-0 top-0 grid h-8 w-8 place-items-center rounded-full font-sp-display text-sm font-black sm:static',
                last ? 'bg-sp-orange text-sp-midnight' : 'bg-sp-midnight text-white',
              )}
            >
              {i + 1}
            </span>
            <h3 className="font-sp-display text-2xl font-black tracking-[-0.01em]">{step.title}</h3>
            <Drawing />
            <p className="text-[15px] leading-relaxed text-sp-muted">{step.line}</p>
          </li>
        )
      })}
    </ol>
  )
}
