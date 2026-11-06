import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App'
import { PublicApp } from './public/PublicApp'
import { TOUR_BASE, resolveEntry } from './entry'

const entry = resolveEntry(window.location)
if (entry.kind === 'tour' && entry.redirectTo) {
  // Old prototype links keep working: /discover becomes /tour/discover.
  window.history.replaceState(null, '', entry.redirectTo)
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {entry.kind === 'public' ? (
      <PublicApp />
    ) : entry.kind === 'tour' ? (
      <App basename={TOUR_BASE} banner />
    ) : (
      <App />
    )}
  </StrictMode>,
)
