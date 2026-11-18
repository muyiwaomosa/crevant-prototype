import clsx from 'clsx'
import { C, Heart, Person, PostCard, SplitPost, Thread } from './primitives'

const svgProps = { role: 'presentation', 'aria-hidden': true, focusable: 'false' } as const

/**
 * THE PROBLEM: a growing audience beside earnings that don't keep up. The
 * audience line climbs steadily, gathering more people; the earnings line
 * stays low and breaks off into a question. No axes, figures or amounts.
 */
export function AudienceVsEarnings({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 520 330" {...svgProps} data-testid="audience-vs-earnings" className={clsx('h-auto w-full', className)}>
      <rect x="0" y="0" width="520" height="330" rx="28" fill={C.white} />
      {/* Faint guide lines. */}
      {[80, 150, 220, 290].map((y) => (
        <line key={y} x1="36" x2="484" y1={y} y2={y} stroke={C.ink} strokeOpacity="0.06" strokeWidth="2" />
      ))}
      {/* The audience: a steady climb. */}
      <path d="M40 270 C 140 262, 200 230, 270 180 S 400 80, 470 58" fill="none" stroke={C.primary} strokeWidth="7" strokeLinecap="round" />
      {[
        [120, 262, 0.7],
        [215, 232, 0.8],
        [300, 166, 0.9],
        [380, 108, 1],
        [458, 66, 1.1],
      ].map(([x, y, s], i) => (
        <g key={i}>
          <circle cx={x} cy={y - 26 * s} r={16 * s} fill={C.white} stroke={C.primary} strokeWidth="2" />
          <Person x={x} y={y - 16 * s} size={0.62 * s} fill={C.primary} />
        </g>
      ))}
      {/* Earnings: low, uneven, and then a break. */}
      <path d="M40 292 L 92 284 L 128 296 L 170 280 L 204 298 L 246 286 L 282 300" fill="none" stroke={C.accentText} strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M300 292 L 330 288" fill="none" stroke={C.accentText} strokeWidth="5" strokeLinecap="round" strokeDasharray="2 12" />
      {/* The question: but what about you? */}
      <circle cx="380" cy="282" r="26" fill={C.accent} />
      <text x="380" y="292" textAnchor="middle" fontFamily="var(--font-sp-display)" fontWeight="900" fontSize="30" fill={C.ink}>
        ?
      </text>
    </svg>
  )
}

/** One step of the POST → CONNECT → SPLIT journey (THE VISION). */
function JourneyArt({ step }: { step: 0 | 1 | 2 }) {
  if (step === 0) {
    return (
      <svg viewBox="0 0 200 170" {...svgProps} className="h-auto w-full">
        <circle cx="100" cy="88" r="76" fill={C.tint} />
        <PostCard x={52} y={30} w={96} h={112} />
        <path d="M150 34 l6 13 13 6 -13 6 -6 13 -6 -13 -13 -6 13 -6 Z" fill={C.accent} />
      </svg>
    )
  }
  if (step === 1) {
    return (
      <svg viewBox="0 0 200 170" {...svgProps} className="h-auto w-full">
        <circle cx="100" cy="88" r="76" fill={C.tint} />
        {[
          [28, 50],
          [172, 52],
          [26, 136],
          [174, 134],
        ].map(([x, y], i) => (
          <Thread key={i} d={`M100 88 L${x} ${y}`} width={2.5} opacity={0.4} />
        ))}
        <PostCard x={70} y={52} w={60} h={72} />
        {[
          [28, 50],
          [172, 52],
          [26, 136],
          [174, 134],
        ].map(([x, y], i) => (
          <g key={i}>
            <circle cx={x} cy={y} r="17" fill={C.white} stroke={C.primary} strokeWidth="2" />
            <Person x={x} y={y + 9} size={0.65} />
          </g>
        ))}
      </svg>
    )
  }
  return (
    <svg viewBox="0 0 200 170" {...svgProps} className="h-auto w-full">
      <circle cx="100" cy="88" r="76" fill={C.tint} />
      <SplitPost x={62} y={26} w={76} h={96} gap={8} />
      <Thread d="M76 128 C 70 140, 52 146, 40 150" width={2.5} opacity={0.45} />
      <Thread d="M124 128 C 130 140, 148 146, 160 150" width={2.5} opacity={0.45} />
      <Person x={36} y={164} size={1} fill={C.primary} />
      <Person x={158} y={164} size={0.72} fill={C.primaryRaised} />
      <Person x={176} y={166} size={0.6} fill={C.primary} />
    </svg>
  )
}

/** THE VISION: POST → CONNECT → SPLIT, side by side from sm up, stacked on phones. */
export function PostConnectSplit({ labels, className }: { labels: readonly string[]; className?: string }) {
  return (
    <ol data-testid="journey" className={clsx('grid grid-cols-1 items-center gap-2 min-[480px]:grid-cols-[1fr_auto_1fr_auto_1fr] min-[480px]:gap-3', className)}>
      {labels.map((label, i) => (
        <li key={label} className="contents">
          {i > 0 && (
            <span aria-hidden="true" className="mx-auto flex h-8 w-8 rotate-90 items-center justify-center text-2xl font-black text-sp-primary min-[480px]:rotate-0">
              →
            </span>
          )}
          <div className="mx-auto w-full max-w-[13rem] text-center">
            <JourneyArt step={i as 0 | 1 | 2} />
            <p className="mt-1 font-sp-display text-lg font-black tracking-[0.18em] text-sp-primary">{label}</p>
          </div>
        </li>
      ))}
    </ol>
  )
}

/** HOW SPLITPOST WORKS: the four connected illustrations. */
export function StepArt({ step, className }: { step: 0 | 1 | 2 | 3; className?: string }) {
  const frame = (children: React.ReactNode) => (
    <svg viewBox="0 0 240 180" {...svgProps} className={clsx('h-auto w-full', className)}>
      <rect x="6" y="6" width="228" height="168" rx="30" fill={C.white} />
      {children}
    </svg>
  )
  if (step === 0) {
    // 1. A post being published: a phone, a post leaving it.
    return frame(
      <g>
        <rect x="38" y="30" width="84" height="132" rx="16" fill={C.ink} />
        <rect x="45" y="40" width="70" height="112" rx="10" fill={C.bg} />
        <PostCard x={52} y={70} w={56} h={64} shadow={false} />
        <Thread d="M122 92 C 150 80, 160 66, 176 54" width={3} opacity={0.5} dashed />
        <PostCard x={156} y={22} w={58} h={62} />
        <path d="M196 98 l5 11 11 5 -11 5 -5 11 -5 -11 -11 -5 11 -5 Z" fill={C.accent} />
      </g>,
    )
  }
  if (step === 1) {
    // 2. Content connecting with followers.
    const people: [number, number][] = [
      [40, 46],
      [200, 46],
      [36, 140],
      [204, 140],
      [120, 164],
    ]
    return frame(
      <g>
        {people.map(([x, y], i) => (
          <Thread key={i} d={`M120 92 L${x} ${y}`} width={2.5} opacity={0.4} />
        ))}
        <PostCard x={88} y={52} w={64} h={78} />
        {people.map(([x, y], i) => (
          <g key={i}>
            <circle cx={x} cy={y} r="16" fill={C.tint} stroke={C.primary} strokeWidth="2" />
            <Person x={x} y={y + 8} size={0.6} />
          </g>
        ))}
      </g>,
    )
  }
  if (step === 2) {
    // 3. Supporters introducing new people to the community.
    return frame(
      <g>
        <circle cx="160" cy="92" r="58" fill={C.tint} />
        <Person x={146} y={86} size={0.75} />
        <Person x={176} y={88} size={0.7} fill={C.primaryRaised} />
        <Person x={160} y={122} size={0.75} />
        {/* The supporter, bringing two new people in. */}
        <Person x={52} y={112} size={1.15} fill={C.primaryRaised} />
        <Person x={66} y={160} size={0.75} outline />
        <Person x={92} y={150} size={0.75} outline />
        <Thread d="M74 120 C 92 112, 104 104, 118 98" width={3} opacity={0.6} />
        <path d="M116 92 l10 6 -11 4 Z" fill={C.primary} opacity="0.6" />
        <Heart x={40} y={40} s={1.8} />
      </g>,
    )
  }
  // 4. Eligible revenue being split: a post in two, shared between the creator and the community.
  return frame(
    <g>
      <SplitPost x={80} y={22} w={80} h={96} gap={8} />
      <Thread d="M92 124 C 84 138, 64 146, 52 150" width={3} opacity={0.5} />
      <Thread d="M148 124 C 156 138, 176 146, 188 150" width={3} opacity={0.5} />
      <Person x={48} y={170} size={1.1} fill={C.primary} />
      <Person x={180} y={170} size={0.72} fill={C.primaryRaised} />
      <Person x={202} y={172} size={0.6} fill={C.primary} />
    </g>,
  )
}
