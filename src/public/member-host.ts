// The member app address (app.splitpost.ca), as seen by the full app. A
// member app build (the splitpost-app project) behaves the same on every
// address it is served from, including its protected Vercel Previews.
//
// On that address the full app serves only the member experience: the
// members area, sign in, password reset, the invitation link and the privacy
// notice (src/public/PublicApp.tsx, MemberHostRoutes). Every other path,
// including client-side navigation, goes to /app. Links meant for the public
// website go to PUBLIC_SITE_URL with a full page load.
//
// Only the full app uses this. The public site build (src/site/SiteApp.tsx)
// never imports PublicApp, so none of it reaches the public site bundle.
import { isMemberApp } from '../entry'

/** The public website, for links from the member app. */
export const PUBLIC_SITE_URL = 'https://www.splitpost.ca'

/**
 * True when this page is the member app: on app.splitpost.ca, or on any
 * address serving a member app build (its protected Previews and the
 * project's own .vercel.app address).
 */
export function onMemberAppHost(): boolean {
  return typeof window !== 'undefined' && isMemberApp(window.location.hostname)
}
