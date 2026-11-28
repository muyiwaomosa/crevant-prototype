import { Fragment, type ReactNode } from 'react'

/**
 * Web addresses in member text become links (BL-008): http, https and
 * www. addresses only, so javascript:, data: and other schemes stay plain text.
 * Trailing punctuation stays outside the link. Each link opens in a new tab,
 * never passes the page on (noopener, noreferrer), and is marked as member
 * content (nofollow, ugc). The text itself is never treated as HTML.
 */
const URL_RE = /\b(?:https?:\/\/|www\.)[^\s<>"'`]+/gi
const TRAILING = /[.,;:!?)\]}'"]+$/

export function splitLinks(text: string): Array<{ text: string; href?: string }> {
  const out: Array<{ text: string; href?: string }> = []
  let last = 0
  for (const m of text.matchAll(URL_RE)) {
    let raw = m[0]
    const trail = TRAILING.exec(raw)?.[0] ?? ''
    // Keep a closing bracket that has its opening partner inside the link.
    let cut = trail.length
    if (trail.startsWith(')') && raw.slice(0, raw.length - trail.length).includes('(')) cut = trail.length - 1
    raw = raw.slice(0, raw.length - cut)
    const start = m.index ?? 0
    const href = /^www\./i.test(raw) ? `https://${raw}` : raw
    // A bare scheme or a dotless host is not a link.
    if (!/^https?:\/\/[^/\s]+\.[^/\s]+/i.test(href)) continue
    if (start > last) out.push({ text: text.slice(last, start) })
    out.push({ text: raw, href })
    last = start + raw.length
  }
  if (last < text.length) out.push({ text: text.slice(last) })
  return out
}

export function LinkedText({ text, className }: { text: string; className?: string }): ReactNode {
  const parts = splitLinks(text)
  return parts.map((p, i) =>
    p.href ? (
      <a
        key={i}
        href={p.href}
        target="_blank"
        rel="nofollow ugc noopener noreferrer"
        className={className ?? 'font-semibold text-brand-700 underline underline-offset-2 break-all'}
        onClick={(e) => e.stopPropagation()}
      >
        {p.text}
      </a>
    ) : (
      <Fragment key={i}>{p.text}</Fragment>
    ),
  )
}
