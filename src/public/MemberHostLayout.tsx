import type { ReactNode } from 'react'
import { Link, Outlet } from 'react-router-dom'
import { ExternalLink } from 'lucide-react'
import { SplitpostWordmark } from './landing/ui/SplitpostWordmark'
import { PUBLIC_SITE_URL } from './member-host'

/**
 * The layout for sign in, password reset, the invitation link and the privacy
 * notice on the member app address (app.splitpost.ca). Unlike the public
 * site's layout it has no marketing or waitlist links: the logo goes to /app,
 * the header holds only the account or sign in link, and the footer offers
 * the privacy notice and one clearly labelled link to the public website
 * (a full page load to www.splitpost.ca).
 */
export function MemberHostLayout({ account }: { account: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col bg-sp-bg text-sp-ink">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-[70] focus:rounded-full focus:bg-white focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:shadow"
      >
        Skip to content
      </a>
      <header data-testid="member-host-header" className="sticky top-0 z-40 border-b border-white/10 bg-sp-primary/95 pt-[env(safe-area-inset-top)] text-white backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-3 px-4 sm:px-6">
          <Link
            to="/app"
            aria-label="Splitpost home"
            className="shrink-0 rounded-md focus-visible:outline focus-visible:outline-3 focus-visible:outline-offset-4 focus-visible:outline-white"
          >
            <SplitpostWordmark compactBelow360 />
          </Link>
          <nav aria-label="Account" className="flex items-center gap-1 sm:gap-2 [&_a]:text-white [&_a:hover]:bg-white/10">
            {account}
          </nav>
        </div>
      </header>

      <main id="main" className="flex-1">
        <Outlet />
      </main>

      <footer data-testid="member-host-footer" className="bg-sp-primary text-white">
        <div className="mx-auto flex max-w-6xl flex-col gap-4 px-4 py-8 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <p className="text-sm text-sp-muted-on-dark">An invitation-only pilot for adults 18 and older.</p>
          <nav aria-label="Footer" className="flex flex-wrap gap-x-6 gap-y-3 text-sm font-semibold text-white/85">
            <Link to="/privacy" className="hover:text-sp-secondary-on-dark">
              Privacy
            </Link>
            <a href={PUBLIC_SITE_URL} data-testid="public-site-link" className="inline-flex items-center gap-1.5 hover:text-sp-secondary-on-dark">
              Splitpost website <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
              <span className="sr-only"> (www.splitpost.ca)</span>
            </a>
          </nav>
        </div>
        <p className="mx-auto max-w-6xl border-t border-white/10 px-4 py-5 text-[13px] text-sp-muted-on-dark sm:px-6">© 2026 Splitpost. All rights reserved.</p>
      </footer>
    </div>
  )
}
