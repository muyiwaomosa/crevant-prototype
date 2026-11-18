import { createContext, useCallback, useContext, useEffect, useMemo, useRef, type ReactNode } from 'react'
import { useAppApi } from './AppApiContext'
import { createViewQueue, createVisibilityTimer, type ViewQueue } from './views'

/**
 * Watches posts on screen and reports the ones that count as viewed (see
 * views.ts for the rules and the batching). One IntersectionObserver for the
 * whole members area. Browsers without IntersectionObserver report nothing,
 * which only means posts stay unseen.
 */
type Tracker = {
  observe: (el: Element, postId: string) => () => void
  /** Called with the ids of each batch the server accepted. */
  subscribe: (fn: (ids: string[]) => void) => () => void
}

const TrackerContext = createContext<Tracker | null>(null)

function browserStorage() {
  try {
    return typeof window !== 'undefined' ? window.localStorage : null
  } catch {
    return null
  }
}

export function ViewTrackerProvider({ userId, children }: { userId: string; children: ReactNode }) {
  const api = useAppApi()
  const listeners = useRef(new Set<(ids: string[]) => void>())
  const queueRef = useRef<ViewQueue | null>(null)
  const watched = useRef(new Map<Element, ReturnType<typeof createVisibilityTimer>>())
  const observerRef = useRef<IntersectionObserver | null>(null)

  useEffect(() => {
    const queue = createViewQueue({
      send: (ids, basis) => api.markViewed(ids, basis),
      onSent: (ids) => listeners.current.forEach((fn) => fn(ids)),
      storage: browserStorage(),
      storageKey: `splitpost:pending-views:${userId}`,
    })
    queueRef.current = queue
    const onHide = () => {
      if (document.visibilityState === 'hidden') queue.flush()
      else queue.retryNow()
    }
    const onOnline = () => queue.retryNow()
    document.addEventListener('visibilitychange', onHide)
    window.addEventListener('online', onOnline)
    window.addEventListener('pagehide', queue.flush)
    // Views that failed on an earlier visit.
    const first = setTimeout(() => queue.retryNow(), 1000)
    return () => {
      clearTimeout(first)
      document.removeEventListener('visibilitychange', onHide)
      window.removeEventListener('online', onOnline)
      window.removeEventListener('pagehide', queue.flush)
      queue.dispose()
      queueRef.current = null
    }
  }, [api, userId])

  useEffect(() => {
    if (typeof IntersectionObserver === 'undefined') return
    const map = watched.current
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) map.get(entry.target)?.update(entry.isIntersecting ? entry.intersectionRatio : 0)
      },
      { threshold: [0, 0.5, 1] },
    )
    observerRef.current = observer
    map.forEach((_, el) => observer.observe(el))
    return () => {
      observer.disconnect()
      observerRef.current = null
      map.forEach((t) => t.cancel())
    }
  }, [])

  const observe = useCallback((el: Element, postId: string) => {
    const map = watched.current
    const timer = createVisibilityTimer(() => {
      queueRef.current?.report(postId, 'visible')
      observerRef.current?.unobserve(el)
      map.delete(el)
    })
    map.set(el, timer)
    observerRef.current?.observe(el)
    return () => {
      timer.cancel()
      observerRef.current?.unobserve(el)
      map.delete(el)
    }
  }, [])

  const subscribe = useCallback((fn: (ids: string[]) => void) => {
    listeners.current.add(fn)
    return () => {
      listeners.current.delete(fn)
    }
  }, [])

  const value = useMemo(() => ({ observe, subscribe }), [observe, subscribe])
  return <TrackerContext.Provider value={value}>{children}</TrackerContext.Provider>
}

/** A ref for a post's element: reports it once it counts as viewed. Pass enabled=false for your own posts. */
export function useTrackView(postId: string, enabled = true) {
  const tracker = useContext(TrackerContext)
  const stop = useRef<(() => void) | null>(null)
  return useCallback(
    (el: Element | null) => {
      stop.current?.()
      stop.current = null
      if (el && enabled && tracker) stop.current = tracker.observe(el, postId)
    },
    [tracker, postId, enabled],
  )
}

/** Runs fn after each batch of views the server accepted (for example, to refresh the strip). */
export function useViewsSent(fn: (ids: string[]) => void) {
  const tracker = useContext(TrackerContext)
  const latest = useRef(fn)
  latest.current = fn
  useEffect(() => tracker?.subscribe((ids) => latest.current(ids)), [tracker])
}
