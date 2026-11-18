import clsx from 'clsx'
import { C, Heart, Person, PostCard, SplitPost, Thread, useSvgId } from './primitives'

const svgProps = { role: 'presentation', 'aria-hidden': true, focusable: 'false' } as const

/**
 * THE PROBLEM: who keeps the value. Creators make the posts; fans pass them
 * along with likes and shares; the attention flows into the platform, where
 * the value visibly piles up. What comes back is small and uneven: one
 * creator has a modest stack, another a single piece, and the fans get a
 * thank-you heart. Nuanced on purpose (founder direction, 2026-11-18): some
 * creators do earn, but far less than the value they help create, and fans
 * rarely share in it at all. No figures, currency symbols or percentages.
 */
export function ValueCapture({ className }: { className?: string }) {
  const id = useSvgId('vault')
  const coin = (x: number, y: number, k: string | number) => (
    <g key={k}>
      <ellipse cx={x} cy={y + 2.5} rx="14" ry="5" fill="#d98a52" />
      <ellipse cx={x} cy={y} rx="14" ry="5" fill={C.accent} stroke="#d98a52" strokeWidth="1.2" />
    </g>
  )
  const stack = (x: number, bottom: number, n: number) => Array.from({ length: n }, (_, i) => coin(x, bottom - i * 7, `${x}-${i}`))
  return (
    <svg viewBox="0 0 560 360" {...svgProps} data-testid="value-capture" className={clsx('h-auto w-full', className)}>
      <defs>
        <radialGradient id={`${id}-glow`} cx="50%" cy="60%" r="60%">
          <stop offset="0%" stopColor={C.accent} stopOpacity="0.55" />
          <stop offset="100%" stopColor={C.accent} stopOpacity="0" />
        </radialGradient>
        <clipPath id={`${id}-clip`}>
          <rect x="392" y="140" width="118" height="164" rx="10" />
        </clipPath>
      </defs>
      <line x1="12" y1="326" x2="548" y2="326" stroke={C.ink} strokeOpacity="0.1" strokeWidth="2" strokeLinecap="round" />

      {/* The attention and the posts flow from the creators, through the fans, into the platform. */}
      <Thread d="M132 150 C 190 104, 236 196, 296 140 S 352 76, 370 86" width={7} opacity={0.22} />
      <path d="M362 76 l16 10 -18 6 Z" fill={C.primary} opacity="0.5" />

      {/* The platform: a tall building, its vault full of value. */}
      <rect x="366" y="34" width="170" height="16" rx="8" fill={C.primaryRaised} />
      <rect x="376" y="44" width="150" height="282" rx="12" fill={C.primary} />
      {[0, 1, 2, 3].flatMap((c) =>
        [0, 1].map((r) => <rect key={`${c}-${r}`} x={394 + c * 30} y={64 + r * 30} width="20" height="16" rx="4" fill={C.white} opacity="0.18" />),
      )}
      <rect x="392" y="140" width="118" height="164" rx="10" fill={C.ink} opacity="0.3" />
      <g clipPath={`url(#${id}-clip)`}>
        <circle cx="451" cy="236" r="90" fill={`url(#${id}-glow)`} />
        {stack(420, 292, 13)}
        {stack(451, 292, 18)}
        {stack(482, 292, 11)}
      </g>

      {/* The fans: passing the posts along, liking and sharing. */}
      <PostCard x={226} y={150} w={42} h={48} />
      <PostCard x={312} y={100} w={36} h={42} />
      <Person x={214} y={300} size={1.25} outline />
      <Person x={258} y={306} size={1.1} outline />
      <Person x={300} y={300} size={1.25} outline />
      <Heart x={184} y={196} s={1.6} />
      <Heart x={286} y={196} s={1.3} />
      {/* What the fans get back: a thank-you. */}
      <rect x="234" y="222" width="46" height="30" rx="12" fill={C.white} stroke={C.primary} strokeOpacity="0.35" strokeWidth="1.5" />
      <path d="M248 252 l-4 9 12 -9 Z" fill={C.white} stroke={C.primary} strokeOpacity="0.35" strokeWidth="1.5" strokeLinejoin="round" />
      <Heart x={250} y={230} s={1.3} fill={C.accent} />

      {/* The creators: one in front with their post, two more behind. */}
      <PostCard x={44} y={112} w={88} h={100} />
      <Person x={38} y={318} size={1.25} fill={C.primaryRaised} />
      <Person x={124} y={318} size={1.15} fill={C.primaryRaised} />
      <Person x={82} y={322} size={2} fill={C.primary} />

      {/* What comes back: a thin, uneven trickle. A modest stack for one creator, a single piece for another. */}
      <Thread d="M374 314 C 300 344, 220 344, 160 330" width={2.5} color={C.accentText} opacity={0.55} dashed />
      {stack(164, 334, 3)}
      {coin(14, 336, 'single')}
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
    <ol data-testid="journey" className={clsx('grid grid-cols-[1fr_auto_1fr_auto_1fr] items-center gap-1 sm:gap-3', className)}>
      {labels.map((label, i) => (
        <li key={label} className="contents">
          {i > 0 && (
            <span aria-hidden="true" className="mx-auto flex h-6 w-4 items-center justify-center text-lg font-black text-sp-primary sm:h-8 sm:w-8 sm:text-2xl">
              →
            </span>
          )}
          <div className="mx-auto w-full max-w-[13rem] text-center">
            <JourneyArt step={i as 0 | 1 | 2} />
            <p className="mt-1 font-sp-display text-[11px] font-black tracking-[0.06em] text-sp-primary min-[400px]:text-sm min-[400px]:tracking-[0.12em] sm:text-lg sm:tracking-[0.18em]">{label}</p>
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
