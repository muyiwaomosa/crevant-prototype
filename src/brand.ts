// Single source of truth for product branding.
//
// The pilot runs as Splitpost. Keeping every brand string here means a future
// rename touches one file, not every page. Internal names (build flags, the
// storage key, the Supabase project and the demo's domain) keep their
// original "crevant" spelling on purpose: they are infrastructure, not brand.
// Static files (index.html title and meta, favicon, email templates) are
// listed in docs/PHASE-0.md so they can be updated alongside this file.

export const BRAND = {
  /** Product name as written in sentences. */
  name: 'Splitpost',
  /** Lowercase wordmark shown next to the logo. */
  wordmark: 'splitpost',
  /** Short description used on the landing page and in metadata. */
  description:
    "Don't just post. Get your split. You create the content. You grow the audience. But are you getting your share of the value you create?",
} as const

export type Brand = typeof BRAND
