import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { buttonClass } from '../components/ui'
import { useMyProfile } from './AppApiContext'

/**
 * The app tour (Nov 28): an optional, skippable, replayable walk through the
 * five destinations in the main navigation. It only points at what is there:
 * it never navigates, changes anything or blocks the app. Offered once inside
 * the Home guide; replayed from Profile, Help & getting started. Whether it
 * was seen is remembered on this device only (approved for the MVP).
 */

export const TOUR_STOPS: Array<{ key: string; title: string; body: string }> = [
  { key: 'home', title: 'Home', body: 'Posts from the people you follow, newest first, with your Clique first. Your getting-started steps and goals sit at the top.' },
  { key: 'discover', title: 'Discover', body: 'Find people and posts worth your time. Search, or switch between For you, People and Topics.' },
  { key: 'create', title: 'Create', body: 'Share a post when you want to. Posting is optional: supporting the creators you value counts too.' },
  { key: 'split', title: 'My Split', body: 'Your simulated rewards, Connection Points and both goal journeys, with what to do next.' },
  { key: 'profile', title: 'Profile', body: 'Your posts, Your Insights, and Help & getting started, where you can take this tour again.' },
]

const tourKey = (id: string) => `splitpost.tour.${id}`

export function tourSeen(id: string) {
  try {
    return window.localStorage.getItem(tourKey(id)) !== null
  } catch {
    return false
  }
}

export function markTourSeen(id: string) {
  try {
    window.localStorage.setItem(tourKey(id), 'seen')
  } catch {
    // Offered again next time at worst.
  }
}

type Tour = { start: () => void }
const TourCtx = createContext<Tour | null>(null)

/** The tour's controls, or null outside the members area. */
export function useTour() {
  return useContext(TourCtx)
}

export function TourProvider({ children }: { children: ReactNode }) {
  const { profile } = useMyProfile()
  const [step, setStep] = useState<number | null>(null)
  const start = useCallback(() => setStep(0), [])
  const finish = useCallback(() => {
    markTourSeen(profile.id)
    setStep(null)
  }, [profile.id])
  return (
    <TourCtx.Provider value={{ start }}>
      {children}
      {step !== null && <TourStop step={step} onStep={setStep} onFinish={finish} />}
    </TourCtx.Provider>
  )
}

/** The visible navigation item for a stop (the phone tab bar or the sidebar, whichever is shown). */
function target(key: string): DOMRect | null {
  for (const el of Array.from(document.querySelectorAll<HTMLElement>(`[data-tour="${key}"]`))) {
    const r = el.getBoundingClientRect()
    if (r.width > 0 && r.height > 0) return r
  }
  return null
}

function TourStop({ step, onStep, onFinish }: { step: number; onStep: (n: number) => void; onFinish: () => void }) {
  const stop = TOUR_STOPS[step]
  const last = step === TOUR_STOPS.length - 1
  const [rect, setRect] = useState<DOMRect | null>(null)
  const next = useRef<HTMLButtonElement | null>(null)
  const dialog = useRef<HTMLDivElement | null>(null)
  const returnTo = useRef<Element | null>(null)
  useLayoutEffect(() => {
    const measure = () => setRect(target(stop.key))
    measure()
    window.addEventListener('resize', measure)
    return () => window.removeEventListener('resize', measure)
  }, [stop.key])
  useEffect(() => {
    if (!returnTo.current) returnTo.current = document.activeElement
    next.current?.focus()
  }, [step])
  useEffect(() => {
    const prev = returnTo
    return () => {
      if (prev.current instanceof HTMLElement) prev.current.focus()
    }
  }, [])
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onFinish()
      // Keep keyboard focus inside the tour card while it is open.
      if (e.key === 'Tab' && dialog.current) {
        const items = Array.from(dialog.current.querySelectorAll<HTMLElement>('button'))
        if (items.length === 0) return
        const i = items.indexOf(document.activeElement as HTMLElement)
        e.preventDefault()
        items[(i + (e.shiftKey ? -1 : 1) + items.length) % items.length].focus()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onFinish])
  const pad = 4
  // Below the middle of the screen (the phone tab bar): the card sits above it. Otherwise (the sidebar): beside it.
  const below = rect ? rect.top > window.innerHeight / 2 : false
  const cardStyle: React.CSSProperties = !rect
    ? { left: 16, right: 16, bottom: 96 }
    : below
      ? { left: 16, right: 16, bottom: window.innerHeight - rect.top + 16 }
      : { left: rect.right + 16, top: Math.max(16, Math.min(rect.top - 16, window.innerHeight - 260)), width: 340 }
  return (
    <div className="fixed inset-0 z-[60]" data-testid="app-tour">
      {rect ? (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute rounded-2xl ring-[3px] ring-white"
          style={{ left: rect.left - pad, top: rect.top - pad, width: rect.width + pad * 2, height: rect.height + pad * 2, boxShadow: '0 0 0 9999px rgb(15 20 30 / 0.62)' }}
        />
      ) : (
        <div aria-hidden="true" className="absolute inset-0 bg-[rgb(15_20_30/0.62)]" />
      )}
      <div ref={dialog} role="dialog" aria-modal="true" aria-labelledby="tour-title" aria-describedby="tour-body" className="absolute max-w-md rounded-[22px] bg-white p-5 shadow-xl" style={cardStyle}>
        <p className="text-[12px] font-bold uppercase tracking-wide text-brand-700">
          {step + 1} of {TOUR_STOPS.length}
        </p>
        <h2 id="tour-title" className="mt-1 font-display text-[20px] font-extrabold text-ink-900">
          {stop.title}
        </h2>
        <p id="tour-body" className="mt-1 text-[15px] leading-relaxed text-ink-700">
          {stop.body}
        </p>
        <div className="mt-4 flex items-center justify-between gap-2">
          <button type="button" onClick={onFinish} className="text-[14px] font-semibold text-ink-600 hover:text-ink-900">
            Skip tour
          </button>
          <div className="flex gap-2">
            {step > 0 && (
              <button type="button" onClick={() => onStep(step - 1)} className={buttonClass('secondary', 'sm')}>
                Back
              </button>
            )}
            <button ref={next} type="button" onClick={() => (last ? onFinish() : onStep(step + 1))} className={buttonClass('primary', 'sm')}>
              {last ? 'Done' : 'Next'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
