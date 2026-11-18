// TEST ONLY. Never deployed: it lives outside src and is built only by
// scripts/e2e/waitlist-journey.sh (vite --config e2e/harness/vite.config.ts).
//
// Mounts the REAL /join waitlist components (InviteBanner and WaitlistForm)
// with a stand-in approved notice version, posting to the real join-waitlist
// function running locally in Supabase's Edge runtime (e2e/edge/waitlist-e2e).
// The only stand-in is Cloudflare's Turnstile widget: it hands the form the
// token the test function accepts ("pass:<hostname>:join"), or a failing one
// with ?turnstile=fail.
import '@fontsource-variable/inter'
import '@fontsource-variable/archivo/wdth.css'
import './harness.css'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { InviteBanner } from '../../../src/public/waitlist/InviteBanner'
import { WaitlistForm } from '../../../src/public/waitlist/WaitlistForm'
import type { WaitlistConfig } from '../../../src/public/waitlist/config'
import type { MountTurnstile } from '../../../src/public/waitlist/turnstile'

const params = new URLSearchParams(window.location.search)
const config: WaitlistConfig = {
  endpoint: import.meta.env.VITE_E2E_WAITLIST_ENDPOINT as string,
  turnstileSiteKey: 'test-only-site-key',
  noticeUrl: '/privacy',
  noticeVersion: 'e2e-notice-1',
}

const mount: MountTurnstile = async (el, _siteKey, onToken) => {
  const token = params.get('turnstile') === 'fail' ? 'fail' : `pass:${window.location.hostname}:join`
  el.textContent = 'Bot check (test stand-in)'
  const issue = () => window.setTimeout(() => onToken(token), 30)
  issue()
  return { reset: issue, remove: () => {} }
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {/* The real site renders the form inside its router; the success screen's links need one. */}
    <BrowserRouter>
    <main className="px-4 py-10 sm:px-6">
      <div className="mx-auto max-w-2xl">
        <h1 className="font-display text-[2rem] font-extrabold text-ink-900">Join the Waitlist</h1>
        <InviteBanner config={config} />
        <WaitlistForm config={config} mount={mount} />
      </div>
    </main>
    </BrowserRouter>
  </StrictMode>,
)
