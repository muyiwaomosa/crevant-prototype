const MIN = 60_000
const HOUR = 60 * MIN
const DAY = 24 * HOUR

export const minutesAgo = (now: number, m: number) => now - m * MIN

/** Local calendar day key, e.g. "2026-11-04". */
export function dayKey(ts: number): string {
  const d = new Date(ts)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** Short relative time used on post cards: "now", "12m", "3h", "2d", "Oct 12". */
export function relativeTime(ts: number, now: number): string {
  const diff = Math.max(0, now - ts)
  if (diff < MIN) return 'just now'
  if (diff < HOUR) return `${Math.floor(diff / MIN)}m ago`
  if (diff < DAY) return `${Math.floor(diff / HOUR)}h ago`
  if (diff < 7 * DAY) return `${Math.floor(diff / DAY)}d ago`
  return new Date(ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

export function clockTime(ts: number): string {
  return new Date(ts).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
}

export function fullDateTime(ts: number): string {
  return new Date(ts).toLocaleString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

/** Label for a feed day separator: "Today", "Yesterday", or "Monday, Nov 2". */
export function dayLabel(ts: number, now: number): string {
  const key = dayKey(ts)
  if (key === dayKey(now)) return 'Today'
  if (key === dayKey(now - DAY)) return 'Yesterday'
  return new Date(ts).toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' })
}
