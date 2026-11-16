import clsx from 'clsx'
import type { ReactNode } from 'react'
import { ArrowDown, BadgeCheck, BookOpen, ChefHat, Hammer, Heart, Lightbulb, Repeat2, Send, UserCheck, UserPlus } from 'lucide-react'
import { PROVISIONAL_CP_RULES } from '../claims'
import { HOMEPAGE_COPY } from '../copy'
import { PhoneFrame } from './PhoneScreens'
import { Avatar } from './SamplePost'

/**
 * Three product illustrations, each telling one benefit from the creator's
 * side, so a visitor gets it before reading the copy:
 *
 *   A  Your followers can find your posts.        (WHAT WE'RE BUILDING)
 *   B  Understand the community you're building.  (WHAT WE'RE BUILDING)
 *   C  Your supporters can help you grow.         (A BETTER SPLIT)
 *
 * They are concept illustrations, not screenshots of the app: each carries a
 * "Concept illustration · Sample data" tag outside the phone as well as the
 * label inside it, uses sample people only, shows no earnings, views or
 * likes counts, and C uses only the approved pilot rules. Numbered markers on
 * the screen match the numbered callouts beside it. The phones stay neutral;
 * brand colour marks only the key interaction and recognition.
 */

const copy = HOMEPAGE_COPY.illustrations
const POSTS = HOMEPAGE_COPY.samplePosts

/** The tag that marks every illustration as a concept, outside the phone so it reads first. */
export function ConceptTag({ tone = 'light' }: { tone?: 'light' | 'dark' }) {
  return (
    <span
      data-testid="concept-tag"
      className={clsx(
        'inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-extrabold uppercase tracking-[0.12em]',
        tone === 'dark' ? 'bg-white/10 text-sp-muted-on-dark ring-1 ring-white/20' : 'bg-sp-ink/[0.06] text-sp-muted',
      )}
    >
      {copy.tag}
    </span>
  )
}

/** A numbered marker on the illustration, matching a callout. Decorative: the callout list carries the words. */
function Marker({ n, className }: { n: number; className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={clsx(
        'pointer-events-none absolute z-10 grid h-5 w-5 place-items-center rounded-full bg-sp-accent font-sp-display text-[10px] font-black text-sp-ink shadow-[0_3px_8px_-3px_rgb(0_0_0/0.5)] ring-2 ring-white',
        className,
      )}
    >
      {n}
    </span>
  )
}

function Callouts({ items, tone = 'light' }: { items: readonly string[]; tone?: 'light' | 'dark' }) {
  return (
    <ol data-testid="callouts" className="grid gap-4">
      {items.map((text, i) => (
        <li key={text} className="flex gap-3">
          <span aria-hidden="true" className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-sp-accent font-sp-display text-[13px] font-black text-sp-ink">
            {i + 1}
          </span>
          <span className={clsx('pt-0.5 text-[15px] font-semibold leading-snug', tone === 'dark' ? 'text-sp-bg' : 'text-sp-ink')}>{text}</span>
        </li>
      ))}
    </ol>
  )
}

/** The card each illustration sits in: tag, benefit headline, then the picture beside its callouts. */
function IllustrationCard({ id, title, callouts, note, children }: { id: string; title: string; callouts: readonly string[]; note: string; children: ReactNode }) {
  return (
    <figure data-testid={`illustration-${id}`} className="m-0 flex min-w-0 flex-col rounded-[28px] bg-sp-bg p-5 text-sp-ink shadow-[0_30px_60px_-34px_rgb(0_0_0/0.6)] sm:p-7">
      <ConceptTag />
      <h3 className="mt-3 text-balance font-sp-display text-[1.6rem] font-black leading-[1.05] tracking-[-0.015em] [font-stretch:104%] sm:text-[1.85rem]">{title}</h3>
      <div className="mt-6 grid flex-1 items-center gap-7 sm:grid-cols-[minmax(0,240px)_minmax(0,1fr)] lg:grid-cols-1 xl:grid-cols-[minmax(0,240px)_minmax(0,1fr)]">
        <div aria-hidden="true" className="relative mx-auto w-full max-w-[240px]">
          {children}
        </div>
        <div className="min-w-0">
          <Callouts items={callouts} />
          <figcaption className="mt-5 border-t border-sp-ink/10 pt-4 text-[13px] leading-snug text-sp-muted">{note}</figcaption>
        </div>
      </div>
    </figure>
  )
}

const ROLE_ICON = [BookOpen, ChefHat, Hammer]
const ago = ['2 min ago', '1 hr ago', 'Yesterday']

/** A. Your followers can find your posts: the Following feed, newest first, a timeline running down it. */
export function FollowingIllustration() {
  const c = copy.following
  return (
    <IllustrationCard id="following" title={c.title} callouts={c.callouts} note={c.note}>
      {/* Newest at the top, older below: the order reads at a glance, before any words. */}
      <span className="absolute -left-8 top-[8.5rem] bottom-12 hidden w-5 flex-col items-center text-[9px] font-extrabold uppercase tracking-[0.12em] text-sp-muted min-[400px]:flex">
        <span className="[writing-mode:vertical-rl] rotate-180">Newest</span>
        <span className="my-1.5 w-px flex-1 bg-sp-ink/25" />
        <ArrowDown className="h-3 w-3" />
        <span className="mt-1 [writing-mode:vertical-rl] rotate-180">Older</span>
      </span>
      <PhoneFrame title="Splitpost">
        <div className="relative -mt-1 grid grid-cols-2 rounded-full bg-[#e8e6e1] p-0.5 text-center text-[10px] font-extrabold">
          <Marker n={1} className="-left-1.5 -top-2" />
          <span className="rounded-full bg-white py-1 shadow-sm">Following</span>
          <span className="py-1 text-[#5b6168]">Discover</span>
        </div>
        <span className="relative inline-flex w-max items-center gap-1 rounded-full bg-sp-primary px-2 py-0.5 text-[9px] font-extrabold text-white">
          <ArrowDown className="h-2.5 w-2.5" /> Newest first
          <Marker n={2} className="-right-6 top-1/2 -translate-y-1/2" />
        </span>
        <ol className="relative grid gap-2 pl-3.5">
          <span className="absolute bottom-3 left-[3px] top-3 w-px bg-[#c9c6bf]" />
          {POSTS.slice(0, 3).map((p, i) => {
            const Icon = ROLE_ICON[i]
            const initials = p.author.replace(/^Mr\. /, '').split(' ').map((w) => w[0]).join('')
            return (
              <li key={p.author} className={clsx('relative rounded-2xl bg-white p-2 ring-1', i === 0 ? 'ring-2 ring-sp-secondary' : 'ring-black/6')}>
                <span className={clsx('absolute -left-[14px] top-3.5 h-[7px] w-[7px] rounded-full ring-2 ring-[#f6f6f4]', i === 0 ? 'bg-sp-primary' : 'bg-[#a5a29b]')} />
                <div className="flex items-center gap-1.5">
                  <Avatar initials={initials} tone="neutral" className="h-6 w-6 text-[9px]" />
                  <div className="min-w-0 leading-tight">
                    <p className="truncate text-[10px] font-bold">{p.author}</p>
                    <p className="flex items-center gap-1 text-[8.5px] text-[#5b6168]">
                      <Icon className="h-2.5 w-2.5" /> {ago[i]}
                    </p>
                  </div>
                  {i === 0 && <Marker n={3} className="-right-1.5 -top-2" />}
                {i === 0 && <span className="ml-auto rounded-full bg-sp-secondary px-1.5 py-0.5 text-[8px] font-extrabold uppercase tracking-[0.06em] text-sp-ink">New</span>}
                </div>
                <p className={clsx('mt-1.5 text-[10px] leading-snug', i === 0 ? 'line-clamp-3' : 'line-clamp-2')}>{p.text}</p>
              </li>
            )
          })}
        </ol>
      </PhoneFrame>
    </IllustrationCard>
  )
}

/** B. Understand the community you're building: relationships, returning supporters and one useful insight. No views or likes. */
export function CommunityIllustration() {
  const c = copy.community
  const rings = [
    { label: 'New followers', n: 12, r: 34, fill: '#e8e6e1' },
    { label: 'Returning supporters', n: 38, r: 24, fill: 'var(--color-sp-secondary)' },
    { label: 'Core supporters', n: 9, r: 13, fill: 'var(--color-sp-primary)' },
  ]
  return (
    <IllustrationCard id="community" title={c.title} callouts={c.callouts} note={c.note}>
      <PhoneFrame title="Your community">
        <div className="relative rounded-2xl bg-white p-2.5 ring-1 ring-black/6">
          <Marker n={1} className="-left-1.5 -top-2" />
          <div className="flex items-center justify-between pl-3">
            <p className="text-[9px] font-bold uppercase tracking-[0.12em] text-[#5b6168]">This month</p>
            <span className="rounded-full bg-[#efeeea] px-1.5 py-0.5 text-[8px] font-extrabold uppercase tracking-[0.08em] text-[#5b6168]">Sample</span>
          </div>
          <div className="mt-1.5 flex items-center gap-2.5">
            <svg viewBox="0 0 72 72" className="h-14 w-14 shrink-0">
              {rings.map((g) => (
                <circle key={g.label} cx="36" cy="36" r={g.r} fill={g.fill} stroke="#fff" strokeWidth="2" />
              ))}
            </svg>
            <ul className="grid min-w-0 flex-1 gap-1 text-[9px] leading-tight">
              {[...rings].reverse().map((g) => (
                <li key={g.label} className="flex items-center gap-1.5">
                  <span className="h-2 w-2 shrink-0 rounded-full ring-1 ring-black/10" style={{ background: g.fill }} />
                  <span className="truncate">{g.label}</span>
                  <span className="ml-auto font-sp-display font-black">{g.n}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
        <p className="relative pl-6 text-[9px] font-bold uppercase tracking-[0.12em] text-[#5b6168]">
          <Marker n={2} className="left-0 top-1/2 -translate-y-1/2" />
          Back again
        </p>
        {[
          { initials: 'AN', name: 'Ana', what: 'Back for 5 of your last 6 posts', Icon: Repeat2 },
          { initials: 'LE', name: 'Leo', what: 'Brought 2 friends who now follow you', Icon: UserPlus },
        ].map(({ initials, name, what, Icon }) => (
          <div key={name} className="flex items-center gap-2 rounded-2xl bg-white p-2 ring-1 ring-black/6">
            <Avatar initials={initials} tone="neutral" className="h-7 w-7 text-[10px]" />
            <div className="min-w-0 leading-tight">
              <p className="text-[10.5px] font-bold">{name}</p>
              <p className="text-[9px] text-[#5b6168]">{what}</p>
            </div>
            <Icon className="ml-auto h-3.5 w-3.5 shrink-0" />
          </div>
        ))}
        <div className="relative flex gap-2 rounded-2xl bg-sp-secondary-tint p-2.5 ring-1 ring-sp-secondary">
          <Marker n={3} className="-right-1.5 -top-2" />
          <Lightbulb className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <p className="text-[10px] font-semibold leading-snug">Your how-to posts bring people back most.</p>
        </div>
      </PhoneFrame>
    </IllustrationCard>
  )
}

/** C. Your supporters can help you grow: a qualified referral, step by step, and who each step helps. */
export function ReferralIllustration() {
  const c = copy.referral
  const rule = PROVISIONAL_CP_RULES.find((r) => r.action === 'verified_referral')!
  const visuals: ReactNode[] = [
    <span key="share" className="flex items-center gap-1.5">
      <Avatar initials="LE" tone="leo" className="h-8 w-8 text-[10px] ring-2 ring-sp-bg" />
      <Send className="h-3.5 w-3.5 text-sp-secondary-on-dark" />
      <Avatar initials="SA" tone="friend" className="h-8 w-8 text-[10px] ring-0" />
    </span>,
    <span key="verified" className="relative">
      <Avatar initials="SA" tone="friend" className="h-8 w-8 text-[10px] ring-0" />
      <BadgeCheck className="absolute -bottom-1 -right-1.5 h-4 w-4 fill-white text-sp-primary" />
    </span>,
    <span key="follow" className="inline-flex items-center gap-1 rounded-full bg-sp-secondary px-2.5 py-1 text-[11px] font-extrabold text-sp-ink">
      <UserCheck className="h-3.5 w-3.5" /> Following Priya
    </span>,
    <span key="points" className="grid h-10 w-10 place-items-center rounded-full bg-sp-accent">
      <span className="grid h-7 w-7 place-items-center rounded-full bg-white font-sp-display text-[11px] font-black text-sp-ink">+{rule.points}</span>
    </span>,
  ]
  return (
    <figure data-testid="illustration-referral" className="m-0 min-w-0 rounded-[28px] bg-sp-primary p-5 text-sp-bg shadow-[0_30px_60px_-34px_rgb(0_0_0/0.6)] sm:p-7">
      <ConceptTag tone="dark" />
      <h3 className="mt-3 text-balance font-sp-display text-[1.6rem] font-black leading-[1.05] tracking-[-0.015em] [font-stretch:104%] sm:text-[1.85rem]">{c.title}</h3>

      {/* The post that started it: Priya's, shared by Leo. */}
      <div aria-hidden="true" className="mt-5 flex items-center gap-2.5 rounded-2xl bg-white/10 p-2.5 ring-1 ring-white/15">
        <Avatar initials="PR" tone="priya" className="h-8 w-8 text-[10px]" />
        <div className="min-w-0 leading-tight">
          <p className="text-[13px] font-bold">Priya’s 60-second calf drill</p>
          <p className="text-[11px] text-sp-muted-on-dark">Fitness coach · sample post</p>
        </div>
        <Heart className="ml-auto h-4 w-4 shrink-0 text-sp-secondary-on-dark" />
      </div>

      <ol data-testid="referral-steps" className="relative mt-4 grid gap-2.5">
        <span aria-hidden="true" className="absolute bottom-7 left-[1.1rem] top-7 w-0.5 rounded-full bg-sp-secondary-on-dark/40" />
        {c.steps.map((s, i) => (
          <li key={s.title} className={clsx('relative flex items-center gap-3 rounded-2xl p-3', i === c.steps.length - 1 ? 'bg-sp-bg text-sp-ink' : 'bg-white/[0.07] ring-1 ring-white/15')}>
            <span
              aria-hidden="true"
              className={clsx('relative grid h-[1.4rem] w-[1.4rem] shrink-0 place-items-center rounded-full font-sp-display text-[11px] font-black', i === c.steps.length - 1 ? 'bg-sp-accent text-sp-ink' : 'bg-sp-secondary text-sp-ink')}
            >
              {i + 1}
            </span>
            <div className="min-w-0 flex-1 leading-snug">
              <p className="text-[15px] font-bold">{s.title}</p>
              <p className={clsx('mt-0.5 text-[13px]', i === c.steps.length - 1 ? 'text-sp-muted' : 'text-sp-muted-on-dark')}>{s.detail}</p>
            </div>
            <span aria-hidden="true" className="hidden shrink-0 min-[380px]:block">
              {visuals[i]}
            </span>
          </li>
        ))}
      </ol>

      <ul data-testid="referral-outcomes" className="mt-5 grid grid-cols-3 gap-2">
        {c.outcomes.map((o) => (
          <li key={o.who} className="min-w-0 rounded-2xl p-2.5 ring-1 ring-white/25 sm:p-3">
            <p className="font-sp-display text-[12px] font-black uppercase tracking-[0.08em] text-sp-accent sm:text-[13px]">{o.who}</p>
            <p className="mt-1 text-[12px] leading-snug sm:text-[13px]">{o.gets}</p>
          </li>
        ))}
      </ul>
      <figcaption className="mt-5 border-t border-white/15 pt-4 text-[13px] leading-snug text-sp-muted-on-dark">
        {c.rule} {rule.label}.
      </figcaption>
    </figure>
  )
}
