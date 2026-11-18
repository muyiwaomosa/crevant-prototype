import clsx from 'clsx'
import { SPLITPOST_LOGO_SRC } from '../../../../logo/SplitpostLogo'
import { C, Heart, Person, PostCard, Thread } from './primitives'

const svgProps = { role: 'presentation', 'aria-hidden': true, focusable: 'false' } as const

/** THE PEOPLE BEHIND THE POSTS, moment 1: the effort. A creator at work late, posts piling up, an audience gathering. */
export function CreatorEffort({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 320 240" {...svgProps} data-testid="moment-effort" className={clsx('h-auto w-full', className)}>
      <rect x="0" y="0" width="320" height="240" rx="28" fill="#21304a" />
      {/* Night window: a moon. */}
      <circle cx="262" cy="52" r="20" fill={C.bg} />
      <circle cx="272" cy="46" r="18" fill="#21304a" />
      {/* Desk, laptop, camera on a tripod. */}
      <rect x="30" y="176" width="260" height="10" rx="5" fill={C.secondary} opacity="0.5" />
      <rect x="150" y="128" width="78" height="48" rx="6" fill={C.bg} />
      <rect x="156" y="134" width="66" height="36" rx="3" fill={C.primary} />
      <path d="M186 146 l12 8 -12 8 Z" fill={C.white} />
      <rect x="64" y="96" width="34" height="24" rx="6" fill={C.bg} />
      <circle cx="81" cy="108" r="7" fill={C.ink} />
      <path d="M81 120 L66 176 M81 120 L96 176 M81 120 V176" stroke={C.bg} strokeWidth="3" strokeLinecap="round" />
      {/* The creator. */}
      <Person x={130} y={176} size={2.1} fill={C.accent} head={C.bg} />
      {/* Posts stacking up, one after another. */}
      <PostCard x={234} y={96} w={52} h={60} shadow={false} />
      <PostCard x={226} y={108} w={52} h={60} shadow={false} />
      <PostCard x={218} y={120} w={52} h={60} />
      {/* A few people starting to notice. */}
      {[40, 64, 88].map((x, i) => (
        <circle key={x} cx={x} cy={44 - i * 4} r="7" fill={C.secondary} opacity={0.5 + i * 0.2} />
      ))}
    </svg>
  )
}

/** Moment 2: the frustration. Engagement keeps climbing; dependable income doesn't arrive. */
export function CreatorFrustration({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 320 240" {...svgProps} data-testid="moment-frustration" className={clsx('h-auto w-full', className)}>
      <rect x="0" y="0" width="320" height="240" rx="28" fill={C.white} />
      {/* Engagement: hearts and bars rising. */}
      {[0, 1, 2, 3, 4].map((i) => (
        <rect key={i} x={40 + i * 30} y={170 - (i + 1) * 22} width="20" height={(i + 1) * 22} rx="6" fill={C.primary} opacity={0.5 + i * 0.1} />
      ))}
      <Heart x={52} y={74} s={1.6} />
      <Heart x={110} y={46} s={2} />
      <Heart x={160} y={26} s={1.4} />
      {/* A month calendar with gaps: income you can't plan around. */}
      <rect x="200" y="70" width="90" height="100" rx="12" fill={C.bg} stroke={C.ink} strokeOpacity="0.12" />
      <rect x="200" y="70" width="90" height="22" rx="12" fill={C.accentText} />
      {Array.from({ length: 12 }).map((_, i) => {
        const filled = [1, 6, 7].includes(i)
        return <rect key={i} x={210 + (i % 4) * 19} y={100 + Math.floor(i / 4) * 20} width="13" height="13" rx="3" fill={filled ? C.accent : C.ink} opacity={filled ? 1 : 0.08} />
      })}
      {/* The creator, looking at both. */}
      <Person x={160} y={226} size={1.5} fill={C.primary} />
      <text x="248" y="200" textAnchor="middle" fontFamily="var(--font-sp-display)" fontWeight="900" fontSize="28" fill={C.accentText}>
        ?
      </text>
    </svg>
  )
}

/** Moment 3: the overlooked supporters. Fans sharing a creator's posts, and getting only a thank you. Smaller than the creator moments. */
export function Supporters({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 320 200" {...svgProps} data-testid="moment-supporters" className={clsx('h-auto w-full', className)}>
      <rect x="0" y="0" width="320" height="200" rx="28" fill={C.tint} />
      {/* The creator's post at the centre. */}
      <PostCard x={128} y={40} w={64} h={76} />
      {/* Fans passing it on to new people. */}
      {[
        [48, 70],
        [56, 150],
        [264, 72],
        [258, 152],
      ].map(([x, y], i) => (
        <g key={i}>
          <Thread d={`M160 80 L${x} ${y - 10}`} width={2} opacity={0.35} dashed />
          <Person x={x} y={y} size={0.8} fill={C.primaryRaised} />
        </g>
      ))}
      {[
        [20, 120],
        [92, 176],
        [298, 118],
        [226, 182],
      ].map(([x, y], i) => (
        <Person key={i} x={x} y={y} size={0.5} outline />
      ))}
      {/* All they get: a thank you. */}
      <Heart x={152} y={134} s={1.5} fill={C.accentText} />
    </svg>
  )
}

/** A BETTER FUTURE: a creator juggling another job today, and the possibility of creating with more freedom. An aspiration, not an outcome. */
export function TodayVsPossible({ className }: { className?: string }) {
  return (
    <div data-testid="today-vs-possible" className={clsx('grid grid-cols-1 gap-4 min-[520px]:grid-cols-2', className)}>
      <svg viewBox="0 0 300 240" {...svgProps} data-testid="today" className="h-auto w-full">
        <rect x="0" y="0" width="300" height="240" rx="28" fill="#e9e7e2" />
        {/* Today: a clock, a day-job laptop and a camera competing for one person. */}
        <circle cx="62" cy="58" r="26" fill={C.white} stroke={C.muted} strokeWidth="3" />
        <path d="M62 42 V58 L74 66" stroke={C.muted} strokeWidth="3" strokeLinecap="round" fill="none" />
        <rect x="40" y="132" width="80" height="50" rx="6" fill={C.muted} opacity="0.7" />
        <rect x="30" y="182" width="100" height="8" rx="4" fill={C.muted} opacity="0.5" />
        <rect x="190" y="132" width="50" height="34" rx="8" fill={C.muted} opacity="0.7" />
        <circle cx="215" cy="149" r="10" fill="#e9e7e2" />
        <Person x={150} y={214} size={1.7} fill={C.muted} />
        <Thread d="M132 150 C 126 140, 122 140, 118 150" color={C.muted} width={3} opacity={0.6} />
        <Thread d="M168 150 C 174 140, 180 140, 188 148" color={C.muted} width={3} opacity={0.6} />
      </svg>
      <svg viewBox="0 0 300 240" {...svgProps} data-testid="possible" className="h-auto w-full">
        <defs>
          <radialGradient id="sp-possible-glow" cx="50%" cy="38%" r="70%">
            <stop offset="0%" stopColor={C.accent} stopOpacity="0.55" />
            <stop offset="100%" stopColor={C.tint} stopOpacity="1" />
          </radialGradient>
        </defs>
        <rect x="0" y="0" width="300" height="240" rx="28" fill="url(#sp-possible-glow)" />
        {/* Possible: open space, the camera, a community around them. */}
        <circle cx="150" cy="70" r="30" fill={C.accent} />
        <rect x="186" y="128" width="54" height="36" rx="8" fill={C.primary} />
        <circle cx="213" cy="146" r="11" fill={C.tint} />
        <Person x={140} y={214} size={1.8} fill={C.primary} />
        {[
          [40, 150],
          [70, 116],
          [262, 104],
          [56, 196],
          [254, 200],
        ].map(([x, y], i) => (
          <circle key={i} cx={x} cy={y} r={7 + (i % 2) * 3} fill={C.white} stroke={C.primary} strokeOpacity="0.35" strokeWidth="2" />
        ))}
        <path d="M86 52 l4 9 9 4 -9 4 -4 9 -4 -9 -9 -4 9 -4 Z" fill={C.white} />
        <path d="M238 46 l3 6 6 3 -6 3 -3 6 -3 -6 -6 -3 6 -3 Z" fill={C.white} />
      </svg>
    </div>
  )
}

/**
 * THE INVITATION: creators and fans connected through posts, with the
 * Splitpost badge at the centre. Creators (larger) on an inner ring, fans
 * (smaller) on the outer ring, posts on the threads between them.
 */
export function Constellation({ className }: { className?: string }) {
  const cx = 260
  const cy = 260
  const ring = (n: number, r: number, offset = 0) =>
    Array.from({ length: n }).map((_, i) => {
      const a = offset + (i / n) * Math.PI * 2
      return [cx + r * Math.cos(a), cy + r * Math.sin(a)] as const
    })
  const creators = ring(6, 138, -Math.PI / 2)
  const fans = ring(12, 228, -Math.PI / 2 + Math.PI / 12)
  const posts = ring(6, 92, -Math.PI / 2 + Math.PI / 6)
  return (
    <svg viewBox="0 0 520 520" {...svgProps} data-testid="constellation" className={clsx('h-auto w-full', className)}>
      <circle cx={cx} cy={cy} r="246" fill="none" stroke={C.secondary} strokeOpacity="0.25" strokeWidth="2" strokeDasharray="3 10" />
      <circle cx={cx} cy={cy} r="138" fill="none" stroke={C.secondary} strokeOpacity="0.3" strokeWidth="2" />
      {creators.map(([x, y], i) => (
        <Thread key={`c${i}`} d={`M${cx} ${cy} L${x} ${y}`} color={C.secondary} width={2.5} opacity={0.5} />
      ))}
      {fans.map(([x, y], i) => {
        const [px, py] = creators[Math.floor(i / 2) % creators.length]
        return <Thread key={`f${i}`} d={`M${px} ${py} L${x} ${y}`} color={C.secondary} width={2} opacity={0.4} dashed />
      })}
      {posts.map(([x, y], i) => (
        <g key={`p${i}`} transform={`rotate(${-8 + i * 3} ${x} ${y})`}>
          <rect x={x - 15} y={y - 18} width="30" height="36" rx="6" fill={C.bg} />
          <rect x={x - 10} y={y - 4} width="20" height="14" rx="3" fill={C.secondary} />
          <circle cx={x - 7} cy={y - 11} r="3.5" fill={C.primary} />
        </g>
      ))}
      {creators.map(([x, y], i) => (
        <g key={`cn${i}`}>
          <circle cx={x} cy={y} r="27" fill={C.primaryRaised} stroke={C.secondary} strokeWidth="2.5" />
          <Person x={x} y={y + 14} size={1.05} fill={C.bg} />
        </g>
      ))}
      {fans.map(([x, y], i) => (
        <g key={`fn${i}`}>
          <circle cx={x} cy={y} r="15" fill={C.secondary} />
          <Person x={x} y={y + 8} size={0.55} fill={C.primary} />
        </g>
      ))}
      {/* The Splitpost badge at the centre. */}
      <circle cx={cx} cy={cy} r="58" fill={C.accent} opacity="0.25" />
      <image href={SPLITPOST_LOGO_SRC} x={cx - 46} y={cy - 46} width="92" height="92" />
    </svg>
  )
}
