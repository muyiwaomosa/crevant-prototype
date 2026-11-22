import { Link } from 'react-router-dom'
import { ArrowLeft, Info } from 'lucide-react'
import type { BetaDocument } from './documents'

/**
 * /beta-privacy and /community-rules. Shows the approved text, or, until it is
 * approved, says it will be published before registration opens. It never
 * shows draft text that could be mistaken for the real document.
 */
export function BetaDocumentPage({ title, doc, backTo = '/app' }: { title: string; doc: BetaDocument | null; backTo?: string }) {
  return (
    <section aria-labelledby="beta-doc-title" className="px-4 py-12 sm:px-6 sm:py-20">
      <div className="mx-auto max-w-2xl">
        <Link to={backTo} className="inline-flex items-center gap-1.5 text-sm font-semibold text-ink-600 hover:text-ink-900">
          <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Back to Splitpost
        </Link>
        <h1 id="beta-doc-title" className="mt-6 font-display text-[2rem] font-extrabold leading-tight tracking-[-0.02em] text-ink-900 sm:text-[2.5rem]">
          {title}
        </h1>
        {doc ? (
          <div data-testid="beta-document">
            <p className="mt-2 text-sm text-ink-500">
              Version {doc.version}, effective {doc.effectiveDate}
            </p>
            <div className="mt-6">
              <doc.Body />
            </div>
          </div>
        ) : (
          <div data-testid="beta-document-not-published" className="mt-8 flex gap-3 rounded-3xl bg-spark-50 p-5 text-ink-700 ring-1 ring-spark-200">
            <Info className="mt-0.5 h-5 w-5 shrink-0 text-spark-700" aria-hidden="true" />
            <p>This will be published before registration for the Splitpost beta opens.</p>
          </div>
        )}
      </div>
    </section>
  )
}
