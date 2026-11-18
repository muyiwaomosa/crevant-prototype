import clsx from 'clsx'
import { C, Heart, Person, PostCard, SplitPost, Thread, useSvgId } from './primitives'

const svgProps = { role: 'presentation', 'aria-hidden': true, focusable: 'false' } as const

/**
 * THE PROBLEM: how value flows through social media today, left to right.
 * Creators make the posts; fans like, share and bring more people in, so the
 * crowd grows along the way; the platform turns that attention into money
 * (the ad panel), and its vault fills. What comes back is uneven: one creator
 * has a small stack, another a single coin, a third has one on its way. The
 * fans get a thank-you heart. Some creators do earn, so it never suggests
 * platforms pay nothing (founder direction, 2026-11-18). No figures,
 * currency symbols or percentages.
 */
export function ValueCapture({ className }: { className?: string }) {
  const id = useSvgId('vault')
  const coin = (x: number, y: number, k: string | number) => (
    <g key={k}>
      <ellipse cx={x} cy={y + 2.5} rx="13" ry="4.6" fill="#d98a52" />
      <ellipse cx={x} cy={y} rx="13" ry="4.6" fill={C.accent} stroke="#d98a52" strokeWidth="1.2" />
    </g>
  )
  const stack = (x: number, bottom: number, n: number) => Array.from({ length: n }, (_, i) => coin(x, bottom - i * 6.5, `${x}-${i}`))
  return (
    <svg viewBox="0 0 600 370" {...svgProps} data-testid="value-capture" className={clsx('h-auto w-full', className)}>
      <defs>
        <radialGradient id={`${id}-glow`} cx="50%" cy="60%" r="60%">
          <stop offset="0%" stopColor={C.accent} stopOpacity="0.6" />
          <stop offset="100%" stopColor={C.accent} stopOpacity="0" />
        </radialGradient>
        <clipPath id={`${id}-clip`}>
          <rect x="418" y="134" width="134" height="172" rx="10" />
        </clipPath>
      </defs>
      <line x1="10" y1="330" x2="590" y2="330" stroke={C.ink} strokeOpacity="0.1" strokeWidth="2" strokeLinecap="round" />

      {/* 1. The creators make the posts. */}
      <PostCard x={34} y={96} w={96} h={108} />
      <Person x={30} y={322} size={1.2} fill={C.primaryRaised} />
      <Person x={136} y={322} size={1.15} fill={C.primaryRaised} />
      <Person x={82} y={326} size={2} fill={C.primary} />

      {/* 2. The fans pass them along, and the crowd grows: more people reached at every step. */}
      <Thread d="M132 150 C 200 98, 238 196, 300 134 S 372 74, 398 86" width={8} opacity={0.2} />
      <path d="M389 75 l17 11 -19 6 Z" fill={C.primary} opacity="0.5" />
      <PostCard x={214} y={146} w={40} h={46} />
      <PostCard x={316} y={104} w={34} h={40} />
      <Heart x={186} y={196} s={1.5} />
      <Heart x={290} y={176} s={1.3} />
      <Heart x={350} y={150} s={1.1} />
      <Person x={196} y={304} size={1.05} outline />
      <Person x={238} y={308} size={0.95} outline />
      <Person x={276} y={302} size={1.1} outline />
      <Person x={314} y={308} size={0.95} outline />
      <Person x={352} y={302} size={1.05} outline />
      <Person x={220} y={258} size={0.7} outline />
      <Person x={260} y={252} size={0.7} outline />
      <Person x={300} y={256} size={0.7} outline />
      <Person x={340} y={250} size={0.7} outline />
      <Person x={372} y={256} size={0.6} outline />
      {/* What the fans get back: a thank-you. */}
      <rect x="236" y="196" width="46" height="30" rx="12" fill={C.white} stroke={C.primary} strokeOpacity="0.35" strokeWidth="1.5" />
      <path d="M250 226 l-4 9 12 -9 Z" fill={C.white} stroke={C.primary} strokeOpacity="0.35" strokeWidth="1.5" strokeLinejoin="round" />
      <Heart x={252} y={204} s={1.3} fill={C.accent} />

      {/* 3. The platform turns the attention into money: the ad panel, and a vault that keeps filling. */}
      <rect x="392" y="30" width="186" height="16" rx="8" fill={C.primaryRaised} />
      <rect x="402" y="40" width="166" height="290" rx="12" fill={C.primary} />
      <rect x="418" y="58" width="134" height="58" rx="10" fill={C.white} />
      <path d="M446 78 h10 l18 -10 v34 l-18 -10 h-10 Z" fill={C.primary} />
      <path d="M480 76 q8 9 0 18" fill="none" stroke={C.primary} strokeWidth="3" strokeLinecap="round" />
      <path d="M487 70 q14 15 0 30" fill="none" stroke={C.primary} strokeWidth="3" strokeLinecap="round" opacity="0.6" />
      <rect x="506" y="72" width="34" height="9" rx="4.5" fill={C.accent} />
      <rect x="506" y="88" width="24" height="7" rx="3.5" fill={C.ink} opacity="0.2" />
      <rect x="418" y="134" width="134" height="172" rx="10" fill={C.ink} opacity="0.3" />
      <g clipPath={`url(#${id}-clip)`}>
        <circle cx="485" cy="236" r="96" fill={`url(#${id}-glow)`} />
        {stack(450, 294, 14)}
        {stack(485, 294, 20)}
        {stack(520, 294, 12)}
      </g>

      {/* 4. What comes back: a thin, uneven trickle. A small stack, a single coin, one on its way. */}
      <Thread d="M400 318 C 320 352, 210 352, 150 338" width={2.5} color={C.accentText} opacity={0.55} dashed />
      {stack(166, 342, 3)}
      {coin(26, 342, 'single')}
      {coin(236, 346, 'on-the-way')}
    </svg>
  )
}

/** A small round "done" check, used for followers who are caught up and for a verified referral. */
function Check({ x, y, r = 8, fill = C.primary }: { x: number; y: number; r?: number; fill?: string }) {
  return (
    <g>
      <circle cx={x} cy={y} r={r} fill={fill} stroke={C.white} strokeWidth="2" />
      <path d={`M${x - r * 0.42} ${y} l${r * 0.3} ${r * 0.32} l${r * 0.55} -${r * 0.6}`} fill="none" stroke={C.white} strokeWidth={Math.max(1.6, r * 0.24)} strokeLinecap="round" strokeLinejoin="round" />
    </g>
  )
}

/**
 * HOW SPLITPOST WORKS: one conceptual drawing per step (founder direction,
 * 2026-11-18). Ideas, not screens of the unfinished app.
 *   01 POST     a creator publishing, and the first people gathering.
 *   02 CONNECT  the post arriving with each follower, who is caught up.
 *   03 GROW     a supporter bringing a new person in: a verified referral.
 *   04 SPLIT    advertising value flowing into the split post, then on to the
 *               creator and to a pool for qualifying fan contributions. The
 *               streams are drawn the same width: no ratio is implied.
 */
export function StepArt({ step, className }: { step: 0 | 1 | 2 | 3; className?: string }) {
  const frame = (children: React.ReactNode) => (
    <svg viewBox="0 0 240 180" {...svgProps} data-testid={`step-art-${step + 1}`} className={clsx('h-auto w-full', className)}>
      <rect x="6" y="6" width="228" height="168" rx="30" fill={C.white} />
      {children}
    </svg>
  )
  if (step === 0) {
    return frame(
      <g>
        {/* A phone on a small tripod, recording the creator. */}
        <path d="M112 156 l10 -40 l10 40 M122 116 v40" stroke={C.ink} strokeWidth="3" strokeLinecap="round" fill="none" opacity="0.7" />
        <rect x="108" y="74" width="28" height="44" rx="6" fill={C.ink} />
        <circle cx="122" cy="84" r="4" fill={C.secondary} />
        <Person x={62} y={160} size={1.55} fill={C.primary} />
        {/* The published post, and the first people to notice it. */}
        <Thread d="M136 88 C 150 70, 158 60, 160 52" width={2.5} opacity={0.5} dashed />
        <PostCard x={150} y={20} w={66} h={70} />
        <path d="M206 104 l4 9 9 4 -9 4 -4 9 -4 -9 -9 -4 9 -4 Z" fill={C.accent} />
        <Person x={166} y={164} size={0.62} outline />
        <Person x={190} y={166} size={0.62} outline />
        <Person x={214} y={164} size={0.62} outline />
      </g>,
    )
  }
  if (step === 1) {
    const followers: [number, number][] = [
      [42, 50],
      [198, 50],
      [36, 134],
      [204, 134],
    ]
    return frame(
      <g>
        {followers.map(([x, y], i) => (
          <Thread key={i} d={`M120 90 L${x} ${y}`} width={2.5} opacity={0.4} />
        ))}
        <PostCard x={88} y={48} w={64} h={80} />
        {followers.map(([x, y], i) => (
          <g key={i}>
            <circle cx={x} cy={y} r="17" fill={C.tint} stroke={C.primary} strokeWidth="2" />
            <Person x={x} y={y + 8} size={0.6} />
            <Check x={x + 13} y={y - 12} r={7} />
          </g>
        ))}
      </g>,
    )
  }
  if (step === 2) {
    return frame(
      <g>
        <circle cx="172" cy="90" r="54" fill={C.tint} />
        <Person x={158} y={86} size={0.7} />
        <Person x={186} y={88} size={0.66} fill={C.primaryRaised} />
        <Person x={172} y={124} size={0.72} />
        {/* The supporter, introducing a new person, who joins verified. */}
        <Person x={50} y={150} size={1.3} fill={C.primaryRaised} />
        <Heart x={36} y={58} s={1.8} />
        <Thread d="M76 132 C 90 116, 100 112, 108 110" width={3} opacity={0.6} />
        <Person x={116} y={138} size={1.05} outline />
        <Check x={130} y={98} r={9} fill={C.accentText} />
        <Thread d="M132 120 C 140 112, 146 106, 150 102" width={3} opacity={0.6} />
        <path d="M148 96 l9 4 -9 6 Z" fill={C.primary} opacity="0.6" />
      </g>,
    )
  }
  return frame(
    <g>
      {/* Advertising value, flowing into the post that earned it. */}
      <rect x="18" y="26" width="52" height="34" rx="8" fill={C.tint} />
      <path d="M30 38 h7 l12 -7 v22 l-12 -7 h-7 Z" fill={C.primary} />
      <path d="M54 37 q5 6 0 12" fill="none" stroke={C.primary} strokeWidth="2.5" strokeLinecap="round" />
      <Thread d="M72 44 C 82 44, 88 46, 94 50" width={3} opacity={0.5} />
      <SplitPost x={96} y={18} w={70} h={84} gap={7} />
      {/* Then on to the creator, and to a pool for qualifying fan contributions. */}
      <Thread d="M112 106 C 104 122, 82 132, 66 136" width={3} opacity={0.5} />
      <Thread d="M150 106 C 158 122, 176 130, 186 134" width={3} opacity={0.5} />
      <Person x={56} y={168} size={1.2} fill={C.primary} />
      <circle cx="190" cy="150" r="26" fill={C.tint} stroke={C.primary} strokeOpacity="0.3" strokeDasharray="3 5" />
      <Person x={180} y={160} size={0.55} fill={C.primaryRaised} />
      <Person x={200} y={160} size={0.55} fill={C.primary} />
      <Person x={190} y={146} size={0.5} fill={C.primaryRaised} />
    </g>,
  )
}
