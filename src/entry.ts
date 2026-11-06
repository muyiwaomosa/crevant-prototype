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
 *  - "tour": the sample-data prototype under /tour.
 *  - "public": the public site (landing page and its pages).
 */

/** Addresses that serve the frozen demo in production. */
export const PRODUCTION_DEMO_HOSTS = ['crevant-prototype.vercel.app']

export const TOUR_BASE = '/tour'

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
  | { kind: 'tour'; redirectTo?: string }
  | { kind: 'public' }

export function isProductionDemoHost(hostname: string): boolean {
  return PRODUCTION_DEMO_HOSTS.includes(hostname.toLowerCase())
}

export function isTourPath(pathname: string): boolean {
  return pathname === TOUR_BASE || pathname.startsWith(`${TOUR_BASE}/`)
}

export function resolveEntry(loc: { hostname: string; pathname: string; search: string; hash: string }): Entry {
  if (isProductionDemoHost(loc.hostname)) return { kind: 'demo-fallback' }
  if (isTourPath(loc.pathname)) return { kind: 'tour' }
  if (LEGACY_PROTOTYPE_PATHS.some((re) => re.test(loc.pathname))) {
    return { kind: 'tour', redirectTo: `${TOUR_BASE}${loc.pathname}${loc.search}${loc.hash}` }
  }
  return { kind: 'public' }
}
