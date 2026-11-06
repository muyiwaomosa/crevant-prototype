import { createContext, useContext, type ReactNode } from 'react'
import { FlaskConical } from 'lucide-react'

const TourBannerContext = createContext(false)

/** Turns the sample data banner on for every screen inside it. */
export function TourBannerProvider({ enabled, children }: { enabled: boolean; children: ReactNode }) {
  return <TourBannerContext.Provider value={enabled}>{children}</TourBannerContext.Provider>
}

/**
 * Placed by each screen layout where the banner belongs: at the top of the
 * content, after the "Skip to content" link so keyboard users reach that first.
 */
export function TourBannerSlot() {
  return useContext(TourBannerContext) ? <TourBanner /> : null
}

/** Shown on every /tour screen so nobody mistakes sample data for real accounts. */
export function TourBanner() {
  return (
    <div role="note" aria-label="Sample tour" className="border-b border-spark-200 bg-spark-50 text-spark-700">
      <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-center gap-x-3 gap-y-1 px-4 py-2 text-center text-[13px] leading-snug">
        <span className="inline-flex items-center gap-1.5">
          <FlaskConical className="h-4 w-4 shrink-0" aria-hidden="true" />
          <strong className="font-semibold">Sample tour.</strong>
        </span>
        <span>Everything here is made up: the creators, posts and points. Nothing is a real account.</span>
        {/* A full page load: the public site is a separate app. */}
        <a href="/" className="font-semibold underline underline-offset-2 hover:text-spark-600">
          Back to Crevant
        </a>
      </div>
    </div>
  )
}
