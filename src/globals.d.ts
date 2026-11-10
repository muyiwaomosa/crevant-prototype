// Build-time flags, set by vite.config.ts. Both are true only in an approved
// Vercel Production build of the public site (see scripts/guard-build-target.mjs);
// everywhere else (Previews, local, tests) they are false.
declare const __CREVANT_PRODUCTION_SITE__: boolean
declare const __CREVANT_ALLOW_INDEXING__: boolean
