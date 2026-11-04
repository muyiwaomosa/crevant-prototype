import type { ArtworkKind } from '../types'

// Self contained SVG illustrations used as sample post media and cover art.
// Keeping these inline means the demo has no external image dependencies.

const W = 400
const H = 320

function Ridge() {
  return (
    <>
      <defs>
        <linearGradient id="ridge-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#f6c9a0" />
          <stop offset="0.55" stopColor="#f2a985" />
          <stop offset="1" stopColor="#c98b8f" />
        </linearGradient>
      </defs>
      <rect width={W} height={H} fill="url(#ridge-sky)" />
      <circle cx="285" cy="128" r="34" fill="#fff1d6" opacity="0.9" />
      <path d="M0 200 L70 140 L120 175 L190 100 L250 160 L300 130 L400 190 L400 320 L0 320Z" fill="#8a6f8f" />
      <path d="M0 235 L60 190 L130 230 L210 160 L290 220 L350 195 L400 225 L400 320 L0 320Z" fill="#5d5478" />
      <path d="M0 275 L90 235 L170 268 L260 228 L330 262 L400 248 L400 320 L0 320Z" fill="#33395a" />
      <path d="M190 100 L205 116 L198 118 L210 130 L180 112Z" fill="#fff" opacity="0.5" />
    </>
  )
}

function Coast() {
  return (
    <>
      <defs>
        <linearGradient id="coast-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ffd59e" />
          <stop offset="1" stopColor="#ff9a76" />
        </linearGradient>
        <linearGradient id="coast-sea" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#3a7d8c" />
          <stop offset="1" stopColor="#163e4f" />
        </linearGradient>
      </defs>
      <rect width={W} height={H} fill="url(#coast-sky)" />
      <circle cx="200" cy="178" r="48" fill="#fff3d9" />
      <rect y="178" width={W} height={142} fill="url(#coast-sea)" />
      {[0, 1, 2, 3, 4].map((i) => (
        <rect key={i} x={150 - i * 6} y={190 + i * 14} width={100 + i * 12} height="3" rx="1.5" fill="#ffe1b0" opacity={0.7 - i * 0.12} />
      ))}
      <path d="M0 178 L40 150 L80 160 L120 178Z" fill="#244a59" />
      <path d="M290 178 L330 135 L360 150 L400 128 L400 178Z" fill="#244a59" />
    </>
  )
}

function Bowl() {
  return (
    <>
      <rect width={W} height={H} fill="#e7d3b8" />
      <circle cx="200" cy="160" r="118" fill="#2b2f36" />
      <circle cx="200" cy="160" r="104" fill="#b8431f" />
      <circle cx="200" cy="160" r="104" fill="#d8642f" opacity="0.6" />
      <ellipse cx="160" cy="130" rx="26" ry="20" fill="#7a3a22" />
      <ellipse cx="236" cy="190" rx="24" ry="18" fill="#7a3a22" />
      <ellipse cx="232" cy="128" rx="18" ry="14" fill="#8c4429" />
      {[
        [150, 190], [180, 210], [255, 150], [200, 110], [170, 165], [225, 165],
      ].map(([x, y], i) => (
        <ellipse key={i} cx={x} cy={y} rx="11" ry="5" fill="#3f8f4a" transform={`rotate(${i * 37} ${x} ${y})`} />
      ))}
      <circle cx="200" cy="160" r="104" fill="none" stroke="#f3e2c9" strokeWidth="2" opacity="0.4" />
      <path d="M150 40 C140 20 165 15 155 0" stroke="#fff" strokeWidth="5" fill="none" opacity="0.35" strokeLinecap="round" />
      <path d="M210 36 C200 16 225 11 215 -4" stroke="#fff" strokeWidth="5" fill="none" opacity="0.3" strokeLinecap="round" />
      <rect x="318" y="40" width="10" height="240" rx="5" fill="#9b6b3f" transform="rotate(12 323 160)" />
    </>
  )
}

function Citrus() {
  const slices = [
    [120, 120, 62, '#f5a524'],
    [270, 110, 52, '#f07c3a'],
    [210, 220, 70, '#f9c74f'],
  ] as const
  return (
    <>
      <rect width={W} height={H} fill="#1f4f47" />
      {slices.map(([cx, cy, r, c], i) => (
        <g key={i}>
          <circle cx={cx} cy={cy} r={r} fill={c} />
          <circle cx={cx} cy={cy} r={r - 7} fill="#fff3d6" opacity="0.85" />
          {Array.from({ length: 10 }).map((_, k) => {
            const a = (k / 10) * Math.PI * 2
            return (
              <path
                key={k}
                d={`M${cx} ${cy} L${cx + Math.cos(a) * (r - 12)} ${cy + Math.sin(a) * (r - 12)} A${r - 12} ${r - 12} 0 0 1 ${cx + Math.cos(a + 0.55) * (r - 12)} ${cy + Math.sin(a + 0.55) * (r - 12)}Z`}
                fill={c}
                opacity="0.85"
              />
            )
          })}
        </g>
      ))}
      {[[60, 260], [340, 230], [330, 40], [50, 40], [350, 290]].map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r={6 + (i % 3) * 3} fill="#b8431f" opacity="0.9" />
      ))}
    </>
  )
}

function Vinyl() {
  return (
    <>
      <rect width={W} height={H} fill="#f2b84b" />
      <rect x="40" y="40" width="240" height="240" rx="6" fill="#1e2a44" />
      <rect x="40" y="40" width="240" height="240" rx="6" fill="none" stroke="#fff" strokeOpacity="0.15" />
      <circle cx="270" cy="160" r="118" fill="#141414" />
      {[100, 86, 72, 58].map((r) => (
        <circle key={r} cx="270" cy="160" r={r} fill="none" stroke="#2c2c2c" strokeWidth="2" />
      ))}
      <circle cx="270" cy="160" r="38" fill="#e0483a" />
      <circle cx="270" cy="160" r="5" fill="#f2b84b" />
      <path d="M200 90 A90 90 0 0 1 250 72" stroke="#fff" strokeOpacity="0.25" strokeWidth="6" fill="none" strokeLinecap="round" />
      {[0, 1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
        <rect key={i} x={64 + i * 14} y={200 - [30, 52, 40, 70, 46, 60, 28, 44, 36][i]} width="7" height={[30, 52, 40, 70, 46, 60, 28, 44, 36][i]} rx="3.5" fill="#f2b84b" opacity="0.9" />
      ))}
    </>
  )
}

function Keys() {
  return (
    <>
      <rect width={W} height={H} fill="#2a2140" />
      <rect x="0" y="150" width={W} height="170" fill="#f8f2e7" />
      {Array.from({ length: 15 }).map((_, i) => (
        <rect key={i} x={i * 28 - 10} y="150" width="27" height="170" fill="#fbf7f0" stroke="#d8cfc0" />
      ))}
      {[0, 1, 3, 4, 5, 7, 8, 10, 11, 12, 14].map((i) => (
        <rect key={i} x={i * 28 + 8} y="150" width="16" height="100" rx="2" fill="#1a1626" />
      ))}
      <circle cx="90" cy="80" r="40" fill="#e0483a" opacity="0.85" />
      <circle cx="140" cy="70" r="26" fill="#f5a524" opacity="0.9" />
      <rect x="230" y="50" width="130" height="10" rx="5" fill="#9d8cff" opacity="0.6" />
      <rect x="230" y="72" width="90" height="10" rx="5" fill="#9d8cff" opacity="0.4" />
      <rect x="230" y="94" width="110" height="10" rx="5" fill="#9d8cff" opacity="0.25" />
    </>
  )
}

function Track() {
  return (
    <>
      <rect width={W} height={H} fill="#2f8f5b" />
      <path d="M-40 320 C80 120 320 120 440 320" fill="#c9553a" />
      {[0, 1, 2, 3, 4, 5].map((i) => (
        <path key={i} d={`M${-40 + i * 22} 320 C${80 + i * 14} ${130 + i * 22} ${320 - i * 14} ${130 + i * 22} ${440 - i * 22} 320`} fill="none" stroke="#fff" strokeWidth="2" opacity="0.8" />
      ))}
      <path d="M92 320 C160 230 240 230 308 320" fill="#2f8f5b" />
      <text x="200" y="300" textAnchor="middle" fontFamily="Bricolage Grotesque, sans-serif" fontWeight="800" fontSize="40" fill="#fff" opacity="0.9">400</text>
      <circle cx="320" cy="60" r="26" fill="#fff4c8" />
    </>
  )
}

function Terminal() {
  const lines = [
    ['#c792ea', 60], ['#82aaff', 140], ['#c3e88d', 100], ['#f78c6c', 170], ['#82aaff', 80], ['#c3e88d', 150], ['#c792ea', 120],
  ] as const
  return (
    <>
      <rect width={W} height={H} fill="#d9d4f5" />
      <rect x="40" y="40" width="320" height="240" rx="14" fill="#1d1b2e" />
      <rect x="40" y="40" width="320" height="34" rx="14" fill="#2a2742" />
      <rect x="40" y="60" width="320" height="14" fill="#2a2742" />
      {['#ff6b6b', '#f5a524', '#3ecf8e'].map((c, i) => (
        <circle key={c} cx={62 + i * 18} cy="57" r="5.5" fill={c} />
      ))}
      {lines.map(([c, w], i) => (
        <g key={i}>
          <rect x="62" y={94 + i * 24} width="14" height="8" rx="4" fill="#4b4766" />
          <rect x={86 + (i % 3) * 16} y={94 + i * 24} width={w} height="8" rx="4" fill={c} opacity="0.9" />
        </g>
      ))}
      <rect x="62" y="262" width="10" height="4" fill="#f5f5f5">
        <animate attributeName="opacity" values="1;0;1" dur="1.2s" repeatCount="indefinite" />
      </rect>
    </>
  )
}

function Shapes() {
  return (
    <>
      <rect width={W} height={H} fill="#f3ebdd" />
      <rect x="30" y="30" width="160" height="160" fill="#1f3a5f" />
      <circle cx="110" cy="110" r="58" fill="#f3ebdd" />
      <circle cx="110" cy="110" r="30" fill="#e0483a" />
      <rect x="210" y="30" width="160" height="76" fill="#f5a524" />
      <path d="M210 126 L370 126 L370 290 Z" fill="#0e7c6b" />
      <path d="M30 210 A80 80 0 0 1 190 210 Z" fill="#e0483a" />
      <rect x="30" y="226" width="160" height="64" fill="#1f3a5f" opacity="0.15" />
      {[0, 1, 2, 3].map((i) => (
        <circle key={i} cx={52 + i * 38} cy="258" r="12" fill="#1f3a5f" />
      ))}
      <circle cx="258" cy="66" r="14" fill="#1f3a5f" />
    </>
  )
}

function Leaves() {
  const leaves = [
    [80, 260, -30, 1], [130, 240, -10, 1.2], [200, 250, 5, 1.4], [270, 240, 20, 1.15], [330, 262, 35, 1],
    [160, 180, -18, 0.9], [245, 175, 14, 0.95],
  ] as const
  return (
    <>
      <rect width={W} height={H} fill="#f4efe2" />
      <circle cx="320" cy="70" r="36" fill="#f5a524" opacity="0.8" />
      {leaves.map(([x, y, r, s], i) => (
        <g key={i} transform={`translate(${x} ${y}) rotate(${r}) scale(${s})`}>
          <path d="M0 0 C-40 -50 -30 -120 0 -150 C30 -120 40 -50 0 0Z" fill={i % 2 ? '#2f8f5b' : '#1f6f4a'} />
          <path d="M0 0 L0 -140" stroke="#cfe8c4" strokeWidth="2" opacity="0.6" />
        </g>
      ))}
      <rect x="120" y="262" width="160" height="58" rx="6" fill="#c9553a" />
      <rect x="110" y="256" width="180" height="16" rx="4" fill="#a8432c" />
    </>
  )
}

function Books() {
  const books = [
    ['#1f3a5f', 210, 24], ['#e0483a', 190, 20], ['#f5a524', 230, 22], ['#0e7c6b', 200, 26], ['#7a5fa8', 220, 22],
  ] as const
  return (
    <>
      <rect width={W} height={H} fill="#f6e7d4" />
      <rect x="0" y="270" width={W} height="50" fill="#c79b6d" />
      {books.map(([c, w, h], i) => (
        <g key={i}>
          <rect x={(W - w) / 2 + (i % 2 ? 8 : -8)} y={270 - (i + 1) * h - i * 2} width={w} height={h} rx="3" fill={c} />
          <rect x={(W - w) / 2 + (i % 2 ? 8 : -8) + 14} y={270 - (i + 1) * h - i * 2 + h / 2 - 2} width={w * 0.35} height="4" rx="2" fill="#fff" opacity="0.5" />
        </g>
      ))}
      <path d="M270 90 L300 40 L310 46 L282 96Z" fill="#e0483a" />
      <circle cx="90" cy="70" r="28" fill="#fff" opacity="0.6" />
    </>
  )
}

function Sunrise() {
  return (
    <>
      <defs>
        <linearGradient id="sunrise-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#bfe3dc" />
          <stop offset="1" stopColor="#fbe3b8" />
        </linearGradient>
      </defs>
      <rect width={W} height={H} fill="url(#sunrise-sky)" />
      <circle cx="200" cy="200" r="70" fill="#f5a524" />
      <circle cx="200" cy="200" r="96" fill="#f5a524" opacity="0.2" />
      <path d="M0 230 C90 180 160 190 220 215 C280 240 340 200 400 210 L400 320 L0 320Z" fill="#4f9d7e" />
      <path d="M0 265 C100 230 190 250 260 262 C320 272 360 250 400 255 L400 320 L0 320Z" fill="#0e7c6b" />
      <path d="M60 236 L60 206 M54 214 L60 206 L66 214" stroke="#0a453d" strokeWidth="3" fill="none" />
      <path d="M330 222 L330 196 M325 203 L330 196 L335 203" stroke="#0a453d" strokeWidth="3" fill="none" />
    </>
  )
}

const SCENES: Record<ArtworkKind, () => React.ReactElement> = {
  ridge: Ridge,
  coast: Coast,
  bowl: Bowl,
  citrus: Citrus,
  vinyl: Vinyl,
  keys: Keys,
  track: Track,
  terminal: Terminal,
  shapes: Shapes,
  leaves: Leaves,
  books: Books,
  sunrise: Sunrise,
}

export const ARTWORK_KINDS = Object.keys(SCENES) as ArtworkKind[]

export function Artwork({ kind, label, className }: { kind: ArtworkKind; label?: string; className?: string }) {
  const Scene = SCENES[kind] ?? Sunrise
  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="xMidYMid slice"
      className={className}
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    >
      <Scene />
    </svg>
  )
}
