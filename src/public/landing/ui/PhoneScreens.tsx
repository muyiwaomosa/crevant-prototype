import clsx from 'clsx'
import type { ReactNode } from 'react'
import { BookOpen, ChefHat, Gift, Hammer, Laptop, MessageCircle, Search, Sparkles, UserPlus } from 'lucide-react'
import { PROVISIONAL_CP_RULES } from '../claims'
import { HOMEPAGE_COPY } from '../copy'
import { SplitMark } from './SplitpostWordmark'
import { Avatar } from './SamplePost'

/**
 * Concept product screens, drawn in code. They stay mostly NEUTRAL (white,
 * light greys and charcoal) so creators' content stands out; the brand shows
 * only in the small logo mark and a single accent. Each carries "Concept ·
 * Sample data" inside the frame, so the label survives cropping. Sample
 * people and everyday posts only, no real results, no currency, and
 * Connection Points are shown per creator with their provisional label.
 *
 *   WHAT WE'RE BUILDING  FollowingScreen, DiscoverScreen, InsightsScreen
 *   A BETTER SPLIT       RecognitionScreen
 */

const LABEL = HOMEPAGE_COPY.building.mockupLabel
const POSTS = HOMEPAGE_COPY.samplePosts
const ink = 'text-[#1f2328]'
const muted = 'text-[#5b6168]'

export function PhoneFrame({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="relative mx-auto w-full max-w-[260px] rounded-[40px] bg-[#1f2328] p-[7px] shadow-[0_40px_70px_-30px_rgb(0_0_0/0.55)] ring-1 ring-black/40">
      <div className={clsx('relative flex aspect-[9/18.5] flex-col overflow-hidden rounded-[33px] bg-[#f6f6f4]', ink)}>
        <div aria-hidden="true" className="flex items-center justify-between px-5 pb-1 pt-2.5 text-[10px] font-semibold">
          <span>9:41</span>
          <span className="h-[18px] w-[64px] rounded-full bg-[#1f2328]" />
          <span className="flex gap-0.5">
            <span className="h-2 w-2 rounded-full bg-[#1f2328]/70" />
            <span className="h-2 w-3.5 rounded-sm bg-[#1f2328]/70" />
          </span>
        </div>
        <div className="flex items-center gap-2 border-b border-black/8 bg-white px-3.5 py-2">
          <SplitMark tone="light" className="h-4 w-4 rounded-[4px]" />
          <span className="truncate font-sp-display text-[13px] font-extrabold">{title}</span>
        </div>
        <div data-testid="mockup-label" className="bg-[#e8e6e1] px-3 py-1 text-center text-[9px] font-bold uppercase tracking-[0.14em] text-[#3a3f45]">
          {LABEL}
        </div>
        <div className="flex min-h-0 flex-1 flex-col gap-2.5 overflow-hidden p-3">{children}</div>
      </div>
    </div>
  )
}

const card = 'rounded-2xl bg-white p-2.5 ring-1 ring-black/6'
const kicker = clsx('text-[9px] font-bold uppercase tracking-[0.12em]', muted)
const ROLE_ICON = [BookOpen, ChefHat, Hammer, Laptop]

function FeedPost({ i, lines = 3 }: { i: number; lines?: number }) {
  const p = POSTS[i]
  const Icon = ROLE_ICON[i]
  const initials = p.author.replace(/^Mr\. /, '').split(' ').map((w) => w[0]).join('')
  return (
    <div className={card}>
      <div className="flex items-center gap-2">
        <Avatar initials={initials} tone="neutral" className="h-7 w-7 text-[10px]" />
        <div className="min-w-0 leading-tight">
          <p className="truncate text-[11px] font-bold">{p.author}</p>
          <p className={clsx('flex items-center gap-1 text-[9px]', muted)}>
            <Icon aria-hidden="true" className="h-2.5 w-2.5" /> {p.role}
          </p>
        </div>
        <span className="ml-auto rounded-full bg-[#efeeea] px-1.5 py-0.5 text-[8px] font-extrabold uppercase tracking-[0.08em] text-[#5b6168]">Sample</span>
      </div>
      <p className={clsx('mt-2 text-[11px] leading-snug', lines === 3 ? 'line-clamp-3' : 'line-clamp-2')}>{p.text}</p>
    </div>
  )
}

/** WHAT WE'RE BUILDING: the Following feed, newest first, from people you chose. */
export function FollowingScreen() {
  return (
    <PhoneFrame title="Following">
      <p className={kicker}>Newest first · people you follow</p>
      <FeedPost i={0} />
      <FeedPost i={1} />
      <FeedPost i={2} lines={2} />
    </PhoneFrame>
  )
}

/** WHAT WE'RE BUILDING: Discover, matched by the topics someone chose, not engagement. */
export function DiscoverScreen() {
  const topics = ['Education', 'Cooking', 'Crafts', 'Tech']
  return (
    <PhoneFrame title="Discover">
      <div className={clsx(card, 'flex items-center gap-1.5 py-2 text-[10px]', muted)}>
        <Search aria-hidden="true" className="h-3 w-3" /> Search people and topics
      </div>
      <div className="flex flex-wrap gap-1.5">
        {topics.map((t, i) => (
          <span key={t} className={clsx('rounded-full px-2 py-1 text-[10px] font-bold', i < 2 ? 'bg-[#1f2328] text-white' : 'bg-white ring-1 ring-black/10', i >= 2 && muted)}>
            {t}
          </span>
        ))}
      </div>
      <p className={kicker}>Matches your interests</p>
      {POSTS.map((p, i) => {
        const Icon = ROLE_ICON[i]
        return (
          <div key={p.author} className={clsx(card, 'flex items-center gap-2')}>
            <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-[#e8e6e1]">
              <Icon aria-hidden="true" className="h-3.5 w-3.5" />
            </span>
            <div className="min-w-0 leading-tight">
              <p className="truncate text-[11px] font-bold">{p.author}</p>
              <p className={clsx('truncate text-[9px]', muted)}>{p.role}</p>
            </div>
            <span className="ml-auto shrink-0 rounded-full px-2 py-1 text-[9px] font-extrabold ring-1 ring-[#1f2328]">Follow</span>
          </div>
        )
      })}
    </PhoneFrame>
  )
}

/** WHAT WE'RE BUILDING: who engages with a creator's work and who helps it reach new people. */
export function InsightsScreen() {
  const bars = [30, 42, 38, 56, 64]
  return (
    <PhoneFrame title="Your community">
      <div className={card}>
        <div className="flex items-center justify-between">
          <p className={kicker}>Followers who saw your posts</p>
          <span className="rounded-full bg-[#efeeea] px-1.5 py-0.5 text-[8px] font-extrabold uppercase tracking-[0.08em] text-[#5b6168]">Sample</span>
        </div>
        <div aria-hidden="true" className="mt-2 flex h-14 items-end gap-1.5">
          {bars.map((h, i) => (
            <span key={i} className={clsx('flex-1 rounded-t', i === bars.length - 1 ? 'bg-sp-green' : 'bg-[#d9d7d1]')} style={{ height: `${h}%` }} />
          ))}
        </div>
        <p className={clsx('mt-1.5 text-[10px]', muted)}>Last five posts</p>
      </div>
      <p className={kicker}>People who helped your posts grow</p>
      <div className={clsx(card, 'flex items-center gap-2')}>
        <Avatar initials="LE" tone="neutral" />
        <div className="min-w-0 leading-tight">
          <p className="text-[11px] font-bold">Leo</p>
          <p className={clsx('text-[9px]', muted)}>Introduced new followers</p>
        </div>
        <UserPlus aria-hidden="true" className="ml-auto h-3.5 w-3.5 shrink-0" />
      </div>
      <div className={clsx(card, 'flex items-center gap-2')}>
        <Avatar initials="AN" tone="neutral" />
        <div className="min-w-0 leading-tight">
          <p className="text-[11px] font-bold">Ana</p>
          <p className={clsx('text-[9px]', muted)}>Comments on almost every post</p>
        </div>
        <MessageCircle aria-hidden="true" className="ml-auto h-3.5 w-3.5 shrink-0" />
      </div>
    </PhoneFrame>
  )
}

/** A BETTER SPLIT: Connection Points with one creator, and a noncash perk she offers. Approved pilot rules only. */
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
          <p className={clsx('mt-0.5 text-[9px]', muted)}>No cash value. Only for Priya.</p>
        </div>
      </div>
      {rows.map((r) => (
        <div key={r.action} className={clsx(card, 'flex items-center gap-2 py-2 text-[11px]')}>
          <Sparkles aria-hidden="true" className="h-3.5 w-3.5 shrink-0" />
          {r.title}
          <span className="ml-auto font-sp-display font-black">+{r.points}</span>
        </div>
      ))}
      <div className="rounded-2xl bg-[#1f2328] p-2.5 text-white">
        <p className="flex items-center gap-1.5 text-[9px] font-bold uppercase tracking-[0.12em] text-white/75">
          <Gift aria-hidden="true" className="h-3.5 w-3.5" /> Perk unlocked
        </p>
        <p className="mt-1 text-[12px] font-bold">Join Priya’s Saturday drills session</p>
      </div>
      <p className={clsx('text-[9px] leading-snug', muted)}>
        A referral counts only once a new follow is verified. Sharing alone earns nothing. {rows[0].label}.
      </p>
    </PhoneFrame>
  )
}
