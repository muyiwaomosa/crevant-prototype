import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
// @ts-expect-error: plain ES module helpers shared with the build scripts
import { indexingFlags, robotsTxt, sitemapXml } from './scripts/indexing.mjs'

/** Browser variables the public site build must never contain. */
const SITE_EXCLUDED_ENV = ['VITE_SUPABASE_URL', 'VITE_SUPABASE_PUBLISHABLE_KEY']

/**
 * `vite build --mode site` builds the public site only (src/site/main.tsx):
 * the landing page, /join, /privacy and the sample tour, with no member pages
 * and no Supabase settings. scripts/check-site-bundle.mjs then inspects the
 * output. Every other mode builds the full app from src/main.tsx, as before.
 *
 * Every build also gets a robots meta tag and robots.txt. They say "noindex"
 * and disallow everything, except in an approved Production build of the
 * public site with indexing approved (scripts/indexing.mjs).
 */
function publicSiteBuild(): Plugin {
  let site = false
  let flags = { productionSite: false, allowIndexing: false }
  return {
    name: 'crevant-public-site-build',
    config(_config, env) {
      site = env.mode === 'site'
      // Runs before Vite reads environment variables, so these never reach
      // the site bundle, whatever the build environment has set.
      if (site) for (const k of SITE_EXCLUDED_ENV) delete process.env[k]
      flags = indexingFlags(process.env, site ? 'site' : 'app')
      return {
        define: {
          __CREVANT_PRODUCTION_SITE__: JSON.stringify(flags.productionSite),
          __CREVANT_ALLOW_INDEXING__: JSON.stringify(flags.allowIndexing),
        },
      }
    },
    // 'pre': switch the entry before Vite bundles the scripts index.html names.
    transformIndexHtml: {
      order: 'pre',
      handler(html) {
        const robots = `<meta name="robots" content="${flags.allowIndexing ? 'index, follow' : 'noindex'}" />`
        if (!site) return html.replace('<meta charset="UTF-8" />', `<meta charset="UTF-8" />\n    ${robots}`)
        const out = html
          .replace('<script type="module" src="/src/main.tsx"></script>', '<script type="module" src="/src/site/main.tsx"></script>')
          .replace('<meta charset="UTF-8" />', `<meta charset="UTF-8" />\n    <meta name="crevant-build" content="public-site" />\n    ${robots}`)
        if (!out.includes('/src/site/main.tsx')) throw new Error('public site build: could not switch index.html to the site entry')
        return out
      },
    },
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: 'robots.txt', source: robotsTxt(flags.allowIndexing) })
      if (flags.allowIndexing) this.emitFile({ type: 'asset', fileName: 'sitemap.xml', source: sitemapXml() })
    },
  }
}

export default defineConfig({
  plugins: [react(), tailwindcss(), publicSiteBuild()],
  // Local preview only: lets the browser tests (scripts/e2e/public-site.sh)
  // load a build at the production address, mapped to this machine.
  preview: { allowedHosts: ['crevant-prototype.vercel.app'] },
})
