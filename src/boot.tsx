import { StrictMode, type ComponentType } from 'react'
import { createRoot } from 'react-dom/client'
// Typefaces served from this site (Fontsource, SIL Open Font License), not
// Google Fonts, so visitors' browsers contact no third party for them. Each
// family is split by script, so a page downloads only the subsets it shows.
import '@fontsource-variable/inter'
import '@fontsource-variable/archivo/wdth.css'
import '@fontsource-variable/bricolage-grotesque/opsz.css'
import './index.css'
import App from './App'
import { TOUR_BASE, resolveEntry } from './entry'
import { setRobotsMeta } from './public/robots'

/**
 * Starts the app. Shared by the full app (src/main.tsx) and the public site
 * build (src/site/main.tsx), so both make exactly the same choice for every
 * address: the production demo address gets the sample prototype, /tour gets
 * the tour, the member app address gets only member pages (noindex), and
 * everything else gets `Public`.
 */
export function boot(Public: ComponentType, { demoFallback = true }: { demoFallback?: boolean } = {}) {
  const entry = resolveEntry(window.location, { demoFallback })
  // The tour, the demo and the member app address are never indexed. (Public
  // pages set their own robots tag as the visitor moves around.)
  if (entry.kind !== 'public') setRobotsMeta('noindex')
  if ((entry.kind === 'tour' || entry.kind === 'member') && entry.redirectTo) {
    // Old prototype links keep working: /discover becomes /tour/discover.
    // On the member app address, anything but a member page goes to /app.
    window.history.replaceState(null, '', entry.redirectTo)
  }
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      {entry.kind === 'public' || entry.kind === 'member' ? <Public /> : entry.kind === 'tour' ? <App basename={TOUR_BASE} banner /> : <App />}
    </StrictMode>,
  )
}
