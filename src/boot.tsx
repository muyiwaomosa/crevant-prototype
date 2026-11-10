import { StrictMode, type ComponentType } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App'
import { TOUR_BASE, resolveEntry } from './entry'
import { setRobotsMeta } from './public/robots'

/**
 * Starts the app. Shared by the full app (src/main.tsx) and the public site
 * build (src/site/main.tsx), so both make exactly the same choice for every
 * address: the production demo address gets the sample prototype, /tour gets
 * the tour, and everything else gets `Public`.
 */
export function boot(Public: ComponentType, { demoFallback = true }: { demoFallback?: boolean } = {}) {
  const entry = resolveEntry(window.location, { demoFallback })
  // The tour and the demo are sample data: never indexed. (Public pages set
  // their own robots tag as the visitor moves around.)
  if (entry.kind !== 'public') setRobotsMeta('noindex')
  if (entry.kind === 'tour' && entry.redirectTo) {
    // Old prototype links keep working: /discover becomes /tour/discover.
    window.history.replaceState(null, '', entry.redirectTo)
  }
  createRoot(document.getElementById('root')!).render(
    <StrictMode>{entry.kind === 'public' ? <Public /> : entry.kind === 'tour' ? <App basename={TOUR_BASE} banner /> : <App />}</StrictMode>,
  )
}
