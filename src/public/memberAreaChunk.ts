import type { ComponentType } from 'react'

/**
 * The members area's code, loaded on demand (src/public/PublicApp.tsx). Sign in
 * and registration fetch it in the background while the person types, and
 * opening /app directly starts it at once, so arriving at Home does not wait
 * for it.
 */
type MemberRoutesModule = { default: ComponentType }
let loading: Promise<MemberRoutesModule> | null = null
let loaded: ComponentType | null = null

export function loadMemberRoutes(): Promise<MemberRoutesModule> {
  if (!loading) {
    loading = import('../app/MemberRoutes').then(
      (m) => {
        loaded = m.default
        return m
      },
      (e) => {
        loading = null // a failed download is tried again next time
        throw e
      },
    )
  }
  return loading
}

/** The members area, if its code has already arrived (rendered directly, without a loading step). */
export function loadedMemberRoutes(): ComponentType | null {
  return loaded
}

export function preloadMemberArea() {
  loadMemberRoutes().catch(() => undefined)
}

// Opening /app directly (a returning member, a shared post link): start the
// download now, in parallel with the sign-in check, instead of after it.
if (typeof window !== 'undefined' && window.location.pathname.startsWith('/app')) preloadMemberArea()
