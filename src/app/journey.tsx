import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { ChevronRight, X } from 'lucide-react'
import type { EarningsByState, GoalAudience, GoalStep, MyProgress, ProgressJourney } from './api'
import { useAppApi, useMyProfile } from './AppApiContext'
import { GoalRing, NEXT_ACTION, creatorJourneyShown, goalText, journeyProgress } from './progression'

/**
 * The progression journey across the app (SP-UAT-001 finding 4).
 *
 * One place loads the member's own progress from the server
 * (app_my_progress) and every surface reads it: the goal strip on Home, the
 * next goal on My Split, the path on My Goals, the hint on Discover, and the
 * progress shown after a recognized contribution or a new post. Nothing is
 * computed on the device beyond choosing which open goal to suggest: every
 * value, target and status is the server's. The approved goals can be pursued
 * in any order, so the suggestion is only the open goal closest to done,
 * never a required sequence. No new threshold, currency or incentive.
 */

export type Enabled = Extract<MyProgress, { enabled: true }>
type Ctx = { progress: MyProgress | null | undefined; refresh: () => Promise<MyProgress | null> }
const ProgressCtx = createContext<Ctx | null>(null)

export function ProgressProvider({ children }: { children: ReactNode }) {
  const api = useAppApi()
  const [progress, setProgress] = useState<MyProgress | null | undefined>(undefined)
  const refresh = useCallback(async () => {
    try {
      const p = await api.myProgress()
      setProgress(p)
      return p
    } catch {
      setProgress(null)
      return null
    }
  }, [api])
  useEffect(() => {
    void refresh()
  }, [refresh])
  return <ProgressCtx.Provider value={{ progress, refresh }}>{children}</ProgressCtx.Provider>
}

/** The shared progress, or null outside a provider (the surfaces then show nothing). */
export function useProgressContext(): Ctx | null {
  return useContext(ProgressCtx)
}

const TITLE: Record<GoalAudience, string> = { creator: 'Creator goals', consumer: 'Supporter goals' }
const ROLE: Record<GoalAudience, string> = { creator: 'as a creator', consumer: 'as a supporter' }

export type Suggestion = {
  audience: GoalAudience
  title: string
  journey: ProgressJourney
  step: GoalStep & { target: number }
  done: number
  total: number
  /** What reaching every goal of this journey unlocks: its locked (and paused) simulated amount. */
  unlockCents: number
}

/** The open goals of a journey whose goals are set, each with its share done (0 to 1). */
export function openSteps(j: ProgressJourney): Array<GoalStep & { target: number; share: number }> {
  if (j.status !== 'in_progress') return []
  return j.steps
    .filter((s): s is GoalStep & { target: number } => s.target !== null && s.value < s.target)
    .map((s) => ({ ...s, share: s.target > 0 ? s.value / s.target : 0 }))
}

/** The open goal closest to done, across the member's journeys: a suggestion, not an order. */
export function suggestNext(progress: Enabled): Suggestion | null {
  // Supporter goals first, so a tie (a brand-new member) suggests supporting before posting.
  const journeys = (['consumer', 'creator'] as const).filter((a) => a === 'consumer' || creatorJourneyShown(progress))
  let best: Suggestion | null = null
  let bestShare = -1
  for (const a of journeys) {
    const j = a === 'creator' ? progress.creator : progress.consumer
    const { set, done, total } = journeyProgress(j)
    if (!set) continue
    const e: EarningsByState = progress.earnings[a]
    for (const s of openSteps(j)) {
      // Closest to done first; on a tie, the journey with more goals done.
      const score = s.share + done / (total * 100)
      if (score > bestShare) {
        bestShare = score
        best = { audience: a, title: TITLE[a], journey: j, step: s, done, total, unlockCents: e.lockedCents + e.pausedCents }
      }
    }
  }
  return best
}

export function simulated(cents: number) {
  return `$${(cents / 100).toFixed(2)}`
}

/** "4 more to go": what remains of a step, in its own unit. */
export function remainingText(step: GoalStep & { target: number }) {
  const left = Math.max(0, step.target - step.value)
  const unit = goalText(step.metric).unit
  return `${left} more ${left === 1 ? unit.replace(/s$/, '') : unit} to go`
}

/** Why the next action matters, in one plain sentence tied to the approved unlock rule. */
export function whyItMatters(s: Suggestion) {
  const left = s.total - s.done
  const tail =
    s.unlockCents > 0
      ? `When all ${s.total} are met and checked, your locked ${simulated(s.unlockCents)} ${ROLE[s.audience]} unlocks (simulated during the pilot).`
      : `When all ${s.total} are met and checked, you qualify ${ROLE[s.audience]}.`
  return `It's one of the ${left} ${s.audience === 'creator' ? 'creator' : 'supporter'} goals you have left, in any order. ${tail}`
}

// ---------------------------------------------------------------------------
// Home: a compact, dismissible next step that never crowds the feed.

function todayKey() {
  const d = new Date()
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`
}

export function HomeGoalStrip() {
  const ctx = useProgressContext()
  const { profile } = useMyProfile()
  const key = `splitpost.goalstrip.${profile.id}`
  const [hidden, setHidden] = useState(() => {
    try {
      return window.localStorage.getItem(key) === todayKey()
    } catch {
      return false
    }
  })
  const p = ctx?.progress
  if (hidden || !p || !p.enabled) return null
  const s = suggestNext(p)
  if (!s) return null
  const action = NEXT_ACTION[s.step.metric]
  return (
    <div className="mb-4 flex items-center gap-3 rounded-2xl bg-white px-3 py-2.5 shadow-[0_1px_2px_rgb(19_25_27/0.06),0_0_0_1px_rgb(19_25_27/0.05)]" data-testid="goal-strip">
      <GoalRing done={s.done} total={s.total} size={38} tone={s.audience === 'creator' ? 'brand' : 'green'} />
      <Link to="/app/split?face=goals" className="min-w-0 flex-1 leading-tight">
        <span className="block truncate text-[13.5px] font-bold text-ink-900">
          {s.title}: {s.done} of {s.total}
        </span>
        <span className="block truncate text-[12.5px] text-ink-600">
          Next: {goalText(s.step.metric).label.toLowerCase().replace(/ \(last 28 days\)/, '')} · {Math.min(s.step.value, s.step.target)} of {s.step.target}
        </span>
      </Link>
      {action && (
        <Link to={action.to} className="inline-flex min-h-9 shrink-0 items-center rounded-full bg-brand-50 px-3 text-[12.5px] font-bold text-brand-700" aria-label={action.label}>
          Go <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
        </Link>
      )}
      <button
        type="button"
        aria-label="Hide for today"
        onClick={() => {
          try {
            window.localStorage.setItem(key, todayKey())
          } catch {
            // Hidden for this visit at least.
          }
          setHidden(true)
        }}
        className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-ink-500 hover:bg-ink-100"
      >
        <X className="h-4 w-4" aria-hidden="true" />
      </button>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Discover: connection-building goals, where connections are made.

const CONNECTION_METRICS = ['engaged_creators', 'clique_creators']

export function DiscoverGoalHint() {
  const p = useProgressContext()?.progress
  if (!p || !p.enabled || p.consumer.status !== 'in_progress') return null
  const step = openSteps(p.consumer).find((s) => CONNECTION_METRICS.includes(s.metric))
  if (!step) return null
  return (
    <Link
      to="/app/split?face=goals"
      className="mb-4 flex items-center gap-3 rounded-2xl bg-[#e7f4f1] px-4 py-3 text-[13.5px] text-[#173f37]"
      data-testid="discover-goal-hint"
    >
      <span className="min-w-0 flex-1">
        <strong className="font-semibold">{goalText(step.metric).label}</strong> is one of your supporter goals: {step.value} of {step.target}. Following and
        supporting creators here counts.
      </span>
      <ChevronRight className="h-4 w-4 shrink-0" aria-hidden="true" />
    </Link>
  )
}

// ---------------------------------------------------------------------------
// Onboarding: the first steps introduce the journey they start.

export function JourneyIntro() {
  const p = useProgressContext()?.progress
  if (!p || !p.enabled || p.consumer.status !== 'in_progress' || !journeyProgress(p.consumer).set) return null
  return (
    <p className="mt-1 text-[13px] text-ink-700" data-testid="journey-intro">
      These steps also start your supporter goals.{' '}
      <Link to="/app/split?face=goals" className="font-semibold text-brand-700 underline">
        See your goals
      </Link>
    </p>
  )
}
