/**
 * Viewed state for Unseen-first Home: deciding when a post counts as viewed,
 * and reporting views to the server without flooding it.
 *
 * A view is a client-observed UX signal (supabase/migrations/
 * 20261121000000_viewed_state.sql). It is never verified engagement and is
 * never used for Connection Points or rewards.
 *
 * The rules:
 *   - text and images: at least 50% of the post visible for 2 continuous
 *     seconds (createVisibilityTimer);
 *   - video: 3 seconds of actual playback, or reaching the end, whichever
 *     comes first (createPlaybackCounter; seeking doesn't count).
 *
 * Reporting (createViewQueue):
 *   - qualifying ids are queued and sent in one request when 10 are waiting,
 *     5 seconds after the first was queued, or when flushed (page hidden,
 *     leaving the page). One request at a time, at most 50 ids each;
 *   - an id is never sent twice in a session; own posts are never sent;
 *   - a failed batch goes to a bounded retry queue (at most 300 ids, kept in
 *     browser storage for the next visit), retried with backoff (2 s, 15 s,
 *     60 s) and when the connection returns or the member comes back, then
 *     dropped. A dropped view only means a post stays unseen.
 */
import { AppApiError, type ViewBasis } from './api'

export const VIEW_RULES = { visibleRatio: 0.5, visibleMs: 2000, playedMs: 3000 } as const
export const BATCH = { size: 10, waitMs: 5000, maxPerRequest: 50 } as const
export const RETRY = { maxQueued: 300, delaysMs: [2000, 15000, 60000] } as const

type Timer = ReturnType<typeof setTimeout>
export interface Clock {
  setTimeout(fn: () => void, ms: number): Timer
  clearTimeout(t: Timer): void
}
const realClock: Clock = { setTimeout: (fn, ms) => setTimeout(fn, ms), clearTimeout: (t) => clearTimeout(t) }

/** Errors that will never succeed on retry: drop the batch. */
function permanent(e: unknown) {
  return e instanceof AppApiError && ['too_many', 'invalid_request', 'not_signed_in', 'profile_incomplete'].includes(e.code)
}

type Pending = { ids: string[]; basis: ViewBasis; attempts: number }

export interface ViewQueue {
  report(postId: string, basis?: ViewBasis): void
  /** Send what's waiting now (page hidden, leaving the page). */
  flush(): void
  /** Try the retry queue now (connection back, member returned). */
  retryNow(): void
  /** For tests and diagnostics. */
  state(): { waiting: number; retrying: number; sent: number; inFlight: boolean }
  dispose(): void
}

export function createViewQueue(opts: {
  send: (ids: string[], basis: ViewBasis) => Promise<unknown>
  onSent?: (ids: string[]) => void
  storage?: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> | null
  storageKey?: string
  clock?: Clock
}): ViewQueue {
  const clock = opts.clock ?? realClock
  const seen = new Set<string>() // queued, in flight, sent or waiting to retry
  let waiting: Array<{ id: string; basis: ViewBasis }> = []
  let retry: Pending[] = []
  let inFlight = false
  let batchTimer: Timer | null = null
  let retryTimer: Timer | null = null
  let disposed = false

  // Views that failed on an earlier visit.
  try {
    const raw = opts.storageKey ? opts.storage?.getItem(opts.storageKey) : null
    const saved = raw ? (JSON.parse(raw) as Pending[]) : []
    if (Array.isArray(saved)) {
      retry = saved.filter((p) => Array.isArray(p.ids) && (p.basis === 'visible' || p.basis === 'played')).map((p) => ({ ids: p.ids.map(String), basis: p.basis, attempts: 0 }))
      retry.forEach((p) => p.ids.forEach((id) => seen.add(id)))
    }
  } catch {
    retry = []
  }

  function save() {
    if (!opts.storageKey || !opts.storage) return
    try {
      if (retry.length === 0) opts.storage.removeItem(opts.storageKey)
      else opts.storage.setItem(opts.storageKey, JSON.stringify(retry.map(({ ids, basis }) => ({ ids, basis }))))
    } catch {
      // Storage unavailable (private window): retries just won't survive a reload.
    }
  }

  function queueRetry(p: Pending) {
    retry.push(p)
    // Bounded: drop the oldest ids beyond the cap.
    let total = retry.reduce((n, r) => n + r.ids.length, 0)
    while (total > RETRY.maxQueued && retry.length > 0) {
      const oldest = retry[0]
      const over = total - RETRY.maxQueued
      if (oldest.ids.length <= over) {
        retry.shift()
        total -= oldest.ids.length
      } else {
        oldest.ids = oldest.ids.slice(over)
        total -= over
      }
    }
    save()
    scheduleRetry()
  }

  function scheduleRetry() {
    if (retryTimer || retry.length === 0 || disposed) return
    const attempts = Math.max(1, Math.min(...retry.map((r) => r.attempts)))
    const delay = RETRY.delaysMs[Math.min(attempts, RETRY.delaysMs.length) - 1]
    retryTimer = clock.setTimeout(() => {
      retryTimer = null
      retryNow()
    }, delay)
  }

  async function sendBatch(ids: string[], basis: ViewBasis, attempts: number) {
    inFlight = true
    try {
      await opts.send(ids, basis)
      opts.onSent?.(ids)
    } catch (e) {
      // Up to three retries (2 s, 15 s, 60 s apart), then the batch is dropped.
      if (!permanent(e) && attempts < RETRY.delaysMs.length) queueRetry({ ids, basis, attempts: attempts + 1 })
    } finally {
      inFlight = false
      if (!disposed) {
        if (waiting.length >= BATCH.size) flush()
        else if (waiting.length > 0) armBatchTimer()
        else if (retry.length > 0) scheduleRetry()
      }
    }
  }

  function armBatchTimer() {
    if (batchTimer || disposed) return
    batchTimer = clock.setTimeout(() => {
      batchTimer = null
      flush()
    }, BATCH.waitMs)
  }

  function flush() {
    if (batchTimer) {
      clock.clearTimeout(batchTimer)
      batchTimer = null
    }
    if (inFlight || waiting.length === 0 || disposed) return
    const basis = waiting[0].basis
    const batch = waiting.filter((w) => w.basis === basis).slice(0, BATCH.maxPerRequest)
    const taken = new Set(batch.map((b) => b.id))
    waiting = waiting.filter((w) => !taken.has(w.id))
    void sendBatch([...taken], basis, 0)
  }

  function retryNow() {
    if (retryTimer) {
      clock.clearTimeout(retryTimer)
      retryTimer = null
    }
    if (inFlight || retry.length === 0 || disposed) return
    const next = retry.shift()!
    save()
    void sendBatch(next.ids.slice(0, BATCH.maxPerRequest), next.basis, next.attempts)
    if (next.ids.length > BATCH.maxPerRequest) {
      retry.unshift({ ...next, ids: next.ids.slice(BATCH.maxPerRequest) })
      save()
    }
  }

  return {
    report(postId, basis = 'visible') {
      if (disposed || seen.has(postId)) return
      seen.add(postId)
      waiting.push({ id: postId, basis })
      if (waiting.length >= BATCH.size) flush()
      else armBatchTimer()
    },
    flush,
    retryNow,
    state: () => ({ waiting: waiting.length, retrying: retry.reduce((n, r) => n + r.ids.length, 0), sent: seen.size, inFlight }),
    dispose() {
      flush()
      disposed = true
      if (batchTimer) clock.clearTimeout(batchTimer)
      if (retryTimer) clock.clearTimeout(retryTimer)
    },
  }
}

/**
 * Text and images: fires once the post has been at least 50% visible for 2
 * continuous seconds. Dropping below 50% resets the timer.
 */
export function createVisibilityTimer(onViewed: () => void, clock: Clock = realClock) {
  let timer: Timer | null = null
  let done = false
  return {
    update(ratio: number) {
      if (done) return
      if (ratio >= VIEW_RULES.visibleRatio) {
        if (!timer) {
          timer = clock.setTimeout(() => {
            timer = null
            done = true
            onViewed()
          }, VIEW_RULES.visibleMs)
        }
      } else if (timer) {
        clock.clearTimeout(timer)
        timer = null
      }
    },
    cancel() {
      if (timer) clock.clearTimeout(timer)
      timer = null
    },
    get done() {
      return done
    },
  }
}

/**
 * Video: fires after 3 seconds of actual playback, or on reaching the end,
 * whichever comes first. Only time that passes while playing counts: jumps
 * (seeking) and paused time don't.
 */
export function createPlaybackCounter(onViewed: () => void) {
  let played = 0
  let last: number | null = null
  let playing = false
  let done = false
  const finish = () => {
    if (!done) {
      done = true
      onViewed()
    }
  }
  return {
    play(currentTime: number) {
      playing = true
      last = currentTime
    },
    pause() {
      playing = false
      last = null
    },
    seek(currentTime: number) {
      last = playing ? currentTime : null
    },
    timeUpdate(currentTime: number) {
      if (done || !playing) return
      if (last !== null) {
        const step = currentTime - last
        // Normal playback moves forward in small steps; anything else is a seek.
        if (step > 0 && step <= 1.5) played += step
      }
      last = currentTime
      if (played * 1000 >= VIEW_RULES.playedMs) finish()
    },
    ended() {
      finish()
    },
    get played() {
      return played
    },
  }
}
