import { Link } from 'react-router-dom'
import { ArrowLeft, Info } from 'lucide-react'
import { APPROVED_NOTICE, type ApprovedNotice } from './privacy/notice'

/**
 * /privacy. Until a privacy notice is approved (src/public/privacy/notice.ts),
 * this page says plainly that there is no published notice yet and that
 * Crevant isn't accepting registrations. It never shows placeholder text that
 * could be mistaken for a notice, and search engines never index it.
 */
export function PrivacyPage({ notice = APPROVED_NOTICE }: { notice?: ApprovedNotice | null }) {
  return (
    <section aria-labelledby="privacy-title" className="px-4 py-12 sm:px-6 sm:py-20">
      <div className="mx-auto max-w-2xl">
        <Link to="/" className="inline-flex items-center gap-1.5 text-sm font-semibold text-ink-600 hover:text-ink-900">
          <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Back to Crevant
        </Link>
        <h1 id="privacy-title" className="mt-6 font-display text-[2rem] font-extrabold leading-tight tracking-[-0.02em] text-ink-900 sm:text-[2.5rem]">
          Privacy notice
        </h1>
        {notice ? (
          <div data-testid="privacy-notice">
            <p className="mt-2 text-sm text-ink-500">
              Version {notice.version}, effective {notice.effectiveDate}
            </p>
            <div className="mt-6">
              <notice.Body />
            </div>
          </div>
        ) : (
          <div data-testid="privacy-not-published" className="mt-8 flex gap-3 rounded-3xl bg-spark-50 p-5 text-ink-700 ring-1 ring-spark-200">
            <Info className="mt-0.5 h-5 w-5 shrink-0 text-spark-700" aria-hidden="true" />
            <div className="space-y-2">
              <p className="font-semibold text-ink-900">Not yet published.</p>
              <p>Crevant's privacy notice hasn't been published yet. Nothing on this page is a privacy notice.</p>
              <p>Crevant isn't accepting waitlist registrations until the approved notice is published here.</p>
            </div>
          </div>
        )}
      </div>
    </section>
  )
}
