import clsx from 'clsx'
import type { ReactNode } from 'react'
import { C, Heart, Person, PostCard } from './primitives'

const svgProps = { role: 'presentation', 'aria-hidden': true, focusable: 'false' } as const

/**
 * THE PEOPLE BEHIND THE POSTS: the three underlying challenges, drawn so each
 * reads on its own, without the copy (founder direction, 2026-11-18). Familiar
 * objects and one strong contrast each; no charts, no unexplained question
 * marks, no figures, amounts or percentages. Drawings, not photos, so no
 * identifiable person is shown struggling.
 *
 *   reach     a big crowd of followers behind a new post; a narrow beam of
 *             light from the post reaches only a handful of them, the rest
 *             stay in the dark.
 *   earnings  the same post, made every week without fail (identical cards),
 *             above coin stacks that jump from tall to empty week to week.
 *   business  a creator in a café apron, between a ring light and phone on one
 *             side and a coffee counter on the other, under a late-night
 *             clock, with a nearly empty savings jar.
 */
export function ChallengeArt({ kind, className }: { kind: 'reach' | 'earnings' | 'business'; className?: string }) {
  return (
    <svg viewBox="0 0 320 210" {...svgProps} data-testid={`challenge-${kind}`} className={clsx('h-auto w-full', className)}>
      {kind === 'reach' && <Reach />}
      {kind === 'earnings' && <Earnings />}
      {kind === 'business' && <Business />}
    </svg>
  )
}

function Coin({ x, y }: { x: number; y: number }) {
  return (
    <g>
      <ellipse cx={x} cy={y + 2.4} rx="13" ry="4.4" fill="#d98a52" />
      <ellipse cx={x} cy={y} rx="13" ry="4.4" fill={C.accent} stroke="#d98a52" strokeWidth="1.1" />
    </g>
  )
}

/** A follower: lit (in the beam, seeing the post) or in the dark (not seeing it). */
function Follower({ x, y, lit }: { x: number; y: number; lit: boolean }) {
  return lit ? <Person x={x} y={y} size={0.62} fill={C.primary} /> : <Person x={x} y={y} size={0.62} fill={C.ink} head={C.ink} />
}

function Reach() {
  // The whole crowd follows the creator; only three, in the beam, see the new post.
  const crowd: ReactNode[] = []
  const lit = new Set(['0-1', '1-1', '0-2'])
  for (let r = 0; r < 4; r++)
    for (let c = 0; c < 8; c++) {
      const key = `${r}-${c}`
      const x = 140 + c * 22 + (r % 2) * 11
      const y = 60 + r * 38
      crowd.push(
        <g key={key} opacity={lit.has(`${c}-${r}`) ? 1 : 0.2}>
          <Follower x={x} y={y} lit={lit.has(`${c}-${r}`)} />
        </g>,
      )
    }
  return (
    <g>
      {/* The beam: from the new post, narrow, reaching only the nearest few. */}
      <path d="M102 90 L186 74 L186 144 L102 112 Z" fill={C.accent} opacity="0.35" />
      {crowd}
      <PostCard x={14} y={48} w={88} h={104} />
      <path d="M92 40 l4 9 9 4 -9 4 -4 9 -4 -9 -9 -4 9 -4 Z" fill={C.accent} />
      {/* An eye on the post: who sees it. */}
      <g transform="translate(58 170)">
        <path d="M-22 0 Q0 -16 22 0 Q0 16 -22 0 Z" fill={C.white} stroke={C.primary} strokeWidth="2.5" />
        <circle r="6" fill={C.primary} />
      </g>
    </g>
  )
}

function Earnings() {
  // Every week the same post goes out; what comes back jumps around.
  const stacks = [2, 7, 0, 9, 1, 4]
  return (
    <g>
      {stacks.map((n, i) => {
        const x = 30 + i * 52
        return (
          <g key={i}>
            <PostCard x={x - 19} y={12} w={38} h={44} shadow={false} />
            <path d={`M${x} 62 v10`} stroke={C.primary} strokeWidth="2" strokeLinecap="round" opacity="0.35" />
            {n === 0 ? (
              <ellipse cx={x} cy={190} rx="13" ry="4.4" fill="none" stroke={C.ink} strokeOpacity="0.3" strokeWidth="1.5" strokeDasharray="3 4" />
            ) : (
              Array.from({ length: n }, (_, k) => <Coin key={k} x={x} y={190 - k * 9} />)
            )}
          </g>
        )
      })}
      <line x1="8" y1="198" x2="312" y2="198" stroke={C.ink} strokeOpacity="0.15" strokeWidth="2" />
    </g>
  )
}

function Business() {
  return (
    <g>
      {/* Late at night: a wall clock with its hands near midnight, and the moon. */}
      <circle cx="160" cy="34" r="20" fill={C.white} stroke={C.ink} strokeOpacity="0.5" strokeWidth="2.5" />
      <path d="M160 34 V20 M160 34 L154 24" stroke={C.ink} strokeWidth="2.5" strokeLinecap="round" />
      <path d="M210 22 a12 12 0 1 0 10 18 a9 9 0 1 1 -10 -18 Z" fill={C.accent} />

      {/* Creating: a ring light with a phone on a stand. */}
      <circle cx="48" cy="92" r="26" fill="none" stroke={C.secondary} strokeWidth="7" />
      <rect x="40" y="78" width="16" height="28" rx="3" fill={C.ink} />
      <path d="M48 118 V190 M48 190 l-16 8 M48 190 l16 8" stroke={C.ink} strokeWidth="3" strokeLinecap="round" opacity="0.7" />

      {/* The other job: a café counter with a coffee cup and a till. */}
      <rect x="226" y="132" width="86" height="66" rx="6" fill={C.accentText} />
      <rect x="222" y="124" width="94" height="12" rx="4" fill="#b2632f" />
      <rect x="282" y="96" width="28" height="28" rx="4" fill={C.ink} opacity="0.8" />
      <rect x="286" y="100" width="20" height="8" rx="2" fill={C.secondary} />
      <path d="M240 104 h20 l-3 20 h-14 Z" fill={C.white} stroke={C.ink} strokeOpacity="0.3" />
      <path d="M260 109 q8 1 6 8 q-2 4 -8 3" fill="none" stroke={C.ink} strokeOpacity="0.4" strokeWidth="2" />
      <path d="M246 96 q3 -6 0 -10 M253 96 q3 -6 0 -10" stroke={C.ink} strokeOpacity="0.3" strokeWidth="2" fill="none" strokeLinecap="round" />

      {/* The creator, in a work apron, pulled between the two. */}
      <Person x={136} y={198} size={2.2} fill={C.primary} />
      <path d="M124 174 h24 l4 24 h-32 Z" fill={C.accent} />
      <path d="M126 174 q10 -12 20 0" fill="none" stroke={C.accent} strokeWidth="3" />
      <path d="M84 150 C 96 142, 106 142, 112 146" fill="none" stroke={C.primary} strokeWidth="3" strokeLinecap="round" strokeDasharray="2 7" opacity="0.6" />
      <path d="M164 138 C 182 128, 200 128, 216 136" fill="none" stroke={C.primary} strokeWidth="3" strokeLinecap="round" strokeDasharray="2 7" opacity="0.6" />
      <Heart x={60} y={52} s={1.4} />

      {/* Savings: a jar with a single coin at the bottom. */}
      <path d="M184 170 h24 v22 q0 6 -6 6 h-12 q-6 0 -6 -6 Z" fill={C.white} stroke={C.ink} strokeOpacity="0.35" strokeWidth="2" />
      <rect x="182" y="164" width="28" height="7" rx="3" fill={C.ink} opacity="0.35" />
      <ellipse cx="196" cy="193" rx="7" ry="2.8" fill={C.accent} stroke="#d98a52" />
    </g>
  )
}
