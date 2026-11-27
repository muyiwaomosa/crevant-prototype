import { useEffect, useRef, useState, type PointerEvent, type ReactNode } from 'react'
import clsx from 'clsx'
import { ArrowLeft, Bookmark, Check, Lock, MessageCircle, Share2 } from 'lucide-react'
import { SplitpostLogo } from '../logo/SplitpostLogo'
import { MySplitIcon } from '../components/MySplitIcon'

/**
 * The value-first welcome (SP-UX-002, Nov 27): five full-screen faces for
 * someone who has never heard of Splitpost. Benefit first, feature second,
 * one short sentence or two each, an illustration for the rest. Skip, Back,
 * Continue and Get started; swipe and arrow keys too; no motion when the
 * member prefers reduced motion. Shown once before first-time setup, and any
 * time from Profile, Settings, "How Splitpost works". Nothing here promises
 * earnings: every amount in the pilot is simulated and said to be.
 */

type Face = { title: string; body: string; note?: string; art: ReactNode; tint: string }

export const WELCOME_FACES: Array<Omit<Face, 'art' | 'tint'>> = [
  {
    title: "Don't just post. Get your split.",
    body: 'On most social apps, the value you create goes to the platform. Splitpost shares it with the creators who post and the people who support them.',
    note: 'During the pilot, every amount is simulated and nothing is paid.',
  },
  {
    title: 'Your people. Your feed.',
    body: 'Follow the people you value and keep your favourites close in your Clique. Home shows their posts, newest first. Nobody is added for you.',
  },
  {
    title: 'Your support counts.',
    body: 'A thoughtful comment, a save or a share helps a creator grow. Splitpost notices, and recognizes it with Connection Points.',
  },
  {
    title: 'Grow. Qualify. Earn.',
    body: 'Simple goals show what to do next. Reach them and the split you have built unlocks, as a creator, a supporter, or both.',
    note: 'Pilot earnings are simulated. Points are not money.',
  },
  {
    title: 'Make it yours.',
    body: 'Post what you love, support who you value, or both, all from one account. Start by finding a few people worth following.',
  },
]

const SWIPE_MIN = 48

function reducedMotion() {
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches
  } catch {
    return false
  }
}

export function WelcomeIntro({ onDone, doneLabel = 'Get started' }: { onDone: () => void; doneLabel?: string }) {
  const [i, setI] = useState(0)
  const [enter, setEnter] = useState<'left' | 'right' | null>(null)
  const heading = useRef<HTMLHeadingElement | null>(null)
  const drag = useRef<{ x: number; y: number } | null>(null)
  const last = WELCOME_FACES.length - 1
  const first = useRef(true)

  useEffect(() => {
    if (first.current) {
      first.current = false
      return
    }
    heading.current?.focus()
  }, [i])

  function go(to: number) {
    if (to < 0 || to > last) return
    setEnter(to > i ? 'right' : 'left')
    setI(to)
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'ArrowRight') go(i + 1)
    else if (e.key === 'ArrowLeft') go(i - 1)
    else if (e.key === 'Escape') onDone()
    else return
    e.preventDefault()
  }
  function onPointerDown(e: PointerEvent) {
    if ((e.target as HTMLElement).closest('button, a')) return
    drag.current = { x: e.clientX, y: e.clientY }
  }
  function onPointerUp(e: PointerEvent) {
    const d = drag.current
    drag.current = null
    if (!d) return
    const dx = e.clientX - d.x
    if (Math.abs(dx) < SWIPE_MIN || Math.abs(dx) < Math.abs(e.clientY - d.y) * 1.5) return
    go(i + (dx < 0 ? 1 : -1))
  }

  const face = WELCOME_FACES[i]
  const anim = enter && !reducedMotion() ? (enter === 'right' ? 'animate-[face-in-right_.32s_ease-out]' : 'animate-[face-in-left_.32s_ease-out]') : ''
  return (
    <div
      className="fixed inset-0 z-[60] flex flex-col overflow-y-auto bg-paper"
      role="dialog"
      aria-modal="true"
      aria-labelledby="welcome-title"
      onKeyDown={onKeyDown}
      data-testid="welcome"
    >
      <div
        className="mx-auto flex w-full max-w-md flex-1 flex-col px-6 pb-8 pt-[max(env(safe-area-inset-top),16px)] md:max-w-3xl md:justify-center"
        onPointerDown={onPointerDown}
        onPointerUp={onPointerUp}
      >
        <div className="flex h-12 items-center justify-between">
          {i > 0 ? (
            <button type="button" onClick={() => go(i - 1)} className="inline-flex items-center gap-1 rounded-full px-2 py-2 text-[15px] font-semibold text-ink-700 hover:text-ink-900">
              <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Back
            </button>
          ) : (
            <span />
          )}
          {i < last && (
            <button type="button" onClick={onDone} className="rounded-full px-2 py-2 text-[15px] font-semibold text-ink-600 hover:text-ink-900">
              Skip
            </button>
          )}
        </div>
        <section key={i} aria-roledescription="slide" aria-label={`${i + 1} of ${WELCOME_FACES.length}`} className={clsx('mt-2 flex flex-1 flex-col md:grid md:flex-none md:grid-cols-2 md:items-center md:gap-10', anim)}>
          <Art index={i} />
          <div className="mt-7 md:mt-0">
            <h1 id="welcome-title" ref={heading} tabIndex={-1} className="font-display text-[32px] font-extrabold leading-[1.05] tracking-tight text-ink-900 outline-none md:text-[40px]">
              {face.title}
            </h1>
            <p className="mt-3 text-[17px] leading-relaxed text-ink-700">{face.body}</p>
            {face.note && (
              <p className="mt-3 inline-flex rounded-full bg-[#e7f4f1] px-3 py-1 text-[13px] font-semibold text-[#1f5e52]" data-testid="welcome-note">
                {face.note}
              </p>
            )}
          </div>
        </section>
        <div className="mt-8">
          <div className="mb-5 flex justify-center gap-1.5" aria-hidden="true">
            {WELCOME_FACES.map((_, k) => (
              <span key={k} className={clsx('h-2 rounded-full transition-all motion-reduce:transition-none', k === i ? 'w-6 bg-brand-600' : 'w-2 bg-ink-200')} />
            ))}
          </div>
          <p className="sr-only" aria-live="polite">
            {i + 1} of {WELCOME_FACES.length}
          </p>
          <button
            type="button"
            onClick={() => (i === last ? onDone() : go(i + 1))}
            className="flex min-h-[52px] w-full items-center justify-center rounded-full bg-brand-600 px-6 text-[16px] font-bold text-white shadow-[0_8px_18px_-8px_rgba(36,71,166,0.8)] hover:bg-brand-700 md:mx-auto md:max-w-sm"
          >
            {i === last ? doneLabel : 'Continue'}
          </button>
        </div>
      </div>
    </div>
  )
}

/** One decorative illustration per face (the words carry the meaning). */
function Art({ index }: { index: number }) {
  const frame = 'relative grid h-[260px] place-items-center overflow-hidden rounded-[30px] md:h-[340px]'
  const avatar = (label: string, color: string, size = 64) => (
    <span className="grid place-items-center rounded-full border-4 border-white font-bold text-white shadow-md" style={{ width: size, height: size, background: color, fontSize: size / 3.2 }}>
      {label}
    </span>
  )
  if (index === 0)
    return (
      <div className={clsx(frame, 'bg-brand-600')} aria-hidden="true">
        <div className="absolute -right-10 -top-10 h-44 w-44 rounded-full bg-white/10" />
        <div className="absolute -bottom-12 -left-8 h-40 w-40 rounded-full bg-[#a8d9cf]/20" />
        <div className="flex flex-col items-center gap-4">
          <SplitpostLogo className="h-24 w-24 drop-shadow-xl" />
          <div className="flex items-center gap-2 rounded-full bg-[#1b3a8f] px-4 py-2 text-[14px] font-semibold text-white">
            <span className="h-2.5 w-2.5 rounded-full bg-[#f6b888]" /> Creators <span className="mx-1 opacity-60">+</span>
            <span className="h-2.5 w-2.5 rounded-full bg-[#a8d9cf]" /> Supporters
          </div>
        </div>
      </div>
    )
  if (index === 1)
    return (
      <div className={clsx(frame, 'bg-[#e7f4f1]')} aria-hidden="true">
        <div className="flex gap-3">
          {[
            ['AM', '#0f7a64'],
            ['DJ', '#2447a6'],
            ['LT', '#94481a'],
          ].map(([l, c]) => (
            <span key={l} className="rounded-full p-[3px]" style={{ background: 'conic-gradient(#f6b888,#a8d9cf,#f6b888)' }}>
              {avatar(l, c, 62)}
            </span>
          ))}
        </div>
        <div className="absolute bottom-6 left-6 right-6 rounded-2xl bg-white p-3 shadow-md">
          <div className="flex items-center gap-2">
            {avatar('AM', '#0f7a64', 30)}
            <span className="h-2.5 w-24 rounded-full bg-ink-200" />
          </div>
          <span className="mt-2 block h-2.5 w-4/5 rounded-full bg-ink-100" />
        </div>
      </div>
    )
  if (index === 2)
    return (
      <div className={clsx(frame, 'bg-[#fef4ec]')} aria-hidden="true">
        <div className="grid w-64 gap-2.5">
          {[
            [MessageCircle, 'Thoughtful comment'],
            [Bookmark, 'Saved a post'],
            [Share2, 'Shared with a friend'],
          ].map(([Icon, t]) => {
            const I = Icon as typeof MessageCircle
            return (
              <span key={t as string} className="flex items-center gap-3 rounded-2xl bg-white px-3.5 py-2.5 text-[14px] font-semibold text-ink-900 shadow-sm">
                <I className="h-4 w-4 text-brand-600" />
                <span className="flex-1">{t as string}</span>
                <span className="grid h-6 w-6 place-items-center rounded-full bg-[#0f7a64] text-white">
                  <Check className="h-3.5 w-3.5" strokeWidth={3} />
                </span>
              </span>
            )
          })}
        </div>
      </div>
    )
  if (index === 3)
    return (
      <div className={clsx(frame, 'bg-[#3156b5]')} aria-hidden="true">
        <div className="flex flex-col items-center text-white">
          <span className="relative grid h-[132px] w-[132px] place-items-center">
            <svg width="132" height="132" viewBox="0 0 48 48" className="absolute inset-0">
              <circle cx="24" cy="24" r="20" fill="none" stroke="rgba(255,255,255,.22)" strokeWidth="5" />
              <circle cx="24" cy="24" r="20" fill="none" stroke="#fff" strokeWidth="5" strokeLinecap="round" strokeDasharray="75.4 125.7" transform="rotate(-90 24 24)" />
            </svg>
            <span className="font-display text-[30px] font-extrabold">3/5</span>
          </span>
          <span className="mt-3" />
          <span className="flex items-center gap-1.5 rounded-full bg-[#263f86] px-3 py-1.5 text-[13px] font-semibold">
            <Lock className="h-3.5 w-3.5" /> Unlocks at 5 of 5
          </span>
        </div>
      </div>
    )
  return (
    <div className={clsx(frame, 'bg-[#172f70]')} aria-hidden="true">
      <div className="flex flex-col items-center text-white">
        <MySplitIcon className="h-16 w-16 text-[#a8d9cf]" strokeWidth={1.8} />
        <div className="mt-4 flex gap-2 text-[14px] font-semibold">
          <span className="rounded-full bg-[#2c4385] px-3 py-1.5">Post</span>
          <span className="rounded-full bg-[#2c4385] px-3 py-1.5">Support</span>
          <span className="rounded-full bg-white px-3 py-1.5 text-[#172f70]">Both</span>
        </div>
      </div>
    </div>
  )
}

const seenKey = (id: string) => `splitpost.welcome.${id}`

/** Whether this account has seen (or skipped) the welcome on this device. */
export function welcomeSeen(id: string) {
  try {
    return window.localStorage.getItem(seenKey(id)) === 'seen'
  } catch {
    return true
  }
}
export function markWelcomeSeen(id: string) {
  try {
    window.localStorage.setItem(seenKey(id), 'seen')
  } catch {
    // Shown again at worst; it can always be skipped.
  }
}
