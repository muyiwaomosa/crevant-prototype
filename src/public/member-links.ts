import { createContext, useContext } from 'react'

/**
 * Whether this build has member pages (sign in, accounts) to link to.
 * Defaults to false, so the public site build never shows a link to a page it
 * doesn't contain. The full app (PublicApp) turns it on.
 */
export const MemberLinksContext = createContext(false)

// Where a member link is rendered, also write `import.meta.env.MODE !== 'site' &&`
// in front of it. Vite replaces the mode at build time, so the minifier deletes
// the link from the public site bundle entirely rather than just hiding it.
// scripts/check-site-bundle.mjs checks it's gone.

export const useMemberLinks = () => useContext(MemberLinksContext)
