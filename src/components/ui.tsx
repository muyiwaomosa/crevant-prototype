import clsx from 'clsx'
import { useEffect, useRef, type ButtonHTMLAttributes, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { BadgeCheck, Info, X } from 'lucide-react'
import type { Creator } from '../types'

// ---------------------------------------------------------------------------
// Avatar: generated from initials and a hue, so no image hosting is needed.

export function Avatar({
  name,
  hue,
  size = 40,
  className,
}: {
  name: string
  hue: number
  size?: number
  className?: string
}) {
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join('')
  return (
    <span
      aria-hidden="true"
      className={clsx('inline-grid shrink-0 place-items-center rounded-full font-display font-bold text-white', className)}
      style={{
        width: size,
        height: size,
        fontSize: Math.max(11, size * 0.38),
        background: `linear-gradient(135deg, hsl(${hue} 62% 46%), hsl(${(hue + 40) % 360} 70% 36%))`,
        boxShadow: 'inset 0 0 0 1.5px rgb(255 255 255 / 0.25)',
      }}
    >
      {initials}
    </span>
  )
}

export function CreatorAvatar({ creator, size = 40, className }: { creator: Creator; size?: number; className?: string }) {
  return <Avatar name={creator.name} hue={creator.hue} size={size} className={className} />
}

export function CreatorName({ creator, className, linked = true }: { creator: Creator; className?: string; linked?: boolean }) {
  const inner = (
    <>
      <span className="truncate">{creator.name}</span>
      {!creator.isSelf && <BadgeCheck className="h-4 w-4 shrink-0 text-brand-500" aria-label="Demo creator" />}
      {creator.isSelf && (
        <span className="rounded-full bg-ink-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-ink-600">
          You
        </span>
      )}
    </>
  )
  const cls = clsx('inline-flex min-w-0 items-center gap-1 font-semibold text-ink-900', className)
  return linked ? (
    <Link to={`/creator/${creator.id}`} className={clsx(cls, 'hover:underline')}>
      {inner}
    </Link>
  ) : (
    <span className={cls}>{inner}</span>
  )
}

// ---------------------------------------------------------------------------
// Buttons

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'spark' | 'danger'

export function buttonClass(variant: ButtonVariant = 'primary', size: 'sm' | 'md' | 'lg' = 'md') {
  return clsx(
    'inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-full font-semibold transition active:scale-[0.97] disabled:opacity-50 disabled:active:scale-100',
    size === 'sm' && 'h-8 px-3.5 text-sm',
    size === 'md' && 'h-10 px-4.5 text-sm',
    size === 'lg' && 'h-12 px-6 text-base',
    variant === 'primary' && 'bg-brand-600 text-white hover:bg-brand-700',
    variant === 'secondary' && 'border border-ink-200 bg-white text-ink-800 hover:border-ink-300 hover:bg-ink-50',
    variant === 'ghost' && 'text-ink-700 hover:bg-ink-100',
    variant === 'spark' && 'bg-spark-400 text-ink-900 hover:bg-spark-300',
    variant === 'danger' && 'bg-[#c2372b] text-white hover:bg-[#a52d23]',
  )
}

export function Button({
  variant = 'primary',
  size = 'md',
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant; size?: 'sm' | 'md' | 'lg' }) {
  return <button type="button" className={clsx(buttonClass(variant, size), className)} {...props} />
}

// ---------------------------------------------------------------------------
// Connection Points visuals

export function SparkIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <circle cx="12" cy="12" r="11" fill="var(--color-spark-400)" />
      <path d="M12 5.5l1.7 4.8 4.8 1.7-4.8 1.7-1.7 4.8-1.7-4.8-4.8-1.7 4.8-1.7z" fill="#fff" />
    </svg>
  )
}

export function CPAmount({ value, className }: { value: number; className?: string }) {
  return (
    <span className={clsx('inline-flex items-center gap-1 font-semibold tabular-nums', className)}>
      <SparkIcon className="h-4 w-4" />
      {value.toLocaleString()} CP
    </span>
  )
}

export function DemoTag({ children = 'Demo', className }: { children?: ReactNode; className?: string }) {
  return (
    <span
      className={clsx(
        'inline-flex items-center rounded-full border border-dashed border-ink-300 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-ink-500',
        className,
      )}
    >
      {children}
    </span>
  )
}

export function Notice({ children, className, tone = 'neutral' }: { children: ReactNode; className?: string; tone?: 'neutral' | 'spark' | 'brand' }) {
  return (
    <div
      className={clsx(
        'flex gap-2.5 rounded-2xl px-4 py-3 text-sm leading-relaxed',
        tone === 'neutral' && 'bg-ink-100/70 text-ink-700',
        tone === 'spark' && 'bg-spark-50 text-spark-700 ring-1 ring-spark-200',
        tone === 'brand' && 'bg-brand-50 text-brand-800 ring-1 ring-brand-100',
        className,
      )}
    >
      <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
      <div>{children}</div>
    </div>
  )
}

export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={clsx('rounded-3xl bg-card shadow-[0_1px_2px_rgb(19_25_27/0.06),0_0_0_1px_rgb(19_25_27/0.05)]', className)}>{children}</div>
}

export function PageHeader({ title, subtitle, action }: { title: string; subtitle?: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-5 flex items-end justify-between gap-4">
      <div className="min-w-0">
        <h1 className="font-display text-[1.75rem] font-extrabold leading-tight tracking-[-0.02em] text-ink-900">{title}</h1>
        {subtitle && <p className="mt-1 text-[15px] leading-snug text-ink-500">{subtitle}</p>}
      </div>
      {action}
    </div>
  )
}

export function EmptyState({ icon, title, body, action }: { icon: ReactNode; title: string; body: ReactNode; action?: ReactNode }) {
  return (
    <Card className="flex flex-col items-center px-6 py-10 text-center">
      <div className="mb-3 grid h-14 w-14 place-items-center rounded-2xl bg-brand-50 text-brand-600">{icon}</div>
      <h2 className="font-display text-lg font-bold text-ink-900">{title}</h2>
      <p className="mt-1 max-w-sm text-sm leading-relaxed text-ink-500">{body}</p>
      {action && <div className="mt-5">{action}</div>}
    </Card>
  )
}

export function Tabs<T extends string>({
  tabs,
  value,
  onChange,
  label,
}: {
  tabs: Array<{ id: T; label: string; count?: number }>
  value: T
  onChange: (id: T) => void
  label: string
}) {
  return (
    <div role="tablist" aria-label={label} className="no-scrollbar mb-4 flex gap-1 overflow-x-auto rounded-full bg-ink-100/80 p-1">
      {tabs.map((t) => (
        <button
          key={t.id}
          role="tab"
          type="button"
          aria-selected={value === t.id}
          onClick={() => onChange(t.id)}
          className={clsx(
            'flex h-9 flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-full px-3 text-sm font-semibold transition',
            value === t.id ? 'bg-white text-ink-900 shadow-sm' : 'text-ink-500 hover:text-ink-800',
          )}
        >
          {t.label}
          {t.count !== undefined && <span className="text-xs font-medium text-ink-400">{t.count}</span>}
        </button>
      ))}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Modal / bottom sheet

export function Modal({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean
  onClose: () => void
  title: string
  children: ReactNode
}) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const prev = document.activeElement as HTMLElement | null
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    ref.current?.focus()
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
      prev?.focus?.()
    }
  }, [open, onClose])

  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
      <div className="absolute inset-0 bg-ink-900/45 backdrop-blur-[2px]" onClick={onClose} aria-hidden="true" />
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        className="relative max-h-[90dvh] w-full max-w-md animate-rise overflow-y-auto rounded-t-[28px] bg-white p-6 pb-safe shadow-2xl outline-none sm:rounded-[28px]"
      >
        <div className="mb-4 flex items-start justify-between gap-4">
          <h2 className="font-display text-xl font-bold text-ink-900">{title}</h2>
          <button type="button" onClick={onClose} className="-m-2 rounded-full p-2 text-ink-500 hover:bg-ink-100" aria-label="Close">
            <X className="h-5 w-5" />
          </button>
        </div>
        {children}
        <div className="h-2" />
      </div>
    </div>
  )
}
