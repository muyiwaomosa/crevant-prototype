import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { Check, X } from 'lucide-react'
import { useAppApi } from './AppApiContext'
import type { GoalStep, MyProgress, PointsEntry } from './api'

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

type Shown = { id: number; title: string; detail: string }
const Ctx = createContext<() => void>(() => {})

/** Call after a contribution succeeds; it checks with the server and says something only if it was recorded. */
export function useRecognize() {
  return useContext(Ctx)
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
    if (step && step.target !== null) detail = `It counts toward your supporter goals: ${Math.min(step.value, step.target)} of ${step.target}.`
  }
  return { id: entry.id, title: `${label} recognized`, detail }
}

const WINDOW_MS = 2 * 60 * 1000

export function RecognitionProvider({ children }: { children: ReactNode }) {
  const api = useAppApi()
  const [shown, setShown] = useState<Shown | null>(null)
  const announced = useRef<Set<number>>(new Set())
  const timer = useRef<number | undefined>(undefined)

  const recognize = useCallback(() => {
    const asked = Date.now()
    void (async () => {
      try {
        const rows = await api.myPointsHistory()
        const latest = rows.find((r) => !announced.current.has(r.id) && Math.abs(asked - Date.parse(r.createdAt)) < WINDOW_MS)
        if (!latest) return
        announced.current.add(latest.id)
        const progress = await api.myProgress().catch(() => null)
        const text = recognitionText(latest, progress)
        if (!text) return
        setShown(text)
        window.clearTimeout(timer.current)
        timer.current = window.setTimeout(() => setShown(null), 5000)
      } catch {
        // Recognition is a courtesy: never interrupt the member over it.
      }
    })()
  }, [api])

  useEffect(() => () => window.clearTimeout(timer.current), [])

  return (
    <Ctx.Provider value={recognize}>
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
