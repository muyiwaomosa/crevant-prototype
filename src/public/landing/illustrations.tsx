import clsx from 'clsx'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { ArrowRight, Check, UserPlus } from 'lucide-react'
import { TourScreenshot } from './shared'

// Explanatory visuals for the landing page, drawn in code. Each one stands for
// a sentence already on the page. None shows real data except the founder's
// own confirmed figures in the founder story; none promises reach or income.
// Planned features are drawn as sketches, never as app screens.

/** A small "Illustration" or "Concept · Planned" label for drawn visuals. */
export function VisualTag({ children, planned = false }: { children: ReactNode; planned?: boolean }) {
  return (
    <span
      className={clsx(
        'inline-flex rounded-full border border-dashed px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide',
        planned ? 'border-ink-300 bg-white/70 text-ink-500' : 'border-ink-300 text-ink-500',
      )}
    >
      {children}
    </span>
  )
}

// ---- 2. Founder story -------------------------------------------------------

const QUIET_DAYS = 150 // about five months

/** One square per day of the founder's year of daily videos. */
export function YearGrid() {
  const cell = 10
  const gap = 3
  const step = cell + gap
  const cols = 53
  const top = 4
  const markerX = Math.floor(QUIET_DAYS / 7) * step
  return (
    <figure data-testid="year-grid" className="rounded-[24px] bg-paper p-4 ring-1 ring-ink-100 sm:p-5">
      <p className="font-display text-[15px] font-bold text-ink-900">One video a day for 365 days</p>
      <div className="mt-2 flex text-[12px] font-semibold leading-tight">
        <span className="text-ink-500" style={{ width: `${(markerX / (cols * step)) * 100}%` }}>
          Five quiet months
        </span>
        <span className="border-l-2 border-brand-600 pl-1.5 text-brand-700">12,000 subscribers · monetized</span>
      </div>
      <svg viewBox={`0 0 ${cols * step} ${top + 7 * step + 4}`} role="img" aria-labelledby="year-grid-title" className="mt-3 block h-auto w-full">
        <title id="year-grid-title">A grid of 365 squares, one per day. The first five months are pale; after them the squares turn green, when the channel reached 12,000 subscribers and was monetized.</title>
        <line x1={markerX - 1.5} y1="0" x2={markerX - 1.5} y2={top + 7 * step} className="stroke-brand-600" strokeWidth="2" />
        {Array.from({ length: 365 }, (_, d) => (
          <rect
            key={d}
            x={Math.floor(d / 7) * step}
            y={top + (d % 7) * step}
            width={cell}
            height={cell}
            rx="2.5"
            className={d < QUIET_DAYS ? 'fill-ink-200' : 'fill-brand-500'}
          />
        ))}
      </svg>
      <figcaption className="mt-2 text-[12px] text-ink-500">Illustration. One square per day; the timing is approximate.</figcaption>
    </figure>
  )
}

/**
 * The founder's two confirmed months as a "scissors" chart: subscribers up,
 * earnings down. Each line has its own scale from zero.
 */
export function EarningsContrast() {
  const W = 320
  const H = 200
  const x0 = 70
  const x1 = 250
  const yOf = (v: number, max: number) => 176 - (v / max) * 140
  const subs = [yOf(12000, 40000), yOf(36000, 40000)]
  const earn = [yOf(500, 600), yOf(200, 600)]
  return (
    <figure data-testid="earnings-contrast" aria-labelledby="earnings-contrast-caption" className="overflow-hidden rounded-[28px] bg-ink-900 text-white">
      <div className="grid grid-cols-2 border-b border-white/10 text-[12px] font-semibold uppercase tracking-wide text-ink-400">
        <p className="px-5 pt-5 sm:px-7">First earnings</p>
        <p className="px-5 pt-5 text-right sm:px-7">The following month</p>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Subscribers rose from 12,000 to 36,000 while earnings fell from about $500 to about $200." className="block h-auto w-full">
        <line x1={x0} y1="20" x2={x0} y2="180" className="stroke-white/15" />
        <line x1={x1} y1="20" x2={x1} y2="180" className="stroke-white/15" />
        <line x1={x0} y1={subs[0]} x2={x1} y2={subs[1]} className="stroke-brand-300" strokeWidth="4" strokeLinecap="round" />
        <line x1={x0} y1={earn[0]} x2={x1} y2={earn[1]} stroke="#ff8a7a" strokeWidth="4" strokeLinecap="round" />
        <circle cx={x0} cy={subs[0]} r="6" className="fill-brand-300" />
        <circle cx={x1} cy={subs[1]} r="6" className="fill-brand-300" />
        <circle cx={x0} cy={earn[0]} r="6" fill="#ff8a7a" />
        <circle cx={x1} cy={earn[1]} r="6" fill="#ff8a7a" />
        <text x={x0 - 12} y={subs[0] + 4} textAnchor="end" className="fill-white text-[13px] font-bold">12,000</text>
        <text x={x0 - 12} y={earn[0] + 4} textAnchor="end" fill="#ff8a7a" className="text-[13px] font-bold">~$500</text>
        <text x={x1 + 12} y={subs[1] + 4} className="fill-white text-[13px] font-bold">36,000</text>
        <text x={x1 + 12} y={earn[1] + 4} fill="#ff8a7a" className="text-[13px] font-bold">~$200</text>
      </svg>
      <div className="grid grid-cols-2 gap-3 px-5 pb-4 text-sm sm:px-7">
        <p className="text-ink-300">
          <span className="mr-1.5 inline-block h-2 w-4 rounded-full bg-brand-300 align-middle" aria-hidden="true" />
          subscribers <span className="font-semibold text-brand-300">(+200%)</span>
        </p>
        <p className="text-right text-ink-300">
          <span className="mr-1.5 inline-block h-2 w-4 rounded-full bg-[#ff8a7a] align-middle" aria-hidden="true" />
          earned <span className="font-semibold text-[#ff8a7a]">(−60%)</span>
        </p>
      </div>
      <figcaption id="earnings-contrast-caption" className="border-t border-white/10 px-5 py-3.5 text-[13px] leading-relaxed text-ink-300 sm:px-7">
        The founder's YouTube channel: subscribers tripled while earnings fell by 60%. Each line uses its own scale, starting from zero.
      </figcaption>
    </figure>
  )
}

// ---- 3. The problem ---------------------------------------------------------

/** "A fraction of that number in views." */
export function FollowersVsViews() {
  return (
    <div data-visual="followers-views" aria-hidden="true" className="space-y-3 rounded-2xl bg-paper p-4">
      <div>
        <p className="text-[12px] font-semibold text-ink-600">Followers</p>
        <div className="mt-1 h-3.5 w-full rounded-full bg-brand-500" />
      </div>
      <div>
        <p className="text-[12px] font-semibold text-ink-600">Views on the latest video</p>
        <div className="mt-1 h-3.5 w-[7%] rounded-full bg-spark-400" />
      </div>
      <VisualTag>Illustration</VisualTag>
    </div>
  )
}

/** Creators changing what they make to stay visible. */
export function AlgorithmNotes() {
  const notes: Array<[string, number, number, number, string]> = [
    ['Trend', 22, 62, -8, 'fill-spark-200'],
    ['Copy', 104, 74, 5, 'fill-[#ffd2c9]'],
    ['Controversy', 168, 54, -4, 'fill-brand-100'],
  ]
  return (
    <div data-visual="algorithm-notes" className="rounded-2xl bg-paper p-4">
      <svg viewBox="0 0 280 150" aria-hidden="true" className="block h-auto w-full">
        <rect x="8" y="8" width="264" height="134" rx="12" className="fill-white stroke-ink-200" strokeWidth="1.5" />
        <text x="26" y="36" className="fill-ink-800 font-display text-[16px] font-bold">What I love</text>
        {[52, 70, 88, 106, 124].map((y) => (
          <line key={y} x1="26" y1={y} x2="254" y2={y} className="stroke-ink-100" strokeWidth="1.5" />
        ))}
        {notes.map(([label, x, y, r, fill]) => (
          <g key={label} transform={`rotate(${r} ${x + 40} ${y + 24})`}>
            <rect x={x} y={y} width={label.length > 6 ? 100 : 80} height="48" rx="4" className={clsx(fill, 'stroke-black/5')} />
            <text x={x + 10} y={y + 29} className="fill-ink-800 text-[14px] font-semibold">
              {label}
            </text>
          </g>
        ))}
      </svg>
      <div className="mt-2">
        <VisualTag>Illustration</VisualTag>
      </div>
    </div>
  )
}

function DrawnFeedRow({ title, meta, faded }: { title: string; meta: string; faded?: boolean }) {
  return (
    <li className={clsx('flex items-center gap-2.5 rounded-xl px-2.5 py-2', faded ? 'bg-white/60 opacity-60 ring-1 ring-dashed ring-ink-200' : 'bg-white ring-1 ring-ink-100')}>
      <span aria-hidden="true" className={clsx('hidden h-7 w-7 shrink-0 rounded-full sm:block', faded ? 'bg-gradient-to-br from-brand-300 to-brand-600' : 'bg-ink-200')} />
      <span className="min-w-0">
        <span className="block text-[11px] font-semibold leading-snug text-ink-700 sm:truncate sm:text-[12px]">{title}</span>
        <span className="block text-[10px] leading-snug text-ink-500 sm:truncate sm:text-[11px]">{meta}</span>
      </span>
    </li>
  )
}

/** Why: a drawn ranked feed next to the real Crevant Following feed. */
export function FeedComparison() {
  return (
    <figure data-testid="feed-comparison" className="rounded-[28px] bg-white p-4 ring-1 ring-ink-100 sm:p-6">
      <div className="grid grid-cols-2 items-start gap-3 sm:gap-6">
        <div>
          <p className="text-center text-[11px] font-semibold uppercase tracking-wide text-ink-500 sm:text-[12px]">A ranked feed</p>
          <div className="mx-auto mt-3 max-w-[230px] rounded-[30px] border-[6px] border-ink-300 bg-ink-50 p-2.5 grayscale">
            <ul aria-label="Example of a ranked feed" className="space-y-2">
              <DrawnFeedRow title="Suggested for you" meta="Picked for predicted engagement" />
              <DrawnFeedRow title="Trending now" meta="From someone you don't follow" />
              <DrawnFeedRow title="Suggested for you" meta="Picked for predicted engagement" />
              <DrawnFeedRow title="A creator you chose to follow" meta="Further down, if it appears" faded />
            </ul>
            <p aria-hidden="true" className="mt-2 text-center font-display text-2xl font-bold text-ink-400">?</p>
          </div>
          <p className="mt-2 text-center">
            <VisualTag>Illustration</VisualTag>
          </p>
        </div>
        <div>
          <p className="text-center text-[11px] font-semibold uppercase tracking-wide text-brand-700 sm:text-[12px]">Crevant's Following feed</p>
          <TourScreenshot screen="feed" caption="Newest first, from people you follow" className="mt-3 max-w-[230px]" />
        </div>
      </div>
      <figcaption className="mt-4 border-t border-ink-100 pt-3.5 text-[13px] leading-relaxed text-ink-500">
        Ranked feeds differ from platform to platform. Crevant's Following feed is newest first. It isn't a promise that each post reaches each follower.
      </figcaption>
    </figure>
  )
}

// ---- 4. Why Crevant exists ---------------------------------------------------

/** "When someone chooses to follow you, your content should have a reliable place in their feed." */
export function FollowToFeed() {
  return (
    <figure data-testid="follow-to-feed" className="rounded-[24px] bg-paper p-4 ring-1 ring-ink-100 sm:p-5">
      <div aria-hidden="true" className="flex items-center justify-between gap-2">
        <div className="flex flex-col items-center gap-2 text-center">
          <span className="grid h-12 w-12 place-items-center rounded-full bg-gradient-to-br from-spark-300 to-spark-500 text-white">
            <UserPlus className="h-5 w-5" />
          </span>
          <span className="rounded-full bg-brand-600 px-3 py-1 text-[12px] font-semibold text-white">Follow</span>
        </div>
        <ArrowRight className="h-5 w-5 shrink-0 text-ink-400" />
        <div className="w-[34%] rounded-xl bg-white p-2.5 ring-1 ring-ink-100">
          <span className="block h-2 w-3/4 rounded-full bg-ink-200" />
          <span className="mt-1.5 block h-2 w-1/2 rounded-full bg-ink-100" />
          <span className="mt-2 block h-8 rounded-lg bg-brand-100" />
          <span className="mt-1.5 block text-[11px] font-semibold text-ink-700">Your new post</span>
        </div>
        <ArrowRight className="h-5 w-5 shrink-0 text-ink-400" />
        <div className="w-[30%] rounded-2xl border-[4px] border-ink-800 bg-white p-1.5">
          <span className="block rounded-md bg-brand-100 p-1.5 ring-2 ring-brand-500">
            <span className="block h-1.5 w-3/4 rounded-full bg-brand-500" />
            <span className="mt-1 block h-4 rounded bg-brand-200" />
          </span>
          <span className="mt-1 block h-5 rounded-md bg-ink-100" />
          <span className="mt-1 block h-5 rounded-md bg-ink-100" />
        </div>
      </div>
      <figcaption className="mt-3 flex flex-wrap items-center justify-between gap-2 text-[12px] text-ink-600">
        <span>
          <Check className="mr-1 inline h-3.5 w-3.5 text-brand-600" aria-hidden="true" />
          Their Following feed, newest first
        </span>
        <VisualTag>Illustration</VisualTag>
      </figcaption>
    </figure>
  )
}

// ---- 6. The Crevant difference ------------------------------------------------

// Deterministic pseudo-random picks, so the drawing is the same every time.
function picks(count: number, total: number, seed = 7) {
  const out = new Set<number>()
  let s = seed
  while (out.size < count) {
    s = (s * 9301 + 49297) % 233280
    out.add(Math.floor((s / 233280) * total))
  }
  return [...out]
}

/**
 * "The right 1,000": a field of people around one creator. The lines are
 * relationships (people who come back, join the conversation, recommend your
 * work), never money. One gentle animation when it scrolls into view; still
 * for anyone who prefers reduced motion.
 */
export function RightThousand() {
  const cols = 50
  const rows = 20
  const gap = 12
  const W = cols * gap
  const H = rows * gap
  const cx = W / 2
  const cy = H / 2
  const centre = (i: number) => {
    const c = i % cols
    const r = Math.floor(i / cols)
    return Math.abs(c * gap + gap / 2 - cx) < 30 && Math.abs(r * gap + gap / 2 - cy) < 22
  }
  const highlighted = picks(34, cols * rows).filter((i) => !centre(i))
  const ref = useRef<HTMLElement>(null)
  const [live, setLive] = useState(false)
  useEffect(() => {
    const el = ref.current
    if (!el || typeof IntersectionObserver === 'undefined') return
    const io = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting) {
          setLive(true)
          io.disconnect()
        }
      },
      { threshold: 0.35 },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [])
  return (
    <figure ref={ref} data-testid="right-thousand" data-live={live} className="rounded-[32px] bg-white p-4 ring-1 ring-ink-100 sm:p-8">
      <style>{`
        @media (prefers-reduced-motion: no-preference) {
          [data-testid="right-thousand"][data-live="true"] .rt-link { stroke-dasharray: 400; animation: rt-draw 1.6s ease-out backwards; }
          [data-testid="right-thousand"][data-live="true"] .rt-person { animation: rt-glow 1.6s ease-out backwards; }
        }
        @keyframes rt-draw { from { stroke-dashoffset: 400; } to { stroke-dashoffset: 0; } }
        @keyframes rt-glow { from { opacity: 0.15; } to { opacity: 1; } }
      `}</style>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-labelledby="rt-title" className="block h-auto w-full">
        <title id="rt-title">A field of small dots, each one a person who chose to follow, around one creator in the middle. Some dots are connected to the creator by lines that stand for relationships.</title>
        {Array.from({ length: cols * rows }, (_, i) =>
          centre(i) ? null : <circle key={i} cx={(i % cols) * gap + gap / 2} cy={Math.floor(i / cols) * gap + gap / 2} r="2.6" className="fill-ink-200" />,
        )}
        {highlighted.map((i, n) => {
          const x = (i % cols) * gap + gap / 2
          const y = Math.floor(i / cols) * gap + gap / 2
          return (
            <g key={i} style={{ animationDelay: `${(n % 12) * 90}ms` }}>
              <line x1={cx} y1={cy} x2={x} y2={y} className="rt-link stroke-brand-300" strokeWidth="1.2" style={{ animationDelay: `${(n % 12) * 90}ms` }} />
              <circle cx={x} cy={y} r="4.2" className="rt-person fill-brand-500" style={{ animationDelay: `${(n % 12) * 90}ms` }} />
            </g>
          )
        })}
        <circle cx={cx} cy={cy} r="17" className="fill-spark-400 stroke-white" strokeWidth="4" />
        <circle cx={cx} cy={cy - 4} r="5" className="fill-white" />
        <path d={`M ${cx - 8} ${cy + 9} q 8 -10 16 0`} className="fill-white" />
      </svg>
      <figcaption className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] leading-relaxed text-ink-500">
        <VisualTag>Illustration</VisualTag>
        <span>
          Each dot is one person who chose to follow. The lines are relationships: people who come back, join the conversation and recommend your
          work.
        </span>
      </figcaption>
    </figure>
  )
}

/** 6.3 is Planned: a concept sketch, never an app screen. */
export function PlannedPanel() {
  return (
    <figure data-testid="planned-panel" className="mx-auto flex w-full max-w-[340px] flex-col items-center rounded-[32px] border-2 border-dashed border-ink-200 bg-white/70 px-6 py-8 text-center">
      <svg viewBox="0 0 200 130" aria-hidden="true" className="block h-auto w-full max-w-[240px]">
        {[
          [30, 50],
          [52, 24],
          [100, 14],
          [148, 24],
          [170, 50],
        ].map(([x, y]) => (
          <g key={`${x}-${y}`} className="stroke-ink-400" strokeWidth="2" strokeDasharray="4 3" fill="none">
            <circle cx={x} cy={y} r="8" />
            <path d={`M ${x - 11} ${y + 22} q 11 -14 22 0`} />
          </g>
        ))}
        <g className="stroke-brand-600" strokeWidth="2.5" fill="none" strokeLinecap="round">
          <path d="M 100 112 L 100 70" />
          <path d="M 100 86 q -16 -4 -20 -20 q 16 2 20 20" />
          <path d="M 100 78 q 14 -6 18 -22 q -16 4 -18 22" />
        </g>
        <path d="M 78 112 L 122 112 L 116 128 L 84 128 Z" className="fill-spark-200 stroke-spark-600" strokeWidth="2" strokeDasharray="4 3" />
      </svg>
      <p className="mt-4 text-[12px] font-semibold uppercase tracking-wide text-ink-500">Planned</p>
      <p className="mt-2 font-display text-lg font-bold leading-snug text-ink-800">Ways for communities to support the creators they value</p>
      <figcaption className="mt-3 text-[13px] leading-relaxed text-ink-500">
        Concept sketch. Not built yet, so there is no screen to show. No payments are enabled and no money changes hands on Crevant.
      </figcaption>
    </figure>
  )
}

// ---- 7. For the fans -------------------------------------------------------------

export const JOURNEY = [
  { step: 'Follow', src: '/media/landing/tour-journey-follow.jpg', h: 520, alt: "Amara Okafor's creator page in the Crevant sample tour, with a Follow button." },
  { step: 'Comment', src: '/media/landing/tour-journey-comment.jpg', h: 198, alt: 'A comment being written in the Crevant sample tour, with a note that it earns 5 CP with Amara.' },
  { step: 'Points with that creator', src: '/media/landing/tour-journey-points.jpg', h: 553, alt: "A fan's Connection Points with Amara in the Crevant sample tour, and the ways to earn more with her." },
  { step: 'Their reward', src: '/media/landing/tour-journey-reward.jpg', h: 511, alt: "Amara's payday budget template reward in the Crevant sample tour, unlocked with points earned with Amara, marked as a simulated reward." },
] as const

/** A fan's journey in four real tour crops. */
export function FanJourney() {
  return (
    <figure data-testid="fan-journey" className="rounded-[28px] bg-paper p-4 ring-1 ring-ink-100 sm:p-6">
      <ol className="grid grid-cols-2 gap-3 md:grid-cols-4 md:gap-4">
        {JOURNEY.map((j, i) => (
          <li key={j.step} className="flex flex-col gap-2">
            <p className="flex items-center gap-2 text-[13px] font-semibold text-ink-800">
              <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-brand-600 text-[12px] font-bold text-white">{i + 1}</span>
              {j.step}
            </p>
            <img src={j.src} alt={j.alt} width={600} height={j.h} loading="lazy" decoding="async" className="h-auto w-full rounded-2xl bg-white object-contain ring-1 ring-ink-100" />
          </li>
        ))}
      </ol>
      <figcaption className="mt-3 text-[13px] text-ink-500">From the Crevant tour, with sample data and fictional people.</figcaption>
    </figure>
  )
}

// ---- 8. How it works ------------------------------------------------------------

/** Step 2 is Planned: your existing audience coming with you, as a sketch. */
export function BringYourAudience() {
  return (
    <figure data-testid="step2-concept" className="mt-5 rounded-2xl border border-dashed border-ink-300 bg-white/60 p-4">
      <svg viewBox="0 0 240 110" aria-hidden="true" className="block h-auto w-full">
        {[14, 46, 78].map((y, i) => (
          <g key={y}>
            <rect x="8" y={y} width="44" height="26" rx="7" className="fill-ink-50 stroke-ink-300" strokeWidth="1.5" strokeDasharray="4 3" />
            {[0, 1, 2].map((k) => (
              <circle key={k} cx={20 + k * 10} cy={y + 13} r="3.4" className={i === 1 ? 'fill-brand-400' : 'fill-ink-300'} />
            ))}
          </g>
        ))}
        <path d="M 62 55 C 110 20, 140 90, 168 55" className="stroke-brand-500" strokeWidth="2.5" strokeDasharray="6 5" fill="none" />
        <path d="M 160 49 L 170 55 L 160 61" className="stroke-brand-500" strokeWidth="2.5" fill="none" strokeLinecap="round" />
        <rect x="176" y="22" width="56" height="66" rx="12" className="fill-white stroke-brand-600" strokeWidth="2" />
        <circle cx="204" cy="44" r="10" className="fill-spark-300" />
        <rect x="190" y="62" width="28" height="5" rx="2.5" className="fill-ink-300" />
        <rect x="194" y="72" width="20" height="5" rx="2.5" className="fill-ink-200" />
      </svg>
      <figcaption className="mt-2 flex flex-wrap items-center gap-2 text-[13px] leading-snug text-ink-500">
        <VisualTag planned>Concept · Planned</VisualTag>
        <span>Creator invite links are planned and not built yet.</span>
      </figcaption>
    </figure>
  )
}

// ---- 9. Founding community ------------------------------------------------------

export function EarlyDoor() {
  return (
    <svg viewBox="0 0 96 80" aria-hidden="true" className="h-20 w-auto">
      <path d="M 30 72 L 30 12 L 66 12 L 66 72" className="stroke-white/50" strokeWidth="2.5" fill="none" />
      <path d="M 30 12 L 52 18 L 52 76 L 30 72 Z" className="fill-spark-400" />
      <path d="M 52 18 L 66 12 L 66 72 L 52 76 Z" className="fill-spark-200/30" />
      <circle cx="47" cy="46" r="2" className="fill-ink-900" />
      <path d="M 66 72 L 92 78 L 66 12" className="fill-spark-200/20" />
    </svg>
  )
}

export function ShapeSketch() {
  return (
    <svg viewBox="0 0 96 80" aria-hidden="true" className="h-20 w-auto">
      <rect x="18" y="8" width="44" height="64" rx="8" className="stroke-white/60" strokeWidth="2.5" fill="none" />
      <rect x="25" y="18" width="30" height="16" rx="3" className="fill-brand-300/60" />
      <rect x="25" y="40" width="30" height="5" rx="2.5" className="fill-white/40" />
      <rect x="25" y="50" width="20" height="5" rx="2.5" className="fill-white/40" />
      <rect x="56" y="30" width="34" height="24" rx="3" transform="rotate(8 73 42)" className="fill-spark-300" />
      <path d="M 62 40 L 82 42 M 62 47 L 76 48" className="stroke-ink-900/60" strokeWidth="2" strokeLinecap="round" transform="rotate(8 73 42)" />
    </svg>
  )
}
