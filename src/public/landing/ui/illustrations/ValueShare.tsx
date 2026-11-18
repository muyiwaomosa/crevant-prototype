import clsx from 'clsx'
import { C, Heart, Person, SplitPost, Thread } from './primitives'

/**
 * Hero: how value is shared, as a concept. One post in two pieces along the
 * badge's diagonal: the upper piece is what the creator made, the lower piece
 * is what the community grew. Threads run from the creator to the upper piece
 * and from the fans to the lower one. It deliberately shows no percentages,
 * amounts or proportions (the pilot allocation stays private).
 */
export function ValueShare({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 480 430" role="presentation" aria-hidden="true" focusable="false" data-testid="value-share" className={clsx('h-auto w-full', className)}>
      {/* Soft halo behind the post. */}
      <circle cx="250" cy="205" r="190" fill={C.tint} />
      <circle cx="250" cy="205" r="138" fill={C.white} opacity="0.7" />

      {/* Threads: creator to the upper piece, fans to the lower piece. */}
      <Thread d="M78 300 C 70 210, 110 140, 160 118" color={C.primary} width={2.5} opacity={0.45} />
      <Thread d="M398 352 C 410 320, 380 300, 344 296" color={C.primary} width={2.5} opacity={0.45} dashed />
      <Thread d="M430 286 C 432 270, 400 262, 344 262" color={C.primary} width={2.5} opacity={0.45} dashed />
      <Thread d="M356 392 C 350 370, 320 340, 300 322" color={C.primary} width={2.5} opacity={0.45} dashed />

      <SplitPost
        x={150}
        y={70}
        w={200}
        h={262}
        gap={13}
        topClassName="motion-safe:animate-[sp-lift_6s_ease-in-out_infinite]"
        bottomClassName="motion-safe:animate-[sp-drop_6s_ease-in-out_infinite]"
        top={
          <g>
            <circle cx="176" cy="96" r="11" fill={C.primary} />
            <rect x="194" y="89" width="74" height="7" rx="3.5" fill={C.ink} opacity="0.78" />
            <rect x="194" y="101" width="44" height="5" rx="2.5" fill={C.ink} opacity="0.3" />
            <rect x="166" y="122" width="168" height="62" rx="12" fill={C.primary} opacity="0.9" />
            {/* The creator's content: a play mark on the picture. */}
            <path d="M242 140 l18 13 -18 13 Z" fill={C.white} />
            <rect x="166" y="194" width="150" height="6" rx="3" fill={C.ink} opacity="0.2" />
          </g>
        }
        bottom={
          <g>
            <Person x={190} y={300} size={0.95} fill={C.primary} />
            <Person x={226} y={304} size={0.82} fill={C.primaryRaised} />
            <Person x={258} y={306} size={0.72} fill={C.primary} />
            <Heart x={292} y={276} s={1.5} />
            <rect x="290" y="300" width="36" height="6" rx="3" fill={C.ink} opacity="0.35" />
            <path d="M310 252 h22 a6 6 0 0 1 6 6 v8 a6 6 0 0 1 -6 6 h-12 l-6 5 v-5 h-4 a6 6 0 0 1 -6 -6 v-8 a6 6 0 0 1 6 -6 Z" fill={C.white} opacity="0.85" />
          </g>
        }
      />

      {/* The creator: larger, on the left. */}
      <circle cx="78" cy="318" r="40" fill={C.white} stroke={C.primary} strokeOpacity="0.18" strokeWidth="2" />
      <Person x={78} y={338} size={1.6} fill={C.primary} />

      {/* The fans who help it grow: smaller, on the right. */}
      <circle cx="430" cy="268" r="22" fill={C.white} stroke={C.primary} strokeOpacity="0.15" strokeWidth="2" />
      <Person x={430} y={279} size={0.85} fill={C.primaryRaised} />
      <circle cx="400" cy="366" r="24" fill={C.white} stroke={C.primary} strokeOpacity="0.15" strokeWidth="2" />
      <Person x={400} y={378} size={0.9} fill={C.primary} />
      <circle cx="350" cy="400" r="18" fill={C.white} stroke={C.primary} strokeOpacity="0.15" strokeWidth="2" />
      <Person x={350} y={409} size={0.68} fill={C.primaryRaised} />

      {/* Small sparks of shared success. */}
      <path d="M118 74 l4 9 9 4 -9 4 -4 9 -4 -9 -9 -4 9 -4 Z" fill={C.accent} />
      <path d="M392 120 l3 6 6 3 -6 3 -3 6 -3 -6 -6 -3 6 -3 Z" fill={C.secondary} />
    </svg>
  )
}
