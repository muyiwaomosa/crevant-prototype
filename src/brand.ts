// Single source of truth for product branding.
//
// The pilot runs as Crevant. Naming and logo changes are paused; keeping every
// brand string here means a future rename touches one file, not every page.
// Static files (index.html title and meta, favicon, email templates) are
// listed in docs/PHASE-0.md so they can be updated alongside this file.

export const BRAND = {
  /** Product name as written in sentences. */
  name: 'Crevant',
  /** Lowercase wordmark shown next to the logo. */
  wordmark: 'crevant',
  /** Short description used on the landing page and in metadata. */
  description: 'A creator-first social platform with a chronological feed and Connection Points.',
} as const

export type Brand = typeof BRAND
