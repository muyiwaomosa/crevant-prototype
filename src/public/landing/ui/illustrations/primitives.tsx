import { useId } from 'react'

/**
 * The Splitpost illustration language: a handful of shapes taken from the
 * split-post badge (src/logo/splitpost-logo.svg) and reused everywhere, so the
 * page reads as one story.
 *
 *   PostCard   a post: avatar, a line of text, an optional picture.
 *   SplitPost  a post in two pieces with the apricot line in the gap, exactly
 *              like the badge: what the creator made, and what the community
 *              grew. Never sized to suggest a ratio or an amount.
 *   Person     a simple figure: head and shoulders.
 *   Thread     a soft connecting line between people and posts.
 *
 * Every illustration is decorative (aria-hidden): the approved copy beside it
 * carries the meaning. No numbers, amounts or percentages appear in any of
 * them. Colours are the Modern Disruptor tokens.
 */
export const C = {
  primary: '#2447a6',
  primaryRaised: '#3156b5',
  secondary: '#a8d9cf',
  tint: '#e7f4f1',
  accent: '#f6b888',
  accentText: '#94481a',
  bg: '#faf7f1',
  ink: '#1b2430',
  muted: '#4e5a68',
  white: '#ffffff',
} as const

/** A unique, url()-safe id for clip paths inside one illustration. */
export function useSvgId(name: string) {
  return `${name}-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`
}

export function Person({
  x,
  y,
  size = 1,
  fill = C.primary,
  head,
  outline = false,
}: {
  x: number
  y: number
  size?: number
  fill?: string
  head?: string
  outline?: boolean
}) {
  // (x, y) is the centre of the shoulders' base.
  const r = 7 * size
  const w = 15 * size
  const h = 12 * size
  const stroke = outline ? { fill: C.white, stroke: fill, strokeWidth: 2 * Math.min(size, 1.4) } : { fill }
  return (
    <g>
      <circle cx={x} cy={y - h - r - 1.5 * size} r={r} {...(outline ? stroke : { fill: head ?? fill })} />
      <path d={`M${x - w} ${y} a${w} ${h} 0 0 1 ${2 * w} 0 Z`} {...stroke} />
    </g>
  )
}

export function Thread({ d, color = C.primary, dashed = false, width = 2, opacity = 0.35 }: { d: string; color?: string; dashed?: boolean; width?: number; opacity?: number }) {
  return <path d={d} fill="none" stroke={color} strokeWidth={width} strokeLinecap="round" strokeDasharray={dashed ? '2 7' : undefined} opacity={opacity} />
}

export function PostCard({
  x,
  y,
  w,
  h,
  picture = true,
  avatar = C.primary,
  tone = C.white,
  shadow = true,
}: {
  x: number
  y: number
  w: number
  h: number
  picture?: boolean
  avatar?: string
  tone?: string
  shadow?: boolean
}) {
  const pad = Math.max(8, w * 0.08)
  const av = Math.max(5, w * 0.07)
  const lineY = y + pad + av * 2 + pad * 0.7
  return (
    <g>
      {shadow && <rect x={x + 3} y={y + 6} width={w} height={h} rx={Math.min(18, w * 0.1)} fill={C.ink} opacity={0.08} />}
      <rect x={x} y={y} width={w} height={h} rx={Math.min(18, w * 0.1)} fill={tone} stroke={C.ink} strokeOpacity={0.08} />
      <circle cx={x + pad + av} cy={y + pad + av} r={av} fill={avatar} />
      <rect x={x + pad * 1.6 + av * 2} y={y + pad + av * 0.55} width={w * 0.34} height={av * 0.55} rx={av * 0.27} fill={C.ink} opacity={0.75} />
      <rect x={x + pad} y={lineY} width={w - pad * 2} height={av * 0.5} rx={av * 0.25} fill={C.ink} opacity={0.18} />
      <rect x={x + pad} y={lineY + av * 1.05} width={(w - pad * 2) * 0.7} height={av * 0.5} rx={av * 0.25} fill={C.ink} opacity={0.18} />
      {picture && (
        <rect x={x + pad} y={lineY + av * 2.2} width={w - pad * 2} height={Math.max(0, y + h - pad - (lineY + av * 2.2))} rx={Math.min(12, w * 0.06)} fill={C.secondary} opacity={0.75} />
      )}
    </g>
  )
}

/**
 * A post split in two along the badge's diagonal, with the apricot line
 * showing only in the gap. `top` and `bottom` are drawn inside each piece.
 */
export function SplitPost({
  x,
  y,
  w,
  h,
  gap = 10,
  cut = 0.18,
  topFill = C.bg,
  bottomFill = C.secondary,
  top,
  bottom,
  topClassName,
  bottomClassName,
}: {
  x: number
  y: number
  w: number
  h: number
  gap?: number
  /** How far the cut climbs across the card, as a share of its height. */
  cut?: number
  topFill?: string
  bottomFill?: string
  top?: React.ReactNode
  bottom?: React.ReactNode
  topClassName?: string
  bottomClassName?: string
}) {
  const id = useSvgId('split')
  const rise = h * cut
  const mid = y + h * 0.56
  // Top piece: from the top edge down to a line falling from right (higher) to left (lower).
  const topPoly = `${x},${y} ${x + w},${y} ${x + w},${mid - rise / 2 - gap / 2} ${x},${mid + rise / 2 - gap / 2}`
  const bottomPoly = `${x},${mid + rise / 2 + gap / 2} ${x + w},${mid - rise / 2 + gap / 2} ${x + w},${y + h} ${x},${y + h}`
  const r = Math.min(22, w * 0.09)
  const angle = (Math.atan2(-rise, w) * 180) / Math.PI
  return (
    <g>
      <defs>
        <clipPath id={`${id}-t`}>
          <polygon points={topPoly} />
        </clipPath>
        <clipPath id={`${id}-b`}>
          <polygon points={bottomPoly} />
        </clipPath>
      </defs>
      <rect x={x - w * 0.12} y={mid - gap * 0.32} width={w * 1.24} height={gap * 0.64} rx={gap * 0.32} fill={C.accent} transform={`rotate(${angle} ${x + w / 2} ${mid})`} />
      <g className={topClassName}>
        <g clipPath={`url(#${id}-t)`}>
          <rect x={x} y={y} width={w} height={h} rx={r} fill={topFill} />
          {top}
        </g>
      </g>
      <g className={bottomClassName}>
        <g clipPath={`url(#${id}-b)`}>
          <rect x={x} y={y} width={w} height={h} rx={r} fill={bottomFill} />
          {bottom}
        </g>
      </g>
    </g>
  )
}

export function Heart({ x, y, s = 1, fill = C.accentText }: { x: number; y: number; s?: number; fill?: string }) {
  return (
    <path
      transform={`translate(${x} ${y}) scale(${s})`}
      d="M0 3.2C0 1.4 1.4 0 3.1 0c1 0 1.9.5 2.4 1.3C6 .5 6.9 0 7.9 0 9.6 0 11 1.4 11 3.2 11 6.6 5.5 10 5.5 10S0 6.6 0 3.2Z"
      fill={fill}
    />
  )
}
