import clsx from 'clsx'
import { CheckCircle2, Info, TriangleAlert, X } from 'lucide-react'
import { useStore } from '../state/store'
import { SparkIcon } from './ui'

export function Toasts() {
  const { toasts, dismissToast } = useStore()
  return (
    <div
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 top-[calc(env(safe-area-inset-top)+64px)] z-[60] flex flex-col items-center gap-2 px-4 md:top-6"
    >
      {toasts.map((t) => (
        <div
          key={t.id}
          role="status"
          className={clsx(
            'pointer-events-auto flex w-full max-w-sm animate-rise items-start gap-3 rounded-2xl px-4 py-3 shadow-lg ring-1',
            t.tone === 'earn' && 'bg-ink-900 text-white ring-ink-800',
            t.tone !== 'earn' && 'bg-white text-ink-800 ring-ink-100',
          )}
        >
          {t.tone === 'earn' && (
            <span className="relative mt-0.5">
              <SparkIcon className="h-6 w-6 animate-pop" />
              <span className="absolute -top-1 left-1/2 -translate-x-1/2 animate-float text-xs font-bold text-spark-300" aria-hidden="true">
                +{t.points}
              </span>
            </span>
          )}
          {t.tone === 'success' && <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-brand-500" />}
          {t.tone === 'info' && <Info className="mt-0.5 h-5 w-5 shrink-0 text-ink-400" />}
          {t.tone === 'warn' && <TriangleAlert className="mt-0.5 h-5 w-5 shrink-0 text-spark-500" />}
          <div className="min-w-0 flex-1">
            <p className={clsx('text-sm font-semibold', t.tone === 'earn' && 'text-spark-300')}>{t.title}</p>
            {t.body && <p className={clsx('mt-0.5 text-[13px] leading-snug', t.tone === 'earn' ? 'text-ink-200' : 'text-ink-500')}>{t.body}</p>}
          </div>
          <button
            type="button"
            onClick={() => dismissToast(t.id)}
            className={clsx('-m-1 rounded-full p-1', t.tone === 'earn' ? 'text-ink-300 hover:bg-white/10' : 'text-ink-400 hover:bg-ink-100')}
            aria-label="Dismiss"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      ))}
    </div>
  )
}
