// Search indexing for the public site. Used by vite.config.ts at build time.
//
// Indexing is allowed ONLY in an approved Vercel Production build of the
// public site (CREVANT_PRODUCTION_SITE_APPROVED=true) that ALSO has
// CREVANT_ALLOW_INDEXING=true, and then only for the approved pages ("/" and
// "/join", config/public-site.json) on the production address. Every other
// build (Previews, local, the full app) gets "noindex" and a robots.txt that
// disallows everything. vercel.json adds noindex headers on every other
// address and on every other path of the production address.

import { readFileSync } from 'node:fs'

export const SITE = JSON.parse(readFileSync(new URL('../config/public-site.json', import.meta.url), 'utf8'))

export function indexingFlags(env, mode) {
  const production = (env.VERCEL_ENV || '').trim().toLowerCase() === 'production'
  const productionSite = mode === 'site' && production && (env.CREVANT_PRODUCTION_SITE_APPROVED || '').trim() === 'true'
  const allowIndexing = productionSite && (env.CREVANT_ALLOW_INDEXING || '').trim() === 'true'
  return { productionSite, allowIndexing }
}

export function robotsTxt(allowIndexing, site = SITE) {
  if (!allowIndexing) return 'User-agent: *\nDisallow: /\n'
  const allows = site.indexablePaths.map((p) => `Allow: ${p}$`).join('\n')
  return `User-agent: *\n${allows}\nDisallow: /\n\nSitemap: https://${site.productionHost}/sitemap.xml\n`
}

export function sitemapXml(site = SITE) {
  const urls = site.indexablePaths.map((p) => `  <url><loc>https://${site.productionHost}${p === '/' ? '/' : p}</loc></url>`).join('\n')
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`
}
