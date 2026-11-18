import clsx from 'clsx'
import { C, PostCard } from './primitives'

const svgProps = { role: 'presentation', 'aria-hidden': true, focusable: 'false' } as const

/**
 * THE PEOPLE BEHIND THE POSTS: the three underlying challenges, drawn for the
 * original photo-card layout (founder direction, 2026-11-18). Drawings, not
 * photos, so no identifiable person is shown struggling. No figures, amounts
 * or percentages.
 *   reach     two posts from the same creator: one lights up a crowd, the
 *             next reaches almost no one.
 *   earnings  month after month of uneven bars that never settle.
 *   business  a plan whose path breaks off into a question.
 */
export function ChallengeArt({ kind, className }: { kind: 'reach' | 'earnings' | 'business'; className?: string }) {
  return (
    <svg viewBox="0 0 320 200" {...svgProps} data-testid={`challenge-${kind}`} className={clsx('h-auto w-full', className)}>
      {kind === 'reach' && <Reach />}
      {kind === 'earnings' && <Earnings />}
      {kind === 'business' && <Business />}
    </svg>
  )
}

function Crowd({ x, y, lit }: { x: number; y: number; lit: number }) {
  return (
    <g>
      {Array.from({ length: 24 }, (_, i) => (
        <circle key={i} cx={x + (i % 6) * 15} cy={y + Math.floor(i / 6) * 15} r="5" fill={i < lit ? C.accent : C.ink} opacity={i < lit ? 1 : 0.12} />
      ))}
    </g>
  )
}

function Reach() {
  return (
    <g>
      <PostCard x={22} y={18} w={74} h={78} />
      <PostCard x={180} y={18} w={74} h={78} />
      <path d="M100 56 h66" stroke={C.primary} strokeWidth="2.5" strokeDasharray="2 7" strokeLinecap="round" opacity="0.5" />
      <Crowd x={24} y={118} lit={21} />
      <Crowd x={182} y={118} lit={2} />
    </g>
  )
}

function Earnings() {
  const bars = [62, 18, 44, 8, 70, 26, 12, 50]
  return (
    <g>
      <line x1="24" y1="170" x2="296" y2="170" stroke={C.ink} strokeOpacity="0.15" strokeWidth="2" />
      {bars.map((h, i) => (
        <rect key={i} x={30 + i * 33} y={170 - h * 1.8} width="22" height={h * 1.8} rx="5" fill={i % 2 ? C.primaryRaised : C.primary} opacity={0.35 + (h / 70) * 0.6} />
      ))}
      <circle cx="278" cy="40" r="18" fill={C.accent} />
      <path d="M272 34 q6 -8 12 0 q0 6 -6 8 v4" fill="none" stroke={C.ink} strokeWidth="3" strokeLinecap="round" />
      <circle cx="278" cy="52" r="2" fill={C.ink} />
    </g>
  )
}

function Business() {
  return (
    <g>
      {/* A plan: a calendar of months, then a path that stops short. */}
      <rect x="24" y="26" width="116" height="104" rx="14" fill={C.bg} stroke={C.ink} strokeOpacity="0.1" />
      <rect x="24" y="26" width="116" height="24" rx="12" fill={C.accentText} />
      {Array.from({ length: 9 }, (_, i) => (
        <rect key={i} x={36 + (i % 3) * 32} y={62 + Math.floor(i / 3) * 21} width="24" height="13" rx="4" fill={i < 4 ? C.secondary : C.ink} opacity={i < 4 ? 1 : 0.1} />
      ))}
      <path d="M150 150 C 190 150, 196 110, 230 108" fill="none" stroke={C.primary} strokeWidth="4" strokeLinecap="round" opacity="0.6" />
      <path d="M240 106 l8 -2" stroke={C.primary} strokeWidth="4" strokeLinecap="round" strokeDasharray="2 9" opacity="0.4" />
      <circle cx="276" cy="96" r="20" fill={C.accent} />
      <path d="M270 90 q6 -8 12 0 q0 6 -6 8 v4" fill="none" stroke={C.ink} strokeWidth="3" strokeLinecap="round" />
      <circle cx="276" cy="108" r="2" fill={C.ink} />
      <rect x="140" y="160" width="20" height="20" rx="4" fill={C.primary} />
      <rect x="164" y="160" width="20" height="20" rx="4" fill={C.primaryRaised} />
      <rect x="152" y="136" width="20" height="20" rx="4" fill={C.primary} opacity="0.7" transform="rotate(-8 162 146)" />
    </g>
  )
}
