import clsx from 'clsx'
import { useId, type ReactNode } from 'react'
import { Bookmark, Heart, MessageCircle, Repeat2, Send, TrendingUp } from 'lucide-react'
import { HOMEPAGE_COPY } from '../copy'

/**
 * Priya's sample post, and the four-step story of how it spread (WHY). The
 * same post appears in the hero, WHAT and HOW. Everything here is sample data
 * and says so; the drawings are hidden from screen readers because each
 * step's written line carries the meaning.
 */

const post = HOMEPAGE_COPY.post
const steps = HOMEPAGE_COPY.why.steps

type Tone = 'priya' | 'ana' | 'leo' | 'leo-light' | 'friend'

export function Avatar({ initials, tone, className }: { initials: string; tone: Tone; className?: string }) {
  return (
    <span
      className={clsx(
        'grid shrink-0 place-items-center rounded-full font-sp-display font-black',
        tone === 'priya' && 'bg-sp-orange text-sp-midnight',
        tone === 'ana' && 'bg-[#5b3a7a] text-white',
        tone === 'leo' && 'bg-sp-midnight-raised text-white',
        tone === 'leo-light' && 'bg-white text-sp-midnight',
        tone === 'friend' && 'bg-[#e7dfd2] text-sp-ink ring-2 ring-white',
        className ?? 'h-8 w-8 text-[11px]',
      )}
    >
      {initials}
    </span>
  )
}

/** The photo in Priya's post, drawn: sunrise over the road, the finish banner ahead. */
export function PostArt({ className }: { className?: string }) {
  const sky = useId()
  return (
    <svg viewBox="0 0 320 160" aria-hidden="true" preserveAspectRatio="xMidYMid slice" className={clsx('block w-full rounded-xl', className)}>
      <defs>
        <linearGradient id={sky} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#2b2f6b" />
          <stop offset="0.55" stopColor="#ff8a57" />
          <stop offset="1" stopColor="#ffd2a8" />
        </linearGradient>
      </defs>
      <rect width="320" height="160" fill={`url(#${sky})`} />
      <circle cx="160" cy="98" r="32" fill="#ffe3b8" />
      <path d="M0 108 C60 94 110 102 160 98 C210 94 260 88 320 100 V160 H0Z" fill="#3a2a4f" opacity="0.55" />
      <path d="M126 160 L152 100 L168 100 L194 160Z" fill="#1b2152" />
      <path d="M160 160 L160 104" stroke="#ffe3b8" strokeWidth="2" strokeDasharray="6 6" />
      <path d="M96 52 V120 M224 52 V120" stroke="#10142e" strokeWidth="4" />
      <rect x="96" y="48" width="128" height="22" rx="3" fill="#10142e" />
      <text x="160" y="64" textAnchor="middle" fontFamily="Archivo, sans-serif" fontWeight="900" fontSize="13" letterSpacing="3" fill="#ffffff">
        FINISH · 10K
      </text>
    </svg>
  )
}

function Actions() {
  return (
    <div className="mt-2.5 flex items-center gap-4 text-[12px] font-semibold text-sp-muted">
      <span className="inline-flex items-center gap-1">
        <Heart aria-hidden="true" className="h-3.5 w-3.5 fill-sp-orange text-sp-orange" /> {post.likes}
      </span>
      <span className="inline-flex items-center gap-1">
        <MessageCircle aria-hidden="true" className="h-3.5 w-3.5" /> {post.comments}
      </span>
      <span className="inline-flex items-center gap-1">
        <Repeat2 aria-hidden="true" className="h-3.5 w-3.5" /> {post.reposts}
      </span>
      <Send aria-hidden="true" className="ml-auto h-3.5 w-3.5" />
    </div>
  )
}

/** Priya's post, as it would appear in a feed. Labelled sample data. */
export function SamplePost({ className, compact }: { className?: string; compact?: boolean }) {
  return (
    <div data-testid="sample-post" className={clsx('rounded-2xl bg-white p-3.5 text-sp-ink shadow-[0_24px_50px_-24px_rgb(16_20_46/0.55)] ring-1 ring-sp-ink/8', className)}>
      <div className="flex items-center gap-2.5">
        <Avatar initials="PR" tone="priya" />
        <div className="min-w-0 leading-tight">
          <p className="text-[13px] font-bold">{post.author}</p>
          <p className="text-[11px] text-sp-muted">
            {post.handle} · {post.time}
          </p>
        </div>
        <span className="ml-auto rounded-full bg-sp-neutral px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-[0.08em] text-sp-muted">Sample</span>
      </div>
      <p className={clsx('mt-2.5 leading-snug', compact ? 'text-[13px]' : 'text-sm')}>{post.text}</p>
      <PostArt className={compact ? 'mt-2.5 h-24' : 'mt-2.5 h-36'} />
      <Actions />
    </div>
  )
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

export function SampleTag({ dark }: { dark?: boolean }) {
  return (
    <span className={clsx('rounded-full px-2 py-0.5 text-[9px] font-extrabold uppercase tracking-[0.08em]', dark ? 'bg-white/12 text-white/80' : 'bg-sp-neutral text-sp-muted')}>
      Sample data
    </span>
  )
}

function PriyaPosts() {
  return (
    <div aria-hidden="true">
      <SamplePost compact />
    </div>
  )
}

function AnaJoinsIn() {
  return (
    <Card>
      <p className="text-[11px] font-semibold text-sp-muted">Replying to {post.handle}</p>
      <div className="mt-2 flex gap-2.5">
        <Avatar initials="AN" tone="ana" />
        <div className="min-w-0 rounded-2xl rounded-tl-sm bg-sp-neutral px-3 py-2 text-[13px] leading-snug">
          <p className="font-bold">Ana</p>
          This is the push I needed today. Sending it to everyone who says they’re not a runner.
        </div>
      </div>
      <div className="mt-2 flex items-center gap-3 pl-11 text-[11px] font-semibold text-sp-muted">
        <span className="inline-flex items-center gap-1">
          <Heart className="h-3 w-3" /> 862
        </span>
        <span>Reply</span>
      </div>
      <div className="mt-3 flex items-center gap-2 rounded-xl border border-dashed border-sp-orange px-2.5 py-2 text-xs font-bold text-sp-orange-text">
        <Send className="h-3.5 w-3.5" /> Shared with her running group
      </div>
    </Card>
  )
}

function LeoReposts() {
  return (
    <Card>
      <p className="flex items-center gap-1.5 text-[11px] font-semibold text-sp-muted">
        <Repeat2 className="h-3.5 w-3.5" /> Leo reposted
      </p>
      <div className="mt-2 flex items-start gap-2.5">
        <Avatar initials="LE" tone="leo" />
        <p className="text-[13px] leading-snug">If you’ve been putting something off, read this. Then follow her.</p>
      </div>
      <div className="mt-2.5 rounded-xl p-2.5 ring-1 ring-sp-ink/10">
        <p className="flex items-center gap-1.5 text-[11px] font-bold">
          <Avatar initials="PR" tone="priya" className="h-5 w-5 text-[8px]" /> {post.author}
        </p>
        <p className="mt-1 line-clamp-2 text-[11px] leading-snug text-sp-muted">{post.text}</p>
      </div>
      <div className="mt-2.5 flex flex-wrap items-center gap-2">
        <span className="flex">
          <Avatar initials="JK" tone="friend" className="h-6 w-6 text-[9px]" />
          <Avatar initials="MT" tone="friend" className="-ml-1.5 h-6 w-6 text-[9px]" />
          <Avatar initials="SO" tone="friend" className="-ml-1.5 h-6 w-6 text-[9px]" />
        </span>
        <span className="text-xs font-bold">214 new followers for Priya</span>
        <SampleTag />
      </div>
    </Card>
  )
}

function PostTakesOff() {
  const stats: Array<[ReactNode, string, string]> = [
    [<Heart key="h" className="h-4 w-4 fill-sp-orange text-sp-orange" />, post.likes, 'likes'],
    [<MessageCircle key="c" className="h-4 w-4" />, post.comments, 'comments'],
    [<Repeat2 key="r" className="h-4 w-4" />, post.reposts, 'reposts'],
    [<Bookmark key="b" className="h-4 w-4" />, '2.1K', 'saves'],
  ]
  return (
    <Card dark>
      <div className="flex items-center justify-between gap-2">
        <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-sp-muted-on-dark">Priya’s post, day 3</p>
        <SampleTag dark />
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2">
        {stats.map(([icon, n, label]) => (
          <div key={label} className="rounded-xl bg-white/8 px-3 py-2">
            <p className="flex items-center gap-1.5 font-sp-display text-lg font-black">
              {icon} {n}
            </p>
            <p className="text-[10px] text-sp-muted-on-dark">{label}</p>
          </div>
        ))}
      </div>
      <p className="mt-3 flex items-center gap-1.5 text-[11px] font-semibold text-white/80">
        <TrendingUp className="h-3.5 w-3.5 text-sp-orange" /> Trending in Running
      </p>
    </Card>
  )
}

const DRAWINGS = [PriyaPosts, AnaJoinsIn, LeoReposts, PostTakesOff]

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
            <h3 className="font-sp-display text-xl font-black leading-tight tracking-[-0.01em]">{step.title}</h3>
            <Drawing />
            <p className="text-[15px] leading-relaxed text-sp-muted">{step.line}</p>
          </li>
        )
      })}
    </ol>
  )
}
