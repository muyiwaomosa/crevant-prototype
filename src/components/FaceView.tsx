import clsx from 'clsx'
import { useCallback, useEffect, useRef, useState, type KeyboardEvent, type PointerEvent, type ReactNode } from 'react'
import { useSearchParams } from 'react-router-dom'

/**
 * Multi-face view (SP-DESIGN-001/002): one destination, several full views
 * ("faces") the member turns between. Swipe is never the only way: every face
 * has a labelled tab (tap, click, or arrow keys, WAI-ARIA tabs pattern).
 *
 * Rules (tested in FaceView.test.tsx):
 *  - the face is kept in the URL (?face=<key>), so Back and shared links work;
 *  - a face mounts the first time it is shown and then stays mounted (hidden),
 *    so its data, form input and scroll position are kept;
 *  - a drag switches only when it moves at least 48 px horizontally and at
 *    least 1.5 times more horizontally than vertically; drags starting within
 *    16 px of the screen edge, or on media, controls or [data-no-swipe], never
 *    switch, so vertical scrolling, video controls and the browser's own back
 *    gesture are left alone;
 *  - the incoming face slides in (about 300 ms); with reduced motion it simply appears.
 */
export type Face = { key: string; label: string; content: ReactNode }

const SWIPE_MIN = 48
const DOMINANCE = 1.5
const EDGE = 16

export function FaceView({ faces, label, param = 'face' }: { faces: Face[]; label: string; param?: string }) {
  const [params, setParams] = useSearchParams()
  const requested = params.get(param)
  const index = Math.max(0, faces.findIndex((f) => f.key === requested))
  const current = faces[index] ?? faces[0]
  const [mounted, setMounted] = useState<Set<string>>(() => new Set([current.key]))
  const [enter, setEnter] = useState<'left' | 'right' | null>(null)
  const scrolls = useRef<Record<string, number>>({})
  const tabs = useRef<Array<HTMLButtonElement | null>>([])
  const drag = useRef<{ x: number; y: number; locked: boolean | null; dx: number } | null>(null)
  const panel = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    setMounted((m) => (m.has(current.key) ? m : new Set(m).add(current.key)))
  }, [current.key])

  const go = useCallback(
    (to: number, focusTab = false) => {
      const next = faces[Math.max(0, Math.min(faces.length - 1, to))]
      if (!next || next.key === current.key) return
      scrolls.current[current.key] = window.scrollY
      setEnter(to > index ? 'right' : 'left')
      const p = new URLSearchParams(params)
      if (next.key === faces[0].key) p.delete(param)
      else p.set(param, next.key)
      setParams(p, { replace: true })
      if (focusTab) tabs.current[faces.indexOf(next)]?.focus()
      requestAnimationFrame(() => {
        try {
          window.scrollTo({ top: scrolls.current[next.key] ?? 0 })
        } catch {
          // Scrolling is a nicety; never fail a face change over it.
        }
      })
    },
    [faces, current.key, index, params, param, setParams],
  )

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key === 'ArrowRight') go(index + 1, true)
    else if (e.key === 'ArrowLeft') go(index - 1, true)
    else if (e.key === 'Home') go(0, true)
    else if (e.key === 'End') go(faces.length - 1, true)
    else return
    e.preventDefault()
  }

  function onPointerDown(e: PointerEvent<HTMLDivElement>) {
    if (e.pointerType === 'mouse' && e.button !== 0) return
    const target = e.target as HTMLElement
    if (target.closest('video, audio, input, textarea, select, [contenteditable], [data-no-swipe]')) return
    if (e.clientX < EDGE || e.clientX > window.innerWidth - EDGE) return
    drag.current = { x: e.clientX, y: e.clientY, locked: null, dx: 0 }
  }
  function onPointerMove(e: PointerEvent<HTMLDivElement>) {
    const d = drag.current
    if (!d) return
    const dx = e.clientX - d.x
    const dy = e.clientY - d.y
    if (d.locked === null && (Math.abs(dx) > 8 || Math.abs(dy) > 8)) d.locked = Math.abs(dx) >= Math.abs(dy) * DOMINANCE
    if (!d.locked) return
    d.dx = dx
    if (panel.current && !prefersReducedMotion()) panel.current.style.transform = `translateX(${dx * 0.9}px)`
  }
  function endDrag() {
    const d = drag.current
    drag.current = null
    if (panel.current) panel.current.style.transform = ''
    if (!d || !d.locked || Math.abs(d.dx) < SWIPE_MIN) return
    go(index + (d.dx < 0 ? 1 : -1))
  }

  return (
    <div className="face-view overflow-x-clip">
      <div
        role="tablist"
        aria-label={label}
        onKeyDown={onKeyDown}
        className="mb-4 flex rounded-full bg-[#efe9de] p-1"
      >
        {faces.map((f, i) => (
          <button
            key={f.key}
            ref={(el) => {
              tabs.current[i] = el
            }}
            type="button"
            role="tab"
            id={`face-tab-${param}-${f.key}`}
            aria-selected={i === index}
            aria-controls={`face-panel-${param}-${f.key}`}
            tabIndex={i === index ? 0 : -1}
            onClick={() => go(i)}
            className={clsx(
              'min-h-[40px] flex-1 whitespace-nowrap rounded-full px-2 text-[13.5px] font-semibold transition-colors motion-reduce:transition-none',
              i === index ? 'bg-brand-600 text-white shadow-[0_4px_12px_-4px_rgba(36,71,166,0.6)]' : 'text-ink-600 hover:text-ink-900',
            )}
          >
            {f.label}
          </button>
        ))}
      </div>
      <div
        className="touch-pan-y"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onPointerLeave={endDrag}
      >
        {faces.map((f) =>
          mounted.has(f.key) ? (
            <div
              key={f.key}
              ref={f.key === current.key ? panel : undefined}
              role="tabpanel"
              id={`face-panel-${param}-${f.key}`}
              aria-labelledby={`face-tab-${param}-${f.key}`}
              hidden={f.key !== current.key}
              data-face={f.key}
              className={clsx(
                f.key === current.key && enter === 'right' && 'animate-[face-in-right_300ms_cubic-bezier(0.22,0.8,0.24,1)]',
                f.key === current.key && enter === 'left' && 'animate-[face-in-left_300ms_cubic-bezier(0.22,0.8,0.24,1)]',
                'motion-reduce:animate-none',
              )}
              onAnimationEnd={() => setEnter(null)}
            >
              {f.content}
            </div>
          ) : null,
        )}
      </div>
    </div>
  )
}

function prefersReducedMotion(): boolean {
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches
  } catch {
    return false
  }
}
