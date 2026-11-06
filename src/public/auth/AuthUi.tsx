import clsx from 'clsx'
import type { InputHTMLAttributes, ReactNode } from 'react'
import { Link, Navigate, useLocation } from 'react-router-dom'
import { Loader2, ShieldCheck } from 'lucide-react'
import { useAuth } from '../../auth/AuthProvider'

const cardShadow = 'shadow-[0_1px_2px_rgb(19_25_27/0.06),0_0_0_1px_rgb(19_25_27/0.05)]'

export function AuthCard({ title, intro, children, labelledBy = 'auth-title' }: { title: string; intro?: ReactNode; children: ReactNode; labelledBy?: string }) {
  return (
    <section aria-labelledby={labelledBy} className="px-4 py-12 sm:px-6 sm:py-20">
      <div className={clsx('mx-auto max-w-md rounded-[28px] bg-card p-6 sm:p-9', cardShadow)}>
        <span className="grid h-12 w-12 place-items-center rounded-2xl bg-brand-50 text-brand-600">
          <ShieldCheck className="h-6 w-6" aria-hidden="true" />
        </span>
        <h1 id={labelledBy} className="mt-4 font-display text-[1.7rem] font-extrabold leading-tight tracking-[-0.02em] text-ink-900">
          {title}
        </h1>
        {intro && <div className="mt-2 space-y-2 leading-relaxed text-ink-600">{intro}</div>}
        <div className="mt-6">{children}</div>
      </div>
    </section>
  )
}

export function Field({ label, id, hint, ...input }: { label: string; id: string; hint?: string } & InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div>
      <label htmlFor={id} className="block text-sm font-semibold text-ink-800">
        {label}
      </label>
      <input
        id={id}
        name={id}
        {...input}
        aria-describedby={hint ? `${id}-hint` : undefined}
        className="mt-1.5 block h-12 w-full rounded-2xl border border-ink-200 bg-white px-4 text-base text-ink-900 outline-none transition placeholder:text-ink-400 focus:border-brand-500 focus:ring-2 focus:ring-brand-200"
      />
      {hint && (
        <p id={`${id}-hint`} className="mt-1.5 text-sm text-ink-500">
          {hint}
        </p>
      )}
    </div>
  )
}

/** Error or confirmation message, announced to screen readers. */
export function Message({ tone, children }: { tone: 'error' | 'info' | 'success'; children: ReactNode }) {
  return (
    <div
      role={tone === 'error' ? 'alert' : 'status'}
      className={clsx(
        'rounded-2xl px-4 py-3 text-sm leading-relaxed',
        tone === 'error' && 'bg-[#fdecea] text-[#8a2018] ring-1 ring-[#f5c2bc]',
        tone === 'info' && 'bg-ink-100/70 text-ink-700',
        tone === 'success' && 'bg-brand-50 text-brand-800 ring-1 ring-brand-100',
      )}
    >
      {children}
    </div>
  )
}

export function Spinner({ label }: { label: string }) {
  return (
    <div role="status" className="flex items-center gap-2 text-ink-600">
      <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
      <span>{label}</span>
    </div>
  )
}

export function Unavailable() {
  return (
    <AuthCard
      title="Sign-in isn't available here"
      intro={<p>This version of the site isn't connected to Crevant accounts. If you were invited, use the link in your invitation email.</p>}
    >
      <Link to="/" className="font-semibold text-brand-700 underline underline-offset-2">
        Back to Crevant
      </Link>
    </AuthCard>
  )
}

/** Pages for signed-in members only. Others are sent to sign in, then back. */
export function RequireAuth({ children }: { children: ReactNode }) {
  const { status } = useAuth()
  const location = useLocation()
  if (status === 'unavailable') return <Unavailable />
  if (status === 'loading')
    return (
      <div className="px-4 py-20">
        <div className="mx-auto max-w-md">
          <Spinner label="Checking your sign-in…" />
        </div>
      </div>
    )
  if (status === 'signed-out') {
    const next = encodeURIComponent(location.pathname + location.search)
    return <Navigate to={`/sign-in?next=${next}`} replace />
  }
  return <>{children}</>
}
