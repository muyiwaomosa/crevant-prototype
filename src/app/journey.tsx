import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { ChevronRight } from 'lucide-react'
import type { EarningsByState, GoalAudience, GoalStep, MyProgress, ProgressJourney } from './api'
import { useAppApi } from './AppApiContext'
import { creatorJourneyShown, goalText, journeyProgress } from './progression'

/**
 * The progression journey across the app (SP-UAT-001 finding 4).
 *
 * One place loads the member's own progress from the server
 * (app_my_progress) and every surface reads it: the guide on Home, both
 * journeys on My Split, the hint on Discover, and the progress shown after a
 * recognized contribution, a Clique change or a new post. Nothing is
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
  const { pathname } = useLocation()
  const [progress, setProgress] = useState<MyProgress | null | undefined>(undefined)
  const last = useRef(0)
  const refresh = useCallback(async () => {
    last.current = Date.now()
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
  // Progress moves with other people's actions too (followers, Cliques, returning
  // supporters), so it is read again when the member moves around the app or
  // comes back to it, at most every 20 seconds.
  useEffect(() => {
    if (last.current > 0 && Date.now() - last.current > 20_000) void refresh()
  }, [pathname, refresh])
  useEffect(() => {
    const again = () => {
      if (document.visibilityState === 'visible' && Date.now() - last.current > 20_000) void refresh()
    }
    document.addEventListener('visibilitychange', again)
    return () => document.removeEventListener('visibilitychange', again)
  }, [refresh])
  return <ProgressCtx.Provider value={{ progress, refresh }}>{children}</ProgressCtx.Provider>
}

/** The shared progress, or null outside a provider (the surfaces then show nothing). */
export function useProgressContext(): Ctx | null {
  return useContext(ProgressCtx)
}

/**
 * The member's progress: the shared one (fresh on arrival) inside the app, or
 * its own read outside a provider. Undefined while loading, null where unavailable.
 */
export function useSharedProgress(): MyProgress | null | undefined {
  const api = useAppApi()
  const ctx = useProgressContext()
  const [local, setLocal] = useState<MyProgress | null | undefined>(undefined)
  const refresh = ctx?.refresh
  useEffect(() => {
    if (refresh) {
      void refresh()
      return
    }
    let live = true
    api.myProgress().then(
      (p) => live && setLocal(p),
      () => live && setLocal(null),
    )
    return () => {
      live = false
    }
  }, [api, refresh])
  return ctx ? ctx.progress : local
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
      ? `When all ${s.total} are met, an eligibility review starts; if it is approved, your locked ${simulated(s.unlockCents)} ${ROLE[s.audience]} unlocks (simulated during the pilot).`
      : `When all ${s.total} are met, an eligibility review starts; if it is approved, you qualify ${ROLE[s.audience]}.`
  return `It's one of the ${left} ${s.audience === 'creator' ? 'creator' : 'supporter'} goals you have left, in any order. ${tail}`
}

// ---------------------------------------------------------------------------
// Discover: the connection-building goal, where connections are made.

const CONNECTION_METRICS = ['engaged_creators', 'clique_creators']

export function DiscoverGoalHint() {
  const p = useProgressContext()?.progress
  if (!p || !p.enabled || p.consumer.status !== 'in_progress') return null
  const step = openSteps(p.consumer).find((s) => CONNECTION_METRICS.includes(s.metric))
  if (!step) return null
  const how =
    step.metric === 'clique_creators'
      ? 'Follow creators you value here, then choose who joins your Clique. Following alone doesn’t add anyone to it.'
      : 'Supporting different creators you find here counts.'
  return (
    <Link to="/app/split#goals" className="mb-4 flex items-center gap-3 rounded-2xl bg-[#e7f4f1] px-4 py-3 text-[13.5px] text-[#173f37]" data-testid="discover-goal-hint">
      <span className="min-w-0 flex-1">
        <strong className="font-semibold">{goalText(step.metric).label}</strong> is one of your supporter goals: {step.value} of {step.target}. {how}
      </span>
      <ChevronRight className="h-4 w-4 shrink-0" aria-hidden="true" />
    </Link>
  )
}
