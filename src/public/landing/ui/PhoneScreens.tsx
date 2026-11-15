import clsx from 'clsx'
import type { ReactNode } from 'react'
import { Copy, Gift, Heart, ImageIcon, MessageCircle, Repeat2, Send, Sparkles, UserPlus } from 'lucide-react'
import { PROVISIONAL_CP_RULES } from '../claims'
import { HOMEPAGE_COPY } from '../copy'
import { SplitMark } from './SplitpostWordmark'
import { Avatar, PostArt } from './PostJourney'

/**
 * Concept phone screens for HOW, drawn in code so they show only what's being
 * built for the pilot. Each carries "Concept · Sample data" inside the frame,
 * so the label survives cropping. Sample people only, no currency anywhere,
 * and Connection Points are shown per creator with their provisional label.
 */

const LABEL = HOMEPAGE_COPY.how.mockupLabel
const post = HOMEPAGE_COPY.post

export function PhoneFrame({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="relative mx-auto w-full max-w-[260px] rounded-[40px] bg-sp-midnight p-[7px] shadow-[0_40px_70px_-30px_rgb(16_20_46/0.6)] ring-1 ring-black/40">
      <div className="relative flex aspect-[9/18.5] flex-col overflow-hidden rounded-[33px] bg-[#fbf9f6] text-sp-ink">
        <div aria-hidden="true" className="flex items-center justify-between px-5 pb-1 pt-2.5 text-[10px] font-semibold">
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
        <div data-testid="mockup-label" className="bg-sp-midnight px-3 py-1 text-center text-[9px] font-bold uppercase tracking-[0.14em] text-white">
          {LABEL}
        </div>
        <div className="flex min-h-0 flex-1 flex-col gap-2.5 overflow-hidden p-3">{children}</div>
      </div>
    </div>
  )
}

const card = 'rounded-2xl bg-white p-2.5 ring-1 ring-sp-ink/8'
const kicker = 'text-[9px] font-bold uppercase tracking-[0.12em] text-sp-muted'

/** POST: Priya writing her first-10K post. */
export function PostScreen() {
  return (
    <PhoneFrame title="New post">
      <div className={card}>
        <div className="flex items-center gap-2">
          <Avatar initials="PR" tone="priya" />
          <div className="leading-tight">
            <p className="text-[11px] font-bold">{post.author}</p>
            <p className="text-[9px] text-sp-muted">To your followers</p>
          </div>
        </div>
        <p className="mt-2 text-[11px] leading-snug">{post.text}</p>
        <PostArt className="mt-2 h-24" />
      </div>
      <div className="flex gap-2 text-sp-muted">
        <span className={clsx(card, 'flex flex-1 items-center justify-center gap-1 py-2 text-[10px] font-semibold')}>
          <ImageIcon aria-hidden="true" className="h-3.5 w-3.5" /> Photo added
        </span>
        <span className={clsx(card, 'flex flex-1 items-center justify-center gap-1 py-2 text-[10px] font-semibold')}>#first10k</span>
      </div>
      <span className="mt-auto rounded-full bg-sp-midnight py-2.5 text-center text-[12px] font-extrabold text-white">Post</span>
    </PhoneFrame>
  )
}

/** SUPPORT: Ana comments and shares, Leo reposts with his referral link. */
export function SupportScreen() {
  return (
    <PhoneFrame title="Priya’s post">
      <div className={clsx(card, 'text-[11px] leading-snug')}>
        <b>{post.author}</b> <span className="line-clamp-2">{post.text}</span>
        <div className="mt-1.5 flex gap-3 text-[10px] font-semibold text-sp-muted">
          <span className="inline-flex items-center gap-1">
            <Heart aria-hidden="true" className="h-3 w-3 fill-sp-orange text-sp-orange" /> {post.likes}
          </span>
          <span className="inline-flex items-center gap-1">
            <MessageCircle aria-hidden="true" className="h-3 w-3" /> {post.comments}
          </span>
          <span className="inline-flex items-center gap-1">
            <Repeat2 aria-hidden="true" className="h-3 w-3" /> {post.reposts}
          </span>
        </div>
      </div>
      <div className="flex gap-2">
        <Avatar initials="AN" tone="ana" className="h-7 w-7 text-[10px]" />
        <p className={clsx(card, 'flex-1 text-[11px] leading-snug')}>
          <b>Ana</b> This is the push I needed today. Sending it to my running group.
        </p>
      </div>
      <div className="rounded-2xl bg-sp-midnight p-3 text-white">
        <p className="flex items-center gap-1 text-[9px] font-bold uppercase tracking-[0.12em] text-sp-muted-on-dark">
          <Repeat2 aria-hidden="true" className="h-3 w-3" /> Leo is reposting
        </p>
        <p className="mt-1 text-[12px] font-bold">Repost with your link</p>
        <p className="mt-1 text-[10px] leading-snug text-sp-muted-on-dark">When people follow Priya through it, she can see you helped.</p>
        <p className="mt-2 truncate rounded-lg bg-white/10 px-2 py-1.5 font-mono text-[10px]">splitpost.example/r/leo-priya</p>
        <div className="mt-2 flex gap-1.5 text-[11px] font-bold">
          <span className="flex flex-1 items-center justify-center gap-1 rounded-full bg-sp-orange py-1.5 text-sp-midnight">
            <Repeat2 aria-hidden="true" className="h-3 w-3" /> Repost
          </span>
          <span className="flex flex-1 items-center justify-center gap-1 rounded-full py-1.5 ring-1 ring-white/30">
            <Copy aria-hidden="true" className="h-3 w-3" /> Copy link
          </span>
        </div>
      </div>
      <p className="text-[9px] leading-snug text-sp-muted">Sharing alone earns nothing. A referral counts once a new follow is verified.</p>
    </PhoneFrame>
  )
}

/** SPLIT, for the creator: who helped the post spread. */
export function InsightsScreen() {
  const bars = [10, 18, 34, 62, 100]
  return (
    <PhoneFrame title="Who helped">
      <div className="rounded-2xl bg-sp-midnight p-3 text-white">
        <p className="text-[9px] font-bold uppercase tracking-[0.12em] text-sp-muted-on-dark">Your first 10K post</p>
        <div aria-hidden="true" className="mt-2 flex h-14 items-end gap-1.5">
          {bars.map((h, i) => (
            <span key={i} className={clsx('flex-1 rounded-t', i === bars.length - 1 ? 'bg-sp-orange' : 'bg-white/25')} style={{ height: `${h}%` }} />
          ))}
        </div>
        <p className="mt-1.5 text-[10px] text-sp-muted-on-dark">New followers from people who shared it</p>
      </div>
      <p className={kicker}>Top supporters</p>
      <div className={clsx(card, 'flex items-center gap-2')}>
        <Avatar initials="LE" tone="leo" />
        <div className="min-w-0 leading-tight">
          <p className="text-[11px] font-bold">Leo</p>
          <p className="text-[9px] text-sp-muted">Repost brought 214 new followers</p>
        </div>
        <UserPlus aria-hidden="true" className="ml-auto h-3.5 w-3.5 shrink-0 text-sp-orange-text" />
      </div>
      <div className={clsx(card, 'flex items-center gap-2')}>
        <Avatar initials="AN" tone="ana" />
        <div className="min-w-0 leading-tight">
          <p className="text-[11px] font-bold">Ana</p>
          <p className="text-[9px] text-sp-muted">First comment · shared with her running group</p>
        </div>
        <MessageCircle aria-hidden="true" className="ml-auto h-3.5 w-3.5 shrink-0 text-sp-orange-text" />
      </div>
      <span className="mt-auto flex items-center justify-center gap-1.5 rounded-full py-2 text-center text-[11px] font-extrabold ring-[1.5px] ring-sp-midnight">
        <Send aria-hidden="true" className="h-3 w-3" /> Say thanks
      </span>
    </PhoneFrame>
  )
}

/** SPLIT, for the fan: Connection Points with Priya and a perk she offers. */
export function RecognitionScreen() {
  const rows = (['verified_referral', 'follow', 'comment'] as const).map((a) => PROVISIONAL_CP_RULES.find((r) => r.action === a)!)
  const total = rows.reduce((n, r) => n + r.points, 0)
  return (
    <PhoneFrame title="Leo · with Priya">
      <div className={clsx(card, 'flex items-center gap-2.5')}>
        <span className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-sp-orange">
          <span className="grid h-9 w-9 place-items-center rounded-full bg-white font-sp-display text-[13px] font-black">{total}</span>
        </span>
        <div className="leading-tight">
          <p className="text-[11px] font-bold">Connection Points with Priya</p>
          <p className="mt-0.5 text-[9px] text-sp-muted">No cash value. Only for Priya.</p>
        </div>
      </div>
      {rows.map((r) => (
        <div key={r.action} className={clsx(card, 'flex items-center gap-2 py-2 text-[11px]')}>
          <Sparkles aria-hidden="true" className="h-3.5 w-3.5 shrink-0 text-sp-orange-text" />
          {r.title}
          <span className="ml-auto font-sp-display font-black text-sp-orange-text">+{r.points}</span>
        </div>
      ))}
      <div className="rounded-2xl bg-[#ffe2d4] p-2.5">
        <p className="flex items-center gap-1.5 text-[9px] font-bold uppercase tracking-[0.12em] text-sp-midnight">
          <Gift aria-hidden="true" className="h-3.5 w-3.5" /> Perk unlocked
        </p>
        <p className="mt-1 text-[12px] font-bold">Join Priya’s Saturday group run</p>
      </div>
      <p className="text-[9px] leading-snug text-sp-muted">{rows[0].label}.</p>
    </PhoneFrame>
  )
}
