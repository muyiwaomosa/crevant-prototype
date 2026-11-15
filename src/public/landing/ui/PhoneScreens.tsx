import clsx from 'clsx'
import type { ReactNode } from 'react'
import { Gift, Heart, MessageCircle, Repeat2, Search, Send, Sparkles, UserPlus } from 'lucide-react'
import { PROVISIONAL_CP_RULES } from '../claims'
import { HOMEPAGE_COPY } from '../copy'
import { SplitMark } from './SplitpostWordmark'
import { Avatar, PostArt } from './SamplePost'

/**
 * Concept phone screens, drawn in code so they show only what's being built
 * for the pilot. Each carries "Concept · Sample data" inside the frame, so the
 * label survives cropping. Sample people only, no currency anywhere, and
 * Connection Points are shown per creator with their provisional label.
 *
 *   ALTERNATIVE  FollowingScreen, DiscoverScreen, InsightsScreen
 *   CONNECTION   SupportScreen, RecognitionScreen
 */

const LABEL = HOMEPAGE_COPY.alternative.mockupLabel
const post = HOMEPAGE_COPY.post

export function PhoneFrame({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="relative mx-auto w-full max-w-[260px] rounded-[40px] bg-sp-teal p-[7px] shadow-[0_40px_70px_-30px_rgb(10_30_28/0.6)] ring-1 ring-black/40">
      <div className="relative flex aspect-[9/18.5] flex-col overflow-hidden rounded-[33px] bg-[#fbf8f2] text-sp-ink">
        <div aria-hidden="true" className="flex items-center justify-between px-5 pb-1 pt-2.5 text-[10px] font-semibold">
          <span>9:41</span>
          <span className="h-[18px] w-[64px] rounded-full bg-sp-teal" />
          <span className="flex gap-0.5">
            <span className="h-2 w-2 rounded-full bg-sp-ink/70" />
            <span className="h-2 w-3.5 rounded-sm bg-sp-ink/70" />
          </span>
        </div>
        <div className="flex items-center gap-2 border-b border-sp-ink/10 px-3.5 py-2">
          <SplitMark tone="light" className="h-4 w-4 rounded-[4px]" />
          <span className="truncate font-sp-display text-[13px] font-extrabold">{title}</span>
        </div>
        <div data-testid="mockup-label" className="bg-sp-teal px-3 py-1 text-center text-[9px] font-bold uppercase tracking-[0.14em] text-sp-cream">
          {LABEL}
        </div>
        <div className="flex min-h-0 flex-1 flex-col gap-2.5 overflow-hidden p-3">{children}</div>
      </div>
    </div>
  )
}

const card = 'rounded-2xl bg-white p-2.5 ring-1 ring-sp-ink/8'
const kicker = 'text-[9px] font-bold uppercase tracking-[0.12em] text-sp-muted'

function Engagement() {
  return (
    <div className="mt-1.5 flex gap-3 text-[10px] font-semibold text-sp-muted">
      <span className="inline-flex items-center gap-1">
        <Heart aria-hidden="true" className="h-3 w-3 fill-sp-green text-sp-green" /> {post.likes}
      </span>
      <span className="inline-flex items-center gap-1">
        <MessageCircle aria-hidden="true" className="h-3 w-3" /> {post.comments}
      </span>
      <span className="inline-flex items-center gap-1">
        <Repeat2 aria-hidden="true" className="h-3 w-3" /> {post.reposts}
      </span>
    </div>
  )
}

/** ALTERNATIVE: the Following feed, newest first, from people you chose. */
export function FollowingScreen() {
  return (
    <PhoneFrame title="Following">
      <p className={kicker}>Newest first · people you follow</p>
      <div className={card}>
        <div className="flex items-center gap-2">
          <Avatar initials="PR" tone="priya" className="h-7 w-7 text-[10px]" />
          <div className="leading-tight">
            <p className="text-[11px] font-bold">{post.author}</p>
            <p className="text-[9px] text-sp-muted">
              {post.role} · {post.time}
            </p>
          </div>
        </div>
        <p className="mt-2 line-clamp-3 text-[11px] leading-snug">{post.text}</p>
        <PostArt className="mt-2 h-[4.25rem]" />
        <Engagement />
      </div>
      <div className={clsx(card, 'flex items-center gap-2')}>
        <Avatar initials="DM" tone="leo" className="h-7 w-7 text-[10px]" />
        <div className="min-w-0 leading-tight">
          <p className="text-[11px] font-bold">Dele M.</p>
          <p className="truncate text-[9px] text-sp-muted">Woodworker · 5h · New joinery tutorial</p>
        </div>
      </div>
    </PhoneFrame>
  )
}

/** ALTERNATIVE: Discover, matched by the topics someone chose, not engagement. */
export function DiscoverScreen() {
  const topics = ['Running', 'Fitness', 'Wellness', 'Food']
  const people: Array<[string, 'priya' | 'ana' | 'leo', string, string]> = [
    ['PR', 'priya', 'Priya Raman', 'Running coach · drills and recovery'],
    ['AN', 'ana', 'Ana Okafor', 'Physio · injury-free training'],
    ['LE', 'leo', 'Leo Park', 'Home cook · fuel for long runs'],
  ]
  return (
    <PhoneFrame title="Discover">
      <div className={clsx(card, 'flex items-center gap-1.5 py-2 text-[10px] text-sp-muted')}>
        <Search aria-hidden="true" className="h-3 w-3" /> Search people and topics
      </div>
      <div className="flex flex-wrap gap-1.5">
        {topics.map((t, i) => (
          <span key={t} className={clsx('rounded-full px-2 py-1 text-[10px] font-bold', i < 2 ? 'bg-sp-green text-sp-ink' : 'bg-white text-sp-muted ring-1 ring-sp-ink/10')}>
            {t}
          </span>
        ))}
      </div>
      <p className={kicker}>Matches your interests</p>
      {people.map(([initials, tone, name, line]) => (
        <div key={name} className={clsx(card, 'flex items-center gap-2')}>
          <Avatar initials={initials} tone={tone} className="h-7 w-7 text-[10px]" />
          <div className="min-w-0 leading-tight">
            <p className="text-[11px] font-bold">{name}</p>
            <p className="truncate text-[9px] text-sp-muted">{line}</p>
          </div>
          <span className="ml-auto shrink-0 rounded-full px-2 py-1 text-[9px] font-extrabold ring-1 ring-sp-teal">Follow</span>
        </div>
      ))}
    </PhoneFrame>
  )
}

/** ALTERNATIVE: who engages with a creator's work and who helps it reach new people. */
export function InsightsScreen() {
  const bars = [10, 18, 34, 62, 100]
  return (
    <PhoneFrame title="Your community">
      <div className="rounded-2xl bg-sp-teal p-3 text-sp-cream">
        <p className="text-[9px] font-bold uppercase tracking-[0.12em] text-sp-muted-on-dark">Your calf drill post</p>
        <div aria-hidden="true" className="mt-2 flex h-14 items-end gap-1.5">
          {bars.map((h, i) => (
            <span key={i} className={clsx('flex-1 rounded-t', i === bars.length - 1 ? 'bg-sp-green' : 'bg-white/25')} style={{ height: `${h}%` }} />
          ))}
        </div>
        <p className="mt-1.5 text-[10px] text-sp-muted-on-dark">New followers from people who shared it</p>
      </div>
      <p className={kicker}>Top supporters</p>
      <div className={clsx(card, 'flex items-center gap-2')}>
        <Avatar initials="LE" tone="leo" />
        <div className="min-w-0 leading-tight">
          <p className="text-[11px] font-bold">Leo</p>
          <p className="text-[9px] text-sp-muted">Shared with his running club</p>
        </div>
        <UserPlus aria-hidden="true" className="ml-auto h-3.5 w-3.5 shrink-0 text-sp-green-text" />
      </div>
      <div className={clsx(card, 'flex items-center gap-2')}>
        <Avatar initials="AN" tone="ana" />
        <div className="min-w-0 leading-tight">
          <p className="text-[11px] font-bold">Ana</p>
          <p className="text-[9px] text-sp-muted">Tried the drill · thoughtful comment</p>
        </div>
        <MessageCircle aria-hidden="true" className="ml-auto h-3.5 w-3.5 shrink-0 text-sp-green-text" />
      </div>
      <span className="mt-auto flex items-center justify-center gap-1.5 rounded-full py-2 text-center text-[11px] font-extrabold ring-[1.5px] ring-sp-teal">
        <Send aria-hidden="true" className="h-3 w-3" /> Say thanks
      </span>
    </PhoneFrame>
  )
}

/** CONNECTION: Ana takes part, Leo brings new people in. */
export function SupportScreen() {
  return (
    <PhoneFrame title="Priya’s post">
      <div className={clsx(card, 'text-[11px] leading-snug')}>
        <b>{post.author}</b> <span className="line-clamp-2">{post.text}</span>
        <Engagement />
      </div>
      <div className="flex gap-2">
        <Avatar initials="AN" tone="ana" className="h-7 w-7 text-[10px]" />
        <p className={clsx(card, 'flex-1 text-[11px] leading-snug')}>
          <b>Ana</b> Tried it before my run today and my shins felt better. Does it help after a run too?
        </p>
      </div>
      <div className="rounded-2xl bg-sp-teal p-3 text-sp-cream">
        <p className="flex items-center gap-1 text-[9px] font-bold uppercase tracking-[0.12em] text-sp-muted-on-dark">
          <Repeat2 aria-hidden="true" className="h-3 w-3" /> Leo is sharing
        </p>
        <p className="mt-1 text-[12px] font-bold">Share with your link</p>
        <p className="mt-1 text-[10px] leading-snug text-sp-muted-on-dark">When people follow Priya through it, she can see you helped.</p>
        <p className="mt-2 truncate rounded-lg bg-white/10 px-2 py-1.5 font-mono text-[10px]">splitpost.example/r/leo-priya</p>
      </div>
      <p className="text-[9px] leading-snug text-sp-muted">Sharing alone earns nothing. A referral counts once a new follow is verified.</p>
    </PhoneFrame>
  )
}

/** CONNECTION: Connection Points with Priya, and a perk she offers. */
export function RecognitionScreen() {
  const rows = (['verified_referral', 'follow', 'comment'] as const).map((a) => PROVISIONAL_CP_RULES.find((r) => r.action === a)!)
  const total = rows.reduce((n, r) => n + r.points, 0)
  return (
    <PhoneFrame title="Leo · with Priya">
      <div className={clsx(card, 'flex items-center gap-2.5')}>
        <span className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-sp-gold">
          <span className="grid h-9 w-9 place-items-center rounded-full bg-white font-sp-display text-[13px] font-black">{total}</span>
        </span>
        <div className="leading-tight">
          <p className="text-[11px] font-bold">Connection Points with Priya</p>
          <p className="mt-0.5 text-[9px] text-sp-muted">No cash value. Only for Priya.</p>
        </div>
      </div>
      {rows.map((r) => (
        <div key={r.action} className={clsx(card, 'flex items-center gap-2 py-2 text-[11px]')}>
          <Sparkles aria-hidden="true" className="h-3.5 w-3.5 shrink-0 text-sp-gold-text" />
          {r.title}
          <span className="ml-auto font-sp-display font-black text-sp-gold-text">+{r.points}</span>
        </div>
      ))}
      <div className="rounded-2xl bg-sp-teal p-2.5 text-sp-cream">
        <p className="flex items-center gap-1.5 text-[9px] font-bold uppercase tracking-[0.12em] text-sp-gold">
          <Gift aria-hidden="true" className="h-3.5 w-3.5" /> Perk unlocked
        </p>
        <p className="mt-1 text-[12px] font-bold">Join Priya’s Saturday drills session</p>
      </div>
      <p className="text-[9px] leading-snug text-sp-muted">{rows[0].label}.</p>
    </PhoneFrame>
  )
}
