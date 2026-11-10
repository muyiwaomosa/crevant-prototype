/** True only in an approved Vercel Production build of the public site. */
export const PRODUCTION_SITE_APPROVED: boolean = __CREVANT_PRODUCTION_SITE__

/** True only when, in addition, search indexing has been approved (CREVANT_ALLOW_INDEXING). */
export const INDEXING_ALLOWED: boolean = __CREVANT_ALLOW_INDEXING__
