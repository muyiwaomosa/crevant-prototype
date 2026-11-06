import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { ShieldCheck } from 'lucide-react'
import { buttonClass } from '../components/ui'
import { TOUR_BASE } from '../entry'

/**
 * Deliberately has no form. Invitation requests stay closed until the privacy
 * notice is published and approved, and the server side protections exist.
 */
export function RequestInvitePage() {
  return (
    <PlaceholderPage
      title="Invitation requests open soon."
      body={
        <>
          <p>
            We're finishing our privacy notice first. We'd rather ask for your email once we can tell you exactly how
            it's handled.
          </p>
          <p>Until then, this page collects nothing.</p>
        </>
      }
    />
  )
}

export function PlaceholderPage({ title, body }: { title: string; body: ReactNode }) {
  return (
    <section aria-labelledby="placeholder-title" className="px-4 py-16 sm:px-6 sm:py-24">
      <div className="mx-auto max-w-xl rounded-[28px] bg-card p-7 text-center shadow-[0_1px_2px_rgb(19_25_27/0.06),0_0_0_1px_rgb(19_25_27/0.05)] sm:p-10">
        <span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-brand-50 text-brand-600">
          <ShieldCheck className="h-7 w-7" aria-hidden="true" />
        </span>
        <h1 id="placeholder-title" className="mt-5 font-display text-[1.8rem] font-extrabold leading-tight tracking-[-0.02em] text-ink-900">
          {title}
        </h1>
        <div className="mt-3 space-y-3 leading-relaxed text-ink-600">{body}</div>
        <div className="mt-7 flex flex-col justify-center gap-3 min-[400px]:flex-row">
          <a href={TOUR_BASE} className={buttonClass('primary')}>
            Explore Crevant
          </a>
          <Link to="/" className={buttonClass('secondary')}>
            Back to Crevant
          </Link>
        </div>
      </div>
    </section>
  )
}
