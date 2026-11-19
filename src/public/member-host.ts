// The member app address (app.splitpost.ca), as seen by the full app.
//
// On that address the full app serves only the member experience: the
// members area, sign in, password reset, the invitation link and the privacy
// notice (src/public/PublicApp.tsx, MemberHostRoutes). Every other path,
// including client-side navigation, goes to /app. Links meant for the public
// website go to PUBLIC_SITE_URL with a full page load.
//
// Only the full app uses this. The public site build (src/site/SiteApp.tsx)
// never imports PublicApp, so none of it reaches the public site bundle.
import { isMemberAppHost } from '../entry'

/** The public website, for links from the member app. */
export const PUBLIC_SITE_URL = 'https://www.splitpost.ca'

/** True when this page is served on the member app address. */
export function onMemberAppHost(): boolean {
  return typeof window !== 'undefined' && isMemberAppHost(window.location.hostname)
}
