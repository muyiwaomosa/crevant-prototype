import clsx from 'clsx'
import type { ReactNode } from 'react'
import { Gift, Heart, MessageCircle, Repeat2, Sparkles, UserPlus } from 'lucide-react'
import { DISCLOSURES, PROVISIONAL_CP_RULES } from '../claims'
import { SplitMark } from './SplitpostWordmark'

/**
 * Concept phone screens for Section 4, drawn in code rather than captured, so
 * they show the product being built for the pilot and nothing else. Every
 * screen carries a "Concept · Sample data" strip inside the frame, so the
 * label survives cropping. Sample people only (from the sample tour). No
 * currency anywhere; Connection Points are shown per creator, never as money.
 */

const SAMPLE_LABEL = `${DISCLOSURES.concept} · ${DISCLOSURES.sampleData}`

function Initials({ text, tone = 'orange', className }: { text: string; tone?: 'orange' | 'midnight' | 'plum'; className?: string }) {
  return (
    <span
      className={clsx(
        'grid shrink-0 place-items-center rounded-full font-sp-display font-black',
        tone === 'orange' && 'bg-sp-orange text-sp-midnight',
        tone === 'midnight' && 'bg-sp-midnight-raised text-white',
        tone === 'plum' && 'bg-[#5b3a7a] text-white',
        className ?? 'h-8 w-8 text-[11px]',
      )}
    >
      {text}
    </span>
  )
}

/** A phone frame with a status bar, the app bar and the sample-data strip. */
export function PhoneFrame({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="relative mx-auto w-full max-w-[250px] rounded-[38px] bg-sp-midnight p-[7px] shadow-[0_40px_70px_-30px_rgb(16_20_46/0.65)] ring-1 ring-black/40">
      <div className="relative flex aspect-[9/18.5] flex-col overflow-hidden rounded-[31px] bg-[#fbf9f6] text-sp-ink">
        <div className="flex items-center justify-between px-5 pb-1 pt-2.5 text-[10px] font-semibold">
          <span>9:41</span>
          <span className="h-[18px] w-[64px] rounded-full bg-sp-midnight" />
          <span className="flex gap-0.5">
            <span className="h-2 w-2 rounded-full bg-sp-ink/70" />
            <span className="h-2 w-3.5 rounded-sm bg-sp-ink/70" />
          </span>
        </div>
        <div className="flex items-center gap-2 border-b border-sp-ink/10 px-3.5 py-2">
          <SplitMark tone="light" className="h-4 w-4 rounded-[4px]" />
          <span className="truncate font-sp-display text-[13px] font-extrabold">{title}</span>
        </div>
        <div className="bg-sp-midnight px-3 py-1 text-center text-[9px] font-bold uppercase tracking-[0.14em] text-white">{SAMPLE_LABEL}</div>
        <div className="flex min-h-0 flex-1 flex-col gap-2.5 overflow-hidden p-3">{children}</div>
      </div>
    </div>
  )
}

function FeedPost({ who, initials, tone, minutes, text, art }: { who: string; initials: string; tone: 'orange' | 'midnight' | 'plum'; minutes: string; text: string; art: string }) {
  return (
    <div className="rounded-2xl bg-white p-2.5 ring-1 ring-sp-ink/8">
      <div className="flex items-center gap-2">
        <Initials text={initials} tone={tone} />
        <div className="min-w-0 leading-tight">
          <p className="truncate text-[11px] font-semibold">{who}</p>
          <p className="text-[9px] text-sp-muted">{minutes}</p>
        </div>
      </div>
      <p className="mt-1.5 text-[11px] leading-snug">{text}</p>
      <div className={clsx('mt-2 h-16 rounded-xl', art)} />
      <div className="mt-2 flex gap-3 text-sp-muted">
        <Heart className="h-3.5 w-3.5" />
        <MessageCircle className="h-3.5 w-3.5" />
        <Repeat2 className="h-3.5 w-3.5" />
      </div>
    </div>
  )
}

export function FeedScreen() {
  return (
    <PhoneFrame title="Following">
      <div className="flex gap-1.5 text-[10px] font-semibold">
        <span className="rounded-full bg-sp-midnight px-2.5 py-1 text-white">Following</span>
        <span className="rounded-full px-2.5 py-1 text-sp-muted ring-1 ring-sp-ink/10">Newest first</span>
      </div>
      <FeedPost
        who="Priya Raman"
        initials="PR"
        tone="orange"
        minutes="4 min ago"
        text="Shipped the offline mode. Here's what broke first."
        art="bg-[linear-gradient(135deg,#1b2152_0_55%,#ff6a2b_55%_100%)]"
      />
      <FeedPost
        who="Marcus Bell"
        initials="MB"
        tone="plum"
        minutes="1 hr ago"
        text="Late night session. This one started as a voice memo."
        art="bg-[repeating-linear-gradient(90deg,#e7dfd2_0_6px,#d9cfbf_6px_10px)]"
      />
    </PhoneFrame>
  )
}

export function InsightsScreen() {
  const supporters: Array<[string, string, 'orange' | 'midnight' | 'plum', string]> = [
    ['Leo', 'LE', 'midnight', 'Brought 2 new followers'],
    ['Ana', 'AN', 'plum', 'Comments on every build log'],
    ['Sam', 'SA', 'orange', 'Shared your last 3 posts'],
  ]
  return (
    <PhoneFrame title="Your supporters">
      <div className="rounded-2xl bg-sp-midnight p-3 text-white">
        <p className="text-[9px] font-bold uppercase tracking-[0.12em] text-sp-muted-on-dark">New followers from referrals</p>
        <div className="mt-2 flex h-14 items-end gap-1.5">
          {[30, 45, 35, 60, 50, 80, 95].map((h, i) => (
            <span key={i} className={clsx('flex-1 rounded-t-md', i === 6 ? 'bg-sp-orange' : 'bg-white/25')} style={{ height: `${h}%` }} />
          ))}
        </div>
        <p className="mt-1.5 text-[9px] text-sp-muted-on-dark">This week, from fans who shared your posts</p>
      </div>
      <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-sp-muted">Top supporters</p>
      {supporters.map(([name, initials, tone, note]) => (
        <div key={name} className="flex items-center gap-2 rounded-xl bg-white p-2 ring-1 ring-sp-ink/8">
          <Initials text={initials} tone={tone} />
          <div className="min-w-0 leading-tight">
            <p className="text-[11px] font-semibold">{name}</p>
            <p className="truncate text-[9px] text-sp-muted">{note}</p>
          </div>
          <UserPlus className="ml-auto h-3.5 w-3.5 shrink-0 text-sp-orange-text" />
        </div>
      ))}
    </PhoneFrame>
  )
}

export function RecognitionScreen() {
  const show = ['verified_referral', 'follow', 'comment', 'like'] as const
  const rows = show.map((a) => PROVISIONAL_CP_RULES.find((r) => r.action === a)!)
  const total = rows.reduce((n, r) => n + r.points, 0)
  return (
    <PhoneFrame title="CP with Priya">
      <div className="flex items-center gap-3 rounded-2xl bg-white p-3 ring-1 ring-sp-ink/8">
        <div className="relative grid h-14 w-14 shrink-0 place-items-center rounded-full bg-[conic-gradient(var(--color-sp-orange)_0_70%,#ece5da_70%_100%)]">
          <span className="grid h-11 w-11 place-items-center rounded-full bg-white font-sp-display text-[13px] font-black">{total}</span>
        </div>
        <div className="min-w-0 leading-tight">
          <p className="text-[11px] font-semibold">Connection Points with Priya</p>
          <p className="mt-0.5 text-[9px] text-sp-muted">Recognition for your support. No cash value.</p>
        </div>
      </div>
      <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-sp-muted">Recognized for</p>
      {rows.map((r) => (
        <div key={r.action} className="flex items-center gap-2 rounded-xl bg-white px-2.5 py-2 ring-1 ring-sp-ink/8">
          <Sparkles className="h-3.5 w-3.5 shrink-0 text-sp-orange-text" />
          <span className="truncate text-[11px]">{r.title}</span>
          <span className="ml-auto shrink-0 font-sp-display text-[11px] font-black text-sp-orange-text">+{r.points}</span>
        </div>
      ))}
      <p className="text-[9px] leading-snug text-sp-muted">Values shown are provisional samples, not yet validated.</p>
    </PhoneFrame>
  )
}

export function PerksScreen() {
  const perks: Array<[string, number, boolean]> = [
    ['Thank you in the build log', 15, true],
    ['Early look at the next build', 40, false],
    ['Supporter badge on your profile', 60, false],
  ]
  return (
    <PhoneFrame title="Priya's perks">
      <div className="rounded-2xl bg-sp-midnight p-3 text-white">
        <Gift className="h-5 w-5 text-sp-orange" />
        <p className="mt-2 text-[11px] font-semibold leading-snug">Perks Priya offers her supporters. Unlocked with CP you earn with her.</p>
      </div>
      {perks.map(([title, cost, ready]) => (
        <div key={title} className="rounded-xl bg-white p-2.5 ring-1 ring-sp-ink/8">
          <p className="text-[11px] font-semibold leading-snug">{title}</p>
          <div className="mt-1.5 flex items-center justify-between">
            <span className="text-[10px] text-sp-muted">{cost} CP</span>
            <span
              className={clsx(
                'rounded-full px-2.5 py-0.5 text-[10px] font-bold',
                ready ? 'bg-sp-orange text-sp-midnight' : 'bg-sp-ink/5 text-sp-muted',
              )}
            >
              {ready ? 'Unlock' : 'Keep going'}
            </span>
          </div>
        </div>
      ))}
    </PhoneFrame>
  )
}
