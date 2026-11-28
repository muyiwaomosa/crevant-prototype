import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { Check, X } from 'lucide-react'
import { useAppApi, useMyProfile } from './AppApiContext'
import type { GoalAudience, GoalStep, MyProgress, PointsEntry } from './api'
import { useProgressContext } from './journey'
import { goalText, journeyProgress } from './progression'

/**
 * Contribution recognition (UX-03, Nov 27). After a comment, save, repost or
 * share, a short message confirms it only when the server has recorded a
 * Connection Points entry for it: nothing is inferred on the device, and a
 * contribution the server did not recognize shows nothing. Where progression
 * is on, it also says which goal the contribution counts toward. One message
 * at a time, polite to screen readers, gone after a few seconds.
 */

export const RECOGNIZED_ACTION: Record<string, string> = {
  meaningful_comment: 'Thoughtful comment',
  save: 'Save',
  repost: 'Repost',
  external_share: 'Share',
  qualified_referral: 'Referral',
  own_audience_referral: 'Referral',
}

/** The supporter goal each recognized action counts toward (approved SP-PRG-001 metrics). */
const ACTION_GOAL: Record<string, string> = {
  meaningful_comment: 'meaningful_engagements',
  save: 'meaningful_engagements',
  repost: 'meaningful_engagements',
  external_share: 'external_shares',
  qualified_referral: 'qualified_referrals',
}

type Shown = { id: number; title: string; detail: string; bar?: { value: number; target: number } }
type Api = { recognize: () => void; published: () => void; progressed: (metric: string, title: string) => Promise<void> }
const Ctx = createContext<Api>({ recognize: () => {}, published: () => {}, progressed: async () => {} })

/** Call after a contribution succeeds; it checks with the server and says something only if it was recorded. */
export function useRecognize() {
  return useContext(Ctx).recognize
}

/**
 * Call after an action that moves a supporter goal directly (adding someone to
 * your Clique): it reads progress back from the server and says how far the
 * goal has come, only if the server's value went up.
 */
export function useProgressFeedback() {
  return useContext(Ctx).progressed
}

/** Call after a post is published: it reads creator progress from the server and shows the step it moved. */
export function usePublishedRecognition() {
  return useContext(Ctx).published
}

/** The message after a new post: the creator goal for original posts, as the server now reports it. */
export function publishedText(progress: MyProgress | null): Shown | null {
  if (!progress?.enabled || progress.creator.status !== 'in_progress') return null
  const step = progress.creator.steps.find((s) => s.metric === 'original_posts')
  if (!step || step.target === null) return null
  const v = Math.min(step.value, step.target)
  if (step.value >= step.target) return { id: -1, title: 'Goal complete: publish original posts', detail: `${step.target} of ${step.target}. It counts toward your creator goals.`, bar: { value: v, target: step.target } }
  return { id: -1, title: 'Post published', detail: `Creator goals: ${goalText(step.metric).label.toLowerCase()}, ${v} of ${step.target}.`, bar: { value: v, target: step.target } }
}

/** The message for one recorded entry: what was recognized and, if known, the goal it moved. */
export function recognitionText(entry: PointsEntry, progress: MyProgress | null): Shown | null {
  const label = RECOGNIZED_ACTION[entry.action]
  if (!label || entry.points <= 0 || !['recognized', 'pending_review', 'approved'].includes(entry.status)) return null
  if (entry.status === 'pending_review') return { id: entry.id, title: `${label} recorded`, detail: 'It counts once a quick review is done.' }
  let detail = 'It counts toward your Connection Points.'
  const metric = ACTION_GOAL[entry.action]
  if (progress?.enabled && metric && progress.consumer.status === 'in_progress') {
    const step: GoalStep | undefined = progress.consumer.steps.find((s) => s.metric === metric)
    if (step && step.target !== null)
      return {
        id: entry.id,
        title: step.value >= step.target ? `Goal complete: ${goalText(metric).label.toLowerCase()}` : `${label} recognized`,
        detail: `It counts toward your supporter goals: ${Math.min(step.value, step.target)} of ${step.target}.`,
        bar: { value: Math.min(step.value, step.target), target: step.target },
      }
  }
  return { id: entry.id, title: `${label} recognized`, detail }
}

const WINDOW_MS = 2 * 60 * 1000

const WHO: Record<GoalAudience, string> = { creator: 'creator', consumer: 'supporter' }

type Snapshot = { met: string[]; status: Record<string, string> }

function snapshot(p: Extract<MyProgress, { enabled: true }>): Snapshot {
  const met: string[] = []
  const status: Record<string, string> = {}
  for (const a of ['consumer', 'creator'] as const) {
    const j = p[a]
    status[a] = j.status
    for (const st of j.steps) if (st.target !== null && st.value >= st.target) met.push(`${a}:${st.metric}:${j.goalsSince ?? ''}`)
  }
  return { met, status }
}

/**
 * Milestones reached since the member last looked, on this device (approved
 * for the MVP), as one quiet message: a qualification decision first, then a
 * goal met. Many goals are moved by other people (followers, Cliques,
 * returning supporters), so this reads the server's progress whenever it is
 * refreshed. The first time on a device only records where things stand.
 */
export function milestoneText(before: Snapshot, p: Extract<MyProgress, { enabled: true }>): Shown | null {
  const now = snapshot(p)
  for (const a of ['consumer', 'creator'] as const) {
    if (before.status[a] === now.status[a]) continue
    if (now.status[a] === 'under_review')
      return { id: -2, title: `All 5 ${WHO[a]} goals met`, detail: 'Your eligibility review has started. Nothing unlocks until it is approved.' }
    if (now.status[a] === 'qualified')
      return { id: -2, title: `Qualified as a ${WHO[a]}`, detail: 'Your eligibility review was approved. Your simulated earnings for this journey are unlocked.' }
  }
  const fresh = now.met.filter((m) => !before.met.includes(m))
  if (fresh.length === 0) return null
  const [a, metric] = fresh[0].split(':') as [GoalAudience, string]
  const { done, total } = journeyProgress(p[a])
  return {
    id: -2,
    title: `Goal complete: ${goalText(metric).label.replace(/ \(last 28 days\)/, '').toLowerCase()}`,
    detail: `That's ${done} of your ${total} ${WHO[a]} goals.${fresh.length > 1 ? ` And ${fresh.length - 1} more since you last looked.` : ''}`,
    bar: { value: done, target: total },
  }
}

export function RecognitionProvider({ children }: { children: ReactNode }) {
  const api = useAppApi()
  const { profile } = useMyProfile()
  const progressCtx = useProgressContext()
  const [shown, setShown] = useState<Shown | null>(null)
  const announced = useRef<Set<number>>(new Set())
  const timer = useRef<number | undefined>(undefined)
  const lastShown = useRef(0)

  const show = useCallback((text: Shown) => {
    lastShown.current = Date.now()
    setShown(text)
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => setShown(null), 5000)
  }, [])

  // Milestones and qualification decisions, whenever the shared progress changes.
  const current = progressCtx?.progress
  useEffect(() => {
    if (!current || !current.enabled) return
    const key = `splitpost.milestones.${profile.id}`
    let before: Snapshot | null = null
    try {
      const raw = window.localStorage.getItem(key)
      before = raw ? (JSON.parse(raw) as Snapshot) : null
    } catch {
      before = null
    }
    try {
      window.localStorage.setItem(key, JSON.stringify(snapshot(current)))
    } catch {
      // Recognized again next time at worst.
    }
    if (!before || !Array.isArray(before.met)) return
    const text = milestoneText(before, current)
    // One message at a time: a contribution message just shown already says it.
    if (text && Date.now() - lastShown.current > 1500) show(text)
  }, [current, profile.id, show])

  const recognize = useCallback(() => {
    const asked = Date.now()
    void (async () => {
      try {
        const rows = await api.myPointsHistory()
        const latest = rows.find((r) => !announced.current.has(r.id) && Math.abs(asked - Date.parse(r.createdAt)) < WINDOW_MS)
        if (!latest) return
        announced.current.add(latest.id)
        // Refreshing the shared progress also moves the goal strip and the rest of the app.
        const progress = progressCtx ? await progressCtx.refresh() : await api.myProgress().catch(() => null)
        const text = recognitionText(latest, progress)
        if (!text) return
        show(text)
      } catch {
        // Recognition is a courtesy: never interrupt the member over it.
      }
    })()
  }, [api, progressCtx, show])

  const published = useCallback(() => {
    void (async () => {
      const progress = progressCtx ? await progressCtx.refresh() : await api.myProgress().catch(() => null)
      const text = publishedText(progress)
      if (text) show(text)
    })()
  }, [api, progressCtx, show])


  useEffect(() => () => window.clearTimeout(timer.current), [])

  const progressed = useCallback(
    async (metric: string, title: string) => {
      if (!progressCtx) return
      const value = (p: MyProgress | null | undefined) =>
        p && p.enabled && p.consumer.status === 'in_progress' ? p.consumer.steps.find((st) => st.metric === metric) : undefined
      const before = value(progressCtx.progress)?.value
      try {
        const after = value(await progressCtx.refresh())
        if (!after || after.target === null || before === undefined || after.value <= before) return
        const v = Math.min(after.value, after.target)
        show({
          id: -3,
          title: after.value >= after.target ? `Goal complete: ${goalText(metric).label.toLowerCase()}` : title,
          detail: `It counts toward your supporter goals: ${goalText(metric).label.toLowerCase()}, ${v} of ${after.target}.`,
          bar: { value: v, target: after.target },
        })
      } catch {
        // A courtesy only.
      }
    },
    [progressCtx, show],
  )

  return (
    <Ctx.Provider value={{ recognize, published, progressed }}>
      {children}
      <div aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-20 z-50 flex justify-center px-4 md:bottom-6">
        {shown && (
          <div
            className="pointer-events-auto flex w-full max-w-sm items-center gap-3 rounded-2xl bg-[#13203f] px-4 py-3 text-white shadow-lg motion-safe:animate-[rise_.25s_ease-out]"
            data-testid="recognition"
          >
            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-[#0f7a64]" aria-hidden="true">
              <Check className="h-4 w-4" strokeWidth={3} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[14px] font-semibold">{shown.title}</span>
              <span className="block text-[12.5px] text-[#c9d4ea]">{shown.detail}</span>
              {shown.bar && (
                <span className="mt-1.5 block h-1.5 overflow-hidden rounded-full bg-white/20" aria-hidden="true" data-testid="recognition-bar">
                  <span className="block h-full rounded-full bg-[#a8d9cf]" style={{ width: `${Math.round((shown.bar.value / shown.bar.target) * 100)}%` }} />
                </span>
              )}
            </span>
            <button type="button" onClick={() => setShown(null)} className="rounded-full p-1 text-[#c9d4ea] hover:text-white" aria-label="Dismiss">
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        )}
      </div>
    </Ctx.Provider>
  )
}
