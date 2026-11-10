import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

/** Browser variables the public site build must never contain. */
const SITE_EXCLUDED_ENV = ['VITE_SUPABASE_URL', 'VITE_SUPABASE_PUBLISHABLE_KEY']

/**
 * `vite build --mode site` builds the public site only (src/site/main.tsx):
 * the landing page, /join and the sample tour, with no member pages and no
 * Supabase settings. scripts/check-site-bundle.mjs then inspects the output.
 * Every other mode builds the full app from src/main.tsx, as before.
 */
function publicSiteBuild(): Plugin {
  let site = false
  return {
    name: 'crevant-public-site-build',
    config(_config, env) {
      site = env.mode === 'site'
      // Runs before Vite reads environment variables, so these never reach
      // the site bundle, whatever the build environment has set.
      if (site) for (const k of SITE_EXCLUDED_ENV) delete process.env[k]
    },
    // 'pre': switch the entry before Vite bundles the scripts index.html names.
    transformIndexHtml: {
      order: 'pre',
      handler(html) {
        if (!site) return html
        const out = html
          .replace('<script type="module" src="/src/main.tsx"></script>', '<script type="module" src="/src/site/main.tsx"></script>')
          .replace('<meta charset="UTF-8" />', '<meta charset="UTF-8" />\n    <meta name="crevant-build" content="public-site" />')
        if (!out.includes('/src/site/main.tsx')) throw new Error('public site build: could not switch index.html to the site entry')
        return out
      },
    },
  }
}

export default defineConfig({
  plugins: [react(), tailwindcss(), publicSiteBuild()],
})
