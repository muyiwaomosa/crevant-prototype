import { MEMBER_APP_BUILD } from './build-flags'
/**
 * Decides which app a page load gets. Kept free of React so it can be tested
 * directly.
 *
 *  - "demo-fallback": this build is being served on the production demo
 *    address. That should never happen, because Vercel's production branch is
 *    `demo` (the primary safeguard) and the build guard refuses production
 *    builds. If it happens anyway, for example through "Promote to
 *    Production" on a preview, visitors get only the sample-data prototype at
 *    the root, exactly like the demo, and never the public site or sign in.
 *  - "member": the member app address (app.splitpost.ca). Only the member
 *    pages are served there: the members area, sign in, sign up (open beta),
 *    password reset, the invitation link, the privacy notices and the
 *    community rules. Every other path (the landing
 *    page, the waitlist, the sample tour) goes to /app, which asks for sign
 *    in. Never indexed.
 *  - "tour": the sample-data prototype under /tour.
 *  - "public": the public site (landing page and its pages).
 */

/** Addresses that serve the frozen demo in production. */
export const PRODUCTION_DEMO_HOSTS = ['crevant-prototype.vercel.app']

/** The member app's address (config/vercel-projects.json, memberApp.host). */
export const MEMBER_APP_HOSTS = ['app.splitpost.ca']

/**
 * The only paths served on the member app address. The invitation link
 * (/auth/confirm#token_hash=...) is one of them, so its fragment is never
 * touched by a redirect.
 */
const MEMBER_APP_PATHS = [/^\/app(\/.*)?$/, /^\/sign-in\/?$/, /^\/sign-up\/?$/, /^\/beta-privacy\/?$/, /^\/community-rules\/?$/, /^\/forgot-password\/?$/, /^\/auth\/confirm\/?$/, /^\/auth\/set-password\/?$/, /^\/privacy\/?$/]

/** Where everything else on the member app address goes. */
export const MEMBER_APP_HOME = '/app'

export const TOUR_BASE = '/tour'

/**
 * Where "Discover Splitpost" goes on the public site: the homepage's "What
 * we're building" introduction, which leads on to Join the Waitlist. Not the
 * sample tour, which still shows the older prototype's rules (creator invite
 * links still open it directly).
 */
export const DISCOVER_PATH = '/#building'

/** Prototype paths that existed before the tour moved under /tour. */
const LEGACY_PROTOTYPE_PATHS = [
  /^\/welcome\/?$/,
  /^\/discover\/?$/,
  /^\/create\/?$/,
  /^\/creator\/[^/]+\/?$/,
  /^\/post\/[^/]+\/?$/,
  /^\/rewards\/?$/,
  /^\/profile(\/tools)?\/?$/,
  /^\/points\/?$/,
  /^\/studio(\/.*)?$/,
]

export type Entry =
  | { kind: 'demo-fallback' }
  | { kind: 'member'; redirectTo?: string }
  | { kind: 'tour'; redirectTo?: string }
  | { kind: 'public' }

export function isProductionDemoHost(hostname: string): boolean {
  return PRODUCTION_DEMO_HOSTS.includes(hostname.toLowerCase())
}

export function isMemberAppHost(hostname: string): boolean {
  return MEMBER_APP_HOSTS.includes(hostname.toLowerCase())
}

/**
 * True when this page is the member app: on app.splitpost.ca, or anywhere a
 * member app build is served (its protected Previews and the project's own
 * .vercel.app address), so those never show a public page either.
 */
export function isMemberApp(hostname: string, memberAppBuild: boolean = MEMBER_APP_BUILD): boolean {
  return memberAppBuild || isMemberAppHost(hostname)
}

export function isTourPath(pathname: string): boolean {
  return pathname === TOUR_BASE || pathname.startsWith(`${TOUR_BASE}/`)
}

/**
 * `demoFallback: false` is used only by an APPROVED Vercel Production build of
 * the public site (src/site/main.tsx), so the public site can replace the
 * demo at the production address. Every other build keeps the fallback, so a
 * promoted Preview still can't replace the demo.
 */
export function resolveEntry(
  loc: { hostname: string; pathname: string; search: string; hash: string },
  { demoFallback = true }: { demoFallback?: boolean } = {},
): Entry {
  // The member app rule exists only in the full app build: the public site
  // build (--mode site) leaves it out entirely, so it carries no member route.
  // It comes first, so a member app build never shows the demo or the tour.
  if (import.meta.env.MODE !== 'site' && isMemberApp(loc.hostname)) {
    return MEMBER_APP_PATHS.some((re) => re.test(loc.pathname)) ? { kind: 'member' } : { kind: 'member', redirectTo: MEMBER_APP_HOME }
  }
  if (demoFallback && isProductionDemoHost(loc.hostname)) return { kind: 'demo-fallback' }
  if (isTourPath(loc.pathname)) return { kind: 'tour' }
  if (LEGACY_PROTOTYPE_PATHS.some((re) => re.test(loc.pathname))) {
    return { kind: 'tour', redirectTo: `${TOUR_BASE}${loc.pathname}${loc.search}${loc.hash}` }
  }
  return { kind: 'public' }
}
