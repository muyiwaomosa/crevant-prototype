/** True only in an approved Vercel Production build of the public site. */
export const PRODUCTION_SITE_APPROVED: boolean = __CREVANT_PRODUCTION_SITE__

/** True only when, in addition, search indexing has been approved (CREVANT_ALLOW_INDEXING). */
export const INDEXING_ALLOWED: boolean = __CREVANT_ALLOW_INDEXING__

/**
 * True only in a member app build (the splitpost-app project). Every address
 * such a build serves, including its protected Vercel Preview URLs and the
 * project's own .vercel.app address, shows only the member app, exactly as
 * app.splitpost.ca does. Always false in the public site build.
 */
export const MEMBER_APP_BUILD: boolean = __CREVANT_MEMBER_APP_BUILD__
